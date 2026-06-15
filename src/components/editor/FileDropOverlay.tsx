import { FileDown } from "lucide-react";

interface Props {
  active: boolean;
}

export function FileDropOverlay({ active }: Props) {
  if (!active) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-accent/10 backdrop-blur-[1px]"
      aria-hidden
    >
      <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-accent bg-bg-primary/90 px-8 py-6 shadow-lg">
        <FileDown className="text-accent" size={32} />
        <div className="text-base font-medium text-text-primary">松手打开</div>
        <div className="text-sm text-text-secondary">
          拖入文件打开笔记 · 拖入文件夹打开知识库
        </div>
      </div>
    </div>
  );
}
