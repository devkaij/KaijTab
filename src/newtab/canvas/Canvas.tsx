import { editing, selectedId, state } from "@/newtab/store";
import { CanvasItem } from "./CanvasItem";
import { ContextMenuHost } from "./ContextMenu";
import { GuidesOverlay } from "./Guides";

export function Canvas() {
  const items = state.value.layout.items;

  return (
    <div
      class="kt-canvas"
      data-editing={editing.value ? "true" : "false"}
      onPointerDown={() => {
        if (editing.value) selectedId.value = null;
      }}
    >
      <GuidesOverlay />
      {items.map((item) => (
        <CanvasItem key={item.id} item={item} />
      ))}
      <ContextMenuHost />
    </div>
  );
}
