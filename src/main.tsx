import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { applyCachedTheme } from "@/lib/theme-cache";
import "@/lib/monaco-setup";
import { installAppLifecycle } from "@/lib/app-lifecycle";
import { startAppBootstrap } from "@/lib/app-startup";
import "@/store/editor";
import { initCore } from "@/core/runtime";
import "./index.css";

applyCachedTheme();
initCore();
installAppLifecycle();
void startAppBootstrap();

const rootEl = document.getElementById("root");

ReactDOM.createRoot(rootEl!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
