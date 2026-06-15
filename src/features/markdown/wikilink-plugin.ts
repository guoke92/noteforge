import { $nodeSchema, $prose, $remark } from "@milkdown/kit/utils";
import { Plugin } from "@milkdown/kit/prose/state";
import type { Ctx } from "@milkdown/kit/ctx";
import { visit } from "unist-util-visit";
import { collectMarkdownNotes, resolveWikiTargetName } from "@/lib/wiki-resolve";
import { useWorkspaceStore } from "@/store/workspace";
import { useEditorStore } from "@/store/editor";

interface WikiLinkMdast {
  type: "wikiLink";
  value: string;
}

function remarkWikiLink() {
  return (tree: Parameters<typeof visit>[0]) => {
    visit(tree, "text", (node, index, parent) => {
      if (!parent || index == null || typeof index !== "number") return;
      if (typeof node !== "object" || node == null || !("value" in node)) return;

      const value = String((node as { value: string }).value);
      const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
      let match: RegExpExecArray | null;
      let lastIndex = 0;
      const nodes: Array<{ type: string; value: string }> = [];

      while ((match = regex.exec(value))) {
        if (match.index > lastIndex) {
          nodes.push({ type: "text", value: value.slice(lastIndex, match.index) });
        }
        nodes.push({ type: "wikiLink", value: match[1]!.trim() });
        lastIndex = match.index + match[0].length;
      }

      if (nodes.length === 0) return;
      if (lastIndex < value.length) {
        nodes.push({ type: "text", value: value.slice(lastIndex) });
      }
      (parent as { children: unknown[] }).children.splice(index, 1, ...nodes);
    });
  };
}

export const wikiLinkSchema = $nodeSchema("wiki_link", () => ({
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  attrs: {
    label: { default: "", validate: "string" },
  },
  parseDOM: [
    {
      tag: "span[data-wiki-link]",
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return false;
        return { label: dom.dataset.wikiLink ?? "" };
      },
    },
  ],
  toDOM: (node) => {
    const label = node.attrs.label as string;
    return [
      "span",
      { "data-wiki-link": label, class: "nf-wiki-link" },
      `[[${label}]]`,
    ];
  },
  parseMarkdown: {
    match: (node) => node.type === "wikiLink",
    runner: (state, node, type) => {
      const label = String((node as unknown as WikiLinkMdast).value ?? "");
      state.addNode(type, { label });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "wiki_link",
    runner: (state, node) => {
      state.addNode("wikiLink", undefined, undefined, { value: node.attrs.label });
    },
  },
}));

export const wikiLinkRemark = $remark("wiki-link-remark", () => remarkWikiLink);

function openWikiTarget(label: string): void {
  const tree = useWorkspaceStore.getState().tree;
  const notes = collectMarkdownNotes(tree);
  const { path } = resolveWikiTargetName(label, notes);
  if (path) void useEditorStore.getState().openFile(path);
}

export const wikiLinkClickPlugin = $prose((_ctx: Ctx) => {
  return new Plugin({
    props: {
      handleClickOn(_view, _pos, node) {
        if (node.type.name !== "wiki_link") return false;
        const label = node.attrs.label as string;
        if (!label) return false;
        openWikiTarget(label);
        return true;
      },
    },
  });
});

export const wikiLinkPlugins = [wikiLinkSchema, wikiLinkRemark, wikiLinkClickPlugin];
