import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Regression guards for issue #335 (production workspace sync schema and
// Edge Function reconciliation).
//
// The production incident in #335 happened because the code used
// public.user_workspace while no Supabase migration created it, and the
// deployed Edge Functions had drifted from the repository source. These
// tests assert the repository-side invariants directly on the source
// files, so the gap cannot silently reopen:
//   1. A migration creates user_workspace exactly as the client expects,
//      with row-level security and owner-only policies, and no anon
//      access.
//   2. Every Edge Function directory has an explicit entry in
//      supabase/config.toml, so its intended JWT behaviour is reviewed
//      in code instead of relying on deployment-time defaults.

const readSource = (relativePath: string) =>
  readFileSync(path.join(process.cwd(), relativePath), "utf8");

const migration = readSource(
  "supabase/migrations/20261103120000_create_user_workspace.sql",
);
const config = readSource("supabase/config.toml");

describe("workspace sync readiness (#335)", () => {
  it("migration creates user_workspace with the (user_id, key) primary key", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.user_workspace");
    expect(migration).toContain(
      "CONSTRAINT user_workspace_pkey PRIMARY KEY (user_id, key)",
    );
    expect(migration).toContain("value jsonb NOT NULL");
  });

  it("migration enables RLS with owner-only policies and no anon access", () => {
    expect(migration).toContain(
      "ALTER TABLE public.user_workspace ENABLE ROW LEVEL SECURITY",
    );
    expect(migration).toContain("REVOKE ALL ON TABLE public.user_workspace FROM anon");
    for (const action of ["select", "insert", "update", "delete"]) {
      expect(migration).toContain(`"Own workspace ${action}"`);
    }
    // Every policy must be scoped to the row owner.
    const policyCount = migration.split("CREATE POLICY").length - 1;
    const ownerScopedCount =
      migration.split("(SELECT auth.uid()) = user_id").length - 1;
    expect(policyCount).toBe(4);
    expect(ownerScopedCount).toBeGreaterThanOrEqual(4);
  });

  it("every Edge Function has an explicit supabase/config.toml entry", () => {
    const functionsDir = path.join(process.cwd(), "supabase", "functions");
    const functionNames = readdirSync(functionsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
      .map((entry) => entry.name)
      .sort();
    expect(functionNames.length).toBeGreaterThan(0);
    for (const name of functionNames) {
      expect(
        config,
        `supabase/config.toml is missing a [functions.${name}] section`,
      ).toContain(`[functions.${name}]`);
    }
  });
});
