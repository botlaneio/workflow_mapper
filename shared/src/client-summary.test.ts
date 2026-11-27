import { describe, expect, it } from "vitest";
import { BOTLANE_CATALOG } from "./catalog";
import { buildClientSummary } from "./client-summary";

describe("client summary", () => {
  it("keeps area names and drops fixes, factors, and private notes", () => {
    const summary = buildClientSummary({
      company: "Sample Metals",
      contact: "Ravi",
      contactRole: "Owner",
      city: "Pune",
      product: "Parts",
      teamSize: "40",
      processName: "Enquiry to dispatch",
      runUnit: "order",
      runsPerWeek: 7,
      roles: [{ id: "r1", name: "Accounts" }],
      steps: [{
        id: "s1",
        title: "Enter the order",
        roleId: "r1",
        tool: "Tally",
        minutes: 50,
        waitValue: 2,
        waitUnit: "h",
        flags: ["rekey"],
      }],
      pains: ["We type it twice"],
      whatGood: "The order would land in Tally by itself",
      overrides: { s1: "fin" },
    }, BOTLANE_CATALOG);
    const blob = JSON.stringify(summary);
    expect(summary.noticed[0]?.area).toBe("Financial Administration");
    expect(summary.totalHours).toContain("h/week");
    expect(blob).not.toContain("Connect the tools");
    expect(blob).not.toContain("factor");
    expect(blob).not.toContain("pricingHint");
    expect(blob).not.toContain("areaOverrides");
    expect(blob).not.toContain("SENTINEL");
    expect(summary.pains).toEqual(["We type it twice"]);
  });
});
