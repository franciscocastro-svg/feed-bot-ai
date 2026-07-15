export function normalizeTemplateFormat(format) {
  return format === "story" || format === "stories" ? "stories"
    : format === "reel" || format === "reels" ? "reels"
      : "feed";
}

export function materializeTemplateVersion(version) {
  if (!version) return null;
  return {
    id: version.template_id,
    user_id: version.user_id,
    name: version.name,
    kind: version.kind,
    preset_key: version.preset_key ?? null,
    background_url: version.background_url ?? null,
    config: version.config || {},
    format: normalizeTemplateFormat(version.format),
    _template_version_id: version.id,
    _template_version_number: version.version_number,
  };
}

export async function loadPublishedTemplate(client, options) {
  const format = normalizeTemplateFormat(options?.format);
  const accountId = options?.accountId || null;
  const fallbackTemplateId = options?.fallbackTemplateId || null;
  const userId = options?.userId || null;

  if (accountId) {
    const { data: assignment, error: assignmentError } = await client
      .from("account_template_assignments")
      .select("published_version_id")
      .eq("instagram_account_id", accountId)
      .eq("format", format)
      .maybeSingle();
    // Deploys remain backwards-compatible before the migration is applied.
    if (!assignmentError && assignment?.published_version_id) {
      let query = client
        .from("post_template_versions")
        .select("*")
        .eq("id", assignment.published_version_id)
        .eq("instagram_account_id", accountId)
        .eq("format", format)
        .eq("status", "published");
      if (userId) query = query.eq("user_id", userId);
      const { data: version, error: versionError } = await query.maybeSingle();
      if (!versionError && version) return materializeTemplateVersion(version);
    }
  }

  if (!fallbackTemplateId) return null;
  let fallbackQuery = client
    .from("post_templates")
    .select("*")
    .eq("id", fallbackTemplateId)
    .eq("format", format);
  if (userId) fallbackQuery = fallbackQuery.eq("user_id", userId);
  const { data: fallback } = await fallbackQuery.maybeSingle();
  return fallback || null;
}
