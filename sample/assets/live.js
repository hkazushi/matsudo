/* ==========================================================================
   新デザイン — 機能スクリプト
   ・会員エリアの入口の鍵 / 委員会フォルダの鍵(パスワードは平文で置かず、ハッシュ値で照合)
   ・フォルダの中身(資料・フォーム・カレンダー)を Supabase から表示
   ・お知らせ・会員名簿をデータから表示 / お問い合わせ送信後の戻り先
   ・事務局の管理画面(kaiin/upload.html)
   接続設定は assets/config.js(現行サイトと共通)。未設定なら HTML に書かれた内容のまま表示する。
   c.js より先に読み込む(入口の鍵を、演出の初期化より前に外すため)。
   ========================================================================== */
(function () {
  "use strict";
  var CFG = window.SITE_CONFIG || {};
  var SB = (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase)
    ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY)
    : null;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  // フォルダ(部屋)の一覧。管理画面の選択肢と、一覧の表示名に使う
  var ROOMS = [
    ["oshirase", "① 会員向けお知らせ"], ["gyoji", "① 協会行事・会議等日程表"], ["shoshiki", "① 書式ダウンロード"],
    ["kitei", "① 支部規定・施行細則"], ["hokoku", "① 会員のための行事報告"], ["kenshu", "① 研修会・勉強会"],
    ["chosa", "① 調査・アンケート"], ["shiryo", "① 各種資料"], ["kanjikai", "② 幹事会(全体)"],
    ["i1", "② 総務委員会"], ["i2", "② 財務委員会"], ["i3", "② 綱紀・研修委員会"], ["i4", "② 厚生委員会"],
    ["i5", "② 広報委員会"], ["i6", "② 入会審査委員会"], ["i7", "② 無料相談業務委員会"], ["i8", "② 流通委員会"],
  ];
  // フォーム(出欠・アンケート)を載せられるフォルダ。一般会員エリアは研修会とアンケートだけ
  var FORM_ROOMS = ["kenshu", "chosa", "kanjikai", "i1", "i2", "i3", "i4", "i5", "i6", "i7", "i8"];
  // カレンダーを出すフォルダ
  var CAL_ROOMS = { gyoji: "協会行事・会議", kenshu: "研修会・勉強会" };
  var AREAS = [["matsudo", "松戸・矢切地区"], ["kitamatsudo", "北松戸・馬橋地区"], ["kogane", "小金・新松戸地区"],
    ["keisei", "京成松戸地区"], ["tokiwadaira", "常盤平・五香地区"]];
  var WD = ["日", "月", "火", "水", "木", "金", "土"];
  var SKIP_PASS = !!CFG.SKIP_PASSWORDS;   // 確認期間中はパスワードなしで開ける(config.js)

  function roomName(id) { for (var i = 0; i < ROOMS.length; i++) if (ROOMS[i][0] === id) return ROOMS[i][1]; return id; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function pad(n) { return String(n).padStart(2, "0"); }
  function dot(d) { return d.getFullYear() + "." + pad(d.getMonth() + 1) + "." + pad(d.getDate()); }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function fromIso(s) { var p = String(s).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function fmtSize(b) {
    if (b == null) return "";
    if (b < 1024) return b + " B";
    if (b < 1048576) return Math.round(b / 1024) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
  }
  function store(kind, key, val) {
    try {
      if (kind === "get") return sessionStorage.getItem(key);
      sessionStorage.setItem(key, val);
    } catch (e) {}
    return null;
  }
  // Supabase Storage のキーは ASCII の限られた文字しか使えない。日本語名は "=" を目印に可逆変換する(現行サイトと同じ方式)
  function toKey(name) { return encodeURIComponent(name).replace(/~/g, "%7E").replace(/%/g, "="); }
  function fromKey(key) {
    if (key.indexOf("=") === -1) return key;
    try { return decodeURIComponent(key.replace(/=/g, "%")); } catch (e) { return key; }
  }
  function extType(name) {
    var e = (name.split(".").pop() || "").toLowerCase();
    if (e === "pdf") return "PDF";
    if (e === "xlsx" || e === "xls" || e === "csv") return "XLSX";
    if (e === "doc" || e === "docx") return "DOC";
    return (e || "FILE").toUpperCase().slice(0, 5);
  }
  function copyText(btn, text) {
    function done() { var t = btn.textContent; btn.textContent = "コピーしました"; setTimeout(function () { btn.textContent = t; }, 1600); }
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { window.prompt("このURLをコピーしてください", text); });
    else window.prompt("このURLをコピーしてください", text);
  }

  // ---- SHA-256(http のままでも動くよう、ブラウザの暗号APIに頼らず計算する) ----
  function sha256(str) {
    var K = [], H = [], i, j;
    var isPrime = function (n) { for (var f = 2; f * f <= n; f++) if (n % f === 0) return false; return true; };
    var frac = function (x) { return ((x - Math.floor(x)) * 4294967296) | 0; };
    for (var n = 2, c = 0; c < 64; n++) if (isPrime(n)) { if (c < 8) H[c] = frac(Math.pow(n, 1 / 2)); K[c++] = frac(Math.pow(n, 1 / 3)); }
    var bytes = unescape(encodeURIComponent(str)), l = bytes.length, words = [];
    for (i = 0; i < l; i++) words[i >> 2] |= bytes.charCodeAt(i) << (24 - (i % 4) * 8);
    words[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
    words[(((l + 8) >> 6) + 1) * 16 - 1] = l * 8;
    var rot = function (x, r) { return (x >>> r) | (x << (32 - r)); };
    for (i = 0; i < words.length; i += 16) {
      var w = words.slice(i, i + 16), h = H.slice(0);
      for (j = 0; j < 64; j++) {
        if (j < 16) w[j] = w[j] | 0;   // 末尾の空きは 0 として扱う
        else {
          var a = w[j - 15], b = w[j - 2];
          w[j] = ((rot(a, 7) ^ rot(a, 18) ^ (a >>> 3)) + w[j - 16] + (rot(b, 17) ^ rot(b, 19) ^ (b >>> 10)) + w[j - 7]) | 0;
        }
        var t1 = h[7] + (rot(h[4], 6) ^ rot(h[4], 11) ^ rot(h[4], 25)) + ((h[4] & h[5]) ^ (~h[4] & h[6])) + K[j] + w[j];
        var t2 = (rot(h[0], 2) ^ rot(h[0], 13) ^ rot(h[0], 22)) + ((h[0] & h[1]) ^ (h[0] & h[2]) ^ (h[1] & h[2]));
        h = [(t1 + t2) | 0].concat(h.slice(0, 7));
        h[4] = (h[4] + t1) | 0;
      }
      for (j = 0; j < 8; j++) H[j] = (H[j] + h[j]) | 0;
    }
    return H.map(function (x) { return ("00000000" + (x >>> 0).toString(16)).slice(-8); }).join("");
  }
  function passOk(input, hash) { return sha256("matsudo:" + input) === hash; }

  try { gates(); } catch (e) { if (window.console) console.error(e); }
  window.liveRoom = openRoom;
  contactForm();
  if (SB) {
    news();
    members();
    admin();
  } else {
    var off = $("#adm-off"); if (off) off.hidden = false;
  }

  /* ---- 入口の鍵(一般会員・幹事委員会) ---- */
  function gates() {
    $$("[data-gate]").forEach(function (g) {
      var key = "gate_" + g.getAttribute("data-gate"), content = document.getElementById("gated-content");
      function open() { g.remove(); if (content) content.hidden = false; }
      if (store("get", key) === "ok") { open(); return; }
      var form = $("form", g), input = $("input", form), err = $(".err", g);
      if (SKIP_PASS) {
        input.placeholder = "入力は不要です";
        var note = document.createElement("p");
        note.className = "note";
        note.textContent = "確認期間中は、パスワードを入力せずに「入室する」で入れます。";
        form.parentNode.insertBefore(note, form);
      }
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (SKIP_PASS || passOk(input.value, g.getAttribute("data-hash"))) {
          store("set", key, "ok");
          open();
          window.dispatchEvent(new Event("resize"));   // 演出側(文字の折り返し・スクロール量)を測り直す
          window.scrollTo(0, (content || document.body).getBoundingClientRect().top + window.scrollY - 120);
        } else {
          err.hidden = false;
          input.value = "";
          input.focus();
        }
      });
    });
  }

  /* ---- フォルダを開く(委員会フォルダは個別の鍵を先に確認) ---- */
  function openRoom(f) {
    var room = f.getAttribute("data-room"), title = $("h3", f).textContent.trim(), hash = f.getAttribute("data-hash");
    var M = window.cModal;
    if (!M) return;
    if (hash && store("get", "room_" + room) !== "ok") {
      var body = M.open(title, '<form class="lockform"><p>このフォルダは個別のパスワードで保護されています。' +
        (SKIP_PASS ? "確認期間中は、入力せずに「開く」で入れます。" : "") + "</p>" +
        '<input type="password" placeholder="' + (SKIP_PASS ? "入力は不要です" : "フォルダのパスワード") + '" aria-label="フォルダのパスワード" autocomplete="off">' +
        '<p class="err" hidden>パスワードが違います</p><button class="lux" type="submit">開く</button></form>');
      var form = $("form", body), input = $("input", form);
      setTimeout(function () { input.focus(); }, 50);
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (SKIP_PASS || passOk(input.value, hash)) { store("set", "room_" + room, "ok"); f.classList.add("is-open"); openRoom(f); }
        else { $(".err", form).hidden = false; input.value = ""; input.focus(); }
      });
      return;
    }
    if (!SB) {
      var tpl = document.getElementById("room-" + room);
      var b = M.open(title, tpl ? tpl.innerHTML : '<p class="note">掲載中の資料はありません。</p>');
      var h = $("h3", b); if (h && h.textContent.trim() === title) h.remove();
      return;
    }
    renderRoom(f, room, title);
  }

  async function renderRoom(f, room, title) {
    var M = window.cModal;
    var isIppan = /ippan\.html/.test(location.pathname);
    var hasCal = !!CAL_ROOMS[room];
    var hasForms = isIppan ? (room === "kenshu" || room === "chosa") : true;
    M.open(title, '<p class="note">読み込み中…</p>');

    var jobs = [
      SB.storage.from("kaiin").list(room, { limit: 200, sortBy: { column: "updated_at", order: "desc" } }),
      (hasForms || hasCal) ? SB.from("room_links").select("*").eq("room", room).order("created_at", { ascending: false }) : null,
      hasCal ? SB.from("events").select("*").eq("room", room).order("event_date") : null,
      SB.auth.getSession(),
    ];
    var r = await Promise.all(jobs.map(function (p) { return p ? p.then(function (x) { return x; }, function () { return {}; }) : {}; }));
    var files = ((r[0] && r[0].data) || []).filter(function (x) { return x.name && x.name.charAt(0) !== "." && x.id; });
    var links = (r[1] && r[1].data) || [];
    var events = (r[2] && r[2].data) || [];
    var session = r[3] && r[3].data && r[3].data.session;
    var failed = r[0] && r[0].error;

    // 資料
    var dl = files.length ? '<ul class="file-list">' + files.map(function (x) {
      var name = fromKey(x.name);
      var url = SB.storage.from("kaiin").getPublicUrl(room + "/" + x.name, { download: name }).data.publicUrl;
      var size = x.metadata ? x.metadata.size : null;
      return '<li><span class="f-type">' + extType(name) + '</span><div>' + esc(name) + '<span class="f-meta">' +
        dot(new Date(x.updated_at || x.created_at)) + (size != null ? "　" + fmtSize(size) : "") +
        '</span></div><a class="dl" href="' + esc(url) + '" target="_blank" rel="noopener">DL</a></li>';
    }).join("") + "</ul>"
      : '<p class="note">' + (failed ? "資料を読み込めませんでした。時間をおいて開き直してください。" : "掲載中の資料はまだありません。") + "</p>";

    // フォーム(出欠回答・アンケート)
    var fm = "";
    if (hasForms) {
      fm = links.length ? '<ul class="file-list">' + links.map(function (l) {
        var when = l.event_date ? "開催 " + dot(fromIso(l.event_date)) : dot(new Date(l.created_at)) + " 掲載";
        var act = '<a class="dl" href="' + esc(l.form_url) + '" target="_blank" rel="noopener">' + (room === "chosa" ? "回答する" : "出欠を回答") + "</a>";
        if (!isIppan) {
          if (l.sheet_url) act += '<a class="dl" href="' + esc(l.sheet_url) + '" target="_blank" rel="noopener">集計</a>';
          act += '<button class="dl" type="button" data-copy="' + esc(l.form_url) + '">リンクをコピー</button>';
        }
        return '<li><span class="f-type">FORM</span><div>' + esc(l.title) + '<span class="f-meta">' + when + "</span></div>" + act + "</li>";
      }).join("") + "</ul>"
        : '<p class="note">' + (room === "chosa" ? "現在お願いしている調査・アンケートはありません。" : isIppan ? "現在ご案内中の研修会・勉強会はありません。" : "発行済みのフォームはまだありません。") + "</p>";
    }

    var tabs = [];
    if (hasCal) tabs.push(["cal", "カレンダー"]);
    tabs.push(["dl", "資料"]);
    if (hasForms) tabs.push(["fm", room === "chosa" ? "アンケート" : room === "kenshu" ? "出欠の回答" : "開催案内・出欠"]);
    var html = (tabs.length > 1 ? '<div class="tabs cm-tabs" role="tablist">' + tabs.map(function (t, i) {
      return '<button class="tab' + (i ? "" : " is-on") + '" type="button" role="tab" aria-selected="' + (i ? "false" : "true") + '" data-pane="' + t[0] + '">' + t[1] + "</button>";
    }).join("") + "</div>" : "") +
      (hasCal ? '<div class="tabpane" data-pane="cal"></div>' : "") +
      '<div class="tabpane" data-pane="dl"' + (hasCal ? " hidden" : "") + ">" + dl + "</div>" +
      (hasForms ? '<div class="tabpane" data-pane="fm" hidden>' + fm + "</div>" : "") +
      (session ? '<p class="note cm-admin">事務局としてログイン中です。資料・フォーム・予定の追加は<a href="upload.html">管理ページ</a>から行えます。</p>' : "");
    var body = M.open(title, html);

    $$(".cm-tabs .tab", body).forEach(function (b) {
      b.addEventListener("click", function () {
        $$(".cm-tabs .tab", body).forEach(function (x) { var on = x === b; x.classList.toggle("is-on", on); x.setAttribute("aria-selected", String(on)); });
        $$(".tabpane", body).forEach(function (p) { p.hidden = p.getAttribute("data-pane") !== b.getAttribute("data-pane"); });
      });
    });
    $$("[data-copy]", body).forEach(function (b) { b.addEventListener("click", function () { copyText(b, b.getAttribute("data-copy")); }); });

    if (hasCal) {
      var items = events.map(function (e) {
        return { date: e.event_date, time: e.start_time, title: e.title, place: e.place, note: e.note };
      }).concat(links.filter(function (l) { return l.event_date; }).map(function (l) {
        return { date: l.event_date, title: l.title, url: l.form_url };
      }));
      calendar($('[data-pane="cal"].tabpane', body), items);
    }
  }

  /* ---- 月のカレンダーと、その月の予定一覧 ---- */
  function calendar(box, items) {
    items.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time || "") < (b.time || "") ? -1 : 1; });
    var today = iso(new Date()), cur = new Date();
    cur = new Date(cur.getFullYear(), cur.getMonth(), 1);
    // 今月に予定が無く、先の予定があるならその月から見せる
    var ym = function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1); };
    if (!items.some(function (x) { return x.date.slice(0, 7) === ym(cur); })) {
      var next = items.filter(function (x) { return x.date >= today; })[0];
      if (next) cur = new Date(+next.date.slice(0, 4), +next.date.slice(5, 7) - 1, 1);
    }
    function draw() {
      var y = cur.getFullYear(), m = cur.getMonth(), key = ym(cur);
      var inMonth = items.filter(function (x) { return x.date.slice(0, 7) === key; });
      var byDay = {};
      inMonth.forEach(function (x) { (byDay[+x.date.slice(8, 10)] = byDay[+x.date.slice(8, 10)] || []).push(x); });
      var first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate(), cells = [];
      for (var i = 0; i < first; i++) cells.push("<td></td>");
      for (var d = 1; d <= days; d++) {
        var ds = key + "-" + pad(d), ev = byDay[d] || [], wd = (first + d - 1) % 7;
        cells.push('<td class="' + (ds === today ? "is-today " : "") + (ev.length ? "has " : "") + (wd === 0 ? "sun" : wd === 6 ? "sat" : "") + '">' +
          (ev.length ? '<button type="button" data-day="' + ds + '">' : "<span>") + d +
          (ev.length ? '<i aria-label="予定 ' + ev.length + '件"></i></button>' : "</span>") + "</td>");
      }
      while (cells.length % 7) cells.push("<td></td>");
      var rows = [];
      for (var k = 0; k < cells.length; k += 7) rows.push("<tr>" + cells.slice(k, k + 7).join("") + "</tr>");
      var list = inMonth.length ? '<ul class="cal-list">' + inMonth.map(function (x) {
        var dt = fromIso(x.date);
        return '<li id="cal-' + x.date + '" class="' + (x.date < today ? "is-past" : "") + '"><p class="cal-d"><b>' + (dt.getMonth() + 1) + "/" + dt.getDate() +
          "</b><small>(" + WD[dt.getDay()] + ")" + (x.time ? " " + esc(x.time) : "") + "</small></p><div><p class=\"cal-t\">" + esc(x.title) + "</p>" +
          (x.place ? '<p class="note">場所: ' + esc(x.place) + "</p>" : "") + (x.note ? '<p class="note">' + esc(x.note) + "</p>" : "") + "</div>" +
          (x.url ? '<a class="dl" href="' + esc(x.url) + '" target="_blank" rel="noopener">出欠を回答</a>' : "") + "</li>";
      }).join("") + "</ul>" : '<p class="note cal-none">この月の予定はありません。</p>';
      box.innerHTML = '<div class="cal"><div class="cal-hd"><button type="button" class="cal-nav" data-mv="-1" aria-label="前の月">Prev</button>' +
        '<p class="cal-ttl"><small>' + y + "</small>" + (m + 1) + "<span>月</span></p>" +
        '<button type="button" class="cal-nav" data-mv="1" aria-label="次の月">Next</button></div>' +
        '<table class="cal-grid"><thead><tr>' + WD.map(function (w) { return "<th>" + w + "</th>"; }).join("") + "</tr></thead><tbody>" + rows.join("") + "</tbody></table>" +
        list + "</div>";
      $$(".cal-nav", box).forEach(function (b) {
        b.addEventListener("click", function () { cur = new Date(y, m + +b.getAttribute("data-mv"), 1); draw(); });
      });
      $$("[data-day]", box).forEach(function (b) {
        b.addEventListener("click", function () {
          var li = document.getElementById("cal-" + b.getAttribute("data-day"));
          if (!li) return;
          li.scrollIntoView({ behavior: "smooth", block: "nearest" });
          li.classList.remove("is-hit"); void li.offsetWidth; li.classList.add("is-hit");
        });
      });
    }
    draw();
  }

  /* ---- お問い合わせ: 送信後は表示中のサイトの完了ページへ戻す(FormSubmit は絶対URLが必要) ---- */
  function contactForm() {
    var next = $('form input[name="_next"]');
    if (next) next.value = new URL("thanks.html", location.href).href;
  }

  /* ---- お知らせ・宅建ニュース(管理画面で編集した内容) ---- */
  async function news() {
    var homeLists = $$("[data-news]"), hero = $("[data-news-hero]"), allO = $("#news-all-oshirase"), allT = $("#news-all-takken");
    if (!homeLists.length && !hero && !allO && !allT) return;
    var d;
    try {
      var res = await fetch(CFG.SUPABASE_URL + "/storage/v1/object/public/kaiin/site/news.json?t=" + Date.now());
      if (!res.ok) return;
      d = await res.json();
    } catch (e) { return; }
    var href = function (el) { var a = el && $("a", el); return a ? a.getAttribute("href") : "news.html"; };
    homeLists.forEach(function (ul) {
      var kind = ul.getAttribute("data-news"), arr = d[kind], lim = +ul.getAttribute("data-limit") || 5, h = href(ul);
      if (!Array.isArray(arr) || !arr.length) return;
      ul.innerHTML = arr.slice(0, lim).map(function (n) {
        var tag = kind === "takken" ? '<span class="tag">宅建ニュース</span>' : n.chip ? '<span class="tag' + (n.color === "red" ? " hot" : "") + '">' + esc(n.chip) + "</span>" : "";
        return '<li><a href="' + esc(h) + '"><time>' + esc(n.date) + "</time>" + tag + '<span class="t">' + esc(n.title) + "</span></a></li>";
      }).join("");
    });
    if (hero && Array.isArray(d.oshirase) && d.oshirase[0]) hero.textContent = d.oshirase[0].date + "　" + d.oshirase[0].title;
    [[allO, d.oshirase], [allT, d.takken]].forEach(function (p) {
      if (!p[0] || !Array.isArray(p[1]) || !p[1].length) return;
      p[0].innerHTML = p[1].map(function (n) {
        return '<li><a href="#" onclick="return false;"><span class="date">' + esc(n.date) + "</span>" +
          (n.chip ? '<span class="chip ' + esc(n.color || "green") + '">' + esc(n.chip) + "</span>" : "") +
          '<span class="ttl">' + esc(n.title) + (n.body ? " — " + esc(n.body) : "") + "</span></a></li>";
      }).join("");
    });
  }

  /* ---- 会員名簿: エリアページの表と、各エリアの社数 ---- */
  function rowHtml(m) {
    var tel = esc(m.tel) + (m.fax ? '<br><span class="note">FAX ' + esc(m.fax) + "</span>" : "") + (m.email ? '<br><span class="note">' + esc(m.email) + "</span>" : "");
    var hours = esc(m.hours) + (m.holiday ? '<br><span class="note">定休: ' + esc(m.holiday) + "</span>" : "");
    return '<tr><td class="mt-name">' + esc(m.name) + "</td><td>" + esc(m.rep) + "</td><td>" + esc(m.address) + "</td><td>" + tel + "</td><td>" + hours + "</td><td>" + esc(m.business) + "</td></tr>";
  }
  async function members() {
    var table = $("table.member-table[data-area]"), counts = $$("[data-area-count]"), totals = $$("[data-member-total]");
    if (totals.length) {   // 本文の会員総数(「336社」など)
      SB.from("members").select("id", { count: "exact", head: true }).then(function (r) {
        if (!r.error && r.count) totals.forEach(function (el) { el.textContent = r.count; });
      });
    }
    if (!table && !counts.length) return;
    var q = SB.from("members").select(table ? "*" : "area").order("sort").order("id");
    if (table) q = q.eq("area", table.getAttribute("data-area"));
    var r = await q;
    if (r.error || !r.data || !r.data.length) return;   // 未投入・失敗時は HTML の表のまま
    if (table) {
      $("tbody", table).innerHTML = r.data.map(rowHtml).join("");
      document.dispatchEvent(new Event("members:updated"));
    }
    if (counts.length) {
      var n = {};
      r.data.forEach(function (m) { n[m.area] = (n[m.area] || 0) + 1; });
      counts.forEach(function (el) {
        var a = el.getAttribute("data-area-count");
        if (n[a] == null) return;
        el.textContent = n[a];
        var h = el.closest("[aria-label]");   // 分割された見出しは読み上げ用の文言も合わせる
        if (h) h.setAttribute("aria-label", h.textContent);
      });
    }
  }

  /* ====================================================================
     事務局の管理画面
     ==================================================================== */
  function admin() {
    var root = $("#adm");
    if (!root) return;
    var el = function (id) { return document.getElementById(id); };
    var opts = function (list) { return list.map(function (x) { return '<option value="' + x[0] + '">' + esc(x[1]) + "</option>"; }).join(""); };
    function status(id, msg, bad) { var p = el(id); p.textContent = msg; p.classList.toggle("bad", !!bad); }
    async function session() { try { return (await SB.auth.getSession()).data.session; } catch (e) { return null; } }
    // 操作の直前にログインが切れていないか確かめる(切れていると権限エラーになり、原因が分かりにくい)
    async function alive(id) {
      if (await session()) return true;
      status(id, "ログインの有効期限が切れました。ページを再読み込みして、もう一度ログインしてください。", true);
      return false;
    }

    el("f-room").innerHTML = opts(ROOMS);
    el("q-room").innerHTML = opts(ROOMS.filter(function (r) { return FORM_ROOMS.indexOf(r[0]) !== -1; }));
    el("e-room").innerHTML = opts(Object.keys(CAL_ROOMS).map(function (k) { return [k, CAL_ROOMS[k]]; }));
    el("m-area").innerHTML = opts(AREAS);
    el("mf-area").innerHTML = opts(AREAS);
    el("n-date").value = dot(new Date());

    async function refresh() {
      var s = await session();
      el("adm-login").hidden = !!s;
      el("adm-main").hidden = !s;
      if (s) {
        el("adm-user").textContent = "ログイン中";
        loadFiles(); loadForms(); loadEvents(); loadMembers(); loadNews();
        window.dispatchEvent(new Event("resize"));
      }
    }
    el("adm-login-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      status("adm-login-err", "");
      var r = await SB.auth.signInWithPassword({ email: el("adm-email").value.trim(), password: el("adm-pass").value });
      if (r.error) { status("adm-login-err", "ログインできませんでした。メールアドレスとパスワードをご確認ください。", true); return; }
      el("adm-pass").value = "";
      refresh();
    });
    el("adm-logout").addEventListener("click", async function () { await SB.auth.signOut(); refresh(); });

    // ---- 01 資料 ----
    async function loadFiles() {
      var room = el("f-room").value, ul = el("f-list");
      ul.innerHTML = '<li class="note">読み込み中…</li>';
      var r = await SB.storage.from("kaiin").list(room, { limit: 200, sortBy: { column: "updated_at", order: "desc" } });
      if (r.error) { ul.innerHTML = '<li class="note bad">読み込めませんでした: ' + esc(r.error.message) + "</li>"; return; }
      var files = (r.data || []).filter(function (x) { return x.name && x.name.charAt(0) !== "." && x.id; });
      if (!files.length) { ul.innerHTML = '<li class="note">このフォルダに資料はありません。</li>'; return; }
      ul.innerHTML = files.map(function (x) {
        var name = fromKey(x.name);
        var url = SB.storage.from("kaiin").getPublicUrl(room + "/" + x.name, { download: name }).data.publicUrl;
        return '<li><span class="f-type">' + extType(name) + "</span><div>" + esc(name) + '<span class="f-meta">' + dot(new Date(x.updated_at || x.created_at)) +
          (x.metadata ? "　" + fmtSize(x.metadata.size) : "") + '</span></div><a class="dl" href="' + esc(url) + '" target="_blank" rel="noopener">確認</a>' +
          '<button class="dl del" type="button" data-key="' + esc(x.name) + '">削除</button></li>';
      }).join("");
      $$("[data-key]", ul).forEach(function (b) {
        b.addEventListener("click", async function () {
          var key = b.getAttribute("data-key"), name = fromKey(key);
          if (!confirm("「" + name + "」を削除します。元に戻せません。よろしいですか?")) return;
          if (!(await alive("f-status"))) return;
          status("f-status", "削除中: " + name);
          var r2 = await SB.storage.from("kaiin").remove([room + "/" + key]);
          status("f-status", r2.error ? "削除できませんでした: " + r2.error.message : "削除しました: " + name, !!r2.error);
          loadFiles();
        });
      });
    }
    el("f-room").addEventListener("change", loadFiles);
    el("f-up").addEventListener("click", async function () {
      var files = el("f-input").files, room = el("f-room").value;
      if (!files.length) { status("f-status", "ファイルを選んでください。", true); return; }
      if (!(await alive("f-status"))) return;
      el("f-up").disabled = true;
      var ok = 0, ng = 0, last = "";
      for (var i = 0; i < files.length; i++) {
        status("f-status", "アップロード中: " + files[i].name + "(" + (i + 1) + "/" + files.length + ")");
        var r = await SB.storage.from("kaiin").upload(room + "/" + toKey(files[i].name), files[i], { upsert: true });
        if (r.error) { ng++; last = r.error.message; } else ok++;
      }
      status("f-status", "完了: " + ok + "件" + (ng ? " / 失敗 " + ng + "件(" + last + ")" : ""), ng > 0);
      el("f-up").disabled = false;
      el("f-input").value = "";
      loadFiles();
    });

    // ---- 02 フォーム(出欠・アンケート) ----
    async function loadForms() {
      var ul = el("q-list");
      var r = await SB.from("room_links").select("*").order("created_at", { ascending: false });
      if (r.error) { ul.innerHTML = '<li class="note bad">読み込めませんでした: ' + esc(r.error.message) + "</li>"; return; }
      if (!r.data.length) { ul.innerHTML = '<li class="note">作成済みのフォームはありません。</li>'; return; }
      ul.innerHTML = r.data.map(function (l) {
        return '<li><span class="f-type">FORM</span><div>' + esc(l.title) + '<span class="f-meta">' + esc(roomName(l.room)) +
          (l.event_date ? "　開催 " + dot(fromIso(l.event_date)) : "") + "　作成 " + dot(new Date(l.created_at)) + "</span></div>" +
          '<a class="dl" href="' + esc(l.form_url) + '" target="_blank" rel="noopener">フォーム</a>' +
          (l.sheet_url ? '<a class="dl" href="' + esc(l.sheet_url) + '" target="_blank" rel="noopener">集計</a>' : "") +
          '<button class="dl" type="button" data-copy="' + esc(l.form_url) + '">リンクをコピー</button>' +
          '<button class="dl del" type="button" data-link="' + l.id + '">掲載をやめる</button></li>';
      }).join("");
      $$("[data-copy]", ul).forEach(function (b) { b.addEventListener("click", function () { copyText(b, b.getAttribute("data-copy")); }); });
      $$("[data-link]", ul).forEach(function (b) {
        b.addEventListener("click", async function () {
          if (!confirm("このフォームを会員ページから外します(フォーム本体と集計シートは Google ドライブに残ります)。よろしいですか?")) return;
          if (!(await alive("q-status"))) return;
          var r2 = await SB.from("room_links").delete().eq("id", b.getAttribute("data-link"));
          status("q-status", r2.error ? "外せませんでした: " + r2.error.message : "会員ページから外しました。", !!r2.error);
          loadForms();
        });
      });
    }
    el("q-room").addEventListener("change", function () { el("q-date-row").hidden = el("q-room").value === "chosa"; });
    el("q-btn").addEventListener("click", async function () {
      var room = el("q-room").value, title = el("q-title").value.trim(), date = el("q-room").value === "chosa" ? "" : el("q-date").value;
      if (!title) { status("q-status", "タイトルを入力してください。", true); el("q-title").focus(); return; }
      if (!CFG.GAS_FORM_URL) { status("q-status", "フォーム作成の接続設定(GAS)がありません。", true); return; }
      if (!(await alive("q-status"))) return;
      var btn = el("q-btn");
      btn.disabled = true;
      status("q-status", "作成中です。20秒ほどかかることがあります…");
      el("q-result").innerHTML = "";
      try {
        var res = await fetch(CFG.GAS_FORM_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ secret: CFG.GAS_SECRET, title: title, room: room, kind: room === "chosa" ? "survey" : "attendance" }),
        });
        var data = await res.json();
        if (!data.ok) throw new Error(data.error || "不明なエラー");
        var row = { room: room, title: title, form_url: data.formUrl, sheet_url: data.sheetUrl };
        if (date) row.event_date = date;
        var ins = await SB.from("room_links").insert(row);
        status("q-status", ins.error ? "フォームは作成できましたが、会員ページへの掲載に失敗しました: " + ins.error.message
          : "作成して「" + roomName(room) + "」に掲載しました。" + (date ? "カレンダーにも載っています。" : ""), !!ins.error);
        el("q-result").innerHTML = '<li><span class="f-type">FORM</span><div>回答フォーム(会員に配る)</div><a class="dl" href="' + esc(data.formUrl) + '" target="_blank" rel="noopener">開く</a><button class="dl" type="button" data-copy="' + esc(data.formUrl) + '">リンクをコピー</button></li>' +
          '<li><span class="f-type">SHEET</span><div>集計スプレッドシート</div><a class="dl" href="' + esc(data.sheetUrl) + '" target="_blank" rel="noopener">開く</a></li>' +
          (data.formEditUrl ? '<li><span class="f-type">EDIT</span><div>質問を変える(フォームの編集)</div><a class="dl" href="' + esc(data.formEditUrl) + '" target="_blank" rel="noopener">開く</a></li>' : "") +
          (data.folderUrl ? '<li><span class="f-type">DRIVE</span><div>保存先フォルダ「' + esc(data.folderName || "") + '」</div><a class="dl" href="' + esc(data.folderUrl) + '" target="_blank" rel="noopener">開く</a></li>' : "");
        $$("[data-copy]", el("q-result")).forEach(function (b) { b.addEventListener("click", function () { copyText(b, b.getAttribute("data-copy")); }); });
        el("q-title").value = ""; el("q-date").value = "";
        loadForms();
      } catch (err) {
        status("q-status", "作成できませんでした: " + err.message, true);
      }
      btn.disabled = false;
    });

    // ---- 03 行事・研修会の予定(カレンダー) ----
    async function loadEvents() {
      var ul = el("e-list");
      var from = new Date(); from.setMonth(from.getMonth() - 1);
      var r = await SB.from("events").select("*").gte("event_date", iso(from)).order("event_date").order("start_time");
      if (r.error) { ul.innerHTML = '<li class="note bad">読み込めませんでした: ' + esc(r.error.message) + "</li>"; return; }
      if (!r.data.length) { ul.innerHTML = '<li class="note">登録済みの予定はありません。</li>'; return; }
      ul.innerHTML = r.data.map(function (e) {
        var d = fromIso(e.event_date);
        return '<li><span class="f-type">' + (d.getMonth() + 1) + "/" + d.getDate() + "</span><div>" + esc(e.title) + '<span class="f-meta">' + esc(CAL_ROOMS[e.room] || e.room) + "　" +
          dot(d) + "(" + WD[d.getDay()] + ")" + (e.start_time ? " " + esc(e.start_time) : "") + (e.place ? "　" + esc(e.place) : "") + "</span></div>" +
          '<button class="dl del" type="button" data-ev="' + e.id + '">削除</button></li>';
      }).join("");
      $$("[data-ev]", ul).forEach(function (b) {
        b.addEventListener("click", async function () {
          if (!confirm("この予定を削除します。よろしいですか?")) return;
          if (!(await alive("e-status"))) return;
          var r2 = await SB.from("events").delete().eq("id", b.getAttribute("data-ev"));
          status("e-status", r2.error ? "削除できませんでした: " + r2.error.message : "削除しました。", !!r2.error);
          loadEvents();
        });
      });
    }
    el("e-btn").addEventListener("click", async function () {
      var row = { room: el("e-room").value, event_date: el("e-date").value, start_time: el("e-time").value.trim(),
        title: el("e-title").value.trim(), place: el("e-place").value.trim(), note: el("e-note").value.trim() };
      if (!row.event_date || !row.title) { status("e-status", "日付と名称を入力してください。", true); return; }
      if (!(await alive("e-status"))) return;
      var r = await SB.from("events").insert(row);
      status("e-status", r.error ? "登録できませんでした: " + r.error.message : "「" + row.title + "」を登録しました。カレンダーに表示されます。", !!r.error);
      if (!r.error) { ["e-date", "e-time", "e-title", "e-place", "e-note"].forEach(function (id) { el(id).value = ""; }); loadEvents(); }
    });

    // ---- 04 会員名簿 ----
    var MF = ["name", "rep", "address", "tel", "fax", "email", "hours", "holiday", "business", "sort"];
    var rows = [];
    async function loadMembers() {
      var area = el("m-area").value, tb = el("m-list");
      tb.innerHTML = '<tr><td colspan="3" class="note">読み込み中…</td></tr>';
      var r = await SB.from("members").select("*").eq("area", area).order("sort").order("id");
      if (r.error) { tb.innerHTML = '<tr><td colspan="3" class="note bad">読み込めませんでした: ' + esc(r.error.message) + "</td></tr>"; return; }
      rows = r.data;
      drawMembers();
    }
    function drawMembers() {
      var q = el("m-q").value.replace(/\s+/g, "").toLowerCase(), tb = el("m-list"), shown = 0;
      tb.innerHTML = rows.map(function (m, i) {
        var hit = !q || (m.name + m.rep + m.address + m.tel).replace(/\s+/g, "").toLowerCase().indexOf(q) !== -1;
        if (!hit) return "";
        shown++;
        return "<tr><td><b>" + esc(m.name) + "</b><span class=\"f-meta\">" + esc(m.rep) + "</span></td><td>" + esc(m.address) + '<span class="f-meta">' + esc(m.tel) + "</span></td>" +
          '<td><button class="dl" type="button" data-m="' + i + '">編集</button></td></tr>';
      }).join("") || '<tr><td colspan="3" class="note">該当する会社はありません。</td></tr>';
      el("m-count").textContent = shown + " / " + rows.length + " 社";
      $$("[data-m]", tb).forEach(function (b) { b.addEventListener("click", function () { editMember(rows[+b.getAttribute("data-m")]); }); });
    }
    function editMember(m) {
      var isNew = !m;
      if (isNew) {
        var max = rows.reduce(function (a, x) { return Math.max(a, x.sort || 0); }, 0);
        m = { area: el("m-area").value, sort: max + 10 };
      }
      el("mf-title").textContent = isNew ? "会社を追加" : "「" + m.name + "」を編集";
      el("mf-area").value = m.area;
      MF.forEach(function (k) { el("mf-" + k).value = m[k] == null ? "" : m[k]; });
      el("mf-del").hidden = isNew;
      el("m-form").hidden = false;
      el("m-form").setAttribute("data-id", isNew ? "" : m.id);
      status("m-status", "");
      el("m-form").scrollIntoView({ behavior: "smooth", block: "start" });
      el("mf-name").focus({ preventScroll: true });
    }
    el("m-area").addEventListener("change", function () { el("m-form").hidden = true; loadMembers(); });
    el("m-q").addEventListener("input", drawMembers);
    el("m-new").addEventListener("click", function () { editMember(null); });
    el("mf-cancel").addEventListener("click", function () { el("m-form").hidden = true; });
    el("m-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      var id = el("m-form").getAttribute("data-id"), row = { area: el("mf-area").value, updated_at: new Date().toISOString() };
      MF.forEach(function (k) { row[k] = el("mf-" + k).value.trim(); });
      row.sort = parseInt(row.sort, 10) || 0;
      if (!row.name) { status("m-status", "商号又は名称を入力してください。", true); return; }
      if (!(await alive("m-status"))) return;
      var r = id ? await SB.from("members").update(row).eq("id", id) : await SB.from("members").insert(row);
      if (r.error) { status("m-status", "保存できませんでした: " + r.error.message, true); return; }
      el("m-form").hidden = true;
      status("m-saved", "「" + row.name + "」を保存しました。エリアページにすぐ反映されます。");
      if (row.area !== el("m-area").value) el("m-area").value = row.area;
      loadMembers();
    });
    el("mf-del").addEventListener("click", async function () {
      var id = el("m-form").getAttribute("data-id"), name = el("mf-name").value;
      if (!id || !confirm("「" + name + "」を名簿から削除します(脱退など)。元に戻せません。よろしいですか?")) return;
      if (!(await alive("m-status"))) return;
      var r = await SB.from("members").delete().eq("id", id);
      if (r.error) { status("m-status", "削除できませんでした: " + r.error.message, true); return; }
      el("m-form").hidden = true;
      status("m-saved", "「" + name + "」を名簿から削除しました。");
      loadMembers();
    });

    // ---- 05 お知らせ・宅建ニュース(site/news.json を書き換える) ----
    var NEWS = "site/news.json", newsData = null;
    async function loadNews() {
      newsData = null;
      el("n-add").disabled = true;
      try {
        var res = await fetch(CFG.SUPABASE_URL + "/storage/v1/object/public/kaiin/" + NEWS + "?t=" + Date.now());
        if (res.ok) { var d = await res.json(); newsData = { oshirase: d.oshirase || [], takken: d.takken || [] }; }
        else if (res.status === 400 || res.status === 404) newsData = { oshirase: [], takken: [] };   // まだ一度も保存していない
      } catch (e) {}
      if (!newsData) { status("n-status", "記事を読み込めませんでした。上書きを防ぐため、追加・削除を止めています。ページを再読み込みしてください。", true); return; }
      el("n-add").disabled = false;
      drawNews();
    }
    function drawNews() {
      ["oshirase", "takken"].forEach(function (kind) {
        var ul = el("n-list-" + kind), arr = newsData[kind];
        ul.innerHTML = arr.length ? arr.map(function (n, i) {
          return '<li><span class="f-type">' + esc(n.date) + "</span><div>" + (n.chip ? "【" + esc(n.chip) + "】" : "") + esc(n.title) +
            (n.body ? '<span class="f-meta">' + esc(n.body) + "</span>" : "") + '</div><button class="dl del" type="button" data-n="' + kind + ":" + i + '">削除</button></li>';
        }).join("") : '<li class="note">記事はありません。</li>';
      });
      $$("[data-n]", root).forEach(function (b) {
        b.addEventListener("click", async function () {
          var p = b.getAttribute("data-n").split(":"), n = newsData[p[0]][+p[1]];
          if (!confirm("「" + n.title + "」を削除します。よろしいですか?")) return;
          newsData[p[0]].splice(+p[1], 1);
          await saveNews("削除しました。");
        });
      });
    }
    async function saveNews(msg) {
      if (!(await alive("n-status"))) return;
      status("n-status", "保存中…");
      var blob = new Blob([JSON.stringify(newsData)], { type: "application/json" });
      var r = await SB.storage.from("kaiin").upload(NEWS, blob, { upsert: true, cacheControl: "0", contentType: "application/json" });
      status("n-status", r.error ? "保存できませんでした: " + r.error.message : msg + "サイトに反映済みです。", !!r.error);
      drawNews();
    }
    el("n-kind").addEventListener("change", function () { el("n-cat-row").hidden = el("n-kind").value !== "oshirase"; });
    el("n-add").addEventListener("click", async function () {
      var kind = el("n-kind").value, title = el("n-title").value.trim();
      if (!title) { status("n-status", "タイトルを入力してください。", true); return; }
      var entry = { date: el("n-date").value.trim() || dot(new Date()), title: title };
      var body = el("n-body").value.trim();
      if (body) entry.body = body;
      if (kind === "oshirase" && el("n-cat").value) { var c = el("n-cat").value.split("|"); entry.chip = c[0]; entry.color = c[1]; }
      newsData[kind].unshift(entry);
      await saveNews("追加しました。");
      el("n-title").value = ""; el("n-body").value = "";
    });

    refresh();
  }
})();
