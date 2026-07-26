alter table public.uc_upload_items
  add column if not exists session_origin text;

comment on column public.uc_upload_items.session_origin is
  'HTTP(S) browser origin bound to the current Google Drive resumable upload session for CORS.';

alter table public.uc_upload_items
  drop constraint if exists uc_upload_items_session_origin_http;

alter table public.uc_upload_items
  add constraint uc_upload_items_session_origin_http
  check (session_origin is null or session_origin ~ '^https?://[^[:space:]]+$');

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
    new.session_origin:=null;
  end if;
  return new;
end;
$$;

update public.uc_upload_items
set session_origin=null,updated_at=now()
where status in ('uploaded_unverified','verifying','finalizing','completed','cancelled')
   or google_file_id is not null;

revoke all on function public.uc_clear_terminal_upload_session() from public,anon,authenticated;
grant execute on function public.uc_clear_terminal_upload_session() to service_role;
