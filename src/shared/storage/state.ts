/** 状态加载与自动保存：chrome.storage.local 为唯一事实来源。 */
import { SCHEMA_VERSION, type RootState } from "../types";
import { mergeDefaults } from "./defaults";
import { migrations as realMigrations, runMigrations, type Migration } from "../migrations";
import { chromeLocal, type KVStore } from "./kv";

export const STATE_KEY = "state";

export interface LoadResult {
  state: RootState;
  /** 执行过的迁移起点版本，没有迁移则为 null */
  migratedFrom: number | null;
}

export async function loadState(
  store: KVStore = chromeLocal(),
  migrationList: Migration[] = realMigrations,
): Promise<LoadResult> {
  const data = await store.get(STATE_KEY);
  const raw = data[STATE_KEY];

  if (raw == null || typeof raw !== "object") {
    return { state: mergeDefaults(null), migratedFrom: null };
  }

  let record = raw as Record<string, unknown>;
  let migratedFrom: number | null = null;

  const currentVersion =
    typeof record.schemaVersion === "number" ? record.schemaVersion : SCHEMA_VERSION;

  if (currentVersion < SCHEMA_VERSION) {
    const result = runMigrations(record, migrationList, SCHEMA_VERSION);
    record = result.state;
    migratedFrom = result.fromVersion;
  }

  const state = mergeDefaults(record as Partial<RootState>);
  state.schemaVersion = SCHEMA_VERSION;
  return { state, migratedFrom };
}

export async function saveState(
  state: RootState,
  store: KVStore = chromeLocal(),
): Promise<void> {
  await store.set({ [STATE_KEY]: state });
}

/** 拖拽这类高频场景用：合并多次请求，只落最后一次。 */
export function createAutoSaver(
  getState: () => RootState,
  store: KVStore = chromeLocal(),
  delayMs = 300,
): { save: () => void; flush: () => Promise<void> } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: Promise<void> = Promise.resolve();

  const flush = async () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    pending = saveState(getState(), store);
    await pending;
  };

  const save = () => {
    if (timer != null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void saveState(getState(), store);
    }, delayMs);
  };

  return { save, flush };
}
