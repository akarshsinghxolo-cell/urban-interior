create or replace function public.uc_clear_terminal_upload_session()
returns trigger
language plpgsql
security invoker
set search_path=public
as $$
begin
  if new.status in ('uploaded_unverified','verifying','finalizing','completed','cancelled')
     or new.google_file_id is not null then
    new.session_uri:=null;
    new.session_expires_at:=null;
  end if;
  return new;
end;
$$;

drop trigger if exists uc_upload_items_clear_terminal_session on public.uc_upload_items;
create trigger uc_upload_items_clear_terminal_session
before insert or update of status,google_file_id on public.uc_upload_items
for each row execute function public.uc_clear_terminal_upload_session();

update public.uc_upload_items
set session_uri=null,session_expires_at=null,updated_at=now()
where status in ('uploaded_unverified','verifying','finalizing','completed','cancelled')
   or google_file_id is not null;

revoke all on function public.uc_clear_terminal_upload_session() from public,anon,authenticated;
grant execute on function public.uc_clear_terminal_upload_session() to service_role;
