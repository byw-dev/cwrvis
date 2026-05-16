// Compute the cell-boundary extent of a regular lat/lon grid (WGS-84).
// Returns outer edges = grid centers ± half step.
// Requires lats.length >= 2 and lons.length >= 2.
export function computeGridBounds(lats: number[], lons: number[]) {
  const halfLon = Math.abs(lons[1] - lons[0]) / 2
  const halfLat = Math.abs(lats[1] - lats[0]) / 2
  return {
    lonMin: Math.min(lons[0], lons[lons.length - 1]) - halfLon,
    lonMax: Math.max(lons[0], lons[lons.length - 1]) + halfLon,
    latMin: Math.min(lats[0], lats[lats.length - 1]) - halfLat,
    latMax: Math.max(lats[0], lats[lats.length - 1]) + halfLat,
  }
}

export function isInGridBounds(lat: number, lon: number, lats: number[], lons: number[]): boolean {
  if (lats.length < 2 || lons.length < 2) return false
  const { latMin, latMax, lonMin, lonMax } = computeGridBounds(lats, lons)
  return lat >= latMin && lat <= latMax && lon >= lonMin && lon <= lonMax
}

// Bilinear interpolation on a regular lat/lon grid.
// lats: center latitudes (N→S, descending). lons: center longitudes (W→E, ascending).
// Points in the outer half-cell border are clamped to the nearest edge center
// rather than returning null, so the full cell-boundary extent returns valid values.
export function bilinearInterp(
  frame2d: (number | null)[][],
  lat: number,
  lon: number,
  lats: number[],
  lons: number[],
): number | null {
  const nLon = lons.length, nLat = lats.length
  if (nLon < 2 || nLat < 2) return null

  const lonStep = lons[1] - lons[0]  // > 0 (W→E)
  const latStep = lats[1] - lats[0]  // < 0 (N→S)

  const gx = (lon - lons[0]) / lonStep
  const gy = (lat - lats[0]) / latStep

  // Clamp to [0, n-1]: outer half-cell border returns the nearest edge grid value
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
