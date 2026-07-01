import { useCallback, useEffect, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEditorSurfaceContext } from "../editor/editor-surface-context";
import { loadMarkdownImageSrc } from "../editor/resolve-markdown-image-src";

export function ImageBlockView({
  node,
  selected,
  updateAttributes,
  editor,
  getPos,
}: NodeViewProps) {
  const { documentPath } = useEditorSurfaceContext();
  const [displaySrc, setDisplaySrc] = useState<string>("");
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const { src, alt, title, blockId } = node.attrs as {
    src: string;
    alt?: string;
    title?: string | null;
    blockId?: string | null;
  };

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setDisplaySrc("");

    void (async () => {
      const result = await loadMarkdownImageSrc(src, documentPath);
      if (cancelled) return;
      if (result.error && !/^(https?:|data:|blob:)/i.test(result.url)) {
        setStatus("error");
        setDisplaySrc(result.url);
        return;
      }
      setDisplaySrc(result.url);
    })();

    return () => {
      cancelled = true;
    };
  }, [src, documentPath]);

  const closePreview = useCallback(() => setPreviewOpen(false), []);

  const selectBlock = useCallback(() => {
    const pos = getPos();
    if (typeof pos === "number") editor.commands.setNodeSelection(pos);
  }, [editor, getPos]);

  return (
    <NodeViewWrapper
      as="figure"
      className={`md-image-block${selected ? " is-selected" : ""}${status === "error" ? " md-image-block--error" : ""}${status === "loading" ? " md-image-block--loading" : ""}`}
      data-block-id={blockId ?? undefined}
      contentEditable={false}
      onClick={(event: React.MouseEvent) => {
        if (event.detail === 1) selectBlock();
      }}
      onDoubleClick={(event: React.MouseEvent) => {
        event.preventDefault();
        if (status === "loaded" && displaySrc) setPreviewOpen(true);
      }}
    >
      <div className="md-block-handle" title="选中图片块" />
      {status === "error" ? (
        <div className="md-image-fallback" title={src}>
          图片无法加载
          {src ? <span className="md-image-fallback-src">{src}</span> : null}
        </div>
      ) : displaySrc ? (
        <img
          src={displaySrc}
          alt={alt ?? ""}
          title={title ?? undefined}
          className="md-image"
          draggable={false}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
        />
      ) : (
        <div className="md-image-fallback">加载中…</div>
      )}

      {alt ? <figcaption className="md-image-caption">{alt}</figcaption> : null}

      {selected ? (
        <div className="md-image-meta" contentEditable={false}>
          {editingTitle ? (
            <input
              className="md-image-title-input"
              defaultValue={title ?? ""}
              placeholder="图片标题 (title)"
              autoFocus
              onBlur={(event) => {
                updateAttributes({ title: event.target.value.trim() || null });
                setEditingTitle(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  setEditingTitle(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="md-image-title-btn"
              onClick={() => setEditingTitle(true)}
            >
              {title ? `标题: ${title}` : "添加标题"}
            </button>
          )}
        </div>
      ) : null}

      {previewOpen && displaySrc && status === "loaded" ? (
        <div
          className="md-image-lightbox"
          role="dialog"
          aria-label="图片预览"
          onClick={closePreview}
        >
          <img src={displaySrc} alt={alt ?? ""} className="md-image-lightbox-img" />
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}
