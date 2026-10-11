/**
 * Turning a clip on the preview from its corners: the drag turns it by how far
 * the pointer went round the clip's middle (so grabbing any corner doesn't jump),
 * with the same snaps as before (0/90/180/270; Shift: 15° steps; Alt: free).
 */

/** The pointer's direction from the middle, in degrees (0: right, 90: down). */
export const pointerAngle = (cx: number, cy: number, x: number, y: number) => (Math.atan2(y - cy, x - cx) * 180) / Math.PI;

/** Snap within this many degrees of a quarter turn. */
export const SNAP_DEG = 6;

/** The clip's angle after the pointer went from `a0` to `a` (degrees), from `rot0`; −180…179. */
export function turnAngle(rot0: number, a0: number, a: number, mods: { shift?: boolean; alt?: boolean } = {}): number {
  let deg = rot0 + (a - a0);
  if (mods.shift) deg = Math.round(deg / 15) * 15;
  else if (!mods.alt) {
    const q = Math.round(deg / 90) * 90;
    if (Math.abs(deg - q) < SNAP_DEG) deg = q;
  }
  return Math.round(((((deg + 180) % 360) + 360) % 360) - 180);
}

/** Corners in the order the preview draws them: top-left, top-right, bottom-left, bottom-right. */
const CORNER_TURN = [270, 0, 180, 90];

/**
 * The turn cursor for a corner (a curved two-way arrow round it), turned with
 * the clip (to 15°), so it always curls round the corner you're on.
 */
export function rotateCursor(corner: number, rot = 0): string {
  const a = (CORNER_TURN[corner] ?? 0) + Math.round(rot / 15) * 15;
  const arrow = "M6.5 7.5a11 11 0 0 1 10 10M6.5 7.5l3.2-2.2M6.5 7.5l.8 3.8M16.5 17.5l-3.8-.8M16.5 17.5l2.2-3.2";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g transform="rotate(${a} 12 12)" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${arrow}" stroke="black" stroke-width="4"/><path d="${arrow}" stroke="white" stroke-width="1.8"/></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, grab`;
}
