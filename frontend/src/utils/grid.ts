// 格点空间边界（WGS-84，1° 网格外边界）
export const GRID_BOUNDS = { latMin: 25, latMax: 40, lonMin: 75, lonMax: 100 }

export function isInGridBounds(lat: number, lon: number): boolean {
  return lat >= GRID_BOUNDS.latMin && lat <= GRID_BOUNDS.latMax
    && lon >= GRID_BOUNDS.lonMin && lon <= GRID_BOUNDS.lonMax
}

// 双线性插值。lats/lons 为格点坐标数组（等间距，lats 由北向南递减）。
// 落在格点范围外的半格单元（canvas 扩边区域）内的点，钳至最近格点后插值，不返回 null。
export function bilinearInterp(
  frame2d: (number | null)[][],
  lat: number,
  lon: number,
  lats: number[],
  lons: number[],
): number | null {
  const nLon = lons.length, nLat = lats.length
  if (nLon < 2 || nLat < 2) return null

  const lonStep = lons[1] - lons[0]  // > 0
  const latStep = lats[1] - lats[0]  // < 0（北→南递减）

  const gx = (lon - lons[0]) / lonStep
  const gy = (lat - lats[0]) / latStep

  // 钳制到 [0, n-1]：让外侧半格单元内的点击返回边缘格点的插值而非 null
  const gxc = Math.max(0, Math.min(nLon - 1, gx))
  const gyc = Math.max(0, Math.min(nLat - 1, gy))

  const gx0 = Math.floor(gxc), gx1 = Math.min(gx0 + 1, nLon - 1)
  const gy0 = Math.floor(gyc), gy1 = Math.min(gy0 + 1, nLat - 1)
  const tx = gxc - gx0, ty = gyc - gy0

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
