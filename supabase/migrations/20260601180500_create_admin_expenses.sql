CREATE TABLE IF NOT EXISTS public.admin_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'Outros',
  description text NOT NULL,
  amount_brl numeric(12,2) NOT NULL CHECK (amount_brl >= 0),
  spent_at timestamptz NOT NULL DEFAULT now(),
  recurring boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin manage expenses" ON public.admin_expenses;
CREATE POLICY "admin manage expenses"
ON public.admin_expenses
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_admin_expenses_spent_at
ON public.admin_expenses (spent_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_expenses_category
ON public.admin_expenses (category);

DROP TRIGGER IF EXISTS set_updated_at_admin_expenses ON public.admin_expenses;
CREATE TRIGGER set_updated_at_admin_expenses
BEFORE UPDATE ON public.admin_expenses
FOR EACH ROW
EXECUTE FUNCTION public.tg_set_updated_at();
