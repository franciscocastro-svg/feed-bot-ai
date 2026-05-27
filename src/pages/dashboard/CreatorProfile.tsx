import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Save, UserCircle2 } from "lucide-react";

type Profile = {
  niche_detail: string;
  target_audience: string;
  voice_tone: string;
  expertise_summary: string;
  signature_phrases: string[];
  forbidden_words: string[];
  cta_style: string;
  example_posts: string[];
  extra_notes: string;
};

const empty: Profile = {
  niche_detail: "",
  target_audience: "",
  voice_tone: "",
  expertise_summary: "",
  signature_phrases: [],
  forbidden_words: [],
  cta_style: "",
  example_posts: [],
  extra_notes: "",
};

const toArr = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
const fromArr = (a: string[] | null | undefined) => (a || []).join("\n");

export default function CreatorProfile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [p, setP] = useState<Profile>(empty);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("creator_profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (data) setP({ ...empty, ...data });
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const row = { user_id: user.id, ...p };
    const { error } = await supabase.from("creator_profiles").upsert(row, { onConflict: "user_id" });
    setSaving(false);
    if (error) toast.error("Erro ao salvar: " + error.message);
    else toast.success("Perfil salvo. A IA vai usar isso nas próximas gerações.");
  };

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <UserCircle2 className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Perfil de Criador</h1>
          <p className="text-sm text-muted-foreground">A IA usa esse perfil pra personalizar tom, linguagem e estilo de todo conteúdo gerado.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quem é você</CardTitle>
          <CardDescription>Quanto mais detalhe, mais autêntico o conteúdo fica.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Nicho detalhado</Label>
            <Input value={p.niche_detail} onChange={(e) => setP({ ...p, niche_detail: e.target.value })}
              placeholder="Ex: Professor de matemática focado em ENEM e vestibulares federais" />
          </div>
          <div>
            <Label>Público-alvo</Label>
            <Input value={p.target_audience} onChange={(e) => setP({ ...p, target_audience: e.target.value })}
              placeholder="Ex: Estudantes de 16-19 anos do 3º ano, classes B/C, ansiosos com vestibular" />
          </div>
          <div>
            <Label>Tom de voz</Label>
            <Input value={p.voice_tone} onChange={(e) => setP({ ...p, voice_tone: e.target.value })}
              placeholder="Ex: Acolhedor, irmão mais velho, sem gírias jovens, didático" />
          </div>
          <div>
            <Label>Sua expertise / autoridade</Label>
            <Textarea value={p.expertise_summary} onChange={(e) => setP({ ...p, expertise_summary: e.target.value })}
              placeholder="Ex: 10 anos de cursinho, mestrado em educação, +3000 aprovados em federais. Fale como quem viveu isso."
              rows={3} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Linguagem</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Frases de assinatura (uma por linha)</Label>
            <Textarea value={fromArr(p.signature_phrases)} onChange={(e) => setP({ ...p, signature_phrases: toArr(e.target.value) })}
              placeholder={"Bora pra cima!\nVocê é capaz, confia.\nDa série: ninguém te conta isso na escola."}
              rows={4} />
          </div>
          <div>
            <Label>Palavras / temas proibidos (uma por linha)</Label>
            <Textarea value={fromArr(p.forbidden_words)} onChange={(e) => setP({ ...p, forbidden_words: toArr(e.target.value) })}
              placeholder={"política partidária\nreligião\ngírias do tipo 'mano'"}
              rows={3} />
          </div>
          <div>
            <Label>Estilo de CTA preferido</Label>
            <Input value={p.cta_style} onChange={(e) => setP({ ...p, cta_style: e.target.value })}
              placeholder="Ex: Sempre terminar perguntando se a pessoa quer um pdf com o resumo" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exemplos e contexto</CardTitle>
          <CardDescription>Opcional, mas melhora muito o resultado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Exemplos de posts seus que deram certo (um por linha, separe com ---)</Label>
            <Textarea value={fromArr(p.example_posts)} onChange={(e) => setP({ ...p, example_posts: toArr(e.target.value) })}
              placeholder="Cole captions de posts que tiveram bom engajamento, um por linha"
              rows={6} />
          </div>
          <div>
            <Label>Observações livres pra IA</Label>
            <Textarea value={p.extra_notes} onChange={(e) => setP({ ...p, extra_notes: e.target.value })}
              placeholder="Qualquer outra orientação: o que evitar, ganchos favoritos, referências..."
              rows={4} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end sticky bottom-4">
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar perfil
        </Button>
      </div>
    </div>
  );
}
