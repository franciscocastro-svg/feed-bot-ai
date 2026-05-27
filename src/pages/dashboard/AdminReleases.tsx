import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Eye, EyeOff, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { formatBR } from "@/lib/utils";

type Release = {
  id: string;
  version: string | null;
  title: string;
  content: string;
  highlight: boolean;
  published: boolean;
  published_at: string | null;
  created_at: string;
};

const empty = { version: "", title: "", content: "", highlight: false, published: true };

export default function AdminReleases() {
  const [items, setItems] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Release | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("release_notes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data as any) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ ...empty });
    setOpen(true);
  };

  const openEdit = (r: Release) => {
    setEditing(r);
    setForm({
      version: r.version || "",
      title: r.title,
      content: r.content,
      highlight: r.highlight,
      published: r.published,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      return toast.error("Título e conteúdo são obrigatórios");
    }
    const { data: u } = await supabase.auth.getUser();
    const payload: any = {
      version: form.version.trim() || null,
      title: form.title.trim(),
      content: form.content.trim(),
      highlight: form.highlight,
      published: form.published,
      published_at: form.published ? (editing?.published_at || new Date().toISOString()) : null,
    };
    if (editing) {
      const { error } = await supabase.from("release_notes").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Atualizado");
    } else {
      payload.created_by = u.user?.id;
      const { error } = await supabase.from("release_notes").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Publicado");
    }
    setOpen(false);
    load();
  };

  const togglePublish = async (r: Release) => {
    const newPub = !r.published;
    const { error } = await supabase.from("release_notes").update({
      published: newPub,
      published_at: newPub ? (r.published_at || new Date().toISOString()) : r.published_at,
    }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success(newPub ? "Publicado" : "Despublicado");
    load();
  };

  const remove = async (r: Release) => {
    if (!confirm(`Apagar "${r.title}"? Isso remove também o histórico de visualizações.`)) return;
    const { error } = await supabase.from("release_notes").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Removido");
    load();
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Novidades</h1>
          <p className="text-muted-foreground mt-1">Avise os clientes sobre atualizações. Aparece em popup ao entrar.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" /> Nova novidade
        </Button>
      </div>

      {loading ? (
        <Card className="p-12 text-center text-muted-foreground">Carregando…</Card>
      ) : items.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground border-dashed">
          <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-50" />
          Nenhuma novidade ainda. Crie a primeira!
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium">{r.title}</h3>
                    {r.version && <Badge variant="outline" className="text-[10px]">v{r.version}</Badge>}
                    {r.highlight && <Badge className="text-[10px]">Destaque</Badge>}
                    <Badge variant={r.published ? "default" : "secondary"} className="text-[10px]">
                      {r.published ? "Publicado" : "Rascunho"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {r.published_at ? `Publicado em ${formatBR(r.published_at)}` : `Criado em ${formatBR(r.created_at)}`}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap line-clamp-3">{r.content}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="outline" onClick={() => togglePublish(r)} title={r.published ? "Despublicar" : "Publicar"}>
                    {r.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => openEdit(r)} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => remove(r)} title="Apagar">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar novidade" : "Nova novidade"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>Título *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Novo gerador de Reels com IA" />
              </div>
              <div>
                <Label>Versão</Label>
                <Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} placeholder="1.4.0" />
              </div>
            </div>
            <div>
              <Label>Conteúdo *</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={8}
                placeholder="Descreva o que mudou. Pode usar várias linhas, listas com - …"
              />
              <p className="text-xs text-muted-foreground mt-1">Quebras de linha são preservadas.</p>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-4">
              <div className="flex items-center gap-3">
                <Switch checked={form.highlight} onCheckedChange={(v) => setForm({ ...form, highlight: v })} />
                <span className="text-sm">Destaque</span>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.published} onCheckedChange={(v) => setForm({ ...form, published: v })} />
                <span className="text-sm">Publicar agora</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editing ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
