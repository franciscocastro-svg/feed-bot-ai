import { getStripeEnvironment } from "@/lib/stripe";

export function PaymentTestModeBanner() {
  if (getStripeEnvironment() !== "sandbox") return null;
  return (
    <div className="w-full bg-amber-100 border-b border-amber-300 px-4 py-2 text-center text-xs text-amber-900">
      Modo de teste: nenhum pagamento real é processado.{" "}
      <a
        href="https://docs.lovable.dev/features/payments#test-and-live-environments"
        target="_blank" rel="noopener noreferrer"
        className="underline font-medium"
      >
        Saiba mais
      </a>
    </div>
  );
}
