export function uid(): string {
  return crypto.randomUUID();
}

export function chunkId(): string {
  return `chunk-${crypto.randomUUID()}`;
}

export function typedWordId(): string {
  return `typed-${crypto.randomUUID()}`;
}
