import type { DocumentId } from "@/core/events";
import { parseMarkdownDocument } from "./parser";
import type { MarkdownDoc, OutlineNode, WikiLinkRef } from "./types";

export type { MarkdownDoc, OutlineNode, WikiLinkRef } from "./types";

/**
 * Shared markdown intelligence layer (NFEP).
 * Consumers: outline, properties, CM6 IR (P1), knowledge indexer.
 */
class MarkdownLanguageService {
  private byDocument = new Map<DocumentId, MarkdownDoc>();
  private byContent = new Map<string, MarkdownDoc>();

  parse(content: string, documentId?: DocumentId): MarkdownDoc {
    const cached = this.byContent.get(content);
    if (cached) {
      if (documentId) this.byDocument.set(documentId, cached);
      return cached;
    }

    const doc = parseMarkdownDocument(content);
    this.byContent.set(content, doc);
    if (documentId) this.byDocument.set(documentId, doc);
    return doc;
  }

  getOutline(content: string, documentId?: DocumentId): OutlineNode[] {
    return this.parse(content, documentId).outline;
  }

  getFrontMatter(content: string, documentId?: DocumentId): Record<string, unknown> | null {
    return this.parse(content, documentId).frontMatter;
  }

  getWikiLinks(content: string, documentId?: DocumentId): WikiLinkRef[] {
    return this.parse(content, documentId).wikiLinks;
  }

  invalidate(documentId: DocumentId): void {
    this.byDocument.delete(documentId);
  }

  invalidateAll(): void {
    this.byDocument.clear();
    this.byContent.clear();
  }
}

export const markdownLanguageService = new MarkdownLanguageService();
