import type { EditorTab } from "@/store/editor";
import { MonacoEditor } from "./MonacoEditor";

interface Props {
  tab: EditorTab;
}

/** Generic Monaco surface for code and plain-text documents. */
export function MonacoCodeSurface({ tab }: Props) {
  return <MonacoEditor tab={tab} hostSurfaceMode="source" />;
}
