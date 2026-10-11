import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildProxyArgs } from "../lib/media/proxy";
import { probeMedia } from "../lib/ffmpeg/probe";

const SCRATCH = join(process.cwd(), "scratch", "benchmarks");
if (!existsSync(SCRATCH)) mkdirSync(SCRATCH, { recursive: true });

function runCmd(cmd: string, args: string[]) {
  const res = spawnSync(cmd, args, { stdio: "pipe", encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`Command ${cmd} ${args.join(" ")} failed: ${res.stderr}`);
  }
  return res;
}

async function main() {
  console.log("=== VDO PROXY EDITING PERFORMANCE BENCHMARK ===");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Platform:", process.platform, process.arch);
  
  // 1. Generate 4K test source (3840x2160, 5s, 60fps)
  const src4k = join(SCRATCH, "source_4k.mp4");
  console.log("\n[1/5] Generating synthetic 4K 60fps source footage...");
  runCmd("ffmpeg", [
    "-y",
    "-f", "lavfi",
    "-i", "testsrc2=size=3840x2160:rate=60",
    "-t", "5",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-b:v", "25M",
    "-pix_fmt", "yuv420p",
    src4k
  ]);
  const src4kStat = statSync(src4k);
  const src4kProbe = await probeMedia(src4k);
  console.log(`  4K Source: ${src4kProbe.info.width}x${src4kProbe.info.height} @ ${src4kProbe.info.fps}fps, Size: ${(src4kStat.size / 1048576).toFixed(2)} MB`);

  // 2. Generate Transparent Alpha footage (1920x1080 with see-through background)
  const srcAlpha = join(SCRATCH, "source_alpha.mov");
  console.log("\n[2/5] Generating synthetic transparent alpha source footage...");
  runCmd("ffmpeg", [
    "-y",
    "-f", "lavfi",
    "-i", "color=c=black@0.0:size=1920x1080:rate=30,format=yuva420p",
    "-f", "lavfi",
    "-i", "testsrc2=size=640x480:rate=30",
    "-filter_complex", "[0:v][1:v]overlay=x='100+t*50':y=200:format=auto[out]",
    "-map", "[out]",
    "-t", "4",
    "-c:v", "qtrle",
    srcAlpha
  ]);
  const srcAlphaStat = statSync(srcAlpha);
  const srcAlphaProbe = await probeMedia(srcAlpha);
  console.log(`  Alpha Source: ${srcAlphaProbe.info.width}x${srcAlphaProbe.info.height}, Alpha: ${srcAlphaProbe.info.alpha}, Size: ${(srcAlphaStat.size / 1048576).toFixed(2)} MB`);

  // 3. Measure 4K Proxy Generation Time & Compression
  console.log("\n[3/5] Measuring Proxy Generation Performance for 4K Footage...");
  const proxy4k = join(SCRATCH, "proxy_4k.mp4");
  const proxyArgs = buildProxyArgs(src4k, proxy4k, src4kProbe.info, "h264_videotoolbox");
  const t0 = performance.now();
  runCmd("ffmpeg", proxyArgs);
  const t1 = performance.now();
  const genTimeSec = (t1 - t0) / 1000;
  const proxy4kStat = statSync(proxy4k);
  const proxy4kProbe = await probeMedia(proxy4k);
  const compressionRatio = (1 - proxy4kStat.size / src4kStat.size) * 100;
  console.log(`  Proxy Resolution: ${proxy4kProbe.info.width}x${proxy4kProbe.info.height} (Expected 1280x720)`);
  console.log(`  Generation Time: ${genTimeSec.toFixed(2)}s (Realtime factor: ${(5 / genTimeSec).toFixed(1)}x faster than real-time)`);
  console.log(`  Original Size: ${(src4kStat.size / 1048576).toFixed(2)} MB -> Proxy Size: ${(proxy4kStat.size / 1048576).toFixed(2)} MB`);
  console.log(`  Footprint Reduction: ${compressionRatio.toFixed(1)}%`);

  // 4. Measure Alpha Proxy Preservation
  console.log("\n[4/5] Measuring Alpha-Preserving Proxy Generation...");
  const proxyAlpha = join(SCRATCH, "proxy_alpha.webm");
  const alphaArgs = buildProxyArgs(srcAlpha, proxyAlpha, srcAlphaProbe.info);
  const ta0 = performance.now();
  runCmd("ffmpeg", alphaArgs);
  const ta1 = performance.now();
  const proxyAlphaProbe = await probeMedia(proxyAlpha);
  console.log(`  Alpha WebM Resolution: ${proxyAlphaProbe.info.width}x${proxyAlphaProbe.info.height} (Expected 1280x720)`);
  console.log(`  Alpha Channel Preserved: ${proxyAlphaProbe.info.alpha ? "YES (yuva420p VP9)" : "FAILED"}`);
  console.log(`  Alpha Gen Time: ${((ta1 - ta0) / 1000).toFixed(2)}s`);

  // 5. Measure Scrubbing / Seeking Latency: 4K Source vs 720p Proxy
  console.log("\n[5/5] Measuring Scrubbing & Seek Responsiveness (20 random frame seeks)...");
  const seekPoints = [0.2, 0.8, 1.4, 2.1, 2.7, 3.3, 3.9, 4.5, 0.5, 1.1, 1.8, 2.5, 3.1, 3.7, 4.2, 0.9, 1.5, 2.2, 2.9, 3.5];
  
  // Benchmark seeks on original 4K source
  let total4kSeekMs = 0;
  for (const t of seekPoints) {
    const s0 = performance.now();
    runCmd("ffmpeg", ["-ss", String(t), "-i", src4k, "-vframes", "1", "-f", "null", "-"]);
    const s1 = performance.now();
    total4kSeekMs += (s1 - s0);
  }
  const avg4kSeekMs = total4kSeekMs / seekPoints.length;

  // Benchmark seeks on 720p GOP-30 proxy
  let totalProxySeekMs = 0;
  for (const t of seekPoints) {
    const s0 = performance.now();
    runCmd("ffmpeg", ["-ss", String(t), "-i", proxy4k, "-vframes", "1", "-f", "null", "-"]);
    const s1 = performance.now();
    totalProxySeekMs += (s1 - s0);
  }
  const avgProxySeekMs = totalProxySeekMs / seekPoints.length;
  const seekImprovement = ((avg4kSeekMs - avgProxySeekMs) / avg4kSeekMs) * 100;

  console.log(`  Average 4K Source Seek Latency: ${avg4kSeekMs.toFixed(1)} ms`);
  console.log(`  Average 720p Proxy Seek Latency: ${avgProxySeekMs.toFixed(1)} ms`);
  console.log(`  Scrubbing Responsiveness Improvement: ${seekImprovement.toFixed(1)}% faster seek response`);
  console.log("\n=== BENCHMARK COMPLETE ===");
}

main().catch(console.error);
