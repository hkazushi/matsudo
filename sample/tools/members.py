"""
エリアページ(area-*.html)の会員一覧を読み取り、Supabase の members テーブルへ入れる SQL を書き出す。

  python3 sample/tools/members.py        # mockup/ で実行 → supabase/members_seed.sql

表の1行 = 1社。取り出した値から live.js と同じ形の行を組み立て直し、
元の HTML と完全に一致することを確かめてから書き出す(欠落・崩れの検出)。
初回の投入用。投入後の編集は事務局の管理ページで行う。
"""
import html as htmllib
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
AREAS = ["matsudo", "kitamatsudo", "kogane", "keisei", "tokiwadaira"]


def text(s):
    return htmllib.unescape(s)


def parse_row(tr):
    tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
    assert len(tds) == 6, tr
    name, rep, addr, telcell, hourcell, biz = tds
    parts = telcell.split("<br>")
    tel = parts[0]
    fax = email = ""
    for p in parts[1:]:
        m = re.fullmatch(r'<span class="note">(.*)</span>', p)
        assert m, p
        v = m.group(1)
        if v.startswith("FAX ") and not fax:
            fax = v[4:]
        else:
            assert not email, telcell
            email = v
    parts = hourcell.split("<br>")
    hours = parts[0]
    holiday = ""
    if len(parts) > 1:
        assert len(parts) == 2, hourcell
        m = re.fullmatch(r'<span class="note">定休: (.*)</span>', parts[1])
        assert m, hourcell
        holiday = m.group(1)
    return {k: text(v) for k, v in dict(name=name, rep=rep, address=addr, tel=tel, fax=fax, email=email,
                                         hours=hours, holiday=holiday, business=biz).items()}


def esc(s):
    return htmllib.escape(s, quote=False)


def render_row(m):
    """live.js の rowHtml と同じ組み立て。"""
    tel = esc(m["tel"])
    if m["fax"]:
        tel += f'<br><span class="note">FAX {esc(m["fax"])}</span>'
    if m["email"]:
        tel += f'<br><span class="note">{esc(m["email"])}</span>'
    hours = esc(m["hours"])
    if m["holiday"]:
        hours += f'<br><span class="note">定休: {esc(m["holiday"])}</span>'
    return (f'<tr><td class="mt-name">{esc(m["name"])}</td><td>{esc(m["rep"])}</td><td>{esc(m["address"])}</td>'
            f'<td>{tel}</td><td>{hours}</td><td>{esc(m["business"])}</td></tr>')


def sql_str(s):
    return "'" + s.replace("'", "''") + "'"


def main():
    rows, bad = [], 0
    for area in AREAS:
        src = open(os.path.join(ROOT, f"area-{area}.html"), encoding="utf-8").read()
        tbody = re.search(r'<table class="member-table">.*?<tbody>(.*?)</tbody>', src, re.S).group(1)
        for i, tr in enumerate(re.findall(r"<tr>.*?</tr>", tbody, re.S)):
            m = parse_row(tr)
            if render_row(m) != tr:
                bad += 1
                print("[不一致]", area, i, "\n  元:", tr, "\n  再:", render_row(m))
            rows.append((area, (i + 1) * 10, m))
    if bad:
        sys.exit(f"{bad} 行が元の表と一致しません")
    cols = ["area", "sort", "name", "rep", "address", "tel", "fax", "email", "hours", "holiday", "business"]
    out = ["-- 会員名簿の初回投入(sample/tools/members.py で生成)。setup.sql の後に1回だけ実行する",
           "-- すでに投入済みなら何もしない",
           "insert into public.members (" + ", ".join(cols) + ")",
           "select * from (values"]
    vals = [f"  ({sql_str(a)}, {s}, " + ", ".join(sql_str(m[c]) for c in cols[2:]) + ")" for a, s, m in rows]
    out.append(",\n".join(vals))
    out.append(") as v(" + ", ".join(cols) + ")")
    out.append("where not exists (select 1 from public.members);")
    path = os.path.join(ROOT, "supabase", "members_seed.sql")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out) + "\n")
    print(f"{len(rows)} 社を {os.path.relpath(path, ROOT)} に書き出しました(元の表との一致を確認済み)")


if __name__ == "__main__":
    main()
