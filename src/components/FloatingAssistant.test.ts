import { describe, expect, it } from "vitest";
import { showFloatingAssistant as show } from "./FloatingAssistant";

describe("floating assistant visibility", () => {
  it("needs a signed-in user", () => { expect(show("/dashboard", false)).toBe(false); expect(show("/dashboard", true)).toBe(true); });
  it("is hidden on landing, auth, the assistant itself, the 3D viewer, admin and upload", () => {
    for (const p of ["/", "/auth", "/register", "/ai-assistant", "/visualizations/abc", "/visualizations/demo", "/admin/billing", "/upload", "/billing"]) expect(show(p, true)).toBe(false);
  });
  it("is shown on normal module pages, and matches whole path segments only", () => {
    for (const p of ["/projects", "/projects/1", "/scheduler", "/settings/backup", "/administrators", "/uploads-list"]) expect(show(p, true)).toBe(true);
  });
});
