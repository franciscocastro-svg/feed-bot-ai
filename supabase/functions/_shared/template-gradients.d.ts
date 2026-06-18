export type TemplateGradient = {
  angle: number;
  stops: Array<{ color: string; offset: number }>;
};

export const PRESET_GRADIENTS: Record<string, TemplateGradient>;
export function normalizeTemplateGradient(value: unknown): TemplateGradient | null;
export function resolveTemplateGradient(presetKey?: string | null, config?: unknown): TemplateGradient;
export function templateGradientCss(presetKey?: string | null, config?: unknown): string;
export function drawTemplateGradient(
  ctx: CanvasRenderingContext2D,
  presetKey: string | null | undefined,
  config: unknown,
  width: number,
  height: number,
): void;
export function templateGradientSvg(
  presetKey: string | null | undefined,
  config: unknown,
  width: number,
  height: number,
  id?: string,
): string;
