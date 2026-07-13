# Mobile and Sources usability hardening

## Phase audit

The repository uses a more granular delivery sequence than the original
three-part proposal:

| Technical delivery | Status | Purpose |
| --- | --- | --- |
| 1A | complete | CI and quality foundation |
| 1B | complete | environment and secret hygiene |
| 1C | complete | progressive lint ratchet |
| 1D | complete | reproducible Edge Function validation |
| 1E-A + 1E-A.1 | complete and deployed | payment idempotency, safe logs and request fencing |

The original broad “Observabilidade segura” and “Segurança das APIs” programs
are not globally complete. Only the payment/authentication slice is closed.
Future observability work must therefore start at 1E-B rather than relabeling
the entire first program as finished.

## Usability incident

Customers reported that the Sources screen and its add/edit dialogs could grow
beyond the visible mobile viewport. On phones this could hide the close/back
controls and prevent reliable vertical navigation.

## Corrections

- App shell uses the dynamic viewport (`100dvh`) and gives scrolling ownership
  to the main content area.
- Mobile sidebar uses dynamic viewport height, an internal scroll region and
  safe-area bottom padding.
- Dialogs and confirmation dialogs are capped to the dynamic viewport, keep a
  small screen margin and scroll internally with overscroll containment.
- The dialog close control remains reachable while content scrolls.
- Source actions stack on narrow screens; long URLs, names, diagnostics and
  badges wrap instead of increasing page width.
- Add-source wizard controls and country/language fields collapse to one column
  where necessary.
- Source-card actions use the full available mobile width and icon actions have
  accessible labels.

## Non-goals

- No source ingestion, filtering, Supabase payload or publication rule changed.
- No migration, Edge Function, Stripe, Meta, scheduler or worker change.
- No frontend publication is performed by this commit.

## Validation contract

- Dialog, alert-dialog and sheet dynamic-viewport classes have regression tests.
- Existing source-capture and application tests must remain green.
- Typecheck, lint ratchet and production build must pass.
- Manual responsive verification targets 320×568, 390×844 and desktop widths.
