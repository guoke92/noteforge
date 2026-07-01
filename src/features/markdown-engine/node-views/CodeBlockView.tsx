import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { CODE_LANGUAGES, codeLanguageLabel } from "../editor/code-languages";

export function CodeBlockView({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
  const language = (node.attrs.language as string | null) ?? "";
  const blockId = node.attrs.blockId as string | null | undefined;

  const selectBlock = () => {
    const pos = getPos();
    if (typeof pos === "number") editor.commands.setNodeSelection(pos);
  };

  return (
    <NodeViewWrapper
      className={`md-code-block${selected ? " is-selected" : ""}`}
      data-language={language || "plaintext"}
      data-block-id={blockId ?? undefined}
    >
      <div
        className="md-block-handle"
        contentEditable={false}
        title="选中代码块"
        onClick={selectBlock}
      />
      <select
        className="md-code-lang-select"
        contentEditable={false}
        value={language}
        aria-label="代码语言"
        onChange={(event) => {
          updateAttributes({ language: event.target.value });
          editor.commands.focus();
        }}
      >
        {CODE_LANGUAGES.map((lang) => (
          <option key={lang.id || "plain"} value={lang.id}>
            {lang.label}
          </option>
        ))}
        {language && !CODE_LANGUAGES.some((lang) => lang.id === language) ? (
          <option value={language}>{codeLanguageLabel(language)}</option>
        ) : null}
      </select>
      {selected ? (
        <button
          type="button"
          className="md-block-delete-btn md-code-delete-btn"
          contentEditable={false}
          title="删除代码块"
          onClick={() => editor.chain().focus().deleteNode("codeBlock").run()}
        >
          ×
        </button>
      ) : null}
      <pre className="md-code-block-pre">
        <NodeViewContent as="div" className="md-code-block-body" />
      </pre>
    </NodeViewWrapper>
  );
}
