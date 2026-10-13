/* ==========================================================================
   デザイン案C — 演出スクリプト(高級感・映画的な動き)
   ・初回のイントロ / 暗転して金の線が走るページ遷移
   ・見出しは文節ごとにまとめ、1文字ずつぼかしから浮かび上がらせる
   ・写真は金色の幕が横切ってから現れる / ゆっくり寄っていくスライド
   ・慣性スクロール(Lenis)と視差(GSAP)は読み込めたときだけ
   機能(ログイン・アップロード・送信)はデザイン案のため持たない。
   ========================================================================== */
(function () {
  "use strict";
  var d = document.documentElement;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var anim = d.classList.contains("anim");
  var lenis = null;
  // このデザインの置き場所(…/assets/c.js の2つ上)。公開ディレクトリ名に依存しないようにする
  var me = document.currentScript && document.currentScript.src;
  var siteRoot = me ? new URL("../", me).pathname : "/";

  try { init(); } catch (err) {
    if (window.console) console.error(err);
    d.classList.remove("anim", "pt-in", "intro-on");   // 途中で失敗しても内容は必ず見せる
  }
  d.classList.add("ready");

  function init() {
    splitText();
    pageTransition();
    header();
    menu();
    reveal();
    heroSlides();
    intro();
    tabs();
    toc();
    memberFilter();
    folders();
    demoForms();
    smoothAndParallax();
    cursor();
  }

  /* ---- 見出しの分割: 文節(<wbr> の区切り)は崩さず、中の文字を1字ずつ包む ---- */
  function splitText() {
    $$(".split").forEach(function (el) {
      if (el.getAttribute("data-split-done")) return;
      var html = el.innerHTML.replace(/<wbr\s*\/?>/g, "\u0000");
      var tmp = document.createElement("div");
      tmp.innerHTML = html;
      var i = 0;
      (function walk(node) {
        Array.prototype.slice.call(node.childNodes).forEach(function (n) {
          if (n.nodeType === 3) {
            var frag = document.createDocumentFragment();
            n.textContent.split("\u0000").forEach(function (phrase, k, arr) {
              if (phrase) {
                var w = document.createElement("span");
                w.className = "w";
                Array.prototype.forEach.call(phrase, function (ch) {
                  var c = document.createElement("span");
                  c.className = "c";
                  c.style.setProperty("--i", i++);
                  c.textContent = ch;
                  w.appendChild(c);
                });
                frag.appendChild(w);
              }
              if (k < arr.length - 1) frag.appendChild(document.createElement("wbr"));
            });
            n.parentNode.replaceChild(frag, n);
          } else if (n.nodeType === 1 && n.tagName !== "BR") {
            walk(n);
          }
        });
      })(tmp);
      el.innerHTML = tmp.innerHTML;
      el.setAttribute("aria-label", el.textContent);
      el.setAttribute("data-split-done", "1");
    });
    // 文節が1行に収まらない(括弧付きの長い名称など)ときだけ、その文節の中で折り返しを許す
    function relax() {
      $$(".split").forEach(function (el) {
        var room = el.clientWidth;
        $$(".w", el).forEach(function (w) {
          w.classList.remove("loose");
          if (room > 0 && w.scrollWidth > room) w.classList.add("loose");
        });
      });
    }
    relax();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relax);
    var t = null;
    window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(relax, 150); });
  }

  /* ---- ページ遷移: 暗転して金の線が走り、移動先でゆっくり明ける ---- */
  function pageTransition() {
    if (d.classList.contains("pt-in")) {
      setTimeout(function () { d.classList.add("pt-out"); }, 40);
      setTimeout(function () { d.classList.remove("pt-in", "pt-out"); }, 1700);
    }
    window.addEventListener("pageshow", function (e) {
      if (e.persisted) d.classList.remove("pt-leave", "pt-in", "pt-out");
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
      if (url.pathname.indexOf(siteRoot) === 0) { try { sessionStorage.setItem("c-pt", "1"); } catch (er) {} }
      d.classList.add("pt-leave");
      setTimeout(function () { location.href = url.href; }, 900);
    });
  }

  /* ---- 初回のイントロ(セッションに1回) ---- */
  function intro() {
    var hero = $(".hero");
    function startHero() {
      d.classList.add("hero-go");
      var catchEl = $(".hero-catch");
      if (catchEl) catchEl.classList.add("in");
    }
    if (!d.classList.contains("intro-on")) {
      if (hero) setTimeout(startHero, d.classList.contains("pt-in") ? 500 : 150);
      return;
    }
    var name = $(".intro-name");
    if (name) {
      name.innerHTML = Array.prototype.map.call(name.textContent, function (ch, i) {
        return '<span class="c" style="--i:' + i + '">' + ch + "</span>";
      }).join("");
    }
    if (lenis) lenis.stop();
    // rAF は裏タブ等で止まるため、タイマーで確実に開始する
    setTimeout(function () { d.classList.add("intro-play"); }, 40);
    setTimeout(function () { d.classList.add("intro-out"); startHero(); }, 2900);
    setTimeout(function () {
      d.classList.remove("intro-on", "intro-play", "intro-out");
      try { sessionStorage.setItem("c-intro", "1"); } catch (e) {}
      if (lenis) lenis.start();
    }, 4400);
  }

  /* ---- ヘッダー ---- */
  function header() {
    var hd = $(".hd");
    if (!hd) return;
    var dark = $(".hero, .ph");
    var lastY = window.scrollY;
    function onScroll() {
      var y = window.scrollY;
      var limit = dark ? Math.max(dark.offsetHeight - 90, 120) : 10;
      hd.classList.toggle("is-solid", y > limit);
      if (y > lastY + 3 && y > 520 && !d.classList.contains("menu-open")) hd.classList.add("is-hidden");
      if (y < lastY - 3 || y < 520) hd.classList.remove("is-hidden");
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
    var els = $$("[data-rv], .split:not(.hero-catch), .rv-img, .gl, .blk");
    if (!anim || !("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---- トップの写真スライド ---- */
  function heroSlides() {
    var slides = $$(".hs");
    if (slides.length < 2) return;
    var bars = $$(".hero-bars i"), capNo = $(".hero-cap .num"), capTx = $(".hero-cap span:last-child");
    var cur = 0, dur = 7000, timer = null;
    function show(n) {
      var prev = slides[cur];
      slides.forEach(function (s) { s.classList.remove("is-prev"); });
      if (prev !== slides[n]) { prev.classList.remove("is-active"); prev.classList.add("is-prev"); }
      slides[n].classList.add("is-active");
      setTimeout(function () { prev.classList.remove("is-prev"); }, 2300);
      bars.forEach(function (b, i) { b.classList.remove("is-active", "is-done"); if (i < n) b.classList.add("is-done"); });
      if (bars[n]) { void bars[n].offsetWidth; bars[n].classList.add("is-active"); }
      if (capNo) capNo.textContent = String(n + 1).padStart(2, "0");
      if (capTx) capTx.textContent = slides[n].getAttribute("data-cap") || "";
      cur = n;
    }
    d.style.setProperty("--dur", dur / 1000 + "s");
    show(0);
    if (reduce) return;
    function start() { clearInterval(timer); timer = setInterval(function () { show((cur + 1) % slides.length); }, dur); }
    start();
    document.addEventListener("visibilitychange", function () { if (document.hidden) clearInterval(timer); else start(); });
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
        if (map[en.target.id]) map[en.target.id].classList.add("is-on");
      });
    }, { rootMargin: "-30% 0px -60% 0px" });
    $$(".blk[id]").forEach(function (b) { io.observe(b); });
  }

  /* ---- 会員一覧の絞り込み(表示上の機能のみ) ---- */
  function memberFilter() {
    var box = $(".mt-filter");
    if (!box) return;
    var input = $("input", box), out = $("output", box), rows = $$(".member-table tbody tr");
    function norm(s) { return s.replace(/\s+/g, "").toLowerCase(); }
    function run() {
      var q = norm(input.value), n = 0;
      rows.forEach(function (r) { var hit = !q || norm(r.textContent).indexOf(q) !== -1; r.hidden = !hit; if (hit) n++; });
      out.textContent = n + " 社";
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
    $$("form.demo, .adm form").forEach(function (f) { f.addEventListener("submit", function (e) { e.preventDefault(); }); });
    $$(".adm button").forEach(function (b) { b.addEventListener("click", function (e) { e.preventDefault(); }); });
  }

  /* ---- 慣性スクロール・視差 ---- */
  function smoothAndParallax() {
    if (reduce || !anim) return;
    if (window.Lenis) {
      lenis = new window.Lenis({ lerp: 0.075, smoothWheel: true, wheelMultiplier: 0.9 });
      var raf = function (t) { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
      if (d.classList.contains("intro-on")) lenis.stop();
      $$('a[href^="#"]').forEach(function (a) {
        a.addEventListener("click", function (e) {
          var t = $(a.getAttribute("href"));
          if (!t) return;
          e.preventDefault();
          lenis.scrollTo(t, { offset: -100, duration: 1.6 });
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
        var amt = parseFloat(wrap.getAttribute("data-px")) || 8;
        gsap.fromTo(img, { yPercent: -amt }, { yPercent: amt, ease: "none",
          scrollTrigger: { trigger: wrap, start: "top bottom", end: "bottom top", scrub: true } });
      });
      // 重ねた写真は、要素ごとに違う速さで漂わせて奥行きを出す
      $$("[data-float]").forEach(function (el) {
        var a = parseFloat(el.getAttribute("data-float")) || 8;
        gsap.fromTo(el, { yPercent: a }, { yPercent: -a, ease: "none",
          scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true } });
      });
      // ヒーローの文字は、スクロールに合わせてゆっくり沈みながら薄れる
      var heroIn = $(".hero-in");
      if (heroIn) {
        gsap.to(heroIn, { yPercent: 18, opacity: 0, ease: "none",
          scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
      }
      var phIn = $(".ph-in");
      if (phIn) {
        gsap.to(phIn, { yPercent: 20, opacity: 0, ease: "none",
          scrollTrigger: { trigger: ".ph", start: "top top", end: "bottom top", scrub: true } });
      }
      window.addEventListener("load", function () { window.ScrollTrigger.refresh(); });
    }
  }

  /* ---- PCのカーソル ---- */
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
      cx += (x - cx) * 0.16; cy += (y - cy) * 0.16;
      c.style.transform = "translate3d(" + cx + "px," + cy + "px,0)";
      requestAnimationFrame(loop);
    })();
  }
})();
