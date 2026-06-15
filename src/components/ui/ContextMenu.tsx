import * as CM from "@radix-ui/react-context-menu";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface ContextMenuItem {
  label: ReactNode;
  onSelect?: () => void;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  children: ReactNode;
  items: ContextMenuItem[];
}

export function ContextMenu({ children, items }: ContextMenuProps) {
  return (
    <CM.Root>
      <CM.Trigger asChild>{children}</CM.Trigger>
      <CM.Portal>
        <CM.Content
          className="z-50 min-w-[180px] rounded-md border border-border bg-surface p-1 shadow-md animate-fade-in"
        >
          {items.map((item, idx) =>
            item.separator ? (
              <CM.Separator key={idx} className="my-1 h-px bg-border" />
            ) : (
              <CM.Item
                key={idx}
                disabled={item.disabled}
                onSelect={item.onSelect}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1 text-sm",
                  "text-text-primary outline-none data-[highlighted]:bg-bg-tertiary",
                  "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                  item.danger && "text-danger",
                )}
              >
                <span className="flex items-center gap-2">
                  {item.checked && <Check size={12} />}
                  {item.label}
                </span>
                {item.shortcut && (
                  <span className="text-xs text-text-tertiary">{item.shortcut}</span>
                )}
              </CM.Item>
            ),
          )}
        </CM.Content>
      </CM.Portal>
    </CM.Root>
  );
}
