import { create } from "zustand";
import { ai } from "@/ipc";
import type { ModelInfo } from "@/types";
import { perfAsync, perfLog } from "@/lib/startup-perf";

export interface AIPanelState {
  open: boolean;
  loading: boolean;
  errorMessage?: string;
  origin?: string; // original selected text
  result?: string; // refined / generated text
  instruction: string;
  history: { instruction: string; result: string; at: string }[];
  models: ModelInfo[];
  selectedModel?: string;
  status: "ready" | "offline" | "no-model";

  loadModels: () => Promise<void>;
  selectModel: (id: string) => void;
  setInstruction: (s: string) => void;
  refineSelection: (text: string, instruction: string) => Promise<void>;
  summarize: (text: string) => Promise<void>;
  applyResult: () => string | undefined;
  close: () => void;
  open_: (text?: string) => void;
  retry: () => Promise<void>;
}

export const useAIStore = create<AIPanelState>((set, get) => ({
  open: false,
  loading: false,
  instruction: "让这段话更专业",
  history: [],
  models: [],
  status: "no-model",

  async loadModels() {
    return perfAsync("ai.loadModels", async () => {
    try {
      const [local, cloud] = await Promise.all([ai.listModels("local"), ai.listModels("cloud")]);
      const all = [...local, ...cloud];
      const available = all.find((m) => m.available);
      set({
        models: all,
        selectedModel: available?.id,
        status: available ? "ready" : "no-model",
      });
      perfLog("ai.loadModels.done", { count: all.length, status: available ? "ready" : "no-model" });
    } catch {
      set({ models: [], status: "offline" });
      perfLog("ai.loadModels.offline");
    }
    });
  },

  selectModel(id) {
    set({ selectedModel: id });
  },

  setInstruction(s) {
    set({ instruction: s });
  },

  open_(text) {
    set({ open: true, origin: text || get().origin, errorMessage: undefined });
  },

  close() {
    set({ open: false });
  },

  async refineSelection(text, instruction) {
    set({ open: true, loading: true, origin: text, instruction, errorMessage: undefined });
    try {
      const { result } = await ai.refine(text, instruction, get().selectedModel);
      set({
        result,
        loading: false,
        history: [
          { instruction, result, at: new Date().toISOString() },
          ...get().history.slice(0, 9),
        ],
      });
    } catch (e) {
      set({ loading: false, errorMessage: String(e) });
    }
  },

  async summarize(text) {
    set({ open: true, loading: true, origin: text, instruction: "生成摘要", errorMessage: undefined });
    try {
      const { summary } = await ai.summary(text, get().selectedModel);
      set({
        result: summary,
        loading: false,
        history: [
          { instruction: "生成摘要", result: summary, at: new Date().toISOString() },
          ...get().history.slice(0, 9),
        ],
      });
    } catch (e) {
      set({ loading: false, errorMessage: String(e) });
    }
  },

  async retry() {
    const { origin, instruction } = get();
    if (!origin) return;
    await get().refineSelection(origin, instruction);
  },

  applyResult() {
    return get().result;
  },
}));
