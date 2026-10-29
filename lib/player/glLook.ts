import { IDENTITY, type Mat } from "./look";
import { canMakeCanvas, makeCanvas } from "../render/surface";

/**
 * The clip "look" for the program preview, on the GPU (WebGL works in every
 * browser; Safari has no canvas filters): crop, flip, color matrix, shape mask
 * and border. The numbers come from lib/player/look, the same as the export.
 * The caller then draws the result turned (rotation) onto the program canvas.
 */

export type LookPass = {
  /** Visible part of the source, in source pixels. */
  crop: { sx: number; sy: number; sw: number; sh: number };
  flipX: boolean;
  flipY: boolean;
  matrix: Mat;
  /** Output size in canvas pixels. */
  outW: number;
  outH: number;
  /** Shape: 0 none, 1 rounded rectangle, 2 circle, 3 diamond, 4 star; sizes in output pixels. */
  mask: { shape: 0 | 1 | 2 | 3 | 4; radius: number; feather: number; border: { rgb: [number, number, number]; width: number } | null } | null;
  /** Vignette strength 0–1 (darker corners; lib/player/look vignetteGain). */
  vignette?: number;
  glow?: number;
  grain?: number;
  blur?: number;
  pixelate?: number;
  /** The frame number: film grain changes every frame. */
  seed?: number;
};

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
uniform vec4 u_crop;     // x, y, w, h in texture coordinates
uniform vec2 u_flip;
uniform mat4 u_m;
uniform vec2 u_size;     // output pixels
uniform int u_shape;     // 0 none, 1 rounded, 2 circle, 3 diamond, 4 star
uniform float u_radius;
uniform float u_feather;
uniform float u_bw;
uniform vec3 u_bcol;
uniform float u_vig;     // vignette strength
uniform float u_glow;    // glow strength
uniform float u_grain;   // film grain strength
uniform float u_blur;    // blur strength
uniform float u_pixel;   // pixelate strength
uniform float u_seed;    // the frame number (grain moves)
varying vec2 v_uv;

// same as maskDistance() in lib/player/look.ts
float dist(vec2 p) {
  if (u_shape == 3) {
    // Diamond SDF: abs(x)/w + abs(y)/h - 1
    vec2 pNorm = abs(p - u_size * 0.5) / (u_size * 0.5);
    return (pNorm.x + pNorm.y - 1.0) * min(u_size.x, u_size.y) * 0.5;
  }
  if (u_shape == 4) {
    // 5-point star SDF approximation
    vec2 pos = (p - u_size * 0.5) / min(u_size.x, u_size.y);
    float a = atan(pos.y, pos.x);
    float r = length(pos);
    float starArm = 0.42 + 0.18 * cos(5.0 * a);
    return (r - starArm) * min(u_size.x, u_size.y);
  }
  float r = u_radius;
  vec2 hs = u_shape == 2 ? vec2(r) : u_size * 0.5;
  vec2 q = abs(p - u_size * 0.5) - (hs - vec2(r));
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 uv = v_uv;
  if (u_flip.x > 0.5) uv.x = 1.0 - uv.x;
  if (u_flip.y > 0.5) uv.y = 1.0 - uv.y;

  if (u_pixel > 0.0) {
    float blockSize = max(2.0, u_pixel * 48.0);
    uv = floor(uv * u_size / blockSize) * blockSize / u_size;
  }

  vec4 c = texture2D(u_tex, u_crop.xy + uv * u_crop.zw);

  if (u_blur > 0.0) {
    vec2 bStep = (1.0 / u_size) * (u_blur * 10.0);
    vec4 bSum = c * 0.24;
    bSum += texture2D(u_tex, u_crop.xy + clamp(uv + vec2(1.2, 0.0) * bStep, 0.0, 1.0) * u_crop.zw) * 0.19;
    bSum += texture2D(u_tex, u_crop.xy + clamp(uv - vec2(1.2, 0.0) * bStep, 0.0, 1.0) * u_crop.zw) * 0.19;
    bSum += texture2D(u_tex, u_crop.xy + clamp(uv + vec2(0.0, 1.2) * bStep, 0.0, 1.0) * u_crop.zw) * 0.19;
    bSum += texture2D(u_tex, u_crop.xy + clamp(uv - vec2(0.0, 1.2) * bStep, 0.0, 1.0) * u_crop.zw) * 0.19;
    c = bSum;
  }

  // the 4th column multiplies alpha (an offset for solid pixels), like FFmpeg's colorchannelmixer
  vec4 o = clamp(u_m * c, 0.0, 1.0);

  if (u_glow > 0.0) {
    vec3 highlights = max(vec3(0.0), o.rgb - 0.4);
    o.rgb += highlights * highlights * u_glow * 2.0;
  }

  if (u_vig > 0.0) {
    // same curve as vignetteGain() in lib/player/look.ts
    float e = length(v_uv * 2.0 - 1.0) / 1.41421356;
    float q = clamp((e - 0.35) / 0.65, 0.0, 1.0);
    o.rgb *= 1.0 - u_vig * 0.85 * q * q * (3.0 - 2.0 * q);
  }

  if (u_grain > 0.0) {
    float noise = (fract(sin(dot(v_uv * u_size + vec2(mod(u_seed, 97.0) * 13.0, mod(u_seed, 89.0) * 7.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * u_grain * 0.35;
    o.rgb = clamp(o.rgb + noise, 0.0, 1.0);
  }

  if (u_shape > 0) {
    vec2 p = v_uv * u_size;
    float d = dist(p);
    o.a *= clamp(0.5 - d / max(1.0, u_feather), 0.0, 1.0);
    if (u_bw > 0.0) {
      // the border goes over the picture, just inside the edge (FFmpeg: overlay of a ring)
      float ring = clamp(0.5 - d, 0.0, 1.0) * clamp(0.5 + d + u_bw, 0.0, 1.0);
      float a = ring + o.a * (1.0 - ring);
      o.rgb = a > 0.0 ? (u_bcol * ring + o.rgb * o.a * (1.0 - ring)) / a : o.rgb;
      o.a = a;
    }
  }
  gl_FragColor = vec4(o.rgb * o.a, o.a);
}`;

export class GlLook {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private tex: WebGLTexture;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private matBuf = new Float32Array(16);
  readonly canvas: HTMLCanvasElement;

  static create(): GlLook | null {
    // (an OffscreenCanvas in a Worker: lib/render/surface)
    if (!canMakeCanvas()) return null;
    const canvas = makeCanvas();
    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true, antialias: false });
    if (!gl) return null;
    try {
      return new GlLook(gl, canvas);
    } catch {
      return null;
    }
  }

  private constructor(gl: WebGLRenderingContext, canvas: HTMLCanvasElement) {
    this.gl = gl;
    this.canvas = canvas;
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    for (const n of ["u_tex", "u_crop", "u_flip", "u_m", "u_size", "u_shape", "u_radius", "u_feather", "u_bw", "u_bcol", "u_vig", "u_glow", "u_grain", "u_blur", "u_pixel", "u_seed"]) this.loc[n] = gl.getUniformLocation(prog, n);
  }

  /** Draw `source` (srcW × srcH) with the look into this.canvas (outW × outH). */
  render(source: TexImageSource, srcW: number, srcH: number, p: LookPass): boolean {
    const gl = this.gl;
    const w = Math.max(1, Math.min(4096, Math.round(p.outW)));
    const h = Math.max(1, Math.min(4096, Math.round(p.outH)));
    if (!srcW || !srcH) return false;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.prog);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch {
      return false;
    }
    const c = p.crop;
    gl.uniform1i(this.loc.u_tex, 0);
    gl.uniform4f(this.loc.u_crop, c.sx / srcW, c.sy / srcH, c.sw / srcW, c.sh / srcH);
    gl.uniform2f(this.loc.u_flip, p.flipX ? 1 : 0, p.flipY ? 1 : 0);
    // our matrices are row by row; GL wants columns
    const m = p.matrix ?? IDENTITY;
    const buf = this.matBuf;
    let idx = 0;
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        buf[idx++] = m[row * 4 + col];
      }
    }
    gl.uniformMatrix4fv(this.loc.u_m, false, buf);
    gl.uniform2f(this.loc.u_size, w, h);
    gl.uniform1i(this.loc.u_shape, p.mask?.shape ?? 0);
    gl.uniform1f(this.loc.u_radius, p.mask?.radius ?? 0);
    gl.uniform1f(this.loc.u_feather, p.mask?.feather ?? 1);
    gl.uniform1f(this.loc.u_bw, p.mask?.border?.width ?? 0);
    const b = p.mask?.border?.rgb ?? [1, 1, 1];
    gl.uniform3f(this.loc.u_bcol, b[0], b[1], b[2]);
    gl.uniform1f(this.loc.u_vig, p.vignette ?? 0);
    gl.uniform1f(this.loc.u_glow, p.glow ?? 0);
    gl.uniform1f(this.loc.u_grain, p.grain ?? 0);
    gl.uniform1f(this.loc.u_blur, p.blur ?? 0);
    gl.uniform1f(this.loc.u_pixel, p.pixelate ?? 0);
    gl.uniform1f(this.loc.u_seed, p.seed ?? 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return true;
  }
}
