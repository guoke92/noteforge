import { useEffect, useRef, useState } from "react";
import { isTauri } from "@/ipc";
import {
  dragEventHasFiles,
  handleBrowserFileDrop,
  openDroppedPaths,
} from "@/lib/file-drop";

const DROP_DEBOUNCE_MS = 400;

/** Global drag-and-drop to open files / vault folders in NoteForge. */
export function useFileDrop(enabled = true): boolean {
  const [active, setActive] = useState(false);
  const depthRef = useRef(0);
  const dropLockRef = useRef(false);
  const lastDropAtRef = useRef(0);
  const pendingPathsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!enabled) return;

    let unlistenTauri: (() => void) | undefined;
    let disposed = false;

    const shouldHandleDrop = (): boolean => {
      const now = Date.now();
      if (dropLockRef.current || now - lastDropAtRef.current < DROP_DEBOUNCE_MS) {
        return false;
      }
      dropLockRef.current = true;
      lastDropAtRef.current = now;
      return true;
    };

    const releaseDropLock = (): void => {
      window.setTimeout(() => {
        dropLockRef.current = false;
      }, DROP_DEBOUNCE_MS);
    };

    const onDropError = (err: unknown): void => {
      console.error("File drop failed", err);
      const message = err instanceof Error ? err.message : String(err);
      window.alert(`拖放打开失败：${message}`);
    };

    const finishDrop = (): void => {
      depthRef.current = 0;
      setActive(false);
    };

    const processPaths = (paths: string[] | undefined): void => {
      if (!shouldHandleDrop()) return;
      finishDrop();
      void openDroppedPaths(paths ?? [])
        .catch(onDropError)
        .finally(releaseDropLock);
    };

    const onDragEnter = (event: DragEvent) => {
      if (!dragEventHasFiles(event)) return;
      event.preventDefault();
      depthRef.current += 1;
      setActive(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (!dragEventHasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };

    const onDragLeave = (event: DragEvent) => {
      if (!dragEventHasFiles(event)) return;
      event.preventDefault();
      depthRef.current = Math.max(0, depthRef.current - 1);
      if (depthRef.current === 0) setActive(false);
    };

    const onDrop = (event: DragEvent) => {
      if (!dragEventHasFiles(event)) return;
      if (!shouldHandleDrop()) return;
      finishDrop();
      void handleBrowserFileDrop(event)
        .catch(onDropError)
        .finally(releaseDropLock);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);

    if (isTauri()) {
      void import("@tauri-apps/api/webviewWindow")
        .then(({ getCurrentWebviewWindow }) =>
          getCurrentWebviewWindow().onDragDropEvent((event) => {
            const payload = event.payload;
            if (payload.type === "enter") {
              pendingPathsRef.current = payload.paths ?? [];
              setActive(true);
              return;
            }
            if (payload.type === "over") {
              setActive(true);
              return;
            }
            if (payload.type === "leave") {
              pendingPathsRef.current = [];
              setActive(false);
              return;
            }
            if (payload.type === "drop") {
              const paths =
                (payload.paths?.length ? payload.paths : pendingPathsRef.current) ?? [];
              pendingPathsRef.current = [];
              if (paths.length === 0) {
                finishDrop();
                return;
              }
              processPaths(paths);
            }
          }),
        )
        .then((fn) => {
          if (disposed) {
            fn();
            return;
          }
          unlistenTauri = fn;
        })
        .catch((err) => {
          console.warn("Tauri file drop listener unavailable", err);
        });
    }

    return () => {
      disposed = true;
      unlistenTauri?.();
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [enabled]);

  return active;
}
