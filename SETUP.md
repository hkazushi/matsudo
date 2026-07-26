# 会員エリア本稼働セットアップ(所要 約15分)

「資料アップロード/閲覧/DL」と「開催案内のGoogleフォーム発行」を実データで動かす手順です。
コードは実装済みで、**下記で取得した3つの値を `assets/config.js` に貼るだけ**で稼働します。
(値をSAIに共有いただければ、こちらで貼り付け〜デプロイまで代行します)

---

## STEP 1: Supabase(資料ストレージ)— 約10分

1. https://supabase.com にログイン(無料プランでOK)
2. **New Project** で新規プロジェクト作成(名前: `matsudo-takken` など / リージョン: Northeast Asia (Tokyo))
3. 左メニュー **SQL Editor** → 新規クエリ → リポジトリ内 `supabase/setup.sql` の中身を貼り付けて **Run**
   (ストレージバケット・アクセス権・フォーム台帳が自動作成されます)
4. 左メニュー **Authentication → Users → Add user → Create new user** で事務局用ログインを1件作成
   - Email: 事務局のメールアドレス / Password: 強固なもの(このID/PWで資料の追加・削除を行います)
   - **Auto Confirm User にチェック**
5. 左メニュー **Project Settings → API** から以下2つをコピー
   - `Project URL` → config.js の `SUPABASE_URL`
   - `anon public` キー → config.js の `SUPABASE_ANON_KEY`(**service_roleは絶対に貼らない**)

## STEP 2: Google Apps Script(フォーム発行)— 約5分

1. 支部運用に使うGoogleアカウントで https://script.google.com → **新しいプロジェクト**
2. リポジトリ内 `gas/form-issuer.gs` の中身を全て貼り付けて保存
3. **デプロイ → 新しいデプロイ → 種類: ウェブアプリ**
   - 実行ユーザー: **自分** / アクセスできるユーザー: **全員**
4. 初回は権限承認(フォーム・スプレッドシート作成の許可)を実行
5. 表示された **ウェブアプリのURL** → config.js の `GAS_FORM_URL`

※発行されたフォーム/シートはこのGoogleアカウントのドライブに保存されます。

## STEP 3: 反映

`assets/config.js` に3つの値を記入して push(またはSAIへ値を連絡)。

---

## 動作内容(設定完了後)

| 機能 | 場所 | 動作 |
|---|---|---|
| 資料アップロード | `kaiin/upload.html`(事務局ログイン) | フォルダ選択→複数ファイル一括アップ/削除。同名は上書き |
| 資料の閲覧・DL | 会員エリアの各フォルダ | Supabaseの実ファイル一覧を表示、その場でDL |
| フォーム発行 | 幹事・委員会エリアの各部屋 | タイトル入力→Googleフォーム+集計シート自動作成、部屋の一覧に自動掲載 |

## セキュリティ設計(合意済みの簡易仕様)

- 閲覧は「部屋ごとの鍵」(サイト側の簡易ゲート)で抑止。ストレージ自体は公開読み取り
- **追加・削除はSupabase認証(事務局アカウント)必須** — 第三者はアップロード不可
- フォーム発行はGAS側の合言葉(`GAS_SECRET`)で悪用を抑止
- 機微な資料を扱う段階になったら、署名付きURL方式への強化をSAIにご相談ください
