import { describe, expect, it } from "vitest";
import { MAX_PROJECTS, WORKSPACE_KEYS, buildBackup, parseBackup, sanitizeJson } from "./backup";

const good = () => buildBackup(
  [{ key: "civilos.schedule", value: [{ id: 1, name: "Excavation" }] }, { key: "civilos.finance", value: { invoices: [] } }, { key: "civilos.scheduleStart", value: "2026-11-01" }, { key: "secret.other", value: { a: 1 } }],
  [{ id: "x", user_id: "u", share_token: "tok", is_public: true, name: "Tower A", client_name: "ACME", status: "active", budget: 5000000, inputs: { floors: 3 }, estimate: { total: 1 }, start_date: "2026-01-01", end_date: "2026-12-31" }],
  new Date("2026-10-22T00:00:00Z"));

describe("backup export", () => {
  it("only exports known sections and never ownership / sharing fields", () => {
    const b = good();
    expect(Object.keys(b.workspace).sort()).toEqual(["civilos.finance", "civilos.schedule", "civilos.scheduleStart"]);
    const s = JSON.stringify(b);
    for (const bad of ["share_token", "user_id", "is_public", "tok", "secret.other"]) expect(s).not.toContain(bad);
    expect(b.exportedAt).toBe("2026-10-22T00:00:00.000Z");
  });
});

describe("backup import (untrusted file)", () => {
  it("round-trips a good backup", () => {
    const r = parseBackup(JSON.stringify(good()));
    expect(r.ok).toBe(true); expect(r.skipped).toEqual([]);
    expect(r.backup!.projects[0]).toMatchObject({ name: "Tower A", client_name: "ACME", budget: 5000000, start_date: "2026-01-01" });
    expect(r.backup!.workspace["civilos.schedule"]).toEqual([{ id: 1, name: "Excavation" }]);
  });
  it("rejects non-JSON, other apps, wrong versions, empty and oversized files with a clear message", () => {
    expect(parseBackup("").ok).toBe(false);
    expect(parseBackup("{nope").error).toMatch(/not JSON/);
    expect(parseBackup(JSON.stringify({ app: "other", version: 1 })).error).toMatch(/not a CivilOS/);
    expect(parseBackup(JSON.stringify({ app: "civilos-ai", version: 99 })).error).toMatch(/version/);
    expect(parseBackup(JSON.stringify([1, 2])).ok).toBe(false);
    expect(parseBackup("x".repeat(6 * 1024 * 1024)).error).toMatch(/too large/);
    expect(parseBackup(JSON.stringify({ app: "civilos-ai", version: 1, workspace: {}, projects: [] })).error).toMatch(/nothing/);
  });
  it("skips unknown sections (roles, plans, payments, anything else) and reports them", () => {
    const f = { ...good(), workspace: { ...good().workspace, "user_roles": [{ role: "admin" }], "civilos.subscription": { plan: "business" }, "../../x": 1 } };
    const r = parseBackup(JSON.stringify(f));
    expect(r.ok).toBe(true);
    expect(Object.keys(r.backup!.workspace)).not.toContain("user_roles");
    expect(Object.keys(r.backup!.workspace)).not.toContain("civilos.subscription");
    expect(r.skipped.length).toBe(3);
  });
  it("checks the shape of each section", () => {
    const f = { app: "civilos-ai", version: 1, workspace: { "civilos.schedule": { not: "array" }, "civilos.finance": [1], "civilos.scheduleStart": "2026-13-45", "civilos.inventory": { ok: true } }, projects: [] };
    const r = parseBackup(JSON.stringify(f));
    expect(Object.keys(r.backup!.workspace)).toEqual(["civilos.inventory"]);
    expect(r.skipped.filter((s) => /wrong format/.test(s)).length).toBe(3);
  });
  it("removes prototype-pollution keys at any depth", () => {
    const text = '{"app":"civilos-ai","version":1,"workspace":{"civilos.plan":{"a":{"__proto__":{"polluted":1},"constructor":{"x":1},"ok":2}}},"projects":[]}';
    const r = parseBackup(text);
    expect(r.backup!.workspace["civilos.plan"]).toEqual({ a: { ok: 2 } });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(sanitizeJson(JSON.parse('{"__proto__":{"p":1},"q":1}'))).toEqual({ q: 1 });
  });
  it("cleans project fields: names, dates, budget, status; drops ids / tokens / unknown fields", () => {
    const f = { app: "civilos-ai", version: 1, workspace: {}, projects: [
      { name: "  A\u0000B ", client_name: 12, status: "DROP TABLE", budget: -5, start_date: "2026-02-30", end_date: "2026-03-01", id: "evil", user_id: "evil", share_token: "t", is_public: true, role: "admin", inputs: "str", estimate: { t: 1 } },
      { name: "" }, { budget: 1 }, null ] };
    const r = parseBackup(JSON.stringify(f)); const p = r.backup!.projects;
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ name: "A B", client_name: null, status: "active", budget: null, start_date: null, end_date: "2026-03-01", inputs: null, estimate: { t: 1 } });
    for (const k of ["id", "user_id", "share_token", "is_public", "role"]) expect(Object.keys(p[0])).not.toContain(k);
    expect(r.skipped.join("|")).toMatch(/invalid start date/); expect(r.skipped.join("|")).toMatch(/no name/);
  });
  it("caps the number of projects and the size of one section", () => {
    const many = Array.from({ length: MAX_PROJECTS + 20 }, (_, i) => ({ name: "P" + i }));
    expect(parseBackup(JSON.stringify({ app: "civilos-ai", version: 1, workspace: {}, projects: many })).backup!.projects).toHaveLength(MAX_PROJECTS);
    const big = { app: "civilos-ai", version: 1, workspace: { "civilos.schedule": [{ s: "x".repeat(2.2 * 1024 * 1024) }], "civilos.qa": [1] }, projects: [] };
    const r = parseBackup(JSON.stringify(big));
    expect(Object.keys(r.backup!.workspace)).toEqual(["civilos.qa"]); expect(r.skipped.join()).toMatch(/too large/);
  });
  it("rejects absurdly deep JSON without crashing", () => {
    let deep: unknown = 1; for (let i = 0; i < 100; i++) deep = { a: deep };
    const r = parseBackup(JSON.stringify({ app: "civilos-ai", version: 1, workspace: { "civilos.plan": deep, "civilos.qa": [] }, projects: [] }));
    expect(r.ok).toBe(true); expect(Object.keys(r.backup!.workspace)).toEqual(["civilos.qa"]); expect(r.skipped.join()).toMatch(/too complex/);
  });
  it("every restorable section has a label in both languages", () => { for (const v of Object.values(WORKSPACE_KEYS)) { expect(v.en).toBeTruthy(); expect(v.bn).toBeTruthy(); } });
});
