import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import type { Extensions } from "@tiptap/react";
import { BlockIdExtension } from "./block-id-extension";
import { RawMarkdownNode } from "./raw-markdown-node";
import { MarkdownImage } from "./markdown-image-extension";
import { MarkdownCodeBlock } from "./code-block-extension";
import { TableKeyboardExtension } from "./table-keyboard-extension";
import { BlockChromeExtension } from "./block-chrome-extension";
import { BlockSelectionExtension } from "./block-selection-extension";

export function createTiptapExtensions(options?: { placeholder?: string }): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      codeBlock: false,
      link: { openOnClick: false, autolink: true },
    }),
    MarkdownCodeBlock.configure({
      HTMLAttributes: { class: "md-tiptap-code" },
    }),
    Table.configure({ resizable: true, renderWrapper: true }),
    TableRow,
    TableHeader,
    TableCell,
    MarkdownImage.configure({ inline: false, allowBase64: true }),
    TaskList.configure({
      HTMLAttributes: { class: "md-task-list" },
    }),
    TaskItem.configure({
      nested: true,
      HTMLAttributes: { class: "md-task-item" },
    }),
    Placeholder.configure({
      placeholder: options?.placeholder ?? "输入 Markdown，或输入 / 使用命令…",
    }),
    BlockIdExtension,
    RawMarkdownNode,
    TableKeyboardExtension,
    BlockChromeExtension,
    BlockSelectionExtension,
  ];
}
