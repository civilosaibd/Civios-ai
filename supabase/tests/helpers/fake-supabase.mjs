// In-memory stand-in for @supabase/supabase-js used ONLY by the viz-analyze edge-function test.
// It implements just the calls that function makes. It proves the function's own logic, not RLS or the real platform.
class Q {
  constructor(F, t) { this.F = F; this.t = t; this.op = "select"; this.f = []; this.head = false; this.count = false; }
  select(_c, o) { if (this.op === "select") { this.head = !!o?.head; this.count = o?.count === "exact"; } return this; }
  insert(row) { this.op = "insert"; this.row = row; return this; }
  update(p) { this.op = "update"; this.patch = p; return this; }
  eq(k, v) { this.f.push((r) => r[k] === v); return this; }
  neq(k, v) { this.f.push((r) => r[k] !== v); return this; }
  in(k, a) { this.f.push((r) => a.includes(r[k])); return this; }
  gte(k, v) { this.f.push((r) => String(r[k]) >= String(v)); return this; }
  order() { return this; }
  limit() { return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  then(res, rej) { return Promise.resolve().then(() => this.exec()).then(res, rej); }
  exec() {
    const tbl = (this.F.db[this.t] ??= []);
    const rows = tbl.filter((r) => this.f.every((p) => p(r)));
    if (this.op === "insert") { const r = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...this.row }; tbl.push(r); return this.mode ? { data: r, error: null } : { data: [r], error: null }; }
    if (this.op === "update") { for (const r of rows) Object.assign(r, structuredClone(this.patch)); return { data: null, error: null }; }
    if (this.head) return { data: null, count: rows.length, error: null };
    if (this.mode === "single") return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "no rows" } };
    if (this.mode === "maybe") return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }
}
export function createClient() {
  const F = globalThis.__FAKE;
  return {
    auth: { getUser: async (tok) => ({ data: { user: F.users[tok] ?? null } }) },
    rpc: async (name, args) => (name === "viz_can_write" ? { data: F.canWrite(args), error: null } : { data: null, error: { message: "unknown rpc " + name } }),
    from: (t) => new Q(F, t),
    storage: { from: () => ({ download: async (p) => (F.storage[p] ? { data: new Blob([F.storage[p]]), error: null } : { data: null, error: { message: "not found" } }) }) },
  };
}
