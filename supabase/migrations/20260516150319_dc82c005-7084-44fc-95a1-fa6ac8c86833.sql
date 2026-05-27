CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created
  ON public.support_messages (ticket_id, created_at);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_last_msg
  ON public.support_tickets (user_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_unread_admin
  ON public.support_tickets (unread_for_admin)
  WHERE unread_for_admin = true;