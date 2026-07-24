# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

WebSQL Studio: a browser-only SQL playground built on PGlite (Postgres compiled to WASM) and the Monaco editor. There are two deployment shapes built from the same source:

- **`index.html` + `app.js`** — the full standalone app (editor, results/history/ERD panes, table sidebar, saved queries, CSV/Excel/Gist import-export, admin console).
- **`embed.js`** — a lighter, multi-instance widget for embedding in Blogger posts. It turns `<pre class="websql">` code blocks (or hand-placed `.query-studio`/`[data-initial-sql]` containers) into independent query-studio instances on one page, with no sidebar/menu/saved-queries chrome.

Both are published as raw text to Blogger posts (see Publishing below) rather than served from a conventional web host.

## Source layout — app.js and embed.js are generated, do not hand-edit

`app.js` and `embed.js` share the large majority of their logic. That shared logic lives once, in `src/`, and the two shipped files are built from it:

```
src/core.js         # shared engine, in two sections (see below)
src/app-entry.js     # app.js-only code + calls into core
src/embed-entry.js   # embed.js-only code + calls into core
build.py             # splices core.js into each entry -> app.js / embed.js
app.js, embed.js      # GENERATED — carry a "do not hand-edit" header
```

Edit only the files under `src/` (and `build.py`/`index.html`/`styles.css` directly). After editing `src/`, run:

```
python build.py
```

`core.js` has two splice sections, delimited by `/* ==== PAGE ==== */` and `/* ==== INSTANCE ==== */`:
- **PAGE**: page-level singletons, spliced once at top level in each entry (e.g. the shared boot splash — one splash screen in front of however many query-studio instances a page holds).
- **INSTANCE**: per-instance logic (editor, query execution, results/ERD/history rendering, dialogs, etc.), spliced into each entry's own instance scope — top-level for `app.js` (a single instance), inside `function createQueryStudio(root, instanceId, options = {})` for `embed.js` (one call per widget on the page).

Each entry marks its two splice points with `/*__CORE_PAGE__*/` and `/*__CORE__*/` comments (exactly one of each, checked by `build.py`).

Divergent behavior between the two builds is handled with plain per-entry constants/objects defined just above the markers, not a general options/config system — e.g. `THEME_ATTR` (`data-theme` vs `data-pglite-theme`, so the embed build doesn't clobber a host blog's own dark-mode attribute), `CSS_PREFIX` (`""` vs `"pglite-"`, same reasoning for dialog/overlay class names), `HAS_SAVED_QUERIES`, `options` (real per-widget seed values for embed, `{}` for app), and instance-namespaced JSONP callback names (`jsonpFeedCallbackName`/`jsonpResultCallbackName`). Where core code needs to know whether a piece of chrome exists at all (e.g. the table sidebar, which embed's widgets don't have), it's gated on DOM presence (`if (el.tableList) { ... }`) rather than a capability flag.

Known remaining duplication (not yet unified): the DB lifecycle/leader-election cluster — `createDatabase`, `switchDatabase`, `wipeCurrentDatabaseStore`, `claimPrimaryRole`/`claimPrimaryRoleOnce`, `bindLeaderChange`, `sharedDbIdForPathname` — and `initEventListeners` (UI event wiring) are still hand-duplicated between `src/app-entry.js` and `src/embed-entry.js`. Good next candidates if continuing this refactor.

## Publishing

```
python publish.py <blog-host-or-domain>
```

e.g. `python publish.py www.websql.org` or `python publish.py pglite.blogspot.com`. This:

1. Runs `build.py` first (regenerates `app.js`/`embed.js` from `src/`).
2. Minifies `app.js`/`embed.js` with `rjsmin`; takes `styles.css` as-is; extracts just the `<body>…</body>` inner HTML from `index.html`.
3. For each of the four content types (`app`, `css`, `html`, `embed`), fetches the current Blogger post tagged with that label via the public JSON feed, diffs against local content, and if different, POSTs the update through a Google Apps Script Web App endpoint (URL built from `deploymentid.txt`, gitignored/local-only) that writes it back to the corresponding Blogger post.

Python deps: `requests`, `rjsmin` (installed in `.venv`; no `requirements.txt` — install with `pip install requests rjsmin` if setting up fresh).

## Manual testing

There is no automated test suite. Verify changes by serving the repo root with a static file server and opening in a browser:

- `index.html` — the full app.
- `test.html` — a minimal embed.js smoke-test page with three `pre.websql` code blocks, useful for checking multi-instance isolation (each block should become an independent query-studio widget).

## Notable URL parameters (app.js)

- `?sql=<query>` — seeds the editor and (unless deferred) auto-runs it.
- `?data=<label>` — loads a named dataset published on `websqldata.blogspot.com`.
- `?result=<label>` — defers booting PGlite entirely and instead shows a canned query result fetched from a blog post (used for lightweight "preview" links).
- `?shared=1` — multi-tab shared database via IndexedDB, with cross-tab leader election so only one tab owns the write connection.
- `?readonly=1` — locks the session read-only after data load.
- `?style=minimal` — compact embed-style chrome.
- `?mode=admin` — reveals admin-only affordances (e.g. the ERD "log table positions" button).
