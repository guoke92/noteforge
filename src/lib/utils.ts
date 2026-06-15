import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function basename(path: string): string {
  return path.split("/").pop() || "";
}

export function dirname(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "/" : path.slice(0, idx);
}

export function noteName(path: string): string {
  return basename(path).replace(/\.[^.]+$/, "");
}

export function fileExt(name: string): string {
  if (!name.includes(".")) return "";
  return name.split(".").pop()!.toLowerCase();
}

export function detectLanguageFromName(name: string): string {
  const ext = fileExt(name);
  return (
    {
      md: "markdown",
      markdown: "markdown",
      json: "json",
      yaml: "yaml",
      yml: "yaml",
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      py: "python",
      rs: "rust",
      go: "go",
      java: "java",
      c: "cpp",
      cpp: "cpp",
      h: "cpp",
      html: "html",
      htm: "html",
      css: "css",
      sh: "shell",
      bash: "shell",
      sql: "sql",
      xml: "xml",
      toml: "toml",
    }[ext] || "plaintext"
  );
}

export function languageIcon(language: string): string {
  return (
    {
      markdown: "📄",
      json: "{ }",
      yaml: "⚙",
      typescript: "TS",
      javascript: "JS",
      python: "PY",
      rust: "RS",
      go: "GO",
    }[language] || "📄"
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return date.toISOString().slice(0, 10);
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
