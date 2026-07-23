import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: string; // e.g. "contas Instagram", "fontes RSS", "reels IA"
  used?: number;
  limit?: number;
}

export function UpgradeModal({ open, onOpenChange, resource, used, limit }: Props) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" /> {t("Limite do plano atingido")}
          </DialogTitle>
          <DialogDescription className="pt-2">
            {t("Você atingiu o limite de")} <strong>{t(resource)}</strong> {t("do seu plano atual")}
            {limit !== undefined && used !== undefined && ` (${used}/${limit})`}.
            <br /><br />
            {t("Faça upgrade para continuar usando todos os recursos sem interrupção.")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("Agora não")}</Button>
          <Button onClick={() => { onOpenChange(false); navigate("/pricing"); }}>
            <Sparkles className="h-4 w-4 mr-2" /> {t("Ver planos")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
