/* ==========================================================================
   デザイン案C — 共通スクリプト
   ・ページ遷移の幕 / ヘッダー / 全画面メニュー / スクロールで現れる演出
   ・トップの写真スライド、お知らせタブ
   ・下層の目次の追従、会員一覧の絞り込み、会員エリアのフォルダ表示
   ・PCのカーソル演出、慣性スクロール(Lenis)と視差(GSAP)は読み込めたときだけ
   機能(ログイン・アップロード・送信)はデザイン案のため持たない。
   ========================================================================== */
(function () {
  "use strict";
  var d = document.documentElement;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var lenis = null;

  try { init(); } catch (err) {
    if (window.console) console.error(err);
    d.classList.remove("anim", "pt-in");   // 途中で失敗しても内容は必ず見せる
  }
  d.classList.add("ready");

  function init() {
    pageTransition();
    header();
    menu();
    reveal();
    splitTitle();
    fitText();
    heroSlides();
    tabs();
    toc();
    memberFilter();
    folders();
    demoForms();
    smoothAndParallax();
    cursor();
  }

  /* ---- ページ遷移: 幕を下ろしてから移動し、移動先で幕を上げる ---- */
  function pageTransition() {
    if (d.classList.contains("pt-in")) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { d.classList.add("pt-out"); });
      });
      setTimeout(function () { d.classList.remove("pt-in", "pt-out"); }, 1200);
    }
    window.addEventListener("pageshow", function (e) {
      if (e.persisted) d.classList.remove("pt-leave", "pt-in", "pt-out");  // 戻るボタン(bfcache)対策
    });
    if (reduce) return;
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a");
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.target === "_blank" || a.hasAttribute("download")) return;
      var href = a.getAttribute("href");
      if (!href || href.charAt(0) === "#" || /^(mailto|tel|javascript):/i.test(href)) return;
      var url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.hash) return;
      if (/\.(pdf|xlsx?|docx?|zip)$/i.test(url.pathname)) return;
      e.preventDefault();
      if (/\/sample2\//.test(url.pathname)) { try { sessionStorage.setItem("c-pt", "1"); } catch (er) {} }
      d.classList.add("pt-leave");
      setTimeout(function () { location.href = url.href; }, 620);
    });
  }

  /* ---- ヘッダー: スクロールで背景を付け、下スクロールで隠す ---- */
  function header() {
    var hd = $(".hd");
    if (!hd) return;
    var home = document.body.classList.contains("is-home");
    var lastY = window.scrollY;
    function onScroll() {
      var y = window.scrollY;
      var limit = home ? Math.max(window.innerHeight - 120, 200) : 10;
      hd.classList.toggle("is-solid", y > limit);
      if (y > lastY + 3 && y > 480 && !d.classList.contains("menu-open")) hd.classList.add("is-hidden");
      if (y < lastY - 3 || y < 480) hd.classList.remove("is-hidden");
      lastY = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---- 全画面メニュー ---- */
  function menu() {
    var btn = $(".hd-menu"), m = $("#menu");
    if (!btn || !m) return;
    function set(open) {
      d.classList.toggle("menu-open", open);
      btn.setAttribute("aria-expanded", String(open));
      m.setAttribute("aria-hidden", String(!open));
      if (lenis) { open ? lenis.stop() : lenis.start(); }
    }
    btn.addEventListener("click", function () { set(!d.classList.contains("menu-open")); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") set(false); });
    $$("a", m).forEach(function (a) { a.addEventListener("click", function () { set(false); }); });
  }

  /* ---- スクロールで現れる ---- */
  function reveal() {
    var els = $$("[data-rv]");
    if (!d.classList.contains("anim") || !("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---- 下層ページの英字見出しを1文字ずつ ---- */
  function splitTitle() {
    $$(".ph-en").forEach(function (el) {
      var text = el.textContent;
      el.setAttribute("aria-label", text);
      el.innerHTML = text.split("").map(function (c, i) {
        return '<span class="ch" aria-hidden="true" style="--i:' + i + '">' + (c === " " ? "&nbsp;" : c) + "</span>";
      }).join("");
    });
  }

  /* ---- 英字の大見出しを枠に収める(長い単語でも1行のまま縮める) ---- */
  function fitText() {
    var els = $$(".ph-en, .tile-en, .sec-en, .ft-word");
    if (!els.length) return;
    function run() {
      els.forEach(function (el) {
        el.style.fontSize = "";
        var room = el.clientWidth, need = el.scrollWidth;
        if (need > room && room > 0) {
          var fs = parseFloat(window.getComputedStyle(el).fontSize);
          el.style.fontSize = Math.floor(fs * room / need * 0.98) + "px";
        }
      });
    }
    run();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
    var t = null;
    window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(run, 120); });
  }

  /* ---- トップの写真スライド ---- */
  function heroSlides() {
    var slides = $$(".hs");
    if (slides.length < 2) return;
    var bars = $$(".hero-bars i"), capNo = $(".hero-cap .mono"), capTx = $(".hero-cap span:last-child");
    var cur = 0, dur = 6500, timer = null;
    function show(n) {
      var prev = slides[cur];
      slides.forEach(function (s) { s.classList.remove("is-prev"); });
      if (prev !== slides[n]) { prev.classList.remove("is-active"); prev.classList.add("is-prev"); }
      slides[n].classList.add("is-active");
      setTimeout(function () { prev.classList.remove("is-prev"); }, 1700);
      bars.forEach(function (b, i) {
        b.classList.remove("is-active", "is-done");
        if (i < n) b.classList.add("is-done");
      });
      if (bars[n]) { void bars[n].offsetWidth; bars[n].classList.add("is-active"); }
      if (capNo) capNo.textContent = String(n + 1).padStart(2, "0") + " / " + String(slides.length).padStart(2, "0");
      if (capTx) capTx.textContent = slides[n].getAttribute("data-cap") || "";
      cur = n;
    }
    d.style.setProperty("--dur", dur / 1000 + "s");
    show(0);
    if (reduce) return;
    timer = setInterval(function () { show((cur + 1) % slides.length); }, dur);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) clearInterval(timer);
      else { clearInterval(timer); timer = setInterval(function () { show((cur + 1) % slides.length); }, dur); }
    });
  }

  /* ---- お知らせのタブ ---- */
  function tabs() {
    $$("[data-tabs]").forEach(function (box) {
      var btns = $$(".tab", box), panes = $$(".tabpane", box);
      btns.forEach(function (b, i) {
        b.addEventListener("click", function () {
          btns.forEach(function (x, j) { x.classList.toggle("is-on", i === j); x.setAttribute("aria-selected", String(i === j)); });
          panes.forEach(function (p, j) { p.hidden = i !== j; });
        });
      });
    });
  }

  /* ---- 下層の目次: 読んでいる章に印を付ける ---- */
  function toc() {
    var links = $$(".pg-toc a");
    if (!links.length || !("IntersectionObserver" in window)) return;
    var map = {};
    links.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) { a.classList.remove("is-on"); });
        var a = map[en.target.id];
        if (a) a.classList.add("is-on");
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    $$(".blk[id]").forEach(function (b) { io.observe(b); });
  }

  /* ---- 会員一覧の絞り込み(表示上の機能のみ) ---- */
  function memberFilter() {
    var box = $(".mt-filter");
    if (!box) return;
    var input = $("input", box), out = $("output", box);
    var rows = $$(".member-table tbody tr");
    function norm(s) { return s.replace(/\s+/g, "").toLowerCase(); }
    function run() {
      var q = norm(input.value), n = 0;
      rows.forEach(function (r) {
        var hit = !q || norm(r.textContent).indexOf(q) !== -1;
        r.hidden = !hit;
        if (hit) n++;
      });
      out.textContent = n + " 社を表示中";
    }
    input.addEventListener("input", run);
    run();
  }

  /* ---- 会員エリア: フォルダを押すと中身(見本)を表示 ---- */
  function folders() {
    var cm = $(".cm");
    if (!cm) return;
    var body = $(".cm-body", cm), ttl = $(".cm-top h3", cm), last = null;
    function close() { cm.classList.remove("is-open"); if (lenis) lenis.start(); if (last) last.focus(); }
    $$(".folder[data-room]").forEach(function (f) {
      f.setAttribute("tabindex", "0");
      f.setAttribute("role", "button");
      function open() {
        var tpl = document.getElementById("room-" + f.getAttribute("data-room"));
        ttl.textContent = $("h3", f).textContent;
        body.innerHTML = tpl ? tpl.innerHTML : '<p class="note">掲載中の資料はありません。</p>';
        var h = $("h3", body); if (h && h.textContent.trim() === ttl.textContent.trim()) h.remove();
        last = f;
        cm.classList.add("is-open");
        if (lenis) lenis.stop();
        $(".cm-close", cm).focus();
      }
      f.addEventListener("click", open);
      f.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
    cm.addEventListener("click", function (e) { if (e.target === cm || e.target.closest(".cm-close")) close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && cm.classList.contains("is-open")) close(); });
  }

  /* ---- フォーム・管理画面は送信しない(デザイン案) ---- */
  function demoForms() {
    $$("form.demo, .adm form").forEach(function (f) {
      f.addEventListener("submit", function (e) { e.preventDefault(); });
    });
    $$(".adm button").forEach(function (b) { b.addEventListener("click", function (e) { e.preventDefault(); }); });
  }

  /* ---- 慣性スクロール・視差(ライブラリが読めたときだけ) ---- */
  function smoothAndParallax() {
    if (reduce || !d.classList.contains("anim")) return;
    if (window.Lenis) {
      lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true });
      var raf = function (t) { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
      // 同じページ内の目次リンクは固定ヘッダーの下で止める
      $$('a[href^="#"]').forEach(function (a) {
        a.addEventListener("click", function (e) {
          var t = $(a.getAttribute("href"));
          if (!t) return;
          e.preventDefault();
          lenis.scrollTo(t, { offset: -($(".hd").offsetHeight + 16), duration: 1.3 });
        });
      });
    }
    if (window.gsap && window.ScrollTrigger) {
      var gsap = window.gsap;
      gsap.registerPlugin(window.ScrollTrigger);
      if (lenis) lenis.on("scroll", window.ScrollTrigger.update);
      $$("[data-px]").forEach(function (wrap) {
        var img = $("img", wrap);
        if (!img) return;
        gsap.fromTo(img, { yPercent: -6 }, {
          yPercent: 6, ease: "none",
          scrollTrigger: { trigger: wrap, start: "top bottom", end: "bottom top", scrub: true }
        });
      });
      window.addEventListener("load", function () { window.ScrollTrigger.refresh(); });
    }
  }

  /* ---- PCのカーソル演出 ---- */
  function cursor() {
    var c = $(".cur");
    if (!c || !finePointer || reduce) { if (c) c.remove(); return; }
    var label = $("b", c), x = -100, y = -100, cx = -100, cy = -100;
    window.addEventListener("mousemove", function (e) { x = e.clientX; y = e.clientY; }, { passive: true });
    document.addEventListener("mouseleave", function () { c.classList.add("is-hidden"); });
    document.addEventListener("mouseenter", function () { c.classList.remove("is-hidden"); });
    document.addEventListener("mouseover", function (e) {
      var v = e.target.closest && e.target.closest("[data-cursor]");
      var l = e.target.closest && e.target.closest("a, button, .folder, .tab, input, select, textarea");
      c.classList.toggle("is-view", !!v);
      c.classList.toggle("is-link", !v && !!l);
      if (v) label.textContent = v.getAttribute("data-cursor");
    });
    (function loop() {
      cx += (x - cx) * 0.2; cy += (y - cy) * 0.2;
      c.style.transform = "translate3d(" + cx + "px," + cy + "px,0)";
      requestAnimationFrame(loop);
    })();
  }
})();
