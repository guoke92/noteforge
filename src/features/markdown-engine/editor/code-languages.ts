export const CODE_LANGUAGES: { id: string; label: string }[] = [
  { id: "", label: "Plain Text" },
  { id: "typescript", label: "TypeScript" },
  { id: "javascript", label: "JavaScript" },
  { id: "tsx", label: "TSX" },
  { id: "jsx", label: "JSX" },
  { id: "python", label: "Python" },
  { id: "rust", label: "Rust" },
  { id: "go", label: "Go" },
  { id: "java", label: "Java" },
  { id: "kotlin", label: "Kotlin" },
  { id: "swift", label: "Swift" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "csharp", label: "C#" },
  { id: "ruby", label: "Ruby" },
  { id: "php", label: "PHP" },
  { id: "sql", label: "SQL" },
  { id: "bash", label: "Bash" },
  { id: "shell", label: "Shell" },
  { id: "json", label: "JSON" },
  { id: "yaml", label: "YAML" },
  { id: "toml", label: "TOML" },
  { id: "markdown", label: "Markdown" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "scss", label: "SCSS" },
  { id: "xml", label: "XML" },
  { id: "dockerfile", label: "Dockerfile" },
];

export function codeLanguageLabel(id: string | null | undefined): string {
  const match = CODE_LANGUAGES.find((lang) => lang.id === (id ?? ""));
  return match?.label ?? (id?.trim() ? id : "Plain Text");
}
