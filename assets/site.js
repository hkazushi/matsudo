/* 宅建協会 松戸支部 新HPモック 共通スクリプト v2
   - エリア(ページ)単位のロック解除: data-gate 属性
   - フォルダ(部屋)単位のロック解除: .folder[data-pass]
   - スクロール連動リビール / カウントアップ / ヘッダー影 / ページトップ
   パスワードはすべてモック用の仮設定。本実装では Supabase 側で検証する想定。 */

(function () {
  // ---- ページ全体ゲート ----
  const gate = document.querySelector("[data-gate]");
  if (gate) {
    const key = "gate_" + gate.dataset.gate;
    const pass = gate.dataset.pass;
    const content = document.getElementById("gated-content");
    const lockbox = gate.querySelector(".lockscreen");
    const form = gate.querySelector("form");
    const input = gate.querySelector("input");
    const err = gate.querySelector(".err");

    const unlock = () => {
      gate.style.display = "none";
      content.style.display = "block";
      // 解錠後のコンテンツにも演出を適用。
      // 初期化中(sessionStorage解錠済みで即時呼び出し)に走ると
      // 後方で定義される Observer がまだ生成されておらず例外になるため、
      // スクリプト全体の初期化完了後に実行する。
      setTimeout(() => {
        try { setupReveal(content); } catch (e) {}
      }, 0);
    };
    if (sessionStorage.getItem(key) === "ok") unlock();

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (input.value === pass) {
        sessionStorage.setItem(key, "ok");
        unlock();
      } else {
        err.style.display = "block";
        lockbox.classList.remove("shake");
        void lockbox.offsetWidth; // reflowでアニメ再発火
        lockbox.classList.add("shake");
        input.value = "";
        input.focus();
      }
    });
  }

  // ---- フォルダ(部屋)ゲート ----
  const modalBg = document.getElementById("modal-bg");
  const modalBody = document.getElementById("modal-body");

  function openModal(html) {
    modalBody.innerHTML = html;
    modalBg.classList.add("open");
  }
  function closeModal() {
    modalBg.classList.remove("open");
  }
  if (modalBg) {
    modalBg.addEventListener("click", (e) => {
      if (e.target === modalBg || e.target.classList.contains("close")) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  document.querySelectorAll(".folder[data-room]").forEach((folder) => {
    const key = "room_" + folder.dataset.room;
    const pass = folder.dataset.pass; // 未設定なら鍵なし(そのまま開く)
    if (!pass || sessionStorage.getItem(key) === "ok") folder.classList.add("unlocked");

    folder.addEventListener("click", () => {
      const contentTpl = document.getElementById("room-" + folder.dataset.room);
      if (!pass || sessionStorage.getItem(key) === "ok") {
        showRoom(folder, contentTpl);
        return;
      }
      // 部屋ごとの鍵入力
      openModal(`
        <h3>🔒 ${folder.querySelector("h3").textContent}</h3>
        <p class="modal-sub">このフォルダは個別パスワードで保護されています。</p>
        <form id="room-form">
          <input type="password" placeholder="フォルダのパスワード" autofocus
                 style="width:100%;padding:12px 16px;border:1.5px solid #e2e2d8;border-radius:10px;font-size:15px;text-align:center;letter-spacing:.1em;margin-bottom:12px;">
          <p class="err" style="color:#b5342c;font-size:12.5px;display:none;margin-bottom:8px;">パスワードが違います</p>
          <button class="btn btn-green" type="submit" style="width:100%;">開く</button>
          <p style="font-size:11.5px;color:#b0a170;margin-top:12px;text-align:center;">モック用パスワード: ${folder.dataset.pass}</p>
        </form>
      `);
      const form = document.getElementById("room-form");
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = form.querySelector("input");
        if (input.value === folder.dataset.pass) {
          sessionStorage.setItem(key, "ok");
          folder.classList.add("unlocked");
          showRoom(folder, contentTpl);
        } else {
          form.querySelector(".err").style.display = "block";
          input.value = "";
          input.focus();
        }
      });
    });
  });

  // ============================================================
  // Supabase / Googleフォーム連携(本実装)
  // assets/config.js に接続情報が設定されている場合のみ有効。
  // 未設定時は従来のサンプル表示(template)にフォールバックする。
  // ============================================================
  const CFG = window.SITE_CONFIG || {};
  const SB = (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase)
    ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY)
    : null;

  function showRoom(folder, tpl) {
    if (SB) { renderRoomLive(folder); } else { openModal(tpl.innerHTML); }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function fmtSize(b) {
    if (b == null) return "";
    if (b < 1024) return b + " B";
    if (b < 1048576) return Math.round(b / 1024) + " KB";
    return (b / 1048576).toFixed(1) + " MB";
  }
  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
  }
  function extType(name) {
    const e = (name.split(".").pop() || "").toLowerCase();
    if (e === "pdf") return ["pdf", "PDF"];
    if (["xlsx", "xls", "csv"].includes(e)) return ["xlsx", "XLSX"];
    if (["doc", "docx"].includes(e)) return ["link", "DOC"];
    return ["link", (e || "FILE").toUpperCase().slice(0, 5)];
  }

  // クリップボードへのリンクコピー
  window.copyLink = function (btn, url) {
    navigator.clipboard.writeText(url).then(() => {
      const orig = btn.textContent;
      btn.textContent = "✓ コピーしました";
      setTimeout(() => { btn.textContent = orig; }, 1600);
    }).catch(() => { prompt("このURLをコピーしてください", url); });
  };

  let currentFolder = null; // 再描画用

  async function renderRoomLive(folder) {
    currentFolder = folder;
    const room = folder.dataset.room;
    const title = folder.querySelector("h3").textContent;
    // フォーム発行: 幹事・委員会の全部屋+一般の「研修会・勉強会」
    const canIssue = /kanji\.html/.test(location.pathname) || room === "kenshu";
    openModal(`<h3>${esc(title)}</h3><p class="modal-sub">読み込み中…</p>`);

    let files = [], links = [], session = null;
    try {
      const r = await SB.storage.from("kaiin").list(room, { limit: 100, sortBy: { column: "updated_at", order: "desc" } });
      files = (r.data || []).filter((f) => f.name && !f.name.startsWith("."));
    } catch (e) {}
    try {
      const r = await SB.from("room_links").select("*").eq("room", room).order("created_at", { ascending: false });
      links = r.data || [];
    } catch (e) {}
    try { session = (await SB.auth.getSession()).data.session; } catch (e) {}

    const showEvent = canIssue || links.length > 0;

    // --- 資料(ダウンロード)タブ ---
    let dlPane;
    if (files.length) {
      dlPane = '<ul class="file-list">' + files.map((f) => {
        const t = extType(f.name);
        const url = SB.storage.from("kaiin").getPublicUrl(room + "/" + f.name).data.publicUrl;
        const size = f.metadata ? f.metadata.size : null;
        return `<li><span class="f-type ${t[0]}">${t[1]}</span>${esc(f.name)}<span class="f-meta">${fmtDate(f.updated_at)} ${fmtSize(size)}</span><a class="dl" href="${esc(url)}" target="_blank" rel="noopener">DL</a></li>`;
      }).join("") + "</ul>";
    } else {
      dlPane = '<p class="note">掲載中の資料はまだありません。</p>';
    }

    // --- アップロードタブ ---
    let upPane;
    if (session) {
      upPane = `
        <p class="note" style="margin-bottom:10px;">ログイン中: ${esc(session.user.email)} / このフォルダに追加されます(同名は上書き)。</p>
        <input id="room-up-input" type="file" multiple style="font-size:14px;margin-bottom:10px;">
        <button id="room-up-btn" class="btn btn-green" style="width:100%;">⬆️ アップロード</button>
        <p id="room-up-status" style="font-size:13px;color:var(--green-dark);margin-top:8px;"></p>`;
    } else {
      upPane = `
        <p class="note" style="margin-bottom:14px;">資料の追加・削除は事務局アカウントでのログインが必要です。</p>
        <a class="btn btn-green" href="upload.html" style="width:100%;text-align:center;">事務局ログイン(管理ページ)へ</a>`;
    }

    // --- 勉強会・イベントタブ ---
    let evPane = "";
    if (links.length) {
      evPane += '<ul class="file-list">' + links.map((l) =>
        `<li><span class="f-type link">FORM</span>${esc(l.title)}<span class="f-meta">${fmtDate(l.created_at)}</span>` +
        `<a class="dl" href="${esc(l.form_url)}" target="_blank" rel="noopener">回答</a>` +
        (l.sheet_url ? ` <a class="dl" href="${esc(l.sheet_url)}" target="_blank" rel="noopener">集計</a>` : "") +
        ` <a class="dl" href="#" onclick="copyLink(this,'${esc(l.form_url)}');return false;">リンクをコピー</a></li>`
      ).join("") + "</ul>";
    } else {
      evPane += '<p class="note">発行済みのフォームはまだありません。</p>';
    }
    if (canIssue) {
      if (CFG.GAS_FORM_URL) {
        evPane += `<div style="margin-top:16px;border-top:1px solid #e7e6dc;padding-top:14px;">
          <p style="font-weight:800;font-size:14px;color:var(--green-dark);margin-bottom:8px;">開催案内の発行</p>
          <input id="issue-title" type="text" placeholder="例)${esc(title)} 8月定例会" style="width:100%;padding:11px 14px;border:1.5px solid #e7e6dc;border-radius:10px;font-size:14px;margin-bottom:10px;">
          <button id="issue-btn" class="btn btn-green" style="width:100%;" onclick="issueLive('${room}')">📮 Googleフォームを発行</button>
          <p style="font-size:11.5px;color:#63726a;margin-top:8px;">出欠回答フォームと集計スプレッドシートが自動作成され、この一覧に掲載されます。</p>
        </div>`;
      } else {
        evPane += '<p class="note" style="margin-top:12px;">※フォーム発行機能は接続設定後に有効になります。</p>';
      }
    }

    // --- タブUI組み立て ---
    let html = `<h3>${esc(title)}</h3>
      <div class="modal-tabs">
        <button class="mtab active" data-pane="pane-dl">📄 資料</button>
        <button class="mtab" data-pane="pane-up">⬆️ アップロード</button>
        ${showEvent ? '<button class="mtab" data-pane="pane-ev">📮 勉強会・イベント</button>' : ""}
      </div>
      <div class="mtab-pane" id="pane-dl">${dlPane}</div>
      <div class="mtab-pane" id="pane-up" hidden>${upPane}</div>
      ${showEvent ? `<div class="mtab-pane" id="pane-ev" hidden>${evPane}</div>` : ""}`;
    openModal(html);

    // タブ切り替え
    document.querySelectorAll("#modal-body .mtab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#modal-body .mtab").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll("#modal-body .mtab-pane").forEach((p) => (p.hidden = true));
        btn.classList.add("active");
        document.getElementById(btn.dataset.pane).hidden = false;
      });
    });

    // 部屋内アップロード(事務局ログイン時のみ)
    const upBtn = document.getElementById("room-up-btn");
    if (upBtn) {
      upBtn.addEventListener("click", async () => {
        const input = document.getElementById("room-up-input");
        const st = document.getElementById("room-up-status");
        if (!input.files.length) { st.textContent = "ファイルを選択してください"; return; }
        upBtn.disabled = true;
        let ok = 0, ng = 0;
        for (const f of input.files) {
          st.textContent = `アップロード中: ${f.name}`;
          const { error } = await SB.storage.from("kaiin").upload(room + "/" + f.name, f, { upsert: true });
          error ? ng++ : ok++;
        }
        st.textContent = `完了: 成功 ${ok}件` + (ng ? ` / 失敗 ${ng}件` : "");
        setTimeout(() => renderRoomLive(folder), 800);
      });
    }
  }

  window.issueLive = async function (room) {
    const input = document.getElementById("issue-title");
    const title = input ? input.value.trim() : "";
    if (!title) { if (input) input.focus(); return; }
    const btn = document.getElementById("issue-btn");
    if (btn) { btn.disabled = true; btn.textContent = "発行中…(20秒ほどかかる場合があります)"; }
    try {
      const res = await fetch(CFG.GAS_FORM_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ secret: CFG.GAS_SECRET, title }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "unknown");
      try { await SB.from("room_links").insert({ room, title, form_url: data.formUrl, sheet_url: data.sheetUrl }); } catch (e) {}
      openModal(`<h3>✅ 発行しました</h3><p class="modal-sub">「${esc(title)}」の出欠フォームと集計シートを作成しました。</p>
        <ul class="file-list">
          <li><span class="f-type link">FORM</span>出欠回答フォーム(会員配布用)<a class="dl" href="${esc(data.formUrl)}" target="_blank" rel="noopener">開く</a> <a class="dl" href="#" onclick="copyLink(this,'${esc(data.formUrl)}');return false;">リンクをコピー</a></li>
          <li><span class="f-type xlsx">SHEET</span>出欠集計スプレッドシート<a class="dl" href="${esc(data.sheetUrl)}" target="_blank" rel="noopener">開く</a></li>
          <li><span class="f-type link">EDIT</span>フォーム編集(質問の変更)<a class="dl" href="${esc(data.formEditUrl)}" target="_blank" rel="noopener">開く</a></li>
        </ul>
        <div class="alert info" style="margin-top:16px;">リンクはこの部屋の「勉強会・イベント」タブにも自動掲載されました。「リンクをコピー」して会員のみなさまへ共有してください。</div>`);
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = "📮 Googleフォームを発行"; }
      alert("発行に失敗しました: " + err.message + "\nGASのデプロイ設定(アクセス: 全員)をご確認ください。");
    }
  };

  // ---- 現在サイトに表示中の初期記事(管理画面の初期データにもなる) ----
  window.DEFAULT_NEWS = {
    oshirase: [
      { date: "2026.06.01", chip: "重要", color: "red", title: "事務局臨時休業のお知らせ", body: "6月3日(水)は台風の為、臨時休業とさせていただきます。" },
      { date: "2026.05.26", chip: "事務局", color: "green", title: "事務局業務開始時間変更のお知らせ", body: "5月28日(火)は本部定時総会の為、事務局は15時より業務開始となります。" },
      { date: "2026.05.20", chip: "販売", color: "gold", title: "不動産日記(手帳)発売のお知らせ", body: "毎年恒例の(株)住宅新報発行の不動産日記を事務局にて発売しております。数に限りがございますので、お早めにご購入願います。" },
      { date: "2026.05.15", chip: "会員向け", color: "green", title: "令和7年度違反建築防止週間の実施について", body: "詳しくは「会員専用ページ」→「お知らせ」をご覧ください。" },
      { date: "2026.05.13", chip: "事務局", color: "gold", title: "(株)動産社商品 事務局取り扱い終了のお知らせ", body: "令和7年9月末日にて事務局での販売は終了となります。" },
      { date: "2026.05.12", chip: "講習", color: "green", title: "宅地建物取引士 法定講習会申込受付について", body: "法定講習会がWEBでも受講できるようになりました。" },
      { date: "2026.04.28", chip: "相談", color: "green", title: "不動産契約書及び重要事項説明書書式に係る無料電話相談の開始について", body: "全宅連にて無料電話相談を開始致しました。詳細は「会員専用ページ」をご覧ください。" },
      { date: "2026.04.20", chip: "講習", color: "green", title: "宅建取引士 法定講習会実施日程のご案内", body: "今後の実施日程を更新致しました。" },
    ],
    takken: [
      { date: "2026.06.01", title: "住宅ローン返済が安くなる?!「残クレ」車だけじゃない。「残価設定型住宅ローン」および住宅融資保険のメリット徹底解説【SUUMO】" },
      { date: "2026.05.01", title: "ハトマーク/宅建協会のPR及び入会促進のため、映画「正直不動産」とタイアップしたポスターを全国の会員へ配布中!!" },
      { date: "2026.04.03", title: "首都圏の新築マンション購入者の平均価格は7324万円で最高値更新【SUUMO】" },
    ],
  };

  // ---- お知らせ・宅建ニュースの動的読み込み(管理画面で編集した内容を表示) ----
  async function loadNews() {
    if (!CFG.SUPABASE_URL) return;
    const t = {
      homeO: document.getElementById("news-home-oshirase"),
      homeT: document.getElementById("news-home-takken"),
      allO: document.getElementById("news-all-oshirase"),
      allT: document.getElementById("news-all-takken"),
    };
    if (!t.homeO && !t.allO) return;
    try {
      const res = await fetch(CFG.SUPABASE_URL + "/storage/v1/object/public/kaiin/site/news.json?t=" + Date.now());
      if (!res.ok) return; // 未作成なら静的表示のまま
      const d = await res.json();
      const chip = (n) => n.chip ? `<span class="chip ${esc(n.color || "green")}">${esc(n.chip)}</span>` : "";
      const item = (n, withBody) =>
        `<li><a href="#" onclick="return false;"><span class="date">${esc(n.date)}</span>${chip(n)}${esc(n.title)}${withBody && n.body ? " — " + esc(n.body) : ""}</a></li>`;
      const homeItem = (n) =>
        `<li><a href="news.html"><span class="date">${esc(n.date)}</span>${chip(n)}${esc(n.title)}</a></li>`;
      if (Array.isArray(d.oshirase) && d.oshirase.length) {
        if (t.homeO) t.homeO.innerHTML = d.oshirase.slice(0, 5).map(homeItem).join("");
        if (t.allO) t.allO.innerHTML = d.oshirase.map((n) => item(n, true)).join("");
      }
      if (Array.isArray(d.takken) && d.takken.length) {
        if (t.homeT) t.homeT.innerHTML = d.takken.slice(0, 3).map(homeItem).join("");
        if (t.allT) t.allT.innerHTML = d.takken.map((n) => item(n, true)).join("");
      }
    } catch (e) {}
  }
  loadNews();

  // ---- 開催案内の発行(Googleフォーム生成モック/未接続時のみ) ----
  window.issueForm = function (title) {
    openModal(`
      <h3>✅ Googleフォームを発行しました(モック)</h3>
      <p class="modal-sub">本実装では、ここで Google フォームが自動生成され、集計用スプレッドシートが紐付きます。</p>
      <ul class="file-list">
        <li><span class="f-type link">FORM</span>${title} 出欠回答フォーム<a class="dl" href="#" onclick="return false;">リンクをコピー</a></li>
        <li><span class="f-type xlsx">SHEET</span>${title} 集計スプレッドシート<a class="dl" href="#" onclick="return false;">開く</a></li>
      </ul>
      <div class="alert info" style="margin-top:18px;">発行したリンクは、このフォルダのページに自動で掲載されます。集計はスプレッドシートに任せる構成です。</div>
    `);
  };

  // ---- 動画プレースホルダ ----
  document.querySelectorAll(".video-ph").forEach((v) => {
    v.addEventListener("click", () => {
      openModal(`
        <h3>🎬 支部長ご挨拶動画</h3>
        <p class="modal-sub">動画素材は松戸支部様にてご用意いただく想定です(契約書 第6条2項)。受領後にこちらへ埋め込みます。</p>
        <div style="aspect-ratio:16/9;background:#0e3d23;border-radius:10px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.7);font-size:14px;">動画プレースホルダ</div>
      `);
    });
  });

  // ---- スクロール連動リビール ----
  const REVEAL_TARGETS =
    ".card, .area-card, .folder, .entrance, .content-block, .news-panel, .section-head, .greeting > *, .stat, .gate-entrances > *";

  // threshold は 0 にする(高さのある要素は 0.12 に永遠に達しないため)
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    },
    { threshold: 0, rootMargin: "0px 0px -60px 0px" }
  );

  function setupReveal(root) {
    const els = root.querySelectorAll(REVEAL_TARGETS);
    // 同じ親の中では順番に遅延をかける(ステガー)
    const groups = new Map();
    els.forEach((el) => {
      if (el.classList.contains("reveal")) return;
      const p = el.parentElement;
      const idx = groups.get(p) || 0;
      groups.set(p, idx + 1);
      el.style.setProperty("--d", Math.min(idx * 0.09, 0.45) + "s");
      el.classList.add("reveal");
      io.observe(el);
    });
  }
  setupReveal(document);

  // セーフティネット: 万一 Observer が発火しない/タブ非表示等の場合も3秒後に必ず表示する
  setTimeout(() => {
    document.querySelectorAll(".reveal:not(.in)").forEach((el) => {
      el.style.transition = "none";
      el.classList.add("in");
    });
  }, 3000);

  // ---- カウントアップ ----
  const counterIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        counterIO.unobserve(en.target);
        const el = en.target;
        const target = parseInt(el.dataset.count, 10);
        const dur = 1400;
        const t0 = performance.now();
        const tick = (t) => {
          const p = Math.min((t - t0) / dur, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(target * eased).toLocaleString();
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    },
    { threshold: 0.5 }
  );
  document.querySelectorAll("[data-count]").forEach((el) => counterIO.observe(el));

  // ---- ヘッダー影 & ページトップボタン ----
  const header = document.querySelector(".header");
  let toTop = document.querySelector(".to-top");
  if (!toTop) {
    toTop = document.createElement("button");
    toTop.className = "to-top";
    toTop.innerHTML = "↑";
    toTop.setAttribute("aria-label", "ページ最上部へ");
    toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    document.body.appendChild(toTop);
  }
  const onScroll = () => {
    if (header) header.classList.toggle("scrolled", window.scrollY > 10);
    toTop.classList.toggle("show", window.scrollY > 500);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();
