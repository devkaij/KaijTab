import { useEffect, useState } from "preact/hooks";
import { bootstrap, editing } from "./store";
import { Canvas } from "./canvas/Canvas";
import { Toolbar } from "./editor/Toolbar";
import { useKeyboard } from "./canvas/useKeyboard";
import { ShortcutEditor } from "./core/ShortcutEditor";
import { WallpaperLayer } from "./core/wallpaper/WallpaperLayer";
import { WallpaperPanel } from "./core/wallpaper/WallpaperPanel";
import { ModuleCenter } from "./module-host/ModuleCenter";
import { InstanceSettingsDialog } from "./module-host/InstanceSettings";

export function App() {
  const [ready, setReady] = useState(false);
  useKeyboard();

  useEffect(() => {
    void bootstrap().then(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <div class="kt-app" data-editing={editing.value ? "true" : "false"}>
      <WallpaperLayer />
      <Canvas />
      <Toolbar />
      <ModuleCenter />
      <InstanceSettingsDialog />
      <WallpaperPanel />
      <ShortcutEditor />
    </div>
  );
}
