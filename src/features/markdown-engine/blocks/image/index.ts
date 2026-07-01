import type { ImageModel } from "../types";

const IMAGE_RE = /^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$/;

export function parseImageBlock(raw: string): ImageModel {
  const line = raw.trim();
  const match = IMAGE_RE.exec(line);
  return {
    type: "image",
    alt: match?.[1] ?? "",
    src: match?.[2] ?? "",
    title: match?.[3] ?? null,
  };
}

function escapeLabel(text: string): string {
  return text.replace(/]/g, "\\]");
}

function escapeTitle(text: string): string {
  return text.replace(/"/g, '\\"');
}

export function serializeImageBlock(model: ImageModel): string {
  const title = model.title ? ` "${escapeTitle(model.title)}"` : "";
  return `![${escapeLabel(model.alt)}](${model.src}${title})\n`;
}

export function imageModelsEqual(a: ImageModel, b: ImageModel): boolean {
  return a.alt === b.alt && a.src === b.src && a.title === b.title;
}

export function cloneImageModel(model: ImageModel): ImageModel {
  return { ...model };
}

export function isImageBlockRaw(raw: string): boolean {
  return IMAGE_RE.test(raw.trim());
}
