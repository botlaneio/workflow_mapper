import { describe, expect, it } from "vitest";
import { BOTLANE_CATALOG } from "./catalog";
import { PUBLIC_FLAGS } from "./public-catalog";
import { buildOpportunities, stepArea, stepHoursPerWeek, toRevealed } from "./estimate";
import { formatHours } from "./format";

describe("estimate", () => {
  it("uses the highest factor and the first flag's area", () => {
    expect(stepHoursPerWeek(60, 10, ["manual", "rekey"], BOTLANE_CATALOG)).toBe(9);
    expect(stepHoursPerWeek(50, 7, ["rekey"], BOTLANE_CATALOG)).toBeCloseTo(5.25);
    expect(formatHours(5.25)).toBe("5.3");
    expect(stepArea(["rekey", "missed"], undefined, BOTLANE_CATALOG)).toBe("front");
    expect(stepArea(["rekey"], "fin", BOTLANE_CATALOG)).toBe("fin");
    expect(stepHoursPerWeek(60, 10, [], BOTLANE_CATALOG)).toBe(0);
  });

  it("ranks three steps and does not invent hours without runs", () => {
    const model = buildOpportunities({
      runsPerWeek: 7,
      catalog: BOTLANE_CATALOG,
      overrides: { b: "fin" },
      pains: [{ text: "We lose the thread", area: undefined }],
      steps: [
        { id: "a", title: "Enter order", minutes: 50, waitHours: 1, flags: ["rekey"], roleName: "Accounts", index: 0 },
        { id: "b", title: "Chase payment", minutes: 10, waitHours: 48, flags: ["payment"], roleName: "Accounts", index: 1 },
      ],
    });
    expect(model.ranked[0]?.title).toBe("Enter order");
    expect(model.ranked[0]?.hours).toBeCloseTo(5.25);
    expect(model.groups.find((group) => group.area === "fin")?.items[0]?.title).toBe("Chase payment");
    expect(model.unassignedPains).toEqual(["We lose the thread"]);
    const revealed = toRevealed(model);
    expect(revealed.total).toBe("~" + formatHours(model.totalHours) + " h/week");
    expect(JSON.stringify(revealed)).not.toContain("Connect the tools");
    expect(JSON.stringify(revealed)).not.toContain("factor");
  });

  it("keeps public flags free of factors and fixes", () => {
    expect(PUBLIC_FLAGS.map((flag) => flag.key)).toEqual(BOTLANE_CATALOG.flagOrder);
    for (const flag of PUBLIC_FLAGS) {
      expect(flag.label).toBe(BOTLANE_CATALOG.flags[flag.key].label);
    }
    const blob = JSON.stringify(PUBLIC_FLAGS);
    expect(blob).not.toContain("factor");
    expect(blob).not.toContain("pass warm ones");
  });
});
