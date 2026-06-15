import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-7 w-full rounded-sm border border-border bg-bg-primary px-2 text-sm text-text-primary",
      "placeholder:text-text-tertiary focus:border-border-focus focus:outline-none",
      className,
    )}
    {...props}
  />
));

Input.displayName = "Input";
