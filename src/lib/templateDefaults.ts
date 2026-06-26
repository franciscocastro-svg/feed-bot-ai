export type TemplateFormat = "feed" | "stories" | "reels";

type TemplateRef = { id: string; format?: string | null };
type DefaultSettings = {
  default_template_id?: string | null;
  default_feed_template_id?: string | null;
  default_story_template_id?: string | null;
  default_reel_template_id?: string | null;
};

export function resolveAccountTemplateDefaults(
  templates: TemplateRef[],
  globalSettings: DefaultSettings,
  accountSettings: DefaultSettings | null,
  accountScoped: boolean,
) {
  const valid = (id: string | null | undefined, format: TemplateFormat) =>
    !!id && templates.some(template => template.id === id && (template.format || "feed") === format);
  const globalFeed = globalSettings.default_feed_template_id || globalSettings.default_template_id || null;
  const accountFeed = accountSettings?.default_feed_template_id || accountSettings?.default_template_id || null;
  const globalStory = globalSettings.default_story_template_id || globalSettings.default_template_id || null;
  const accountStory = accountSettings?.default_story_template_id || accountSettings?.default_template_id || null;
  const globalReel = globalSettings.default_reel_template_id || globalSettings.default_template_id || null;
  const accountReel = accountSettings?.default_reel_template_id || accountSettings?.default_template_id || null;
  const candidates: Record<TemplateFormat, { account: string | null; global: string | null }> = {
    feed: { account: accountFeed, global: globalFeed },
    stories: { account: accountStory, global: globalStory },
    reels: { account: accountReel, global: globalReel },
  };
  const ids = {} as Record<TemplateFormat, string | null>;
  const sources = {} as Record<TemplateFormat, "account" | "global" | null>;
  (Object.keys(candidates) as TemplateFormat[]).forEach(format => {
    const candidate = candidates[format];
    if (accountScoped && valid(candidate.account, format)) {
      ids[format] = candidate.account;
      sources[format] = "account";
    } else if (valid(candidate.global, format)) {
      ids[format] = candidate.global;
      sources[format] = "global";
    } else {
      ids[format] = null;
      sources[format] = null;
    }
  });
  return { ids, sources };
}
