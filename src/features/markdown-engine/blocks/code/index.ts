import type { CodeModel } from "../types";

const FENCE_RE = /^(`{3,}|~{3,})(.*)$/;

export function parseCodeBlock(raw: string): CodeModel {
  const lines = raw.split("\n");
  const first = lines[0] ?? "";
  const fence = FENCE_RE.exec(first);
  const language = fence?.[2]?.trim() ?? "";
  const marker = fence?.[1]?.[0] ?? "`";
  const fenceLength = fence?.[1]?.length ?? 3;
  const closeIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim().startsWith(marker.repeat(fenceLength)),
  );
  const contentLines =
    closeIndex >= 0 ? lines.slice(1, closeIndex) : lines.slice(1).filter((line) => line !== "");

  return {
    type: "code",
    language,
    content: contentLines.join("\n"),
  };
}

export function serializeCodeBlock(model: CodeModel): string {
  const info = model.language.trim();
  const body = model.content.replace(/\n*$/, "");
  return `\`\`\`${info}\n${body}\n\`\`\`\n`;
}

export function codeModelsEqual(a: CodeModel, b: CodeModel): boolean {
  return a.language === b.language && a.content === b.content;
}

export function cloneCodeModel(model: CodeModel): CodeModel {
  return { ...model };
}

export function isCodeBlockRaw(raw: string): boolean {
  return FENCE_RE.test(raw.split("\n")[0] ?? "");
}
