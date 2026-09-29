import { useEffect, useState } from "preact/hooks";
import { bootstrap, editing } from "./store";
import { Canvas } from "./canvas/Canvas";
import { Toolbar } from "./editor/Toolbar";
import { useKeyboard } from "./canvas/useKeyboard";
import { ShortcutEditor } from "./core/ShortcutEditor";

export function App() {
  const [ready, setReady] = useState(false);
  useKeyboard();

  useEffect(() => {
    void bootstrap().then(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <div class="kt-app" data-editing={editing.value ? "true" : "false"}>
      <Canvas />
      <Toolbar />
      <ShortcutEditor />
    </div>
  );
}
