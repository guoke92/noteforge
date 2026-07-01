export function hashRaw(raw: string): string {
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

let blockCounter = 0;

export function newBlockId(): string {
  blockCounter += 1;
  return `blk_${blockCounter}_${Date.now().toString(36)}`;
}
