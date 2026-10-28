/**
 * The browser export's codec strings (WebCodecs), with a level that holds the export's size and frame rate:
 * a level too small for them is refused (a fixed H.264 level 4.2 sent 21:9 and 4K to the server).
 */

/** H.264 levels: their id, the most macroblocks (16 × 16) in a frame and in a second. */
const AVC_LEVELS: [id: number, frame: number, perSecond: number][] = [
  [0x1e, 1620, 40500], // 3.0
  [0x1f, 3600, 108000], // 3.1
  [0x20, 5120, 216000], // 3.2
  [0x28, 8192, 245760], // 4.0
  [0x2a, 8704, 522240], // 4.2
  [0x32, 22080, 589824], // 5.0
  [0x33, 36864, 983040], // 5.1
  [0x34, 36864, 2073600], // 5.2
  [0x3c, 139264, 4177920], // 6.0
  [0x3d, 139264, 8355840], // 6.1
  [0x3e, 139264, 16711680], // 6.2
];

const hex2 = (n: number) => n.toString(16).padStart(2, "0");

/** The H.264 codec strings to try for this size, best first: High, then Main, then Baseline, at one level. */
export function avcCodecs(width: number, height: number, fps: number): string[] {
  const mbW = Math.ceil(width / 16);
  const mbH = Math.ceil(height / 16);
  const frame = mbW * mbH;
  const level =
    AVC_LEVELS.find(([, f, s]) => frame <= f && frame * fps <= s && Math.max(mbW, mbH) <= Math.sqrt(8 * f))?.[0] ?? AVC_LEVELS[AVC_LEVELS.length - 1][0];
  // (profile, constraint flags) — High 0x64, Main 0x4d, Baseline 0x42
  return [0x64, 0x4d, 0x42].map((p) => `avc1.${hex2(p)}00${hex2(level)}`);
}

/** HEVC Main levels: their id (level × 30), the most luma samples in a frame and in a second. */
const HEVC_LEVELS: [id: number, frame: number, perSecond: number][] = [
  [90, 552960, 16588800], // 3.0
  [93, 983040, 33177600], // 3.1
  [120, 2228224, 66846720], // 4.0
  [123, 2228224, 133693440], // 4.1
  [150, 8912896, 267386880], // 5.0
  [153, 8912896, 534773760], // 5.1
  [156, 8912896, 1069547520], // 5.2
  [180, 35651584, 1069547520], // 6.0
  [183, 35651584, 2139095040], // 6.1
];

/** The HEVC (Main) codec string for this size. */
export function hevcCodec(width: number, height: number, fps: number): string {
  const frame = width * height;
  const level =
    HEVC_LEVELS.find(([, f, s]) => frame <= f && frame * fps <= s && Math.max(width, height) <= Math.sqrt(8 * f))?.[0] ?? HEVC_LEVELS[HEVC_LEVELS.length - 1][0];
  return `hvc1.1.6.L${level}.90`;
}
