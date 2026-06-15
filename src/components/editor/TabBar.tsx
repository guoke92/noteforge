import {
  X,
  Circle,
  Plus,
  SplitSquareHorizontal,
  ChevronsDown,
  ChevronLeft,
  ChevronRight,
  Columns,
  FileText,
  Pencil,
  Merge,
} from "lucide-react";
import { useRef } from "react";
import { useEditorStore, isDirty, isMainPane, type EditorTab } from "@/store/editor";
import { isMarkdownTab, isScratchTab, tabDisplayLanguage, tabLabel } from "@/lib/editor-doc";
import { resolveSurfaceMode } from "@/lib/surface-mode";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/ContextMenu";
import { Dropdown } from "@/components/ui/Dropdown";
import { MOD_LABEL } from "@/hooks/useShortcuts";
import { useTabStripScroll } from "@/hooks/useTabStripScroll";

interface Props {
  paneId: string;
}

function langBadge(lang: string): string {
  return (
    {
      markdown: "MD",
      json: "JS",
      yaml: "YML",
      typescript: "TS",
      javascript: "JS",
      python: "PY",
      rust: "RS",
      plaintext: "TXT",
      text: "TXT",
    }[lang] || lang.slice(0, 3).toUpperCase()
  );
}

function paneLabel(paneId: string, panes: string[]): string {
  const idx = panes.indexOf(paneId);
  return idx >= 0 ? String(idx + 1) : paneId;
}

function tabContextItems(tab: EditorTab, paneTabs: EditorTab[]): ContextMenuItem[] {
  const state = useEditorStore.getState();
  const panes = state.panes;

  const splitItems: ContextMenuItem[] = [
    ...(isMainPane(tab.paneId, panes)
      ? []
      : [
          { separator: true, label: "" },
          {
            label: "在主屏打开",
            onSelect: () => state.openTabInMainPane(tab.id),
          },
        ]),
    { separator: true, label: "" },
    {
      label: "在新分屏中打开",
      onSelect: () => state.openTabInNewPane(tab.id),
    },
    ...panes
      .filter((p) => p !== tab.paneId)
      .map((p) => ({
        label: `在分屏 ${paneLabel(p, panes)} 中打开`,
        onSelect: () => state.openTabInPane(tab.id, p),
      })),
    {
      label: "移动到其它分屏…",
      disabled: panes.length <= 1,
      onSelect: () => {
        const target = panes.find((p) => p !== tab.paneId);
        if (target) state.moveTabToPane(tab.id, target);
      },
    },
  ];

  return [
    { label: "关闭", onSelect: () => state.closeTab(tab.id), shortcut: `${MOD_LABEL}W` },
    {
      label: "关闭其他",
      onSelect: () =>
        state.requestCloseTabs(paneTabs.filter((t) => t.id !== tab.id).map((t) => t.id)),
    },
    {
      label: "关闭右侧",
      onSelect: () => {
        const idx = paneTabs.findIndex((t) => t.id === tab.id);
        state.requestCloseTabs(paneTabs.slice(idx + 1).map((t) => t.id));
      },
    },
    { separator: true, label: "" },
    {
      label: isScratchTab(tab) ? "复制标题" : "复制路径",
      onSelect: () =>
        navigator.clipboard
          ?.writeText(isScratchTab(tab) ? tab.displayName : tab.path)
          .catch(() => {}),
      disabled: isScratchTab(tab) ? false : !tab.path,
    },
    ...splitItems,
    ...(isMarkdownTab(tab)
      ? [
          { separator: true, label: "" },
          {
            label: "写作模式",
            onSelect: () => state.setSurfaceMode(tab.id, "write"),
            checked: resolveSurfaceMode(tab) === "write",
          },
          {
            label: "阅读模式",
            onSelect: () => state.setSurfaceMode(tab.id, "read"),
            checked: resolveSurfaceMode(tab) === "read",
          },
          {
            label: "源码模式",
            onSelect: () => state.setSurfaceMode(tab.id, "source"),
            checked: resolveSurfaceMode(tab) === "source",
          },
        ]
      : []),
  ];
}

function tabChipClass(active: boolean): string {
  const base =
    "group inline-flex h-9 shrink-0 cursor-pointer select-none items-center gap-1 whitespace-nowrap border-r border-t-2 border-border px-2.5 text-sm outline-none transition-colors duration-150";
  if (active) {
    return `${base} border-t-accent bg-bg-primary text-text-primary`;
  }
  return `${base} border-t-transparent bg-bg-secondary text-text-secondary hover:bg-bg-tertiary hover:text-text-primary`;
}

function TabChip({
  tab,
  paneTabs,
  active,
  onSelect,
  onClose,
  registerRef,
}: {
  tab: EditorTab;
  paneTabs: EditorTab[];
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
}) {
  const dirty = isDirty(tab);
  const lang = tabDisplayLanguage(tab);

  return (
    <ContextMenu items={tabContextItems(tab, paneTabs)}>
      <div
        ref={(el) => registerRef(tab.id, el)}
        role="tab"
        aria-selected={active}
        tabIndex={0}
        onMouseDown={(e) => {
          if (e.button === 1) {
            e.preventDefault();
            onClose();
          }
        }}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        className={tabChipClass(active)}
      >
        <span className="shrink-0 rounded-sm bg-bg-tertiary px-1 font-mono text-[10px] text-text-tertiary">
          {langBadge(lang)}
        </span>
        <span className="min-w-0 truncate">{tabLabel(tab)}</span>
        <span className="relative ml-0.5 h-3.5 w-3.5 shrink-0">
          {dirty && (
            <Circle
              size={8}
              className="absolute inset-0 m-auto fill-current text-warning group-hover:invisible"
            />
          )}
          <button
            type="button"
            aria-label="关闭标签"
            className="absolute inset-0 flex items-center justify-center rounded-sm text-text-tertiary opacity-0 transition-opacity hover:bg-bg-tertiary hover:text-text-primary group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            <X size={10} />
          </button>
        </span>
      </div>
    </ContextMenu>
  );
}

function ScrollButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-7 shrink-0 items-center justify-center border-r border-border text-text-secondary hover:bg-bg-tertiary hover:text-text-primary disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function MarkdownSurfaceToggle({ tab }: { tab: EditorTab }) {
  const setSurfaceMode = useEditorStore((s) => s.setSurfaceMode);
  const mode = resolveSurfaceMode(tab);

  return (
    <div className="flex h-7 items-center rounded-sm border border-border bg-bg-primary p-0.5">
      <SurfaceModeButton
        active={mode === "write"}
        title={`写作 (${MOD_LABEL}⇧I)`}
        onClick={() => setSurfaceMode(tab.id, "write")}
      >
        <Pencil size={11} />
      </SurfaceModeButton>
      <SurfaceModeButton
        active={mode === "read"}
        title="阅读"
        onClick={() => setSurfaceMode(tab.id, "read")}
      >
        <FileText size={11} />
      </SurfaceModeButton>
      <SurfaceModeButton
        active={mode === "source"}
        title="源码"
        onClick={() => setSurfaceMode(tab.id, "source")}
      >
        <Columns size={11} />
      </SurfaceModeButton>
    </div>
  );
}

function SurfaceModeButton({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`flex h-5 w-5 items-center justify-center rounded ${
        active ? "bg-bg-tertiary text-text-primary" : "text-text-tertiary hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

function NewTabButton({ onClick, title }: { onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      className="inline-flex h-9 w-8 shrink-0 items-center justify-center border-r border-border text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
      onClick={onClick}
      title={title ?? "新建临时编辑区"}
    >
      <Plus size={14} />
    </button>
  );
}

export function TabBar({ paneId }: Props) {
  const panes = useEditorStore((s) => s.panes);
  const allTabs = useEditorStore((s) => s.tabs);
  const tabs = allTabs.filter((t) => t.paneId === paneId);
  const activeId = useEditorStore((s) => s.activeTabIdByPane[paneId]);
  const activeTab = tabs.find((t) => t.id === activeId);
  const setActive = useEditorStore((s) => s.setActive);
  const closeTab = useEditorStore((s) => s.closeTab);
  const newUntitledInPane = useEditorStore((s) => s.newUntitled);
  const splitRight = useEditorStore((s) => s.splitRight);
  const requestClosePane = useEditorStore((s) => s.requestClosePane);
  const isSecondaryPane = panes.length > 1 && !isMainPane(paneId, panes);

  const barRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const {
    scrollRef,
    registerTabRef,
    canScrollLeft,
    canScrollRight,
    needsScroll,
    scrollLeft,
    scrollRight,
    onWheel,
  } = useTabStripScroll(activeId, tabs.length, barRef, toolbarRef);

  const plusPinned = needsScroll && tabs.length > 0;

  return (
    <div
      ref={barRef}
      className="flex h-9 w-full shrink-0 items-stretch border-b border-border bg-bg-secondary"
    >
      {needsScroll && (
        <ScrollButton title="向左滚动标签" onClick={scrollLeft} disabled={!canScrollLeft}>
          <ChevronLeft size={14} />
        </ScrollButton>
      )}

      <div
        ref={scrollRef}
        className="tab-strip-scroll flex min-w-0 flex-1 items-stretch"
        onWheel={onWheel}
      >
        {tabs.length === 0 ? (
          <NewTabButton onClick={() => newUntitledInPane(paneId)} />
        ) : (
          <>
            {tabs.map((tab) => (
              <TabChip
                key={tab.id}
                tab={tab}
                paneTabs={tabs}
                active={activeId === tab.id}
                registerRef={registerTabRef}
                onSelect={() => setActive(tab.id)}
                onClose={() => closeTab(tab.id)}
              />
            ))}
            {!plusPinned && (
              <NewTabButton onClick={() => newUntitledInPane(paneId)} />
            )}
          </>
        )}
      </div>

      {plusPinned && (
        <div className="flex shrink-0 items-stretch border-l border-border bg-bg-secondary">
          <NewTabButton onClick={() => newUntitledInPane(paneId)} />
        </div>
      )}

      {needsScroll && (
        <ScrollButton title="向右滚动标签" onClick={scrollRight} disabled={!canScrollRight}>
          <ChevronRight size={14} />
        </ScrollButton>
      )}

      {needsScroll && tabs.length > 0 && (
        <Dropdown
          align="end"
          trigger={
            <button
              type="button"
              title="全部标签页"
              className="flex h-9 w-8 shrink-0 items-center justify-center border-l border-border text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
            >
              <ChevronsDown size={14} />
            </button>
          }
          items={tabs.map((tab) => ({
            label: (
              <span className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-text-tertiary">
                  {langBadge(tabDisplayLanguage(tab))}
                </span>
                {tabLabel(tab)}
                {isDirty(tab) && <Circle size={8} className="fill-current text-warning" />}
              </span>
            ),
            checked: activeId === tab.id,
            onSelect: () => setActive(tab.id),
          }))}
        />
      )}

      <div
        ref={toolbarRef}
        className="flex shrink-0 items-stretch border-l border-border bg-bg-secondary"
      >
        {activeTab && isMarkdownTab(activeTab) && (
          <div className="flex items-center border-r border-border px-2">
            <MarkdownSurfaceToggle tab={activeTab} />
          </div>
        )}

        <button
          type="button"
          onClick={() => splitRight()}
          title="向右分屏"
          className="flex h-9 w-8 items-center justify-center border-l border-border text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
        >
          <SplitSquareHorizontal size={14} />
        </button>
        {isSecondaryPane && (
          <button
            type="button"
            onClick={() => requestClosePane(paneId)}
            title="关闭分屏"
            className="flex h-9 w-8 items-center justify-center border-l border-border text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
          >
            <Merge size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
