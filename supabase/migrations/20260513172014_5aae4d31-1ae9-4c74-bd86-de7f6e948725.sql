with ordered as (
  select
    sp.id,
    sp.instagram_account_id,
    row_number() over (
      partition by sp.user_id, sp.instagram_account_id
      order by sp.scheduled_for, sp.created_at, sp.id
    ) as rn,
    greatest(
      now(),
      coalesce((
        select max(p.posted_at) + interval '10 minutes'
        from public.scheduled_posts p
        where p.user_id = sp.user_id
          and p.instagram_account_id = sp.instagram_account_id
          and p.status = 'posted'
          and p.posted_at is not null
      ), now())
    ) as base_at
  from public.scheduled_posts sp
  where sp.status = 'scheduled'
    and sp.instagram_account_id is not null
)
update public.scheduled_posts sp
set
  scheduled_for = ordered.base_at + ((ordered.rn - 1) * interval '10 minutes'),
  error_message = case
    when sp.error_message ilike 'Aguardando intervalo mínimo%' or sp.scheduled_for <= now()
      then 'Fila reespaçada automaticamente: aguardando intervalo mínimo de 10 min entre posts'
    else sp.error_message
  end,
  updated_at = now()
from ordered
where sp.id = ordered.id
  and sp.scheduled_for < ordered.base_at + ((ordered.rn - 1) * interval '10 minutes');