"""
デザイン案B: 日本語の文章に文節単位の改行位置(<wbr>)を書き込む。

背景:
  CSS の word-break: auto-phrase は iPhone の Safari が未対応のため、
  スマホで「不動/産」「お手伝いし/ます」のように単語の途中で改行されてしまう。
  Google の BudouX で文節を判定して <wbr> を入れ、要素に .bx
  (word-break: keep-all) を付けると、どのブラウザでも文節の切れ目でだけ改行される。

  HTML パーサーで読み直して書き出すと、属性の並びやインデントまで変わって
  しまうため、元の文字列のうち「対象要素の中の文章」だけを差し替える。

使い方(文章を書き換えたら再実行する。何度実行しても結果は同じ):
  pip install budoux
  python sample-b/tools/add_wbr.py sample-b/index.html          # 案B(クラス指定)
  python sample/tools/add_wbr.py sample/about.html --c            # 案C: 本文系のタグ全体を対象にする
"""
import re
import sys

import budoux

# class 名で直接指定する要素
TARGET_CLASSES = {"hero-lead", "sec-desc", "svc-txt", "n-ttl"}
# (祖先の class, 対象タグ): その祖先の中にある該当タグを対象にする
PARENT_RULES = {
    ("about-body", "p"), ("c-body", "p"), ("c-spec", "small"),
    ("town-item", "p"), ("contact-tel", "p"), ("contact-side", "p"),
    ("ft-note", "p"), ("menu-side", "p"),
}
# 案C(--c): 現行ページから移した本文はクラスが一定しないため、文章を持つタグで指定する
TARGET_TAGS_C = {"p", "li", "td", "th", "dd", "dt", "h1", "h2", "h3", "h4", "small", "figcaption", "label"}
VOID = {"br", "img", "wbr", "meta", "link", "input", "hr", "source"}
RAW = {"script", "style", "title", "select", "option", "textarea"}   # 中身に <wbr> を入れてはいけない要素

parser = budoux.load_default_japanese_parser()
TOKEN = re.compile(r"<!--.*?-->|<[^>]+>|[^<]+", re.S)
TAG = re.compile(r"<\s*(/?)\s*([a-zA-Z0-9]+)([^>]*)>", re.S)
CLASS_ATTR = re.compile(r'class="([^"]*)"')


def classes_of(attrs):
    m = CLASS_ATTR.search(attrs)
    return set(m.group(1).split()) if m else set()


def add_bx(tag_text):
    m = CLASS_ATTR.search(tag_text)
    if m:
        if "bx" in m.group(1).split():
            return tag_text
        return tag_text[:m.end(1)] + " bx" + tag_text[m.end(1):]
    return re.sub(r"\s*(/?)>$", r' class="bx"\1>', tag_text, count=1)


def phrase(text):
    if not text.strip():
        return text
    lead = text[: len(text) - len(text.lstrip())]
    trail = text[len(text.rstrip()):]
    return lead + "<wbr>".join(parser.parse(text.strip())) + trail


def main(path, tag_mode=False):
    src = open(path, encoding="utf-8").read()
    out, stack, buf = [], [], []   # stack: [(tag, classes, is_target)]
    raw_until = None
    applied = 0

    def in_target():
        return any(t for _, _, t in stack)

    def flush():
        if buf:
            out.append(phrase("".join(buf)))
            buf.clear()

    for tok in TOKEN.findall(src):
        if raw_until:
            out.append(tok)
            if tok.lower().startswith("</" + raw_until):
                raw_until = None
            continue
        if not tok.startswith("<"):
            (buf if in_target() else out).append(tok)
            continue
        m = TAG.match(tok)
        if not m or tok.startswith("<!"):
            flush(); out.append(tok); continue
        closing, name = m.group(1) == "/", m.group(2).lower()
        if name == "wbr" and in_target():
            continue                      # 既存の <wbr> は捨てて作り直す
        flush()
        if closing:
            # 対応する開始タグまで戻す(多少崩れたHTMLでも止まらないように)
            for i in range(len(stack) - 1, -1, -1):
                if stack[i][0] == name:
                    del stack[i:]
                    break
            out.append(tok)
            continue
        cls = classes_of(m.group(3))
        ancestors = set().union(*(c for _, c, _ in stack))
        if tag_mode:
            target = name in TARGET_TAGS_C and "ph-en" not in cls
        else:
            target = bool(cls & TARGET_CLASSES) or any(
                tag == name and anc in ancestors for anc, tag in PARENT_RULES
            )
        if target and not in_target():
            tok = add_bx(tok)
            applied += 1
        out.append(tok)
        if name in RAW:
            raw_until = name
        elif name not in VOID and not tok.endswith("/>"):
            stack.append((name, cls, target))
    flush()
    open(path, "w", encoding="utf-8").write("".join(out))
    print(f"{applied} 要素に文節改行を適用しました: {path}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    main(args[0] if args else "sample-b/index.html", tag_mode="--c" in sys.argv)
