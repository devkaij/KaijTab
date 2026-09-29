/** 撤销/重做：存储"操作前快照"，提交式压栈。纯数据结构，无副作用。 */

export interface History<T> {
  push(before: T): void;
  undo(current: T): T | null;
  redo(current: T): T | null;
  canUndo(): boolean;
  canRedo(): boolean;
  depth(): number;
  clear(): void;
}

export function createHistory<T>(limit = 50): History<T> {
  const past: T[] = [];
  const future: T[] = [];

  return {
    push(before: T) {
      past.push(before);
      if (past.length > limit) past.shift();
      future.length = 0;
    },
    undo(current: T) {
      const prev = past.pop();
      if (prev === undefined) return null;
      future.push(current);
      return prev;
    },
    redo(current: T) {
      const next = future.pop();
      if (next === undefined) return null;
      past.push(current);
      if (past.length > limit) past.shift();
      return next;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    depth: () => past.length,
    clear() {
      past.length = 0;
      future.length = 0;
    },
  };
}
