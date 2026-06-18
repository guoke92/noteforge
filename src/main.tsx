import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { applyCachedTheme } from "@/lib/theme-cache";
import { perfLog, perfMarkBootOrigin, perfSync } from "@/lib/startup-perf";
import { installAppLifecycle } from "@/lib/app-lifecycle";
import { startAppBootstrap } from "@/lib/app-startup";
import "@/store/editor";
import { initCore } from "@/core/runtime";
import "./index.css";

perfMarkBootOrigin("main.tsx");
perfSync("main.applyCachedTheme", () => {
  const effective = applyCachedTheme();
  perfLog("main.theme.cached", { effective });
});
perfSync("main.initCore", () => initCore());
perfSync("main.installAppLifecycle", () => installAppLifecycle());
perfLog("main.startAppBootstrap");
void startAppBootstrap();

const rootEl = document.getElementById("root");

perfSync("main.react.render", () => {
  ReactDOM.createRoot(rootEl!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
