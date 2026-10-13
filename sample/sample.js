/* ==========================================================================
   デザイン案B — 演出スクリプト
   GSAP + ScrollTrigger + Lenis(慣性スクロール)。
   ライブラリが読めない / 「視差効果を減らす」設定の環境では演出を省き、
   すべて静的に表示する(head 内の初期化スクリプトと連携)。
   ========================================================================== */
(function () {
  "use strict";
  var d = document.documentElement;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var hasLib = !!(window.gsap && window.ScrollTrigger);
  var lenis = null;

  /* ---------------- 共通UI(演出の有無に関わらず動作) ---------------- */

  // 全画面メニュー
  var menuBtn = $(".hd-menu");
  var menu = $("#menu");
  function setMenu(open) {
    if (open) d.classList.add("hd-in"); // 演出の途中でも閉じるボタンが必ず見えるように
    d.classList.toggle("menu-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-hidden", String(!open));
    if (lenis) { open ? lenis.stop() : lenis.start(); }
  }
  menuBtn.addEventListener("click", function () { setMenu(!d.classList.contains("menu-open")); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });

  // ページ内リンク(固定ヘッダーの高さぶん手前で止める)
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href");
      var target = id === "#top" ? 0 : $(id);
      if (target === null) return;
      e.preventDefault();
      setMenu(false);
      var offset = id === "#top" ? 0 : -($(".hd").offsetHeight - 1);
      if (lenis) {
        lenis.scrollTo(target, { offset: offset, duration: 1.5 });
      } else if (target === 0) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        target.scrollIntoView({ behavior: "smooth" });
      }
    });
  });

  // ヘッダー: 下へスクロールで隠し、上へ戻すと出す
  var hd = $(".hd");
  var lastY = window.scrollY;
  function onScroll() {
    var y = window.scrollY;
    hd.classList.toggle("is-scrolled", y > 30);
    var down = y > lastY + 2, up = y < lastY - 2;
    if (down && y > 420 && !d.classList.contains("menu-open")) hd.classList.add("is-hidden");
    if (up || y < 420) hd.classList.remove("is-hidden");
    lastY = y;
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // 右レールの章番号
  var riNum = $(".ri-num"), riLabel = $(".ri-label");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        riNum.textContent = en.target.getAttribute("data-sec");
        riLabel.textContent = en.target.getAttribute("data-sec-label");
        d.classList.toggle("past-hero", en.target.getAttribute("data-sec") !== "00");
      });
    }, { rootMargin: "-45% 0px -54% 0px" });
    $$("[data-sec]").forEach(function (s) { io.observe(s); });
  }

  // マーキー: スクロールの速さで加速し、上スクロールでは逆向きに流れる
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mqTrack = $(".mq-track");
  var mqAnim = mqTrack && mqTrack.getAnimations ? mqTrack.getAnimations()[0] : null;
  if (mqAnim && !reduce) {
    var rate = 1, dir = 1, prevY = window.scrollY;
    (function tick() {
      var y = window.scrollY, v = y - prevY;
      prevY = y;
      if (Math.abs(v) > 0.5) dir = v > 0 ? 1 : -1;
      var target = dir * (1 + Math.min(Math.abs(v) * 0.35, 7));
      rate += (target - rate) * 0.08;
      mqAnim.playbackRate = rate;
      requestAnimationFrame(tick);
    })();
  }

  /* ---------------- 演出(GSAP) ---------------- */

  if (!hasLib || !d.classList.contains("anim")) {
    d.classList.remove("anim", "intro");
    d.classList.add("ready", "hd-in");
    return;
  }

  try {
    initMotion();
  } catch (err) {
    // 途中で失敗しても内容が見えなくならないようにする
    if (window.console) console.error(err);
    d.classList.remove("anim", "intro");
    d.classList.add("hd-in");
  }
  d.classList.add("ready");

  function initMotion() {
    var gsap = window.gsap, ScrollTrigger = window.ScrollTrigger;
    gsap.registerPlugin(ScrollTrigger);

    // 慣性スクロール(タッチ端末では標準のスクロールのまま)
    if (window.Lenis) {
      lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);
    }

    /* ---- イントロ → ヒーロー ---- */
    var intro = d.classList.contains("intro");
    var tl = gsap.timeline({ defaults: { ease: "expo.out" } });
    if (intro) {
      window.scrollTo(0, 0);
      if (lenis) lenis.stop();
      tl.to(".loader-mark", { opacity: 1, y: 0, duration: 1 })
        .fromTo(".loader-txt > span > span", { yPercent: 110, y: 0 }, { yPercent: 0, duration: 1.1, stagger: 0.09 }, "<0.1")
        .to(".loader-line", { scaleX: 1, duration: 1.2, ease: "power3.inOut" }, "<")
        .to(".loader", { yPercent: -100, duration: 1.15, ease: "expo.inOut" }, "+=0.05")
        .add(function () {
          try { sessionStorage.setItem("sampleB-intro", "1"); } catch (e) {}
          if (lenis) lenis.start();
          d.classList.remove("intro");
        });
    }
    tl.add(heroIn(), intro ? "-=0.6" : 0.15);

    function heroIn() {
      var t = gsap.timeline({ defaults: { ease: "expo.out" } });
      t.to(".hero-photo-inner", { clipPath: "inset(0% 0% 0% 0%)", duration: 1.7, ease: "expo.inOut" })
        .to(".hero-photo-inner img", { scale: 1, duration: 2.4 }, "<0.2")
        .to(".hero-title .vline > span", { yPercent: 0, y: 0, duration: 1.6, stagger: 0.16 }, "<0.25")
        .add(function () { d.classList.add("hd-in"); }, "<0.3")
        .to(".seal", { opacity: 1, scale: 1, rotate: -4, duration: 1.1, ease: "back.out(2.2)" }, "-=0.9")
        .to("[data-hero-fade]", { opacity: 1, y: 0, duration: 1.2, stagger: 0.08 }, "<-0.5");
      return t;
    }
    // .vline の初期位置は CSS の translateY(-105%)。GSAP 側の基準に合わせる
    gsap.set(".hero-title .vline > span", { yPercent: -105, y: 0 });

    /* ---- スクロール連動 ---- */

    // 見出しを1行ずつ
    $$("[data-lines]").forEach(function (el) {
      gsap.from($$(".line > span", el), {
        yPercent: 110, duration: 1.3, stagger: 0.1, ease: "expo.out",
        scrollTrigger: { trigger: el, start: "top 86%" }
      });
    });

    // ふわっと出す
    $$("[data-fade]").forEach(function (el) {
      gsap.from(el, {
        autoAlpha: 0, y: 26, duration: 1.2, ease: "expo.out",
        scrollTrigger: { trigger: el, start: "top 90%" }
      });
    });

    // リストの行を順番に
    $$("[data-rows]").forEach(function (list) {
      gsap.from(list.children, {
        autoAlpha: 0, y: 22, duration: 1.1, stagger: 0.07, ease: "expo.out",
        scrollTrigger: { trigger: list, start: "top 86%" }
      });
    });

    // 画像を下から幕を上げるように
    $$("[data-reveal]").forEach(function (fig) {
      var img = $("img", fig);
      var t = gsap.timeline({ scrollTrigger: { trigger: fig, start: "top 84%" } });
      t.from(fig, { clipPath: "inset(100% 0% 0% 0%)", duration: 1.6, ease: "expo.inOut" })
        .from(img, { scale: 1.25, duration: 2.2, ease: "expo.out" }, "<0.1");
    });

    // 視差(写真が枠の中でゆっくり動く)
    $$("[data-parallax]").forEach(function (wrap) {
      var amt = parseFloat(wrap.getAttribute("data-parallax")) || 7;
      gsap.fromTo($("img", wrap), { yPercent: -amt }, {
        yPercent: amt, ease: "none",
        scrollTrigger: { trigger: wrap, start: "top bottom", end: "bottom top", scrub: true }
      });
    });

    // 松戸市提供写真: 切り取らずに、下から幕が上がるように見せる
    gsap.timeline({ scrollTrigger: { trigger: ".plate", start: "top 82%" } })
      .from(".plate-clip", { clipPath: "inset(100% 0% 0% 0%)", duration: 1.8, ease: "expo.inOut" })
      .from(".plate figcaption > *", { autoAlpha: 0, y: 12, duration: 1, stagger: 0.08, ease: "expo.out" }, "-=0.6");

    // 地区の割合バー
    gsap.from(".area-bar i", {
      scaleX: 0, transformOrigin: "left center", duration: 1.4, stagger: 0.08, ease: "expo.inOut",
      scrollTrigger: { trigger: ".area-bar", start: "top 88%" }
    });

    // 相談窓口の曜日(漢字)を少し遅れて
    $$(".c-kanji").forEach(function (k) {
      gsap.from(k, {
        yPercent: 40, autoAlpha: 0, duration: 1.4, ease: "expo.out",
        scrollTrigger: { trigger: k, start: "top 88%" }
      });
    });

    /* ---- PC: 松戸のまち を横に流す ---- */
    var mm = gsap.matchMedia();
    mm.add("(min-width: 900px)", function () {
      var sec = $(".town"), vp = $(".town-viewport"), track = $(".town-track");
      sec.classList.add("pin");
      var dist = function () { return Math.max(0, track.scrollWidth - vp.clientWidth); };
      var move = gsap.to(track, {
        x: function () { return -dist(); },
        ease: "none",
        scrollTrigger: {
          trigger: sec, start: "top top",
          end: function () { return "+=" + dist(); },
          pin: true, scrub: 0.8, anticipatePin: 1, invalidateOnRefresh: true
        }
      });
      // 写真が枠の中で少し遅れて動く
      $$(".town-img img", track).forEach(function (img) {
        gsap.fromTo(img, { xPercent: -5 }, {
          xPercent: 5, ease: "none",
          scrollTrigger: { trigger: img.parentElement, containerAnimation: move, start: "left right", end: "right left", scrub: true }
        });
      });
      gsap.to(".town-progress i", {
        scaleX: 1, ease: "none",
        scrollTrigger: { trigger: sec, start: "top top", end: function () { return "+=" + dist(); }, scrub: true }
      });
      return function () { sec.classList.remove("pin"); gsap.set(track, { clearProps: "transform" }); };
    });

    /* ---- PC: サービス一覧でカーソルに写真が付いてくる ---- */
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      var pv = $(".svc-preview"), list = $(".svc-list");
      var imgs = $$("img", pv);
      gsap.set(pv, { xPercent: -50, yPercent: -50 });
      var xTo = gsap.quickTo(pv, "x", { duration: 0.7, ease: "power3" });
      var yTo = gsap.quickTo(pv, "y", { duration: 0.7, ease: "power3" });
      list.addEventListener("mousemove", function (e) { xTo(e.clientX + 70); yTo(e.clientY); });
      $$(".svc-row", list).forEach(function (row) {
        row.addEventListener("mouseenter", function () {
          var src = row.getAttribute("data-img");
          imgs.forEach(function (im) { im.classList.toggle("on", im.getAttribute("data-src") === src); });
          pv.classList.add("show");
        });
      });
      list.addEventListener("mouseleave", function () { pv.classList.remove("show"); });
    }

    // 画像・フォントの読み込みで高さが変わるため、位置を再計算
    window.addEventListener("load", function () { ScrollTrigger.refresh(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
  }
})();
