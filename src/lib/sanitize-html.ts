import DOMPurify from "dompurify";

const PURIFY_CONFIG = {
  USE_PROFILES: { html: true },
  ADD_ATTR: ["data-wiki", "data-tag", "data-md-line", "data-fm", "data-md-active"],
  FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
} satisfies Parameters<typeof DOMPurify.sanitize>[1];

export function sanitizeMarkdownHtml(html: string): string {
  return String(DOMPurify.sanitize(html, PURIFY_CONFIG));
}
