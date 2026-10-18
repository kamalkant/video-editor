// FFmpeg + FFprobe (video) for Linux hosts that don't have them
// (e.g. Hostinger's Node.js hosting, where nothing can be installed with apt).
// Runs after `npm install`, before `npm run build`, and at server start (lib/ffmpeg/ensure).
//
//   - not Linux: nothing to do
//   - a tool already on the PATH, or its *_PATH variable set: that one is skipped
//   - else downloads the release file, checks its SHA-256, and puts it in vendor/:
//     FFmpeg 9.0 static from BtbN/FFmpeg-Builds (x264, x265 with its alpha layer for the
//     Safari see-through MOV, VP9, AV1, Opus), one .tar.xz for both tools (opened with the
//     host's tar); if that can't be had, FFmpeg 7.0.2 from the ffmpeg-static project
//     (no HEVC alpha: the MOV is then ProRes 4444)
//
// It never fails the install: on a problem it says so and the site still builds (those features then report it).
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, createReadStream, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { gunzipSync, inflateRawSync } from "node:zlib";

// a month's last build (BtbN keeps those for good), FFmpeg 9.0.2: the archive for each CPU and its SHA-256
const BTBN = "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-09-30-13-08";
const ARCHIVE = {
  x64: [`${BTBN}/ffmpeg-n9.0.2-17-g2a571b6068-linux64-gpl-9.0.tar.xz`, "68ee646831adaae2495618346f3bba94ff207ff83bbd34d643e7004730d66269"],
  arm64: [`${BTBN}/ffmpeg-n9.0.2-17-g2a571b6068-linuxarm64-gpl-9.0.tar.xz`, "91afcd7695d4bbbb9e0057aa10baaf9875ec4e1a97303f9059ec971336a2ab46"],
};

// the fallback: one gzip file per tool
const FF = "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1";
// per tool: the file for each CPU, and its SHA-256 (of the file as downloaded)
const TOOLS = [
  {
    name: "ffmpeg", env: "FFMPEG_PATH", out: "vendor/ffmpeg/ffmpeg", gz: true,
    x64: [`${FF}/ffmpeg-linux-x64.gz`, "bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa"],
    arm64: [`${FF}/ffmpeg-linux-arm64.gz`, "754a678672298bc68156adff58aa7385a592c2b30b1d0ae8750c45c915c4bac0"],
  },
  {
    name: "ffprobe", env: "FFPROBE_PATH", out: "vendor/ffmpeg/ffprobe", gz: true,
    x64: [`${FF}/ffprobe-linux-x64.gz`, "25d9b6ccb05e3d9de9e04e31e2506d8dd7f9f0418981965ac6df12e8d3afd067"],
    arm64: [`${FF}/ffprobe-linux-arm64.gz`, "2ab6aba60ee84412dff9188720703376cb4e7aaf7e0b5e43aa8249f2acae5bf8"],
  },
];

/** One file out of a .zip (stored or deflated), found through the zip's own directory at its end. */
export function unzipOne(zip, name) {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--)
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("not a zip file");
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let k = 0; k < count; k++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("broken zip directory");
    const method = zip.readUInt16LE(p + 10);
    const csize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const entry = zip.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    if (entry === name) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + csize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new Error(`zip method ${method} not supported`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${name} isn't in the zip`);
}
const say = (msg) => console.log(`[fetch-tools] ${msg}`);
const onPath = (bin) => spawnSync(bin, ["-version"], { stdio: "ignore" }).status === 0;

async function fetchTool(tool, [url, sha256]) {
  const out = join(process.cwd(), tool.out);
  const stamp = `${out}.sha256`;
  if (existsSync(out) && existsSync(stamp) && readFileSync(stamp, "utf8") === sha256) return "kept";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${tool.name}: HTTP ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  const sum = createHash("sha256").update(body).digest("hex");
  if (sum !== sha256) throw new Error(`${tool.name}: checksum mismatch (got ${sum})`);
  mkdirSync(dirname(out), { recursive: true });
  const tmp = `${out}.${process.pid}.tmp`;
  writeFileSync(tmp, tool.gz ? gunzipSync(body) : tool.zip ? unzipOne(body, tool.zip) : body);
  chmodSync(tmp, 0o755);
  renameSync(tmp, out);
  writeFileSync(stamp, sha256);
  return "downloaded";
}

/** The named members of a .tar.xz into `dir` (each under its last path part): the host's tar, else in JS. */
async function untarXz(file, dir, members) {
  const r = spawnSync("tar", ["-tJf", file], { encoding: "utf8", maxBuffer: 16 << 20 });
  if (r.status === 0) {
    const names = r.stdout.split("\n");
    const found = members.map((m) => names.find((n) => n.endsWith(m)));
    if (found.some((n) => !n)) throw new Error(`the archive has no ${members.join(" / ")}`);
    const x = spawnSync("tar", ["-xJf", file, "-C", dir, "--strip-components=2", ...found], { encoding: "utf8" });
    if (x.status === 0) return "tar";
  }
  // no xz on this host (tar can't open .xz): decompress here (WebAssembly) and read the tar ourselves
  return untarXzJs(file, dir, members);
}

/** A plain .tar reader over the decompressed stream: 512-byte headers, data padded to 512. */
async function untarXzJs(file, dir, members) {
  const xz = await import("xz-decompress");
  const { XzReadableStream } = xz.XzReadableStream ? xz : xz.default;
  const reader = new XzReadableStream(Readable.toWeb(createReadStream(file))).getReader();
  let buf = Buffer.alloc(0);
  let out = null; // { fd stream, left } while inside a wanted member
  let skip = 0;
  let longName = null;
  const got = new Set();
  const take = async () => {
    const { value, done } = await reader.read();
    if (done) return false;
    buf = buf.length ? Buffer.concat([buf, Buffer.from(value)]) : Buffer.from(value);
    return true;
  };
  for (;;) {
    if (out) {
      if (!buf.length && !(await take())) break;
      const n = Math.min(out.left, buf.length);
      if (n) await new Promise((res, rej) => out.stream.write(buf.subarray(0, n), (e) => (e ? rej(e) : res())));
      buf = buf.subarray(n);
      out.left -= n;
      if (out.left === 0) {
        await new Promise((res) => out.stream.end(res));
        skip = out.pad;
        out = null;
      }
      continue;
    }
    if (skip) {
      if (!buf.length && !(await take())) break;
      const n = Math.min(skip, buf.length);
      buf = buf.subarray(n);
      skip -= n;
      continue;
    }
    while (buf.length < 512) if (!(await take())) break;
    if (buf.length < 512) break;
    const h = buf.subarray(0, 512);
    buf = buf.subarray(512);
    if (h.every((b) => b === 0)) break; // the end
    const str = (a, b) => h.subarray(a, b).toString("utf8").replace(/\0.*$/s, "");
    const size = parseInt(str(124, 136).trim() || "0", 8);
    const type = String.fromCharCode(h[156]);
    const pad = (512 - (size % 512)) % 512;
    const name = longName ?? (str(345, 500) ? `${str(345, 500)}/${str(0, 100)}` : str(0, 100));
    longName = null;
    if (type === "L") {
      // a GNU long name: the next entry's name is this entry's data
      while (buf.length < size + pad) if (!(await take())) break;
      longName = buf.subarray(0, size).toString("utf8").replace(/\0.*$/s, "");
      buf = buf.subarray(size + pad);
      continue;
    }
    const want = members.find((m) => name.endsWith(m));
    if (want && (type === "0" || type === "\0")) {
      got.add(want);
      out = { stream: createWriteStream(join(dir, want.split("/").pop())), left: size, pad };
      if (size === 0) {
        await new Promise((res) => out.stream.end(res));
        out = null;
        skip = pad;
      }
    } else skip = size + pad;
  }
  await reader.cancel().catch(() => {});
  if (got.size !== members.length) throw new Error(`the archive has no ${members.filter((m) => !got.has(m)).join(" / ")}`);
  return "js";
}

/** Both tools out of the BtbN .tar.xz (bin/ffmpeg, bin/ffprobe), streamed to disk and checked. */
async function fetchArchive(tools, [url, sha256]) {
  const outs = tools.map((t) => resolve(process.cwd(), t.out));
  if (outs.every((o) => existsSync(o) && existsSync(`${o}.sha256`) && readFileSync(`${o}.sha256`, "utf8") === sha256)) return "kept";
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  mkdirSync(dirname(outs[0]), { recursive: true });
  const work = mkdtempSync(join(dirname(outs[0]), ".fetch-"));
  try {
    const file = join(work, "ffmpeg.tar.xz");
    const hash = createHash("sha256");
    const tap = new Transform({ transform: (chunk, _enc, done) => (hash.update(chunk), done(null, chunk)) });
    await pipeline(Readable.fromWeb(res.body), tap, createWriteStream(file));
    const sum = hash.digest("hex");
    if (sum !== sha256) throw new Error(`checksum mismatch (got ${sum})`);
    const how = await untarXz(file, work, tools.map((t) => `/bin/${t.name}`));
    tools.forEach((t, i) => {
      const bin = join(work, t.name);
      chmodSync(bin, 0o755);
      renameSync(bin, outs[i]);
      writeFileSync(`${outs[i]}.sha256`, sha256);
    });
    return `downloaded (opened with ${how})`;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** What the last run did, for GET /api/health (a host's install log is often out of reach). */
function writeStatus(status) {
  try {
    const file = resolve(process.cwd(), "vendor/ffmpeg/fetch-status.json");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), by: process.env.FETCH_BY || "install", ...status }));
  } catch {
    // only a note
  }
}

async function main() {
  if (process.platform !== "linux") return;
  const arch = { x64: "x64", arm64: "arm64" }[process.arch];
  // both tools wanted from here: the FFmpeg 9 archive first
  const wanted = TOOLS.filter((t) => !process.env[t.env] && !onPath(t.name));
  if (arch && wanted.length === TOOLS.length) {
    try {
      const how = await fetchArchive(TOOLS, ARCHIVE[arch]);
      say(`ffmpeg + ffprobe 9.0: ${how} (vendor/ffmpeg)`);
      writeStatus({ ffmpeg: "9.0.2", result: how });
      return;
    } catch (err) {
      console.warn(`[fetch-tools] couldn't get FFmpeg 9.0 (${err.message}); taking FFmpeg 7.0.2 (the Safari MOV is then ProRes).`);
      writeStatus({ ffmpeg: "7.0.2", error: String(err.message).slice(0, 300) });
    }
  } else writeStatus({ ffmpeg: null, result: `not fetched: ${TOOLS.filter((t) => !wanted.includes(t)).map((t) => (process.env[t.env] ? `${t.env} set` : `${t.name} on the PATH`)).join(", ") || `no build for ${process.arch}`}` });
  for (const tool of TOOLS) {
    try {
      if (process.env[tool.env]) say(`${tool.name}: ${tool.env} is set, using it.`);
      else if (onPath(tool.name)) say(`${tool.name}: installed, using it.`);
      else if (!arch) say(`${tool.name}: no build for ${process.arch}; install it or set ${tool.env}.`);
      else say(`${tool.name}: ${await fetchTool(tool, tool[arch])} (${tool.out})`);
    } catch (err) {
      console.warn(`[fetch-tools] couldn't get ${tool.name}: ${err.message}. The features that need it will say so.`);
    }
  }
}

export { fetchArchive, untarXzJs };

// (run as a script; importing it, e.g. in a test, only defines its helpers)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) await main();
