import { describe, expect, it } from "vitest";
import { createHistory } from "@/newtab/canvas/history";

describe("createHistory", () => {
  it("压栈、撤销、重做的基本链条", () => {
    const h = createHistory<string>();
    h.push("A");
    h.push("B");

    expect(h.undo("C")).toBe("B");
    expect(h.undo("B")).toBe("A");
    expect(h.canUndo()).toBe(false);
    expect(h.undo("A")).toBeNull();

    expect(h.redo("A")).toBe("B");
    expect(h.redo("B")).toBe("C");
    expect(h.canRedo()).toBe(false);
    expect(h.redo("C")).toBeNull();
  });

  it("新操作清空重做栈", () => {
    const h = createHistory<string>();
    h.push("A");
    expect(h.undo("B")).toBe("A");
    expect(h.canRedo()).toBe(true);
    h.push("A2");
    expect(h.canRedo()).toBe(false);
    expect(h.undo("C")).toBe("A2");
  });

  it("超出上限时丢弃最旧快照", () => {
    const h = createHistory<number>(3);
    h.push(1);
    h.push(2);
    h.push(3);
    h.push(4);
    expect(h.depth()).toBe(3);
    expect(h.undo(5)).toBe(4);
    expect(h.undo(4)).toBe(3);
    expect(h.undo(3)).toBe(2);
    expect(h.undo(2)).toBeNull();
  });

  it("clear 清空双栈", () => {
    const h = createHistory<number>();
    h.push(1);
    h.undo(2);
    h.clear();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });
});
