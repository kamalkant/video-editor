/** Map a click on the displayed preview to a pixel in the preview image. */
export function clientToSource(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, src: { width: number; height: number }) {
  const u = (clientX - rect.left) / rect.width;
  const v = (clientY - rect.top) / rect.height;
  if (!(u >= 0 && u < 1 && v >= 0 && v < 1)) return null;
  return { x: Math.min(src.width - 1, Math.floor(u * src.width)), y: Math.min(src.height - 1, Math.floor(v * src.height)) };
}
