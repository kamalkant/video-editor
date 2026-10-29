/**
 * Live (GPU) green removal for the playing preview. Same math as FFmpeg's
 * chromakey + our edge-only despill, so the live view is very close to the
 * export; the paused view still shows the exact FFmpeg frame.
 *
 * FFmpeg chromakey: the key RGB is turned into U/V (BT.601, limited range),
 * each pixel's U/V distance to it is averaged over its 3×3 neighbours, and
 * alpha = clamp((diff - similarity) / blend, 0, 1).
 */

export type LiveKeyParams = {
  keyColor: string;
  similarity: number;
  blend: number;
  despill: boolean;
  despillStrength: number;
  /** "black" = remove a black background (FFmpeg colorkey against black + unpremultiply). */
  /** packed: AI Removal — the video has the picture on top and its mask underneath. */
  method?: "chroma" | "black" | "packed";
  /** packed: mask levels (edge hardness), 0–1. */
  maskLo?: number;
  maskHi?: number;
  threshold?: number;
  restoreColor?: boolean;
};

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace(/^#/, "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * RGB (0-255) → U/V, BT.601. Video pixels are limited range (k = 224/255);
 * FFmpeg converts the key color itself with full range (k = 1).
 */
export function rgbToUv([r, g, b]: Rgb, fullRange = false): [number, number] {
  const k = fullRange ? 1 : 224 / 255;
  return [128 + k * (-0.16874 * r - 0.33126 * g + 0.5 * b), 128 + k * (0.5 * r - 0.41869 * g - 0.08131 * b)];
}

/** Distance term for one pixel, as chromakey computes it. */
export function uvDiff(rgb: Rgb, key: Rgb): number {
  const [u, v] = rgbToUv(rgb);
  const [ku, kv] = rgbToUv(key, true);
  const du = u - ku;
  const dv = v - kv;
  return Math.sqrt((du * du + dv * dv) / (255 * 255 * 2));
}

/** Alpha (0-1) for a flat area of one color (the 3×3 average equals the single value). */
export function referenceAlpha(rgb: Rgb, keyHex: string, similarity: number, blend: number): number {
  const diff = uvDiff(rgb, hexToRgb(keyHex));
  if (blend > 0.0001) return Math.min(1, Math.max(0, (diff - similarity) / blend));
  return diff > similarity ? 1 : 0;
}

/** Alpha (0-1) for "remove black background" (unmult): brightest channel, dark noise cut. */
export function referenceBlackAlpha([r, g, b]: Rgb, threshold: number): number {
  const m = Math.max(r, g, b);
  const T = Math.round(threshold * 255);
  return Math.min(1, Math.max(0, T > 0 ? (m - T) / (255 - T) : m / 255));
}

/** Restored straight color for "remove black background": color ÷ brightest channel. */
export function referenceBlackColor([r, g, b]: Rgb): Rgb {
  const m = Math.max(1, r, g, b);
  return [Math.min(255, (r * 255) / m), Math.min(255, (g * 255) / m), Math.min(255, (b * 255) / m)];
}

/** Edge-only despill (only pixels with alpha < 250/255 change), as in our FFmpeg graph. */
export function referenceDespill([r, g, b]: Rgb, alpha: number, blueKey: boolean, strength: number): Rgb {
  if (alpha >= 250 / 255) return [r, g, b];
  const s = strength / 100;
  if (blueKey) return [r, g, b - Math.max(b - (r * 0.5 + g * 0.5), 0) * s];
  return [r, g - Math.max(g - (r * 0.5 + b * 0.5), 0) * s, b];
}

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = vec2((a_pos.x + 1.0) * 0.5, (1.0 - a_pos.y) * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform vec2 u_keyUV;
uniform float u_sim;
uniform float u_blend;
uniform float u_spill;
uniform int u_despill;   // 0 none, 1 green, 2 blue
uniform int u_mode;      // 0 result, 1 alpha mask
uniform int u_method;    // 0 chroma key, 1 black background, 2 packed (picture over mask)
uniform float u_mlo;
uniform float u_mhi;
uniform float u_bthresh;
uniform int u_restore;
varying vec2 v_uv;

vec2 toUV(vec3 c) {
  c *= 255.0;
  float k = 224.0 / 255.0;
  return vec2(128.0 + k * (-0.16874 * c.r - 0.33126 * c.g + 0.5 * c.b),
              128.0 + k * (0.5 * c.r - 0.41869 * c.g - 0.08131 * c.b));
}

void main() {
  if (u_method == 2) {
    vec3 c = texture2D(u_tex, vec2(v_uv.x, v_uv.y * 0.5)).rgb;
    float m = texture2D(u_tex, vec2(v_uv.x, 0.5 + v_uv.y * 0.5)).r;
    float a = clamp((m - u_mlo) / max(u_mhi - u_mlo, 0.001), 0.0, 1.0);
    if (u_mode == 1) { gl_FragColor = vec4(vec3(a), 1.0); return; }
    gl_FragColor = vec4(c * a, a); // premultiplied
    return;
  }
  if (u_method == 1) {
    vec3 c = texture2D(u_tex, v_uv).rgb;
    float m = max(c.r, max(c.g, c.b));
    float a = u_bthresh > 0.0 ? clamp((m - u_bthresh) / (1.0 - u_bthresh), 0.0, 1.0) : m;
    if (u_mode == 1) { gl_FragColor = vec4(vec3(a), 1.0); return; }
    // premultiplied output; "unmult" restores color = c / m, so the glow keeps its brightness
    vec3 straight = u_restore == 1 ? min(c / max(m, 1.0 / 255.0), vec3(1.0)) : c;
    gl_FragColor = vec4(straight * a, a);
    return;
  }
  float diff = 0.0;
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      vec2 d = toUV(texture2D(u_tex, v_uv + vec2(float(i), float(j)) * u_texel).rgb) - u_keyUV;
      diff += sqrt(dot(d, d) / (255.0 * 255.0 * 2.0));
    }
  }
  diff /= 9.0;
  float a = u_blend > 0.0001 ? clamp((diff - u_sim) / u_blend, 0.0, 1.0) : (diff > u_sim ? 1.0 : 0.0);
  if (u_mode == 1) {
    gl_FragColor = vec4(vec3(a), 1.0);
    return;
  }
  vec3 c = texture2D(u_tex, v_uv).rgb;
  if (u_despill > 0 && a < 250.0 / 255.0) {
    if (u_despill == 1) c.g -= max(c.g - (c.r * 0.5 + c.b * 0.5), 0.0) * u_spill;
    else c.b -= max(c.b - (c.r * 0.5 + c.g * 0.5), 0.0) * u_spill;
  }
  gl_FragColor = vec4(c * a, a); // premultiplied
}`;

/** Draws the keyed version of a <video> frame into a WebGL canvas. */
export class LiveKeyRenderer {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private tex: WebGLTexture;
  private loc: Record<string, WebGLUniformLocation | null> = {};

  static create(canvas: HTMLCanvasElement): LiveKeyRenderer | null {
    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true, antialias: false });
    if (!gl) return null;
    try {
      return new LiveKeyRenderer(gl);
    } catch {
      return null;
    }
  }

  private constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
    this.prog = prog;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    for (const n of ["u_tex", "u_texel", "u_keyUV", "u_sim", "u_blend", "u_spill", "u_despill", "u_mode", "u_method", "u_bthresh", "u_restore", "u_mlo", "u_mhi"]) this.loc[n] = gl.getUniformLocation(prog, n);
  }

  /** `video`: a <video>, a canvas, or a decoded frame (the export, lib/export/clipDecoder). */
  render(video: HTMLVideoElement | HTMLCanvasElement | VideoFrame, p: LiveKeyParams, mode: "result" | "alpha" = "result"): boolean {
    const gl = this.gl;
    const packed = p.method === "packed";
    const isVideo = "videoWidth" in video;
    const isFrame = "displayWidth" in video;
    const w = isVideo ? video.videoWidth : isFrame ? video.displayWidth : video.width;
    const fullH = isVideo ? video.videoHeight : isFrame ? video.displayHeight : video.height;
    const h = packed ? Math.round(fullH / 2) : fullH;
    if (!w || !h || (isVideo && video.readyState < 2)) return false;
    const canvas = gl.canvas as HTMLCanvasElement;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.prog);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    const key = hexToRgb(p.keyColor);
    const [ku, kv] = rgbToUv(key, true);
    const blue = key[2] > key[1];
    gl.uniform1i(this.loc.u_tex, 0);
    gl.uniform2f(this.loc.u_texel, 1 / w, 1 / h);
    gl.uniform2f(this.loc.u_keyUV, ku, kv);
    gl.uniform1f(this.loc.u_sim, p.similarity);
    gl.uniform1f(this.loc.u_blend, p.blend);
    gl.uniform1f(this.loc.u_spill, p.despillStrength / 100);
    gl.uniform1i(this.loc.u_despill, p.despill && p.despillStrength > 0 ? (blue ? 2 : 1) : 0);
    gl.uniform1i(this.loc.u_mode, mode === "alpha" ? 1 : 0);
    gl.uniform1i(this.loc.u_method, packed ? 2 : p.method === "black" ? 1 : 0);
    gl.uniform1f(this.loc.u_mlo, p.maskLo ?? 0);
    gl.uniform1f(this.loc.u_mhi, p.maskHi ?? 1);
    gl.uniform1f(this.loc.u_bthresh, Math.round((p.threshold ?? 0.03) * 255) / 255);
    gl.uniform1i(this.loc.u_restore, p.restoreColor === false ? 0 : 1);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }
}
