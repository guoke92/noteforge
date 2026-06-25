import { StateEffect, StateField } from "@codemirror/state";

export const setLiveModeEffect = StateEffect.define<boolean>();

/** When true, live-preview decorations are active (Typora IR). */
export const liveModeField = StateField.define<boolean>({
  create: () => true,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setLiveModeEffect)) return effect.value;
    }
    return value;
  },
});

export function setLiveModeTransaction(live: boolean) {
  return { effects: setLiveModeEffect.of(live) };
}
