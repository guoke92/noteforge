import { useEffect, useState } from "react";
import type * as monacoNs from "monaco-editor";
import { Languages, Sparkles, FileSearch, Edit3 } from "lucide-react";
import { useAIStore } from "@/store/ai";
import { Button } from "@/components/ui/Button";

interface Props {
  editor: monacoNs.editor.IStandaloneCodeEditor | null;
  /** Minimum character count for the toolbar to appear (default 50, per design). */
  threshold?: number;
}

const THRESHOLD_DEFAULT = 50;

/**
 * Floating contextual toolbar that appears above the current selection in the
 * Monaco editor when the user selects at least `threshold` characters.
 * The toolbar exposes the same quick actions as the AI panel.
 */
export function AIFloatingToolbar({ editor, threshold = THRESHOLD_DEFAULT }: Props) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [selectionText, setSelectionText] = useState("");
  const refine = useAIStore((s) => s.refineSelection);
  const summarize = useAIStore((s) => s.summarize);

  useEffect(() => {
    if (!editor) return;
    let raf = 0;

    const update = () => {
      const sel = editor.getSelection();
      if (!sel) {
        setPos(null);
        setSelectionText("");
        return;
      }
      const text = editor.getModel()?.getValueInRange(sel) || "";
      if (text.length < threshold || text.includes("\n\n")) {
        setPos(null);
        setSelectionText("");
        return;
      }
      setSelectionText(text);
      const dom = editor.getDomNode();
      if (!dom) return;
      const rect = dom.getBoundingClientRect();
      const coords = editor.getScrolledVisiblePosition(sel.getStartPosition());
      if (!coords) return;
      setPos({
        top: rect.top + coords.top - 38,
        left: rect.left + coords.left,
      });
    };

    const sub = editor.onDidChangeCursorSelection(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    });
    const scrollSub = editor.onDidScrollChange(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    });
    return () => {
      sub.dispose();
      scrollSub.dispose();
      cancelAnimationFrame(raf);
    };
  }, [editor, threshold]);

  if (!pos || !selectionText) return null;

  const run = (instruction: string) => {
    void refine(selectionText, instruction);
  };

  return (
    <div
      className="fixed z-50 flex items-center gap-1 rounded-md border border-border bg-bg-secondary/95 p-1 shadow-lg backdrop-blur"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <Button
        size="sm"
        variant="ghost"
        title="AI 精炼 (⌘⇧E)"
        onClick={() => run("对该段落进行精炼，去冗余但保留事实")}
      >
        <Sparkles size={11} /> 精炼
      </Button>
      <Button
        size="sm"
        variant="ghost"
        title="摘要"
        onClick={() => void summarize(selectionText)}
      >
        <FileSearch size={11} /> 摘要
      </Button>
      <Button
        size="sm"
        variant="ghost"
        title="改写更专业"
        onClick={() => run("用更专业、正式的语气改写")}
      >
        <Edit3 size={11} /> 改写
      </Button>
      <Button
        size="sm"
        variant="ghost"
        title="翻译为英文"
        onClick={() => run("翻译为流畅英文，保持术语一致")}
      >
        <Languages size={11} /> 翻译
      </Button>
    </div>
  );
}
