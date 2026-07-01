import { describe, expect, it } from "vitest";
import { parseMarkdown, serializeMarkdown } from "../index";

describe("MarkdownCodec round-trip", () => {
  it("preserves heading and paragraph", () => {
    const input = "# Title\n\nHello **world**.\n";
    const doc = parseMarkdown(input);
    const output = serializeMarkdown(doc);
    expect(output).toContain("# Title");
    expect(output).toContain("**world**");
  });

  it("preserves code fence", () => {
    const input = "```ts\nconst x = 1;\n```\n";
    const doc = parseMarkdown(input);
    const output = serializeMarkdown(doc);
    expect(output).toContain("```");
    expect(output).toContain("const x = 1");
  });

  it("preserves frontmatter as raw segment", () => {
    const input = "---\ntitle: Note\n---\n\nBody\n";
    const doc = parseMarkdown(input);
    expect(doc.segments[0]?.kind).toBe("raw");
    const output = serializeMarkdown(doc);
    expect(output).toContain("title: Note");
    expect(output).toContain("Body");
  });
});
