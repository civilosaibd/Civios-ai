import type { CadDocument } from "./geometry";

export const MAX_CAD_HISTORY = 100;

/** Record the current document before a committed edit, keeping history bounded. */
export function recordCadEdit(past: CadDocument[], current: CadDocument): CadDocument[] {
  return [...past.slice(-(MAX_CAD_HISTORY - 1)), current];
}

export type CadHistoryTransition = {
  document: CadDocument;
  past: CadDocument[];
  future: CadDocument[];
};

/** Move one snapshot from undo history to redo history, without mutating either stack. */
export function undoCadDocument(
  current: CadDocument,
  past: CadDocument[],
  future: CadDocument[],
): CadHistoryTransition | null {
  if (past.length === 0) return null;
  return {
    document: past[past.length - 1],
    past: past.slice(0, -1),
    future: [...future, current].slice(-MAX_CAD_HISTORY),
  };
}

/** Restore the next redo snapshot and put the current document back on undo history. */
export function redoCadDocument(
  current: CadDocument,
  past: CadDocument[],
  future: CadDocument[],
): CadHistoryTransition | null {
  if (future.length === 0) return null;
  return {
    document: future[0],
    past: [...past, current].slice(-MAX_CAD_HISTORY),
    future: future.slice(1),
  };
}
