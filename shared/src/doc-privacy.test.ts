import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { MANUFACTURING_TEMPLATES } from "./seed-data";
import { readPrivate, readShared, seedPrivate, seedShared } from "./doc";

describe("document split", () => {
  it("does not put private notes or discovery questions into the shared document", () => {
    const template = MANUFACTURING_TEMPLATES[0]!;
    const shared = new Y.Doc();
    const priv = new Y.Doc();
    seedShared(shared, {
      id: template.id,
      orgId: "botlane",
      industry: template.industry,
      name: template.name,
      runUnit: template.runUnit,
      roles: template.roles,
      steps: template.steps,
      questions: template.questions,
    });
    seedPrivate(priv, template.questions);
    const notes = priv.getMap("notesBag").get("body");
    if (notes instanceof Y.Text) notes.insert(0, "SENTINEL_PRIVATE_NOTE_zx91");
    const tags = priv.getMap("tags");
    const hint = tags.get("pricingHint");
    if (hint instanceof Y.Text) hint.insert(0, "SENTINEL_PRICE_HINT_qq");
    priv.getMap("areaOverrides").set("step", "fin");

    const sharedBytes = Y.encodeStateAsUpdate(shared);
    const sharedText = new TextDecoder().decode(sharedBytes);
    expect(sharedText).not.toContain("SENTINEL_PRIVATE_NOTE_zx91");
    expect(sharedText).not.toContain("SENTINEL_PRICE_HINT_qq");
    expect(sharedText).not.toContain(template.questions[0]!);
    expect(sharedText).not.toContain("areaOverrides");

    const snap = readShared(shared);
    expect(snap?.steps.length).toBe(template.steps.length);
    expect(snap?.steps[0]?.flags).toEqual([]);
    expect(snap?.steps[0]?.suggestedFlags).toEqual(template.steps[0]?.commonFlags);
    const hidden = readPrivate(priv);
    expect(hidden?.notes.toString()).toContain("SENTINEL_PRIVATE_NOTE_zx91");
    expect(hidden?.questions[0]).toBe(template.questions[0]);
  });
});
