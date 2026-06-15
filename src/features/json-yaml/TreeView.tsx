import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Link2, Link2Off } from "lucide-react";
import yaml from "js-yaml";
import { editor as editorApi } from "@/ipc";
import { Button } from "@/components/ui/Button";
import type { JsonPath } from "@/lib/json-location";
import { isAncestorPath, pathsEqual } from "@/lib/json-location";

interface Props {
  content: string;
  language: "json" | "yaml";
  onFormat?: (formatted: string) => void;
  /** Path at editor cursor when sync is enabled. */
  activePath?: JsonPath | null;
  syncLinked?: boolean;
  onToggleSync?: () => void;
  onPathSelect?: (path: JsonPath) => void;
}

type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];

interface NodeProps {
  name?: string;
  value: JsonValue;
  depth: number;
  index?: number;
  pathPrefix: JsonPath;
  activePath: JsonPath | null;
  syncLinked: boolean;
  manualExpanded: Record<string, boolean | undefined>;
  onToggleExpand: (pathKey: string, expanded: boolean) => void;
  onPathSelect?: (path: JsonPath) => void;
  activeNodeRef: React.MutableRefObject<HTMLElement | null>;
}

function pathKeyOf(prefix: JsonPath): string {
  return prefix.join("\0");
}

function ValueLabel({ value }: { value: JsonValue }) {
  if (value === null) return <span className="text-text-tertiary">∅ null</span>;
  if (typeof value === "string") return <span className="text-success">{`"${value}"`}</span>;
  if (typeof value === "number") return <span className="text-info">{value}</span>;
  if (typeof value === "boolean")
    return <span className="text-warning">{value ? "✓ true" : "✗ false"}</span>;
  return null;
}

function Node({
  name,
  value,
  depth,
  index,
  pathPrefix,
  activePath,
  syncLinked,
  manualExpanded,
  onToggleExpand,
  onPathSelect,
  activeNodeRef,
}: NodeProps) {
  const pathKey = pathKeyOf(pathPrefix);
  const isActive = syncLinked && activePath !== null && pathsEqual(pathPrefix, activePath);
  const onActivePath =
    syncLinked && activePath !== null && isAncestorPath(pathPrefix, activePath);

  const defaultExpanded = depth < 2;
  const expanded =
    onActivePath || (manualExpanded[pathKey] ?? defaultExpanded);

  const isObject = value !== null && typeof value === "object";
  const isArray = Array.isArray(value);
  const display = name !== undefined ? name : index !== undefined ? `[${index}]` : "";

  const selectPath = () => {
    if (pathPrefix.length > 0) onPathSelect?.(pathPrefix);
  };

  if (!isObject) {
    return (
      <div
        ref={isActive ? (el) => { activeNodeRef.current = el; } : undefined}
        role="button"
        tabIndex={0}
        onClick={selectPath}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            selectPath();
          }
        }}
        className={`flex cursor-pointer items-baseline gap-1 px-1 py-0.5 text-xs font-mono hover:bg-bg-tertiary ${
          isActive ? "bg-accent/15 ring-1 ring-inset ring-accent/40" : ""
        }`}
        style={{ paddingLeft: depth * 12 + 16 }}
      >
        <span className="text-text-secondary">{display}:</span>
        <ValueLabel value={value} />
      </div>
    );
  }

  const entries = isArray
    ? (value as JsonValue[]).map((v, i) => ({ key: i, value: v, asIndex: true }))
    : Object.entries(value as Record<string, JsonValue>).map(([k, v]) => ({
        key: k,
        value: v,
        asIndex: false,
      }));

  return (
    <div>
      <div
        ref={isActive ? (el) => { activeNodeRef.current = el; } : undefined}
        className={isActive ? "rounded-sm ring-1 ring-inset ring-accent/40" : undefined}
      >
        <button
          type="button"
          className="flex w-full items-center gap-1 rounded-sm px-1 py-0.5 text-left text-xs font-mono hover:bg-bg-tertiary"
          style={{ paddingLeft: depth * 12 }}
        >
          <span
            className="shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(pathKey, !expanded);
            }}
          >
            {expanded ? (
              <ChevronDown size={11} className="text-text-secondary" />
            ) : (
              <ChevronRight size={11} className="text-text-secondary" />
            )}
          </span>
          <span
            className={`flex min-w-0 flex-1 items-center gap-1 ${isActive ? "bg-accent/15" : ""}`}
            onClick={selectPath}
          >
            <span className="text-text-secondary">{display || (isArray ? "[]" : "{}")}</span>
            <span className="text-text-tertiary">
              {isArray ? `array(${entries.length})` : `object(${entries.length})`}
            </span>
          </span>
        </button>
      </div>
      {expanded &&
        entries.map((e) => {
          const childPath = e.asIndex
            ? [...pathPrefix, String(e.key)]
            : [...pathPrefix, e.key as string];
          return e.asIndex ? (
            <Node
              key={e.key}
              value={e.value}
              depth={depth + 1}
              index={e.key as number}
              pathPrefix={childPath}
              activePath={activePath}
              syncLinked={syncLinked}
              manualExpanded={manualExpanded}
              onToggleExpand={onToggleExpand}
              onPathSelect={onPathSelect}
              activeNodeRef={activeNodeRef}
            />
          ) : (
            <Node
              key={e.key}
              value={e.value}
              depth={depth + 1}
              name={e.key as string}
              pathPrefix={childPath}
              activePath={activePath}
              syncLinked={syncLinked}
              manualExpanded={manualExpanded}
              onToggleExpand={onToggleExpand}
              onPathSelect={onPathSelect}
              activeNodeRef={activeNodeRef}
            />
          );
        })}
    </div>
  );
}

interface Diagnostic {
  line: number;
  message: string;
  severity: "error" | "warning";
}

export function TreeView({
  content,
  language,
  onFormat,
  activePath = null,
  syncLinked = true,
  onToggleSync,
  onPathSelect,
}: Props) {
  const [manualExpanded, setManualExpanded] = useState<Record<string, boolean | undefined>>({});
  const activeNodeRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const parsed = useMemo(() => {
    try {
      if (language === "json") {
        return { ok: true as const, value: JSON.parse(content) as JsonValue, errors: [] };
      }
      const doc = yaml.load(content) as JsonValue;
      return { ok: true as const, value: doc, errors: [] as Diagnostic[] };
    } catch (e: unknown) {
      const message = String((e as Error)?.message || e || "Parse error");
      let line = 1;
      const lineMatch = message.match(/line (\d+)/i);
      if (lineMatch) line = Number(lineMatch[1]);
      return {
        ok: false as const,
        value: null,
        errors: [{ line, message, severity: "error" } as Diagnostic],
      };
    }
  }, [content, language]);

  useEffect(() => {
    if (!syncLinked || !activePath?.length) return;
    activeNodeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activePath, syncLinked, content]);

  async function format() {
    try {
      if (language === "json") {
        const { formatted } = await editorApi.formatCode(content, "json");
        onFormat?.(formatted);
      } else {
        const doc = yaml.load(content);
        const formatted = yaml.dump(doc, { indent: 2, lineWidth: 100 });
        onFormat?.(formatted);
      }
    } catch (e) {
      console.error(e);
    }
  }

  function minify() {
    try {
      if (language === "json") {
        onFormat?.(JSON.stringify(JSON.parse(content)));
      } else {
        const doc = yaml.load(content);
        onFormat?.(yaml.dump(doc, { flowLevel: 0, indent: 0 }).replace(/\n/g, " "));
      }
    } catch {
      /* ignore */
    }
  }

  const onToggleExpand = (pathKey: string, expanded: boolean) => {
    setManualExpanded((prev) => ({ ...prev, [pathKey]: expanded }));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-bg-secondary px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-text-secondary">
        <span>{language.toUpperCase()} 树形视图</span>
        <div className="flex items-center gap-1">
          {onToggleSync && (
            <button
              type="button"
              title={syncLinked ? "取消与编辑器联动" : "与编辑器联动"}
              onClick={onToggleSync}
              className={`flex h-6 w-6 items-center justify-center rounded-sm ${
                syncLinked
                  ? "text-accent hover:bg-bg-tertiary"
                  : "text-text-tertiary hover:bg-bg-tertiary hover:text-text-primary"
              }`}
            >
              {syncLinked ? <Link2 size={13} /> : <Link2Off size={13} />}
            </button>
          )}
          <Button size="sm" variant="ghost" onClick={format}>
            格式化
          </Button>
          <Button size="sm" variant="ghost" onClick={minify}>
            压缩
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto py-2">
        {parsed.ok ? (
          parsed.value !== undefined && parsed.value !== null ? (
            <Node
              value={parsed.value}
              depth={0}
              name="(root)"
              pathPrefix={[]}
              activePath={activePath}
              syncLinked={syncLinked}
              manualExpanded={manualExpanded}
              onToggleExpand={onToggleExpand}
              onPathSelect={onPathSelect}
              activeNodeRef={activeNodeRef}
            />
          ) : (
            <div className="px-3 py-2 text-xs text-text-tertiary">文档为空</div>
          )
        ) : (
          <div className="px-3 py-2 text-xs text-danger">
            {parsed.errors.map((err, i) => (
              <div key={i}>
                第 {err.line} 行: {err.message}
              </div>
            ))}
          </div>
        )}
      </div>

      {!parsed.ok && (
        <div className="shrink-0 border-t border-border bg-bg-secondary px-2 py-1.5 text-xs">
          <div className="font-medium text-danger">⚠ Schema 校验: {parsed.errors.length} 问题</div>
          {parsed.errors.map((err, i) => (
            <div key={i} className="text-text-secondary">
              第 {err.line} 行: {err.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
