const INLINE_MD_RE = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*)/g;

/** Append inline markdown (bold / code / italic) into a DOM parent. */
export function appendInlineMd(parent: HTMLElement, text: string): void {
  let last = 0;
  let match: RegExpExecArray | null;
  INLINE_MD_RE.lastIndex = 0;

  while ((match = INLINE_MD_RE.exec(text))) {
    const index = match.index;
    if (index > last) {
      parent.append(document.createTextNode(text.slice(last, index)));
    }

    if (match[2] !== undefined) {
      const strong = document.createElement("strong");
      strong.textContent = match[2];
      parent.append(strong);
    } else if (match[3] !== undefined) {
      const code = document.createElement("code");
      code.className = "cm-md-inline-code";
      code.textContent = match[3];
      parent.append(code);
    } else if (match[4] !== undefined) {
      const em = document.createElement("em");
      em.textContent = match[4];
      parent.append(em);
    }

    last = index + match[0].length;
  }

  if (last < text.length) {
    parent.append(document.createTextNode(text.slice(last)));
  }
}
