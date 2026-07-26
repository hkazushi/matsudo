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

-- 完了。次にダッシュボードの Authentication → Users → Add user で
-- 事務局用ログイン(メール+パスワード)を1件作成してください。
