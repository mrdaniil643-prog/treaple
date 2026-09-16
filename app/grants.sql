-- Только права доступа. Выполнить в Supabase → SQL Editor, если при
-- сохранении товара приложение отвечает «permission denied for table».
--
-- GRANT и RLS — два независимых слоя: первый решает, можно ли обратиться
-- к таблице вообще, второй — какие строки видно. Раздавать права широко
-- безопасно ровно потому, что строки закрывает RLS.

grant usage on schema public to authenticated;

grant select, update, delete        on public.teams       to authenticated;
grant select, update, delete        on public.memberships to authenticated;
grant select, insert, update, delete on public.products   to authenticated;
grant select, insert                on public.events      to authenticated;
grant select                        on public.profiles    to authenticated;
grant select                        on public.app_admins  to authenticated;

grant usage, select on sequence public.events_id_seq to authenticated;
