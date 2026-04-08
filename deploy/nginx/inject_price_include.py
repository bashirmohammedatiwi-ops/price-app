#!/usr/bin/env python3
"""
Insert `include /etc/nginx/conf.d/price-app-paths.inc;` inside the right server { } block.

Many proxies use env/templated server_name (${DOMAIN}) while the real hostname only appears in
ssl_certificate paths — we inject after server_name (literal), else after ssl lines, else after listen 443.
"""
from __future__ import annotations

import re
import sys

INC_LINE = "    include /etc/nginx/conf.d/price-app-paths.inc;\n"


def extract_server_blocks(text: str) -> list[tuple[int, int, str]]:
    blocks: list[tuple[int, int, str]] = []
    i = 0
    while i < len(text):
        m = re.search(r"\bserver\s*\{", text[i:], re.IGNORECASE)
        if not m:
            break
        start = i + m.start()
        depth = 0
        k = start + m.group().find("{")
        for j in range(k, len(text)):
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
                if depth == 0:
                    end = j + 1
                    blocks.append((start, end, text[start:end]))
                    i = end
                    break
        else:
            break
    return blocks


def score_block(block: str) -> int:
    b = block.lower()
    s = 0
    if re.search(r"listen\s+[^;]*443", b):
        s += 10
    if "ssl_certificate" in b:
        s += 5
    if "ssl" in b:
        s += 2
    if "http2" in b:
        s += 1
    return s


def inject_after_server_name(block: str, domain: str) -> str | None:
    esc = re.escape(domain)
    pat1 = re.compile(rf"(server_name\s[^;]*\b{esc}\b[^;]*;)", re.MULTILINE | re.IGNORECASE)
    m = pat1.search(block)
    if m:
        pos = m.end()
        return block[:pos] + "\n" + INC_LINE + block[pos:]
    pat2 = re.compile(rf"(server_name\s*\n\s*{esc}\s*;)", re.MULTILINE | re.IGNORECASE)
    m = pat2.search(block)
    if m:
        pos = m.end()
        return block[:pos] + "\n" + INC_LINE + block[pos:]
    return None


def inject_after_tls_or_listen(block: str, domain: str) -> str | None:
    """When server_name uses $DOMAIN or _, cert paths still contain the real hostname."""
    esc = re.escape(domain)
    # After ssl_certificate_key (often second line of TLS pair)
    for pat in (
        rf"(ssl_certificate_key[^;\n]*{esc}[^;\n]*;)",
        rf"(ssl_certificate[^;\n]*{esc}[^;\n]*;)",
    ):
        m = re.search(pat, block, re.IGNORECASE | re.MULTILINE)
        if m:
            pos = m.end()
            return block[:pos] + "\n" + INC_LINE + block[pos:]
    # Block references this host in cert path: put include after listen 443
    if re.search(rf"ssl_certificate[^;]*{esc}", block, re.IGNORECASE):
        m = re.search(r"(listen\s+[^;\n]*443[^;\n]*;)", block, re.IGNORECASE)
        if m:
            pos = m.end()
            return block[:pos] + "\n" + INC_LINE + block[pos:]
    return None


def inject_into_block(block: str, domain: str) -> str | None:
    for fn in (inject_after_server_name, inject_after_tls_or_listen):
        out = fn(block, domain)
        if out is not None:
            return out
    return None


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
    if domain not in text:
        return 1

    blocks = extract_server_blocks(text)
    candidates: list[tuple[int, int, str, int]] = []
    for start, end, block in blocks:
        if domain not in block:
            continue
        sc = score_block(block)
        # Prefer TLS vhosts; skip blocks that only mention domain in a stray comment on HTTP
        if sc < 8 and not re.search(rf"ssl_certificate[^;]*{re.escape(domain)}", block, re.IGNORECASE):
            continue
        candidates.append((start, end, block, sc))

    if not candidates:
        print(f"No suitable server {{}} block (HTTPS / cert path) for {domain}: {path}", file=sys.stderr)
        return 1

    candidates.sort(key=lambda x: -x[3])
    best_score = candidates[0][3]
    top = [c for c in candidates if c[3] == best_score]

    out = text
    for start, end, block, _ in sorted(top, key=lambda x: -x[0]):
        new_block = inject_into_block(block, domain)
        if new_block is None:
            continue
        out = out[:start] + new_block + out[end:]
        open(path, "w", encoding="utf-8").write(out)
        print(f"Injected include in server block: {path}", file=sys.stderr)
        return 0

    print(f"Could not find injection anchor for {domain} in {path}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
