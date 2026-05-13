/// <reference lib="webworker" />

// ─── Message types ────────────────────────────────────────────────────────────

export interface RenderRequest {
  frame2d: (number | null)[][]  // shape: (nLat, nLon)，行北→南，列西→东
  lut: Uint8ClampedArray        // 256 * 4 bytes，RGBA，主线程预计算，按 var 的 vmin/vmax 建立
  vmin: number                  // var 自然量程下限（与 LUT 对应）
  vmax: number                  // var 自然量程上限（与 LUT 对应）
  threshMin: number             // 阈值过滤下限（低于此值 → alpha=0）
  threshMax: number             // 阈值过滤上限（高于此值 → alpha=0）
  targetW: number               // 目标画布宽度（像素）
  targetH: number               // 目标画布高度（像素）
  frameKey: string              // 主线程传入，原样回传，用于缓存匹配
}

export interface RenderResponse {
  imageBitmap: ImageBitmap
  frameKey: string
}

// ─── Worker 主逻辑 ────────────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent<RenderRequest>) => {
  const { frame2d, lut, vmin, vmax, threshMin, threshMax, targetW, targetH, frameKey } = e.data

  const nLat = frame2d.length
  const nLon = frame2d[0]?.length ?? 0

  const canvas = new OffscreenCanvas(targetW, targetH)
  const ctx = canvas.getContext('2d')!
  const imgData = ctx.createImageData(targetW, targetH)
  const pixels = imgData.data   // Uint8ClampedArray，长度 targetW * targetH * 4

  const vRange = vmax - vmin    // 用于 LUT 索引归一化

  for (let py = 0; py < targetH; py++) {
    // 目标像素 y → 格点纬度索引（连续）
    const gy = (py / (targetH - 1)) * (nLat - 1)
    const gy0 = Math.floor(gy)
    const gy1 = Math.min(gy0 + 1, nLat - 1)
    const ty  = gy - gy0
    const ty1 = 1 - ty

    for (let px = 0; px < targetW; px++) {
      // 目标像素 x → 格点经度索引（连续）
      const gx = (px / (targetW - 1)) * (nLon - 1)
      const gx0 = Math.floor(gx)
      const gx1 = Math.min(gx0 + 1, nLon - 1)
      const tx  = gx - gx0
      const tx1 = 1 - tx

      // 双线性插值权重
      const w00 = tx1 * ty1
      const w01 = tx  * ty1
      const w10 = tx1 * ty
      const w11 = tx  * ty

      const v00 = frame2d[gy0][gx0]
      const v01 = frame2d[gy0][gx1]
      const v10 = frame2d[gy1][gx0]
      const v11 = frame2d[gy1][gx1]

      // 跳过全为缺测的像素
      let wSum = 0
      let vSum = 0
      if (v00 !== null) { vSum += v00 * w00; wSum += w00 }
      if (v01 !== null) { vSum += v01 * w01; wSum += w01 }
      if (v10 !== null) { vSum += v10 * w10; wSum += w10 }
      if (v11 !== null) { vSum += v11 * w11; wSum += w11 }

      const pidx = (py * targetW + px) * 4

      if (wSum === 0) {
        // 全部缺测 → 透明
        pixels[pidx + 3] = 0
        continue
      }

      const value = vSum / wSum

      // 阈值过滤
      if (value < threshMin || value > threshMax) {
        pixels[pidx + 3] = 0
        continue
      }

      // LUT 查表：归一化到 [0, 255]
      const lutIdx = vRange > 0
        ? Math.max(0, Math.min(255, Math.round(((value - vmin) / vRange) * 255)))
        : 0
      const base = lutIdx * 4

      pixels[pidx]     = lut[base]
      pixels[pidx + 1] = lut[base + 1]
      pixels[pidx + 2] = lut[base + 2]
      pixels[pidx + 3] = lut[base + 3]
    }
  }

  ctx.putImageData(imgData, 0, 0)
  const imageBitmap = await createImageBitmap(canvas)

  ;(self as DedicatedWorkerGlobalScope).postMessage(
    { imageBitmap, frameKey } satisfies RenderResponse,
    [imageBitmap],
  )
}
