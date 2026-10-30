import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeBlackBgClip, makeSyntheticClip } from "../tests/fixtures";

export const FIX = join(__dirname, ".fixtures");

export default function globalSetup() {
  // the test server's own storage starts empty every run (never your real projects)
  rmSync(join(__dirname, ".storage"), { recursive: true, force: true });
  mkdirSync(FIX, { recursive: true });
  if (!existsSync(join(FIX, "veo.mp4"))) makeSyntheticClip(join(FIX, "veo.mp4"));
  if (!existsSync(join(FIX, "grey.mp4"))) makeSyntheticClip(join(FIX, "grey.mp4"), { bg: "0x808080", audio: false, duration: 2 });
  if (!existsSync(join(FIX, "fire.mp4"))) makeBlackBgClip(join(FIX, "fire.mp4"), 2);
  // speech-like sound with two pauses (1.0–2.0 s and 2.8–3.6 s), for "Remove silences"
  if (!existsSync(join(FIX, "pauses.mp4")))
    execFileSync("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "color=c=0x336699:s=640x360:r=24:d=4",
      "-f", "lavfi", "-i", "sine=f=300:d=4",
      "-af", "volume='if(between(t,1,2)+between(t,2.8,3.6),0,1)':eval=frame",
      "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", "-shortest", join(FIX, "pauses.mp4"),
    ]);
  // background music for the audio track
  if (!existsSync(join(FIX, "music.m4a"))) execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=f=220:d=6", "-c:a", "aac", join(FIX, "music.m4a")]);
  // solid colors, for checking which clip the program preview shows
  for (const [name, color, d] of [["red.mp4", "0xE01010", 4], ["yellow.mp4", "0xE0D010", 2], ["blue.mp4", "0x1030E0", 2]] as const)
    if (!existsSync(join(FIX, name)))
      execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `color=c=${color}:s=640x360:r=24:d=${d}`, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", join(FIX, name)]);
  writeFileSync(join(FIX, "fake.mp4"), "this is not a video\n");
  // other video files: a see-through ProRes 4444 .mov (a sting) and an H.264 .mkv (they get playable copies), and a broken .mov
  if (!existsSync(join(FIX, "sting.mov")))
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=25:d=2,format=yuva444p10le,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='if(lt(X,320),255,0)'", "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", join(FIX, "sting.mov")]);
  if (!existsSync(join(FIX, "clip.mkv")))
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=25:d=2", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", join(FIX, "clip.mkv")]);
  writeFileSync(join(FIX, "broken.mov"), "this is not a video either\n");
  // a website-like picture for the "Image" preview background
  if (!existsSync(join(FIX, "site.png")))
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=s=1280x720", "-frames:v", "1", join(FIX, "site.png")]);
}
