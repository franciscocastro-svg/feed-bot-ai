import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[app] erro ao renderizar rota", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="min-h-[60vh] flex items-center justify-center p-6">
        <section className="w-full max-w-lg rounded-xl border border-amber-500/30 bg-card p-6 text-center space-y-4">
          <AlertTriangle className="h-9 w-9 text-amber-500 mx-auto" />
          <div>
            <h1 className="text-xl font-semibold">Esta área não conseguiu carregar</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Uma atualização pode ter substituído os arquivos que estavam abertos no navegador.
            </p>
          </div>
          <Button onClick={() => window.location.reload()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Atualizar página
          </Button>
        </section>
      </main>
    );
  }
}
