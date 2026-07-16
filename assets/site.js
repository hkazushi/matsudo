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
      setupReveal(content); // 解錠後のコンテンツにも演出を適用
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

  document.querySelectorAll(".folder[data-pass]").forEach((folder) => {
    const key = "room_" + folder.dataset.room;
    if (sessionStorage.getItem(key) === "ok") folder.classList.add("unlocked");

    folder.addEventListener("click", () => {
      const contentTpl = document.getElementById("room-" + folder.dataset.room);
      if (sessionStorage.getItem(key) === "ok") {
        openModal(contentTpl.innerHTML);
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
          openModal(contentTpl.innerHTML);
        } else {
          form.querySelector(".err").style.display = "block";
          input.value = "";
          input.focus();
        }
      });
    });
  });

  // ---- 開催案内の発行(Googleフォーム生成モック) ----
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
