#!/usr/bin/env python3
"""Generate app.js and embed.js from src/core.js + src/app-entry.js / src/embed-entry.js.

app.js and embed.js share most of their logic (the query editor, results
table, ERD, dialogs, etc). That shared logic lives once in src/core.js,
split into two sections:
  - PAGE: page-level singletons, spliced at top level (once per page,
    regardless of how many query-studio instances it holds).
  - INSTANCE: per-instance logic, spliced inside each entry's own
    instance scope (the createQueryStudio(...) { ... } body for embed.js,
    top-level for app.js since it's a single instance).

Each entry file marks its splice points with `/*__CORE_PAGE__*/` and
`/*__CORE__*/` comments. Run this before publish.py.

Usage:
    python build.py
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
PAGE_MARKER = "/*__CORE_PAGE__*/"
INSTANCE_MARKER = "/*__CORE__*/"
PAGE_DELIM = "/* ==== PAGE ==== */"
INSTANCE_DELIM = "/* ==== INSTANCE ==== */"

ENTRIES = {
    "app-entry.js": "app.js",
    "embed-entry.js": "embed.js",
}

GENERATED_HEADER = (
    "// GENERATED FILE - do not hand-edit.\n"
    "// Built by build.py from src/core.js + src/{entry_name}.\n"
    "// Edit the sources in src/ and run `python build.py` to regenerate.\n\n"
)


def split_core(core_text):
    if PAGE_DELIM not in core_text or INSTANCE_DELIM not in core_text:
        raise ValueError(f"core.js must contain both {PAGE_DELIM} and {INSTANCE_DELIM}")
    _, rest = core_text.split(PAGE_DELIM, 1)
    page, instance = rest.split(INSTANCE_DELIM, 1)
    return page.strip("\n"), instance.strip("\n")


def build():
    page_core, instance_core = split_core((SRC / "core.js").read_text(encoding="utf-8"))
    for entry_name, output_name in ENTRIES.items():
        entry = (SRC / entry_name).read_text(encoding="utf-8")
        for marker, name in ((PAGE_MARKER, "PAGE"), (INSTANCE_MARKER, "INSTANCE")):
            if entry.count(marker) != 1:
                raise ValueError(f"{entry_name} must contain exactly one {marker} marker")
        built = entry.replace(PAGE_MARKER, page_core).replace(INSTANCE_MARKER, instance_core)
        header = GENERATED_HEADER.format(entry_name=entry_name)
        (ROOT / output_name).write_text(header + built, encoding="utf-8")
        print(f"Built {output_name} from {entry_name} + core.js")


if __name__ == "__main__":
    build()
