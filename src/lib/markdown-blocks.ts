export interface MarkdownBlock {
  startLine: number;
  endLine: number;
  text: string;
}

function isBlockStart(line: string): boolean {
  return (
    /^#{1,6}\s/.test(line) ||
    /^```/.test(line) ||
    /^>\s/.test(line) ||
    /^[-*+]\s/.test(line) ||
    /^\d+\.\s/.test(line) ||
    /^-{3,}$/.test(line.trim()) ||
    /^\*{3,}$/.test(line.trim())
  );
}

/** Split markdown body (without front matter) into blocks with 1-based line ranges. */
export function splitMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.split("\n");
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const startLine = i + 1;
    const line = lines[i] ?? "";

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (line.startsWith("```")) {
      let j = i + 1;
      while (j < lines.length && !lines[j]!.startsWith("```")) j++;
      if (j < lines.length) j++;
      blocks.push({
        startLine,
        endLine: j,
        text: lines.slice(i, j).join("\n"),
      });
      i = j;
      continue;
    }

    if (isBlockStart(line)) {
      blocks.push({ startLine, endLine: i + 1, text: line });
      i++;
      continue;
    }

    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j] ?? "";
      if (next.trim() === "" || isBlockStart(next)) break;
      j++;
    }
    blocks.push({
      startLine,
      endLine: j,
      text: lines.slice(i, j).join("\n"),
    });
    i = j;
  }

  return blocks;
}

export function findBlockForLine(blocks: MarkdownBlock[], line: number): MarkdownBlock | undefined {
  return blocks.find((b) => line >= b.startLine && line <= b.endLine);
}
