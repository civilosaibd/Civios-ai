import { describe, expect, it } from "vitest";
import { getAdminWorkspaceLinks } from "./adminWorkspaceNavigation";

describe("getAdminWorkspaceLinks", () => {
  it("returns no privileged navigation for a normal user", () => {
    expect(getAdminWorkspaceLinks({
      isSuperAdmin: false,
      isLegacyAdmin: false,
      permissions: {},
    })).toEqual([]);
  });

  it("shows only the Users workspace to a users.view sub-admin", () => {
    expect(getAdminWorkspaceLinks({
      isSuperAdmin: false,
      isLegacyAdmin: false,
      permissions: { users: true },
    })).toEqual([{ title: "User Accounts", url: "/admin/users" }]);
  });

  it("routes an audit-only sub-admin to the restricted audit view, not the user directory", () => {
    expect(getAdminWorkspaceLinks({
      isSuperAdmin: false,
      isLegacyAdmin: false,
      permissions: { audit: true },
    })).toEqual([{ title: "Access Audit", url: "/admin/users" }]);
  });

  it("does not expose Team & Permissions to an ordinary sub-admin", () => {
    const links = getAdminWorkspaceLinks({
      isSuperAdmin: false,
      isLegacyAdmin: false,
      permissions: { projects: true, settings: true },
    });
    expect(links.map((link) => link.url)).toEqual([
      "/admin/projects",
      "/admin/settings",
    ]);
  });

  it("gives a Super Admin every implemented module route but not a legacy overview route", () => {
    const links = getAdminWorkspaceLinks({
      isSuperAdmin: true,
      isLegacyAdmin: false,
      permissions: {},
    });
    expect(links.map((link) => link.url)).toEqual([
      "/admin/team",
      "/admin/users",
      "/admin/projects",
      "/admin/affiliate",
      "/admin/billing",
      "/admin/ai-usage",
      "/admin/settings",
    ]);
  });

  it("shows the legacy overview only to a user whose role can pass its page gate", () => {
    const links = getAdminWorkspaceLinks({
      isSuperAdmin: false,
      isLegacyAdmin: true,
      permissions: {},
    });
    expect(links[0]).toEqual({ title: "Admin Overview", url: "/admin" });
  });
});
