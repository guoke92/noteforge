import * as Tip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  delay?: number;
}

export function Tooltip({ content, children, side = "top", delay = 200 }: TooltipProps) {
  return (
    <Tip.Provider delayDuration={delay}>
      <Tip.Root>
        <Tip.Trigger asChild>{children}</Tip.Trigger>
        <Tip.Portal>
          <Tip.Content
            side={side}
            sideOffset={4}
            className="z-50 max-w-xs rounded-sm border border-border bg-surface px-2 py-1 text-xs text-text-primary shadow-md animate-fade-in"
          >
            {content}
          </Tip.Content>
        </Tip.Portal>
      </Tip.Root>
    </Tip.Provider>
  );
}
