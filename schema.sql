-- 暗号文だけを保存。直接アクセス不可、関数(RPC)経由のみ。新規でも、前版からの更新でもそのまま実行できます。
create table if not exists public.memo_msgs (
  id         bigint generated always as identity primary key,
  room       text not null,
  payload    text not null,
  burn       boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.memo_msgs add column if not exists img text;      -- 暗号化した写真(別カラム。必要な時だけ取得)
create index if not exists memo_msgs_room_idx on public.memo_msgs (room, id);
alter table public.memo_msgs enable row level security;
revoke all on public.memo_msgs from anon, authenticated;

drop function if exists public.memo_send(text,text,int,boolean);
create or replace function public.memo_send(p_room text, p_payload text, p_ttl_sec int, p_burn boolean, p_img text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if length(p_room) <> 64 or length(p_payload) > 8000 or length(coalesce(p_img,'')) > 900000 then raise exception 'bad request'; end if;
  delete from public.memo_msgs where expires_at < now();
  if (select count(*) from public.memo_msgs m where m.room = p_room) >= 500 then raise exception 'full'; end if;
  if p_img is not null and (select count(*) from public.memo_msgs m where m.room = p_room and m.img is not null) >= 100 then raise exception 'full'; end if;
  insert into public.memo_msgs (room, payload, burn, img, expires_at)
  values (p_room, p_payload, p_burn, p_img, now() + make_interval(secs => least(greatest(p_ttl_sec, 60), 315360000)))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.memo_fetch(p_room text, p_after bigint default 0)
returns table (mid bigint, mpayload text, mburn boolean, mcreated timestamptz)
language sql security definer set search_path = public as $$
  select m.id, m.payload, m.burn, m.created_at from public.memo_msgs m
  where m.room = p_room and m.id > p_after and m.expires_at > now() order by m.id limit 200;
$$;

create or replace function public.memo_img(p_room text, p_id bigint)
returns text language sql security definer set search_path = public as $$
  select m.img from public.memo_msgs m where m.room = p_room and m.id = p_id and m.expires_at > now();
$$;

create or replace function public.memo_burn(p_room text, p_ids bigint[])
returns void language sql security definer set search_path = public as $$
  delete from public.memo_msgs m where m.room = p_room and m.burn and m.id = any(p_ids);
$$;

create or replace function public.memo_del(p_room text, p_ids bigint[])
returns void language sql security definer set search_path = public as $$
  delete from public.memo_msgs m where m.room = p_room and m.id = any(p_ids);
$$;

revoke execute on function public.memo_send(text,text,int,boolean,text), public.memo_fetch(text,bigint), public.memo_img(text,bigint), public.memo_burn(text,bigint[]), public.memo_del(text,bigint[]) from public;
grant  execute on function public.memo_send(text,text,int,boolean,text), public.memo_fetch(text,bigint), public.memo_img(text,bigint), public.memo_burn(text,bigint[]), public.memo_del(text,bigint[]) to anon, authenticated;
