import { useMemo } from "react";
import { markdownLanguageService } from "@/features/markdown-engine";
import { escapeHtml } from "@/lib/utils";

interface Props {
  content: string;
  filePath?: string;
  documentId?: string;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function PropertiesPanel({ content, filePath, documentId }: Props) {
  const { meta, bodyLines } = useMemo(() => {
    const doc = markdownLanguageService.parse(content, documentId);
    return {
      meta: doc.frontMatter,
      bodyLines: doc.body.split("\n").length,
    };
  }, [content, documentId]);

  const fileName = filePath?.split("/").pop();

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-text-secondary">
        属性
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 text-sm">
        {fileName ? (
          <div className="mb-3">
            <div className="text-xs text-text-tertiary">文件</div>
            <div className="truncate font-mono text-xs text-text-primary" title={filePath}>
              {fileName}
            </div>
          </div>
        ) : null}

        <div className="mb-3 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
          <span className="text-text-tertiary">正文行数</span>
          <span className="text-text-primary">{bodyLines}</span>
        </div>

        {meta && Object.keys(meta).length > 0 ? (
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(meta).map(([key, value]) => (
                <tr key={key} className="border-b border-border/60">
                  <td className="py-1.5 pr-2 align-top font-mono text-xs text-text-secondary">
                    {escapeHtml(key)}
                  </td>
                  <td className="py-1.5 align-top text-text-primary">{escapeHtml(formatValue(value))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-4 text-center text-xs text-text-tertiary">无 YAML Front Matter</div>
        )}
      </div>
    </div>
  );
}
