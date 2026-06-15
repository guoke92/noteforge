import * as RDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Show the default close button in header */
  showClose?: boolean;
}

const sizeClass: Record<NonNullable<DialogProps["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = "md",
  showClose = true,
}: DialogProps) {
  // Radix requires DialogContent to always have a DialogTitle and (recommended)
  // a DialogDescription for screen readers. If the caller didn't pass one we
  // fall back to a screen-reader-only element so the a11y warnings go away
  // without changing the visible UI.
  const fallbackTitle = title ?? "对话框";
  const fallbackDescription = description ?? " ";

  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-black/40 animate-fade-in" />
        <RDialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 w-[95vw] -translate-x-1/2 -translate-y-1/2 rounded-xl",
            "border border-border bg-surface p-4 shadow-lg outline-none animate-fade-in",
            sizeClass[size],
          )}
        >
          {(title || showClose) && (
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                {title ? (
                  <RDialog.Title className="text-lg font-semibold text-text-primary">
                    {title}
                  </RDialog.Title>
                ) : (
                  <RDialog.Title className="sr-only">{fallbackTitle}</RDialog.Title>
                )}
                {description ? (
                  <RDialog.Description className="mt-1 text-sm text-text-secondary">
                    {description}
                  </RDialog.Description>
                ) : (
                  <RDialog.Description className="sr-only">{fallbackDescription}</RDialog.Description>
                )}
              </div>
              {showClose && (
                <RDialog.Close className="rounded-sm p-1 text-text-secondary hover:bg-bg-tertiary hover:text-text-primary">
                  <X size={16} />
                </RDialog.Close>
              )}
            </div>
          )}
          {/* Always mount an sr-only Title/Description pair so Radix's a11y
              requirements are met even when no header is rendered. */}
          {!(title || showClose) && (
            <>
              <RDialog.Title className="sr-only">{fallbackTitle}</RDialog.Title>
              <RDialog.Description className="sr-only">{fallbackDescription}</RDialog.Description>
            </>
          )}
          {children}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
