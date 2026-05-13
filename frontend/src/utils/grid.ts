// 格点空间边界（WGS-84，1° 网格外边界）
export const GRID_BOUNDS = { latMin: 25, latMax: 40, lonMin: 75, lonMax: 100 }

export function isInGridBounds(lat: number, lon: number): boolean {
  return lat >= GRID_BOUNDS.latMin && lat <= GRID_BOUNDS.latMax
    && lon >= GRID_BOUNDS.lonMin && lon <= GRID_BOUNDS.lonMax
}

// 双线性插值：格点 lat 39.5→25.5（步长 -1），lon 75.5→99.5（步长 +1）
export function bilinearInterp(frame2d: (number | null)[][], lat: number, lon: number): number | null {
  const gy = (lat - 39.5) / -1
  const gx = (lon - 75.5) /  1

  const gy0 = Math.floor(gy), gy1 = Math.min(gy0 + 1, frame2d.length - 1)
  const gx0 = Math.floor(gx), gx1 = Math.min(gx0 + 1, (frame2d[0]?.length ?? 1) - 1)
  if (gy0 < 0 || gx0 < 0) return null

  const ty = gy - gy0, tx = gx - gx0
  let wSum = 0, vSum = 0
  const corners = [
    [gy0, gx0, (1 - tx) * (1 - ty)],
    [gy0, gx1,       tx * (1 - ty)],
    [gy1, gx0, (1 - tx) *       ty],
    [gy1, gx1,       tx *       ty],
  ] as const
  for (const [yi, xi, w] of corners) {
    const v = frame2d[yi]?.[xi]
    if (v !== null && v !== undefined) { vSum += v * w; wSum += w }
  }
  return wSum > 0 ? vSum / wSum : null
}
