/**
 * schema 迁移框架。
 * 规则：永远不修改历史迁移；新增结构变更时：SCHEMA_VERSION +1，并追加一条迁移。
 */

export interface Migration {
  from: number;
  to: number;
  migrate(state: Record<string, unknown>): Record<string, unknown>;
}

/** 真实迁移列表。v1 是起始版本，暂无迁移。 */
export const migrations: Migration[] = [];

export interface MigrationResult {
  state: Record<string, unknown>;
  /** 实际执行的迁移起点（已是目标版本则为 null） */
  fromVersion: number | null;
  toVersion: number;
}

export function runMigrations(
  raw: Record<string, unknown>,
  list: Migration[],
  target: number,
): MigrationResult {
  let version =
    typeof raw.schemaVersion === "number" && Number.isFinite(raw.schemaVersion)
      ? raw.schemaVersion
      : 1;
  const startVersion = version;

  let state = raw;
  const guard = 100;

  for (let i = 0; i < guard; i++) {
    if (version >= target) break;
    const step = list.find((m) => m.from === version);
    if (!step) {
      throw new Error(`缺少从 v${version} 到 v${target} 的迁移`);
    }
    state = step.migrate(state);
    version = step.to;
    state = { ...state, schemaVersion: version };
  }

  if (version < target) {
    throw new Error(`迁移未到达目标版本 v${target}（停在 v${version}）`);
  }

  return {
    state,
    fromVersion: startVersion === version ? null : startVersion,
    toVersion: version,
  };
}
