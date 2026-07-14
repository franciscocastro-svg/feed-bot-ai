import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { SEO } from "@/components/SEO";
import { BrandLogo } from "@/components/BrandLogo";
import { buildSupportWhatsAppUrl, SUPPORT_WHATSAPP_DISPLAY } from "@/lib/contact";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Termos de Uso do Flux & Feed"
        description="Termos de Uso do Flux & Feed: regras para uso da plataforma de criacao, revisao, agendamento e publicacao autorizada em contas profissionais do Instagram."
        path="/terms"
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

      <main className="container max-w-3xl py-16 prose prose-invert prose-headings:font-display">
        <h1 className="font-display text-4xl font-bold mb-2">Termos de Uso</h1>
        <p className="text-sm text-muted-foreground mb-10">Última atualização: 06/07/2026</p>

        <section className="space-y-6 text-foreground/90 leading-relaxed">
          <div>
            <h2 className="text-2xl font-semibold mb-2">1. Aceitação</h2>
            <p>Ao criar uma conta no Flux & Feed, você concorda com estes Termos. Se não concordar, não utilize o serviço.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">2. Descrição do serviço</h2>
            <p>
              Flux & Feed é uma plataforma de gestão de conteúdo para contas profissionais do Instagram. O serviço ajuda usuários autorizados a cadastrar fontes públicas, criar rascunhos, revisar, agendar e publicar conteúdos nas contas conectadas por eles, usando a API oficial da Meta quando aplicável.
            </p>
            <p className="mt-2">
              Alguns recursos podem usar tecnologia assistida por IA para apoiar escrita, resumo, adaptação de linguagem e organização de conteúdo. O usuário continua responsável por revisar, aprovar e garantir que o conteúdo esteja correto antes da publicação.
            </p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">3. Cadastro e conta</h2>
            <p>Você é responsável por manter a confidencialidade da sua senha, controlar quem acessa sua conta e por todas as atividades realizadas no painel. Notifique-nos imediatamente em caso de uso não autorizado.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">4. Planos e pagamentos</h2>
            <p>Os planos são cobrados de forma recorrente mensal via Stripe. Você pode cancelar a qualquer momento — o acesso permanece até o fim do período já pago. Não há reembolsos proporcionais salvo exigência legal.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">5. Contas conectadas e permissões</h2>
            <p>
              Você só deve conectar contas do Instagram, páginas ou ativos empresariais que controla ou para os quais possui autorização expressa. Ao conectar uma conta, você autoriza o Flux & Feed a executar as ações necessárias ao funcionamento contratado, como exibir a conta conectada, preparar publicações, agendar conteúdos e enviar publicações aprovadas para a Meta.
            </p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">6. Conteúdo e responsabilidade editorial</h2>
            <p>
              O usuário é o único responsável pelas fontes que cadastra, pelos direitos de uso de textos, imagens, vídeos e marcas, e pelo conteúdo publicado em seu nome. O Flux & Feed não garante a veracidade de fontes externas e não substitui revisão editorial, jurídica ou profissional.
            </p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">7. Uso aceitável</h2>
            <p>
              É proibido usar o serviço para spam, manipulação enganosa, desinformação, discurso de ódio, violação de direitos autorais, conteúdo adulto não permitido, coleta indevida de dados, atividades ilegais ou qualquer uso que viole leis, os Termos da Meta, os Termos do Instagram ou as Diretrizes da Comunidade.
            </p>
            <p className="mt-2">
              Podemos limitar, suspender ou encerrar contas que coloquem usuários, terceiros, a plataforma ou integrações oficiais em risco.
            </p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">8. Disponibilidade e integrações</h2>
            <p>
              O serviço depende de provedores externos, incluindo Meta, Stripe, infraestrutura de hospedagem e ferramentas de processamento de conteúdo. Recursos podem ficar indisponíveis por manutenção, limites de API, revisão de permissões, falhas técnicas ou mudanças nas regras desses provedores.
            </p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">9. Limitação de responsabilidade</h2>
            <p>O serviço é fornecido "como está". Na extensão permitida por lei, não nos responsabilizamos por perdas indiretas, bloqueios, suspensões, falhas de publicação, queda de alcance, indisponibilidade de APIs de terceiros ou decisões tomadas pelo usuário com base em conteúdo gerado ou sugerido pela plataforma.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">10. Cancelamento e desconexão</h2>
            <p>Você pode cancelar seu plano, desconectar contas do Instagram e solicitar exclusão de dados a qualquer momento. O cancelamento interrompe cobranças futuras, mas não remove automaticamente conteúdos já publicados em redes sociais de terceiros.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">11. Alterações</h2>
            <p>Podemos atualizar estes Termos. Mudanças relevantes serão comunicadas por email, WhatsApp ou aviso no painel.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">12. Lei aplicável e foro</h2>
            <p>Estes Termos são regidos pelas leis do Brasil. Fica eleito o foro da comarca do usuário, ou da sede do Flux & Feed no Brasil.</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold mb-2">13. Contato</h2>
            <p>
              Dúvidas sobre estes Termos: <a className="text-primary underline" href="mailto:diassiscastroficial@gmail.com">diassiscastroficial@gmail.com</a> ou WhatsApp <a className="text-primary underline" href={buildSupportWhatsAppUrl()}>{SUPPORT_WHATSAPP_DISPLAY}</a>.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
