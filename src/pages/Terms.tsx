import { Link } from "react-router-dom";
import { Sparkles, ArrowLeft } from "lucide-react";
import { SEO } from "@/components/SEO";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Termos de Uso do Flux & Feed"
        description="Termos de Uso do Flux & Feed: regras da plataforma SaaS de automação de Instagram com IA — planos, pagamentos, responsabilidades e cancelamento."
        path="/terms"
      />
      <header className="border-b border-border/40">
        <div className="container flex items-center justify-between py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display font-bold text-lg">Flux & Feed</span>
          </Link>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </div>
      </header>

      <main className="container max-w-3xl py-16 prose prose-invert prose-headings:font-display">
        <h1 className="font-display text-4xl font-bold mb-2">Termos de Uso</h1>
        <p className="text-sm text-muted-foreground mb-10">Última atualização: {new Date().toLocaleDateString("pt-BR")}</p>

        <section className="space-y-6 text-foreground/90 leading-relaxed">
          <div>
            <h2 className="text-2xl font-semibold mb-2">1. Aceitação</h2>
            <p>Ao criar uma conta no Flux & Feed, você concorda com estes Termos. Se não concordar, não utilize o serviço.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">2. Descrição do serviço</h2>
            <p>Flux & Feed é uma plataforma SaaS que captura notícias de fontes públicas (RSS), reescreve com IA e publica conteúdo em contas do Instagram conectadas pelo usuário via API oficial da Meta.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">3. Cadastro e conta</h2>
            <p>Você é responsável por manter a confidencialidade da sua senha e por todas as atividades realizadas em sua conta. Notifique-nos imediatamente em caso de uso não autorizado.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">4. Planos e pagamentos</h2>
            <p>Os planos são cobrados de forma recorrente mensal via Stripe. Você pode cancelar a qualquer momento — o acesso permanece até o fim do período já pago. Não há reembolsos proporcionais salvo exigência legal.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">5. Conteúdo de terceiros</h2>
            <p>O usuário é o único responsável pelas fontes que cadastra e pelo conteúdo publicado em seu nome. O Flux & Feed não revisa editorialmente cada publicação. Conteúdo que viole direitos autorais, leis ou as políticas da Meta pode resultar em suspensão.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">6. Uso aceitável</h2>
            <p>É proibido usar o serviço para spam, desinformação, discurso de ódio, conteúdo adulto não permitido ou qualquer atividade ilegal. Reservamo-nos o direito de suspender contas que descumpram estas regras.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">7. Limitação de responsabilidade</h2>
            <p>O serviço é fornecido "como está". Não nos responsabilizamos por bloqueios, suspensões ou perdas decorrentes de mudanças nas políticas da Meta/Instagram, indisponibilidade de APIs de terceiros ou força maior.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">8. Cancelamento</h2>
            <p>Você pode encerrar sua conta a qualquer momento pelo painel. Podemos encerrar contas que violem estes Termos com aviso prévio quando possível.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">9. Alterações</h2>
            <p>Podemos atualizar estes Termos. Mudanças relevantes serão comunicadas por email ou no painel.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">10. Lei aplicável e foro</h2>
            <p>Estes Termos são regidos pelas leis do Brasil. Fica eleito o foro da comarca do usuário, ou da sede do Flux & Feed no Brasil.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">11. Contato</h2>
            <p>Dúvidas? WhatsApp: <a className="text-primary underline" href="https://wa.me/5547996080134">+55 47 99608-0134</a></p>
          </div>
        </section>
      </main>
    </div>
  );
}
