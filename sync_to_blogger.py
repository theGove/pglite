#!/usr/bin/env python3
"""Push index.html / styles.css / app.js to their Blogger posts.

Usage:
    python sync_to_blogger.py                # publish all registered assets
    python sync_to_blogger.py app.js          # publish just one (or a few)
"""

import re
import sys
import urllib.error
from pathlib import Path

from blogger_client import publish

ROOT = Path(__file__).resolve().parent

POSTS = {
    "app.js": ("193744643460984257", ROOT / "app.js"),
    "styles.css": ("3605221917047497476", ROOT / "styles.css"),
    "index.html": ("8271236875667927124", ROOT / "index.html"),
}


def extract_body(html):
    match = re.search(r"<body[^>]*>(.*)</body>", html, re.DOTALL | re.IGNORECASE)
    if not match:
        raise ValueError("Could not find <body>...</body> in index.html")
    body = match.group(1)
    body = re.sub(
        r'[ \t]*<script[^>]*\bsrc=["\']app\.js["\'][^>]*>\s*</script>\s*\n?',
        "",
        body,
        flags=re.IGNORECASE,
    )
    return body.strip() + "\n"


def load_content(name, path):
    text = path.read_text(encoding="utf-8")
    return extract_body(text) if name == "index.html" else text


def main():
    names = sys.argv[1:] or list(POSTS.keys())
    for name in names:
        if name not in POSTS:
            print(f"Unknown target: {name} (expected one of {list(POSTS)})", file=sys.stderr)
            sys.exit(1)

    for name in names:
        post_id, path = POSTS[name]
        if not post_id:
            print(
                f"Skipping {name}: no Blogger post ID configured in sync_to_blogger.py POSTS",
                file=sys.stderr,
            )
            continue
        content = load_content(name, path)
        print(f"Publishing {name} -> post {post_id} ({len(content)} chars)...")
        try:
            result = publish(post_id, content)
        except urllib.error.HTTPError as e:
            print(f"  FAILED: HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:500]}", file=sys.stderr)
            sys.exit(1)
        if "error" in result:
            print(f"  FAILED: {result['error']}", file=sys.stderr)
            sys.exit(1)
        print(f"  OK - updated {result.get('updated')} - {result.get('url')}")


if __name__ == "__main__":
    main()
