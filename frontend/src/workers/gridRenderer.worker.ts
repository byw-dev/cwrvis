/// <reference lib="webworker" />

// ─── Message types ────────────────────────────────────────────────────────────

export interface RenderRequest {
  frame2d: (number | null)[][]  // shape: (nLat, nLon)，行北→南，列西→东
  lut: Uint8ClampedArray        // 256 * 4 bytes，RGBA，主线程预计算
  vmin: number                  // 色卡下限（帧数据自动或用户覆盖）
  vmax: number                  // 色卡上限（帧数据自动或用户覆盖）
  targetW: number               // 目标画布宽度（像素）
  targetH: number               // 目标画布高度（像素）
  frameKey: string              // 主线程传入，原样回传，用于缓存匹配
}

export interface RenderResponse {
  pixels: ArrayBuffer  // Uint8ClampedArray buffer，长度 targetW * targetH * 4
  width: number
  height: number
  frameKey: string
}

// ─── Worker 主逻辑 ────────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<RenderRequest>) => {
  const { frame2d, lut, vmin, vmax, targetW, targetH, frameKey } = e.data

  const nLat = frame2d.length
  const nLon = frame2d[0]?.length ?? 0

  const pixels = new Uint8ClampedArray(targetW * targetH * 4)

  const vRange = vmax - vmin

  for (let py = 0; py < targetH; py++) {
    const gy = (py / (targetH - 1)) * (nLat - 1)
    const gy0 = Math.floor(gy)
    const gy1 = Math.min(gy0 + 1, nLat - 1)
    const ty  = gy - gy0
    const ty1 = 1 - ty

    for (let px = 0; px < targetW; px++) {
      const gx = (px / (targetW - 1)) * (nLon - 1)
      const gx0 = Math.floor(gx)
      const gx1 = Math.min(gx0 + 1, nLon - 1)
      const tx  = gx - gx0
      const tx1 = 1 - tx

      const w00 = tx1 * ty1
      const w01 = tx  * ty1
      const w10 = tx1 * ty
      const w11 = tx  * ty

      const v00 = frame2d[gy0][gx0]
      const v01 = frame2d[gy0][gx1]
      const v10 = frame2d[gy1][gx0]
      const v11 = frame2d[gy1][gx1]

      let wSum = 0
      let vSum = 0
      if (v00 !== null) { vSum += v00 * w00; wSum += w00 }
      if (v01 !== null) { vSum += v01 * w01; wSum += w01 }
      if (v10 !== null) { vSum += v10 * w10; wSum += w10 }
      if (v11 !== null) { vSum += v11 * w11; wSum += w11 }

      const pidx = (py * targetW + px) * 4

      // 缺测格点保持透明
      if (wSum === 0) { pixels[pidx + 3] = 0; continue }

      // 超出量程 → clamp 到边界色，不透明
      const value   = vSum / wSum
      const clamped = vRange > 0 ? Math.max(vmin, Math.min(vmax, value)) : vmin
      const lutIdx  = vRange > 0
        ? Math.max(0, Math.min(255, Math.round(((clamped - vmin) / vRange) * 255)))
        : 0
      const base = lutIdx * 4

      pixels[pidx]     = lut[base]
      pixels[pidx + 1] = lut[base + 1]
      pixels[pidx + 2] = lut[base + 2]
      pixels[pidx + 3] = lut[base + 3]
    }
  }

  ;(self as DedicatedWorkerGlobalScope).postMessage(
    { pixels: pixels.buffer, width: targetW, height: targetH, frameKey } satisfies RenderResponse,
    [pixels.buffer],
  )
}
