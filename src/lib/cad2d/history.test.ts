import { describe, expect, it } from "vitest";
import { createEmptyDocument } from "./geometry";
import { MAX_CAD_HISTORY, recordCadEdit, redoCadDocument, undoCadDocument } from "./history";

describe("CAD undo/redo history", () => {
  it("records edits in bounded history without mutating prior stacks", () => {
    const initial = createEmptyDocument("mm");
    const past = [createEmptyDocument("cm")];
    const next = recordCadEdit(past, initial);
    expect(next).toHaveLength(2);
    expect(next[0].units).toBe("cm");
    expect(next[1]).toBe(initial);
    expect(past).toHaveLength(1);
    const bounded = Array.from({ length: MAX_CAD_HISTORY + 5 }, (_, i) => createEmptyDocument(i % 2 ? "mm" : "cm"))
      .reduce((history, document) => recordCadEdit(history, document), [] as ReturnType<typeof createEmptyDocument>[]);
    expect(bounded).toHaveLength(MAX_CAD_HISTORY);
  });

  it("undoes and redoes snapshots in order without mutating source stacks", () => {
    const a = createEmptyDocument("mm");
    const b = createEmptyDocument("cm");
    const c = createEmptyDocument("m");
    const undo = undoCadDocument(c, [a, b], []);
    expect(undo).toEqual({ document: b, past: [a], future: [c] });
    const redo = redoCadDocument(undo!.document, undo!.past, undo!.future);
    expect(redo).toEqual({ document: c, past: [a, b], future: [] });
    expect(undoCadDocument(a, [], [])).toBeNull();
    expect(redoCadDocument(a, [], [])).toBeNull();
  });

  it("caps redo and undo stacks to the same history limit", () => {
    const docs = Array.from({ length: MAX_CAD_HISTORY + 3 }, (_, i) => createEmptyDocument(i % 2 ? "mm" : "cm"));
    const undo = undoCadDocument(createEmptyDocument("m"), docs, []);
    expect(undo?.past).toHaveLength(MAX_CAD_HISTORY);
    const redo = redoCadDocument(createEmptyDocument("ft"), [], docs);
    expect(redo?.future).toHaveLength(MAX_CAD_HISTORY - 1);
  });
});
