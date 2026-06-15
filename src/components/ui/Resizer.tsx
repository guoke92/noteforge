import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ResizerProps {
  position: "left" | "right";
  onResize: (delta: number) => void;
  className?: string;
}

export function Resizer({ position, onResize, className }: ResizerProps) {
  const [active, setActive] = useState(false);
  const startX = useRef(0);

  useEffect(() => {
    if (!active) return;
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - startX.current;
      startX.current = e.clientX;
      onResize(position === "left" ? -delta : delta);
    };
    const onUp = () => setActive(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [active, position, onResize]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className={cn(
        "z-10 w-1 cursor-col-resize bg-transparent transition-colors hover:bg-accent/40",
        active && "bg-accent/50",
        className,
      )}
      onMouseDown={(e) => {
        startX.current = e.clientX;
        setActive(true);
      }}
    />
  );
}
