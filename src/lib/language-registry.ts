export interface LanguageDef {
  id: string;
  extensions: string[];
  monacoId: string;
  badge: string;
}

const LANGUAGES: LanguageDef[] = [
  { id: "markdown", extensions: ["md", "markdown"], monacoId: "markdown", badge: "MD" },
  { id: "json", extensions: ["json"], monacoId: "json", badge: "JSON" },
  { id: "yaml", extensions: ["yaml", "yml"], monacoId: "yaml", badge: "YML" },
  { id: "typescript", extensions: ["ts", "tsx"], monacoId: "typescript", badge: "TS" },
  { id: "javascript", extensions: ["js", "jsx"], monacoId: "javascript", badge: "JS" },
  { id: "python", extensions: ["py"], monacoId: "python", badge: "PY" },
  { id: "rust", extensions: ["rs"], monacoId: "rust", badge: "RS" },
  { id: "go", extensions: ["go"], monacoId: "go", badge: "GO" },
  { id: "java", extensions: ["java"], monacoId: "java", badge: "JAVA" },
  { id: "cpp", extensions: ["c", "cpp", "h"], monacoId: "cpp", badge: "C++" },
  { id: "html", extensions: ["html", "htm"], monacoId: "html", badge: "HTML" },
  { id: "css", extensions: ["css"], monacoId: "css", badge: "CSS" },
  { id: "shell", extensions: ["sh", "bash"], monacoId: "shell", badge: "SH" },
  { id: "sql", extensions: ["sql"], monacoId: "sql", badge: "SQL" },
  { id: "xml", extensions: ["xml"], monacoId: "xml", badge: "XML" },
  { id: "toml", extensions: ["toml"], monacoId: "ini", badge: "TOML" },
  { id: "text", extensions: ["txt"], monacoId: "plaintext", badge: "TXT" },
  { id: "plaintext", extensions: [], monacoId: "plaintext", badge: "TXT" },
];

const EXT_TO_LANGUAGE = new Map<string, string>();
const LANGUAGE_DEFS = new Map<string, LanguageDef>();

for (const def of LANGUAGES) {
  LANGUAGE_DEFS.set(def.id, def);
  for (const ext of def.extensions) {
    EXT_TO_LANGUAGE.set(ext, def.id);
  }
}

export function detectLanguageFromExtension(ext: string): string {
  return EXT_TO_LANGUAGE.get(ext.toLowerCase()) ?? "plaintext";
}

export function defaultExtensionForLanguage(language: string): string {
  const def = LANGUAGE_DEFS.get(language);
  if (def?.extensions[0]) return def.extensions[0]!;
  return "txt";
}

export function monacoLanguageId(language: string): string {
  return LANGUAGE_DEFS.get(language)?.monacoId ?? "plaintext";
}

export function languageBadge(language: string): string {
  const def = LANGUAGE_DEFS.get(language);
  if (def) return def.badge;
  return language.slice(0, 3).toUpperCase();
}
