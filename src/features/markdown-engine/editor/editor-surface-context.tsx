import { createContext, useContext } from "react";

export type EditorSurfaceContextValue = {
  /** Workspace file path for resolving relative assets (images). */
  documentPath: string;
};

const EditorSurfaceContext = createContext<EditorSurfaceContextValue>({
  documentPath: "",
});

export function EditorSurfaceProvider({
  documentPath,
  children,
}: {
  documentPath: string;
  children: React.ReactNode;
}) {
  return (
    <EditorSurfaceContext.Provider value={{ documentPath }}>
      {children}
    </EditorSurfaceContext.Provider>
  );
}

export function useEditorSurfaceContext(): EditorSurfaceContextValue {
  return useContext(EditorSurfaceContext);
}
