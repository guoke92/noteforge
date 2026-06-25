import { WidgetType, type EditorView } from "@codemirror/view";

export class TaskCheckboxWidget extends WidgetType {
  constructor(
    private readonly from: number,
    private readonly to: number,
    private readonly checked: boolean,
  ) {
    super();
  }

  eq(other: TaskCheckboxWidget): boolean {
    return (
      other instanceof TaskCheckboxWidget &&
      other.from === this.from &&
      other.to === this.to &&
      other.checked === this.checked
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "cm-md-task-checkbox";
    input.checked = this.checked;
    input.setAttribute("aria-label", this.checked ? "已完成任务" : "未完成任务");

    input.addEventListener("mousedown", (e) => {
      e.preventDefault();
    });
    input.addEventListener("change", () => {
      const next = input.checked ? "[x]" : "[ ]";
      view.dispatch({
        changes: { from: this.from, to: this.to, insert: next },
        selection: view.state.selection,
      });
      view.focus();
    });

    return input;
  }

  ignoreEvent(): boolean {
    return false;
  }
}
