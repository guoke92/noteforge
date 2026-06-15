import type {
  CommandCategory,
  CommandContext,
  CommandDefinition,
  CommandRegistry,
  Keybinding,
} from "./types";
import { chordsMatch } from "./keybinding";

export function createCommandRegistry(): CommandRegistry {
  const commands = new Map<string, CommandDefinition>();
  const keyIndex: Array<{ chord: string; commandId: string; when?: string }> = [];

  return {
    register(command) {
      commands.set(command.id, command);
      for (const kb of command.keybindings ?? []) {
        keyIndex.push({ chord: kb.chord, commandId: command.id, when: kb.when });
      }
      return () => {
        commands.delete(command.id);
        for (let i = keyIndex.length - 1; i >= 0; i--) {
          if (keyIndex[i]!.commandId === command.id) {
            keyIndex.splice(i, 1);
          }
        }
      };
    },

    async execute(commandId) {
      const def = commands.get(commandId);
      if (!def) return;
      const { buildCommandContext } = await import("./context");
      const ctx = buildCommandContext();
      if (def.enabled && !def.enabled(ctx)) return;
      await def.run(ctx);
    },

    list(filter) {
      let items = [...commands.values()].filter((c) => c.palette !== false);
      if (filter?.category) {
        items = items.filter((c) => c.category === filter.category);
      }
      if (filter?.query?.trim()) {
        const q = filter.query.trim().toLowerCase();
        items = items.filter(
          (c) => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
        );
      }
      return items.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
    },

    matchKeybinding(event, ctx) {
      if (event.defaultPrevented) return null;

      for (const entry of keyIndex) {
        if (!chordsMatch(event, entry.chord)) continue;
        const def = commands.get(entry.commandId);
        if (!def) continue;
        if (!matchesWhen(entry.when, ctx)) continue;
        if (def.enabled && !def.enabled(ctx)) continue;
        return def;
      }
      return null;
    },
  };
}

function matchesWhen(when: string | undefined, ctx: CommandContext): boolean {
  if (!when) return true;
  const clauses = when.split("&&").map((s) => s.trim());
  for (const clause of clauses) {
    if (clause === "!inputContext" && ctx.isInputContext) return false;
    if (clause === "inputContext" && !ctx.isInputContext) return false;
    if (clause === "markdown" && !ctx.isMarkdownActive) return false;
    if (clause === "hasActiveTab" && !ctx.hasActiveTab) return false;
    if (clause === "editorFocus" && !ctx.isEditorFocused) return false;
  }
  return true;
}

export type CommandRegistryImpl = ReturnType<typeof createCommandRegistry>;

/** Helper for registering commands with typed keybindings. */
export function cmd(
  partial: Omit<CommandDefinition, "keybindings"> & { keybindings?: Keybinding[] },
): CommandDefinition {
  return partial;
}

export const COMMAND_CATEGORIES: Record<CommandCategory, string> = {
  file: "文件",
  edit: "编辑",
  view: "视图",
  note: "笔记",
  navigation: "导航",
  workspace: "工作区",
  ai: "AI",
};
