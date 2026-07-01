import type { HrModel } from "../types";

const HR_RE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;

export function parseHrBlock(): HrModel {
  return { type: "hr" };
}

export function serializeHrBlock(): string {
  return "---\n";
}

export function hrModelsEqual(): boolean {
  return true;
}

export function cloneHrModel(model: HrModel): HrModel {
  return { ...model };
}

export function isHrBlockRaw(raw: string): boolean {
  return HR_RE.test(raw.split("\n")[0] ?? "");
}
