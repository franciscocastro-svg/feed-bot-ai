import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, RotateCcw, Save, UserCircle2 } from "lucide-react";

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
const GLOBAL_PROFILE = "global";

type InstagramAccount = { id: string; username: string };
type ProfilePayload = Partial<Profile> & { _inherited?: boolean; _exists?: boolean };
type ProfileRpcResult = { data: ProfilePayload | null; error: { message: string } | null };
type ProfileRpc = (name: string, args: Record<string, unknown>) => Promise<ProfileRpcResult>;

const callProfileRpc = supabase.rpc.bind(supabase) as unknown as ProfileRpc;

export default function CreatorProfile() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [p, setP] = useState<Profile>(empty);
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [selectedScope, setSelectedScope] = useState(GLOBAL_PROFILE);
  const [inherited, setInherited] = useState(false);
  const [profileExists, setProfileExists] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from("instagram_accounts")
        .select("id,username")
        .eq("user_id", user.id)
        .eq("active", true)
        .order("username");
      const nextAccounts = (data || []) as InstagramAccount[];
      setAccounts(nextAccounts);
      setSelectedScope(nextAccounts[0]?.id || GLOBAL_PROFILE);
    })();
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const accountId = selectedScope === GLOBAL_PROFILE ? null : selectedScope;
      const { data, error } = await callProfileRpc("get_creator_profile_for_account", {
        _account_id: accountId,
      });
      if (!active) return;
      if (error) {
        toast.error("Não foi possível carregar o Perfil do Criador.");
        setP(empty);
        setInherited(false);
        setProfileExists(false);
      } else {
        setP({ ...empty, ...(data || {}) });
        setInherited(Boolean(data?._inherited));
        setProfileExists(Boolean(data?._exists) && !data?._inherited);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [selectedScope]);

  const save = async () => {
    setSaving(true);
    const accountId = selectedScope === GLOBAL_PROFILE ? null : selectedScope;
    const { error } = await callProfileRpc("save_creator_profile_for_account", {
      _account_id: accountId,
      _profile: p,
    });
    setSaving(false);
    if (error) toast.error("Erro ao salvar: " + error.message);
    else {
      setInherited(false);
      setProfileExists(true);
      toast.success("Perfil salvo. A IA usará esta voz nas próximas gerações desta conta.");
    }
  };

  const resetToGlobal = async () => {
    if (selectedScope === GLOBAL_PROFILE) return;
    setSaving(true);
    const { error } = await callProfileRpc("reset_creator_profile_for_account", {
      _account_id: selectedScope,
    });
    setSaving(false);
    if (error) {
      toast.error("Não foi possível restaurar o perfil geral: " + error.message);
      return;
    }
    const { data } = await callProfileRpc("get_creator_profile_for_account", {
      _account_id: selectedScope,
    });
    setP({ ...empty, ...(data || {}) });
    setInherited(Boolean(data?._inherited));
    setProfileExists(false);
    toast.success("Esta conta voltou a herdar o Perfil do Criador geral.");
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
          <CardTitle>Conta que receberá esta voz</CardTitle>
          <CardDescription>Cada Instagram pode ter nicho, público, tom, frases e restrições próprios.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={selectedScope} onValueChange={setSelectedScope}>
            <SelectTrigger aria-label="Selecionar conta do Perfil do Criador">
              <SelectValue placeholder="Selecione uma conta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={GLOBAL_PROFILE}>Perfil geral (herança)</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>@{account.username}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {selectedScope === GLOBAL_PROFILE ? (
              <Badge variant="secondary">Perfil geral</Badge>
            ) : inherited ? (
              <Badge variant="outline">Herdando o perfil geral</Badge>
            ) : (
              <Badge variant="secondary">Personalizado para esta conta</Badge>
            )}
            <span>Notícias automáticas, pautas e posts avulsos usarão exatamente este perfil.</span>
          </div>
          {selectedScope !== GLOBAL_PROFILE && profileExists && (
            <Button variant="outline" onClick={resetToGlobal} disabled={saving}>
              <RotateCcw className="mr-2 h-4 w-4" /> Usar novamente o perfil geral
            </Button>
          )}
        </CardContent>
      </Card>

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
