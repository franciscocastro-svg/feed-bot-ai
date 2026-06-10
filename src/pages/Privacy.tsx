import { Link } from "react-router-dom";
import { Sparkles, ArrowLeft } from "lucide-react";
import { SEO } from "@/components/SEO";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Política de Privacidade do NewsFlow"
        description="Política de Privacidade do NewsFlow (LGPD): quais dados coletamos, como usamos, com quem compartilhamos e seus direitos sobre suas informações."
        path="/privacy"
      />
      <header className="border-b border-border/40">
        <div className="container flex items-center justify-between py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-lg">NewsFlow</span>
          </Link>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </div>
      </header>

      <main className="container max-w-3xl py-16">
        <h1 className="font-display text-4xl font-bold mb-2">Política de Privacidade</h1>
        <p className="text-sm text-muted-foreground mb-10">Última atualização: {new Date().toLocaleDateString("pt-BR")}</p>

        <section className="space-y-6 text-foreground/90 leading-relaxed">
          <div>
            <h2 className="text-2xl font-semibold mb-2">1. Quem somos</h2>
            <p>NewsFlow é uma plataforma de automação de conteúdo para Instagram. Esta política descreve como tratamos seus dados conforme a LGPD (Lei 13.709/18).</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">2. Dados que coletamos</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Cadastro: nome, email, WhatsApp, cidade, estado, país.</li>
              <li>Autenticação: token criptografado de acesso ao Instagram (Meta Graph API).</li>
              <li>Conteúdo: fontes RSS cadastradas, posts gerados, métricas de publicação.</li>
              <li>Uso: logs de atividade e diagnósticos técnicos.</li>
              <li>Pagamento: processado por Stripe — não armazenamos dados de cartão.</li>
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">3. Como usamos</h2>
            <p>Para operar o serviço, autenticar sua conta, publicar conteúdo nos canais que você conectou, processar cobranças, dar suporte e melhorar a plataforma.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">4. Compartilhamento</h2>
            <p>Compartilhamos dados apenas com processadores essenciais: Lovable Cloud (infraestrutura), Stripe (pagamentos), Meta (publicação no Instagram) e provedores de IA usados para reescrita de conteúdo. Nunca vendemos seus dados.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">5. Cookies</h2>
            <p>Usamos cookies essenciais para manter sua sessão. Não usamos cookies de publicidade.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">6. Seus direitos (LGPD)</h2>
            <p>Você pode solicitar acesso, correção, portabilidade, anonimização ou exclusão de seus dados a qualquer momento pelo email/WhatsApp de contato. Atendemos em até 15 dias.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">7. Segurança</h2>
            <p>Tokens são criptografados e armazenados com Row-Level Security. Acesso é restrito por autenticação e políticas de menor privilégio.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">8. Retenção</h2>
            <p>Mantemos seus dados enquanto sua conta estiver ativa. Após cancelamento, dados pessoais são removidos em até 90 dias, salvo obrigações legais (ex.: fiscais).</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">9. Alterações</h2>
            <p>Podemos atualizar esta política. Mudanças relevantes serão notificadas por email.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">10. Encarregado (DPO)</h2>
            <p>Para exercer seus direitos ou tirar dúvidas: <a className="text-primary underline" href="https://wa.me/5547996080134">WhatsApp +55 47 99608-0134</a></p>
          </div>
        </section>
      </main>
    </div>
  );
}
