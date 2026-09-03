import { beforeEach, describe, expect, it } from "vitest";

const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  },
  configurable: true,
});

import { useStore } from "./store";

const selection = [
  { id: "one", weight: 1, order: 0, source: "user" as const },
  { id: "two", weight: 1, order: 1, source: "user" as const },
];

describe("selection history", () => {
  beforeEach(() => {
    values.clear();
    useStore.getState().replaceSelection(selection);
  });

  it("undoes weight, reorder, removal, and clear", () => {
    const store = useStore.getState();
    store.weight("one", 1.4);
    useStore.getState().undo();
    expect(useStore.getState().selected[0].weight).toBe(1);

    useStore.getState().reorder("two", "one");
    useStore.getState().undo();
    expect(useStore.getState().selected.map((item) => item.id)).toEqual(["one", "two"]);

    useStore.getState().remove("one");
    useStore.getState().undo();
    expect(useStore.getState().selected).toHaveLength(2);

    useStore.getState().clear();
    useStore.getState().undo();
    expect(useStore.getState().selected).toHaveLength(2);
  });
});
