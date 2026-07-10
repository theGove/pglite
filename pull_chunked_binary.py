#!/usr/bin/env python3
"""Reassemble a chunked binary using the databases manifest post.

Looks up `title` in the manifest (post 2589791840978924440), fetches each of its
`posts` paths in the order listed, concatenates their content, and base64-decodes
the result to a file.

Usage:
    python pull_chunked_binary.py "<database title>" <output_file>
"""

import sys

from blogger_client import fetch_chunked_binary_by_manifest


def main():
    if len(sys.argv) != 3:
        print(f'Usage: python {sys.argv[0]} "<database title>" <output_file>', file=sys.stderr)
        sys.exit(1)

    title, output_file = sys.argv[1], sys.argv[2]
    data = fetch_chunked_binary_by_manifest(title)
    with open(output_file, "wb") as f:
        f.write(data)
    print(f"Wrote {len(data)} bytes to {output_file}")


if __name__ == "__main__":
    main()
