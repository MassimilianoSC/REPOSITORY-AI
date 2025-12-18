export function makeChunks(text: string, size = 1000, overlap = 150): string[] {
  const clean = text.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const chunks: string[] = [];
  let i = 0;

  while (i < clean.length) {
    const end = Math.min(clean.length, i + size);
    chunks.push(clean.slice(i, end));
    i = end - overlap;
    if (i < 0) i = 0;
  }

  return chunks;
}

