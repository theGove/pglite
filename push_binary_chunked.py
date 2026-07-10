#!/usr/bin/env python3
"""Push a large binary file to Blogger by splitting its base64 content across multiple posts.

A single post can hold at most ~2 MiB of content (found empirically against this blog -
2,093,750 chars succeeded, 2,109,375 failed). This script uses a 1,900,000-character
chunk size for headroom and requires one post ID per chunk, in order.

Usage:
    python push_binary_chunked.py <file> <post_id_1> [post_id_2 ...]

To reassemble: concatenate the chunk posts' content in order, then base64-decode.
"""

import base64
import math
import sys
import urllib.error

from blogger_client import publish

MAX_CHUNK_CHARS = 1_900_000


def main():
    if len(sys.argv) < 3:
        print(f"Usage: python {sys.argv[0]} <file> <post_id_1> [post_id_2 ...]", file=sys.stderr)
        sys.exit(1)

    file_path = sys.argv[1]
    post_ids = sys.argv[2:]

    data = open(file_path, "rb").read()
    b64 = base64.b64encode(data).decode("ascii")

    needed = math.ceil(len(b64) / MAX_CHUNK_CHARS)
    if len(post_ids) != needed:
        print(
            f"{file_path} is {len(data)} bytes -> {len(b64)} base64 chars, "
            f"which needs {needed} post(s) of up to {MAX_CHUNK_CHARS} chars each. "
            f"You gave {len(post_ids)} post ID(s) - create/supply exactly {needed}.",
            file=sys.stderr,
        )
        sys.exit(1)

    chunks = [b64[i : i + MAX_CHUNK_CHARS] for i in range(0, len(b64), MAX_CHUNK_CHARS)]

    print(f"{file_path}: {len(data)} bytes -> {len(b64)} base64 chars -> {len(chunks)} chunk(s)")
    for i, (chunk, post_id) in enumerate(zip(chunks, post_ids)):
        print(f"Publishing chunk {i + 1}/{len(chunks)} -> post {post_id} ({len(chunk)} chars)...")
        try:
            result = publish(post_id, chunk)
        except urllib.error.HTTPError as e:
            print(f"  FAILED: HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:500]}", file=sys.stderr)
            sys.exit(1)
        if "error" in result:
            print(f"  FAILED: {result['error']}", file=sys.stderr)
            sys.exit(1)
        print(f"  OK - updated {result.get('updated')} - {result.get('url')}")

    print(f"\nDone. Reassemble by concatenating the {len(chunks)} post contents in order, then base64-decode.")


if __name__ == "__main__":
    main()
