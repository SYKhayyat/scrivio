export interface TestBlob {
  id: number
  x0: number
  y0: number
  x1: number
  y1: number
  area: number
  fill: number
}

export function rgba(width: number, height: number, value = 255): {
  data: Uint8ClampedArray
  width: number
  height: number
} {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4
    data[offset] = value
    data[offset + 1] = value
    data[offset + 2] = value
    data[offset + 3] = 255
  }
  return { data, width, height }
}

export function grayRgba(gray: Uint8Array, width: number, height: number): {
  data: Uint8ClampedArray
  width: number
  height: number
} {
  const image = rgba(width, height)
  for (let i = 0; i < gray.length; i += 1) {
    const offset = i * 4
    const value = gray[i] ?? 0
    image.data[offset] = value
    image.data[offset + 1] = value
    image.data[offset + 2] = value
  }
  return image
}

export function darkRect(
  image: { data: Uint8ClampedArray; width: number; height: number },
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  value = 0,
): void {
  const left = Math.max(0, Math.min(image.width - 1, x0))
  const top = Math.max(0, Math.min(image.height - 1, y0))
  const right = Math.max(0, Math.min(image.width - 1, x1))
  const bottom = Math.max(0, Math.min(image.height - 1, y1))
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const offset = (y * image.width + x) * 4
      image.data[offset] = value
      image.data[offset + 1] = value
      image.data[offset + 2] = value
    }
  }
}

export function testBlob(
  id: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  fill = 1,
): TestBlob {
  const area = (x1 - x0 + 1) * (y1 - y0 + 1) * fill
  return { id, x0, y0, x1, y1, area, fill }
}

export function wordStrokePage(width = 600, height = 400): {
  data: Uint8ClampedArray
  width: number
  height: number
} {
  const image = rgba(width, height)
  const rows = [40, 120, 200, 280]
  const columns = [40, 180, 320]
  let index = 0
  for (const y of rows) {
    for (const x of columns) {
      darkRect(image, x, y, x + 16, y + 30)
      index += 1
    }
  }
  if (index !== 12) {
    throw new Error('wordStrokePage fixture must contain twelve strokes')
  }
  return image
}
