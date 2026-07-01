import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { GripVertical, X } from "lucide-react";

const BLOCK_SELECTOR =
  "blockquote, .md-code-block, .tableWrapper, ul, ol, figure.md-image-block, hr";

type BlockInfo = {
  element: HTMLElement;
  type: "code" | "table" | "list" | "blockquote" | "image" | "hr" | "other";
  rect: DOMRect;
};

function detectBlock(element: HTMLElement): BlockInfo["type"] {
  if (element.matches("blockquote")) return "blockquote";
  if (element.matches(".md-code-block")) return "code";
  if (element.matches(".tableWrapper")) return "table";
  if (element.matches("ul, ol")) return "list";
  if (element.matches("figure.md-image-block")) return "image";
  if (element.matches("hr")) return "hr";
  return "other";
}

function isBlockSelected(editor: Editor, info: BlockInfo): boolean {
  const { selection } = editor.state;
  if (selection.empty) return false;
  if (editor.isActive("image") && info.type === "image") return true;
  if (editor.isActive("codeBlock") && info.type === "code") return true;
  if (editor.isActive("table") && info.type === "table") return true;
  if (editor.isActive("blockquote") && info.type === "blockquote") return true;
  if ((editor.isActive("bulletList") || editor.isActive("orderedList")) && info.type === "list") {
    return true;
  }
  return false;
}

function findBlockInfo(view: HTMLElement): BlockInfo | null {
  const active = view.querySelector(".md-block-active");
  if (!(active instanceof HTMLElement)) return null;
  const rect = active.getBoundingClientRect();
  return { element: active, type: detectBlock(active), rect };
}

export function BlockHoverActions({ editor }: { editor: Editor }) {
  const [info, setInfo] = useState<BlockInfo | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const view = editor.view.dom;
    setContainer(view);
    if (!(view instanceof HTMLElement)) return;

    const sync = () => {
      const next = findBlockInfo(view);
      if (!next) {
        setInfo(null);
        return;
      }
      const rect = next.element.getBoundingClientRect();
      setInfo({ ...next, rect });
    };

    sync();
    editor.on("selectionUpdate", sync);
    editor.on("transaction", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      editor.off("selectionUpdate", sync);
      editor.off("transaction", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [editor]);

  if (!info || !container) return null;
  if (!isBlockSelected(editor, info)) return null;

  const containerRect = container.getBoundingClientRect();
  const top = info.rect.top - containerRect.top;
  const right = containerRect.right - info.rect.right;

  return createPortal(
    <div
      className="md-block-actions"
      style={{ top, right }}
      contentEditable={false}
    >
      <button
        type="button"
        className="md-block-action-handle"
        title="拖动以移动块"
        onMouseDown={(event) => {
          event.preventDefault();
          startDrag(editor, info.element);
        }}
      >
        <GripVertical size={14} />
      </button>
      <button
        type="button"
        className="md-block-action-delete"
        title="删除块"
        onClick={() => deleteBlock(editor, info.type)}
      >
        <X size={14} />
      </button>
    </div>,
    container,
  );
}

function startDrag(editor: Editor, element: HTMLElement): void {
  const startY = element.getBoundingClientRect().top;
  const placeholder = document.createElement("div");
  placeholder.className = "md-block-drag-placeholder";
  element.parentElement?.insertBefore(placeholder, element);

  const onMove = (event: MouseEvent) => {
    const offset = event.clientY - startY;
    placeholder.style.minHeight = `${Math.max(20, element.offsetHeight)}px`;
    element.style.transform = `translateY(${offset}px)`;
  };

  const onUp = (event: MouseEvent) => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    element.style.transform = "";
    placeholder.remove();
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const block = target?.closest(BLOCK_SELECTOR);
    if (block instanceof HTMLElement && block !== element) {
      const pos = editor.view.posAtDOM(block, 0);
      if (typeof pos === "number") {
        const tr = editor.state.tr;
        const insertAt = Math.min(pos, tr.doc.content.size);
        tr.insert(insertAt, tr.doc.slice(0).content);
        tr.setSelection(TextSelection.create(tr.doc, insertAt));
        editor.view.dispatch(tr);
      }
    }
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function deleteBlock(editor: Editor, type: BlockInfo["type"]): void {
  switch (type) {
    case "code":
      editor.chain().focus().deleteNode("codeBlock").run();
      return;
    case "table":
      editor.chain().focus().deleteTable().run();
      return;
    case "blockquote":
      editor.chain().focus().deleteNode("blockquote").run();
      return;
    case "list":
      editor.chain().focus().clearNodes().run();
      return;
    case "image":
      editor.chain().focus().deleteNode("image").run();
      return;
    case "hr":
      editor.chain().focus().deleteNode("horizontalRule").run();
      return;
    default:
      return;
  }
}
