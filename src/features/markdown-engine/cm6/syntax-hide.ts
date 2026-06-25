import { Decoration, WidgetType } from "@codemirror/view";

/** Zero-width placeholder; syntax chars stay in the document but not in layout flow. */
class HiddenSyntaxWidget extends WidgetType {
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-md-syntax-hidden";
    span.setAttribute("aria-hidden", "true");
    return span;
  }

  get estimatedHeight(): number {
    return -1;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

export function hideSyntaxReplace() {
  return Decoration.replace({
    widget: new HiddenSyntaxWidget(),
    inclusive: false,
  });
}

/** Collapses a table continuation line (single-line replace only). */
class CollapsedLineWidget extends WidgetType {
  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-md-table-line-hidden";
    span.setAttribute("aria-hidden", "true");
    return span;
  }

  get estimatedHeight(): number {
    return 0;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

export function collapseLineReplace() {
  return Decoration.replace({
    widget: new CollapsedLineWidget(),
    inclusive: false,
  });
}
