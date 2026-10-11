/**
 * Blend modes for overlay-track layers (Transform panel → Blend). The preview uses the canvas'
 * `globalCompositeOperation` (the W3C Compositing and Blending formulas); the export uses the same
 * formulas in FFmpeg `lut2` (FFmpeg's own `blend` modes differ: soft light by up to 31/255, dodge and
 * burn at the extremes). Checked on a grid of every backdrop / source pair: within 1/255 on an opaque
 * canvas, 2/255 on a transparent one.
 */

export const BLEND_MODES = ["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "add"] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

export const BLEND_LABEL: Record<BlendMode, string> = {
  normal: "Normal",
  multiply: "Multiply",
  screen: "Screen",
  overlay: "Overlay",
  darken: "Darken",
  lighten: "Lighten",
  "color-dodge": "Color dodge",
  "color-burn": "Color burn",
  "hard-light": "Hard light",
  "soft-light": "Soft light",
  difference: "Difference",
  exclusion: "Exclusion",
  add: "Add (lighter)",
};

/** The canvas operation for the preview. */
export const compositeOp = (m: BlendMode | undefined): GlobalCompositeOperation => (!m || m === "normal" ? "source-over" : m === "add" ? "lighter" : m);

/** The W3C blend of one channel (0–1): backdrop `b`, source `s`. The same as the export (for tests). */
export function blendChannel(m: BlendMode, b: number, s: number): number {
  switch (m) {
    case "normal":
    case "add":
      return s;
    case "multiply":
      return b * s;
    case "screen":
      return b + s - b * s;
    case "overlay":
      return b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
    case "darken":
      return Math.min(b, s);
    case "lighten":
      return Math.max(b, s);
    case "color-dodge":
      return b === 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s));
    case "color-burn":
      return b >= 1 ? 1 : s === 0 ? 0 : 1 - Math.min(1, (1 - b) / s);
    case "hard-light":
      return s <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s);
    case "soft-light": {
      if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
      const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
      return b + (2 * s - 1) * (d - b);
    }
    case "difference":
      return Math.abs(b - s);
    case "exclusion":
      return b + s - 2 * b * s;
  }
}

// the same, as an FFmpeg expression of X (backdrop) and Y (source), 0–1
const EXPR: Record<Exclude<BlendMode, "normal" | "add">, string> = {
  multiply: "X*Y",
  screen: "X+Y-X*Y",
  overlay: "if(lte(X,0.5),2*X*Y,1-2*(1-X)*(1-Y))",
  darken: "min(X,Y)",
  lighten: "max(X,Y)",
  "color-dodge": "if(eq(x,0),0,if(eq(y,255),1,min(1,X/(1-Y))))",
  "color-burn": "if(eq(x,255),1,if(eq(y,0),0,1-min(1,(1-X)/Y)))",
  "hard-light": "if(lte(Y,0.5),2*X*Y,1-2*(1-X)*(1-Y))",
  "soft-light": "if(lte(Y,0.5),X-(1-2*Y)*X*(1-X),X+(2*Y-1)*(if(lte(X,0.25),((16*X-12)*X+4)*X,sqrt(X))-X))",
  difference: "abs(X-Y)",
  exclusion: "X+Y-2*X*Y",
};

/** One colour channel for `lut2` (x: the composite behind, y: the layer; 8 bits), commas escaped for a filter graph. */
export function blendLut(m: Exclude<BlendMode, "normal" | "add">): string {
  const e = EXPR[m].replace(/X/g, "(x/255)").replace(/Y/g, "(y/255)");
  return `clip(round(255*(${e})),0,255)`.replace(/,/g, "\\,");
}

type Graph = { add: (s: string) => void; label: (p: string) => string };

/**
 * Put a layer on the composite with a blend mode. `layer` is the layer already placed on a
 * transparent canvas-size picture (its own x / y / time); `transparent`: the composite has see-through
 * parts (WebM / MOV exports): there the layer shows as Normal where nothing is behind it (W3C).
 * Returns the new composite's label.
 */
export function blendOnto(g: Graph, comp: string, layer: string, mode: BlendMode, transparent: boolean, enable: string): string {
  const next = g.label("bo");
  if (mode === "normal") {
    g.add(`[${comp}][${layer}]overlay=0:0:format=auto:${enable}[${next}]`);
    return next;
  }
  if (mode === "add") {
    // canvas "lighter": colour + colour, premultiplied
    const [cp, lp] = [g.label("ap"), g.label("al")];
    g.add(`[${comp}]format=gbrap${transparent ? ",premultiply=inplace=1" : ""}[${cp}]`);
    g.add(`[${layer}]format=gbrap,premultiply=inplace=1[${lp}]`);
    const sum = "min(255\\,x+y)";
    g.add(`[${cp}][${lp}]lut2=c0='${sum}':c1='${sum}':c2='${sum}':c3='${transparent ? sum : "x"}':${enable}${transparent ? ",unpremultiply=inplace=1" : ""},format=rgba[${next}]`);
    return next;
  }
  const lut = blendLut(mode);
  const [cb, co, ca, ls, lm, bl] = [g.label("cb"), g.label("co"), g.label("ca"), g.label("ls"), g.label("lm"), g.label("bl")];
  g.add(`[${comp}]format=gbrap,split=${transparent ? 3 : 2}[${cb}][${co}]${transparent ? `[${ca}]` : ""}`);
  g.add(`[${layer}]format=gbrap${transparent ? `,split[${ls}][${lm}]` : `[${ls}]`}`);
  g.add(`[${cb}][${ls}]lut2=c0='${lut}':c1='${lut}':c2='${lut}':c3='y':${enable}[${bl}]`);
  let top = bl;
  if (transparent) {
    // (1 − backdrop alpha) · layer + backdrop alpha · blend: Normal where nothing is behind
    const [mk, bm] = [g.label("mk"), g.label("bm")];
    g.add(`[${ca}]colorchannelmixer=rr=0:ra=1:gg=0:ga=1:bb=0:ba=1[${mk}]`);
    g.add(`[${lm}][${bl}][${mk}]maskedmerge=planes=7[${bm}]`);
    top = bm;
  }
  g.add(`[${co}][${top}]overlay=0:0:format=auto:${enable},format=rgba[${next}]`);
  return next;
}
