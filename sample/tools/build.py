"""
新デザイン案(/sample/)の全ページを生成する。

現行サイト(mockup/*.html, mockup/kaiin/*.html)の本文をそのまま取り込み、
案Cの枠(ヘッダー・ページ見出し・目次・関連ページ・フッター)で組み直して書き出す。
文章を手で書き写さないので、現行ページを直したら再実行するだけで反映できる。

  python3 sample/tools/build.py             # mockup/ で実行(BudouX 入りの python で)
  文節改行(<wbr>)は build.py が tools/add_wbr.py を呼んで自動で書き込む。

URL の注意: Vercel は /sample(末尾スラッシュなし)をリダイレクトせずに返すため、
トップページだけは ../sample/ を経由して参照する(R と A の接頭辞で吸収している)。
旧URL /sample2/ には、同じページへ転送するだけの小さなページを書き出す。
"""
import hashlib
import html as htmllib
import os
import re
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))   # mockup/
OUT = os.path.join(ROOT, "sample")
SITE = "sample"          # 公開URLのディレクトリ名
OLD_SITES = ["sample2"]  # 旧URL。同じページへ転送する
VER = "28"
SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"

# ---------------------------------------------------------------------------
# ページ定義: slug -> (英字見出し, 分類, 写真, 写真の位置, 関連ページ)
# ---------------------------------------------------------------------------
PAGES = {
    "about":            ("About",        "Matsudo Branch",   "tojotei.jpg",      "50% 60%", ["takken", "consult"]),
    "takken":           ("Association",  "Matsudo Branch",   "hero-hondoji.jpg", "40% 45%", ["about", "nyukai"]),
    "consult":          ("Consultation", "For residents",    "yagiri.jpg",       "50% 55%", ["area", "kariru"]),
    "area":             ("Members",      "For residents",    "mori21.jpg",       "50% 40%", ["consult", "kariru"]),
    "area-matsudo":     ("Members",      "Matsudo · Yagiri", "mori21.jpg",       "50% 30%", ["area", "consult"]),
    "area-kitamatsudo": ("Members",      "Kita-Matsudo · Mabashi", "mori21.jpg", "50% 30%", ["area", "consult"]),
    "area-kogane":      ("Members",      "Kogane · Shin-Matsudo",  "mori21.jpg", "50% 30%", ["area", "consult"]),
    "area-keisei":      ("Members",      "Keisei Matsudo",   "mori21.jpg",       "50% 30%", ["area", "consult"]),
    "area-tokiwadaira": ("Members",      "Tokiwadaira · Goko", "mori21.jpg",     "50% 30%", ["area", "consult"]),
    "kariru":           ("Renting",      "For residents",    "yagiri.jpg",       "50% 35%", ["consult", "area"]),
    "nyukai":           ("Membership",   "For businesses",   "hero-hondoji.jpg", "40% 60%", ["kaigyo", "license"]),
    "kaigyo":           ("Start up",     "For businesses",   "tojotei.jpg",      "50% 45%", ["nyukai", "shoshiki"]),
    "license":          ("License",      "For businesses",   "mori21.jpg",       "50% 55%", ["shoshiki", "nyukai"]),
    "shoshiki":         ("Documents",    "For businesses",   "tojotei.jpg",      "50% 30%", ["license", "kaigyo"]),
    "news":             ("News",         "Information",      "hero-hondoji.jpg", "30% 75%", ["consult", "about"]),
    "links":            ("Links",        "Information",      "yagiri.jpg",       "50% 70%", ["about", "contact"]),
    "contact":          ("Contact",      "Information",      "mori21.jpg",       "50% 65%", ["consult", "about"]),
    "privacy":          ("Privacy",      "Information",      None,               "",        ["contact", "about"]),
}
# 関連タイル用の短い説明(ページの h1 は現行ページから取る)
TILE = {
    "about":   ("About",        "支部の事業・組織・アクセスのご案内です。", "tojotei.jpg"),
    "takken":  ("Association",  "宅建協会と全宅保証の役割をご紹介します。", "hero-hondoji.jpg"),
    "consult": ("Consultation", "不動産に関するご相談を無料でお受けしています。", "yagiri.jpg"),
    "area":    ("Members",      "お住まいの地域から会員の不動産会社を探せます。", "mori21.jpg"),
    "kariru":  ("Renting",      "家を借りる・貸すときに知っておきたいこと。", "yagiri.jpg"),
    "nyukai":  ("Membership",   "入会のメリットと手続きの流れをご案内します。", "hero-hondoji.jpg"),
    "kaigyo":  ("Start up",     "不動産業の開業をお考えの方へ。", "tojotei.jpg"),
    "license": ("License",      "宅建士の法定講習会と試験のご案内です。", "mori21.jpg"),
    "shoshiki": ("Documents",   "免許申請・更新などの書式のご案内です。", "tojotei.jpg"),
    "contact": ("Contact",      "お電話・フォームでのお問い合わせ。", "mori21.jpg"),
}
KAIIN = {
    "kaiin/index":  ("Members only", "Members",  "mori21.jpg",       "50% 45%"),
    "kaiin/ippan":  ("Members area", "Members",  "hero-hondoji.jpg", "40% 55%"),
    "kaiin/kanji":  ("Committees",   "Members",  "tojotei.jpg",      "50% 45%"),
    "kaiin/upload": ("Admin",        "Members",  None,               ""),
}
NAV = [("about", "支部案内"), ("consult", "不動産相談"), ("area", "会員を探す"),
       ("nyukai", "入会案内"), ("license", "講習・試験"), ("news", "お知らせ")]
NAV_OF = {"takken": "about", "kariru": "consult", "kaigyo": "nyukai", "shoshiki": "license"}
MENU = [
    ("For residents", "一般の方へ", [("consult", "不動産相談", "Consultation"), ("area", "会員一覧・エリアマップ", "Members"),
                                  ("kariru", "家を借りる・貸す時", "Renting"), ("news", "お知らせ", "News")]),
    ("For businesses", "開業・入会をお考えの方へ", [("nyukai", "入会案内", "Membership"), ("kaigyo", "開業をお考えの方", "Start up"),
                                             ("takken", "宅建協会とは", "Association")]),
    ("For licensees", "宅建士・会員の方へ", [("license", "講習・試験", "License"), ("shoshiki", "書式ダウンロード", "Documents"),
                                        ("kaiin/index", "会員専用ページ", "Members only")]),
    ("About", "支部について", [("about", "支部案内", "About"), ("links", "リンク集", "Links"),
                           ("contact", "お問い合わせ", "Contact"), ("privacy", "個人情報の取り扱い", "Privacy")]),
]
ROOMS = [("oshirase", "① 会員向けお知らせ"), ("gyoji", "① 協会行事・会議等日程表"), ("shoshiki", "① 書式ダウンロード"),
         ("kitei", "① 支部規定・施行細則"), ("hokoku", "① 会員のための行事報告"), ("kenshu", "① 研修会・勉強会"),
         ("chosa", "① 調査・アンケート"), ("shiryo", "① 各種資料"), ("kanjikai", "② 幹事会(全体)"),
         ("i1", "② 総務委員会"), ("i2", "② 財務委員会"), ("i3", "② 綱紀・研修委員会"), ("i4", "② 厚生委員会"),
         ("i5", "② 広報委員会"), ("i6", "② 入会審査委員会"), ("i7", "② 無料相談業務委員会"), ("i8", "② 流通委員会")]

EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿⌀-⏿⬀-⯿️‍]")


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


def write(rel, text):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def esc(s):
    return htmllib.escape(s, quote=True)


def strip_tags(s):
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", "", s))).strip()


def match_div(src, start):
    """src[start:] が <div ...> で始まるとき、対応する </div> の直後の位置を返す。"""
    depth = 0
    for m in re.finditer(r"<(/?)div\b[^>]*>", src[start:]):
        depth += -1 if m.group(1) else 1
        if depth == 0:
            return start + m.end()
    raise ValueError("div の対応が取れません")


def inner(outer):
    return outer[outer.index(">") + 1: outer.rindex("</div>")]


def blocks_of(region):
    """region 中の content-block を順に取り出す。取りこぼし検出用に残りの文字も返す。
    ブロックとブロックの間に置かれた要素(開業ページのカード等)は、直前の章に含める。"""
    out, rest, pos = [], [], 0
    for m in re.finditer(r'<div class="content-block[^"]*"[^>]*>', region):
        if m.start() < pos:
            continue
        end = match_div(region, m.start())
        gap = region[pos:m.start()]
        if out and strip_tags(gap):
            out[-1] += gap
        else:
            rest.append(gap)
        out.append(inner(region[m.start():end]))
        pos = end
    rest.append(region[pos:])
    return out, "".join(rest)


def clean(h, depth):
    """現行ページの本文を案C用に整える。"""
    h = EMOJI.sub("", h)
    h = re.sub(r"\s*[→↗]\s*(?=</)", "", h)                       # ボタン末尾の矢印(案Cは CSS で付ける)
    h = re.sub(r"(<(?:h[1-6]|a|span|p|div|li)[^>]*>)\s+", r"\1", h)  # 絵文字を消した後の行頭の空白
    if depth == 0:
        h = re.sub(r'(src|href)="assets/', r'\1="../assets/', h)
    else:
        h = re.sub(r'(src|href)="\.\./assets/', r'\1="../../assets/', h)
    h = h.replace(' data-pass="', ' data-x="')
    h = re.sub(r' data-x="[^"]*"', "", h)                          # 会員エリアの仮パスワードは載せない
    return h


# ---------------------------------------------------------------------------
# 共通の枠(高級感: 漆黒×象牙×シャンパンゴールド / 細い明朝)
# ---------------------------------------------------------------------------
FONTS = ("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400"
         "&family=Noto+Sans+JP:wght@300;400;500&family=Noto+Serif+JP:wght@200;300;400;500&display=swap")


def head(title, R, A, desc, intro=False):
    intro_js = ('try { if (!rm && !sessionStorage.getItem("c-intro") && !d.classList.contains("pt-in")) d.classList.add("intro-on"); } catch (e) {}'
                if intro else "")
    return f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(title)}｜宅建協会 松戸支部 新デザイン案</title>
<meta name="description" content="{esc(desc)}">
<!-- デザイン検討用ページのため検索結果には出さない -->
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#0C0F0D">
<link rel="icon" type="image/png" href="{A}assets/img/hatomark.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="{FONTS}" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.css">
<link rel="stylesheet" href="{R}assets/c.css?v={VER}">
<script>
  // 演出の初期状態を描画前に決める(読み込み後に隠すとチラつくため)
  (function () {{
    var d = document.documentElement, rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    d.classList.add("js");
    if (!rm) d.classList.add("anim");
    try {{ if (!rm && sessionStorage.getItem("c-pt") === "1") {{ d.classList.add("pt-in"); sessionStorage.removeItem("c-pt"); }} }} catch (e) {{}}
    {intro_js}
    // スクリプトが動かなかった場合でも内容は必ず表示する
    setTimeout(function () {{ if (!d.classList.contains("ready")) d.classList.remove("anim", "pt-in", "intro-on"); }}, 4000);
  }})();
</script>
</head>
"""


def link(slug, R):
    return f"{R}{slug}.html"


def header(R, A, current):
    cur = ' class="is-current"'
    nav = "".join(f'<a href="{link(s, R)}"{cur if s == current else ""}>{t}</a>' for s, t in NAV)
    groups, n = [], 0
    for en, ja, items in MENU:
        lis = []
        for s, t, e in items:
            lis.append(f'<li style="--i:{n}"><a href="{link(s, R)}">{t}<span>{e}</span></a></li>')
            n += 1
        groups.append(f'<div class="menu-group"><p class="lbl d">{en}</p><ul>{"".join(lis)}</ul></div>')
    return f"""<div class="intro" aria-hidden="true"><img class="intro-mark" src="{A}assets/img/hatomark.png" alt=""><span class="intro-line"></span><p class="intro-name">宅建協会 松戸支部</p></div>
<div class="pt" aria-hidden="true"><i></i></div>
<div class="cur" aria-hidden="true"><i></i><s></s><b></b></div>

<header class="hd">
  <a href="{link('index', R)}" class="hd-brand" aria-label="宅建協会 松戸支部 トップへ">
    <img src="{A}assets/img/hatomark.png" alt="" width="28" height="33">
    <span class="hd-name"><small>一般社団法人 千葉県宅地建物取引業協会</small><strong>宅建協会 松戸支部</strong></span>
  </a>
  <nav class="hd-nav" aria-label="主要メニュー">{nav}</nav>
  <div class="hd-cta">
    <a href="{link('kaiin/index', R)}" class="hd-member">会員専用</a>
    <a href="{link('contact', R)}" class="hd-contact">CONTACT</a>
  </div>
  <button class="hd-menu" type="button" aria-expanded="false" aria-controls="menu"><b>MENU</b><i></i></button>
</header>

<div class="menu" id="menu" aria-hidden="true" data-lenis-prevent>
  <div class="menu-in">
    <figure class="menu-photo"><img class="grade" src="{A}assets/img/tojotei.jpg" alt="" loading="lazy"></figure>
    <div class="menu-body">
      <div class="menu-groups">{"".join(groups)}</div>
      <div class="menu-foot">
        <div><p class="lbl d">Contact</p><a class="tel" href="tel:0473646904">047-364-6904</a></div>
        <p>月〜金 9:00–17:00(土日・祝日休)<br>〒271-0064 千葉県松戸市上本郷3185</p>
      </div>
    </div>
  </div>
</div>
"""


def contact_band(R, A):
    """全ページ共通の、お問い合わせへの導線(写真の帯)。"""
    return f"""<section class="cta">
  <div class="bgimg" data-px="6"><img class="grade" src="{A}assets/img/yagiri.jpg" alt="" loading="lazy"></div>
  <div class="wrap cta-grid">
    <div class="cta-hd">
      <div class="shd"><p class="shd-no" data-rv>Contact</p><p class="shd-en split" aria-hidden="true">Consult</p></div>
      <h2 class="ttl split" style="margin-top:26px">不動産のこと、<br>ひとりで悩まずご相談を。</h2>
    </div>
    <div class="cta-tel" data-rv style="--d:.2s">
      <p class="lbl d">Telephone</p>
      <a class="tel" href="tel:0473646904">047-364-6904</a>
      <p>月〜金 9:00–17:00(土日・祝日休)</p>
      <a class="lux d" href="{link('contact', R)}">お問い合わせ</a>
    </div>
  </div>
</section>
"""


def footer(R, A):
    cols = []
    for en, ja, items in MENU:
        lis = "".join(f'<li><a href="{link(s, R)}">{t}</a></li>' for s, t, _ in items)
        cols.append(f'<div><p class="lbl d">{en}</p><ul>{lis}</ul></div>')
    return f"""<footer class="ft">
  <div class="wrap">
    <div class="ft-brand" data-rv>
      <a href="{link('index', R)}"><img src="{A}assets/img/hatomark.png" alt="" width="40" height="47"><strong>宅建協会 松戸支部</strong><small>一般社団法人 千葉県宅地建物取引業協会</small></a>
    </div>
    <p class="ft-addr" data-rv>〒271-0064 千葉県松戸市上本郷3185 ／ JR常磐線 北松戸駅 徒歩約8分<br><a class="tel" href="tel:0473646904">047-364-6904</a><br>FAX 047-363-3142 ／ 月〜金 9:00–17:00(土日・祝日休)</p>
    <nav class="ft-nav" aria-label="フッターメニュー">{"".join(cols)}</nav>
    <p class="ft-word" aria-hidden="true">Takken Matsudo</p>
    <div class="ft-bottom">
      <p>© 2026 (一社)千葉県宅地建物取引業協会 松戸支部</p>
      <p>このサイトは新デザイン案です。 <a href="{A}index.html">現行のサイトを見る</a></p>
    </div>
  </div>
</footer>
"""


def scripts(R, A, sb=False):
    """sb=True のページは Supabase(会員エリア・お知らせ・会員名簿)を読み込む。
    live.js は c.js より先(入口の鍵を、演出の初期化より前に外すため)。"""
    lib = f'<script src="{SUPABASE_JS}"></script>\n' if sb else ""
    return f"""{lib}<script src="{A}assets/config.js?v={VER}"></script>
<script src="{R}assets/live.js?v={VER}"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js"></script>
<script src="{R}assets/c.js?v={VER}"></script>
</body>
</html>
"""


def page_hero(en, cat, ja, crumbs, photo, pos, A):
    cr = ['<a href="{}">ホーム</a>'.format(crumbs[0][1])]
    for t, href in crumbs[1:]:
        cr.append('<span aria-hidden="true">—</span>')
        cr.append(f'<a href="{href}">{t}</a>' if href else f'<span aria-current="page">{t}</span>')
    bg = (f'<div class="ph-bg" data-px="6"><img class="grade" src="{A}assets/img/{photo}" alt="" style="object-position:{pos}"></div>'
          if photo else "")
    return f"""<section class="ph{'' if photo else ' plain'}">
  {bg}
  <span class="ph-frame" aria-hidden="true"></span>
  <div class="ph-in">
    <p class="ph-en">{cat}</p>
    <p class="ph-big split" aria-hidden="true">{esc(en)}</p>
    <h1 class="ph-ja split">{ja}</h1>
    <span class="gl"></span>
  </div>
  <p class="ph-vt" aria-hidden="true">千葉県宅地建物取引業協会 松戸支部</p>
  <nav class="crumbs" aria-label="現在地">{"".join(cr)}</nav>
  <span class="ph-scroll" aria-hidden="true"></span>
</section>
"""


def add_split(h):
    """本文の h2 を1文字ずつ浮かぶ見出しにする。"""
    def rep(m):
        attrs = m.group(1) or ""
        if 'class="' in attrs:
            return "<h2" + attrs.replace('class="', 'class="split ', 1) + ">"
        return f'<h2 class="split"{attrs}>'
    return re.sub(r"<h2(\s[^>]*)?>", rep, h)


def body_with_toc(blocks):
    """content-block を番号付きの章にし、2章以上あれば左に目次を付ける。"""
    secs, toc = [], []
    for i, b in enumerate(blocks, 1):
        sid = f"s{i:02d}"
        m = re.search(r"<h2[^>]*>(.*?)</h2>", b, re.S)
        title = strip_tags(m.group(1)) if m else ""
        num = f'<p class="blk-num" data-n="{i:02d}" data-rv>{i:02d}</p>' if m else ""
        secs.append(f'<section class="blk" id="{sid}">{num}{add_split(b)}</section>')
        if title:
            toc.append(f'<li><a href="#{sid}"><span>{i:02d}</span>{esc(title)}</a></li>')
    body = "".join(secs)   # 章の中身(段落・表など)は CSS 側で .blk.in をきっかけに現れる
    if len(toc) >= 2:
        side = f'<aside class="pg-toc" aria-label="このページの目次"><div class="pg-toc-in"><p class="lbl">Contents</p><ol>{"".join(toc)}</ol></div></aside>'
        return f'<div class="wrap"><div class="pg">{side}<div class="pg-body">{body}</div></div></div>'
    return f'<div class="wrap"><div class="pg no-toc"><div class="pg-body">{body}</div></div></div>'


def rel_card(slug, R, A, title, i=0):
    en, txt, img = TILE[slug]
    return (f'<a class="rel-card" href="{link(slug, R)}" data-cursor="VIEW">'
            f'<div class="rv-img" style="--d:{i * 0.15}s"><img class="grade" src="{A}assets/img/{img}" alt="" loading="lazy"></div>'
            f'<p class="lbl" data-rv>{en}</p><h3 data-rv>{title}</h3><p data-rv>{txt}</p></a>')


def next_pages(slugs, R, A, titles):
    cards = "".join(rel_card(s, R, A, titles.get(s, s), i) for i, s in enumerate(slugs) if s in TILE)
    if not cards:
        return ""
    return (f'<section class="rel"><div class="wrap"><div class="rel-hd"><p class="lbl c" data-rv>Related pages</p></div>'
            f'<div class="rel-grid">{cards}</div></div></section>')


def h1_of(src):
    m = re.search(r'<div class="ph-inner">.*?<h1>(.*?)</h1>', src, re.S)
    return EMOJI.sub("", strip_tags(m.group(1))) if m else ""


def desc_of(src):
    m = re.search(r'<meta name="description" content="([^"]*)"', src)
    return htmllib.unescape(m.group(1)) if m else "宅建協会 松戸支部"


def main_region(src):
    m = re.search(r'<div class="breadcrumb">.*?</div>\s*</div>(.*?)<footer', src, re.S)
    return m.group(1) if m else ""


# ---------------------------------------------------------------------------
# 下層ページ
# ---------------------------------------------------------------------------
def build_pages(titles):
    warnings = []
    for slug, (en, cat, photo, pos, rel) in PAGES.items():
        src = read(f"{slug}.html")
        ja = titles[slug]
        blocks, rest = blocks_of(main_region(src))
        left = strip_tags(re.sub(r"<(section|div)[^>]*>|</(section|div)>", "", rest))
        if left:
            warnings.append(f"{slug}: content-block 外の文字 → {left[:60]}")
        blocks = [clean(b, 0) for b in blocks]
        if slug.startswith("area-"):
            blocks = [area_detail(b, slug[5:]) for b in blocks]
        if slug == "area":
            blocks = [area_counts(b) for b in blocks]
        if slug == "contact":
            blocks = [live_form(b) for b in blocks]
        crumbs = [("ホーム", "index.html")]
        if slug.startswith("area-"):
            crumbs.append(("会員一覧", "area.html"))
        crumbs.append((ja, ""))
        page = (head(ja, "", "../", desc_of(src)) + f'<body class="page-{slug}">\n' + header("", "../", NAV_OF.get(slug, slug if not slug.startswith("area-") else "area"))
                + "<main>\n" + page_hero(en, cat, ja, crumbs, photo, pos, "../") + body_with_toc(blocks)
                + next_pages(rel, "", "../", titles) + ("" if slug == "contact" else contact_band("", "../"))
                + "</main>\n" + footer("", "../") + scripts("", "../", sb=slug == "news" or slug.startswith("area")))
        write(f"{slug}.html", page)
    return warnings


def area_detail(b, area):
    """会員一覧の表の前に絞り込み欄を置く。表は live.js が名簿データ(members)で差し替える。
    HTML に残す行は、データが読めなかったときの控え。"""
    b = b.replace('<table class="member-table">', f'<table class="member-table" data-area="{area}">', 1)
    b = re.sub(r'(<h2[^>]*>[^<]*\()(\d+)(社\)</h2>)', rf'\1<span data-area-count="{area}">\2</span>\3', b, count=1)   # 見出しの社数も名簿に合わせる
    return b.replace('<div class="table-scroll">',
                     '<div class="mt-filter"><input type="search" placeholder="会社名・代表者・住所で絞り込む" aria-label="会員の絞り込み"><output></output></div>\n<div class="table-scroll">', 1)


def area_counts(b):
    """エリアごとの社数を、名簿データから数え直せるよう印を付ける。"""
    return re.sub(r'(<a href="area-([a-z]+)\.html" class="area-card">.*?<strong>)(\d+)社</strong>',
                  r'\1<span data-area-count="\2">\3</span>社</strong>', b, flags=re.S)


def live_form(b):
    """お問い合わせフォーム(FormSubmit へ送信)。見た目だけ新デザインに合わせる。"""
    if "<form" not in b:
        return b
    b = re.sub(r'(<(?:input|select|textarea|button)[^>]*?)\s+style="[^"]*"', r"\1", b)
    b = b.replace('name="_honey"', 'name="_honey" style="display:none"')   # ロボット除けの欄は隠したまま
    b = re.sub(r'<span style="color:var\(--red\);font-size:11px;">必須</span>', '<span class="req">必須</span>', b)
    return b


def pass_hash(p):
    """会員エリアのパスワードは平文で載せず、live.js と同じ方式のハッシュ値で照合する。"""
    return hashlib.sha256(("matsudo:" + p).encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# 会員専用(デザインのみ)
# ---------------------------------------------------------------------------
def kaiin_frame(slug, body, titles, wrapped=False, after=""):
    en, cat, photo, pos = KAIIN[slug]
    src = read(f"{slug}.html")
    ja = h1_of(src)
    crumbs = [("ホーム", "../index.html")]
    if slug != "kaiin/index":
        crumbs.append(("会員専用", "index.html"))
    crumbs.append((ja, ""))
    demo = ""
    return (head(ja, "../", "../../", desc_of(src)) + f'<body class="page-{slug.replace("/", "-")}">\n' + header("../", "../../", "")
            + "<main>\n" + page_hero(en, cat, ja, crumbs, photo, pos, "../../")
            + (body if wrapped
               else f'<div class="wrap"><div class="pg no-toc"><div class="pg-body">{demo}{body}</div></div></div>')
            + after + "</main>\n" + footer("../", "../../") + scripts("../", "../../", sb=True))


def build_kaiin(titles):
    # 入り口
    src = read("kaiin/index.html")
    sec = re.search(r'<div class="section-head">.*?<div class="rule"></div>\s*<p class="desc">(.*?)</p>', src, re.S)
    desc = clean(sec.group(1), 1) if sec else ""
    cards = []
    for m, img, label in zip(re.finditer(r'<a href="([^"]+)" class="entrance[^"]*">(.*?)</a>', src, re.S),
                             ["hero-hondoji.jpg", "tojotei.jpg"], ["Members area", "Committees"]):
        href, b = m.group(1), clean(m.group(2), 1)
        h2 = re.search(r"<h2>(.*?)</h2>", b, re.S).group(1)
        p = re.search(r"<p>(.*?)</p>", b, re.S).group(1)
        cards.append(f'<a class="entrance" href="{href}" data-cursor="ENTER" data-rv><img class="grade" src="../../assets/img/{img}" alt="" loading="lazy">'
                     f'<p class="lbl d">{label}</p><h2>{h2}</h2><p>{p}</p><span class="lux d">入室する</span></a>')
    alert = re.search(r'<div class="alert warn"[^>]*>(.*?)</div>', src, re.S)
    note = ""
    if alert:
        a = clean(alert.group(1), 1)
        a = re.sub(r'<br>\s*<span[^>]*>※モック版.*?</span>', "", a, flags=re.S)
        a = re.sub(r'\s*style="[^"]*"', "", a)
        note = f'<div class="alert warn" data-rv>{a}</div>'
    body = (f'<section class="blk"><h2>入り口を選んでください</h2><p>{desc}</p></section>'
            f'<div class="entrances">{"".join(cards)}</div>{note}')
    write("kaiin/index.html", kaiin_frame("kaiin/index", body, titles))

    # 一般会員・幹事委員会(入口の鍵 → フォルダ。委員会フォルダは個別の鍵)
    for slug in ("kaiin/ippan", "kaiin/kanji"):
        src = read(f"{slug}.html")
        gm = re.search(r'<div data-gate="([^"]+)" data-pass="([^"]+)">\s*<div class="lockscreen">.*?<h2>(.*?)</h2>\s*<p>(.*?)</p>', src, re.S)
        gate = (f'<div class="gate" data-gate="{gm.group(1)}" data-hash="{pass_hash(gm.group(2))}"><div class="gate-in">'
                f'<p class="lbl">Members only</p><h2 class="split">{gm.group(3)}</h2><p>{gm.group(4)}</p>'
                '<form><input type="password" placeholder="パスワードを入力" aria-label="パスワード" autocomplete="off">'
                '<p class="err" hidden>パスワードが違います</p><button class="lux" type="submit">入室する</button></form></div></div>')
        room_pass = dict(re.findall(r'<div class="folder" data-room="([^"]+)" data-pass="([^"]+)"', src))
        g = re.search(r'<div id="gated-content"[^>]*>', src)
        gated = inner(src[g.start():match_div(src, g.start())])
        gated = re.sub(r'<div class="breadcrumb">.*?</div>', "", gated, flags=re.S)
        gated = re.sub(r"</?section[^>]*>", "", gated)
        gated = re.sub(r'<div class="container">', "<div>", gated)
        gated = clean(gated, 1)
        n = [0]

        def num(m):
            n[0] += 1
            return f'<div class="f-icon">{n[0]:02d}</div>'
        gated = re.sub(r'<div class="f-icon[^"]*">.*?</div>', num, gated, flags=re.S)
        gated = re.sub(r'(<div class="alert[^"]*")\s*style="[^"]*"', r"\1", gated)
        # 新デザインでは、資料の追加・フォームの作成は管理ページに一本化している
        gated = re.sub(r'※資料の追加・フォームの作成は、事務局アカウントでログインしている場合のみ表示されます.*?</span>', '※資料の追加・フォームの作成は、事務局の管理ページから行います。</span>', gated, flags=re.S)
        for room, pw in room_pass.items():
            gated = gated.replace(f'<div class="folder" data-room="{room}">', f'<div class="folder" data-room="{room}" data-hash="{pass_hash(pw)}">', 1)
        assert gated.count("data-hash=") == len(room_pass), slug
        tpls = "".join(clean(t, 1) for t in re.findall(r'<template id="room-[^"]+">.*?</template>', src, re.S))
        modal = ('<div class="cm" role="dialog" aria-modal="true" aria-label="フォルダの中身"><div class="cm-panel">'
                 '<div class="cm-top"><h3></h3><button class="cm-close" type="button">Close</button></div>'
                 '<div class="cm-body"></div></div></div>')
        write(f"{slug}.html", kaiin_frame(slug, gate + f'<div id="gated-content" hidden>{gated}{tpls}</div>', titles, after=modal))

    # 事務局の管理画面
    write("kaiin/upload.html", kaiin_frame("kaiin/upload", admin_body(), titles, wrapped=True))


def fld(label, ctrl, note="", rid=""):
    """管理画面の入力欄1つ分(ラベル・入力・補足)。"""
    m = re.search(r'id="([^"]+)"', ctrl)
    lab = f'<label for="{m.group(1)}">{label}</label>' if m else f"<span class=\"fld-l\">{label}</span>"
    rid = f' id="{rid}"' if rid else ""
    return f'<div class="fld"{rid}>{lab}<div class="fld-c">{ctrl}{f"<p class={chr(34)}note{chr(34)}>{note}</p>" if note else ""}</div></div>'


def admin_body():
    req = '<span class="req">必須</span>'
    cats = "".join(f'<option value="{v}">{t}</option>' for v, t in [
        ("", "(なし)"), ("重要|red", "重要(赤)"), ("事務局|green", "事務局"), ("講習|green", "講習"), ("相談|green", "相談"),
        ("会員向け|green", "会員向け"), ("販売|gold", "販売"), ("その他|gold", "その他")])
    blocks = [
        '<h2>資料のアップロード</h2><p>会員エリアのフォルダに資料を載せます。同じ名前のファイルは上書きされます。</p>'
        + fld("フォルダ", '<select id="f-room"></select>')
        + fld("ファイル", '<input id="f-input" type="file" multiple>', "PDF・Excel・Word など。複数まとめて選べます。")
        + '<div class="act"><button id="f-up" class="lux" type="button">アップロード</button></div>'
        + '<p id="f-status" class="adm-msg" role="status"></p><h3>このフォルダの資料</h3><ul id="f-list" class="file-list"></ul>',

        '<h2>フォームの作成(出欠・アンケート)</h2><p>Google フォームと集計用のスプレッドシートを作り、選んだフォルダに載せます。'
        '会員はフォルダを開いて、その場から回答できます。</p>'
        + fld("載せるフォルダ", '<select id="q-room"></select>', "研修会・勉強会は「① 研修会・勉強会」、調査は「① 調査・アンケート」を選びます。")
        + fld(f"タイトル{req}", '<input id="q-title" type="text" placeholder="例)宅建業法改正セミナー(12月開催)">')
        + fld("開催日", '<input id="q-date" type="date">', "入れると、会員エリアのカレンダーにも載ります。", rid="q-date-row")
        + '<div class="act"><button id="q-btn" class="lux" type="button">フォームを作成</button></div>'
        + '<p id="q-status" class="adm-msg" role="status"></p><ul id="q-result" class="file-list adm-result"></ul>'
        + '<h3>作成済みのフォーム</h3><ul id="q-list" class="file-list"></ul>',

        '<h2>行事・研修会の予定</h2><p>会員エリアの「協会行事・会議等日程表」「研修会・勉強会」のカレンダーに載せる予定を登録します。'
        '出欠フォームのある研修会は、上の「フォームの作成」で開催日を入れれば、ここで登録しなくてもカレンダーに載ります。</p>'
        + fld("カレンダー", '<select id="e-room"></select>')
        + fld(f"日付{req}", '<input id="e-date" type="date">')
        + fld("開始時刻", '<input id="e-time" type="text" placeholder="例)14:00">')
        + fld(f"名称{req}", '<input id="e-title" type="text" placeholder="例)定例幹事会">')
        + fld("場所", '<input id="e-place" type="text" placeholder="例)支部会議室">')
        + fld("補足", '<input id="e-note" type="text" placeholder="例)終了後に懇親会あり">')
        + '<div class="act"><button id="e-btn" class="lux" type="button">予定を登録</button></div>'
        + '<p id="e-status" class="adm-msg" role="status"></p><h3>登録済みの予定(先月以降)</h3><ul id="e-list" class="file-list"></ul>',

        '<h2>会員名簿</h2><p>エリアページの会員一覧です。住所の変更・脱退・入会の連絡があったら、ここで直すとすぐサイトに反映されます。</p>'
        + '<div class="m-tools"><select id="m-area" aria-label="エリア"></select><input id="m-q" type="text" placeholder="会社名・代表者・住所で探す" aria-label="名簿を探す">'
        + '<output id="m-count"></output><button id="m-new" class="dl" type="button">会社を追加</button></div>'
        + '<p id="m-saved" class="adm-msg" role="status"></p>'
        + '<form id="m-form" class="m-form" hidden><h3 id="mf-title"></h3>'
        + fld("エリア", '<select id="mf-area"></select>', "移転でエリアが変わるときは、ここを変えます。")
        + fld(f"商号又は名称{req}", '<input id="mf-name" type="text">')
        + fld("代表者名", '<input id="mf-rep" type="text">')
        + fld("事務所所在地", '<input id="mf-address" type="text" placeholder="例)271-0064 上本郷3185">')
        + fld("TEL", '<input id="mf-tel" type="text">') + fld("FAX", '<input id="mf-fax" type="text">')
        + fld("メール", '<input id="mf-email" type="text">')
        + fld("営業時間", '<input id="mf-hours" type="text" placeholder="例)9:00～18:00">')
        + fld("定休日", '<input id="mf-holiday" type="text" placeholder="例)水曜 年末年始">')
        + fld("業種", '<input id="mf-business" type="text" placeholder="例)売買 / 賃貸">')
        + fld("表示順", '<input id="mf-sort" type="text" inputmode="numeric">', "小さい数ほど上に出ます。今の会社は 10, 20, 30… と10おきです(例: 135 なら 130 と 140 の間)。")
        + '<p id="m-status" class="adm-msg" role="status"></p>'
        + '<div class="act"><button class="lux" type="submit">保存する</button><button id="mf-cancel" class="dl" type="button">やめる</button>'
        + '<button id="mf-del" class="dl del" type="button">名簿から削除</button></div></form>'
        + '<div class="table-scroll"><table class="adm-table"><thead><tr><th>会社</th><th>所在地・電話</th><th></th></tr></thead><tbody id="m-list"></tbody></table></div>',

        '<h2>お知らせ・宅建ニュース</h2><p>追加した記事は、トップページとお知らせページにすぐ載ります(新しいものが上)。</p>'
        + fld("載せる場所", '<select id="n-kind"><option value="oshirase">支部からのお知らせ</option><option value="takken">宅建ニュース</option></select>')
        + fld("日付", '<input id="n-date" type="text" placeholder="2026.11.04">')
        + fld("分類", f'<select id="n-cat">{cats}</select>', rid="n-cat-row")
        + fld(f"タイトル{req}", '<input id="n-title" type="text" placeholder="例)事務局臨時休業のお知らせ">')
        + fld("本文", '<textarea id="n-body" rows="3" placeholder="お知らせページで、タイトルの後ろに表示されます"></textarea>')
        + '<div class="act"><button id="n-add" class="lux" type="button">追加して公開</button></div>'
        + '<p id="n-status" class="adm-msg" role="status"></p>'
        + '<h3>支部からのお知らせ</h3><ul id="n-list-oshirase" class="file-list"></ul><h3>宅建ニュース</h3><ul id="n-list-takken" class="file-list"></ul>',
    ]
    login = ('<div class="wrap"><div class="pg no-toc"><div class="pg-body">'
             '<p id="adm-off" class="alert warn" hidden>接続設定(assets/config.js)が無いため、管理画面を使えません。</p>'
             '<section id="adm-login" class="blk adm-login" hidden><h2 class="split">事務局ログイン</h2>'
             '<p>資料・フォーム・予定・会員名簿・お知らせの編集は、事務局のアカウントでログインして行います。</p>'
             '<form id="adm-login-form">'
             + fld("メールアドレス", '<input id="adm-email" type="email" autocomplete="username" required>')
             + fld("パスワード", '<input id="adm-pass" type="password" autocomplete="current-password" required>')
             + '<p id="adm-login-err" class="adm-msg" role="alert"></p><div class="act"><button class="lux" type="submit">ログイン</button></div></form></section>'
             '</div></div></div>')
    modal = ('<div class="cm" role="dialog" aria-modal="true" aria-label="詳細"><div class="cm-panel">'
             '<div class="cm-top"><h3></h3><button class="cm-close" type="button">Close</button></div><div class="cm-body"></div></div></div>')
    return (f'<div id="adm" class="adm">{login}<div id="adm-main" hidden>'
            '<div class="wrap"><div class="adm-bar"><span id="adm-user"></span><button id="adm-logout" class="dl" type="button">ログアウト</button></div></div>'
            + body_with_toc(blocks) + f"</div></div>{modal}")


# ---------------------------------------------------------------------------
# トップ・完了・404
# ---------------------------------------------------------------------------
def build_index(titles):
    R, A = f"../{SITE}/", "../"
    src = read("index.html")
    news = {}
    for key in ("oshirase", "takken"):
        ul = re.search(rf'<ul class="news-list" id="news-home-{key}">(.*?)</ul>', src, re.S).group(1)
        news[key] = re.findall(r'<span class="date">([^<]*)</span>(?:<span class="chip ([a-z]+)">([^<]*)</span>)?<span class="ttl">([^<]*)</span>', ul)
    area = re.findall(r'<a href="(area-[a-z]+)\.html" class="area-card">.*?<h3>(.*?)</h3><p>(.*?)<br><strong>(\d+)社</strong>', read("area.html"), re.S)

    def nrows(items):
        out = []
        for dt, color, chip, t in items:
            tag = f'<span class="tag{" hot" if color == "red" else ""}">{chip}</span>' if chip else '<span class="tag">宅建ニュース</span>'
            out.append(f'<li><a href="{link("news", R)}"><time>{dt}</time>{tag}<span class="t">{t}</span></a></li>')
        return "".join(out)
    first = news["oshirase"][0]
    slides = [("hero-hondoji.jpg", "本土寺", "35% 50%"), ("tojotei.jpg", "戸定邸", "50% 55%"),
              ("yagiri.jpg", "矢切の渡し", "50% 50%"), ("mori21.jpg", "21世紀の森と広場", "50% 40%")]
    lazy = ' loading="lazy"'
    hs = "".join(f'<figure class="hs{" is-active" if i == 0 else ""}" data-cap="{c}"><img src="{A}assets/img/{f}" alt="{c}" style="object-position:{p}"{"" if i == 0 else lazy}></figure>'
                 for i, (f, c, p) in enumerate(slides))
    bars = "".join("<i></i>" for _ in slides)
    dl = "".join(f'<li><a href="{link(s, R)}"><span class="num">{i:02d}</span><span><b>{n}</b><small>{st}</small></span><span class="cnt"><span data-area-count="{s[5:]}">{c}</span><em>社</em></span></a></li>'
                 for i, (s, n, st, c) in enumerate(area, 1))
    total = sum(int(c) for *_, c in area)
    # 縦書きの添え文は、重ねた小写真に触れない長さ(5文字前後)にする
    subimg = {"consult": ("hero-hondoji.jpg", "無料相談"), "area": ("tojotei.jpg", "会員を探す"),
              "nyukai": ("yagiri.jpg", "入会案内"), "license": ("mori21.jpg", "講習・試験")}
    feats = [
        ("consult", "Consultation", "yagiri.jpg", "不動産の無料相談", "売買・賃貸・契約・税金など、不動産に関するお悩みに、経験豊富な相談員が無料でお応えします。松戸市役所での相談会、弁護士による法律相談、税理士による電話相談をご用意しています。"),
        ("area", "Find a member", "mori21.jpg", "地域の不動産会社を探す", f"松戸支部の会員{total}社を、5つの地区ごとにご紹介しています。お住まいの地域から、身近な不動産会社をお探しいただけます。"),
        ("nyukai", "Membership", "tojotei.jpg", "入会のご案内", "宅建協会への入会は、社会的な信用の獲得にもつながります。入会のメリットと、手続きの流れをご案内します。"),
        ("license", "License", "hero-hondoji.jpg", "講習・試験", "宅地建物取引士の法定講習会(会場・WEB受講)と、宅地建物取引士試験についてご案内します。"),
    ]
    fhtml = "".join(f"""
      <article class="feat">
        <div class="feat-media">
          <a class="feat-img rv-img" href="{link(sl, R)}" data-cursor="VIEW"><img class="grade" src="{A}assets/img/{img}" alt="" loading="lazy"></a>
          <div class="feat-sub" data-float="12"><div class="rv-img" style="--d:.35s"><img class="grade" src="{A}assets/img/{subimg[sl][0]}" alt="" loading="lazy"></div></div>
          <p class="vt" aria-hidden="true">{subimg[sl][1]}</p>
        </div>
        <div class="feat-txt">
          <span class="feat-no num" data-rv>{i:02d}</span>
          <p class="lbl" data-rv>{en}</p>
          <h3 class="split">{ja}</h3>
          <p class="t" data-rv>{tx}</p>
          <a class="more" href="{link(sl, R)}" data-rv>View more<i></i></a>
        </div>
      </article>""" for i, (sl, en, img, ja, tx) in enumerate(feats, 1))
    subs = "".join(f'<a href="{link(sl, R)}"><span class="lbl">{en}</span><b>{titles[sl]}</b></a>'
                   for sl, en in [("kariru", "Renting"), ("kaigyo", "Start up"), ("takken", "Association"), ("shoshiki", "Documents"), ("links", "Links")])
    main = f"""<main>
<section class="hero" aria-label="メインビジュアル">
  {hs}
  <div class="hero-shade"></div>
  <span class="hero-frame" aria-hidden="true"></span>
  <p class="hero-vt" aria-hidden="true">千葉県宅地建物取引業協会 松戸支部</p>
  <div class="badge" aria-hidden="true"><svg viewBox="0 0 132 132"><defs><path id="bp" d="M66,66 m-52,0 a52,52 0 1,1 104,0 a52,52 0 1,1 -104,0"/></defs><text textLength="324" lengthAdjust="spacing"><textPath href="#bp">Matsudo Branch · Takken Chiba ·</textPath></text></svg><img src="{A}assets/img/hatomark.png" alt=""></div>
  <div class="hero-in">
    <p class="lbl c">Matsudo Branch</p>
    <h1 class="hero-catch split">人と住まいを、<br>笑顔でつなぐ。</h1>
    <p class="hero-sub">一般社団法人 千葉県宅地建物取引業協会 松戸支部</p>
  </div>
  <div class="hero-ui">
    <div><p class="hero-cap"><span class="num">01</span><span>本土寺</span></p><div class="hero-bars" aria-hidden="true">{bars}</div></div>
    <div class="hero-news"><p class="lbl">News</p><a href="{link('news', R)}" data-news-hero>{first[0]}　{first[3]}</a></div>
  </div>
  <span class="hero-scroll" aria-hidden="true"></span>
</section>

<section class="sec concept">
  <span class="concept-v" aria-hidden="true"></span>
  <p class="vt" aria-hidden="true" data-rv>住まいに、確かな安心を。</p>
  <div class="wrap">
    <div class="shd c"><p class="shd-no" data-rv>01</p><p class="shd-en split" aria-hidden="true">Concept</p></div>
    <h2 class="ttl split" style="margin-top:34px">確かな取引を、<br>この街のすみずみまで。</h2>
    <div class="concept-body">
      <p data-rv>千葉県宅地建物取引業協会は、昭和42年7月に千葉県知事の許可を得て設立された、県下宅建業界唯一の一般社団法人です。県内の不動産業者の約8割にあたる4,000社が加入しています。</p>
      <p data-rv style="--d:.15s">松戸支部は335社の会員を擁する大支部です(令和6年3月31日現在)。取引の公正と消費者の保護を大切に、地域の皆さまの住まい探しをお手伝いしています。</p>
    </div>
    <span class="gl"></span>
    <a class="lux" href="{link('about', R)}" data-rv>支部案内</a>
  </div>
  <div class="concept-pics">
    <figure class="cp-a" data-float="-8"><div class="rv-img"><img class="grade" src="{A}assets/img/hero-hondoji.jpg" alt="" loading="lazy" style="object-position:35% 50%"></div></figure>
    <figure class="cp-b" data-float="10"><div class="rv-img" style="--d:.25s"><img class="grade" src="{A}assets/img/tojotei.jpg" alt="" loading="lazy"></div></figure>
  </div>
</section>

<figure class="plate">
  <div class="plate-img rv-img"><img src="{A}assets/img/hero-matsudo.jpg" alt="松戸駅周辺の街並み" width="2400" height="848" loading="lazy"></div>
  <figcaption data-rv><span>松戸駅周辺の街並み</span><span class="credit">写真提供：松戸市</span></figcaption>
</figure>

<section class="sec">
  <div class="wrap">
    <div class="sec-hd shd c"><p class="shd-no" data-rv>02</p><p class="shd-en split" aria-hidden="true">Service</p><h2 class="shd-ja split">目的からさがす</h2></div>
    <div class="feats">{fhtml}
    </div>
    <nav class="subs" aria-label="その他のご案内" data-rv>{subs}</nav>
  </div>
</section>

<div class="flow" aria-hidden="true"><div class="flow-track">{"".join(f"<span>{w}</span>" for w in ["Matsudo", "Real Estate", "Trust", "Community", "Living"] * 2)}</div></div>

<section class="sec on-dark area-sec">
  <div class="bgimg" data-px="5"><img class="grade" src="{A}assets/img/mori21.jpg" alt="" loading="lazy"></div>
  <div class="wrap area-lay">
    <div class="area-hd">
      <div class="shd"><p class="shd-no" data-rv>03</p><p class="shd-en split" aria-hidden="true">Area</p></div>
      <h2 class="ttl split" style="margin-top:22px">お住まいの地域から、<br>探す。</h2>
      <p data-rv>松戸支部の会員{total}社を、5つの地区ごとにご紹介しています。地区を選ぶと、その地域の不動産会社の一覧が表示されます。</p>
      <a class="more" href="{link('area', R)}" data-rv>Area map<i></i></a>
    </div>
    <ol class="dlist" data-rv style="--d:.2s">{dl}</ol>
  </div>
</section>

<section class="sec">
  <div class="wrap">
    <div class="sec-hd shd c"><p class="shd-no" data-rv>04</p><p class="shd-en split" aria-hidden="true">News</p><h2 class="shd-ja split">お知らせ</h2></div>
    <div data-tabs data-rv>
      <div class="tabs" role="tablist"><button class="tab is-on" role="tab" aria-selected="true">支部からのお知らせ</button><button class="tab" role="tab" aria-selected="false">宅建ニュース</button></div>
      <div class="tabpane"><ul class="nlist" data-news="oshirase" data-limit="{len(news['oshirase'])}">{nrows(news['oshirase'])}</ul></div>
      <div class="tabpane" hidden><ul class="nlist" data-news="takken" data-limit="{len(news['takken'])}">{nrows(news['takken'])}</ul></div>
    </div>
    <p class="news-more" data-rv><a class="more" href="{link('news', R)}">View all<i></i></a></p>
  </div>
</section>

<section class="cta">
  <div class="bgimg" data-px="6"><img class="grade" src="{A}assets/img/yagiri.jpg" alt="" loading="lazy"></div>
  <div class="wrap cta-grid">
    <div class="cta-hd">
      <div class="shd"><p class="shd-no" data-rv>05</p><p class="shd-en split" aria-hidden="true">Consult</p></div>
      <h2 class="ttl split" style="margin-top:26px">不動産のこと、<br>ひとりで悩まずご相談を。</h2>
    </div>
    <div class="cta-tel" data-rv style="--d:.2s">
      <p class="lbl d">Telephone</p>
      <a class="tel" href="tel:0473646904">047-364-6904</a>
      <p>月〜金 9:00–17:00(土日・祝日休)</p>
      <a class="lux d" href="{link('consult', R)}">無料相談のご案内</a>
    </div>
    <div class="cta-times">
      <div data-rv><p class="lbl d">Every Wednesday</p><b>不動産無料相談</b><p>毎週水曜日 13:00–17:00<br>松戸市役所 本館2階 相談コーナー</p></div>
      <div data-rv style="--d:.12s"><p class="lbl d">4th Friday</p><b>不動産法律無料相談</b><p>毎月第4金曜日 15:00–17:00<br>宅建協会 松戸支部 事務局(弁護士)</p></div>
      <div data-rv style="--d:.24s"><p class="lbl d">3rd Friday</p><b>不動産税務 電話無料相談</b><p>毎月第3金曜日 12:00–15:00<br>本会顧問税理士がお電話でお応えします</p></div>
    </div>
  </div>
</section>

<section class="members">
  <div class="wrap">
    <div class="members-in" data-rv>
      <figure class="m-photo"><div class="rv-img"><img class="grade" src="{A}assets/img/mori21.jpg" alt="" loading="lazy"></div></figure>
      <div><p class="lbl">For members</p><h2>会員の方へ</h2><p>研修会の案内と出欠回答、本部からの調査依頼、各種書式のダウンロードなど、会員限定の情報をご利用いただけます。</p></div>
      <a class="lux" href="{link('kaiin/index', R)}">会員専用ページ</a>
    </div>
  </div>
</section>
</main>
"""
    page = head("トップ", R, A, desc_of(src), intro=True) + '<body class="is-home">\n' + header(R, A, "") + main + footer(R, A) + scripts(R, A, sb=True)
    write("index.html", page)


def build_simple(slug, en, A_title=None):
    src = read(f"{slug}.html")
    ja = h1_of(src) or strip_tags(re.search(r"<h1[^>]*>(.*?)</h1>", src, re.S).group(1))
    m = re.search(r"<section[^>]*>(.*?)</section>", src, re.S)
    inner_html = clean(m.group(1), 0) if m else ""
    inner_html = re.sub(r'<div class="(?:container|brand-mark)[^"]*"[^>]*>|<img[^>]*hatomark[^>]*>', "", inner_html)
    text = re.findall(r"<p[^>]*>(.*?)</p>", inner_html, re.S)
    body = "".join(f"<p>{clean(t, 0)}</p>" for t in text if strip_tags(t) != "404")
    blk = f'<section class="blk">{body}<p><a class="lux" href="index.html">トップページへ戻る</a></p></section>'
    page = (head(ja, "", "../", desc_of(src)) + f'<body class="page-{slug}">\n' + header("", "../", "")
            + "<main>\n" + page_hero(en, "Information", ja, [("ホーム", "index.html"), (ja, "")], None, "", "../")
            + f'<div class="wrap"><div class="pg no-toc"><div class="pg-body">{blk}</div></div></div>'
            + "</main>\n" + footer("", "../") + scripts("", "../"))
    write(f"{slug}.html", page)


def write_redirects(files):
    """旧URL(/sample2/...)を開いた人を、同じページの新URLへ転送する。"""
    for old in OLD_SITES:
        for f in files:
            depth = f.count("/")
            up = "../" * (depth + 1)
            target = f"{up}{SITE}/{'' if f == 'index.html' else f}"
            # トップは /sample2(スラッシュなし)でも開かれるので、どちらでも同じ場所に解決する書き方にする
            if f == "index.html":
                target = f"../{SITE}/"
            page = f"""<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="robots" content="noindex, nofollow">
<meta http-equiv="refresh" content="0; url={target}"><link rel="canonical" href="{target}">
<title>移動しました｜宅建協会 松戸支部</title>
<script>location.replace({target!r} + location.hash);</script></head>
<body><p>このページは移動しました。<a href="{target}">新しいページへ</a></p></body></html>
"""
            path = os.path.join(ROOT, old, f)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(page)


def main():
    titles = {s: h1_of(read(f"{s}.html")) for s in PAGES}
    warnings = build_pages(titles)
    build_kaiin(titles)
    build_index(titles)
    build_simple("thanks", "Thank you")
    build_simple("404", "Not found")
    files = sorted(os.path.relpath(os.path.join(dp, f), OUT) for dp, _, fs in os.walk(OUT) for f in fs if f.endswith(".html"))
    write_redirects(files)
    print(f"{len(files)} ページを生成しました")
    for w in warnings:
        print("  [要確認]", w)
    # 文節改行(<wbr>)を書き込む
    wbr = os.path.join(OUT, "tools", "add_wbr.py")
    py = os.environ.get("BUDOUX_PY", sys.executable)
    for f in files:
        r = subprocess.run([py, "-I", wbr, os.path.join(OUT, f), "--c"], capture_output=True, text=True)
        if r.returncode:
            print("  [wbr 失敗]", f, r.stderr.strip()[-200:])


if __name__ == "__main__":
    main()
