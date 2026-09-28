export type Point3 = { x: number; y: number; z: number };

export function distance(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function midpoint(a: Point3, b: Point3): Point3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

export function normalizedRatio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 1e-6) return null;
  return numerator / denominator;
}

/** Angle ABC in degrees. All axes must use the same units (world coordinates). */
export function angle(a: Point3, b: Point3, c: Point3): number | null {
  const ab = distance(a, b);
  const cb = distance(c, b);
  if (ab <= 1e-6 || cb <= 1e-6) return null;
  const dot = (a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y) + (a.z - b.z) * (c.z - b.z);
  const cosine = dot / (ab * cb);
  return Number.isFinite(cosine) ? Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI : null;
}

export function leanFromVertical(shoulder: Point3, hip: Point3): number | null {
  if (distance(shoulder, hip) <= 1e-6) return null;
  return Math.atan2(Math.hypot(shoulder.x - hip.x, shoulder.z - hip.z), hip.y - shoulder.y) * 180 / Math.PI;
}
