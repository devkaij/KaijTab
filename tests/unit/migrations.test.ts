import { describe, expect, it } from "vitest";
import { runMigrations, type Migration } from "@/shared/migrations";

const v1to2: Migration = {
  from: 1,
  to: 2,
  migrate: (s) => ({ ...s, addedInV2: true }),
};
const v2to3: Migration = {
  from: 2,
  to: 3,
  migrate: (s) => ({ ...s, addedInV3: s.addedInV2 === true }),
};

describe("runMigrations", () => {
  it("已是目标版本时不执行迁移", () => {
    const result = runMigrations({ schemaVersion: 3, keep: 1 }, [v1to2, v2to3], 3);
    expect(result.fromVersion).toBeNull();
    expect(result.toVersion).toBe(3);
    expect(result.state).toEqual({ schemaVersion: 3, keep: 1 });
  });

  it("链式执行多个迁移并逐步更新版本号", () => {
    const result = runMigrations({ schemaVersion: 1 }, [v1to2, v2to3], 3);
    expect(result.fromVersion).toBe(1);
    expect(result.toVersion).toBe(3);
    expect(result.state.addedInV2).toBe(true);
    expect(result.state.addedInV3).toBe(true);
    expect(result.state.schemaVersion).toBe(3);
  });

  it("缺少中间步骤时抛错", () => {
    expect(() => runMigrations({ schemaVersion: 1 }, [v2to3], 3)).toThrow(/缺少从 v1/);
  });

  it("迁移未到达目标版本时抛错", () => {
    const stuck: Migration = { from: 1, to: 1, migrate: (s) => s };
    expect(() => runMigrations({ schemaVersion: 1 }, [stuck], 2)).toThrow();
  });

  it("无版本号时按 v1 处理", () => {
    const result = runMigrations({}, [v1to2], 2);
    expect(result.fromVersion).toBe(1);
    expect(result.state.schemaVersion).toBe(2);
  });
});
