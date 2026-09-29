import { describe, expect, it } from "vitest";
import {
  applySyncSnapshot,
  byteLength,
  packForSync,
  staleChunkKeys,
  SyncQuotaError,
  SYNC_CHUNK_BYTES,
  unpackSync,
} from "@/shared/storage/sync";
import { createDefaultState } from "@/shared/storage/defaults";
import type { RootState, SyncableSnapshot } from "@/shared/types";

function snapshotWith(text: string): SyncableSnapshot {
  const state = createDefaultState();
  state.shortcuts.items.push({
    id: "sc_1",
    groupId: "grp_default",
    title: text,
    url: "https://example.com",
  });
  return {
    layout: state.layout,
    shortcuts: state.shortcuts,
    modules: state.modules,
    settings: state.settings,
  };
}

describe("splitUtf8 / packForSync / unpackSync", () => {
  it("往返一致（含中文与 emoji 代理对）", () => {
    const snapshot = snapshotWith("中文标题🎉🚀测试".repeat(400));
    const packed = packForSync(snapshot);
    const restored = unpackSync(packed.items);
    expect(restored).toEqual(snapshot);
  });

  it("每个分块不超过 7000 字节", () => {
    const snapshot = snapshotWith("多字节内容".repeat(2000));
    const packed = packForSync(snapshot);
    for (const [key, value] of Object.entries(packed.items)) {
      expect(byteLength(value), key).toBeLessThanOrEqual(SYNC_CHUNK_BYTES);
    }
    expect(packed.meta.chunks).toBeGreaterThan(1);
  });

  it("不切开代理对", () => {
    const snapshot = snapshotWith("🚀".repeat(1000));
    const packed = packForSync(snapshot);
    for (const [key, value] of Object.entries(packed.items)) {
      if (!key.startsWith("sync:chunk:")) continue;
      const last = value.charCodeAt(value.length - 1);
      expect(last >= 0xd800 && last <= 0xdbff, `${key} 以孤立高位代理结尾`).toBe(false);
    }
    expect(unpackSync(packed.items)).toEqual(snapshot);
  });

  it("超出安全配额时拒绝", () => {
    const huge = snapshotWith("超".repeat(80 * 1024));
    expect(() => packForSync(huge)).toThrow(SyncQuotaError);
  });

  it("meta 缺失或分块缺失时返回 null", () => {
    const snapshot = snapshotWith("abc");
    const packed = packForSync(snapshot);
    expect(unpackSync({})).toBeNull();

    const missingChunk = { ...packed.items };
    delete missingChunk["sync:chunk:0"];
    expect(unpackSync(missingChunk)).toBeNull();

    expect(unpackSync({ "sync:meta": "{bad json" })).toBeNull();
  });
});

describe("staleChunkKeys", () => {
  it("返回缩小后应删除的块", () => {
    expect(staleChunkKeys(5, 2)).toEqual(["sync:chunk:2", "sync:chunk:3", "sync:chunk:4"]);
    expect(staleChunkKeys(2, 5)).toEqual([]);
  });
});

describe("applySyncSnapshot", () => {
  it("只覆盖可同步部分，壁纸与私有数据不动", () => {
    const local: RootState = {
      ...createDefaultState(),
      wallpaperCurrent: "wp_1",
      moduleData: { "clock:inst_1": { tz: "UTC" } },
    };
    const incoming = snapshotWith("来自另一台设备");
    const merged = applySyncSnapshot(local, incoming);
    expect(merged.shortcuts.items[0]?.title).toBe("来自另一台设备");
    expect(merged.wallpaperCurrent).toBe("wp_1");
    expect(merged.moduleData["clock:inst_1"]).toEqual({ tz: "UTC" });
  });
});
