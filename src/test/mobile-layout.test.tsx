import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

afterEach(cleanup);

describe("mobile viewport containment", () => {
  it("keeps regular dialogs inside the dynamic viewport and scrollable", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Adicionar fonte</DialogTitle>
          <DialogDescription>Configure uma fonte de conteúdo.</DialogDescription>
          <div>Conteúdo</div>
        </DialogContent>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog", { name: "Adicionar fonte" });
    expect(dialog).toHaveClass("max-h-[calc(100vh-1rem)]");
    expect(dialog).toHaveClass("supports-[height:100dvh]:max-h-[calc(100dvh-1rem)]");
    expect(dialog).toHaveClass("w-[calc(100%-1rem)]");
    expect(dialog).toHaveClass("overflow-y-auto");
    expect(dialog).toHaveClass("overscroll-contain");
  });

  it("keeps confirmation dialogs inside the dynamic viewport", () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Remover fonte?</AlertDialogTitle>
          <AlertDialogDescription>Confirme a remoção.</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>,
    );

    const dialog = screen.getByRole("alertdialog", { name: "Remover fonte?" });
    expect(dialog).toHaveClass("max-h-[calc(100vh-1rem)]");
    expect(dialog).toHaveClass("supports-[height:100dvh]:max-h-[calc(100dvh-1rem)]");
    expect(dialog).toHaveClass("overflow-y-auto");
  });

  it("uses the dynamic viewport for mobile navigation sheets", () => {
    render(
      <Sheet open>
        <SheetContent side="left">
          <SheetTitle>Menu</SheetTitle>
          <SheetDescription>Navegação do aplicativo.</SheetDescription>
        </SheetContent>
      </Sheet>,
    );

    const dialog = screen.getByRole("dialog", { name: "Menu" });
    expect(dialog).toHaveClass("h-screen");
    expect(dialog).toHaveClass("supports-[height:100dvh]:h-[100dvh]");
    expect(dialog).toHaveClass("supports-[height:100dvh]:max-h-[100dvh]");
  });
});
