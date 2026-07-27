/**
 * 宅建協会 松戸支部HP — 開催案内 Googleフォーム自動発行スクリプト
 *
 * 【デプロイ手順(5分)】
 * 1. https://script.google.com → 「新しいプロジェクト」
 * 2. このファイルの中身を全て貼り付けて保存(プロジェクト名は任意)
 * 3. 右上「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *    - 実行ユーザー: 自分
 *    - アクセスできるユーザー: 全員
 * 4. 表示された「ウェブアプリのURL」を assets/config.js の GAS_FORM_URL に貼る
 * 5. 初回デプロイ時に権限承認(フォーム/スプレッドシート作成の許可)を行う
 *
 * 発行されるもの:
 *  - Googleフォーム「【<タイトル>】出欠回答」(会社名/お名前/出欠/備考)
 *  - 回答が自動集計されるスプレッドシート「【<タイトル>】出欠集計」
 */

var SECRET = "matsudo-form-2026"; // assets/config.js の GAS_SECRET と一致させる

/**
 * 動作確認用。デプロイ後、ウェブアプリのURLをブラウザ(シークレットウィンドウ)で開き、
 * {"ok":true,...} と表示されれば公開設定は正常です。
 * 「ページが見つかりません」と出る場合は、デプロイの
 * 「アクセスできるユーザー」が『全員』になっていません。
 */
var VERSION = 3; // 更新の反映確認用

function doGet() {
  return json_({ ok: true, service: "matsudo form issuer", ready: true, version: VERSION });
}

function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);
    if (p.secret !== SECRET) return json_({ error: "unauthorized" });
    if (!p.title) return json_({ error: "title required" });

    var title = String(p.title).slice(0, 80);

    // 出欠フォーム作成
    var form = FormApp.create("【" + title + "】出欠回答");
    form.setDescription(
      "宅建協会松戸支部「" + title + "」の出欠回答フォームです。\n" +
      "回答期限までにご回答をお願いいたします。"
    );
    form.setCollectEmail(false);
    // 重要: Google Workspace アカウントで作成すると既定で
    // 「組織内のユーザーのみ回答可」になり、会員が回答できないため解除する。
    var loginFixError = "";
    try {
      form.setRequireLogin(false);
    } catch (e) {
      loginFixError = String(e);
    }
    form.addTextItem().setTitle("会社名(商号)").setRequired(true);
    form.addTextItem().setTitle("お名前").setRequired(true);
    form.addMultipleChoiceItem()
      .setTitle("出欠")
      .setChoiceValues(["出席", "欠席", "委任"])
      .setRequired(true);
    form.addParagraphTextItem().setTitle("備考(遅刻・早退のご連絡など)");

    // 集計用スプレッドシートを作成して紐付け
    var ss = SpreadsheetApp.create("【" + title + "】出欠集計");
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

    var stillRequiresLogin = null;
    try { stillRequiresLogin = form.requiresLogin(); } catch (e) {}

    return json_({
      ok: true,
      version: VERSION,
      formUrl: form.getPublishedUrl(),   // 会員が回答するURL
      formEditUrl: form.getEditUrl(),    // 事務局・幹事の編集URL
      sheetUrl: ss.getUrl(),             // 集計スプレッドシート
      requiresLogin: stillRequiresLogin, // true なら会員が回答できない状態
      loginFixError: loginFixError       // 解除に失敗した場合の理由
    });
  } catch (err) {
    return json_({ error: String(err) });
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
