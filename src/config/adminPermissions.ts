export const ADMIN_PERMISSION_OPTIONS = [
  { key: "users", label: "Usuários", description: "Clientes, aprovação, planos e status." },
  { key: "system", label: "Saúde", description: "Fila, fontes travadas e alertas operacionais." },
  { key: "finance", label: "Financeiro", description: "MRR, gastos, lucro e assinantes." },
  { key: "plans", label: "Planos", description: "Limites e valores dos planos." },
  { key: "team", label: "Equipe", description: "Administradores e permissões." },
  { key: "tokens", label: "Tokens", description: "Validade dos tokens Instagram." },
  { key: "meta", label: "Saúde API Meta", description: "Uso e alertas da API da Meta." },
  { key: "releases", label: "Novidades", description: "Comunicados dentro do app." },
  { key: "email", label: "E-mail", description: "Campanhas, públicos e comunicações por e-mail." },
  { key: "support", label: "Suporte", description: "Tickets e mensagens de clientes." },
  { key: "roadmap", label: "Planejamento", description: "Planejamento do produto." },
] as const;

export const ALL_ADMIN_PERMISSION_KEYS = ADMIN_PERMISSION_OPTIONS.map((item) => item.key);
