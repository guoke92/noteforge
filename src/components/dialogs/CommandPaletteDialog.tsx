import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { useUIStore } from "@/store/ui";
import { getCore } from "@/core/runtime";
import { formatChord } from "@/core/command/keybinding";
import { COMMAND_CATEGORIES } from "@/core/command/command-registry.impl";

export function CommandPaletteDialog() {
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(() => {
    if (!open) return [];
    return getCore().commands.list({ query });
  }, [open, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const runSelected = async (index: number) => {
    const item = results[index];
    if (!item) return;
    setOpen(false);
    await getCore().commands.execute(item.id);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen} size="lg" title="命令面板" showClose>
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-md border border-border bg-bg-secondary px-3 py-2">
          <Search size={16} className="text-text-secondary" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                void runSelected(activeIndex);
              }
            }}
            placeholder="输入命令名称…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-tertiary"
          />
        </div>

        <ul className="max-h-72 overflow-y-auto rounded-md border border-border">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-text-tertiary">无匹配命令</li>
          ) : (
            results.map((item, index) => {
              const chord = item.keybindings?.[0]?.chord;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                      index === activeIndex ? "bg-accent/15 text-text-primary" : "hover:bg-bg-tertiary"
                    }`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => void runSelected(index)}
                  >
                    <span>
                      <span className="font-medium">{item.title}</span>
                      <span className="ml-2 text-xs text-text-tertiary">
                        {COMMAND_CATEGORIES[item.category]}
                      </span>
                    </span>
                    {chord ? (
                      <kbd className="rounded border border-border bg-bg-secondary px-1.5 py-0.5 font-mono text-xs text-text-secondary">
                        {formatChord(chord)}
                      </kbd>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </Dialog>
  );
}
