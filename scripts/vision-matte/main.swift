// vision-matte: per-frame alpha mattes from Apple Vision, streamed as raw 8-bit gray.
//
// Reads a video with AVAssetReader, runs a Vision segmentation request on every frame and
// writes one W*H byte mask per frame to stdout (or --out FILE), at the video's display size.
// FFmpeg consumes it with:  -f rawvideo -pix_fmt gray -s WxH -r FPS -i pipe:0
//
// Modes
//   person   VNGeneratePersonSegmentationRequest through ONE VNSequenceRequestHandler
//            (stateful request -> Apple's temporal smoothing). --quality accurate|balanced|fast
//   subject  VNGenerateForegroundInstanceMaskRequest (any salient object, macOS 14+)
//   people   VNGeneratePersonInstanceMaskRequest (up to 4 separated people, macOS 14+)
//            subject/people: --all (merge every instance, the default) or --point x,y
//            (repeatable) = keep the instance under that pixel of the first frame and follow
//            it in later frames by best IoU with the previous frame's instance mask.
//   hybrid   person segmentation (stateful) + foreground instances: keeps the instances that are
//            mostly "person" -> crisp edges, held objects included, background objects dropped.
//
// Refinement at generation time: --min-island (despeckle, e.g. corner watermarks), --ema.
// Edge shift / feather / temporal median / levels are left to the FFmpeg export graph.
//
// Build:  see build.sh next to this file.

import Accelerate
import AVFoundation
import CoreImage
import CoreVideo
import Foundation
import Vision

// MARK: - Small helpers

func log(_ s: String) {
    FileHandle.standardError.write((s + "\n").data(using: .utf8)!)
}

func die(_ msg: String, code: Int32 = 1) -> Never {
    log("vision-matte: error: " + msg)
    exit(code)
}

@inline(__always) func now() -> Double {
    Double(DispatchTime.now().uptimeNanoseconds) / 1e9
}

func fourCC(_ v: FourCharCode) -> String {
    let bytes = [UInt8((v >> 24) & 0xff), UInt8((v >> 16) & 0xff), UInt8((v >> 8) & 0xff), UInt8(v & 0xff)]
    let s = String(bytes: bytes, encoding: .ascii) ?? "\(v)"
    return s.trimmingCharacters(in: .controlCharacters)
}

func jsonString(_ obj: Any) -> String {
    let data = try! JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys, .withoutEscapingSlashes])
    return String(data: data, encoding: .utf8)!
}

/// Rounded to 3 decimals, as a decimal so JSON prints "23.976" rather than 23.975999999999999.
func r3(_ x: Double) -> NSDecimalNumber {
    guard x.isFinite else { return NSDecimalNumber(value: 0) }
    return NSDecimalNumber(string: String(format: "%.3f", x))
}

// MARK: - Options

struct Options {
    var input = ""
    var mode = "person"          // person | subject | people
    var quality = "accurate"     // accurate | balanced | fast   (person mode)
    var all = false
    var points: [CGPoint] = []
    var start: Double?
    var duration: Double?
    var maxFrames: Int?
    var probe = false
    var ema: Float?              // weight of the NEW mask (0 < a <= 1); nil/1 = off
    var outPath: String?         // default: stdout
    var noOutput = false         // benchmark: do all work, write nothing
    var scaler = "bilinear"      // bilinear | lanczos
    var pixfmt = "bgra"          // bgra | 420f   decoder output handed to Vision
    var quiet = false
    var statsPath: String?       // per-frame JSON lines
    var minIoU: Float = 0.05
    var minIsland: Double?       // % of frame area; smaller connected blobs are removed
    var hybridMin: Float = 0.35  // hybrid: keep instances whose mean person-probability >= this
}

let usageText = """
usage: vision-matte INPUT [options]            masks -> stdout (raw gray, W*H bytes per frame)
       vision-matte INPUT --probe              print JSON: width height fps frameCount rotation ...

  --mode person|subject|people|hybrid   default person
                                 hybrid = subject instances that are mostly "person" according to
                                 the person segmentation (person + what they hold, no background
                                 objects); --quality applies to its person pass
  --hybrid-min F                 hybrid: min mean person-probability inside an instance (0.35)
  --quality accurate|balanced|fast   person mode quality level (default accurate)
  --all                          subject/people: merge all instances (default when no --point)
  --point X,Y                    subject/people: keep the instance under pixel X,Y (display
                                 coords, top-left origin) of the first frame and track it by IoU.
                                 Repeat for several subjects.
  --min-iou F                    below this IoU the tracker falls back to nearest centroid (0.05)
  --min-island PCT               despeckle: drop connected blobs smaller than PCT % of the frame
                                 (e.g. 0.3 removes a corner watermark or stray specks)
  --start S  --duration D        seconds (AVAssetReader timeRange)
  --frames N                     stop after N frames
  --ema A                        temporal EMA on the mask: out = A*new + (1-A)*prev  (e.g. 0.6)
  --scaler bilinear|lanczos      CoreImage upscaling of low-res masks (default bilinear)
  --pixfmt bgra|420f             decoder output format given to Vision (default bgra)
  --out FILE                     write masks to FILE instead of stdout
  --null                         compute but write nothing (benchmark)
  --stats FILE                   per-frame JSON lines (timings, instances, IoU)
  --quiet                        no progress on stderr
"""

func parseArgs() -> Options {
    var o = Options()
    let args = Array(CommandLine.arguments.dropFirst())
    var i = 0
    func value(_ name: String) -> String {
        i += 1
        guard i < args.count else { die("missing value for \(name)") }
        return args[i]
    }
    func double(_ name: String) -> Double {
        let v = value(name)
        guard let d = Double(v) else { die("bad number for \(name): \(v)") }
        return d
    }
    while i < args.count {
        let a = args[i]
        switch a {
        case "--mode": o.mode = value(a)
        case "--quality": o.quality = value(a)
        case "--all": o.all = true
        case "--point":
            let v = value(a)
            let parts = v.split(separator: ",").compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
            guard parts.count == 2 else { die("--point expects X,Y, got \(v)") }
            o.points.append(CGPoint(x: parts[0], y: parts[1]))
        case "--min-iou": o.minIoU = Float(double(a))
        case "--min-island": o.minIsland = double(a)
        case "--hybrid-min": o.hybridMin = Float(double(a))
        case "--start": o.start = double(a)
        case "--duration": o.duration = double(a)
        case "--frames": o.maxFrames = Int(double(a))
        case "--probe": o.probe = true
        case "--ema":
            let e = Float(double(a))
            guard e > 0, e <= 1 else { die("--ema must be in (0,1]") }
            o.ema = e < 1 ? e : nil
        case "--out", "-o": o.outPath = value(a)
        case "--null": o.noOutput = true
        case "--scaler": o.scaler = value(a)
        case "--pixfmt": o.pixfmt = value(a)
        case "--stats": o.statsPath = value(a)
        case "--quiet", "-q": o.quiet = true
        case "-h", "--help": print(usageText); exit(0)
        default:
            if a.hasPrefix("-") { die("unknown option \(a)\n\(usageText)") }
            o.input = a
        }
        i += 1
    }
    guard !o.input.isEmpty else { die("no input file\n\(usageText)") }
    guard ["person", "subject", "people", "hybrid"].contains(o.mode) else { die("bad --mode \(o.mode)") }
    guard ["accurate", "balanced", "fast"].contains(o.quality) else { die("bad --quality \(o.quality)") }
    guard ["bilinear", "lanczos"].contains(o.scaler) else { die("bad --scaler \(o.scaler)") }
    guard ["bgra", "420f"].contains(o.pixfmt) else { die("bad --pixfmt \(o.pixfmt)") }
    if o.mode == "person" && (!o.points.isEmpty || o.all) {
        log("vision-matte: note: --point/--all are ignored in person mode")
    }
    return o
}

// MARK: - Video info

/// ISO-BMFF / QuickTime sniffing for extensionless files.
func sniffMIME(_ url: URL) -> String? {
    guard let fh = try? FileHandle(forReadingFrom: url) else { return nil }
    defer { try? fh.close() }
    let head = [UInt8](fh.readData(ofLength: 16))
    guard head.count >= 12 else { return nil }
    let atom = String(bytes: head[4..<8], encoding: .ascii) ?? ""
    if atom == "ftyp" {
        let brand = String(bytes: head[8..<12], encoding: .ascii) ?? ""
        if brand == "qt  " { return "video/quicktime" }
        if brand.hasPrefix("3g") { return "video/3gpp" }
        if brand.hasPrefix("M4V") { return "video/x-m4v" }
        return "video/mp4"
    }
    if ["moov", "mdat", "wide", "free", "skip", "pnot"].contains(atom) { return "video/quicktime" }
    if head[0] == 0x1A && head[1] == 0x45 && head[2] == 0xDF && head[3] == 0xA3 {
        die("Matroska/WebM input is not supported by AVFoundation; transcode to MP4/MOV first")
    }
    return nil
}

struct VideoInfo {
    let track: AVAssetTrack
    let naturalSize: CGSize
    let transform: CGAffineTransform
    let width: Int          // display (rotated) size = size of every output mask
    let height: Int
    let rotation: Int       // clockwise degrees applied for display (AVFoundation convention)
    let nominalFps: Double
    let minFrameDurationFps: Double
    let duration: Double
    let codec: String
    let fpsRational: String   // from minFrameDuration, e.g. "24000/1001": use this for ffmpeg -r
}

func loadInfo(_ asset: AVURLAsset) async throws -> VideoInfo {
    guard let track = try await asset.loadTracks(withMediaType: .video).first else {
        die("no video track in \(asset.url.path)")
    }
    let (size, t, fps, minDur, fmts) = try await track.load(
        .naturalSize, .preferredTransform, .nominalFrameRate, .minFrameDuration, .formatDescriptions)
    let dur = try await asset.load(.duration).seconds
    let rect = CGRect(origin: .zero, size: size).applying(t)
    var rot = Int((atan2(t.b, t.a) * 180 / .pi).rounded())
    rot = ((rot % 360) + 360) % 360
    let codec = fmts.first.map { fourCC(CMFormatDescriptionGetMediaSubType($0)) } ?? "?"
    let mfps = minDur.isValid && minDur.seconds > 0 ? 1.0 / minDur.seconds : Double(fps)
    return VideoInfo(track: track, naturalSize: size, transform: t,
                     width: Int(abs(rect.width).rounded()), height: Int(abs(rect.height).rounded()),
                     rotation: rot, nominalFps: Double(fps), minFrameDurationFps: mfps,
                     duration: dur, codec: codec,
                     fpsRational: rational(minDur, fallback: Double(fps)))
}

/// 1/minFrameDuration as a reduced fraction ("24000/1001", "24/1").
func rational(_ d: CMTime, fallback: Double) -> String {
    guard d.isValid, d.value > 0 else { return String(format: "%.3f", fallback) }
    var a = Int64(d.timescale), b = Int64(d.value)
    var x = a, y = b
    while y != 0 { (x, y) = (y, x % y) }
    a /= x; b /= x
    return "\(a)/\(b)"
}

/// Count frames by reading compressed samples (no decoding, fast).
func countFrames(_ asset: AVURLAsset, _ info: VideoInfo) throws -> Int {
    let reader = try AVAssetReader(asset: asset)
    let out = AVAssetReaderTrackOutput(track: info.track, outputSettings: nil)
    out.alwaysCopiesSampleData = false
    reader.add(out)
    guard reader.startReading() else { throw reader.error ?? NSError(domain: "vm", code: 1) }
    var n = 0
    while let sb = out.copyNextSampleBuffer() {
        n += CMSampleBufferGetNumSamples(sb)
    }
    return n
}

// MARK: - Mask conversion / scaling (CoreImage + vImage)

final class MaskRenderer {
    let W: Int, H: Int
    let lanczos: Bool
    let ctx = CIContext(options: [.workingColorSpace: NSNull(), .outputColorSpace: NSNull(),
                                  .cacheIntermediates: false, .name: "vision-matte"])
    var loggedFormats = Set<String>()

    init(width: Int, height: Int, lanczos: Bool) {
        W = width; H = height; self.lanczos = lanczos
    }

    /// Writes a W*H 8-bit mask for `pb` (any size, OneComponent8 / 16Half / 32Float) into dst.
    func render(_ pb: CVPixelBuffer, into dst: UnsafeMutablePointer<UInt8>) {
        let w = CVPixelBufferGetWidth(pb), h = CVPixelBufferGetHeight(pb)
        let fmt = CVPixelBufferGetPixelFormatType(pb)
        let key = "\(w)x\(h) \(fourCC(fmt))"
        if !loggedFormats.contains(key) {
            loggedFormats.insert(key)
            log("vision-matte: mask buffer \(key) -> \(W)x\(H)")
        }
        if w == W && h == H {
            if copySameSize(pb, fmt, dst) { return }
        }
        var img = CIImage(cvPixelBuffer: pb)
        let sx = CGFloat(W) / CGFloat(w), sy = CGFloat(H) / CGFloat(h)
        if lanczos, let f = CIFilter(name: "CILanczosScaleTransform") {
            f.setValue(img.clampedToExtent(), forKey: kCIInputImageKey)
            f.setValue(sy, forKey: kCIInputScaleKey)
            f.setValue(sx / sy, forKey: kCIInputAspectRatioKey)
            img = f.outputImage!
        } else {
            img = img.clampedToExtent().samplingLinear()
                .transformed(by: CGAffineTransform(scaleX: sx, y: sy))
        }
        img = img.cropped(to: CGRect(x: 0, y: 0, width: W, height: H))
        ctx.render(img, toBitmap: dst, rowBytes: W, bounds: CGRect(x: 0, y: 0, width: W, height: H),
                   format: .R8, colorSpace: nil)
    }

    private func copySameSize(_ pb: CVPixelBuffer, _ fmt: OSType, _ dst: UnsafeMutablePointer<UInt8>) -> Bool {
        CVPixelBufferLockBaseAddress(pb, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(pb) else { return false }
        let rb = CVPixelBufferGetBytesPerRow(pb)
        var src = vImage_Buffer(data: base, height: vImagePixelCount(H), width: vImagePixelCount(W), rowBytes: rb)
        var d = vImage_Buffer(data: dst, height: vImagePixelCount(H), width: vImagePixelCount(W), rowBytes: W)
        switch fmt {
        case kCVPixelFormatType_OneComponent8:
            for y in 0..<H { memcpy(dst + y * W, base + y * rb, W) }
            return true
        case kCVPixelFormatType_OneComponent32Float:
            return vImageConvert_PlanarFtoPlanar8(&src, &d, 1.0, 0.0, vImage_Flags(kvImageNoFlags)) == kvImageNoError
        case kCVPixelFormatType_OneComponent16Half:
            var tmp = [Float](repeating: 0, count: W * H)
            return tmp.withUnsafeMutableBytes { p -> Bool in
                var f = vImage_Buffer(data: p.baseAddress, height: vImagePixelCount(H), width: vImagePixelCount(W), rowBytes: W * 4)
                guard vImageConvert_Planar16FtoPlanarF(&src, &f, 0) == kvImageNoError else { return false }
                return vImageConvert_PlanarFtoPlanar8(&f, &d, 1.0, 0.0, 0) == kvImageNoError
            }
        default:
            return false
        }
    }
}

// MARK: - Despeckle (connected components)

/// Zeroes every 4-connected blob (pixels >= 8) whose area is below minArea pixels.
final class Despeckler {
    let W: Int, H: Int
    var labels: [Int32]
    var stack: [Int32] = []
    init(width: Int, height: Int) {
        W = width; H = height
        labels = [Int32](repeating: 0, count: width * height)
        stack.reserveCapacity(width * height / 4)
    }
    @discardableResult
    func run(_ m: UnsafeMutablePointer<UInt8>, minArea: Int) -> Int {
        let n = W * H
        labels.withUnsafeMutableBufferPointer { lab in
            for i in 0..<n { lab[i] = 0 }
        }
        var removed = 0
        var next: Int32 = 1
        var members: [Int32] = []
        labels.withUnsafeMutableBufferPointer { lab in
            for start in 0..<n where m[start] >= 8 && lab[start] == 0 {
                members.removeAll(keepingCapacity: true)
                stack.removeAll(keepingCapacity: true)
                stack.append(Int32(start)); lab[start] = next
                while let p32 = stack.popLast() {
                    let p = Int(p32)
                    members.append(p32)
                    let x = p % W, y = p / W
                    if x > 0, m[p - 1] >= 8, lab[p - 1] == 0 { lab[p - 1] = next; stack.append(Int32(p - 1)) }
                    if x < W - 1, m[p + 1] >= 8, lab[p + 1] == 0 { lab[p + 1] = next; stack.append(Int32(p + 1)) }
                    if y > 0, m[p - W] >= 8, lab[p - W] == 0 { lab[p - W] = next; stack.append(Int32(p - W)) }
                    if y < H - 1, m[p + W] >= 8, lab[p + W] == 0 { lab[p + W] = next; stack.append(Int32(p + W)) }
                }
                if members.count < minArea {
                    for q in members { m[Int(q)] = 0 }
                    removed += 1
                }
                next &+= 1
            }
        }
        return removed
    }
}

// MARK: - Maskers

protocol Masker: AnyObject {
    /// Returns a mask buffer (any size) for the frame, or nil for "nothing found" (all zero).
    func mask(_ frame: CVPixelBuffer, index: Int, stat: inout [String: Any]) throws -> CVPixelBuffer?
}

final class PersonMasker: Masker {
    let request = VNGeneratePersonSegmentationRequest()
    let sequence = VNSequenceRequestHandler()   // ONE handler for the whole clip (stateful request)

    init(quality: String) {
        switch quality {
        case "fast": request.qualityLevel = .fast
        case "balanced": request.qualityLevel = .balanced
        default: request.qualityLevel = .accurate
        }
        request.outputPixelFormat = kCVPixelFormatType_OneComponent8
    }

    func mask(_ frame: CVPixelBuffer, index: Int, stat: inout [String: Any]) throws -> CVPixelBuffer? {
        try sequence.perform([request], on: frame, orientation: .up)
        return request.results?.first?.pixelBuffer
    }
}

/// Instance tracking state for one --point.
struct Track {
    var seed: CGPoint             // display pixel coords
    var prev: [UInt8] = []        // binary mask at label resolution (0/1)
    var pw = 0, ph = 0
    var area = 0
    var cx = 0.0, cy = 0.0        // centroid, normalised 0..1
    var initialised = false
    var lostFrames = 0
}

final class InstanceMasker: Masker {
    let request: VNImageBasedRequest
    let useAll: Bool
    var tracks: [Track]
    let minIoU: Float
    let W: Int, H: Int
    var loggedLabelFormat = false

    init(people: Bool, all: Bool, points: [CGPoint], minIoU: Float, width: Int, height: Int) {
        request = people ? VNGeneratePersonInstanceMaskRequest() : VNGenerateForegroundInstanceMaskRequest()
        useAll = all || points.isEmpty
        tracks = points.map { Track(seed: $0) }
        self.minIoU = minIoU
        W = width; H = height
    }

    func mask(_ frame: CVPixelBuffer, index: Int, stat: inout [String: Any]) throws -> CVPixelBuffer? {
        let handler = VNImageRequestHandler(cvPixelBuffer: frame, orientation: .up, options: [:])
        try handler.perform([request])
        guard let obs = request.results?.first as? VNInstanceMaskObservation else {
            stat["instances"] = 0
            return nil
        }
        let all = obs.allInstances
        stat["instances"] = all.count
        if all.isEmpty { return nil }

        var chosen = IndexSet()
        if useAll {
            chosen = all
        } else {
            let labels = obs.instanceMask
            CVPixelBufferLockBaseAddress(labels, .readOnly)
            defer { CVPixelBufferUnlockBaseAddress(labels, .readOnly) }
            let lw = CVPixelBufferGetWidth(labels), lh = CVPixelBufferGetHeight(labels)
            let lrb = CVPixelBufferGetBytesPerRow(labels)
            let lfmt = CVPixelBufferGetPixelFormatType(labels)
            if !loggedLabelFormat {
                loggedLabelFormat = true
                log("vision-matte: instance label map \(lw)x\(lh) \(fourCC(lfmt)), instances \(Array(all))")
            }
            guard lfmt == kCVPixelFormatType_OneComponent8,
                  let base = CVPixelBufferGetBaseAddress(labels)?.assumingMemoryBound(to: UInt8.self) else {
                die("unexpected instance label format \(fourCC(lfmt))")
            }
            // Per-label area + centroid (one pass).
            var area = [Int](repeating: 0, count: 256)
            var sx = [Double](repeating: 0, count: 256), sy = [Double](repeating: 0, count: 256)
            for y in 0..<lh {
                let row = base + y * lrb
                for x in 0..<lw {
                    let l = Int(row[x])
                    if l != 0 { area[l] += 1; sx[l] += Double(x); sy[l] += Double(y) }
                }
            }
            var ious: [[String: Any]] = []
            for ti in tracks.indices {
                var t = tracks[ti]
                var pick = 0
                var how = ""
                if !t.initialised {
                    // Seed: label under the point, else the nearest labelled pixel.
                    let px = min(lw - 1, max(0, Int(t.seed.x / CGFloat(W) * CGFloat(lw))))
                    let py = min(lh - 1, max(0, Int(t.seed.y / CGFloat(H) * CGFloat(lh))))
                    pick = Int(base[py * lrb + px])
                    how = "seed"
                    if pick == 0 {
                        var best = Int.max
                        for y in 0..<lh {
                            let row = base + y * lrb
                            for x in 0..<lw where row[x] != 0 {
                                let d = (x - px) * (x - px) + (y - py) * (y - py)
                                if d < best { best = d; pick = Int(row[x]) }
                            }
                        }
                        how = "seed-nearest(\(Int(Double(best).squareRoot()))px@label-res)"
                        log("vision-matte: warning: point \(t.seed) is on background in frame \(index); using nearest instance \(pick)")
                    }
                } else {
                    // IoU of every current instance with the previous mask of this track.
                    var inter = [Int](repeating: 0, count: 256)
                    let sameRes = (t.pw == lw && t.ph == lh)
                    for y in 0..<lh {
                        let row = base + y * lrb
                        let py = sameRes ? y : min(t.ph - 1, y * t.ph / lh)
                        for x in 0..<lw {
                            let l = Int(row[x])
                            if l == 0 { continue }
                            let px = sameRes ? x : min(t.pw - 1, x * t.pw / lw)
                            if t.prev[py * t.pw + px] != 0 { inter[l] += 1 }
                        }
                    }
                    let prevArea = sameRes ? t.area : Int(Double(t.area) * Double(lw * lh) / Double(t.pw * t.ph))
                    var bestIoU: Float = -1
                    for l in all where l < 256 {
                        let u = area[l] + prevArea - inter[l]
                        let iou = u > 0 ? Float(inter[l]) / Float(u) : 0
                        if iou > bestIoU { bestIoU = iou; pick = l }
                    }
                    how = String(format: "iou=%.3f", bestIoU)
                    if bestIoU < minIoU {
                        // Fall back to nearest centroid.
                        var bestD = Double.infinity
                        for l in all where l < 256 && area[l] > 0 {
                            let cx = sx[l] / Double(area[l]) / Double(lw), cy = sy[l] / Double(area[l]) / Double(lh)
                            let d = (cx - t.cx) * (cx - t.cx) + (cy - t.cy) * (cy - t.cy)
                            if d < bestD { bestD = d; pick = l }
                        }
                        how += String(format: " fallback-centroid d=%.3f", bestD.squareRoot())
                        t.lostFrames += 1
                    }
                }
                if pick > 0 && pick < 256 && area[pick] > 0 {
                    chosen.insert(pick)
                    // Store this frame's instance as the reference for the next frame.
                    if t.prev.count != lw * lh { t.prev = [UInt8](repeating: 0, count: lw * lh) }
                    for y in 0..<lh {
                        let row = base + y * lrb
                        for x in 0..<lw { t.prev[y * lw + x] = row[x] == UInt8(pick) ? 1 : 0 }
                    }
                    t.pw = lw; t.ph = lh; t.area = area[pick]
                    t.cx = sx[pick] / Double(area[pick]) / Double(lw)
                    t.cy = sy[pick] / Double(area[pick]) / Double(lh)
                    t.initialised = true
                }
                ious.append(["track": ti, "label": pick, "how": how])
                tracks[ti] = t
            }
            stat["tracks"] = ious
            if chosen.isEmpty { return nil }
        }
        stat["chosen"] = Array(chosen)
        return try obs.generateScaledMaskForImage(forInstances: chosen, from: handler)
    }
}

/// Hybrid: person segmentation (stateful, temporally smoothed) decides WHICH foreground
/// instances to keep; the instance masks give crisp edges and include held objects.
final class HybridMasker: Masker {
    let person: PersonMasker
    let request = VNGenerateForegroundInstanceMaskRequest()
    let minMean: Float

    init(quality: String, minMean: Float) {
        person = PersonMasker(quality: quality)
        self.minMean = minMean
    }

    func mask(_ frame: CVPixelBuffer, index: Int, stat: inout [String: Any]) throws -> CVPixelBuffer? {
        var ps: [String: Any] = [:]
        guard let pm = try person.mask(frame, index: index, stat: &ps) else { return nil }
        let handler = VNImageRequestHandler(cvPixelBuffer: frame, orientation: .up, options: [:])
        try handler.perform([request])
        guard let obs = request.results?.first, !obs.allInstances.isEmpty else {
            stat["instances"] = 0
            return nil  // nothing salient. (Falling back to the person matte was tried: on smoke /
                        // effects it returns soft garbage, so hybrid stays strictly instance-based.)
        }
        let labels = obs.instanceMask
        CVPixelBufferLockBaseAddress(labels, .readOnly); CVPixelBufferLockBaseAddress(pm, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(labels, .readOnly); CVPixelBufferUnlockBaseAddress(pm, .readOnly) }
        let lw = CVPixelBufferGetWidth(labels), lh = CVPixelBufferGetHeight(labels), lrb = CVPixelBufferGetBytesPerRow(labels)
        let pw = CVPixelBufferGetWidth(pm), ph = CVPixelBufferGetHeight(pm), prb = CVPixelBufferGetBytesPerRow(pm)
        guard let lb = CVPixelBufferGetBaseAddress(labels)?.assumingMemoryBound(to: UInt8.self),
              let pb = CVPixelBufferGetBaseAddress(pm)?.assumingMemoryBound(to: UInt8.self) else { return pm }
        var area = [Int](repeating: 0, count: 256), sum = [Int](repeating: 0, count: 256)
        var personTotal = 0
        for y in 0..<lh {
            let py = min(ph - 1, y * ph / lh)
            for x in 0..<lw {
                let l = Int(lb[y * lrb + x])
                let v = Int(pb[py * prb + min(pw - 1, x * pw / lw)])
                personTotal += v
                if l != 0 { area[l] += 1; sum[l] += v }
            }
        }
        var chosen = IndexSet()
        var means: [String: Double] = [:]
        for l in obs.allInstances where l < 256 && area[l] > 0 {
            let m = Float(sum[l]) / Float(area[l] * 255)
            means[String(l)] = Double((m * 1000).rounded() / 1000)
            if m >= minMean { chosen.insert(l) }
        }
        stat["instances"] = obs.allInstances.count
        stat["personMean"] = means
        stat["personCoverage"] = Double(personTotal) / Double(lw * lh * 255)
        if chosen.isEmpty { return nil }
        stat["chosen"] = Array(chosen)
        return try obs.generateScaledMaskForImage(forInstances: chosen, from: handler)
    }
}

// MARK: - Main

@main
struct VisionMatte {
    static func main() async {
        signal(SIGPIPE, SIG_IGN)
        let opts = parseArgs()
        let url = URL(fileURLWithPath: opts.input)
        guard FileManager.default.fileExists(atPath: url.path) else { die("no such file \(url.path)") }
        // VDO stores uploads as ".../source" with no extension, which AVFoundation refuses
        // (-11828 "Cannot Open"). Sniff the container and pass an explicit MIME type instead.
        var assetOpts: [String: Any] = [AVURLAssetPreferPreciseDurationAndTimingKey: true]
        if url.pathExtension.isEmpty, let mime = sniffMIME(url) {
            assetOpts[AVURLAssetOverrideMIMETypeKey] = mime
        }
        let asset = AVURLAsset(url: url, options: assetOpts)
        let info: VideoInfo
        do { info = try await loadInfo(asset) } catch { die("cannot open \(url.path): \(error)") }

        if opts.probe {
            let n = (try? countFrames(asset, info)) ?? -1
            let ffRot = info.rotation == 0 ? 0 : (info.rotation <= 180 ? -info.rotation : 360 - info.rotation)
            print(jsonString([
                "width": info.width, "height": info.height,
                "naturalWidth": Int(info.naturalSize.width), "naturalHeight": Int(info.naturalSize.height),
                "fps": r3(info.nominalFps), "minFrameDurationFps": r3(info.minFrameDurationFps),
                "fpsRational": info.fpsRational,
                "frameCount": n, "duration": r3(info.duration),
                "rotation": info.rotation, "ffprobeRotation": ffRot, "codec": info.codec,
            ] as [String: Any]))
            exit(0)
        }

        let W = info.width, H = info.height
        // --- reader
        let reader: AVAssetReader
        let output: AVAssetReaderOutput
        do {
            reader = try AVAssetReader(asset: asset)
            if opts.start != nil || opts.duration != nil {
                let s = CMTime(seconds: opts.start ?? 0, preferredTimescale: 90000)
                let d = opts.duration.map { CMTime(seconds: $0, preferredTimescale: 90000) } ?? .positiveInfinity
                reader.timeRange = CMTimeRange(start: s, duration: d)
            }
            let pf = opts.pixfmt == "420f" ? kCVPixelFormatType_420YpCbCr8BiPlanarFullRange : kCVPixelFormatType_32BGRA
            let settings: [String: Any] = [
                kCVPixelBufferPixelFormatTypeKey as String: pf,
                kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
                kCVPixelBufferMetalCompatibilityKey as String: true,
            ]
            if info.rotation != 0 {
                // Let AVFoundation apply preferredTransform so masks match ffmpeg's autorotated frames.
                let comp = try await AVVideoComposition.videoComposition(withPropertiesOf: asset)
                let o = AVAssetReaderVideoCompositionOutput(videoTracks: [info.track], videoSettings: settings)
                o.videoComposition = comp
                o.alwaysCopiesSampleData = false
                output = o
                log("vision-matte: rotation \(info.rotation) deg -> frames rendered upright via AVVideoComposition (\(W)x\(H))")
            } else {
                let o = AVAssetReaderTrackOutput(track: info.track, outputSettings: settings)
                o.alwaysCopiesSampleData = false
                output = o
            }
            reader.add(output)
            guard reader.startReading() else { throw reader.error ?? NSError(domain: "vm", code: 2) }
        } catch { die("cannot start reader: \(error)") }

        // --- masker
        let masker: Masker
        switch opts.mode {
        case "person": masker = PersonMasker(quality: opts.quality)
        case "hybrid": masker = HybridMasker(quality: opts.quality, minMean: opts.hybridMin)
        default:
            masker = InstanceMasker(people: opts.mode == "people", all: opts.all, points: opts.points,
                                    minIoU: opts.minIoU, width: W, height: H)
        }
        let renderer = MaskRenderer(width: W, height: H, lanczos: opts.scaler == "lanczos")
        let despeckler = opts.minIsland.map { _ in Despeckler(width: W, height: H) }
        let minIslandPx = Int((opts.minIsland ?? 0) / 100 * Double(W * H))

        // --- output
        var outFile: UnsafeMutablePointer<FILE>? = nil
        if !opts.noOutput {
            if let p = opts.outPath {
                guard let f = fopen(p, "wb") else { die("cannot write \(p)") }
                outFile = f
            } else {
                outFile = stdout
            }
            setvbuf(outFile, nil, _IOFBF, 1 << 22)
        }
        var statsFile: UnsafeMutablePointer<FILE>? = nil
        if let sp = opts.statsPath { statsFile = fopen(sp, "w") }

        let n = W * H
        let maskBuf = UnsafeMutablePointer<UInt8>.allocate(capacity: n)
        var emaAcc: [Float] = []
        var emaCur: [Float] = []
        if opts.ema != nil { emaAcc = [Float](repeating: 0, count: n); emaCur = [Float](repeating: 0, count: n) }

        let fps = info.nominalFps > 0 ? info.nominalFps : 24
        let span = opts.duration ?? max(0, info.duration - (opts.start ?? 0))
        var expected = Int((span * fps).rounded())
        if let m = opts.maxFrames { expected = min(expected, m) }
        let startSec = opts.start ?? 0
        let skipBefore = startSec > 0 ? startSec - 0.25 / fps : -Double.infinity

        if !opts.quiet {
            log("vision-matte: \(opts.input) \(W)x\(H) @\(r3(fps)) fps, mode=\(opts.mode)"
                + (opts.mode == "person" ? " quality=\(opts.quality)" : (opts.points.isEmpty ? " all" : " points=\(opts.points)"))
                + (opts.ema.map { " ema=\($0)" } ?? "") + ", ~\(expected) frames")
        }

        var tDecode = 0.0, tVision = 0.0, tScale = 0.0, tWrite = 0.0
        var frames = 0, empty = 0
        let t0 = now()
        var lastLog = t0
        var stoppedEarly = false

        frameLoop: while true {
            if let m = opts.maxFrames, frames >= m { break }
            var ok = true
            autoreleasepool {
                let a = now()
                guard let sb = output.copyNextSampleBuffer() else { ok = false; return }
                let pts = CMSampleBufferGetPresentationTimeStamp(sb).seconds
                guard let pb = CMSampleBufferGetImageBuffer(sb) else { return }
                if pts < skipBefore { return }   // reader may hand out the frame before --start
                let b = now()
                var stat: [String: Any] = ["i": frames, "pts": r3(pts)]
                var m: CVPixelBuffer?
                do { m = try masker.mask(pb, index: frames, stat: &stat) } catch {
                    log("vision-matte: frame \(frames): Vision error \(error); writing empty mask")
                }
                let c = now()
                if let m = m { renderer.render(m, into: maskBuf) } else { memset(maskBuf, 0, n); empty += 1 }
                if let ds = despeckler {
                    stat["islandsRemoved"] = ds.run(maskBuf, minArea: minIslandPx)
                }
                if let e = opts.ema {
                    emaCur.withUnsafeMutableBufferPointer { cur in
                        vDSP_vfltu8(maskBuf, 1, cur.baseAddress!, 1, vDSP_Length(n))
                        emaAcc.withUnsafeMutableBufferPointer { acc in
                            if frames == 0 {
                                memcpy(acc.baseAddress!, cur.baseAddress!, n * 4)
                            } else {
                                var alpha = e
                                vDSP_vintb(acc.baseAddress!, 1, cur.baseAddress!, 1, &alpha, acc.baseAddress!, 1, vDSP_Length(n))
                            }
                            vDSP_vfixru8(acc.baseAddress!, 1, maskBuf, 1, vDSP_Length(n))
                        }
                    }
                }
                let d = now()
                if let f = outFile {
                    if fwrite(maskBuf, 1, n, f) != n {
                        log("vision-matte: output closed after \(frames) frames (\(String(cString: strerror(errno))))")
                        stoppedEarly = true
                        ok = false
                        return
                    }
                }
                let e = now()
                tDecode += b - a; tVision += c - b; tScale += d - c; tWrite += e - d
                if let sf = statsFile {
                    stat["decodeMs"] = r3((b - a) * 1000); stat["visionMs"] = r3((c - b) * 1000)
                    stat["scaleMs"] = r3((d - c) * 1000); stat["writeMs"] = r3((e - d) * 1000)
                    fputs(jsonString(stat) + "\n", sf)
                }
                frames += 1
                if !opts.quiet && (e - lastLog > 1.0) {
                    lastLog = e
                    log(String(format: "vision-matte: frame %d/%d  %.1f fps", frames, expected, Double(frames) / (e - t0)))
                }
            }
            if !ok { break frameLoop }
        }
        if let f = outFile { fflush(f); if opts.outPath != nil { fclose(f) } }
        if let sf = statsFile { fclose(sf) }
        if reader.status == .failed { die("reader failed after \(frames) frames: \(String(describing: reader.error))") }
        let wall = now() - t0
        let k = Double(max(frames, 1))
        let summary: [String: Any] = [
            "frames": frames, "emptyFrames": empty, "wallSec": r3(wall), "fps": r3(Double(frames) / wall),
            "width": W, "height": H, "mode": opts.mode, "quality": opts.quality,
            "msPerFrame": ["decode": r3(tDecode / k * 1000), "vision": r3(tVision / k * 1000),
                           "scale": r3(tScale / k * 1000), "write": r3(tWrite / k * 1000)],
            "stoppedEarly": stoppedEarly,
        ]
        if !opts.quiet || opts.statsPath != nil { log("vision-matte: done " + jsonString(summary)) }
        exit(0)
    }
}
