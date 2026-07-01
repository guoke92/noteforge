import type { InlineModel, InlineNode } from "./types";

const INLINE_TOKEN_RE =
  /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|(?<!\*)\*([^*]+)\*(?!\*))/g;

export function parseInlineMarkdown(text: string): InlineModel {
  const nodes: InlineNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  INLINE_TOKEN_RE.lastIndex = 0;

  while ((match = INLINE_TOKEN_RE.exec(text))) {
    const index = match.index;
    if (index > last) {
      nodes.push({ type: "text", text: text.slice(last, index) });
    }

    if (match[2] !== undefined) {
      nodes.push({ type: "strong", children: [{ type: "text", text: match[2] }] });
    } else if (match[3] !== undefined) {
      nodes.push({ type: "code", text: match[3] });
    } else if (match[4] !== undefined && match[5] !== undefined) {
      nodes.push({
        type: "link",
        href: match[5],
        children: [{ type: "text", text: match[4] }],
      });
    } else if (match[6] !== undefined) {
      nodes.push({ type: "em", children: [{ type: "text", text: match[6] }] });
    }

    last = index + match[0].length;
  }

  if (last < text.length) {
    nodes.push({ type: "text", text: text.slice(last) });
  }

  if (nodes.length === 0) {
    nodes.push({ type: "text", text: "" });
  }

  return { nodes };
}

export function inlineToPlainText(model: InlineModel): string {
  return model.nodes.map(inlineNodeToPlain).join("");
}

function inlineNodeToPlain(node: InlineNode): string {
  switch (node.type) {
    case "text":
      return node.text;
    case "code":
      return node.text;
    case "strong":
    case "em":
    case "link":
      return node.children.map(inlineNodeToPlain).join("");
    default:
      return "";
  }
}

export function serializeInlineMarkdown(model: InlineModel): string {
  return model.nodes.map(serializeInlineNode).join("");
}

function serializeInlineNode(node: InlineNode): string {
  switch (node.type) {
    case "text":
      return escapePlainText(node.text);
    case "strong":
      return `**${node.children.map(serializeInlineNode).join("")}**`;
    case "em":
      return `*${node.children.map(serializeInlineNode).join("")}*`;
    case "code":
      return `\`${node.text.replace(/`/g, "\\`")}\``;
    case "link":
      return `[${node.children.map(serializeInlineNode).join("")}](${node.href})`;
    default:
      return "";
  }
}

function escapePlainText(text: string): string {
  return text.replace(/([\\`*_[\]])/g, "\\$1");
}

export function cloneInlineModel(model: InlineModel): InlineModel {
  return JSON.parse(JSON.stringify(model)) as InlineModel;
}

export function inlineModelsEqual(a: InlineModel, b: InlineModel): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
