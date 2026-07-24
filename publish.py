#!/usr/bin/env python3
"""Fetch Blogger posts labeled "app" from a blog's public feed.

Usage:
    python publish.py www.websql.org
    python publish.py pglite.blogspot.com
"""

import json
import re
import sys
import urllib.request
from pathlib import Path

import rjsmin

import build as build_module

ROOT = Path(__file__).resolve().parent




if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

def update_post(blog_id, post_id, content, retries=2):

    deployment_id_file = ROOT / "deploymentid.txt"
    deployment_id = deployment_id_file.read_text(encoding="utf-8").strip()
    endpoint = f"https://script.google.com/macros/s/{deployment_id}/exec"

    payload = json.dumps(
        {"mode": "publish", "content": content, "blogId": blog_id, "postId": post_id}
    ).encode("utf-8")

    last_error = None

    for attempt in range(retries + 1):
        req = urllib.request.Request(
            endpoint, data=payload, headers={"Content-Type": "application/json"}, method="POST"
        )
        opener = urllib.request.build_opener(_NoRedirect)
        resp = opener.open(req)
        if resp.status != 302:
            raise RuntimeError(
                f"Expected a 302 redirect, got {resp.status}: {resp.read().decode('utf-8', 'replace')[:500]}"
            )
        location = resp.headers.get("Location")
        if not location:
            raise RuntimeError("No Location header on the redirect response")
        with urllib.request.urlopen(location) as final:
            body = final.read().decode("utf-8")
        if not body.strip():
            last_error = RuntimeError(
                f"Empty response from Apps Script echo URL (attempt {attempt + 1}/{retries + 1})"
            )
            continue
        try:
            return json.loads(body)
        except json.JSONDecodeError as e:
            last_error = RuntimeError(
                f"Non-JSON response from Apps Script (attempt {attempt + 1}/{retries + 1}): "
                f"{body[:300]!r}"
            )
            last_error.__cause__ = e
            continue
    raise last_error

def fetch_posts_by_label(blog_url, label):
    blog_url = blog_url.rstrip("/")
    feed_url = f"https://{blog_url}/feeds/posts/default/-/{label}?alt=json"
    with urllib.request.urlopen(feed_url) as resp:
        return json.loads(resp.read().decode("utf-8"))

class _NoRedirect(urllib.request.HTTPErrorProcessor):
    def http_response(self, request, response):
        return response

    https_response = http_response

def main():

    if len(sys.argv) != 2:
        print("Usage: python publish.py www.websql.org\n       python publish.py pglite.blogspot.com", file=sys.stderr)
        sys.exit(1)

    build_module.build()

    blog_id=None


    content = {
        "app": (ROOT / "app.js").read_text(encoding="utf-8"),
        "css": (ROOT / "styles.css").read_text(encoding="utf-8"),
        "html": (ROOT / "index.html").read_text(encoding="utf-8"),
        "embed": (ROOT / "embed.js").read_text(encoding="utf-8"),
    }

    # pull the body from html
    body_match = re.search(r"<body[^>]*>(.*)</body>", content["html"], re.DOTALL | re.IGNORECASE)
    if not body_match:
        raise ValueError("Could not find <body>...</body> in index.html")
    content["html"] = body_match.group(1).strip()

    # minify the js
    content["app"] = rjsmin.jsmin(content["app"])
    content["embed"] = rjsmin.jsmin(content["embed"])

    print("\n\n")
    for label in ['app','css','html','embed']:
        # print(label)
        feed = fetch_posts_by_label(sys.argv[1],label)
        if blog_id is None:
            blog_id = feed.get("feed", {}).get("id", {}).get("$t", "").split("-")[1]
        # print(f"Blog ID: {blog_id}")
        # print(feed.get("feed", {}).get("id", "").get("$t", "").split("-")[1])
        entries = feed.get("feed", {}).get("entry", [])
        blog_content = entries[0]["content"]["$t"]
        # print(label, len(blog_content), len(content[label]))
        if blog_content == content[label]:
            print(f"{label} is up to date.")
        else:    
            sys.stdout.write(f"\nUpdating {label} . . .")
            post_id =  entries[0]["id"]["$t"].split("post-")[1]
            update_post(blog_id, post_id, content[label])
            sys.stdout.write(" done.\n")

    print("\n\n")



if __name__ == "__main__":
    main()
