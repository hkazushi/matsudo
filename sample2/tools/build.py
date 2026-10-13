"""
デザイン案C(/sample2/)の全ページを生成する。

現行サイト(mockup/*.html, mockup/kaiin/*.html)の本文をそのまま取り込み、
案Cの枠(ヘッダー・ページ見出し・目次・関連ページ・フッター)で組み直して書き出す。
文章を手で書き写さないので、現行ページを直したら再実行するだけで反映できる。

  python3 sample2/tools/build.py            # mockup/ で実行
  python3 sample/tools/add_wbr.py ...       # 続けて文節改行を書き込む(build.py が自動で呼ぶ)

URL の注意: Vercel は /sample2(末尾スラッシュなし)をリダイレクトせずに返すため、
トップページだけは ../sample2/ を経由して参照する(R と A の接頭辞で吸収している)。
"""
import html as htmllib
import os
import re
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))   # mockup/
OUT = os.path.join(ROOT, "sample2")
VER = "9"

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
# 共通の枠
# ---------------------------------------------------------------------------
FONTS = ("https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900"
         "&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+JP:wght@400;500;700&display=swap")


def head(title, R, A, desc):
    return f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(title)}｜宅建協会 松戸支部 デザイン案C</title>
<meta name="description" content="{esc(desc)}">
<!-- デザイン検討用ページのため検索結果には出さない -->
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#F7F6F2">
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
    // スクリプトが動かなかった場合でも内容は必ず表示する
    setTimeout(function () {{ if (!d.classList.contains("ready")) d.classList.remove("anim", "pt-in"); }}, 4000);
  }})();
</script>
</head>
"""


def link(slug, R):
    return f"{R}{slug}.html"


def header(R, A, current):
    cur = ' class="is-current"'
    nav = "".join(f'<a href="{link(s, R)}"{cur if s == current else ""}>{t}</a>' for s, t in NAV)
    groups = []
    n = 0
    for en, ja, items in MENU:
        lis = []
        for s, t, e in items:
            lis.append(f'<li style="--i:{n}"><a href="{link(s, R)}">{t}<span>{e}</span></a></li>')
            n += 1
        groups.append(f'<div class="menu-group"><p class="mono">{en} — {ja}</p><ul>{"".join(lis)}</ul></div>')
    return f"""<div class="pt" aria-hidden="true"><span class="pt-mark"><img src="{A}assets/img/hatomark.png" alt=""><span>宅建協会 松戸支部</span></span></div>
<div class="cur" aria-hidden="true"><i></i><b></b></div>

<header class="hd">
  <a href="{link('index', R)}" class="hd-brand" aria-label="宅建協会 松戸支部 トップへ">
    <img src="{A}assets/img/hatomark.png" alt="" width="30" height="35">
    <span class="hd-name"><small>一般社団法人 千葉県宅地建物取引業協会</small><strong>宅建協会 松戸支部</strong></span>
  </a>
  <nav class="hd-nav" aria-label="主要メニュー">{nav}</nav>
  <div class="hd-cta">
    <a href="{link('kaiin/index', R)}" class="hd-member">会員専用</a>
    <a href="{link('contact', R)}" class="hd-contact">お問い合わせ</a>
  </div>
  <button class="hd-menu" type="button" aria-expanded="false" aria-controls="menu"><span class="en">Menu</span><i></i></button>
</header>

<div class="menu" id="menu" aria-hidden="true" data-lenis-prevent>
  <div class="menu-in">
    <div class="menu-side">
      <figure class="menu-photo"><img src="{A}assets/img/yagiri.jpg" alt="" loading="lazy"></figure>
      <div class="menu-tel">
        <p class="mono">Contact</p>
        <a href="tel:0473646904">047-364-6904</a>
        <p>月〜金 9:00–17:00(土日・祝日休)<br>〒271-0064 千葉県松戸市上本郷3185</p>
      </div>
    </div>
    <div class="menu-groups">{"".join(groups)}</div>
  </div>
</div>
"""


def footer(R, A):
    cols = []
    for en, ja, items in MENU:
        lis = "".join(f'<li><a href="{link(s, R)}">{t}</a></li>' for s, t, _ in items)
        cols.append(f'<div><p class="mono">{en}</p><ul>{lis}</ul></div>')
    return f"""<footer class="ft">
  <div class="wrap">
    <div class="ft-top">
      <div class="ft-brand">
        <a href="{link('index', R)}"><img src="{A}assets/img/hatomark.png" alt="" width="40" height="47"><span><small>一般社団法人 千葉県宅地建物取引業協会</small><strong>宅建協会 松戸支部</strong></span></a>
        <p class="ft-addr">〒271-0064 千葉県松戸市上本郷3185<br>JR常磐線 北松戸駅 徒歩約8分<a class="num" href="tel:0473646904">047-364-6904</a>FAX 047-363-3142 ／ 月〜金 9:00–17:00(土日・祝日休)</p>
      </div>
      <nav class="ft-nav" aria-label="フッターメニュー">{"".join(cols)}</nav>
    </div>
    <p class="ft-word" aria-hidden="true">Takken Matsudo</p>
    <div class="ft-bottom">
      <p>© 2026 (一社)千葉県宅地建物取引業協会 松戸支部</p>
      <p>このサイトはデザイン案Cです(機能は動作しません)。 <a href="{A}index.html">現行デザイン</a> ／ <a href="{A}sample/">デザイン案B</a></p>
    </div>
  </div>
</footer>
"""


def scripts(R):
    return f"""<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js"></script>
<script src="{R}assets/c.js?v={VER}"></script>
</body>
</html>
"""


def page_hero(en, cat, ja, crumbs, photo, pos, A):
    cr = ['<a href="{}">ホーム</a>'.format(crumbs[0][1])]
    for t, href in crumbs[1:]:
        cr.append('<span aria-hidden="true">/</span>')
        cr.append(f'<a href="{href}">{t}</a>' if href else f'<span aria-current="page">{t}</span>')
    fig = ""
    if photo:
        fig = f'<figure class="ph-photo" data-px><img src="{A}assets/img/{photo}" alt="" style="object-position:{pos}"></figure>'
    else:
        fig = '<div class="wrap"><div class="ph-rule"></div></div>'
    return f"""<section class="ph">
  <div class="wrap">
    <div class="ph-head">
      <p class="ph-cat mono">{cat}</p>
      <p class="ph-en" aria-hidden="true">{esc(en)}</p>
      <h1 class="ph-ja">{ja}</h1>
      <nav class="crumbs" aria-label="現在地">{"".join(cr)}</nav>
    </div>
  </div>
  {fig}
</section>
"""


def body_with_toc(blocks):
    """content-block を番号付きの章にし、2章以上あれば左に目次を付ける。"""
    secs, toc = [], []
    for i, b in enumerate(blocks, 1):
        sid = f"s{i:02d}"
        m = re.search(r"<h2[^>]*>(.*?)</h2>", b, re.S)
        title = strip_tags(m.group(1)) if m else ""
        num = f'<p class="blk-num">{i:02d}</p>' if m else ""
        secs.append(f'<section class="blk" id="{sid}" data-rv>{num}{b}</section>')
        if title:
            toc.append(f'<li><a href="#{sid}"><span>{i:02d}</span>{esc(title)}</a></li>')
    if len(toc) >= 2:
        side = f'<aside class="pg-toc" aria-label="このページの目次"><div class="pg-toc-in"><p class="mono">Contents</p><ol>{"".join(toc)}</ol></div></aside>'
        return f'<div class="wrap"><div class="pg">{side}<div class="pg-body">{"".join(secs)}</div></div></div>'
    return f'<div class="wrap"><div class="pg no-toc"><div class="pg-body">{"".join(secs)}</div></div></div>'


def tile(slug, R, A, title, i=0, no=1):
    en, txt, img = TILE[slug]
    return (f'<a class="tile" href="{link(slug, R)}" data-cursor="View" data-rv style="--d:{i * 0.08}s">'
            f'<img src="{A}assets/img/{img}" alt="" loading="lazy">'
            f'<div class="tile-in"><p class="tile-no mono">{no:02d}</p><p class="tile-en">{en}</p>'
            f'<p class="tile-ja">{title}</p><p class="tile-txt">{txt}</p><span class="tile-arrow" aria-hidden="true"></span></div></a>')


def next_pages(slugs, R, A, titles):
    tiles = "".join(tile(s, R, A, titles.get(s, s), i, i + 1) for i, s in enumerate(slugs) if s in TILE)
    if not tiles:
        return ""
    return f'<div class="wrap"><section class="next"><p class="next-head mono">Related pages</p><div class="next-grid">{tiles}</div></section></div>'


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
            blocks = [area_detail(b) for b in blocks]
        if slug == "contact":
            blocks = [demo_form(b) for b in blocks]
        crumbs = [("ホーム", "index.html")]
        if slug.startswith("area-"):
            crumbs.append(("会員一覧", "area.html"))
        crumbs.append((ja, ""))
        page = (head(ja, "", "../", desc_of(src)) + f'<body class="page-{slug}">\n' + header("", "../", NAV_OF.get(slug, slug if not slug.startswith("area-") else "area"))
                + "<main>\n" + page_hero(en, cat, ja, crumbs, photo, pos, "../") + body_with_toc(blocks)
                + next_pages(rel, "", "../", titles) + "</main>\n" + footer("", "../") + scripts(""))
        write(f"{slug}.html", page)
    return warnings


def area_detail(b):
    """会員一覧の表の前に絞り込み欄を置く(表示上の機能のみ)。"""
    return b.replace('<div class="table-scroll">',
                     '<div class="mt-filter"><input type="search" placeholder="会社名・代表者・住所で絞り込む" aria-label="会員の絞り込み"><output></output></div>\n<div class="table-scroll">', 1)


def demo_form(b):
    """お問い合わせフォームは送信先を外し、見た目だけにする。"""
    if "<form" not in b:
        return b
    b = re.sub(r"<form[^>]*>", '<form class="demo" onsubmit="return false">', b, count=1)
    b = re.sub(r'<input type="(hidden|text)" name="_[^"]*"[^>]*>\s*', "", b)
    b = re.sub(r'(<(?:input|select|textarea|button)[^>]*?)\s+style="[^"]*"', r"\1", b)
    b = re.sub(r'<span style="color:var\(--red\);font-size:11px;">必須</span>', '<span class="req">必須</span>', b)
    b = b.replace("</form>", '<span class="demo-note">※デザイン案のため、送信は行われません。</span></form>')
    return b


# ---------------------------------------------------------------------------
# 会員専用(デザインのみ)
# ---------------------------------------------------------------------------
def kaiin_frame(slug, body, titles, wrapped=False):
    en, cat, photo, pos = KAIIN[slug]
    src = read(f"{slug}.html")
    ja = h1_of(src)
    crumbs = [("ホーム", "../index.html")]
    if slug != "kaiin/index":
        crumbs.append(("会員専用", "index.html"))
    crumbs.append((ja, ""))
    demo = ('<div class="demo-bar"><span class="mono">Design only</span>'
            '会員専用エリアの画面デザインです。パスワード入力・資料のダウンロード・フォームの発行などの機能は持たせていません。</div>')
    return (head(ja, "../", "../../", desc_of(src)) + f'<body class="page-{slug.replace("/", "-")}">\n' + header("../", "../../", "")
            + "<main>\n" + page_hero(en, cat, ja, crumbs, photo, pos, "../../")
            + (f'<div class="wrap"><div class="pg no-toc"><div class="pg-body">{demo}</div></div></div>{body}' if wrapped
               else f'<div class="wrap"><div class="pg no-toc"><div class="pg-body">{demo}{body}</div></div></div>')
            + "</main>\n" + footer("../", "../../") + scripts("../"))


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
        cards.append(f'<a class="entrance" href="{href}" data-cursor="Enter" data-rv><img src="../../assets/img/{img}" alt="" loading="lazy">'
                     f'<p class="mono">{label}</p><h2>{h2}</h2><p>{p}</p><span class="cbtn cbtn-light">入室する</span></a>')
    alert = re.search(r'<div class="alert warn"[^>]*>(.*?)</div>', src, re.S)
    note = ""
    if alert:
        a = clean(alert.group(1), 1)
        a = re.sub(r'<br>\s*<span[^>]*>※モック版.*?</span>', "", a, flags=re.S)
        a = re.sub(r'\s*style="[^"]*"', "", a)
        note = f'<div class="alert warn" data-rv>{a}</div>'
    body = (f'<section class="blk" data-rv><h2>入り口を選んでください</h2><p>{desc}</p></section>'
            f'<div class="entrances">{"".join(cards)}</div>{note}')
    write("kaiin/index.html", kaiin_frame("kaiin/index", body, titles))

    # 一般会員・幹事委員会(鍵の画面を外し、フォルダを直接表示)
    for slug in ("kaiin/ippan", "kaiin/kanji"):
        src = read(f"{slug}.html")
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
        tpls = "".join(clean(t, 1) for t in re.findall(r'<template id="room-[^"]+">.*?</template>', src, re.S))
        modal = ('<div class="cm" role="dialog" aria-modal="true" aria-label="フォルダの中身"><div class="cm-panel">'
                 '<div class="cm-top"><h3></h3><button class="cm-close" type="button">Close</button></div>'
                 '<div class="cm-body"></div></div></div>')
        write(f"{slug}.html", kaiin_frame(slug, gated + tpls + modal, titles))

    # 事務局の管理画面(ログイン後の画面を見本として表示)
    src = read("kaiin/upload.html")
    a = re.search(r'<div id="admin-box"[^>]*>', src)
    box = inner(src[a.start():match_div(src, a.start())])
    box = clean(box, 1)
    blocks, _ = blocks_of(box)
    opts = "".join(f'<option>{esc(t)}</option>' for _, t in ROOMS)
    sample_files = ('<li><span class="f-type pdf">PDF</span><div>令和8年度 総会資料.pdf</div><span class="f-meta">2026.06.01 ／ 1.2 MB</span><a class="dl" href="#">確認</a><a class="dl" href="#">削除</a></li>'
                    '<li><span class="f-type xlsx">XLSX</span><div>会員名簿(更新用).xlsx</div><span class="f-meta">2026.05.20 ／ 48 KB</span><a class="dl" href="#">確認</a><a class="dl" href="#">削除</a></li>')
    sample_forms = ('<li><span class="f-type link">FORM</span><div><strong>宅建業法改正セミナー(8月開催)</strong><br><span class="note">① 研修会・勉強会</span></div>'
                    '<a class="dl" href="#">フォーム</a><a class="dl" href="#">集計</a><a class="dl" href="#">リンクをコピー</a></li>')
    news = re.findall(r'<li><a href="news\.html"><span class="date">([^<]*)</span>(?:<span class="chip [a-z]+">([^<]*)</span>)?<span class="ttl">([^<]*)</span>', read("index.html"))
    sample_news = "".join(f'<li><span class="f-type link">{esc(c or "記事")}</span><div>{esc(t)}<br><span class="note">{esc(dt)}</span></div><a class="dl" href="#">削除</a></li>' for dt, c, t in news[:3])
    fixed = []
    for b in blocks:
        b = re.sub(r'(<(?:input|select|textarea|button|ul|p|table|div)[^>]*?)\s+style="[^"]*"', r"\1", b)
        b = re.sub(r'(<select id="(?:room-select|form-room)"[^>]*>)</select>', r"\1" + opts + "</select>", b)
        b = re.sub(r'<ul id="file-list" class="file-list"></ul>', f'<ul class="file-list">{sample_files}</ul>', b)
        b = re.sub(r'<ul id="form-list" class="file-list"></ul>', f'<ul class="file-list">{sample_forms}</ul>', b)
        b = re.sub(r'<ul id="news-list-oshirase" class="file-list"></ul>', f'<ul class="file-list">{sample_news}</ul>', b)
        b = re.sub(r'<ul id="news-list-takken" class="file-list"></ul>', '<ul class="file-list"><li class="note">(表示例は省略)</li></ul>', b)
        b = re.sub(r'<button id="logout-btn"[^>]*>.*?</button>', "", b, flags=re.S)
        fixed.append(f'<form class="adm-form" onsubmit="return false">{b}</form>')
    body = '<div class="adm">' + body_with_toc(fixed) + "</div>"
    write("kaiin/upload.html", kaiin_frame("kaiin/upload", body, titles, wrapped=True))


# ---------------------------------------------------------------------------
# トップ・完了・404
# ---------------------------------------------------------------------------
def build_index(titles):
    R, A = "../sample2/", "../"
    src = read("index.html")
    news = {}
    for key in ("oshirase", "takken"):
        ul = re.search(rf'<ul class="news-list" id="news-home-{key}">(.*?)</ul>', src, re.S).group(1)
        news[key] = re.findall(r'<span class="date">([^<]*)</span>(?:<span class="chip ([a-z]+)">([^<]*)</span>)?<span class="ttl">([^<]*)</span>', ul)
    area = re.findall(r'<a href="(area-[a-z]+)\.html" class="area-card">.*?<h3>(.*?)</h3><p>(.*?)<br><strong>(\d+)社</strong>', read("area.html"), re.S)

    def nrows(items):
        out = []
        for dt, color, chip, t in items:
            tag = f'<span class="tag{" tag-hot" if color == "red" else ""}">{chip}</span>' if chip else '<span class="tag">宅建ニュース</span>'
            out.append(f'<li><a href="{link("news", R)}"><time>{dt}</time>{tag}<span class="t">{t}</span></a></li>')
        return "".join(out)
    first = news["oshirase"][0]
    slides = [("hero-hondoji.jpg", "本土寺", "35% 50%"), ("yagiri.jpg", "矢切の渡し", "50% 50%"),
              ("tojotei.jpg", "戸定邸", "50% 55%"), ("mori21.jpg", "21世紀の森と広場", "50% 40%")]
    lazy = ' loading="lazy"'
    hs = "".join(f'<figure class="hs{" is-active" if i == 0 else ""}" data-cap="{c}"><img src="{A}assets/img/{f}" alt="{c}" style="object-position:{p}"{"" if i == 0 else lazy}></figure>'
                 for i, (f, c, p) in enumerate(slides))
    bars = "".join("<i></i>" for _ in slides)
    dl = "".join(f'<li><a href="{link(s, R)}"><span class="mono">{i:02d}</span><span><b>{n}</b><small>{st}</small></span><span class="num">{c}<em>社</em></span></a></li>'
                 for i, (s, n, st, c) in enumerate(area, 1))
    total = sum(int(c) for *_, c in area)
    main = f"""<main>
<section class="hero" aria-label="メインビジュアル">
  <div class="hero-slides">{hs}</div>
  <div class="hero-shade"></div>
  <div class="hero-in">
    <p class="hero-label mono">Chiba Real Estate Transaction Association — Matsudo Branch</p>
    <h1 class="hero-copy" aria-label="人と住まいを、笑顔でつなぐ。"><span class="ln" aria-hidden="true"><span style="--i:0">人と住まいを、</span></span><span class="ln" aria-hidden="true"><span style="--i:1">笑顔でつなぐ。</span></span></h1>
    <p class="hero-lead">松戸市を中心とした地域の住まい探し・不動産取引を、経験豊富な会員企業がお手伝いします。</p>
  </div>
  <div class="hero-foot">
    <a class="hero-news" href="{link('news', R)}"><span class="mono">News</span><time>{first[0]}</time><span>{first[3]}</span></a>
    <div class="hero-slide-ui"><p class="hero-cap"><span class="mono">01 / 04</span><span>本土寺</span></p><div class="hero-bars" aria-hidden="true">{bars}</div></div>
  </div>
  <p class="hero-scroll mono" aria-hidden="true">Scroll<i></i></p>
</section>

<section class="sec intro">
  <div class="wrap">
    <p class="sec-label mono" data-rv>About us</p>
    <div class="intro-grid">
      <h2 class="intro-title" data-rv>安心できる不動産取引を、<br class="pc">この街の<em>すみずみ</em>まで。</h2>
      <div class="intro-body" data-rv style="--d:.12s">
        <p>千葉県宅地建物取引業協会は、昭和42年7月に千葉県知事の許可を得て設立された、県下宅建業界唯一の一般社団法人です。県内の不動産業者の約8割にあたる4,000社が加入しています。</p>
        <p>松戸支部は335社の会員を擁する大支部です(令和6年3月31日現在)。取引の公正と消費者の保護を大切に、地域の住まい探しをお手伝いしています。</p>
        <a class="cbtn" href="{link('about', R)}">支部案内を見る</a>
      </div>
    </div>
  </div>
  <figure class="plate" data-rv="img">
    <div class="plate-img"><img src="{A}assets/img/hero-matsudo.jpg" alt="松戸駅周辺の街並み" width="2400" height="848" loading="lazy"></div>
    <figcaption class="plate-cap"><span><span class="mono">Matsudo</span>松戸駅周辺の街並み</span><span class="credit">写真提供：松戸市</span></figcaption>
  </figure>
</section>

<section class="sec service">
  <div class="wrap">
    <div class="sec-head-row">
      <div><p class="sec-label mono" data-rv>Service</p><p class="sec-en" data-rv>Guide</p><h2 class="sec-ja" data-rv>目的からさがす</h2></div>
    </div>
    <div class="tiles">
      {tile('consult', R, A, titles['consult'], 0, 1)}
      {tile('area', R, A, titles['area'], 1, 2)}
      {tile('nyukai', R, A, titles['nyukai'], 2, 3)}
      {tile('license', R, A, titles['license'], 0, 4)}
    </div>
    <nav class="sublinks" aria-label="その他のご案内">
      <a href="{link('kariru', R)}"><span class="mono">Renting</span>{titles['kariru']}</a>
      <a href="{link('kaigyo', R)}"><span class="mono">Start up</span>{titles['kaigyo']}</a>
      <a href="{link('takken', R)}"><span class="mono">Association</span>{titles['takken']}</a>
      <a href="{link('shoshiki', R)}"><span class="mono">Documents</span>{titles['shoshiki']}</a>
      <a href="{link('links', R)}"><span class="mono">Links</span>{titles['links']}</a>
    </nav>
  </div>
</section>

<section class="area-sec">
  <div class="wrap area-grid2">
    <div class="area-head">
      <p class="sec-label mono" data-rv>Find a member</p>
      <p class="sec-en" data-rv>Area</p>
      <h2 class="sec-ja" data-rv>お住まいの地域から探す</h2>
      <p class="desc" data-rv>松戸支部の会員{total}社を、5つの地区ごとにご紹介しています。地区を選ぶと、その地域の不動産会社の一覧が表示されます。</p>
      <a class="tlink" href="{link('area', R)}" data-rv>エリアマップを見る</a>
    </div>
    <ol class="dlist" data-rv style="--d:.1s">{dl}</ol>
  </div>
</section>

<section class="sec news-sec">
  <div class="wrap">
    <div class="sec-head-row">
      <div><p class="sec-label mono" data-rv>Information</p><p class="sec-en" data-rv>News</p></div>
      <a class="tlink" href="{link('news', R)}" data-rv>一覧を見る</a>
    </div>
    <div data-tabs data-rv>
      <div class="tabs" role="tablist"><button class="tab is-on" role="tab" aria-selected="true">支部からのお知らせ</button><button class="tab" role="tab" aria-selected="false">宅建ニュース</button></div>
      <div class="tabpane"><ul class="nlist">{nrows(news['oshirase'])}</ul></div>
      <div class="tabpane" hidden><ul class="nlist">{nrows(news['takken'])}</ul></div>
    </div>
  </div>
</section>

<section class="cta">
  <div class="wrap cta-grid">
    <div class="cta-head">
      <p class="sec-label mono" data-rv>Free consultation</p>
      <p class="sec-en" data-rv>Consult</p>
      <h2 class="sec-ja" data-rv>不動産のこと、ひとりで悩まずご相談ください。</h2>
    </div>
    <div class="cta-tel" data-rv>
      <p class="mono">Telephone</p>
      <a class="num" href="tel:0473646904">047-364-6904</a>
      <p>月〜金 9:00–17:00(土日・祝日休)</p>
      <a class="cbtn cbtn-light" href="{link('consult', R)}">無料相談のご案内</a>
    </div>
    <div class="cta-times">
      <div data-rv><p class="mono">Every Wednesday</p><b>不動産無料相談</b><p>毎週水曜日 13:00–17:00<br>松戸市役所 本館2階 相談コーナー</p></div>
      <div data-rv style="--d:.08s"><p class="mono">4th Friday</p><b>不動産法律無料相談</b><p>毎月第4金曜日 15:00–17:00<br>宅建協会 松戸支部 事務局(弁護士)</p></div>
      <div data-rv style="--d:.16s"><p class="mono">3rd Friday</p><b>不動産税務 電話無料相談</b><p>毎月第3金曜日 12:00–15:00<br>本会顧問税理士がお電話でお応えします</p></div>
    </div>
  </div>
</section>

<section class="members">
  <div class="wrap">
    <div class="members-in" data-rv>
      <p class="sec-label mono">For members</p>
      <h2>会員の方へ<small>研修会の案内と出欠回答、本部からの調査依頼、各種書式のダウンロードなど、会員限定の情報をご利用いただけます。</small></h2>
      <a class="cbtn" href="{link('kaiin/index', R)}">会員専用ページへ</a>
    </div>
  </div>
</section>
</main>
"""
    page = head("トップ", R, A, desc_of(src)) + '<body class="is-home">\n' + header(R, A, "") + main + footer(R, A) + scripts(R)
    write("index.html", page)


def build_simple(slug, en, A_title=None):
    src = read(f"{slug}.html")
    ja = h1_of(src) or strip_tags(re.search(r"<h1[^>]*>(.*?)</h1>", src, re.S).group(1))
    m = re.search(r"<section[^>]*>(.*?)</section>", src, re.S)
    inner_html = clean(m.group(1), 0) if m else ""
    inner_html = re.sub(r'<div class="(?:container|brand-mark)[^"]*"[^>]*>|<img[^>]*hatomark[^>]*>', "", inner_html)
    text = re.findall(r"<p[^>]*>(.*?)</p>", inner_html, re.S)
    body = "".join(f"<p>{clean(t, 0)}</p>" for t in text if strip_tags(t) != "404")
    blk = f'<section class="blk" data-rv>{body}<a class="cbtn" href="index.html">トップページへ戻る</a></section>'
    page = (head(ja, "", "../", desc_of(src)) + f'<body class="page-{slug}">\n' + header("", "../", "")
            + "<main>\n" + page_hero(en, "Information", ja, [("ホーム", "index.html"), (ja, "")], None, "", "../")
            + f'<div class="wrap"><div class="pg no-toc"><div class="pg-body">{blk}</div></div></div>'
            + "</main>\n" + footer("", "../") + scripts(""))
    write(f"{slug}.html", page)


def main():
    titles = {s: h1_of(read(f"{s}.html")) for s in PAGES}
    warnings = build_pages(titles)
    build_kaiin(titles)
    build_index(titles)
    build_simple("thanks", "Thank you")
    build_simple("404", "Not found")
    files = sorted(os.path.relpath(os.path.join(dp, f), OUT) for dp, _, fs in os.walk(OUT) for f in fs if f.endswith(".html"))
    print(f"{len(files)} ページを生成しました")
    for w in warnings:
        print("  [要確認]", w)
    # 文節改行(<wbr>)を書き込む
    wbr = os.path.join(ROOT, "sample", "tools", "add_wbr.py")
    py = os.environ.get("BUDOUX_PY", sys.executable)
    for f in files:
        r = subprocess.run([py, "-I", wbr, os.path.join(OUT, f), "--c"], capture_output=True, text=True)
        if r.returncode:
            print("  [wbr 失敗]", f, r.stderr.strip()[-200:])


if __name__ == "__main__":
    main()
