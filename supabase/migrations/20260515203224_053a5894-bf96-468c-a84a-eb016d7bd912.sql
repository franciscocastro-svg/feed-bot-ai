
CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open | pending_user | closed
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sender_role TEXT NOT NULL DEFAULT 'user', -- user | admin
  unread_for_admin BOOLEAN NOT NULL DEFAULT true,
  unread_for_user BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_tickets_user ON public.support_tickets(user_id, last_message_at DESC);
CREATE INDEX idx_support_tickets_status ON public.support_tickets(status, last_message_at DESC);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own tickets" ON public.support_tickets
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "users create own tickets" ON public.support_tickets
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own tickets" ON public.support_tickets
  FOR UPDATE USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "admins delete tickets" ON public.support_tickets
  FOR DELETE USING (public.is_admin());

CREATE TRIGGER support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  sender_role TEXT NOT NULL, -- user | admin
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_messages_ticket ON public.support_messages(ticket_id, created_at);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view messages of own tickets" ON public.support_messages
  FOR SELECT USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "insert messages on accessible tickets" ON public.support_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND (
      public.is_admin() OR EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = ticket_id AND t.user_id = auth.uid()
      )
    )
  );

-- Trigger to update ticket on new message
CREATE OR REPLACE FUNCTION public.tg_support_message_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.support_tickets
  SET last_message_at = NEW.created_at,
      last_sender_role = NEW.sender_role,
      status = CASE WHEN NEW.sender_role = 'user' THEN 'open' ELSE 'pending_user' END,
      unread_for_admin = CASE WHEN NEW.sender_role = 'user' THEN true ELSE unread_for_admin END,
      unread_for_user  = CASE WHEN NEW.sender_role = 'admin' THEN true ELSE unread_for_user END,
      updated_at = now()
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_messages_after_insert
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_support_message_after_insert();
