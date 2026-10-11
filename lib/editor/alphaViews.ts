/** Build a derived view (alpha mask or see-through highlight) from the exact preview PNG. */
export async function makeAlphaView(url: string, mode: "mask" | "highlight"): Promise<string> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const a = p[i + 3];
    if (mode === "mask") {
      p[i] = p[i + 1] = p[i + 2] = a;
      p[i + 3] = 255;
    } else if (a > 0 && a < 245) {
      // magenta = partly see-through
      p[i] = 255;
      p[i + 1] = 43;
      p[i + 2] = 214;
      p[i + 3] = 255;
    }
  }
  ctx.putImageData(d, 0, 0);
  return await new Promise((resolve) => c.toBlob((b) => resolve(URL.createObjectURL(b!)), "image/png"));
}
