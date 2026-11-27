import * as Y from "yjs";
import type { FlagKey, TemplateStep, WaitUnit } from "./types";

export interface TemplateSeed {
  id: string;
  orgId: string;
  industry: string;
  name: string;
  runUnit: string;
  roles: string[];
  steps: TemplateStep[];
  questions: string[];
}

const CLIENT_FIELDS = ["company", "contact", "contactRole", "city", "product", "teamSize"] as const;
const TAG_FIELDS = ["dealSize", "urgency", "decisionMaker", "pricingHint"] as const;

export type ClientField = (typeof CLIENT_FIELDS)[number];
export type TagField = (typeof TAG_FIELDS)[number];

function text(): Y.Text {
  return new Y.Text();
}

function roleMap(id: string, name: string): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  map.set("name", new Y.Text(name));
  map.set("id", id);
  return map;
}

function stepMap(id: string, step: TemplateStep, roleId: string): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  map.set("title", new Y.Text(step.title));
  map.set("roleId", roleId);
  map.set("tool", step.tool);
  map.set("minutes", 0);
  map.set("waitValue", 0);
  map.set("waitUnit", "h");
  const flags = new Y.Map<unknown>();
  map.set("flags", flags);
  map.set("suggestedFlags", step.commonFlags);
  map.set("clientNote", text());
  map.set("id", id);
  return map;
}

export function seedShared(doc: Y.Doc, template: TemplateSeed, ids: () => string = () => crypto.randomUUID()): void {
  const meta = doc.getMap("meta");
  meta.set("orgId", template.orgId);
  meta.set("templateId", template.id);
  meta.set("industry", template.industry);
  meta.set("processName", template.name);
  meta.set("chapter", 1);
  meta.set("prompt", 0);
  meta.set("followMe", true);
  meta.set("reveal", false);

  const client = doc.getMap("client");
  for (const field of CLIENT_FIELDS) client.set(field, text());

  const intake = doc.getMap("intake");
  intake.set("channels", new Y.Map<unknown>());
  intake.set("runsPerWeek", 0);
  intake.set("runUnit", template.runUnit);
  intake.set("afterHours", text());
  intake.set("whatGood", text());
  intake.set("otherChannel", text());

  doc.getMap("selectedProcesses");
  const roles = doc.getMap("roles");
  const roleOrder = doc.getArray<string>("roleOrder");
  const roleIds = new Map<string, string>();
  for (const name of template.roles) {
    const id = ids();
    roleIds.set(name, id);
    roles.set(id, roleMap(id, name));
    roleOrder.push([id]);
  }
  const steps = doc.getMap("steps");
  const stepOrder = doc.getArray<string>("stepOrder");
  const fallbackRole = roleOrder.get(0) ?? "";
  for (const step of template.steps) {
    const id = ids();
    steps.set(id, stepMap(id, step, roleIds.get(step.role) ?? fallbackRole));
    stepOrder.push([id]);
  }
  doc.getMap("pains");
  doc.getArray<string>("painOrder");
  doc.getMap("participants");
}

export function seedPrivate(doc: Y.Doc, questions: string[]): void {
  const notesBag = doc.getMap("notesBag");
  notesBag.set("body", text());
  const tags = doc.getMap("tags");
  for (const field of TAG_FIELDS) tags.set(field, text());
  const list = doc.getArray<string>("questions");
  if (questions.length) list.push(questions);
  // Empty maps are omitted from Yjs state snapshots. Create them on first edit.
  doc.getMap("stepNotes");
  doc.getMap("areaOverrides");
  doc.getMap("painAreas");
  doc.getMap("asked");
}

export interface RoleSnap {
  id: string;
  name: string;
  nameText: Y.Text;
}

export interface StepSnap {
  id: string;
  title: string;
  titleText: Y.Text;
  roleId: string;
  tool: string;
  minutes: number;
  waitValue: number;
  waitUnit: WaitUnit;
  flags: string[];
  suggestedFlags: string[];
  clientNote: string;
  clientNoteText: Y.Text;
  flagMap: Y.Map<unknown>;
}

export interface PainSnap {
  id: string;
  text: string;
  textNode: Y.Text;
  by: string;
}

export interface SharedSnap {
  orgId: string;
  templateId: string;
  industry: string;
  processName: string;
  chapter: number;
  prompt: number;
  followMe: boolean;
  reveal: boolean;
  client: Record<ClientField, string>;
  clientText: Record<ClientField, Y.Text>;
  channels: string[];
  channelMap: Y.Map<unknown>;
  runsPerWeek: number;
  runUnit: string;
  afterHours: string;
  afterHoursText: Y.Text;
  whatGood: string;
  whatGoodText: Y.Text;
  otherChannel: string;
  otherChannelText: Y.Text;
  selected: string[];
  selectedMap: Y.Map<unknown>;
  roles: RoleSnap[];
  steps: StepSnap[];
  pains: PainSnap[];
  participants: { id: string; name: string; role: string }[];
}

function asText(value: unknown): Y.Text | null {
  return value instanceof Y.Text ? value : null;
}

function rootMap(doc: Y.Doc, name: string): Y.Map<unknown> | null {
  if (!doc.share.has(name)) return null;
  return doc.getMap(name);
}

function rootArray<T>(doc: Y.Doc, name: string): Y.Array<T> | null {
  if (!doc.share.has(name)) return null;
  return doc.getArray(name);
}

function asMap(value: unknown): Y.Map<unknown> | null {
  return value instanceof Y.Map ? value : null;
}

function flagsOf(map: Y.Map<unknown> | null): string[] {
  if (!map) return [];
  const keys: string[] = [];
  map.forEach((value, key) => {
    if (value) keys.push(key);
  });
  return keys;
}

export function readShared(doc: Y.Doc): SharedSnap | null {
  const meta = doc.getMap("meta");
  if (!meta.has("templateId")) return null;
  const client = doc.getMap("client");
  const clientText = {} as Record<ClientField, Y.Text>;
  const clientValues = {} as Record<ClientField, string>;
  for (const field of CLIENT_FIELDS) {
    const node = asText(client.get(field));
    if (!node) return null;
    clientText[field] = node;
    clientValues[field] = node.toString();
  }
  const intake = doc.getMap("intake");
  const channelMap = asMap(intake.get("channels"));
  const after = asText(intake.get("afterHours"));
  const good = asText(intake.get("whatGood"));
  const other = asText(intake.get("otherChannel"));
  if (!channelMap || !after || !good || !other) return null;
  const selectedMap = rootMap(doc, "selectedProcesses") ?? new Y.Map<unknown>();
  const selected: string[] = [];
  selectedMap.forEach((value, key) => {
    if (value) selected.push(key);
  });
  const rolesMap = rootMap(doc, "roles");
  const roleOrder = rootArray<string>(doc, "roleOrder");
  if (!rolesMap || !roleOrder) return null;
  const roles = roleOrder.toArray().flatMap((id) => {
    const map = asMap(rolesMap.get(id));
    const nameText = map ? asText(map.get("name")) : null;
    if (!map || !nameText) return [];
    return [{ id, name: nameText.toString(), nameText }];
  });
  const stepsMap = rootMap(doc, "steps");
  const stepOrder = rootArray<string>(doc, "stepOrder");
  if (!stepsMap || !stepOrder) return null;
  const steps = stepOrder.toArray().flatMap((id) => {
    const map = asMap(stepsMap.get(id));
    if (!map) return [];
    const titleText = asText(map.get("title"));
    const clientNoteText = asText(map.get("clientNote"));
    const flagMap = asMap(map.get("flags"));
    if (!titleText || !clientNoteText || !flagMap) return [];
    const unit = map.get("waitUnit");
    return [{
      id,
      title: titleText.toString(),
      titleText,
      roleId: String(map.get("roleId") ?? ""),
      tool: String(map.get("tool") ?? ""),
      minutes: Number(map.get("minutes") ?? 0) || 0,
      waitValue: Number(map.get("waitValue") ?? 0) || 0,
      waitUnit: unit === "m" || unit === "d" || unit === "h" ? unit : "h",
      flags: flagsOf(flagMap),
      suggestedFlags: Array.isArray(map.get("suggestedFlags")) ? (map.get("suggestedFlags") as string[]) : [],
      clientNote: clientNoteText.toString(),
      clientNoteText,
      flagMap,
    } satisfies StepSnap];
  });
  const painsMap = rootMap(doc, "pains");
  const painOrder = rootArray<string>(doc, "painOrder");
  const pains = painsMap && painOrder
    ? painOrder.toArray().flatMap((id) => {
        const map = asMap(painsMap.get(id));
        const textNode = map ? asText(map.get("text")) : null;
        if (!map || !textNode) return [];
        return [{ id, text: textNode.toString(), textNode, by: String(map.get("by") ?? "") }];
      })
    : [];
  const participants: SharedSnap["participants"] = [];
  rootMap(doc, "participants")?.forEach((value, id) => {
    const map = asMap(value);
    if (!map) return;
    participants.push({ id, name: String(map.get("name") ?? ""), role: String(map.get("role") ?? "") });
  });
  return {
    orgId: String(meta.get("orgId") ?? ""),
    templateId: String(meta.get("templateId") ?? ""),
    industry: String(meta.get("industry") ?? ""),
    processName: String(meta.get("processName") ?? ""),
    chapter: Number(meta.get("chapter") ?? 1) || 1,
    prompt: Number(meta.get("prompt") ?? 0) || 0,
    followMe: meta.get("followMe") !== false,
    reveal: meta.get("reveal") === true,
    client: clientValues,
    clientText,
    channels: flagsOf(channelMap),
    channelMap,
    runsPerWeek: Number(intake.get("runsPerWeek") ?? 0) || 0,
    runUnit: String(intake.get("runUnit") ?? "run"),
    afterHours: after.toString(),
    afterHoursText: after,
    whatGood: good.toString(),
    whatGoodText: good,
    otherChannel: other.toString(),
    otherChannelText: other,
    selected,
    selectedMap,
    roles,
    steps,
    pains,
    participants,
  };
}

export interface PrivateSnap {
  notes: Y.Text;
  tags: Record<TagField, Y.Text>;
  tagValues: Record<TagField, string>;
  questions: string[];
  asked: number[];
  overrides: Record<string, string>;
  painAreas: Record<string, string>;
  stepNote: (stepId: string) => Y.Text;
  stepNoteValue: (stepId: string) => string;
}

export function readPrivate(doc: Y.Doc): PrivateSnap | null {
  const tagsMap = rootMap(doc, "tags");
  const notesBag = rootMap(doc, "notesBag");
  const notesNode = notesBag ? asText(notesBag.get("body")) : null;
  if (!tagsMap || !notesNode) return null;
  const tags = {} as Record<TagField, Y.Text>;
  const tagValues = {} as Record<TagField, string>;
  for (const field of TAG_FIELDS) {
    const node = asText(tagsMap.get(field));
    if (!node) return null;
    tags[field] = node;
    tagValues[field] = node.toString();
  }
  const askedMap = rootMap(doc, "asked");
  const asked: number[] = [];
  askedMap?.forEach((value, key) => {
    if (value) asked.push(Number(key));
  });
  const overrides: Record<string, string> = {};
  rootMap(doc, "areaOverrides")?.forEach((value, key) => {
    if (typeof value === "string" && value) overrides[key] = value;
  });
  const painAreas: Record<string, string> = {};
  rootMap(doc, "painAreas")?.forEach((value, key) => {
    if (typeof value === "string" && value) painAreas[key] = value;
  });
  const stepNotes = rootMap(doc, "stepNotes") ?? new Y.Map<unknown>();
  return buildPrivate(doc, notesNode, tags, tagValues, asked, overrides, painAreas, stepNotes);
}

function buildPrivate(
  doc: Y.Doc,
  notes: Y.Text,
  tags: Record<TagField, Y.Text>,
  tagValues: Record<TagField, string>,
  asked: number[],
  overrides: Record<string, string>,
  painAreas: Record<string, string>,
  stepNotes: Y.Map<unknown>,
): PrivateSnap {
  return {
    notes,
    tags,
    tagValues,
    questions: doc.getArray<string>("questions").toArray(),
    asked,
    overrides,
    painAreas,
    stepNote: (stepId: string) => {
      let node = asText(stepNotes.get(stepId));
      if (!node) {
        node = text();
        stepNotes.set(stepId, node);
      }
      return node;
    },
    stepNoteValue: (stepId: string) => asText(stepNotes.get(stepId))?.toString() ?? "",
  };
}

export function setChapter(doc: Y.Doc, chapter: number, prompt = 0): void {
  const meta = doc.getMap("meta");
  doc.transact(() => {
    meta.set("chapter", chapter);
    meta.set("prompt", prompt);
  });
}

export function setFollowMe(doc: Y.Doc, value: boolean): void {
  doc.getMap("meta").set("followMe", value);
}

export function setReveal(doc: Y.Doc, value: boolean): void {
  doc.getMap("meta").set("reveal", value);
}

export function setProcessName(doc: Y.Doc, value: string): void {
  doc.getMap("meta").set("processName", value);
}

export function setRunUnit(doc: Y.Doc, value: string): void {
  doc.getMap("intake").set("runUnit", value);
}

export function setRunsPerWeek(doc: Y.Doc, value: number): void {
  doc.getMap("intake").set("runsPerWeek", Number.isFinite(value) && value > 0 ? Math.round(value) : 0);
}

export function toggleKey(map: Y.Map<unknown>, key: string): void {
  if (map.get(key)) map.delete(key);
  else map.set(key, true);
}

export function toggleSelected(doc: Y.Doc, id: string): void {
  toggleKey(doc.getMap("selectedProcesses"), id);
}

export function addRole(doc: Y.Doc, name = ""): string {
  const id = crypto.randomUUID();
  doc.transact(() => {
    doc.getMap("roles").set(id, roleMap(id, name));
    doc.getArray<string>("roleOrder").push([id]);
  });
  return id;
}

export function deleteRole(doc: Y.Doc, id: string): void {
  const order = doc.getArray<string>("roleOrder");
  const index = order.toArray().indexOf(id);
  doc.transact(() => {
    if (index >= 0) order.delete(index, 1);
    doc.getMap("roles").delete(id);
  });
}

export function addStep(doc: Y.Doc, roleId = ""): string {
  const id = crypto.randomUUID();
  const blank: TemplateStep = { title: "", role: "", tool: "", commonFlags: [] };
  doc.transact(() => {
    doc.getMap("steps").set(id, stepMap(id, blank, roleId));
    doc.getArray<string>("stepOrder").push([id]);
  });
  return id;
}

export function deleteStep(doc: Y.Doc, id: string): void {
  const order = doc.getArray<string>("stepOrder");
  const index = order.toArray().indexOf(id);
  doc.transact(() => {
    if (index >= 0) order.delete(index, 1);
    doc.getMap("steps").delete(id);
  });
}

export function moveStep(doc: Y.Doc, id: string, dir: -1 | 1): void {
  const order = doc.getArray<string>("stepOrder");
  const ids = order.toArray();
  const index = ids.indexOf(id);
  const next = index + dir;
  if (index < 0 || next < 0 || next >= ids.length) return;
  doc.transact(() => {
    order.delete(index, 1);
    order.insert(next, [id]);
  });
}

export function setStepField(doc: Y.Doc, id: string, key: "tool" | "roleId" | "minutes" | "waitValue" | "waitUnit", value: string | number): void {
  const map = doc.getMap("steps").get(id);
  if (map instanceof Y.Map) map.set(key, value);
}

export function toggleFlag(doc: Y.Doc, stepId: string, flag: FlagKey | string): void {
  const map = doc.getMap("steps").get(stepId);
  if (!(map instanceof Y.Map)) return;
  const flags = map.get("flags");
  if (flags instanceof Y.Map) toggleKey(flags, flag);
}

export function addPain(doc: Y.Doc, by: string): string {
  const id = crypto.randomUUID();
  const map = new Y.Map<unknown>();
  map.set("text", text());
  map.set("by", by);
  doc.transact(() => {
    doc.getMap("pains").set(id, map);
    doc.getArray<string>("painOrder").push([id]);
  });
  return id;
}

export function deletePain(doc: Y.Doc, id: string): void {
  const order = doc.getArray<string>("painOrder");
  const index = order.toArray().indexOf(id);
  doc.transact(() => {
    if (index >= 0) order.delete(index, 1);
    doc.getMap("pains").delete(id);
  });
}

export function upsertParticipant(doc: Y.Doc, id: string, name: string, role: string): void {
  const map = new Y.Map<unknown>();
  map.set("name", name);
  map.set("role", role);
  doc.getMap("participants").set(id, map);
}

export function setOverride(doc: Y.Doc, stepId: string, area: string): void {
  const map = doc.getMap("areaOverrides");
  if (!area) map.delete(stepId);
  else map.set(stepId, area);
}

export function setPainArea(doc: Y.Doc, painId: string, area: string): void {
  const map = doc.getMap("painAreas");
  if (!area) map.delete(painId);
  else map.set(painId, area);
}

export function toggleAsked(doc: Y.Doc, index: number): void {
  const map = doc.getMap("asked");
  const key = String(index);
  if (map.get(key)) map.delete(key);
  else map.set(key, true);
}

export function roleName(snap: SharedSnap, roleId: string): string {
  return snap.roles.find((role) => role.id === roleId)?.name || "Not assigned";
}

/** Meta keys a client socket is not allowed to change. */
export const CLIENT_LOCKED_META = ["orgId", "templateId", "industry", "processName", "reveal"] as const;
