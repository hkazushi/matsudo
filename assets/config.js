/* ============================================================
   サイト接続設定(本番用)
   下記3つの値を設定すると、会員エリアの
   「資料アップロード/閲覧/DL」と「開催案内のGoogleフォーム発行」が
   実データで動作します。未設定(空文字)の間はサンプル表示になります。

   設定手順は SETUP.md を参照。
   ============================================================ */
window.SITE_CONFIG = {
  // Supabase → プロジェクト設定 → API の「Project URL」
  SUPABASE_URL: "https://kipvhvkjjvpzwpmeipqn.supabase.co",
  // 公開可能キー(publishable/anon)。サイトに掲載してよい種類のキー
  SUPABASE_ANON_KEY: "sb_publishable_D6Uu_fpfIY_ACKXLp-WhbA_96Mf76Jq",
  // Google Apps Script をウェブアプリとしてデプロイしたURL(gas/form-issuer.gs)
  GAS_FORM_URL: "https://script.google.com/macros/s/AKfycbxcRC9sWMNeZBm0jSKpEtTvIbd3_mTUM_DRgFGKD5zKIiM_l0cDvw9UsIrxK2IG25lYfg/exec",
  // GAS側の SECRET と同じ文字列(簡易な悪用防止)
  GAS_SECRET: "matsudo-form-2026",
};
