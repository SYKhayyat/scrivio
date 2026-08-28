import type { SegmentationPort, SegmentOptions, ChunkData } from '../../core/ports';
import type { BoundingBox } from '../../core/types';
import type { SegmentationConfig } from '../../core/config';

type BlobRect = BoundingBox & { area: number; pixels?: Uint8Array };

class UnionFind {
  parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    let p = this.parent[x];
    if (p !== x) this.parent[x] = this.find(p);
    return this.parent[x];
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

export class SegmentationEngine implements SegmentationPort {
  constructor(private config: SegmentationConfig) {}

  async segmentImage(image: ImageData | Blob, options: SegmentOptions): Promise<ChunkData[]> {
    const imageData = await this.toImageData(image);
    const scaled = this.downscale(imageData, this.config.downscaleLongEdgePx);
    const binary = this.binarize(scaled);
    let blobs = this.connectedComponents(binary, scaled.width, scaled.height);
    blobs = this.filterNoise(blobs, scaled.width * scaled.height);
    if (blobs.length === 0) return [];
    const chunks = this.groupIntoWords(blobs);
    const lines = this.detectLines(chunks);
    const ordered = this.orderChunks(lines, options.direction, options.layout.columns);
    const withPunctuation = this.handlePunctuation(ordered, blobs);
    const scaleX = imageData.width / scaled.width;
    const scaleY = imageData.height / scaled.height;
    return withPunctuation.map((c, idx) => ({
      id: crypto.randomUUID(),
      boundingBox: {
        x: Math.round(c.x * scaleX),
        y: Math.round(c.y * scaleY),
        w: Math.round(c.w * scaleX),
        h: Math.round(c.h * scaleY),
      },
      lineIndex: c.lineIndex,
      positionOnLine: idx,
    }));
  }

  async cropChunk(imageBlob: Blob, bbox: BoundingBox, quality = 85): Promise<Blob> {
    const bitmap = await createImageBitmap(imageBlob);
    const canvas = new OffscreenCanvas(bbox.w, bbox.h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('OffscreenCanvas not available');
    ctx.drawImage(bitmap, -bbox.x, -bbox.y);
    bitmap.close();
    return canvas.convertToBlob({ type: 'image/jpeg', quality: quality / 100 });
  }

  private async toImageData(input: ImageData | Blob): Promise<ImageData> {
    if (input instanceof ImageData) return input;
    const bitmap = await createImageBitmap(input);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  private downscale(data: ImageData, longEdge: number): ImageData {
    const maxDim = Math.max(data.width, data.height);
    if (maxDim <= longEdge) return data;
    const scale = longEdge / maxDim;
    const w = Math.round(data.width * scale);
    const h = Math.round(data.height * scale);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d')!;
    const tmp = new OffscreenCanvas(data.width, data.height);
    tmp.getContext('2d')!.putImageData(data, 0, 0);
    ctx.drawImage(tmp, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }

  private binarize(imageData: ImageData): Uint8Array {
    const { width, height, data } = imageData;
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    if (this.config.binarization === 'otsu') {
      const thresh = this.otsuThreshold(gray);
      const bin = new Uint8Array(width * height);
      for (let i = 0; i < gray.length; i++) bin[i] = gray[i] < thresh ? 1 : 0;
      return bin;
    }
    return this.adaptiveGaussianThreshold(gray, width, height);
  }

  private otsuThreshold(gray: Uint8Array): number {
    const hist = new Array(256).fill(0);
    for (const v of gray) hist[v]++;
    const total = gray.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0;
    let wB = 0;
    let maxVar = 0;
    let threshold = 0;
    for (let i = 0; i < 256; i++) {
      wB += hist[i];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += i * hist[i];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const v = wB * wF * (mB - mF) * (mB - mF);
      if (v > maxVar) {
        maxVar = v;
        threshold = i;
      }
    }
    return threshold;
  }

  private adaptiveGaussianThreshold(gray: Uint8Array, width: number, height: number): Uint8Array {
    const bin = new Uint8Array(width * height);
    const win = this.config.adaptiveWindowSize;
    const c = this.config.adaptiveConstant;
    const half = Math.floor(win / 2);
    const integral = this.buildIntegral(gray, width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const x1 = Math.max(0, x - half);
        const y1 = Math.max(0, y - half);
        const x2 = Math.min(width - 1, x + half);
        const y2 = Math.min(height - 1, y + half);
        const area = (x2 - x1 + 1) * (y2 - y1 + 1);
        const sum = this.integralSum(integral, width, x1, y1, x2, y2);
        const mean = sum / area;
        bin[y * width + x] = gray[y * width + x] < mean - c ? 1 : 0;
      }
    }
    return bin;
  }

  private buildIntegral(gray: Uint8Array, w: number, h: number): Uint32Array {
    const integral = new Uint32Array(w * h);
    for (let y = 0; y < h; y++) {
      let rowSum = 0;
      for (let x = 0; x < w; x++) {
        rowSum += gray[y * w + x];
        integral[y * w + x] = rowSum + (y > 0 ? integral[(y - 1) * w + x] : 0);
      }
    }
    return integral;
  }

  private integralSum(integral: Uint32Array, w: number, x1: number, y1: number, x2: number, y2: number): number {
    const a = integral[y2 * w + x2];
    const b = x1 > 0 ? integral[y2 * w + (x1 - 1)] : 0;
    const c = y1 > 0 ? integral[(y1 - 1) * w + x2] : 0;
    const d = x1 > 0 && y1 > 0 ? integral[(y1 - 1) * w + (x1 - 1)] : 0;
    return a - b - c + d;
  }

  private connectedComponents(binary: Uint8Array, width: number, height: number): BlobRect[] {
    const labels = new Int32Array(width * height).fill(-1);
    const uf = new UnionFind(width * height);
    let nextLabel = 0;
    const labelMap = new Map<number, number>();

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (binary[idx] === 0) continue;
        const neighbors: number[] = [];
        if (x > 0 && binary[idx - 1] === 1) neighbors.push(labels[idx - 1]);
        if (y > 0 && binary[idx - width] === 1) neighbors.push(labels[idx - width]);
        if (neighbors.length === 0) {
          labels[idx] = nextLabel++;
        } else {
          const min = Math.min(...neighbors.filter((n) => n !== -1));
          labels[idx] = min;
          for (const n of neighbors) if (n !== -1 && n !== min) uf.union(min, n);
        }
      }
    }

    const remap = new Map<number, number>();
    let compact = 0;
    for (let i = 0; i < labels.length; i++) {
      if (labels[i] === -1) continue;
      const root = uf.find(labels[i]);
      if (!remap.has(root)) remap.set(root, compact++);
      labels[i] = remap.get(root)!;
    }

    const blobs: BlobRect[] = Array.from({ length: compact }, () => ({
      x: Infinity,
      y: Infinity,
      w: 0,
      h: 0,
      area: 0,
    }));

    const minX = new Array(compact).fill(Infinity);
    const minY = new Array(compact).fill(Infinity);
    const maxX = new Array(compact).fill(-Infinity);
    const maxY = new Array(compact).fill(-Infinity);
    const areas = new Array(compact).fill(0);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const l = labels[idx];
        if (l === -1) continue;
        areas[l]++;
        if (x < minX[l]) minX[l] = x;
        if (y < minY[l]) minY[l] = y;
        if (x > maxX[l]) maxX[l] = x;
        if (y > maxY[l]) maxY[l] = y;
      }
    }

    for (let i = 0; i < compact; i++) {
      if (areas[i] === 0) continue;
      blobs[i] = {
        x: minX[i],
        y: minY[i],
        w: maxX[i] - minX[i] + 1,
        h: maxY[i] - minY[i] + 1,
        area: areas[i],
      };
    }

    void labelMap;
    return blobs.filter((b) => b.area > 0);
  }

  private filterNoise(blobs: BlobRect[], totalPixels: number): BlobRect[] {
    return blobs.filter((b) => {
      if (b.area < this.config.minBlobAreaPx) return false;
      if (b.area > totalPixels * this.config.maxBlobAreaRatio) return false;
      return true;
    });
  }

  private groupIntoWords(blobs: BlobRect[]): BlobRect[] {
    if (blobs.length === 0) return [];
    const medianW = this.median(blobs.map((b) => b.w));
    const threshold = medianW * this.config.wordGapFactor;
    const uf = new UnionFind(blobs.length);

    const sorted = blobs
      .map((b, i) => ({ b, i }))
      .sort((a, b) => a.b.y - b.b.y || a.b.x - b.b.x);

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i].b;
        const b = sorted[j].b;
        if (Math.abs(a.y - b.y) > a.h * 2) break;
        const gap = b.x - (a.x + a.w);
        if (gap >= 0 && gap < threshold && Math.abs(a.y - b.y) < Math.max(a.h, b.h) * 0.5) {
          uf.union(sorted[i].i, sorted[j].i);
        }
      }
    }

    const groups = new Map<number, BlobRect[]>();
    for (let i = 0; i < blobs.length; i++) {
      const root = uf.find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(blobs[i]);
    }

    const chunks: BlobRect[] = [];
    for (const group of groups.values()) {
      const x = Math.min(...group.map((b) => b.x));
      const y = Math.min(...group.map((b) => b.y));
      const x2 = Math.max(...group.map((b) => b.x + b.w));
      const y2 = Math.max(...group.map((b) => b.y + b.h));
      chunks.push({ x, y, w: x2 - x, h: y2 - y, area: group.reduce((s, b) => s + b.area, 0) });
    }
    return chunks;
  }

  private detectLines(chunks: BlobRect[]): Array<BlobRect & { lineIndex: number }> {
    if (chunks.length === 0) return [];
    const medianH = this.median(chunks.map((c) => c.h));
    const sorted = [...chunks].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
    const lines: Array<BlobRect & { lineIndex: number }> = [];
    let currentLine = 0;
    let currentCenter = sorted[0].y + sorted[0].h / 2;

    for (const c of sorted) {
      const center = c.y + c.h / 2;
      if (Math.abs(center - currentCenter) > medianH * this.config.lineGroupFactor) {
        if (Math.abs(center - currentCenter) > medianH * 2) currentLine++;
        else if (lines.length > 0) {
          const lineMembers = lines.filter((l) => l.lineIndex === currentLine);
          const avgCenter = lineMembers.reduce((s, m) => s + m.y + m.h / 2, 0) / lineMembers.length;
          if (Math.abs(center - avgCenter) > medianH * this.config.lineGroupFactor) currentLine++;
        }
        currentCenter = center;
      }
      lines.push({ ...c, lineIndex: currentLine });
    }
    return lines;
  }

  private orderChunks(
    lines: Array<BlobRect & { lineIndex: number }>,
    direction: string,
    columns?: number,
  ): Array<BlobRect & { lineIndex: number }> {
    const byLine = new Map<number, Array<BlobRect & { lineIndex: number }>>();
    for (const c of lines) {
      if (!byLine.has(c.lineIndex)) byLine.set(c.lineIndex, []);
      byLine.get(c.lineIndex)!.push(c);
    }

    const result: Array<BlobRect & { lineIndex: number }> = [];
    const sortedLineIndices = [...byLine.keys()].sort((a, b) => a - b);

    if (columns && columns > 1) {
      const minX = Math.min(...lines.map((l) => l.x));
      const maxX = Math.max(...lines.map((l) => l.x + l.w));
      const colW = (maxX - minX) / columns;
      for (const li of sortedLineIndices) {
        const chunks = byLine.get(li)!;
        const byCol = new Map<number, typeof chunks>();
        for (const c of chunks) {
          const col = Math.min(columns - 1, Math.floor((c.x - minX) / colW));
          if (!byCol.has(col)) byCol.set(col, []);
          byCol.get(col)!.push(c);
        }
        for (const col of [...byCol.keys()].sort((a, b) => a - b)) {
          const colChunks = byCol.get(col)!;
          colChunks.sort((a, b) => (direction === 'rtl' ? b.x - a.x : a.x - b.x));
          result.push(...colChunks);
        }
      }
    } else {
      for (const li of sortedLineIndices) {
        const chunks = byLine.get(li)!;
        chunks.sort((a, b) => (direction === 'rtl' ? b.x + b.w - (a.x + a.w) : a.x - b.x));
        result.push(...chunks);
      }
    }
    return result;
  }

  private handlePunctuation(
    chunks: Array<BlobRect & { lineIndex: number }>,
    allBlobs: BlobRect[],
  ): Array<BlobRect & { lineIndex: number }> {
    if (this.config.punctuationStrategy === 'height-band') {
      return chunks;
    }
    const chunkSet = new Set(chunks as unknown as BlobRect[]);
    const smallBlobs = allBlobs.filter((b) => !chunkSet.has(b) && b.h < this.median(chunks.map((c) => c.h)) * this.config.punctuationMaxHeightRatio);
    for (const small of smallBlobs) {
      let nearest: (BlobRect & { lineIndex: number }) | null = null;
      let minDist = Infinity;
      for (const c of chunks) {
        const dx = Math.min(Math.abs(small.x - (c.x + c.w)), Math.abs(c.x - (small.x + small.w)));
        const dy = Math.abs(small.y + small.h / 2 - (c.y + c.h / 2));
        const dist = Math.hypot(dx, dy);
        const charW = c.w / 4;
        if (dx < charW * this.config.punctuationProximityFactor && dy < c.h * 0.5 && dist < minDist) {
          minDist = dist;
          nearest = c;
        }
      }
      if (nearest && this.isPunctuationShape(small)) {
        const x = Math.min(nearest.x, small.x);
        const y = Math.min(nearest.y, small.y);
        const x2 = Math.max(nearest.x + nearest.w, small.x + small.w);
        const y2 = Math.max(nearest.y + nearest.h, small.y + small.h);
        nearest.x = x;
        nearest.y = y;
        nearest.w = x2 - x;
        nearest.h = y2 - y;
      }
    }
    return chunks;
  }

  private isPunctuationShape(blob: BlobRect): boolean {
    const aspect = blob.w / blob.h;
    const fill = blob.area / (blob.w * blob.h);
    if (blob.area < 3) return false;
    if (aspect > 0.3 && aspect < 3 && fill > 0.3) return true;
    if (blob.h < 10 && blob.w < 10) return true;
    return false;
  }

  private median(values: number[]): number {
    if (values.length === 0) return 0;
    const s = [...values].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
  }
}
