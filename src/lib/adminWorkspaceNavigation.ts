export type AdminWorkspacePermissions = {
  users?: boolean;
  projects?: boolean;
  affiliate?: boolean;
  billing?: boolean;
  ai_usage?: boolean;
  audit?: boolean;
  settings?: boolean;
};

export type AdminWorkspaceAccess = {
  isSuperAdmin: boolean;
  isLegacyAdmin: boolean;
  permissions: AdminWorkspacePermissions;
};

export type AdminWorkspaceLink = {
  title: string;
  url: string;
};

/**
 * Builds navigation from trusted server-side RBAC results.
 * This is a visibility helper only; each destination must keep enforcing
 * its own server-side permission check.
 */
export function getAdminWorkspaceLinks(access: AdminWorkspaceAccess): AdminWorkspaceLink[] {
  const fullModuleAccess = access.isSuperAdmin || access.isLegacyAdmin;
  const links: AdminWorkspaceLink[] = [];

  if (access.isLegacyAdmin) {
    links.push({ title: "Admin Overview", url: "/admin" });
  }

  if (access.isSuperAdmin) {
    links.push({ title: "Team & Permissions", url: "/admin/team" });
  }

  if (fullModuleAccess || access.permissions.users) {
    links.push({ title: "User Accounts", url: "/admin/users" });
  } else if (access.permissions.audit) {
    // AdminUsersPage deliberately renders only the audit viewer for audit-only users.
    links.push({ title: "Access Audit", url: "/admin/users" });
  }

  if (fullModuleAccess || access.permissions.projects) {
    links.push({ title: "Projects", url: "/admin/projects" });
  }
  if (fullModuleAccess || access.permissions.affiliate) {
    links.push({ title: "Affiliate", url: "/admin/affiliate" });
  }
  if (fullModuleAccess || access.permissions.billing) {
    links.push({ title: "Billing", url: "/admin/billing" });
  }
  if (fullModuleAccess || access.permissions.ai_usage) {
    links.push({ title: "AI Usage", url: "/admin/ai-usage" });
  }
  if (fullModuleAccess || access.permissions.settings) {
    links.push({ title: "System Settings", url: "/admin/settings" });
  }

  return links;
}
