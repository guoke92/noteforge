import type { JSONContent } from "@tiptap/react";
import { newBlockId } from "../../source/hash";
import type { BlockModel } from "../../blocks/types";
import {
  isUnknownBlock,
  type EditorBlock,
  type EditorDocument,
  type EditorSegment,
} from "../schema";
import { inlineModelToJson, jsonToInlineModel } from "./inline-bridge";
import { sanitizeTiptapJson } from "./sanitize-content";
import { listModelToTiptapJson, tiptapListToModel } from "./list-bridge";
import type { TableAlign } from "../../blocks/types";

function withInlineContent(inline: ReturnType<typeof inlineModelToJson>): Pick<JSONContent, "content"> {
  return inline ? { content: inline } : {};
}

function cellAlignAttr(align: TableAlign | undefined): Pick<JSONContent, "attrs"> {
  return align && align !== "none" ? { attrs: { align } } : {};
}

function blockModelToJson(block: EditorBlock): JSONContent | null {
  const { id, model } = block;
  if (isUnknownBlock(model)) {
    return {
      type: "rawMarkdown",
      attrs: { raw: model.raw, blockId: id },
    };
  }

  const attrs = { blockId: id };

  switch (model.type) {
    case "heading":
      return {
        type: "heading",
        attrs: { level: model.level, ...attrs },
        ...withInlineContent(inlineModelToJson(model.content)),
      };
    case "paragraph":
      return {
        type: "paragraph",
        attrs,
        ...withInlineContent(inlineModelToJson(model.content)),
      };
    case "code":
      return {
        type: "codeBlock",
        attrs: { language: model.language || null, ...attrs },
        content: model.content ? [{ type: "text", text: model.content }] : [],
      };
    case "blockquote": {
      const inline = inlineModelToJson({ nodes: [{ type: "text", text: model.content }] });
      return {
        type: "blockquote",
        attrs,
        content: [
          {
            type: "paragraph",
            ...withInlineContent(inline),
          },
        ],
      };
    }
    case "hr":
      return { type: "horizontalRule", attrs };
    case "image":
      return {
        type: "image",
        attrs: {
          src: model.src,
          alt: model.alt,
          title: model.title,
          ...attrs,
        },
      };
    case "list":
      return listModelToTiptapJson(model, attrs);
    case "table": {
      const headerCells = model.header.cells.map((cell, colIndex) => ({
        type: "tableHeader",
        ...cellAlignAttr(model.align[colIndex]),
        content: [{ type: "paragraph", ...withInlineContent(inlineModelToJson(cell.content)) }],
      }));
      const bodyRows = model.rows.map((row) => ({
        type: "tableRow",
        content: row.cells.map((cell, colIndex) => ({
          type: "tableCell",
          ...cellAlignAttr(model.align[colIndex]),
          content: [{ type: "paragraph", ...withInlineContent(inlineModelToJson(cell.content)) }],
        })),
      }));
      return {
        type: "table",
        attrs,
        content: [
          { type: "tableRow", content: headerCells },
          ...bodyRows,
        ],
      };
    }
    default:
      return null;
  }
}

export function editorDocumentToTiptapJson(doc: EditorDocument): JSONContent {
  const content: JSONContent[] = [];
  for (const segment of doc.segments) {
    if (segment.kind === "raw") {
      content.push({
        type: "rawMarkdown",
        attrs: { raw: segment.raw, blockId: newBlockId() },
      });
      continue;
    }
    const node = blockModelToJson(segment.block);
    if (node) content.push(node);
  }
  if (content.length === 0) {
    content.push({
      type: "paragraph",
      attrs: { blockId: newBlockId() },
    });
  }
  return sanitizeTiptapJson({ type: "doc", content });
}

function jsonNodeToBlockModel(node: JSONContent): BlockModel | null {
  const blockId = (node.attrs?.blockId as string) ?? newBlockId();

  switch (node.type) {
    case "heading":
      return {
        type: "heading",
        level: (node.attrs?.level as 1 | 2 | 3 | 4 | 5 | 6) ?? 1,
        content: jsonToInlineModel(node.content),
      };
    case "paragraph":
      return {
        type: "paragraph",
        content: jsonToInlineModel(node.content),
      };
    case "codeBlock":
      return {
        type: "code",
        language: (node.attrs?.language as string) ?? "",
        content: node.content?.map((c) => c.text ?? "").join("") ?? "",
      };
    case "blockquote": {
      const para = node.content?.[0];
      const text =
        para?.content?.map((c) => c.text ?? "").join("") ??
        jsonToInlineModel(para?.content).nodes
          .map((n) => (n.type === "text" ? n.text : ""))
          .join("");
      return { type: "blockquote", content: text };
    }
    case "horizontalRule":
      return { type: "hr" };
    case "image":
      return {
        type: "image",
        src: (node.attrs?.src as string) ?? "",
        alt: (node.attrs?.alt as string) ?? "",
        title: (node.attrs?.title as string) ?? null,
      };
    case "bulletList":
    case "orderedList":
    case "taskList":
      return tiptapListToModel(node);
    case "table": {
      const rows = node.content ?? [];
      const headerRow = rows[0];
      const headerCells =
        headerRow?.content?.map((cell) => ({
          content: jsonToInlineModel(cell.content?.[0]?.content),
        })) ?? [];
      const align =
        headerRow?.content?.map((cell) => {
          const value = cell.attrs?.align as TableAlign | null | undefined;
          return value ?? "none";
        }) ?? [];
      const bodyRows = rows.slice(1).map((row) => ({
        cells:
          row.content?.map((cell) => ({
            content: jsonToInlineModel(cell.content?.[0]?.content),
          })) ?? [],
      }));
      return {
        type: "table",
        header: { cells: headerCells },
        align,
        rows: bodyRows,
      };
    }
    default:
      void blockId;
      return null;
  }
}

export function tiptapJsonToEditorDocument(json: JSONContent): EditorDocument {
  const segments: EditorSegment[] = [];
  for (const node of json.content ?? []) {
    if (node.type === "rawMarkdown") {
      segments.push({ kind: "raw", raw: (node.attrs?.raw as string) ?? "" });
      continue;
    }
    const model = jsonNodeToBlockModel(node);
    if (!model) continue;
    const blockId = (node.attrs?.blockId as string) ?? newBlockId();
    segments.push({ kind: "block", block: { id: blockId, model } });
  }
  return { version: 1, segments };
}
