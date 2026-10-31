-- 暗号文だけを保存する。テーブルへの直接アクセスは不可、関数(RPC)経由のみ。
create table if not exists public.memo_msgs (
  id         bigint generated always as identity primary key,
  room       text not null,
  payload    text not null,
  burn       boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists memo_msgs_room_idx on public.memo_msgs (room, id);
alter table public.memo_msgs enable row level security;   -- ポリシーなし = anon は直接読み書き不可
revoke all on public.memo_msgs from anon, authenticated;

create or replace function public.memo_send(p_room text, p_payload text, p_ttl_sec int, p_burn boolean)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if length(p_room) <> 64 or length(p_payload) > 8000 then raise exception 'bad request'; end if;
  delete from public.memo_msgs where expires_at < now();            -- 期限切れを都度削除
  if (select count(*) from public.memo_msgs m where m.room = p_room) >= 500 then raise exception 'full'; end if;
  insert into public.memo_msgs (room, payload, burn, expires_at)
  values (p_room, p_payload, p_burn, now() + make_interval(secs => least(greatest(p_ttl_sec, 60), 604800)))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.memo_fetch(p_room text, p_after bigint default 0)
returns table (mid bigint, mpayload text, mburn boolean, mcreated timestamptz)
language sql security definer set search_path = public as $$
  select m.id, m.payload, m.burn, m.created_at
  from public.memo_msgs m
  where m.room = p_room and m.id > p_after and m.expires_at > now()
  order by m.id limit 200;
$$;

create or replace function public.memo_burn(p_room text, p_ids bigint[])
returns void language sql security definer set search_path = public as $$
  delete from public.memo_msgs m where m.room = p_room and m.burn and m.id = any(p_ids);
$$;

revoke execute on function public.memo_send(text,text,int,boolean), public.memo_fetch(text,bigint), public.memo_burn(text,bigint[]) from public;
grant  execute on function public.memo_send(text,text,int,boolean), public.memo_fetch(text,bigint), public.memo_burn(text,bigint[]) to anon, authenticated;
