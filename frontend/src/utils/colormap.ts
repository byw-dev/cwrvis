import type { ColormapName } from '@/types'

// Control points: [t, r, g, b] where t ∈ [0,1]
type CP = [number, number, number, number]

const MAPS: Record<ColormapName, CP[]> = {
  turbo: [
    [0.00,  48,  18,  59],
    [0.10,  65,  99, 213],
    [0.20,  31, 175, 243],
    [0.35,  44, 231, 165],
    [0.50, 170, 247,  72],
    [0.65, 253, 212,  57],
    [0.80, 249, 130,  34],
    [0.90, 207,  46,  20],
    [1.00, 122,   4,   3],
  ],
  viridis: [
    [0.00,  68,   1,  84],
    [0.13,  72,  40, 120],
    [0.25,  62,  83, 136],
    [0.38,  49, 120, 142],
    [0.50,  39, 156, 139],
    [0.63,  58, 191, 113],
    [0.75, 117, 221,  73],
    [0.88, 196, 244,  47],
    [1.00, 253, 231,  37],
  ],
  magma: [
    [0.00,   0,   0,   4],
    [0.13,  21,   9,  47],
    [0.25,  65,  16,  93],
    [0.38, 120,  29, 107],
    [0.50, 177,  53,  93],
    [0.63, 221,  91,  72],
    [0.75, 249, 142, 101],
    [0.88, 253, 196, 158],
    [1.00, 252, 253, 191],
  ],
  cyan: [
    [0.00,   7,   9,  12],
    [0.25,  14,  54,  66],
    [0.50,  21,  99, 120],
    [0.75,  46, 169, 204],
    [1.00,  88, 224, 255],
  ],
  rdbu: [
    [0.00, 178,  24,  43],
    [0.25, 239, 164, 151],
    [0.50, 247, 247, 247],
    [0.75, 154, 193, 228],
    [1.00,  33, 102, 172],
  ],
}

/** Pre-compute a 256-entry RGBA LUT for the given colormap. */
export function buildLut(name: ColormapName): Uint8ClampedArray {
  const cps = MAPS[name]
  const lut = new Uint8ClampedArray(256 * 4)

  for (let i = 0; i < 256; i++) {
    const t = i / 255

    // Find surrounding control points
    let lo = cps[0]!
    let hi = cps[cps.length - 1]!
    for (let c = 0; c < cps.length - 1; c++) {
      if (t >= cps[c]![0] && t <= cps[c + 1]![0]) {
        lo = cps[c]!
        hi = cps[c + 1]!
        break
      }
    }

    const span = hi[0] - lo[0]
    const f    = span > 0 ? (t - lo[0]) / span : 0

    const base = i * 4
    lut[base]     = Math.round(lo[1] + (hi[1] - lo[1]) * f)
    lut[base + 1] = Math.round(lo[2] + (hi[2] - lo[2]) * f)
    lut[base + 2] = Math.round(lo[3] + (hi[3] - lo[3]) * f)
    lut[base + 3] = 220  // fixed opacity for all colormaps
  }

  return lut
}

// Cached LUT instances to avoid re-computation on every frame
const _cache = new Map<string, Uint8ClampedArray>()

export function getLut(name: ColormapName): Uint8ClampedArray {
  if (!_cache.has(name)) _cache.set(name, buildLut(name))
  return _cache.get(name)!
}
