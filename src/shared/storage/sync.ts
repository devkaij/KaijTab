/**
 * 浏览器账号同步：把可同步快照切成 7KB 的块写进 chrome.storage.sync。
 * 配额：sync 总量 100KB、单项 8KB。超限直接拒绝（抛错），绝不静默截断。
 */
import type { RootState, SyncableSnapshot } from "../types";

export const SYNC_CHUNK_BYTES = 7000;
export const SYNC_SAFE_TOTAL_BYTES = 100 * 1024;
export const SYNC_META_KEY = "sync:meta";

export interface SyncMeta {
  v: 1;
  chunks: number;
}

export class SyncQuotaError extends Error {
  constructor(public readonly bytes: number) {
    super(`同步数据 ${bytes} 字节，超出安全上限 ${SYNC_SAFE_TOTAL_BYTES} 字节`);
    this.name = "SyncQuotaError";
  }
}

const encoder = new TextEncoder();

export function byteLength(text: string): number {
  return encoder.encode(text).length;
}

/** 按 UTF-8 字节数切块，且不切开代理对（lone surrogate 会破坏字符串）。 */
export function splitUtf8(text: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  let bytes = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    let charBytes = 1;
    if (code > 0x7f) {
      if (code >= 0xd800 && code <= 0xdbff) {
        // 高代理，与随后的低代理共同算 4 字节
        charBytes = 4;
        i++; // 跳过配对的低代理
      } else if (code >= 0x800) {
        charBytes = 3;
      } else {
        charBytes = 2;
      }
    }

    if (bytes + charBytes > maxBytes && i > start) {
      chunks.push(text.slice(start, i));
      start = i;
      bytes = 0;
    }
    bytes += charBytes;
  }

  if (start < text.length) {
    chunks.push(text.slice(start));
  }
  return chunks;
}

export function toSyncSnapshot(state: RootState): SyncableSnapshot {
  return {
    layout: state.layout,
    shortcuts: state.shortcuts,
    modules: state.modules,
    settings: state.settings,
  };
}

export function applySyncSnapshot(state: RootState, snapshot: SyncableSnapshot): RootState {
  return {
    ...state,
    layout: snapshot.layout,
    shortcuts: snapshot.shortcuts,
    modules: snapshot.modules,
    settings: snapshot.settings,
  };
}

export interface PackedSync {
  items: Record<string, string>;
  meta: SyncMeta;
  bytes: number;
}

export function packForSync(snapshot: SyncableSnapshot): PackedSync {
  const json = JSON.stringify(snapshot);
  const bytes = byteLength(json);
  if (bytes > SYNC_SAFE_TOTAL_BYTES) {
    throw new SyncQuotaError(bytes);
  }
  const chunks = splitUtf8(json, SYNC_CHUNK_BYTES);
  const items: Record<string, string> = {};
  chunks.forEach((chunk, i) => {
    items[`sync:chunk:${i}`] = chunk;
  });
  const meta: SyncMeta = { v: 1, chunks: chunks.length };
  items[SYNC_META_KEY] = JSON.stringify(meta);
  return { items, meta, bytes };
}

/** 比对上一次与这一次的块数，返回需要删除的过期 chunk 键。 */
export function staleChunkKeys(prevChunks: number, nextChunks: number): string[] {
  const stale: string[] = [];
  for (let i = nextChunks; i < prevChunks; i++) {
    stale.push(`sync:chunk:${i}`);
  }
  return stale;
}

export function unpackSync(data: Record<string, unknown>): SyncableSnapshot | null {
  const metaRaw = data[SYNC_META_KEY];
  if (typeof metaRaw !== "string") return null;

  let meta: SyncMeta;
  try {
    meta = JSON.parse(metaRaw) as SyncMeta;
  } catch {
    return null;
  }
  if (meta.v !== 1 || typeof meta.chunks !== "number" || meta.chunks <= 0) return null;

  let json = "";
  for (let i = 0; i < meta.chunks; i++) {
    const chunk = data[`sync:chunk:${i}`];
    if (typeof chunk !== "string") return null;
    json += chunk;
  }

  try {
    return JSON.parse(json) as SyncableSnapshot;
  } catch {
    return null;
  }
}
