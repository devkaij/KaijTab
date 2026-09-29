import { render } from "preact";
import { App } from "./App";
import * as store from "./store";
import "./styles/theme.css";
import "./styles/global.css";
import "./styles/canvas.css";
import "./styles/widgets.css";

// 调试/E2E 入口：自用项目，保留可观测性
declare global {
  interface Window {
    __kaijtab?: typeof store;
  }
}
window.__kaijtab = store;

render(<App />, document.getElementById("app")!);
