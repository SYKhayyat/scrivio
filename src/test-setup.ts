import '@testing-library/jest-dom/vitest';

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as Record<string, unknown>).ResizeObserver = RO;

if (!globalThis.URL.createObjectURL) {
  (globalThis.URL as unknown as Record<string, unknown>).createObjectURL = () => 'blob:test';
  (globalThis.URL as unknown as Record<string, unknown>).revokeObjectURL = () => {};
}

if (!HTMLCanvasElement.prototype.getContext) {
  (HTMLCanvasElement.prototype as unknown as Record<string, unknown>).getContext = () => ({
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    drawImage() {},
    save() {},
    restore() {},
    translate() {},
    scale() {},
    setTransform() {},
    fillText() {},
    measureText: () => ({ width: 50 }),
  });
} else {
  const orig = HTMLCanvasElement.prototype.getContext as unknown as (...a: unknown[]) => unknown;
  // @ts-ignore
  HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
    if (type === '2d') {
      return {
        clearRect() {},
        fillRect() {},
        strokeRect() {},
        drawImage() {},
        save() {},
        restore() {},
        translate() {},
        scale() {},
        setTransform() {},
        fillText() {},
        measureText: () => ({ width: 50 }),
        canvas: this,
      } as unknown as CanvasRenderingContext2D;
    }
    return (orig as unknown as (t: string, ...a: unknown[]) => unknown).call(this, type, ...args) as CanvasRenderingContext2D;
  };
}
