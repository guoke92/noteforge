import yaml from "js-yaml";
import { stripFrontMatter } from "./markdown-front-matter";

export function parseFrontMatter(content: string): {
  meta: Record<string, unknown> | null;
  body: string;
} {
  const { body, raw } = stripFrontMatter(content);
  if (!raw) return { meta: null, body };
  try {
    const parsed = yaml.load(raw, { schema: yaml.FAILSAFE_SCHEMA }) as Record<string, unknown>;
    return {
      meta: parsed && typeof parsed === "object" ? parsed : null,
      body,
    };
  } catch {
    return { meta: null, body };
  }
}
