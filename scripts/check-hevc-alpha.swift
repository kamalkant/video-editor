// Decodes one frame of a MOV with Apple's AVFoundation (the same decoder Safari uses)
// and prints TRANSPARENT when the top-left corner is transparent and the subject is solid.
// Usage: swift scripts/check-hevc-alpha.swift avatar-safari.mov [seconds]
import AVFoundation
import CoreGraphics

let args = CommandLine.arguments
guard args.count >= 2 else { print("usage: check-hevc-alpha.swift file.mov [t]"); exit(2) }
let t = args.count >= 3 ? Double(args[2]) ?? 1 : 1
let gen = AVAssetImageGenerator(asset: AVURLAsset(url: URL(fileURLWithPath: args[1])))
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter = .zero
let sem = DispatchSemaphore(value: 0)
var code: Int32 = 1
gen.generateCGImageAsynchronously(for: CMTime(seconds: t, preferredTimescale: 600)) { img, _, err in
  defer { sem.signal() }
  guard let img = img else { print("FAILED \(err?.localizedDescription ?? "")"); return }
  let w = img.width, h = img.height
  var buf = [UInt8](repeating: 0, count: w * h * 4)
  let ctx = CGContext(data: &buf, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.clear(CGRect(x: 0, y: 0, width: w, height: h))
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
  var maxA: UInt8 = 0, transparent = 0
  for i in stride(from: 3, to: buf.count, by: 4) { if buf[i] > maxA { maxA = buf[i] }; if buf[i] == 0 { transparent += 1 } }
  let corner = buf[3]
  let pct = 100.0 * Double(transparent) / Double(w * h)
  if corner < 10 && maxA >= 245 {
    print(String(format: "TRANSPARENT corner=%d max=%d transparent=%.1f%%", corner, maxA, pct)); code = 0
  } else {
    print(String(format: "OPAQUE corner=%d max=%d transparent=%.1f%%", corner, maxA, pct))
  }
}
sem.wait()
exit(code)
