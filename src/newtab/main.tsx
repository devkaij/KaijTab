import { render } from "preact";
import { App } from "./App";
import * as store from "./store";
import { registerAppServiceWorker } from "@/shared/utils/app-url";
import "./styles/theme.css";
import "./styles/global.css";
import "./styles/canvas.css";
import "./styles/widgets.css";
import "./styles/wallpaper.css";
import "./styles/module-host.css";

// 调试/E2E 入口：自用项目，保留可观测性
declare global {
  interface Window {
    __kaijtab?: typeof store;
  }
}
window.__kaijtab = store;

// 纯网页 / PWA 模式：注册应用级 Service Worker（扩展环境自动跳过）
registerAppServiceWorker();

render(<App />, document.getElementById("app")!);
