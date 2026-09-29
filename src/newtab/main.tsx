import { render } from "preact";
import { App } from "./App";
import "./styles/theme.css";
import "./styles/global.css";

render(<App />, document.getElementById("app")!);
