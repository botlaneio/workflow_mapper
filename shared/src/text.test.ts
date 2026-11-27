import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { applyDeltaToPos, diffApply } from "./text";

describe("concurrent text", () => {
  it("keeps both insertions", () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const left = a.getText("t");
    const right = b.getText("t");
    left.insert(0, "Enquiry");
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    diffApply(left, "New Enquiry");
    diffApply(right, "Enquiry today");
    const fromA = Y.encodeStateAsUpdate(a, Y.encodeStateVector(b));
    const fromB = Y.encodeStateAsUpdate(b, Y.encodeStateVector(a));
    Y.applyUpdate(b, fromA);
    Y.applyUpdate(a, fromB);
    expect(left.toString()).toBe(right.toString());
    expect(left.toString()).toContain("New");
    expect(left.toString()).toContain("today");
  });

  it("maps a caret through a remote insert", () => {
    expect(applyDeltaToPos(5, [{ retain: 5 }, { insert: "!" }])).toBe(6);
    expect(applyDeltaToPos(0, [{ retain: 5 }, { insert: "!" }])).toBe(0);
    expect(applyDeltaToPos(5, [{ insert: "X" }, { retain: 5 }])).toBe(6);
  });
});
