/**
 * 宅建協会 松戸支部HP — 開催案内 Googleフォーム自動発行スクリプト
 *
 * 【デプロイ手順(5分)】
 * 1. 支部アカウント(takken.matsudo.official@gmail.com)で
 *    https://script.google.com → 「新しいプロジェクト」
 * 2. このファイルの中身を全て貼り付けて保存(プロジェクト名は任意)
 * 3. 右上「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *    - 実行ユーザー: 自分
 *    - アクセスできるユーザー: 全員   ← ここが「自分のみ」だとサイトから呼べません
 * 4. 表示された「ウェブアプリのURL」を assets/config.js の GAS_FORM_URL に貼る
 * 5. 初回デプロイ時に権限承認(フォーム/スプレッドシート/ドライブの許可)を行う
 *
 * 発行されるもの:
 *  - Googleフォーム「【<タイトル>】出欠回答」(会社名/お名前/出欠/備考)
 *  - 回答が自動集計されるスプレッドシート「【<タイトル>】出欠集計」
 *  - 上記2つを収める開催回ごとのフォルダ
 *
 * 【フォルダ構成】
 *  松戸支部HP 提出フォーム/
 *  ├ ① 一般会員/
 *  │  ├ 研修会・勉強会/  2026-08-04 〇〇勉強会/ ← フォーム + 出欠集計
 *  │  └ 調査・アンケート/ 2026-08-04 〇〇調査/  ← フォーム + 回答集計
 *  └ ② 幹事・委員会/
 *     ├ 幹事会(全体)/ ... ├ 流通委員会/ 2026-08-04 〇〇/
 *
 * ※フォルダは発行時に自動生成されます(既にあれば再利用)。
 * ※事前に全フォルダを作っておきたい場合は、エディタで setupFolders() を1回実行。
 */

var SECRET = "matsudo-form-2026"; // assets/config.js の GAS_SECRET と一致させる

var VERSION = 4; // 更新の反映確認用

/** ドライブ上の親フォルダ名(マイドライブ直下に作られます) */
var ROOT_FOLDER = "松戸支部HP 提出フォーム";

/** 部屋ID → [第1階層, 第2階層] のフォルダ割り当て */
var ROOM_FOLDERS = {
  // ① 一般会員エリア
  kenshu:   ["① 一般会員", "研修会・勉強会"],
  chosa:    ["① 一般会員", "調査・アンケート"],
  gyoji:    ["① 一般会員", "協会行事・会議等"],
  oshirase: ["① 一般会員", "会員向けお知らせ"],
  hokoku:   ["① 一般会員", "行事報告"],
  shoshiki: ["① 一般会員", "書式ダウンロード"],
  kitei:    ["① 一般会員", "支部規定・施行細則"],
  shiryo:   ["① 一般会員", "各種資料"],
  // ② 幹事・委員会エリア
  kanjikai: ["② 幹事・委員会", "幹事会(全体)"],
  i1:       ["② 幹事・委員会", "総務委員会"],
  i2:       ["② 幹事・委員会", "財務委員会"],
  i3:       ["② 幹事・委員会", "綱紀・研修委員会"],
  i4:       ["② 幹事・委員会", "厚生委員会"],
  i5:       ["② 幹事・委員会", "広報委員会"],
  i6:       ["② 幹事・委員会", "入会審査委員会"],
  i7:       ["② 幹事・委員会", "無料相談業務委員会"],
  i8:       ["② 幹事・委員会", "流通委員会"]
};

/**
 * 調査・アンケートでファイル添付が必要な場合に使用するテンプレートフォームのID。
 * FormApp にはファイルアップロード設問を作るAPIが存在しないため、
 * 添付ありの調査は「手動で作ったテンプレートを複製する」方式で対応します。
 * 空文字のままなら通常どおり自動生成(記述式のみ)になります。
 */
var SURVEY_TEMPLATE_ID = "";

/**
 * 動作確認用。デプロイ後、ウェブアプリのURLをブラウザ(シークレットウィンドウ)で開き、
 * {"ok":true,...} と表示されれば公開設定は正常です。
 */
function doGet() {
  return json_({ ok: true, service: "matsudo form issuer", ready: true, version: VERSION });
}

function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);
    if (p.secret !== SECRET) return json_({ error: "unauthorized" });
    if (!p.title) return json_({ error: "title required" });

    var title = String(p.title).slice(0, 80);
    var room = String(p.room || "");
    var kind = p.kind === "survey" ? "survey" : "attendance";

    // 発行先フォルダ(部屋 → 開催回)を用意
    var folder = targetFolder_(room, title);

    var form, ss;
    if (kind === "survey" && SURVEY_TEMPLATE_ID) {
      // 添付ありテンプレートの複製(ファイルアップロード設問を保持できる唯一の方法)
      var copy = DriveApp.getFileById(SURVEY_TEMPLATE_ID)
        .makeCopy("【" + title + "】回答", folder);
      form = FormApp.openById(copy.getId());
      form.setTitle("【" + title + "】回答");
      ss = SpreadsheetApp.create("【" + title + "】回答集計");
      form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
    } else if (kind === "survey") {
      form = buildSurveyForm_(title);
      ss = SpreadsheetApp.create("【" + title + "】回答集計");
      form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
    } else {
      form = buildAttendanceForm_(title);
      ss = SpreadsheetApp.create("【" + title + "】出欠集計");
      form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
    }

    // フォーム本体と集計シートを同じフォルダへ収納
    var movedForm = moveToFolder_(form.getId(), folder);
    var movedSheet = moveToFolder_(ss.getId(), folder);

    var stillRequiresLogin = null;
    try { stillRequiresLogin = form.requiresLogin(); } catch (err2) {}

    return json_({
      ok: true,
      version: VERSION,
      formUrl: form.getPublishedUrl(),   // 会員が回答するURL
      formEditUrl: form.getEditUrl(),    // 事務局・幹事の編集URL
      sheetUrl: ss.getUrl(),             // 集計スプレッドシート
      folderUrl: folder.getUrl(),        // 収納先フォルダ
      folderName: folder.getName(),
      filed: movedForm && movedSheet,    // false ならマイドライブ直下に残っている
      requiresLogin: stillRequiresLogin  // true なら会員が回答できない状態
    });
  } catch (err) {
    return json_({ error: String(err) });
  }
}

/** 出欠回答フォーム(研修会・勉強会・委員会) */
function buildAttendanceForm_(title) {
  var form = FormApp.create("【" + title + "】出欠回答");
  form.setDescription(
    "宅建協会松戸支部「" + title + "」の出欠回答フォームです。\n" +
    "回答期限までにご回答をお願いいたします。"
  );
  form.setCollectEmail(false);
  // Google Workspace アカウントで作成すると既定で「組織内のみ回答可」になるため解除
  try { form.setRequireLogin(false); } catch (e) {}
  form.addTextItem().setTitle("会社名(商号)").setRequired(true);
  form.addTextItem().setTitle("お名前").setRequired(true);
  form.addMultipleChoiceItem()
    .setTitle("出欠")
    .setChoiceValues(["出席", "欠席", "委任"])
    .setRequired(true);
  form.addParagraphTextItem().setTitle("備考(遅刻・早退のご連絡など)");
  return form;
}

/** 調査・アンケート用フォーム(記述式) */
function buildSurveyForm_(title) {
  var form = FormApp.create("【" + title + "】回答");
  form.setDescription(
    "宅建協会松戸支部「" + title + "」の回答フォームです。\n" +
    "回答期限までにご回答をお願いいたします。"
  );
  form.setCollectEmail(false);
  try { form.setRequireLogin(false); } catch (e) {}
  form.addTextItem().setTitle("会社名(商号)").setRequired(true);
  form.addTextItem().setTitle("お名前").setRequired(true);
  form.addParagraphTextItem().setTitle("回答内容").setRequired(true);
  form.addParagraphTextItem().setTitle("備考");
  return form;
}

/** 部屋と開催回に対応するフォルダを取得(無ければ作成) */
function targetFolder_(room, title) {
  var root = getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER);
  var path = ROOM_FOLDERS[room] || ["その他", "未分類"];
  var f = root;
  for (var i = 0; i < path.length; i++) f = getOrCreateFolder_(f, path[i]);
  return getOrCreateFolder_(f, today_() + " " + safeName_(title));
}

function getOrCreateFolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/** ファイルを指定フォルダへ移動。成功したら true */
function moveToFolder_(fileId, folder) {
  try {
    var file = DriveApp.getFileById(fileId);
    if (file.moveTo) {
      file.moveTo(folder);
    } else {
      // 旧ランタイム向けのフォールバック
      folder.addFile(file);
      DriveApp.getRootFolder().removeFile(file);
    }
    return true;
  } catch (e) {
    return false;
  }
}

function today_() {
  return Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");
}

/** ドライブのフォルダ名に使えない文字を除去 */
function safeName_(s) {
  return String(s).replace(/[\/\\]/g, "-").slice(0, 60).trim() || "無題";
}

/**
 * 【任意】フォルダ構成を事前にまとめて作成します。
 * エディタで関数 setupFolders を選んで「実行」すると、
 * ①一般会員 / ②幹事・委員会 配下の全フォルダが一度に出来上がります。
 */
function setupFolders() {
  var root = getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER);
  var made = [];
  for (var room in ROOM_FOLDERS) {
    var path = ROOM_FOLDERS[room];
    var f = root;
    for (var i = 0; i < path.length; i++) f = getOrCreateFolder_(f, path[i]);
    made.push(path.join(" / "));
  }
  Logger.log("作成/確認したフォルダ:\n" + made.join("\n"));
  return made;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
