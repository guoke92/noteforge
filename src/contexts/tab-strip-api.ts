import { createContext, useContext } from "react";

export interface TabStripApi {
  scrollTabIntoViewIfNeeded: (tabId: string) => void;
}

export const TabStripApiContext = createContext<TabStripApi | null>(null);

export function useTabStripApi(): TabStripApi | null {
  return useContext(TabStripApiContext);
}
