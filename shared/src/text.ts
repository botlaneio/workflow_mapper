import * as Y from "yjs";

export type DeltaOp = { retain?: number; insert?: string; delete?: number };

/** Map a caret in the pre-change string through a Yjs text delta. */
export function applyDeltaToPos(pos: number, delta: DeltaOp[]): number {
  let oldIndex = 0;
  let shift = 0;
  for (const op of delta) {
    if (typeof op.retain === "number") {
      oldIndex += op.retain;
    } else if (typeof op.insert === "string") {
      if (pos >= oldIndex) shift += op.insert.length;
    } else if (typeof op.delete === "number") {
      if (pos >= oldIndex + op.delete) shift -= op.delete;
      else if (pos > oldIndex) shift -= pos - oldIndex;
      oldIndex += op.delete;
    }
  }
  return Math.max(0, pos + shift);
}

/** Apply the smallest insert/delete so two people can type in the same text without clobbering each other. */
export function diffApply(ytext: Y.Text, next: string): void {
  const prev = ytext.toString();
  if (prev === next) return;
  let start = 0;
  const min = Math.min(prev.length, next.length);
  while (start < min && prev[start] === next[start]) start++;
  let prevEnd = prev.length;
  let nextEnd = next.length;
  while (prevEnd > start && nextEnd > start && prev[prevEnd - 1] === next[nextEnd - 1]) {
    prevEnd--;
    nextEnd--;
  }
  const doc = ytext.doc;
  if (!doc) return;
  doc.transact(() => {
    if (prevEnd > start) ytext.delete(start, prevEnd - start);
    if (nextEnd > start) ytext.insert(start, next.slice(start, nextEnd));
  }, "local");
}
