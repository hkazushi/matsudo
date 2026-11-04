-- ============================================================
-- 宅建協会 松戸支部HP 会員エリア用 Supabase 初期化SQL
-- Supabaseダッシュボード → SQL Editor に貼り付けて Run するだけ
-- ============================================================

-- 1) 資料保存用ストレージバケット(公開読み取り)
insert into storage.buckets (id, name, public)
values ('kaiin', 'kaiin', true)
on conflict (id) do nothing;

-- 2) ストレージのアクセスポリシー
--    閲覧: 誰でも可(入口の鍵はサイト側の簡易ゲートで担保する合意仕様)
--    追加/更新/削除: ログイン済みユーザー(=事務局アカウント)のみ
drop policy if exists "kaiin_public_read"  on storage.objects;
drop policy if exists "kaiin_auth_insert"  on storage.objects;
drop policy if exists "kaiin_auth_update"  on storage.objects;
drop policy if exists "kaiin_auth_delete"  on storage.objects;

create policy "kaiin_public_read" on storage.objects
  for select using (bucket_id = 'kaiin');
create policy "kaiin_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'kaiin');
create policy "kaiin_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'kaiin');
create policy "kaiin_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'kaiin');

-- 3) 発行済みGoogleフォームのリンク台帳
create table if not exists public.room_links (
  id bigint generated always as identity primary key,
  room text not null,
  title text not null,
  form_url text not null,
  sheet_url text,
  created_at timestamptz not null default now()
);
alter table public.room_links enable row level security;

drop policy if exists "links_read"   on public.room_links;
drop policy if exists "links_insert" on public.room_links;
drop policy if exists "links_delete" on public.room_links;

-- 読み取りは誰でも(会員エリア内で表示するため)
create policy "links_read" on public.room_links for select using (true);
-- 発行(挿入)は誰でも可の簡易構成(幹事は会員エリアの鍵の内側から発行するため)
create policy "links_insert" on public.room_links for insert with check (true);
-- 削除は事務局アカウントのみ
create policy "links_delete" on public.room_links for delete to authenticated using (true);

-- 4) 勉強会フォームの開催日(カレンダーに載せる)
alter table public.room_links add column if not exists event_date date;
drop policy if exists "links_update" on public.room_links;
create policy "links_update" on public.room_links for update to authenticated using (true);

-- 5) 会員名簿(エリアページの会員一覧)。閲覧は誰でも、編集は事務局のみ
--    初回のデータは supabase/members_seed.sql で投入する
create table if not exists public.members (
  id bigint generated always as identity primary key,
  area text not null,                 -- matsudo / kitamatsudo / kogane / keisei / tokiwadaira
  sort integer not null default 0,    -- 表示順(小さい順)
  name text not null,                 -- 商号又は名称
  rep text not null default '',       -- 代表者名
  address text not null default '',   -- 事務所所在地(郵便番号から)
  tel text not null default '',
  fax text not null default '',
  email text not null default '',
  hours text not null default '',     -- 営業時間
  holiday text not null default '',   -- 定休日
  business text not null default '',  -- 業種
  updated_at timestamptz not null default now()
);
alter table public.members enable row level security;
drop policy if exists "members_read"  on public.members;
drop policy if exists "members_write" on public.members;
create policy "members_read"  on public.members for select using (true);
create policy "members_write" on public.members for all to authenticated using (true) with check (true);

-- 6) 行事・会議・研修会の予定(会員エリアのカレンダー)
create table if not exists public.events (
  id bigint generated always as identity primary key,
  room text not null,                 -- gyoji(協会行事・会議) / kenshu(研修会・勉強会)
  event_date date not null,
  start_time text not null default '',-- 例 14:00
  title text not null,
  place text not null default '',
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table public.events enable row level security;
drop policy if exists "events_read"  on public.events;
drop policy if exists "events_write" on public.events;
create policy "events_read"  on public.events for select using (true);
create policy "events_write" on public.events for all to authenticated using (true) with check (true);

-- 完了。次にダッシュボードの Authentication → Users → Add user で
-- 事務局用ログイン(メール+パスワード)を1件作成してください。
