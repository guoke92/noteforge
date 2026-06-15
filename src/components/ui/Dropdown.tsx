import * as DM from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface MenuItem {
  label: ReactNode;
  onSelect?: () => void;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  separator?: boolean;
}

interface DropdownProps {
  trigger: ReactNode;
  items: MenuItem[];
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

export function Dropdown({ trigger, items, side = "bottom", align = "start" }: DropdownProps) {
  return (
    <DM.Root>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content
          side={side}
          align={align}
          sideOffset={4}
          className="z-50 min-w-[180px] rounded-md border border-border bg-surface p-1 shadow-md animate-fade-in"
        >
          {items.map((item, idx) =>
            item.separator ? (
              <DM.Separator key={idx} className="my-1 h-px bg-border" />
            ) : (
              <DM.Item
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
              </DM.Item>
            ),
          )}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}
