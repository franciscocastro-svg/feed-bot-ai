import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

const NUM_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: "price_brl", label: "Preço (BRL)" },
  { key: "trial_days", label: "Período de teste (dias)" },
  { key: "max_ig_accounts", label: "Contas IG", hint: "-1 = ilimitado" },
  { key: "max_posts_per_day", label: "Posts/dia", hint: "-1 = ilimitado" },
  { key: "max_rss_sources", label: "Fontes RSS", hint: "-1 = ilimitado" },
  { key: "max_reels_per_month", label: "Reels/mês", hint: "-1 = ilimitado" },
  { key: "max_images_per_month", label: "Imagens/mês", hint: "-1 = ilimitado" },
  { key: "max_templates", label: "Templates", hint: "-1 = ilimitado" },
  { key: "max_cuts_per_day", label: "Cortes IA/dia", hint: "-1 = ilimitado, 0 = desativado" },
  { key: "max_cut_video_minutes", label: "Min/vídeo corte" },
  { key: "max_cuts_per_job", label: "Cortes por vídeo", hint: "MVP limita em até 5" },
];

export function PlanLimitsEditor() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("plan_limits").select("*").order("sort_order");
    if (error) toast.error(error.message);
    setPlans(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const update = (plan: string, key: string, value: any) => {
    setPlans(p => p.map(x => x.plan === plan ? { ...x, [key]: value } : x));
  };

  const save = async (plan: any) => {
    setSavingId(plan.plan);
    const { data: previous, error: previousError } = await supabase
      .from("plan_limits")
      .select("*")
      .eq("plan", plan.plan)
      .single();
    if (previousError || !previous) {
      setSavingId(null);
      toast.error("Não foi possível confirmar a configuração atual antes de salvar.");
      return;
    }
    const payload: any = {};
    NUM_FIELDS.forEach(f => { payload[f.key] = plan[f.key] === "" || plan[f.key] === null ? null : Number(plan[f.key]); });
    payload.auto_publish_enabled = !!plan.auto_publish_enabled;
    payload.translation_enabled = !!plan.translation_enabled;
    payload.is_negotiable = !!plan.is_negotiable;
    payload.display_name = plan.display_name;
    const { error } = await supabase.from("plan_limits").update(payload).eq("plan", plan.plan);
    if (error) {
      setSavingId(null);
      toast.error(error.message);
      return;
    }

    // Sync price to Stripe (only for paid, non-negotiable plans)
    if (["starter", "pro"].includes(plan.plan) && payload.price_brl > 0 && !payload.is_negotiable) {
      const env = (import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined)?.startsWith("pk_test_") ? "sandbox" : "live";
      const { data: syncRes, error: syncErr } = await supabase.functions.invoke("admin-sync-stripe-price", {
        body: { plan: plan.plan, price_brl: payload.price_brl, environment: env },
      });
      if (syncErr || (syncRes as any)?.error) {
        const rollback: any = {};
        NUM_FIELDS.forEach(f => { rollback[f.key] = (previous as any)[f.key]; });
        rollback.auto_publish_enabled = previous.auto_publish_enabled;
        rollback.translation_enabled = previous.translation_enabled;
        rollback.is_negotiable = previous.is_negotiable;
        rollback.display_name = previous.display_name;
        const { error: rollbackError } = await supabase.from("plan_limits").update(rollback).eq("plan", plan.plan);
        if (rollbackError) {
          toast.error(`Stripe falhou e o banco não pôde ser restaurado. Não altere novamente até revisão manual: ${rollbackError.message}`);
        } else {
          toast.error(`Stripe não foi atualizado; a configuração anterior foi restaurada: ${syncErr?.message || (syncRes as any)?.error}`);
          await load();
        }
      } else if ((syncRes as any)?.unchanged) {
        toast.success(`${plan.plan} atualizado (preço Stripe inalterado)`);
      } else {
        toast.success(`${plan.plan} atualizado e preço sincronizado no Stripe ✓`);
      }
    } else {
      toast.success(`${plan.plan} atualizado`);
    }
    setSavingId(null);
  };

  if (loading) return <p className="text-sm text-muted-foreground p-4">Carregando...</p>;

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {plans.map(p => (
        <Card key={p.plan}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              <span className="capitalize">{p.plan}</span>
              <Input
                value={p.display_name || ""}
                onChange={(e) => update(p.plan, "display_name", e.target.value)}
                className="max-w-[200px] h-8"
                placeholder="Nome de exibição"
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {NUM_FIELDS.map(f => (
                <div key={f.key}>
                  <label className="text-xs text-muted-foreground">{f.label}</label>
                  <Input
                    type="number"
                    value={p[f.key] ?? ""}
                    onChange={(e) => update(p.plan, f.key, e.target.value)}
                    className="h-8"
                  />
                  {f.hint && <p className="text-[10px] text-muted-foreground mt-0.5">{f.hint}</p>}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-sm flex items-center gap-2">
                <Switch checked={!!p.auto_publish_enabled} onCheckedChange={(v) => update(p.plan, "auto_publish_enabled", v)} />
                Auto-publicar
              </label>
              <label className="text-sm flex items-center gap-2">
                <Switch checked={!!p.translation_enabled} onCheckedChange={(v) => update(p.plan, "translation_enabled", v)} />
                Tradução 🌍
              </label>
              <label className="text-sm flex items-center gap-2">
                <Switch checked={!!p.is_negotiable} onCheckedChange={(v) => update(p.plan, "is_negotiable", v)} />
                Negociável
              </label>
            </div>
            <Button size="sm" onClick={() => save(p)} disabled={savingId === p.plan} className="w-full">
              {savingId === p.plan ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar {p.plan}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
