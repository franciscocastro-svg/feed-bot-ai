import { Check, Minus } from "lucide-react";
import type { ComparisonRow } from "./landingContent";

type ComparisonTableProps = {
  rows: ComparisonRow[];
};

export function ComparisonTable({ rows }: ComparisonTableProps) {
  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-card/60 shadow-2xl shadow-black/20">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <caption className="sr-only">Comparação entre uma operação manual e uma operação com o Flux & Feed</caption>
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.035]">
              <th scope="col" className="w-[22%] px-6 py-5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Etapa
              </th>
              <th scope="col" className="w-[39%] px-6 py-5 text-sm font-semibold text-muted-foreground">
                Operação manual
              </th>
              <th scope="col" className="w-[39%] px-6 py-5 text-sm font-semibold text-foreground">
                Com Flux &amp; Feed
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.category} className="border-b border-white/[0.08] last:border-0">
                <th scope="row" className="px-6 py-5 font-display text-base font-semibold text-foreground">
                  {row.category}
                </th>
                <td className="px-6 py-5 align-top text-sm leading-6 text-muted-foreground">
                  <span className="flex gap-3">
                    <Minus className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                    {row.manual}
                  </span>
                </td>
                <td className="bg-primary/[0.035] px-6 py-5 align-top text-sm leading-6 text-foreground">
                  <span className="flex gap-3">
                    <Check className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    {row.flux}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
