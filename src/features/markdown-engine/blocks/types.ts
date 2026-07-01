export type BlockType =
  | "heading"
  | "paragraph"
  | "table"
  | "list"
  | "code"
  | "image"
  | "blockquote"
  | "hr";

export type BlockModel =
  | HeadingModel
  | ParagraphModel
  | TableModel
  | ListModel
  | CodeModel
  | ImageModel
  | BlockquoteModel
  | HrModel;

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "strong"; children: InlineNode[] }
  | { type: "em"; children: InlineNode[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: InlineNode[] };

export type InlineModel = {
  nodes: InlineNode[];
};

export type HeadingModel = {
  type: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  content: InlineModel;
};

export type ParagraphModel = {
  type: "paragraph";
  content: InlineModel;
};

export type TableAlign = "left" | "center" | "right" | "none";

export type TableCell = {
  content: InlineModel;
};

export type TableRow = {
  cells: TableCell[];
};

export type TableModel = {
  type: "table";
  header: TableRow;
  align: TableAlign[];
  rows: TableRow[];
};

export type ListItemModel = {
  indent: number;
  ordered: boolean;
  checked: boolean | null;
  content: InlineModel;
};

export type ListModel = {
  type: "list";
  items: ListItemModel[];
};

export type CodeModel = {
  type: "code";
  language: string;
  content: string;
};

export type ImageModel = {
  type: "image";
  alt: string;
  src: string;
  title: string | null;
};

export type BlockquoteModel = {
  type: "blockquote";
  content: string;
};

export type HrModel = {
  type: "hr";
};
