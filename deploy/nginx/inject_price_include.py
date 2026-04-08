#!/usr/bin/env python3
"""
Insert `include /etc/nginx/conf.d/price-app-paths.inc;` right after the
server_name directive that lists the given domain (handles multi-line server_name).
"""
from __future__ import annotations

import re
import sys

INC_LINE = "    include /etc/nginx/conf.d/price-app-paths.inc;\n"


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: inject_price_include.py <nginx.conf> <domain>", file=sys.stderr)
        return 2
    path, domain = sys.argv[1], sys.argv[2]
    try:
        text = open(path, encoding="utf-8", errors="replace").read()
    except OSError as e:
        print(e, file=sys.stderr)
        return 1
    if "price-app-paths.inc" in text:
        print(f"Skip (already has include): {path}", file=sys.stderr)
        return 0
    if "server" not in text.lower() or domain not in text:
        return 1
    esc = re.escape(domain)
    # One line: server_name foo bar domain ... ;
    pat1 = re.compile(rf"(server_name\s[^;]*\b{esc}\b[^;]*;)", re.MULTILINE | re.IGNORECASE)
    m = pat1.search(text)
    if m:
        pos = m.end()
        out = text[:pos] + "\n" + INC_LINE + text[pos:]
        open(path, "w", encoding="utf-8").write(out)
        print(f"Injected (server_name one line): {path}", file=sys.stderr)
        return 0
    # Multi-line: server_name \n    domain;
    pat2 = re.compile(rf"(server_name\s*\n\s*{esc}\s*;)", re.MULTILINE | re.IGNORECASE)
    m = pat2.search(text)
    if m:
        pos = m.end()
        out = text[:pos] + "\n" + INC_LINE + text[pos:]
        open(path, "w", encoding="utf-8").write(out)
        print(f"Injected (server_name multi-line): {path}", file=sys.stderr)
        return 0
    print(f"No server_name match for domain in {path}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
