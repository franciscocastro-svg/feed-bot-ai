import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SEO } from "@/components/SEO";
import { BrandLogo } from "@/components/BrandLogo";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Política de Privacidade do Flux & Feed"
        description="Política de Privacidade do Flux & Feed (LGPD): quais dados coletamos, como usamos, com quem compartilhamos e seus direitos sobre suas informações."
        path="/privacy"
      />
      <header className="border-b border-border/40">
        <div className="container flex items-center justify-between py-4">
          <Link to="/">
            <BrandLogo priority className="h-8 max-w-[200px]" />
          </Link>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </div>
      </header>

      <main className="container max-w-3xl py-16">
        <h1 className="font-display text-4xl font-bold mb-2">Política de Privacidade</h1>
        <p className="text-sm text-muted-foreground mb-10">Última atualização: 06/07/2026</p>

        <section className="space-y-6 text-foreground/90 leading-relaxed">
          <div>
            <h2 className="text-2xl font-semibold mb-2">1. Quem somos</h2>
            <p>Flux & Feed é uma plataforma de gestão de conteúdo para contas profissionais do Instagram, com recursos de criação assistida, revisão, agendamento e publicação autorizada pelo usuário. Esta política descreve como tratamos seus dados conforme a LGPD (Lei 13.709/18).</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">2. Dados que coletamos</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Cadastro: nome, email, WhatsApp, cidade, estado, país.</li>
              <li>Autenticação: dados de sessão e tokens criptografados necessários para manter sua conta segura.</li>
              <li>Dados da Meta/Instagram: identificadores das contas conectadas, nome de usuário, permissões concedidas, tokens de acesso criptografados, status de publicação, mídia enviada e métricas ou diagnósticos retornados pela API oficial da Meta quando autorizados.</li>
              <li>Conteúdo: fontes cadastradas, notícias captadas, rascunhos, legendas, imagens, vídeos, posts gerados, agendamentos e histórico de publicação.</li>
              <li>Uso: logs de atividade e diagnósticos técnicos.</li>
              <li>Pagamento: processado por Stripe — não armazenamos dados de cartão.</li>
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">3. Como usamos</h2>
            <p>Usamos seus dados para operar o serviço, autenticar sua conta, exibir contas conectadas, criar rascunhos, agendar e publicar conteúdos aprovados por você, processar cobranças, prestar suporte, prevenir abuso, corrigir falhas e melhorar a plataforma.</p>
            <p className="mt-2">Dados recebidos da Meta são usados apenas para funcionalidades relacionadas às contas conectadas pelo usuário, como autenticação, gestão de publicações, exibição de status e diagnóstico de erros.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">4. Compartilhamento</h2>
            <p>Compartilhamos dados apenas com processadores essenciais: infraestrutura de hospedagem, Supabase/Lovable Cloud, Stripe para pagamentos, Meta para login e publicação no Instagram, ferramentas de email/suporte e provedores de IA usados para apoiar criação ou adaptação de conteúdo.</p>
            <p className="mt-2">Não vendemos seus dados pessoais, não vendemos dados recebidos da Meta e não compartilhamos tokens de acesso com anunciantes ou terceiros não necessários ao funcionamento do serviço.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">5. Recursos de IA</h2>
            <p>Quando recursos assistidos por IA são usados, podemos enviar texto, contexto, imagens ou instruções necessárias ao provedor de IA para gerar, resumir, revisar ou adaptar conteúdo. Não enviamos senhas, dados de cartão ou tokens de acesso da Meta para esses provedores.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">6. Cookies, Pixel e medição</h2>
            <p>Usamos cookies essenciais para manter sua sessão e proteger sua conta. Também podemos usar Meta Pixel e Meta Conversions API para medir visitas, cadastros, eventos de conversão e desempenho de campanhas, sempre de acordo com as configurações disponíveis no navegador, dispositivo e plataformas de anúncios.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">7. Seus direitos (LGPD)</h2>
            <p>Você pode solicitar acesso, correção, portabilidade, anonimização ou exclusão de seus dados a qualquer momento pelo email/WhatsApp de contato. Atendemos em até 15 dias.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">8. Segurança</h2>
            <p>Tokens são criptografados e armazenados com Row-Level Security. Acesso é restrito por autenticação e políticas de menor privilégio.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">9. Retenção e exclusão</h2>
            <p>Mantemos seus dados enquanto sua conta estiver ativa ou enquanto forem necessários para prestar o serviço. Após cancelamento ou solicitação de exclusão, removemos ou anonimizamos dados pessoais em até 90 dias, salvo obrigações legais, fiscais, prevenção a fraude, segurança ou defesa de direitos.</p>
            <p className="mt-2">Para dados vinculados ao Facebook/Instagram, acesse nossa página de instruções de exclusão em <Link className="text-primary underline" to="/data-deletion">fluxifeed.com/data-deletion</Link>.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">10. Alterações</h2>
            <p>Podemos atualizar esta política. Mudanças relevantes serão notificadas por email.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">11. Encarregado (DPO)</h2>
            <p>
              Para exercer seus direitos ou tirar dúvidas: <a className="text-primary underline" href="mailto:diassiscastroficial@gmail.com">diassiscastroficial@gmail.com</a> ou <a className="text-primary underline" href="https://wa.me/5547996080134">WhatsApp +55 47 99608-0134</a>.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
