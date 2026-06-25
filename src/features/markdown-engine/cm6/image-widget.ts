import { WidgetType, type EditorView } from "@codemirror/view";
import {
  loadLocalImageDataUrl,
  resolveMarkdownAssetUrl,
  resolveMarkdownAssetUrlAsync,
  toAbsoluteAssetPath,
} from "./resolve-asset";

function showImageError(wrap: HTMLElement, alt: string, src: string): void {
  wrap.classList.remove("cm-md-image-block--loading");
  wrap.classList.add("cm-md-image-block--error");
  wrap.querySelector(".cm-md-image")?.remove();
  if (wrap.querySelector(".cm-md-image-fallback")) return;
  const fallback = document.createElement("span");
  fallback.className = "cm-md-image-fallback";
  fallback.textContent = alt || src || "图片加载失败";
  wrap.insertBefore(fallback, wrap.firstChild);
}

export class MarkdownImageWidget extends WidgetType {
  constructor(
    private readonly alt: string,
    private readonly src: string,
    private readonly noteVaultPath: string | null,
  ) {
    super();
  }

  eq(other: MarkdownImageWidget): boolean {
    return (
      other instanceof MarkdownImageWidget &&
      other.alt === this.alt &&
      other.src === this.src &&
      other.noteVaultPath === this.noteVaultPath
    );
  }

  toDOM(_view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-md-image-block cm-md-image-block--loading";

    if (this.alt) {
      const cap = document.createElement("div");
      cap.className = "cm-md-image-caption";
      cap.textContent = this.alt;
      wrap.append(cap);
    }

    void this.mountImage(wrap);
    return wrap;
  }

  private async mountImage(wrap: HTMLElement): Promise<void> {
    const absolute = toAbsoluteAssetPath(this.noteVaultPath, this.src);
    let url = await resolveMarkdownAssetUrlAsync(this.noteVaultPath, this.src);

    if (!url && absolute) {
      url = resolveMarkdownAssetUrl(this.noteVaultPath, this.src);
    }

    if (!url) {
      showImageError(wrap, this.alt, this.src);
      return;
    }

    const img = document.createElement("img");
    img.className = "cm-md-image";
    img.alt = this.alt;
    img.loading = "lazy";
    img.draggable = false;

    img.onload = () => {
      wrap.classList.remove("cm-md-image-block--loading");
    };

    img.onerror = async () => {
      if (absolute) {
        const dataUrl = await loadLocalImageDataUrl(absolute);
        if (dataUrl) {
          img.onerror = () => showImageError(wrap, this.alt, this.src);
          img.src = dataUrl;
          return;
        }
      }
      showImageError(wrap, this.alt, this.src);
    };

    img.src = url;
    wrap.insertBefore(img, wrap.firstChild);
  }

  ignoreEvent(): boolean {
    return true;
  }
}
