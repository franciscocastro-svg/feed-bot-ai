export function normalizeTemplateFormat(format?: string | null): "feed" | "stories" | "reels";
export type PublishedTemplate = {
  id: string;
  user_id?: string;
  name: string;
  kind: string;
  preset_key: string | null;
  background_url: string | null;
  config: Record<string, unknown>;
  format: "feed" | "stories" | "reels";
  _template_version_id?: string;
  _template_version_number?: number;
};
export function materializeTemplateVersion(version: unknown): PublishedTemplate | null;
export function loadPublishedTemplate(client: unknown, options: {
  accountId?: string | null;
  userId?: string | null;
  format?: string | null;
  fallbackTemplateId?: string | null;
}): Promise<PublishedTemplate | null>;
