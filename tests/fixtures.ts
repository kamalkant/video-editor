import { execFileSync } from "node:child_process";

/**
 * Synthetic Veo-like clip: #12AF34 background with light noise, a moving
 * skin-toned subject with soft edges and a white "shirt" patch (white is the
 * first color to turn see-through), plus a 440 Hz tone as audio.
 */
export function makeSyntheticClip(out: string, opts: { duration?: number; audio?: boolean; bg?: string } = {}) {
  const d = opts.duration ?? 4;
  const bg = opts.bg ?? "0x12AF34";
  const args = [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `color=c=${bg}:s=1280x720:r=24:d=${d}`,
    "-f", "lavfi", "-i", `gradients=s=420x560:c0=0xE0B090:c1=0x7A2A2A:c2=0x2A3A8A:n=3:speed=0.03:seed=42:r=24:d=${d}`,
  ];
  if (opts.audio !== false) args.push("-f", "lavfi", "-i", `sine=f=440:d=${d}`);
  args.push(
    "-filter_complex",
    "[0:v]noise=alls=4:allf=t[bg];" +
      "[1:v]format=rgba,drawbox=x=110:y=330:w=200:h=150:color=white:t=fill," +
      "geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*clip((1-hypot((X-210)/205,(Y-280)/275))*25,0,1)'[fg];" +
      "[bg][fg]overlay=x='430+250*sin(t*1.6)':y=80:format=auto,format=yuv420p[v]",
    "-map", "[v]",
  );
  if (opts.audio !== false) args.push("-map", "2:a", "-c:a", "aac", "-b:a", "128k", "-shortest");
  args.push("-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-movflags", "+faststart", out);
  execFileSync("ffmpeg", args);
}

/** Fire-like glow on a black background (for "Remove black background"). */
export function makeBlackBgClip(out: string, duration = 3) {
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `color=c=black:s=1280x720:r=24:d=${duration}`,
    "-f", "lavfi", "-i", `color=c=0xFF8800:s=300x300:r=24:d=${duration}`,
    "-filter_complex",
    "[1:v]format=rgba,geq=r=255:g=150:b=20:a='255*clip(1.3-1.3*hypot(X-150\\,Y-150)/150\\,0\\,1)'[glow];" +
      "[0:v][glow]overlay=x='400+200*sin(t*2)':y=210:format=auto,format=yuv420p[v]",
    "-map", "[v]", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-an", out,
  ]);
}
