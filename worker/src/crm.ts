export interface CrmPush {
  companyName: string;
  contactName: string;
  contactRole: string;
  city: string;
  processName: string;
  noteTitle: string;
  noteBody: string;
  summaryUrl: string;
}

export interface CrmResult {
  ok: true;
  adapter: "noop" | "mock";
  reference: string;
}

export interface CrmAdapter {
  readonly name: "noop" | "mock";
  push(input: CrmPush): Promise<CrmResult>;
}

/** Default. Does not call the network and does not store the note. */
export class NoopCrmAdapter implements CrmAdapter {
  readonly name = "noop" as const;
  async push(): Promise<CrmResult> {
    return { ok: true, adapter: "noop", reference: "not-connected" };
  }
}

/** Local stand-in. Remembers the last push in this isolate so a test can see it. Still no HTTP. */
export class MockCrmAdapter implements CrmAdapter {
  readonly name = "mock" as const;
  last: CrmPush | null = null;
  async push(input: CrmPush): Promise<CrmResult> {
    this.last = input;
    return { ok: true, adapter: "mock", reference: "mock-1" };
  }
}

let mock: MockCrmAdapter | null = null;

export function crmAdapter(mode: string | undefined): CrmAdapter {
  if (mode === "mock") {
    mock ??= new MockCrmAdapter();
    return mock;
  }
  return new NoopCrmAdapter();
}

export function crmPushFromSummary(input: {
  company: string;
  contact: string;
  contactRole: string;
  city: string;
  processName: string;
  summaryText: string;
  summaryUrl: string;
}): CrmPush {
  const processName = input.processName || "Untitled process";
  return {
    companyName: input.company || "Untitled client",
    contactName: input.contact || "",
    contactRole: input.contactRole || "",
    city: input.city || "",
    processName,
    noteTitle: `Workflow map: ${processName}`,
    noteBody: `${input.summaryText}\n\n${input.summaryUrl}`,
    summaryUrl: input.summaryUrl,
  };
}
