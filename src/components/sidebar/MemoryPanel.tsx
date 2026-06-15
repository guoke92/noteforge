import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, Filter, List, Plus, Trash2, AlignLeft } from "lucide-react";
import type { Agent, MemoryEntry } from "@/types";
import { memory } from "@/ipc";
import { Button } from "@/components/ui/Button";
import { useUIStore } from "@/store/ui";
import { useEditorStore } from "@/store/editor";
import { formatRelative } from "@/lib/utils";

type SortKey = "time" | "importance";
type ViewMode = "list" | "timeline";

export function MemoryPanel() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | "all">("all");
  const [sort, setSort] = useState<SortKey>("time");
  const [view, setView] = useState<ViewMode>("timeline");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const setNewMemoryOpen = useUIStore((s) => s.setNewMemoryOpen);
  const setImportWizardOpen = useUIStore((s) => s.setImportWizardOpen);

  const reload = async () => {
    const [a, list] = await Promise.all([memory.listAgents(), memory.list()]);
    setAgents(a);
    setMemories(list);
  };

  useEffect(() => {
    void reload();
  }, []);

  const filtered = memories
    .filter((m) => (activeAgent === "all" ? true : m.agentId === activeAgent))
    .sort((a, b) =>
      sort === "time"
        ? b.updatedAt.localeCompare(a.updatedAt)
        : (b.importance || 0) - (a.importance || 0),
    );

  const timelineGroups = useMemo(() => bucketByDate(filtered), [filtered]);

  const toggle = (id: string) =>
    setSelected((curr) => {
      const next = new Set(curr);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-2 pb-2 pt-1.5">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-medium uppercase tracking-wider text-text-secondary">
            Agent 记忆管理
          </div>
          <Button size="icon" variant="ghost" title="导入" onClick={() => setImportWizardOpen(true)}>
            <Plus size={13} />
          </Button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <AgentCard
            label="全部"
            count={memories.length}
            active={activeAgent === "all"}
            onClick={() => setActiveAgent("all")}
          />
          {agents.map((a) => (
            <AgentCard
              key={a.id}
              label={a.name}
              count={a.memoryCount}
              hint={a.lastUpdated ? formatRelative(a.lastUpdated) : undefined}
              color={a.color}
              active={activeAgent === a.id}
              onClick={() => setActiveAgent(a.id)}
            />
          ))}
          <button
            onClick={() => setImportWizardOpen(true)}
            className="flex h-[56px] w-[64px] shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-xs text-text-secondary hover:bg-bg-tertiary"
          >
            <Plus size={14} />
            导入
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-border px-2 py-1.5 text-xs text-text-secondary">
        <div>全部记忆 ({filtered.length} 条)</div>
        <div className="flex items-center gap-1">
          <ViewToggle view={view} onChange={setView} />
          <Filter size={11} />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="border-none bg-transparent text-xs text-text-primary focus:outline-none"
          >
            <option value="time">时间</option>
            <option value="importance">重要度</option>
          </select>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center justify-between border-b border-border bg-bg-secondary px-2 py-1.5 text-xs">
          <span>已选择 {selected.size} 项</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const tag = window.prompt("批量加标签 (逗号分隔)", "重要");
                if (!tag) return;
                await memory.batchTag(
                  Array.from(selected),
                  tag.split(",").map((t) => t.trim()).filter(Boolean),
                );
                setSelected(new Set());
                await reload();
              }}
            >
              加标签
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                if (!confirm(`删除 ${selected.size} 项记忆?`)) return;
                await memory.batchDelete(Array.from(selected));
                setSelected(new Set());
                await reload();
              }}
            >
              <Trash2 size={12} /> 删除
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
              取消
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center text-xs text-text-tertiary">
            <CalendarClock size={28} />
            <div>尚未导入 Agent 记忆</div>
            <div>连接 Agent 后即可管理其记忆</div>
            <Button variant="outline" onClick={() => setImportWizardOpen(true)}>
              导入 Agent 记忆
            </Button>
          </div>
        ) : view === "list" ? (
          filtered.map((m) => (
            <MemoryItem
              key={m.id}
              memory={m}
              selected={selected.has(m.id)}
              onToggle={() => toggle(m.id)}
            />
          ))
        ) : (
          <TimelineView groups={timelineGroups} selected={selected} onToggle={toggle} />
        )}
      </div>

      <div className="border-t border-border p-2">
        <Button className="w-full" variant="primary" onClick={() => setNewMemoryOpen(true)}>
          + 新建记忆
        </Button>
      </div>
    </div>
  );
}

function AgentCard({
  label,
  count,
  active,
  hint,
  color,
  onClick,
}: {
  label: string;
  count: number;
  active?: boolean;
  hint?: string;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-[56px] w-[88px] shrink-0 flex-col items-start justify-center gap-1 rounded-md border px-2 text-left text-xs transition-colors ${
        active ? "border-accent bg-bg-tertiary" : "border-border hover:bg-bg-tertiary"
      }`}
    >
      <div className="flex w-full items-center gap-1.5">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: color || "var(--color-accent)" }}
        />
        <span className="truncate font-medium text-text-primary">{label}</span>
      </div>
      <div className="text-text-secondary">{count} 条</div>
      {hint && <div className="text-[10px] text-text-tertiary">{hint}</div>}
    </button>
  );
}

function MemoryItem({
  memory,
  selected,
  onToggle,
}: {
  memory: MemoryEntry;
  selected: boolean;
  onToggle: () => void;
}) {
  const openFile = useEditorStore((s) => s.openFile);

  return (
    <div
      className={`group flex cursor-pointer items-start gap-2 border-b border-border/60 px-2 py-2 text-sm transition-colors hover:bg-bg-tertiary ${
        selected ? "bg-bg-tertiary" : ""
      }`}
      onClick={() => {
        // Open synthetic memory file
        const path = `/MemLab/memories/${memory.agentName?.toLowerCase()}/${memory.id}.md`;
        void openFile(path).catch(() => {});
      }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`mt-1 flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border ${
          selected ? "border-accent bg-accent text-white" : "border-border bg-transparent"
        }`}
      >
        {selected && <Check size={9} />}
      </button>
      <div className="flex-1 overflow-hidden">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-text-secondary">{memory.agentName}</span>
          <span className="text-xs text-text-tertiary">·</span>
          <span className="text-xs text-text-tertiary">{memory.type}</span>
        </div>
        <div className="truncate font-medium text-text-primary">{memory.title}</div>
        <div className="truncate text-xs text-text-secondary">{memory.content}</div>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-text-tertiary">
          <span>{formatRelative(memory.updatedAt)}</span>
          {memory.tags?.length ? (
            <div className="flex gap-1">
              {memory.tags.slice(0, 3).map((t) => (
                <span key={t} className="tag-chip">
                  #{t}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="flex items-center rounded-sm border border-border bg-bg-primary p-0.5">
      <button
        onClick={() => onChange("list")}
        title="列表视图"
        className={`flex h-4 w-4 items-center justify-center rounded ${
          view === "list" ? "bg-bg-tertiary text-text-primary" : "text-text-tertiary"
        }`}
      >
        <List size={9} />
      </button>
      <button
        onClick={() => onChange("timeline")}
        title="时间线视图"
        className={`flex h-4 w-4 items-center justify-center rounded ${
          view === "timeline" ? "bg-bg-tertiary text-text-primary" : "text-text-tertiary"
        }`}
      >
        <AlignLeft size={9} />
      </button>
    </div>
  );
}

interface TimelineGroup {
  label: string;
  items: MemoryEntry[];
}

function bucketByDate(items: MemoryEntry[]): TimelineGroup[] {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const todayStart = startOfDay(now).getTime();
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;

  const today: MemoryEntry[] = [];
  const yesterday: MemoryEntry[] = [];
  const thisWeek: MemoryEntry[] = [];
  const earlier: MemoryEntry[] = [];

  for (const item of items) {
    const ts = new Date(item.updatedAt).getTime();
    if (Number.isNaN(ts)) {
      earlier.push(item);
      continue;
    }
    if (ts >= todayStart) today.push(item);
    else if (ts >= yesterdayStart) yesterday.push(item);
    else if (ts >= weekStart) thisWeek.push(item);
    else earlier.push(item);
  }

  const groups: TimelineGroup[] = [];
  if (today.length) groups.push({ label: "今天", items: today });
  if (yesterday.length) groups.push({ label: "昨天", items: yesterday });
  if (thisWeek.length) groups.push({ label: "本周更早", items: thisWeek });
  if (earlier.length) groups.push({ label: "更早", items: earlier });
  return groups;
}

function TimelineView({
  groups,
  selected,
  onToggle,
}: {
  groups: TimelineGroup[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-3 py-2">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="sticky top-0 z-10 mb-1 flex items-center gap-2 bg-bg-secondary px-2 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
            <span>{g.label}</span>
            <span className="rounded-sm bg-bg-tertiary px-1 text-text-secondary">{g.items.length}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="ml-3 border-l border-border pl-3">
            {g.items.map((m) => (
              <MemoryItem
                key={m.id}
                memory={m}
                selected={selected.has(m.id)}
                onToggle={() => onToggle(m.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
