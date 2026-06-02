ALTER TABLE public.support_messages
  DROP CONSTRAINT IF EXISTS support_messages_sender_role_check;

ALTER TABLE public.support_messages
  ADD CONSTRAINT support_messages_sender_role_check
  CHECK (sender_role IN ('user', 'admin'));

DROP POLICY IF EXISTS "insert messages on accessible tickets" ON public.support_messages;

CREATE POLICY "insert messages on accessible tickets"
ON public.support_messages
FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND (
    (sender_role = 'admin' AND public.is_admin())
    OR (
      sender_role = 'user'
      AND EXISTS (
        SELECT 1
        FROM public.support_tickets t
        WHERE t.id = ticket_id
          AND t.user_id = auth.uid()
      )
    )
  )
);
