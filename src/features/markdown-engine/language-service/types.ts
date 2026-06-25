export interface OutlineNode {
  level: number;
  text: string;
  /** 1-based line in canonical markdown. */
  line: number;
}

export interface WikiLinkRef {
  label: string;
  line: number;
  column: number;
}

export interface MarkdownDoc {
  content: string;
  frontMatter: Record<string, unknown> | null;
  body: string;
  outline: OutlineNode[];
  wikiLinks: WikiLinkRef[];
}
