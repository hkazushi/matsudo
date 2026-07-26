/* ============================================================
   サイト接続設定(本番用)
   下記3つの値を設定すると、会員エリアの
   「資料アップロード/閲覧/DL」と「開催案内のGoogleフォーム発行」が
   実データで動作します。未設定(空文字)の間はサンプル表示になります。

   設定手順は SETUP.md を参照。
   ============================================================ */
window.SITE_CONFIG = {
  // Supabase → プロジェクト設定 → API の「Project URL」
  SUPABASE_URL: "",
  // 同ページの「anon public」キー(service_roleは絶対に貼らないこと)
  SUPABASE_ANON_KEY: "",
  // Google Apps Script をウェブアプリとしてデプロイしたURL(gas/form-issuer.gs)
  GAS_FORM_URL: "",
  // GAS側の SECRET と同じ文字列(簡易な悪用防止)
  GAS_SECRET: "matsudo-form-2026",
};
