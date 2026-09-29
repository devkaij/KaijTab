import {
  bringToFront,
  contextMenu,
  duplicateInstance,
  editing,
  moduleSettingsFor,
  removeInstance,
  selectedId,
  sendToBack,
  state,
  toggleLock,
} from "@/newtab/store";
import { hasSettings } from "@/newtab/module-host/InstanceSettings";

const MENU_W = 168;
const MENU_H = 280;

export function ContextMenuHost() {
  const menu = contextMenu.value;
  if (!menu) return null;

  const item = state.value.layout.items.find((i) => i.id === menu.itemId);
  if (!item) return null;

  const x = Math.max(8, Math.min(menu.x, window.innerWidth - MENU_W - 8));
  const y = Math.max(8, Math.min(menu.y, window.innerHeight - MENU_H - 8));

  const action = (fn: () => void) => () => {
    fn();
    contextMenu.value = null;
  };

  return (
    <>
      <div class="kt-menu-backdrop" onPointerDown={() => (contextMenu.value = null)} />
      <div class="kt-menu" style={{ left: `${x}px`, top: `${y}px` }} data-testid="item-menu">
        <button class="kt-menu-item" onClick={action(() => bringToFront(menu.itemId))}>
          置顶
        </button>
        <button class="kt-menu-item" onClick={action(() => sendToBack(menu.itemId))}>
          置底
        </button>
        <button class="kt-menu-item" onClick={action(() => duplicateInstance(menu.itemId))}>
          复制
        </button>
        {hasSettings(item) ? (
          <button
            class="kt-menu-item"
            onClick={action(() => (moduleSettingsFor.value = item))}
            data-testid="menu-settings"
          >
            设置
          </button>
        ) : null}
        <div class="kt-menu-sep" />
        <button class="kt-menu-item" onClick={action(() => toggleLock(menu.itemId))}>
          {item.locked ? "解锁" : "锁定"}
        </button>
        <button
          class="kt-menu-item kt-menu-danger"
          onClick={action(() => removeInstance(menu.itemId))}
          data-testid="menu-delete"
        >
          删除
        </button>
      </div>
    </>
  );
}

export function openContextMenu(itemId: string, x: number, y: number): void {
  if (!editing.value) return;
  selectedId.value = itemId;
  contextMenu.value = { itemId, x, y };
}
