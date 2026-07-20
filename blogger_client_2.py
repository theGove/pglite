"""Shared client for publishing content to Blogger posts via the Apps Script endpoint."""

import base64
import html
import json
import re
import urllib.error
import urllib.request
from pathlib import Path

BLOG_ID = "9206279942129525375"
BLOG_ORIGIN = "https://pglite.blogspot.com"
MANIFEST_POST_ID = "2589791840978924440"
ROOT = Path(__file__).resolve().parent
DEPLOYMENT_ID_FILE = ROOT / "deploymentid.txt"


def load_endpoint():
    if not DEPLOYMENT_ID_FILE.exists():
        raise RuntimeError(
            f"Missing {DEPLOYMENT_ID_FILE.name} - put the Apps Script deployment ID "
            "(the AKfycb... part of the /exec URL) in that file, one line, no quotes."
        )
    deployment_id = DEPLOYMENT_ID_FILE.read_text(encoding="utf-8").strip()
    return f"https://script.google.com/macros/s/{deployment_id}/exec"


class _NoRedirect(urllib.request.HTTPErrorProcessor):
    def http_response(self, request, response):
        return response

    https_response = http_response


def publish(post_id, content, blog_id=BLOG_ID, retries=2):
    """Publish `content` to the given Blogger post ID; retries on empty/non-JSON echo responses.

    @param {str} post_id - Blogger post ID to update.
    @param {str} content - Post body HTML/text to write.
    @param {str} [blog_id] - Blogger blog ID (defaults to BLOG_ID).
    @param {int} [retries] - Extra attempts after an empty/non-JSON echo response.
    """
    endpoint = load_endpoint()
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


def fetch_post_body_by_path(path, blog_origin=BLOG_ORIGIN):
    """Fetch a Blogger permalink page directly and pull out its post-body content.

    Unlike the multi-entry label feed (which silently drops entries once the combined
    response gets large - confirmed against this blog around ~3.8MB), a single permalink
    fetch has no such cap: each post is retrieved on its own.
    """
    url = f"{blog_origin}{path}" if path.startswith("/") else f"{blog_origin}/{path}"
    with urllib.request.urlopen(url) as resp:
        page_html = resp.read().decode("utf-8")
    match = re.search(r'<div class=["\']post-body[^"\']*["\'][^>]*>(.*?)</div>', page_html, re.DOTALL)
    if not match:
        raise RuntimeError(f"Could not find a post-body div in {url}")
    return html.unescape(match.group(1).strip())


def fetch_database_manifest_entry(title, manifest_post_id=MANIFEST_POST_ID, blog_origin=BLOG_ORIGIN):
    """Fetch the databases manifest post and return the entry whose `title` matches."""
    url = f"{blog_origin}/feeds/posts/default/{manifest_post_id}?alt=json"
    with urllib.request.urlopen(url) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    databases = json.loads(data["entry"]["content"]["$t"])
    for db in databases:
        if db.get("title") == title:
            return db
    raise KeyError(f"No database manifest entry with title {title!r}")


def fetch_chunked_binary_by_manifest(title, manifest_post_id=MANIFEST_POST_ID, blog_origin=BLOG_ORIGIN):
    """Reassemble a chunked binary using the ordered `posts` paths from the databases manifest."""
    entry = fetch_database_manifest_entry(title, manifest_post_id, blog_origin)
    combined = "".join(fetch_post_body_by_path(p, blog_origin) for p in entry["posts"])
    return base64.b64decode(combined)
