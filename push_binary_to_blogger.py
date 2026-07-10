#!/usr/bin/env python3
"""Push a binary file's contents, base64-encoded, to a Blogger post.

Usage:
    python push_binary_to_blogger.py <file> <post_id>
"""

import base64
import sys
import urllib.error

from blogger_client import publish


def main():
    if len(sys.argv) != 3:
        print(f"Usage: python {sys.argv[0]} <file> <post_id>", file=sys.stderr)
        sys.exit(1)

    file_path, post_id = sys.argv[1], sys.argv[2]
    data = base64.b64encode(open(file_path, "rb").read()).decode("ascii")

    print(f"Publishing {file_path} -> post {post_id} ({len(data)} base64 chars)...")
    try:
        result = publish(post_id, data)
    except urllib.error.HTTPError as e:
        print(f"  FAILED: HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:500]}", file=sys.stderr)
        sys.exit(1)
    if "error" in result:
        print(f"  FAILED: {result['error']}", file=sys.stderr)
        sys.exit(1)
    print(f"  OK - updated {result.get('updated')} - {result.get('url')}")


if __name__ == "__main__":
    main()
