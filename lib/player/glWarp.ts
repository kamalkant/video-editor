import { adjugate, applyH, homography, quadBounds, rectQuad, type Mat3, type Quad } from "./quad";

/**
 * Perspective (corner pin) in the program preview: a picture drawn onto any four-cornered shape,
 * with the same homography as the export (lib/render/compose → FFmpeg `perspective`). On the GPU
 * the inverse map runs per pixel, so it's exact, with smooth edges and premultiplied alpha (no dark
 * rim, like the export's premultiplied warp). Without WebGL: a mesh of small affine triangles.
 */

type Source = HTMLVideoElement | HTMLCanvasElement | HTMLImageElement;

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = (derivatives: boolean) => `
${derivatives ? "#extension GL_OES_standard_derivatives : enable" : ""}
precision highp float;
uniform sampler2D u_tex;
uniform mat3 u_inv;      // canvas point → source point (inverse homography, row major in a GLSL column matrix)
uniform vec2 u_off;      // this picture's top-left on the canvas
uniform float u_h;       // this picture's height (gl_FragCoord is bottom-up)
uniform vec4 u_src;      // the source rectangle (x, y, w, h) in source pixels
uniform vec2 u_tex_size; // the texture's size
void main() {
  vec2 p = vec2(u_off.x + gl_FragCoord.x, u_off.y + (u_h - gl_FragCoord.y));
  vec3 q = u_inv * vec3(p, 1.0);
  if (q.z <= 0.0) { gl_FragColor = vec4(0.0); return; }
  vec2 s = q.xy / q.z;                 // in the source rectangle (0 … w, 0 … h)
  vec2 n = s / u_src.zw;               // 0 … 1
  ${
    derivatives
      ? `vec2 fw = max(fwidth(n), vec2(1e-6));
  float cov = clamp(min(min(n.x, 1.0 - n.x) / fw.x, min(n.y, 1.0 - n.y) / fw.y) + 0.5, 0.0, 1.0);`
      : `float cov = (n.x < 0.0 || n.y < 0.0 || n.x > 1.0 || n.y > 1.0) ? 0.0 : 1.0;`
  }
  if (cov <= 0.0) { gl_FragColor = vec4(0.0); return; }
  vec2 uv = (u_src.xy + clamp(s, vec2(0.5), u_src.zw - 0.5)) / u_tex_size;
  gl_FragColor = texture2D(u_tex, uv) * cov;   // premultiplied in, premultiplied out
}`;

export class GlWarp {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private tex: WebGLTexture;
  private loc: Record<string, WebGLUniformLocation | null>;

  private constructor(canvas: HTMLCanvasElement, gl: WebGLRenderingContext, prog: WebGLProgram, tex: WebGLTexture) {
    this.canvas = canvas;
    this.gl = gl;
    this.prog = prog;
    this.tex = tex;
    this.loc = Object.fromEntries(["u_tex", "u_inv", "u_off", "u_h", "u_src", "u_tex_size"].map((n) => [n, gl.getUniformLocation(prog, n)]));
  }

  /** null when this browser has no WebGL (the caller uses drawWarpMesh). */
  static create(): GlWarp | null {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
    if (!gl) return null;
    const derivatives = !!gl.getExtension("OES_standard_derivatives");
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = sh(gl.VERTEX_SHADER, VERT);
    const fs = sh(gl.FRAGMENT_SHADER, FRAG(derivatives));
    if (!vs || !fs) return null;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // (premultiplied texture: the in-between samples of a see-through edge stay clean)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    return new GlWarp(canvas, gl, prog, tex);
  }

  /**
   * Warp the source rectangle (sx, sy, sw, sh of a texW × texH picture) onto `quad` (canvas pixels).
   * Returns where to draw this canvas (its top-left on the canvas), or null if it couldn't.
   */
  render(src: Source, texW: number, texH: number, sx: number, sy: number, sw: number, sh: number, quad: Quad): { x: number; y: number } | null {
    const b = quadBounds(quad);
    const x0 = Math.floor(b.x);
    const y0 = Math.floor(b.y);
    const w = Math.max(1, Math.ceil(b.x + b.w) - x0);
    const h = Math.max(1, Math.ceil(b.y + b.h) - y0);
    // (a huge shape — a corner pulled far off — is capped at 4K)
    if (w > 4096 || h > 4096) return null;
    const gl = this.gl;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    } catch {
      return null;
    }
    const inv = adjugate(homography(rectQuad(0, 0, sw, sh), quad));
    gl.useProgram(this.prog);
    gl.uniform1i(this.loc.u_tex, 0);
    // (GLSL matrices are column major: pass the row-major matrix transposed)
    gl.uniformMatrix3fv(this.loc.u_inv, false, new Float32Array([inv[0], inv[3], inv[6], inv[1], inv[4], inv[7], inv[2], inv[5], inv[8]]));
    gl.uniform2f(this.loc.u_off, x0, y0);
    gl.uniform1f(this.loc.u_h, h);
    gl.uniform4f(this.loc.u_src, sx, sy, sw, sh);
    gl.uniform2f(this.loc.u_tex_size, texW, texH);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return { x: x0, y: y0 };
  }
}

/**
 * The same without WebGL: the source cut into n × n cells, each drawn as two affine triangles
 * (close to the true perspective; a hairline overlap hides the seams).
 */
export function drawWarpMesh(ctx: CanvasRenderingContext2D, src: Source, sx: number, sy: number, sw: number, sh: number, quad: Quad, n = 10) {
  const H: Mat3 = homography(rectQuad(0, 0, sw, sh), quad);
  const pt = (i: number, j: number) => applyH(H, { x: (sw * i) / n, y: (sh * j) / n });
  const tri = (s: [number, number][], d: { x: number; y: number }[]) => {
    // the affine map of source triangle s onto d
    const [[x0, y0], [x1, y1], [x2, y2]] = s;
    const den = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(den) < 1e-9) return;
    const a = ((d[1].x - d[0].x) * (y2 - y0) - (d[2].x - d[0].x) * (y1 - y0)) / den;
    const c = ((d[2].x - d[0].x) * (x1 - x0) - (d[1].x - d[0].x) * (x2 - x0)) / den;
    const b = ((d[1].y - d[0].y) * (y2 - y0) - (d[2].y - d[0].y) * (y1 - y0)) / den;
    const e = ((d[2].y - d[0].y) * (x1 - x0) - (d[1].y - d[0].y) * (x2 - x0)) / den;
    const tx = d[0].x - a * x0 - c * y0;
    const ty = d[0].y - b * x0 - e * y0;
    // a slightly bigger triangle (half a pixel out), so neighbours overlap instead of leaving a gap
    const mx = (d[0].x + d[1].x + d[2].x) / 3;
    const my = (d[0].y + d[1].y + d[2].y) / 3;
    ctx.save();
    ctx.beginPath();
    d.forEach((p, k) => {
      const l = Math.hypot(p.x - mx, p.y - my) || 1;
      const qx = p.x + ((p.x - mx) / l) * 0.6;
      const qy = p.y + ((p.y - my) / l) * 0.6;
      if (k === 0) ctx.moveTo(qx, qy);
      else ctx.lineTo(qx, qy);
    });
    ctx.closePath();
    ctx.clip();
    ctx.transform(a, b, c, e, tx, ty);
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
    ctx.restore();
  };
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const s00: [number, number] = [(sw * i) / n, (sh * j) / n];
      const s10: [number, number] = [(sw * (i + 1)) / n, (sh * j) / n];
      const s11: [number, number] = [(sw * (i + 1)) / n, (sh * (j + 1)) / n];
      const s01: [number, number] = [(sw * i) / n, (sh * (j + 1)) / n];
      const p00 = pt(i, j);
      const p10 = pt(i + 1, j);
      const p11 = pt(i + 1, j + 1);
      const p01 = pt(i, j + 1);
      tri([s00, s10, s11], [p00, p10, p11]);
      tri([s00, s11, s01], [p00, p11, p01]);
    }
}
