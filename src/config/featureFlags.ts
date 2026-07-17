// Rollout gradual: features novas começam restritas ao admin.
// À medida que estabilizam, mover para BETA_PATHS (libera para todos) ou remover daqui.
//
// Fases planejadas:
// - Fase A (atual): só admin testa em produção.
// - Fase B: liberar para 3-5 clientes beta selecionados (TODO: lista por user_id).
// - Fase C: liberar para todos os planos pagos.

export const ADMIN_ONLY_PATHS: string[] = [];

// IDs de usuários liberados como beta-testers, mesmo sem ser admin.
// Quando uma feature passar pra Fase B, copiar o path daqui e listar os user_ids.
export const BETA_USER_IDS: Record<string, string[]> = {
  // "/dashboard/topics": ["uuid-do-cliente-1", "uuid-do-cliente-2"],
};

export function isPathVisible(path: string, opts: { isAdmin: boolean; userId?: string | null }): boolean {
  if (!ADMIN_ONLY_PATHS.includes(path)) return true;
  if (opts.isAdmin) return true;
  const betas = BETA_USER_IDS[path] || [];
  return !!opts.userId && betas.includes(opts.userId);
}
