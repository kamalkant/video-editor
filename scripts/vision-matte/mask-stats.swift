// mask-stats: temporal-stability metrics for a stream of raw 8-bit gray masks on stdin.
//
//   ffmpeg -v error -i mask.mkv -f rawvideo -pix_fmt gray - | mask-stats W H [per-frame.csv] [cut,frames]
//   cut frames (first frame of each new shot, e.g. from ffmpeg scdet) are excluded from the
//   mad/jitter/flip summaries so that hard cuts are not counted as flicker.
//
// Per frame t (values 0..255):
//   coverage  mean(m_t)/255                       fraction of the frame kept
//   mad       mean |m_t - m_{t-1}|                 all change: motion + flicker
//   jitter    mean |m_{t-1} - 2 m_t + m_{t+1}| / 2  second difference: large for on/off/on
//                                                   flicker, ~0 for smooth motion
//   flipPct   % pixels whose binarised (>=128) state goes A -> B -> A over t-1, t, t+1
//   edgePct   % pixels in the soft band 16..239 (edge / semi-transparent area)
// Summary JSON on stdout: means, p95s and max of those series.

import Accelerate
import Foundation

let args = CommandLine.arguments
guard args.count >= 3, let W = Int(args[1]), let H = Int(args[2]) else {
    FileHandle.standardError.write("usage: mask-stats W H [per-frame.csv] < raw_gray\n".data(using: .utf8)!)
    exit(2)
}
let n = W * H
let csvPath = args.count > 3 && args[3] != "-" ? args[3] : nil
let cuts = Set((args.count > 4 ? args[4] : "").split(separator: ",").compactMap { Int($0) })
var madIdx: [Int] = [], jitIdx: [Int] = []  // frame index each sample belongs to
var csv = csvPath.flatMap { fopen($0, "w") }
if let c = csv { fputs("frame,coverage,madToPrev,jitter,flipPct,edgePct,cut\n", c) }

var bufs = [[UInt8]](repeating: [UInt8](repeating: 0, count: n), count: 3)  // t-2, t-1, t (ring)
var f = [[Float]](repeating: [Float](repeating: 0, count: n), count: 3)
var tmp = [Float](repeating: 0, count: n)
var tmp2 = [Float](repeating: 0, count: n)

func readFrame(_ dst: inout [UInt8]) -> Bool {
    var got = 0
    return dst.withUnsafeMutableBytes { p -> Bool in
        while got < n {
            let r = fread(p.baseAddress! + got, 1, n - got, stdin)
            if r <= 0 { return false }
            got += r
        }
        return true
    }
}

var coverage: [Double] = [], mad: [Double] = [], jitter: [Double] = [], flips: [Double] = [], edge: [Double] = []
var t = 0
var madByFrame: [Double] = [0]
while true {
    let cur = t % 3
    guard readFrame(&bufs[cur]) else { break }
    bufs[cur].withUnsafeBufferPointer { b in
        f[cur].withUnsafeMutableBufferPointer { d in vDSP_vfltu8(b.baseAddress!, 1, d.baseAddress!, 1, vDSP_Length(n)) }
    }
    var mean: Float = 0
    vDSP_meanv(f[cur], 1, &mean, vDSP_Length(n))
    coverage.append(Double(mean) / 255)
    var soft = 0
    for v in bufs[cur] where v >= 16 && v <= 239 { soft += 1 }
    edge.append(Double(soft) * 100 / Double(n))
    if t >= 1 {
        let p = (t - 1) % 3
        vDSP_vsub(f[p], 1, f[cur], 1, &tmp, 1, vDSP_Length(n))
        var m: Float = 0
        vDSP_meamgv(tmp, 1, &m, vDSP_Length(n))
        madByFrame.append(Double(m))
        if !cuts.contains(t) { mad.append(Double(m)); madIdx.append(t) }
    }
    if t >= 2 {
        // second difference centred on t-1
        let a = (t - 2) % 3, b = (t - 1) % 3
        vDSP_vadd(f[a], 1, f[cur], 1, &tmp, 1, vDSP_Length(n))
        var two: Float = 2
        vDSP_vsmul(f[b], 1, &two, &tmp2, 1, vDSP_Length(n))
        vDSP_vsub(tmp2, 1, tmp, 1, &tmp, 1, vDSP_Length(n))
        var m: Float = 0
        vDSP_meamgv(tmp, 1, &m, vDSP_Length(n))
        let crossesCut = cuts.contains(t) || cuts.contains(t - 1)
        let jit = Double(m) / 2
        var fl = 0
        let A = bufs[a], B = bufs[b], C = bufs[cur]
        for i in 0..<n {
            let x = A[i] >= 128, y = B[i] >= 128, z = C[i] >= 128
            if x == z && x != y { fl += 1 }
        }
        let flp = Double(fl) * 100 / Double(n)
        if !crossesCut { jitter.append(jit); flips.append(flp); jitIdx.append(t - 1) }
        if let c = csv {
            fputs(String(format: "%d,%.4f,%.3f,%.3f,%.4f,%.3f,%d\n", t - 1, coverage[t - 1], madByFrame[t - 1], jit, flp, edge[t - 1], crossesCut ? 1 : 0), c)
        }
    }
    t += 1
}
if let c = csv { fclose(c) }

func stats(_ a: [Double]) -> [String: Double] {
    guard !a.isEmpty else { return [:] }
    let s = a.sorted()
    func r(_ x: Double) -> Double { (x * 10000).rounded() / 10000 }
    return ["mean": r(a.reduce(0, +) / Double(a.count)), "median": r(s[s.count / 2]), "p95": r(s[min(s.count - 1, Int(Double(s.count) * 0.95))]), "max": r(s.last!)]
}
let worst = zip(jitIdx, flips).sorted { $0.1 > $1.1 }.prefix(5).map { ["frame": $0.0, "flipPct": (($0.1) * 1000).rounded() / 1000] }
let out: [String: Any] = ["frames": t, "cutsExcluded": cuts.sorted(), "worstFlipFrames": worst, "coverage": stats(coverage), "mad": stats(mad), "jitter": stats(jitter),
                          "flipPct": stats(flips), "edgePct": stats(edge)]
let data = try! JSONSerialization.data(withJSONObject: out, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
