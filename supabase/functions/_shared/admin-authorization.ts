export type AdminAuthorizationResult =
  | { ok: true; userId: string }
  | {
      ok: false;
      status: 401 | 403 | 503;
      code: "unauthorized" | "forbidden" | "permission_check_failed";
    };

type AdminAuthorizationDependencies = {
  getAuthenticatedUserId: () => Promise<string | null>;
  checkPermission: (section: string) => Promise<boolean>;
};

export async function authorizeAdminSection(
  dependencies: AdminAuthorizationDependencies,
  section: string,
): Promise<AdminAuthorizationResult> {
  const userId = await dependencies.getAuthenticatedUserId().catch(() => null);
  if (!userId) {
    return { ok: false, status: 401, code: "unauthorized" };
  }

  try {
    const allowed = await dependencies.checkPermission(section);
    if (allowed !== true) {
      return { ok: false, status: 403, code: "forbidden" };
    }
  } catch {
    return {
      ok: false,
      status: 503,
      code: "permission_check_failed",
    };
  }

  return { ok: true, userId };
}
