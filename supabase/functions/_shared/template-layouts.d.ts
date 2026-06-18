export type TemplateFormat = "feed" | "story" | "stories" | "reel" | "reels";
export type TemplateTextAlign = "left" | "center" | "right";
export type TemplateConfig = Record<string, any>;

export function getDefaultTemplateConfig(format?: TemplateFormat): TemplateConfig;
export function getTemplateLayoutOptions(format?: TemplateFormat): Array<{ index: number; name: string; values: TemplateConfig }>;
export function getPresetTemplateLayout(presetKey: string | null, format?: TemplateFormat): TemplateConfig;
export function normalizeTemplateConfig(config: TemplateConfig | null | undefined, format?: TemplateFormat): TemplateConfig;
export function textAnchorForAlign(align: TemplateTextAlign): "start" | "middle" | "end";
export function textXForBox(x: number, width: number, align: TemplateTextAlign): number;
