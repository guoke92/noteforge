import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet } from "@codemirror/view";

export type DecoKind = "line" | "replace" | "mark";

export type DecoSpec = {
  from: number;
  to: number;
  deco: Decoration;
  kind: DecoKind;
};

type PosRange = { from: number; to: number };

const KIND_ORDER: Record<DecoKind, number> = {
  line: 0,
  replace: 1,
  mark: 2,
};

export function rangesOverlap(a: PosRange, b: PosRange): boolean {
  return a.from < b.to && b.from < a.to;
}

/** CM6 forbids overlapping replace/mark decorations; keep earlier higher-priority spans. */
export function resolveSpecs(specs: DecoSpec[]): DecoSpec[] {
  const sorted = [...specs].sort((a, b) => {
    if (a.from !== b.from) return a.from - b.from;
    if (KIND_ORDER[a.kind] !== KIND_ORDER[b.kind]) {
      return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    }
    return b.to - a.to - (a.to - a.from);
  });

  const kept: DecoSpec[] = [];
  for (const spec of sorted) {
    if (spec.kind === "line") {
      kept.push(spec);
      continue;
    }
    if (spec.from >= spec.to) continue;
    const overlaps = kept.some(
      (k) =>
        k.kind !== "line" &&
        spec.kind !== "line" &&
        rangesOverlap(k, spec),
    );
    if (!overlaps) kept.push(spec);
  }
  return kept;
}

function sortForBuilder(specs: DecoSpec[]): DecoSpec[] {
  return specs.sort((a, b) => {
    if (a.from !== b.from) return a.from - b.from;
    if (KIND_ORDER[a.kind] !== KIND_ORDER[b.kind]) {
      return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    }
    return a.to - b.to;
  });
}

export function buildDecorationSet(specs: DecoSpec[], docLen: number): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const resolved = resolveSpecs(specs);

  for (const spec of sortForBuilder(resolved)) {
    try {
      if (spec.from >= docLen) continue;
      if (spec.kind === "line") {
        builder.add(spec.from, spec.from, spec.deco);
        continue;
      }
      if (spec.to > docLen || spec.from >= spec.to) continue;
      builder.add(spec.from, spec.to, spec.deco);
    } catch (err) {
      console.warn("NoteForge: skip live-preview spec", spec.from, spec.to, err);
    }
  }

  try {
    return builder.finish();
  } catch (err) {
    console.warn("NoteForge: live-preview decoration build failed", err);
    return Decoration.none;
  }
}
