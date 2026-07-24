// ---- Config -----------------------------------------------------------
// 2026-07-21

const MONACO_VERSION = "0.52.2";
const PGLITE_VERSION = "0.5.4";
const PGLITE_URL = `https://cdn.jsdelivr.net/npm/@electric-sql/pglite@${PGLITE_VERSION}/dist/index.js`;
const PGLITE_WORKER_URL = `https://cdn.jsdelivr.net/npm/@electric-sql/pglite@${PGLITE_VERSION}/dist/worker/index.js`;
const THEME_KEY = "pglite-theme";
const QUERY_HISTORY_KEY = "websql-query-history";
const QUERY_HISTORY_MAX = 50;
/** Result sets larger than this are split into pages in the results table. */
const RESULTS_PAGE_SIZE = 1000;
/**
 * Enable multi-tab shared DB with ?shared=1, or automatically when a page has
 * more than one `pre.websql` code block (see convertWebsqlCodeBlocks) - those
 * blocks are independent query panels meant to run against one common
 * dataset/schema (e.g. only the first tags a `data-<label>` class to load
 * it), so they need the same underlying engine rather than each getting its
 * own private in-memory copy.
 */
const SHARED_DB_PARAM = "shared";
let useSharedDb = new URLSearchParams(window.location.search).get(SHARED_DB_PARAM) === "1";

/**
 * Resolves once any code-block-derived query-studio instance (see
 * convertWebsqlCodeBlocks / options.autoCascade) has run a query for the
 * first time - whether that was its own options.datasetLabel auto-run or a
 * reader's manual Run click. Every other such instance on the page awaits
 * this in its own main() and then auto-runs its own query too, so once
 * whichever panel loads the shared dataset finishes, a reader doesn't have
 * to click Run in every remaining panel by hand.
 */
let announceFirstQueryRan;
const firstQueryRan = new Promise((resolve) => {
  announceFirstQueryRan = resolve;
});
/** Lock the session read-only after data load when ?readonly=1 */
const useReadOnly = new URLSearchParams(window.location.search).get("readonly") === "1";
/**
 * Every studio defers booting its PGlite engine until the learner clicks Run
 * (or Ctrl/Cmd+Enter). The editor loads and shows its query immediately, but
 * nothing touches the database - and no shared-mode leader election starts -
 * until an explicit run. This matters most with multiple .query-studio
 * instances on one page (especially under ?shared=1): booting them all
 * automatically on load would race several leader-election attempts at once;
 * waiting for the reader's first Run spaces them out instead.
 */
const useDeferredDb = true;
/** Blogger post label to fetch a canned query result from; see loadResultFromBlog. */
const resultLabel = new URLSearchParams(window.location.search).get("result");
/** Max time to wait for the shared DB's cross-tab leader-election handshake before giving up. */
const DB_READY_TIMEOUT_MS = 10000;
/** How long the splash screen shows before revealing its "Retry" button, in case boot is stuck somewhere no timeout above covers. */
const SPLASH_RETRY_REVEAL_MS = 10000;

// ---- Styles: this file is fully self-contained, no separate CSS file to fetch ----

/**
 * All CSS this widget needs, scoped so it neither leaks onto nor is easily
 * clobbered by a hosting page's own styles:
 *  - every custom property and class name is prefixed `--pglite-`/`pglite-`
 *    (the small set of exceptions - `.query-studio`, `#app-shell`,
 *    `.pglite-splash`, `.pglite-app-dialog-overlay` - are this widget's own
 *    deliberate integration points, not generic names a host page would
 *    plausibly reuse by accident);
 *  - the few rules that would otherwise be universal (box-sizing, scrollbar
 *    styling, base font/color) are scoped with :is(...) to this widget's own
 *    containers instead of `*`/`body`, so a host page's own global styles are
 *    left untouched.
 * See convertWebsqlCodeBlocks/createQueryStudio for where `.query-studio` and
 * `#app-shell`/`.pglite-splash` get their classes.
 */
const EMBED_STYLES = `
:root {
  --pglite-bg: #f6f7f9;
  --pglite-panel: #ffffff;
  --pglite-border: #e3e6ea;
  --pglite-text: #1f2430;
  --pglite-text-muted: #aaa;
  --pglite-accent: #3b5bfd;
  --pglite-accent-hover: #2f4ce0;
  --pglite-danger: #d33d3d;
  --pglite-hover-bg: #eceef2;
  --pglite-accent-tint: #eef1fb;
  --pglite-danger-tint: #fdecec;
  --pglite-danger-border: #f6c6c6;
  --pglite-danger-text: #8a1f1f;
  --pglite-mono: "SF Mono", "Cascadia Code", Consolas, "Courier New", monospace;
  --pglite-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  --pglite-radius: 8px;
  --pglite-erd-bg: #fbfdff;
  --pglite-erd-grid: #edf2f7;
  --pglite-erd-node-bg: #ffffff;
  --pglite-erd-node-border: #cbd4e1;
  --pglite-erd-header: #204f66;
  --pglite-erd-text: #1e293b;
  --pglite-erd-muted: #748094;
  --pglite-erd-key: #1f6f78;
  --pglite-erd-line: #687487;
  --pglite-scrollbar-size: 8px;
  --pglite-scrollbar-track: transparent;
  --pglite-scrollbar-thumb: #c8ced8;
  --pglite-scrollbar-thumb-hover: #aeb6c4;
}

:root[data-pglite-theme="dark"] {
  --pglite-bg: #191b21;
  --pglite-panel: #22252c;
  --pglite-border: #34373f;
  --pglite-text: #e7e9ee;
  --pglite-text-muted: #444;
  --pglite-accent: #6c8cff;
  --pglite-accent-hover: #839dff;
  --pglite-danger: #ff6b6b;
  --pglite-hover-bg: #2c2f38;
  --pglite-accent-tint: #232a42;
  --pglite-danger-tint: #3a2323;
  --pglite-danger-border: #5a2e2e;
  --pglite-danger-text: #ff9b9b;
  --pglite-erd-bg: #1a1d24;
  --pglite-erd-grid: #2a2f3a;
  --pglite-erd-node-bg: #22252c;
  --pglite-erd-node-border: #3a404c;
  --pglite-erd-header: #2f6f8f;
  --pglite-erd-text: #e7e9ee;
  --pglite-erd-muted: #8b95a8;
  --pglite-erd-key: #6ec4cf;
  --pglite-erd-line: #8b95a8;
  --pglite-scrollbar-thumb: #4a4f5a;
  --pglite-scrollbar-thumb-hover: #5e6472;
}
/* Neutralize whatever the hosting page's own CSS applies to bare elements
   (table, th, td, tr, button, headings, ...) inside this widget. Every rule
   below only overrides the specific properties it declares - a host that
   styles e.g. plain table elements with a background/box-shadow, or even-row
   table cells with a zebra-stripe background, site-wide, still leaks those
   particular properties straight through, since nothing here competed for
   them. The "all: revert" declaration clears every property back to its
   user-agent default first, so our own (more specific) rules are the only
   author styles still in play afterward.
   Two things to know about how this is written:
   - Deliberately NOT written with :is(...) - an :is() selector list takes
     the specificity of its single most specific argument for every element
     it matches, so folding the #app-shell id in here would silently give
     this universal-selector rule ID-level specificity even where an element
     only matched through the .query-studio branch.
   - .editor-pane (and everything inside it) is explicitly excluded, and not
     just for the id-specificity reason above: Monaco renders its own theme
     via classes of its own, at a specificity this reset must not gamble
     against, so it's carved out of the selector entirely rather than raced.
   - No !important here (or anywhere in this stylesheet): several features
     set inline styles via JS - the resizable editor pane's flex-basis, the
     boot splash's display:none toggle, the ERD's zoom transform - and an
     !important stylesheet rule for the same property would always beat a
     plain inline style, silently breaking every one of them. Instead this
     rule leans on the selector list below (repeating .query-studio through
     :not() twice) for enough specificity to beat realistic host selectors
     like the tr:nth-child(even) td case above, while staying safely below
     this file's own (already more specific) component rules further down. */
.query-studio,
.query-studio *:not(.editor-pane):not(.editor-pane *),
#app-shell,
.pglite-splash,
.pglite-splash *,
.pglite-app-dialog-overlay,
.pglite-app-dialog-overlay * {
  all: revert;
}

/* Scoped resets: box-sizing + minimal scrollbars, limited to this widget's own
   DOM instead of the whole host page (see #app-shell / .pglite-splash /
   .pglite-app-dialog-overlay for the other places this widget renders into). */
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay),
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) * {
  box-sizing: border-box;
  scrollbar-width: thin;
  scrollbar-color: var(--pglite-scrollbar-thumb) var(--pglite-scrollbar-track);
}

:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) *::-webkit-scrollbar {
  width: var(--pglite-scrollbar-size);
  height: var(--pglite-scrollbar-size);
}

:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) *::-webkit-scrollbar-track {
  background: var(--pglite-scrollbar-track);
}

:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) *::-webkit-scrollbar-thumb {
  background: var(--pglite-scrollbar-thumb);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) *::-webkit-scrollbar-thumb:hover {
  background: var(--pglite-scrollbar-thumb-hover);
  border: 2px solid transparent;
  background-clip: padding-box;
}

:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) *::-webkit-scrollbar-corner {
  background: transparent;
}

/* Base typography, scoped to this widget's own containers instead of <body> -
   a host page's own body font/color/background is left untouched. */
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) {
  font-family: var(--pglite-sans);
  color: var(--pglite-text);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 7px 12px;
  border-radius: var(--pglite-radius);
  border: 1px solid var(--pglite-border);
  background: var(--pglite-panel);
  color: var(--pglite-text);
  cursor: pointer;
  transition: background-color 0.12s, border-color 0.12s;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .btn:hover {
  background: var(--pglite-hover-bg);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .btn:disabled {
  opacity: 0.5;
  cursor: default;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .btn .icon {
  font-size: 12px;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .btn .spinner-btn {
  width: 12px;
  height: 12px;
  border-color: rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  flex: 0 0 auto;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .btn.is-busy .run-icon {
  display: none;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .btn-primary {
  background: var(--pglite-accent);
  border-color: var(--pglite-accent);
  color: #fff;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .btn-primary:hover {
  background: var(--pglite-accent-hover);
  border-color: var(--pglite-accent-hover);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .btn-ghost {
  background: transparent;
  border-color: transparent;
  color: var(--pglite-text-muted);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .btn-ghost:hover {
  background: var(--pglite-hover-bg);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .btn-danger {
  background: var(--pglite-danger);
  border-color: var(--pglite-danger);
  color: #fff;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .btn-danger:hover {
  filter: brightness(1.08);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .icon-btn {
  border: none;
  background: transparent;
  color: var(--pglite-text-muted);
  cursor: pointer;
  font-size: 13px;
  padding: 2px 4px;
  border-radius: 4px;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .icon-btn:hover {
  background: var(--pglite-hover-bg);
  color: var(--pglite-text);
}

/* Layout */
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .layout {
  flex: 1 1 auto;
  display: flex;
  min-height: 0;
}

/* Query studio: one independent editor + results pane. #app-shell stacks
   these vertically (it's already display:flex; flex-direction:column); each
   instance keeps its own height and provides a positioning context for its
   own toast/pglite-loading-overlay so two on the same page don't collide. */
.query-studio {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  height: 380px;
  min-height: 200px;
  overflow: hidden;
  resize: vertical;
  border: 1px solid var(--pglite-border);
  background: var(--pglite-bg);
}
.query-studio + .query-studio {
  border-top: 4px solid var(--pglite-bg);
}
.query-studio .pglite-loading-overlay {
  position: absolute;
}
.query-studio .toast {
  position: absolute;
  bottom: 16px;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .empty-hint {
  color: var(--pglite-text-muted);
  font-size: 13px;
  padding: 10px 8px;
}

/* Workspace */
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .workspace {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .editor-pane {
  flex: 0 0 42%;
  min-height: 80px;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .resizer {
  height: 6px;
  flex: 0 0 auto;
  cursor: row-resize;
  background: var(--pglite-bg);
  position: relative;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .resizer::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 36px;
  height: 3px;
  border-radius: 2px;
  background: var(--pglite-border);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .resizer:hover::after {
  background: var(--pglite-accent);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .results-pane {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 60px;
  background: var(--pglite-panel);
  border-top: 1px solid var(--pglite-border);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .results-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--pglite-border);
  font-size: 13px;
  font-weight: 600;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .results-header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .icon-btn-open-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  line-height: 0;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .results-meta {
  font-weight: 400;
  color: var(--pglite-text-muted);
  font-size: 12px;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .results-body {
  flex: 1 1 auto;
  overflow: auto;
  padding: 0;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .results-body.has-error {
  padding: 14px;
}

/* Results table */
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) table.result-table {
  border-collapse: collapse;
  width: max-content;
  font-size: 12.5px;
  font-family: var(--pglite-mono);
  /* Browsers don't inherit color into <table> by default (it resets to
     black), so without this the table ignores the theme entirely -
     invisible black-on-near-black in dark mode. */
  color: var(--pglite-text);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) table.result-table th,
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) table.result-table td {
  text-align: left;
  padding: 6px 12px;
  border-bottom: 1px solid var(--pglite-border);
  border-left: 1px solid var(--pglite-border);
  white-space: pre;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) table.result-table th:first-child,
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) table.result-table td:first-child {
  border-left: 0;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) table.result-table td.cell-numeric {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) table.result-table .cell-text {
  display: inline-block;
  max-width: 500px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: pre;
  vertical-align: bottom;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) table.result-table td.cell-expanded .cell-text {
  max-width: 500px;
  overflow: visible;
  white-space: pre-wrap;
  word-break: break-word;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) table.result-table .cell-expand-btn {
  display: inline-block;
  margin-left: 4px;
  padding: 0 5px;
  font-size: 10px;
  line-height: 1.6;
  border: 1px solid var(--pglite-border);
  border-radius: 3px;
  background: var(--pglite-bg);
  color: var(--pglite-text-muted);
  cursor: pointer;
  vertical-align: bottom;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) table.result-table .cell-expand-btn:hover {
  color: var(--pglite-accent);
  border-color: var(--pglite-accent);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) table.result-table th {
  position: sticky;
  top: 0;
  background: var(--pglite-bg);
  color: var(--pglite-text-muted);
  font-weight: 600;
  border-bottom: 1px solid var(--pglite-border);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) table.result-table .row-num-col {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--pglite-bg);
  color: var(--pglite-text-muted);
  text-align: right;
  font-size: 11px;
  font-style: italic;
  border-right: 1px solid var(--pglite-border);
  user-select: none;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) table.result-table th.row-num-col {
  z-index: 2;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) table.result-table tbody tr:hover .row-num-col {
  background: var(--pglite-bg);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) table.result-table tbody tr:hover {
  background: var(--pglite-accent-tint);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .result-block + .result-block {
  border-top: 6px solid var(--pglite-bg);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .result-block-label {
  padding: 6px 14px 0;
  font-size: 11.5px;
  color: var(--pglite-text-muted);
  font-family: var(--pglite-mono);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .result-block-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .csv-btn,
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .result-json-btn {
  font-family: var(--pglite-sans);
  font-size: 11.5px;
  font-weight: 500;
  border: 1px solid var(--pglite-border);
  background: var(--pglite-panel);
  color: var(--pglite-text-muted);
  border-radius: 6px;
  padding: 2px 9px;
  cursor: pointer;
  flex: 0 0 auto;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .csv-btn:hover,
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .result-json-btn:hover {
  color: var(--pglite-accent);
  border-color: var(--pglite-accent);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .result-pager {
  position: sticky;
  left: 0;
  bottom: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 14px;
  background: var(--pglite-bg);
  border-top: 1px solid var(--pglite-border);
  font-family: var(--pglite-sans);
  font-size: 11.5px;
  color: var(--pglite-text-muted);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .pager-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .pager-page {
  font-variant-numeric: tabular-nums;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .page-btn {
  font-family: var(--pglite-sans);
  font-size: 11.5px;
  font-weight: 500;
  border: 1px solid var(--pglite-border);
  background: var(--pglite-panel);
  color: var(--pglite-text-muted);
  border-radius: 6px;
  padding: 2px 9px;
  cursor: pointer;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .page-btn:hover:not(:disabled) {
  color: var(--pglite-accent);
  border-color: var(--pglite-accent);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .page-btn:disabled {
  opacity: 0.45;
  cursor: default;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .cell-null {
  color: var(--pglite-text-muted);
  font-style: italic;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .error-box {
  background: var(--pglite-danger-tint);
  border: 1px solid var(--pglite-danger-border);
  color: var(--pglite-danger-text);
  border-radius: var(--pglite-radius);
  padding: 12px 14px;
  font-family: var(--pglite-mono);
  font-size: 13px;
  white-space: pre-wrap;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .spinner {
  width: 10px;
  height: 10px;
  border: 2px solid color-mix(in srgb, var(--pglite-accent) 30%, transparent);
  border-top-color: var(--pglite-accent);
  border-radius: 50%;
  animation: pglite-spin 0.8s linear infinite;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .spinner[hidden] {
  display: none;
}


@keyframes pglite-spin {
  to {
    transform: rotate(360deg);
  }
}
/* Toast */
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .toast {
  position: fixed;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  background: #1f2430;
  color: #fff;
  padding: 9px 16px;
  border-radius: var(--pglite-radius);
  font-size: 13px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
  z-index: 1000;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .toast.error {
  background: #8a1f1f;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .toast.success {
  background: #1f7a3f;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .toast[hidden] {
  display: none;
}

/* Startup splash */
#app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--pglite-bg);
}
.pglite-splash {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--pglite-bg);
  z-index: 2000;
}

/* Database loading overlay */
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .pglite-loading-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 17, 22, 0.45);
  backdrop-filter: blur(2px);
  z-index: 2000;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .pglite-loading-overlay[hidden] {
  display: none;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .pglite-loading-dialog {
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 320px;
  max-width: 90vw;
  background: var(--pglite-panel);
  border: 1px solid var(--pglite-border);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
  padding: 28px 32px;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .pglite-loading-dialog-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .pglite-loading-dialog-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--pglite-text);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .pglite-splash-retry-btn {
  align-self: flex-start;
  margin-top: 6px;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .pglite-splash-retry-btn[hidden] {
  display: none;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .pglite-loading-dialog-subtitle {
  font-size: 12.5px;
  color: var(--pglite-text-muted);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .pglite-spinner-lg {
  width: 26px;
  height: 26px;
  border-width: 3px;
  flex: 0 0 auto;
}

/* Styled confirm/prompt dialogs (replace native confirm()/prompt()) */
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .pglite-app-dialog-overlay {
  z-index: 2200;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .pglite-app-dialog {
  display: block;
  min-width: 360px;
  max-width: 90vw;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .pglite-app-dialog-header {
  margin-bottom: 16px;
  line-height: 1.4;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .pglite-app-dialog-body {
  margin-bottom: 18px;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .pglite-app-dialog-input {
  width: 100%;
  padding: 8px 10px;
  font-family: inherit;
  font-size: 13px;
  color: var(--pglite-text);
  background: var(--pglite-bg);
  border: 1px solid var(--pglite-border);
  border-radius: 6px;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .pglite-app-dialog-input:focus {
  outline: none;
  border-color: var(--pglite-accent);
  box-shadow: 0 0 0 2px var(--pglite-accent-tint);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .pglite-app-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* Results / ERD view tabs */
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .results-view-tabs {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--pglite-border);
  border-radius: 8px;
  background: var(--pglite-bg);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .results-view-tab {
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  padding: 4px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--pglite-text-muted);
  cursor: pointer;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .results-view-tab:hover {
  color: var(--pglite-text);
  background: var(--pglite-hover-bg);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .results-view-tab.is-active {
  background: var(--pglite-panel);
  color: var(--pglite-text);
  box-shadow: 0 0 0 1px var(--pglite-border);
}

/* Query history */
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .results-body.history-body {
  padding: 0;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .history-panel {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .history-toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 8px 12px;
  border-bottom: 1px solid var(--pglite-border);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .history-clear-btn {
  font-size: 12px;
  padding: 4px 10px;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .history-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .history-item {
  padding: 10px 14px;
  border-bottom: 1px solid var(--pglite-border);
  cursor: pointer;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .history-item:hover {
  background: var(--pglite-hover-bg);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .history-item-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .history-status {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--pglite-accent-tint);
  color: var(--pglite-accent);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .history-item.is-error .history-status {
  background: var(--pglite-danger-tint);
  color: var(--pglite-danger-text);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .history-meta {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  font-weight: 400;
  color: var(--pglite-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .history-load-btn {
  flex: 0 0 auto;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 3px 8px;
  border: 1px solid var(--pglite-border);
  border-radius: 6px;
  background: var(--pglite-panel);
  color: var(--pglite-text);
  cursor: pointer;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .history-load-btn:hover {
  background: var(--pglite-accent-tint);
  border-color: var(--pglite-accent);
  color: var(--pglite-accent);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .history-sql {
  margin: 0;
  font-family: var(--pglite-mono);
  font-size: 12.5px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--pglite-text);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-toolbar {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-toolbar[hidden] {
  display: none;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-zoom-label {
  min-width: 42px;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--pglite-text-muted);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-select {
  height: 26px;
  margin-right: 4px;
  padding: 0 6px;
  border: 1px solid var(--pglite-border);
  border-radius: 6px;
  background: var(--pglite-panel);
  color: var(--pglite-text);
  font-size: 12px;
  cursor: pointer;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .results-body.erd-body {
  padding: 0;
  overflow: hidden;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-scroll {
  width: 100%;
  height: 100%;
  overflow: auto;
  overscroll-behavior: contain;
  /* Allow one-finger pan; custom JS handles two-finger pinch zoom. */
  touch-action: pan-x pan-y;
  background:
    radial-gradient(circle, var(--pglite-erd-grid) 1.25px, transparent 1.3px) 0 0 / 20px 20px,
    var(--pglite-erd-bg);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-scroll.is-dragging {
  cursor: grabbing;
  user-select: none;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-svg {
  display: block;
  transform-origin: 0 0;
  max-width: none;
  max-height: none;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-node {
  cursor: grab;
  touch-action: none;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-node.is-dragging {
  cursor: grabbing;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-scroll.is-sql-mode .erd-node {
  cursor: pointer;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-node-body {
  fill: var(--pglite-erd-node-bg);
  stroke: var(--pglite-erd-node-border);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-node-header {
  fill: var(--pglite-erd-header);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-node-title {
  fill: #fff;
  font-size: 15px;
  font-weight: 700;
  pointer-events: none;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-column-text {
  fill: var(--pglite-erd-text);
  font-size: 13px;
  pointer-events: none;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-column-hit {
  fill: transparent;
  pointer-events: fill;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-column-row.primary-key .erd-column-text {
  font-weight: 800;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-column-row.foreign-key .erd-column-text {
  font-style: italic;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-column-type {
  fill: var(--pglite-erd-muted);
  font-style: normal;
  font-weight: 600;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-key-primary {
  stroke: var(--pglite-erd-key);
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-key-muted {
  stroke: var(--pglite-erd-muted);
  opacity: 0.85;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-relationship {
  cursor: pointer;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-line-hit {
  fill: none;
  stroke: transparent;
  stroke-width: 14;
  stroke-linecap: round;
  pointer-events: stroke;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-line {
  stroke: var(--pglite-erd-line);
  stroke-width: 2;
  stroke-linecap: butt;
  pointer-events: none;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-crowsfoot {
  fill: none;
  stroke: var(--pglite-erd-line);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  pointer-events: stroke;
}
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-relationship.is-selected .erd-line,
:is(.query-studio, #app-shell, .pglite-splash, .pglite-app-dialog-overlay) .erd-relationship.is-selected .erd-crowsfoot {
  stroke: var(--pglite-accent);
  stroke-width: 3;
}
`;

/** Injects EMBED_STYLES once, however many studio instances end up on the page. */
function ensureStylesheetLoaded() {
  if (document.getElementById("pglite-embed-styles")) return;
  const style = document.createElement("style");
  style.id = "pglite-embed-styles";
  style.textContent = EMBED_STYLES;
  document.head.appendChild(style);
}

/** Cached promise so multiple studio instances share one Monaco loader-script load. */
let monacoLoaderPromise = null;

/**
 * Loads the Monaco AMD loader script (defines the global `require`) unless a
 * page has already included it itself - e.g. via its own
 * `<script src=".../loader.js">` tag, as embed-html.html does.
 */
function ensureMonacoLoaderLoaded() {
  if (window.require && window.require.config) return Promise.resolve();
  if (!monacoLoaderPromise) {
    monacoLoaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs/loader.js`;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load the Monaco editor loader script."));
      document.head.appendChild(script);
    });
  }
  return monacoLoaderPromise;
}

ensureStylesheetLoaded();

// ---- Shared page-level splash (one boot screen in front of every studio instance) ----

const splashEl = {
  splash: document.getElementById("splash"),
  splashRetry: document.getElementById("splash-retry"),
  appShell: document.getElementById("app-shell"),
};

let splashRetryTimer = null;

/** Hides the shared boot splash. Safe to call once per studio instance (idempotent). */
function hideSplash() {
  if (splashRetryTimer) {
    clearTimeout(splashRetryTimer);
    splashRetryTimer = null;
  }
  if (splashEl.splash) splashEl.splash.style.display = "none";
  if (splashEl.appShell) splashEl.appShell.style.display = "";
}

/**
 * Reveals the splash screen's "Retry" button after SPLASH_RETRY_REVEAL_MS if
 * the splash is still showing by then. A manual escape hatch for boot hangs
 * that aren't covered by the DB creation/readiness timeouts (e.g. a stuck
 * Monaco load, or anything else upstream of switchDatabase()).
 */
function scheduleSplashRetryReveal() {
  if (splashRetryTimer) return;
  splashRetryTimer = setTimeout(() => {
    splashRetryTimer = null;
    if (splashEl.splashRetry) splashEl.splashRetry.hidden = false;
  }, SPLASH_RETRY_REVEAL_MS);
}

splashEl.splashRetry?.addEventListener("click", () => window.location.reload());

/**
 * Inner markup for one query-studio instance: editor + results pane (with
 * its Results/History/ERD tabs) plus its own toast and db-loading overlay.
 * Injected by createQueryStudio() into any container that should become a
 * studio - a hand-placed `<div class="query-studio">` or one auto-built by
 * convertWebsqlCodeBlocks() - so a page only ever needs an empty container
 * (or a `pre.websql` code block); none of this HTML needs to be hand-written.
 */
const QUERY_STUDIO_TEMPLATE = `
  <main class="layout">
    <section class="workspace">
      <div data-role="editor-pane" class="editor-pane"></div>

      <div class="resizer" data-role="resizer"></div>

      <div class="results-pane">
        <div class="results-header">
          <div class="results-view-tabs" role="tablist" aria-label="Results views">
            <button data-role="btn-view-results" class="results-view-tab is-active" role="tab" aria-selected="true">Results</button>
            <button data-role="btn-view-history" class="results-view-tab" role="tab" aria-selected="false">History</button>
            <button data-role="btn-view-erd" class="results-view-tab" role="tab" aria-selected="false">ERD</button>
          </div>
          <span data-role="results-meta" class="results-meta"></span>
          <div data-role="erd-toolbar" class="erd-toolbar" hidden>
            <select data-role="erd-mode-select" class="erd-select" title="ERD interaction mode" aria-label="ERD interaction mode">
              <option value="sql">Write SQL</option>
              <option value="edit">Edit Diagram</option>
            </select>
            <select data-role="erd-clause-select" class="erd-select" title="SQL clause to build" aria-label="SQL clause to build">
              <option value="select">Select</option>
              <option value="where">Where</option>
              <option value="orderby">Order By</option>
            </select>
            <button data-role="btn-erd-zoom-out" class="icon-btn" title="Zoom out" aria-label="ERD zoom out">−</button>
            <span data-role="erd-zoom-label" class="erd-zoom-label">100%</span>
            <button data-role="btn-erd-zoom-in" class="icon-btn" title="Zoom in" aria-label="ERD zoom in">+</button>
            <button data-role="btn-erd-refresh" class="icon-btn" title="Refresh ERD" aria-label="Refresh ERD">⟲</button>
            <button data-role="btn-erd-log-positions" class="icon-btn" title="Log table positions as JSON (admin)" aria-label="Log ERD table positions" hidden>{ }</button>
          </div>
          <div class="results-header-actions">
            <button data-role="btn-open-new-tab" class="icon-btn icon-btn-open-tab" title="Open in New Tab" aria-label="Open in New Tab">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M6 3H3.5A1.5 1.5 0 0 0 2 4.5v8A1.5 1.5 0 0 0 3.5 14h8a1.5 1.5 0 0 0 1.5-1.5V10M10 2h4v4M14 2 7 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button data-role="btn-run" class="btn btn-primary" title="Run query (Ctrl/Cmd+Enter)">
              <span class="icon run-icon">▶</span>
              <span class="spinner spinner-btn" hidden aria-hidden="true"></span>
              Run
            </button>
          </div>
        </div>
        <div data-role="results-body" class="results-body">
          <div class="empty-hint">Run a query to see results here.</div>
        </div>
      </div>
    </section>
  </main>

  <div data-role="toast" class="toast" hidden></div>

  <div data-role="db-loading-overlay" class="pglite-loading-overlay" hidden>
    <div class="pglite-loading-dialog" role="alertdialog" aria-live="assertive" aria-busy="true">
      <span class="spinner pglite-spinner-lg" aria-hidden="true"></span>
      <div class="pglite-loading-dialog-text">
        <div data-role="db-loading-title" class="pglite-loading-dialog-title">Loading database…</div>
        <div data-role="db-loading-subtitle" class="pglite-loading-dialog-subtitle">This may take a moment on first load.</div>
      </div>
    </div>
  </div>
`;

/**
 * Builds one independent query-studio instance (its own editor, database
 * connection, results/history/ERD state) scoped to `root` - a `.query-studio`
 * container element. Every DOM lookup inside is scoped to `root` via
 * `data-role` attributes instead of ids, since a page can host more than one
 * of these at once and ids must be unique per document.
 * @param {HTMLElement} root
 * @param {string} instanceId - Unique per instance; suffixes storage keys (query history, shared-DB id) so instances never bleed into each other.
 * @param {{ initialSql?: string, datasetLabel?: string, autoCascade?: boolean }} [options] - initialSql
 *   seeds the editor (and overrides the `?sql=` URL param); datasetLabel names a dataset to load as
 *   if `?data=` had been set for this instance alone, and causes it to boot its database and run its
 *   query immediately rather than waiting for the reader's first Run; autoCascade opts this instance
 *   into running its own query automatically once any other autoCascade instance on the page runs
 *   its first query (see firstQueryRan) - all three are set for studios auto-built from a
 *   `pre.websql` code block (see convertWebsqlCodeBlocks / datasetLabelFromClassList).
 */
function createQueryStudio(root, instanceId, options = {}) {
  root.classList.add("query-studio");
  root.innerHTML = QUERY_STUDIO_TEMPLATE;

  //for getting data from websqldata.blogspot.com
  let scriptFragments = null
  let postsFetched = null
  let currentLabel = null
  let dataCallback = null
  const metadata = []

  /**
   * JSONP callbacks (handleFeed, handleResultFeed below) must be reachable as
   * `window[name]` - the blogspot feed response is a script that calls
   * `<callback>(...)` verbatim as a bare identifier in global scope, so the
   * name can't contain anything outside `[A-Za-z0-9_]` (a literal "-", as in
   * the "studio-0" instanceId, would make the response parse as subtraction
   * instead of a call). Since these functions are closures scoped to this
   * studio instance (each `.query-studio` on a page gets its own), they're
   * namespaced by a sanitized instanceId and registered on window below,
   * rather than sharing a single global name that the last-booted instance
   * would silently overwrite.
   */
  const callbackSafeInstanceId = instanceId.replace(/[^a-zA-Z0-9_]/g, "_");
  const jsonpFeedCallbackName = `handleFeed_${callbackSafeInstanceId}`;
  const jsonpResultCallbackName = `handleResultFeed_${callbackSafeInstanceId}`;
  window[jsonpFeedCallbackName] = (json) => handleFeed(json);
  window[jsonpResultCallbackName] = (json) => handleResultFeed(json);

  function loadBloggerFeed(label, callback, bloggerStartIndex = 1, isNextPage = false) {
    console.log("at loadBloggerFeed")
    if (callback) {
      scriptFragments = {}
      postsFetched = 0
      dataCallback = callback
      metadata.length = 0
    }
    currentLabel = label
    const script = document.createElement('script');
    console.log("fetching data")
    script.src = `https://websqldata.blogspot.com/feeds/posts/default/-/${label}?alt=json-in-script&start-index=${bloggerStartIndex}&callback=${jsonpFeedCallbackName}`;
    //  script.id = 'blogger-jsonp-script';
    
    //  const existing = document.getElementById('blogger-jsonp-script');
    //  if (existing){existing.remove()}
    document.head.appendChild(script);
  }
  

  function handleFeed(json) {
    console.log("at handle feed")
    const entries = json.feed.entry || [];
    if (entries.length > 0) {
      postsFetched += entries.length
      entries.forEach(entry => {
        for (const cat of entry.category) {
          //console.log("cat",cat, entry.title.$t)
          if (isNaN(cat.term)) {
            // this could be the search term or the description of the dataset
            if (cat.term === "metadata") {
              const meta = JSON.parse(entry.content.$t)
              meta.label = firstLabelExcept(entry.category, "metadata")
              metadata.push(meta)
            }
          } else {
            scriptFragments[cat.term] = entry.content.$t

          }
        }
      });
      // done scanning labels, now figure out which label we searched for

      //console.log("scriptFragments -------------- ",JSON.stringify(Object.keys(scriptFragments),null,2))
      //console.log("scriptFragments length-------------- ",Object.keys(scriptFragments).length)

      const startIndex = postsFetched + 1
      //console.log("startIndex -------------- ",startIndex)

      loadBloggerFeed(currentLabel, null, startIndex, true);

    } else {
      //console.log("All posts loaded successfully.",scriptFragments);
      if (Object.keys(scriptFragments).length === 0) {
        // assume we are getting metadata
        dataCallback(metadata)
      } else {
        // we have gotten the data      
        const order = Object.keys(scriptFragments).map(Number).sort((a, b) => a - b)
        for (let x = 0; x < order.length; x++) {
          order[x] = scriptFragments[order[x]]
        }
        //console.log("order.join",order.join("\n"))
        dataCallback(order.join("\n"))
      }
    }
    function firstLabelExcept(category, exclusion) {
      for (const cat of category) {
        if (cat.term !== exclusion) {
          return cat.term;
        }
      }
    }
  }

  /** Resolves loadDataFromBlog's in-flight promise (see getDataFromBlog); JSONP has no return value to await, so completion is signaled through this instead. */
  let dataLoadCompleteResolve = null;

  /**
   * Fetches and loads dataset `label` from the blog, returning a promise that
   * settles once loadDataFromBlog has fully finished (script executed, table
   * list refreshed) - not just once the fetch was kicked off. Callers that
   * need to run a query against the loaded data (e.g. ensureDeferredDbBooted)
   * must await this, or they'll run against a database that hasn't been
   * populated yet.
   */
  function getDataFromBlog(label) {
    setBusy(true);
    setDataLoading(true, `Fetching "${label}"…`);
    setStatus(`Fetching "${label}"…`);
    loadBloggerFeed(label, loadDataFromBlog)
    return new Promise((resolve) => { dataLoadCompleteResolve = resolve; });
  }
  async function loadDataFromBlog(script) {
    if (!script) {
      setDataLoading(false);
      setBusy(false);
      dataLoadCompleteResolve?.();
      dataLoadCompleteResolve = null;
      return;
    }
    //console.log("script:",script)
    try {
      await wipeCurrentDatabaseStore();
      await switchDatabase(() => createDatabase(), DEFAULT_DB_LABEL, { showLoadingOverlay: false });
      await pg.exec(script);
      await recordLoadedDatasetLabel(currentLabel);
      setDbLabel(currentLabel);
      await refreshTables();
      clearResults("Run a query to see results here.");
      await maybeSetDatabaseReadOnly();
      setDataUrlParam(currentLabel);
      showToast(`Loaded "${currentLabel}"`, "success");
    } catch (err) {
      console.error(err);
      setStatus("Ready");
      showToast(`Could not load "${currentLabel}": ${err.message}`, "error");
    } finally {
      setDataLoading(false);
      setBusy(false);
      dataLoadCompleteResolve?.();
      dataLoadCompleteResolve = null;
    }
  }

  /** Timestamp captured right before fetching a canned result post; read by handleResultFeed once the JSONP callback fires. */
  let resultFetchStartedAt = null;

  /** Dataset label from the fetched canned result's `data` property; used by applyDataUrlParameter when the `data` URL parameter itself is absent. */
  let resultDataFallback = null;

  /**
   * Fetches the single post tagged `label` from websqldata.blogspot.com, using
   * the same JSONP script-tag technique as loadBloggerFeed, and renders its
   * content as a canned query result (see downloadResultAsJson for the shape)
   * before the PGlite engine has booted. Unlike loadBloggerFeed's chunked SQL
   * scripts, this assumes exactly one post carries the label - result sets
   * previewed this way are small, so there's no need to split them across
   * posts or paginate the feed.
   */
  function loadResultFromBlog(label) {
    resultFetchStartedAt = performance.now();
    const script = document.createElement("script");
    script.src = `https://websqldata.blogspot.com/feeds/posts/default/-/${label}?alt=json-in-script&max-results=1&callback=${jsonpResultCallbackName}`;
    document.head.appendChild(script);
  }

  function handleResultFeed(json) {
    const elapsedMs = Math.round(performance.now() - resultFetchStartedAt);
    const entries = json.feed.entry || [];
    if (entries.length === 0) {
      setStatus("Ready");
      showToast(`No canned result found for "${resultLabel}"`, "error");
      return;
    }
    try {
      const result = JSON.parse(entries[0].content.$t);
      const params = new URLSearchParams(window.location.search);
      if (!params.has("sql") && result.sql && editor) {
        editor.setValue(result.sql);
        shrinkEditorToFitQuery();
      }
      if (!params.has("data") && result.data) {
        resultDataFallback = result.data;
      }
      renderResults([result], elapsedMs);
      setStatus("Ready");
    } catch (err) {
      console.error(err);
      setStatus("Ready");
      showToast(`Could not parse canned result for "${resultLabel}": ${err.message}`, "error");
    }
  }


  // end of getting data from websqldata.blogspot.com





  /**
   * Builds a stable IndexedDB / worker id from the page pathname so shared
   * mode only syncs tabs/iframes that share the same location.pathname.
   * @param {string} pathname - window.location.pathname
   */
  function sharedDbIdForPathname(pathname) {
    const path = (pathname || "/").replace(/\/+$/, "") || "/";
    //console.log("path", path);
    if (path === "/") return "websql-studio";
    const safe = path
      .replace(/^\/+/, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return safe ? `websql-studio-${safe}` : "websql-studio";
  }
  // Deliberately NOT suffixed with instanceId: when ?shared=1 is set, every
  // .query-studio instance on this page (like separate tabs/iframes on the
  // same pathname) should connect to the exact same underlying engine/store,
  // with one instance winning primary/leader status (see claimPrimaryRole)
  // and the rest proxying through it.
  const DB_ID = sharedDbIdForPathname(window.location.pathname);
  const DATA_DIR = `idb://${DB_ID}`;
  /** Enables admin-only ERD tooling with ?mode=admin */
  const isAdminMode = new URLSearchParams(window.location.search).get("mode") === "admin";
  const DEFAULT_DB_LABEL = useSharedDb ? DATA_DIR : "in-memory";

  const DEFAULT_SQL = `-- Welcome to WebSQL Studio, running PostgreSQL Lite (PGlite).
-- Write SQL below and press Run (or Ctrl/Cmd + Enter).

select now() as server_time, version() as postgres_version;`;

  // ---- State --------------------------------------------------------------

  let pg = null;
  let editor = null;
  let monacoRef = null;
  let currentFileLabel = DEFAULT_DB_LABEL;
  let currentResultSets = [];
  let currentResultSetsSql = "";
  /**
   * True once the current in-browser database has changes (edits, imports)
   * that only exist in memory/IndexedDB. Drives the beforeunload warning so a
   * refresh/close doesn't silently lose them.
   */
  let hasUnsavedChanges = false;
  let dataLoadingDepth = 0;
  let unsubLeaderChange = null;
  /** @type {'results' | 'erd' | 'history'} */
  let resultsViewMode = "results";
  /** @type {'edit' | 'sql'} Whether the ERD lets the user drag tables around or is in the (WIP) SQL-writing mode. */
  let erdMode = "sql";
  /** @type {'select' | 'where' | 'orderby'} Which clause a column click in Write SQL mode builds. */
  let erdClause = "select";
  let erdZoom = 1;
  /** @type {Map<string, { x: number, y: number }>} User-dragged ERD positions only. */
  let erdPositions = new Map();
  /** @type {{ nodes: Map<string, any>, relationships: Array<any> } | null} */
  let erdState = null;
  /** Whether the schema/ERD view has already been shown for the currently loaded database. */
  let hasShownSchemaForCurrentDb = false;
  /** @type {{ tableName: string, offsetX: number, offsetY: number, pointerId: number } | null} */
  let erdDrag = null;
  /** @type {{ distance: number, zoom: number } | null} Active touch pinch session. */
  let erdPinch = null;
  /** @type {number | null} Zoom at the start of a Safari trackpad gesture. */
  let erdGestureStartZoom = null;
  /** @type {number | null} Index of the highlighted ERD relationship, or null. */
  let erdSelectedRelIndex = null;
  let lastResultsHtml = `<div class="empty-hint">Run a query to see results here.</div>`;
  let lastResultsMeta = "";
  let lastResultsClassName = "results-body";
  /** Current (0-based) page number per result-set index, for result sets over RESULTS_PAGE_SIZE rows. */
  let resultPageByIdx = new Map();

  // ---- DOM refs -------------------------------------------------------------

  /** Finds a descendant of `root` by its `data-role` attribute (each studio instance owns its own copy of these elements, so plain ids would collide across instances). */
  function ref(role) {
    return root.querySelector(`[data-role="${role}"]`);
  }

  const el = {
    run: ref("btn-run"),
    openNewTab: ref("btn-open-new-tab"),
    resultsBody: ref("results-body"),
    resultsMeta: ref("results-meta"),
    viewResults: ref("btn-view-results"),
    viewHistory: ref("btn-view-history"),
    viewErd: ref("btn-view-erd"),
    erdToolbar: ref("erd-toolbar"),
    erdModeSelect: ref("erd-mode-select"),
    erdClauseSelect: ref("erd-clause-select"),
    erdZoomIn: ref("btn-erd-zoom-in"),
    erdZoomOut: ref("btn-erd-zoom-out"),
    erdZoomLabel: ref("erd-zoom-label"),
    erdRefresh: ref("btn-erd-refresh"),
    erdLogPositions: ref("btn-erd-log-positions"),
    toast: ref("toast"),
    resizer: ref("resizer"),
    editorPane: ref("editor-pane"),
    dbLoadingOverlay: ref("db-loading-overlay"),
    dbLoadingTitle: ref("db-loading-title"),
    dbLoadingSubtitle: ref("db-loading-subtitle"),
  };
  console.log("websql code is running", instanceId)
  applyTheme(getPreferredTheme());
  el.erdLogPositions.hidden = !isAdminMode;

  // ---- Small UI helpers -----------------------------------------------------

  function setStatus(text) {
    // No status bar in the embed UI; kept as a no-op so callers stay simple.
  }

  /**
   * Tracks the current database name (used by canned-result JSON export).
   * @param {string} label - Filename or display name for the loaded database.
   */
  function setDbLabel(label) {
    currentFileLabel = label;
  }

  // ---- Theme -----------------------------------------------------------------

  function monacoThemeFor(theme) {
    return theme === "dark" ? "vs-dark" : "vs";
  }

  function getPreferredTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return "dark";
  }

  function applyTheme(theme) {
    // Namespaced (not the plain `data-theme` a host page might already use
    // for its own dark-mode toggling) since this sets an attribute on
    // <html> itself - see embed-style's `:root[data-pglite-theme="dark"]`.
    document.documentElement.setAttribute("data-pglite-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    if (monacoRef && editor) monacoRef.editor.setTheme(monacoThemeFor(theme));
  }

  function showToast(message, kind) {
    el.toast.textContent = message;
    el.toast.className = "toast" + (kind ? " " + kind : "");
    el.toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      el.toast.hidden = true;
    }, 3200);
  }

  // ---- Styled dialogs (replace native confirm()/prompt()) --------------------

  /**
   * Builds the overlay + dialog shell shared by `showConfirmDialog` and
   * `showPromptDialog`, styled to match the rest of the app instead of the
   * browser's native dialog boxes.
   * @param {string} title
   * @returns {{ overlay: HTMLElement, dialog: HTMLElement }}
   */
  function createAppDialogShell(title) {
    const overlay = document.createElement("div");
    overlay.className = "pglite-loading-overlay pglite-app-dialog-overlay";

    const dialog = document.createElement("div");
    dialog.className = "pglite-loading-dialog pglite-app-dialog";
    dialog.innerHTML = `<div class="pglite-app-dialog-header pglite-loading-dialog-title">${escapeHtml(title)}</div>`;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    return { overlay, dialog };
  }

  /**
   * Styled replacement for the browser's native `confirm()`.
   * @param {string} message
   * @param {{ confirmLabel?: string, cancelLabel?: string, danger?: boolean }} [opts]
   * @returns {Promise<boolean>} Whether the user confirmed.
   */
  function showConfirmDialog(message, opts = {}) {
    const { confirmLabel = "OK", cancelLabel = "Cancel", danger = false } = opts;
    return new Promise((resolve) => {
      const { overlay, dialog } = createAppDialogShell(message);
      dialog.insertAdjacentHTML(
        "beforeend",
        `<div class="pglite-app-dialog-actions">
         <button type="button" class="btn pglite-app-dialog-cancel">${escapeHtml(cancelLabel)}</button>
         <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"} pglite-app-dialog-confirm">${escapeHtml(confirmLabel)}</button>
       </div>`
      );

      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        document.removeEventListener("keydown", onKeydown);
        overlay.remove();
        resolve(result);
      };
      const onKeydown = (e) => {
        if (e.repeat) return;
        if (e.key !== "Escape" && e.key !== "Enter") return;
        e.preventDefault();
        finish(e.key === "Enter");
      };

      dialog.querySelector(".pglite-app-dialog-cancel").addEventListener("click", () => finish(false));
      dialog.querySelector(".pglite-app-dialog-confirm").addEventListener("click", () => finish(true));
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) finish(false);
      });
      document.addEventListener("keydown", onKeydown);
      dialog.querySelector(".pglite-app-dialog-confirm").focus();
    });
  }

  /**
   * Styled replacement for the browser's native `prompt()`.
   * @param {string} message
   * @param {{ placeholder?: string, defaultValue?: string, confirmLabel?: string, cancelLabel?: string }} [opts]
   * @returns {Promise<string | null>} The entered value, or null if cancelled.
   */
  function showPromptDialog(message, opts = {}) {
    const { placeholder = "", defaultValue = "", confirmLabel = "OK", cancelLabel = "Cancel" } = opts;
    return new Promise((resolve) => {
      const { overlay, dialog } = createAppDialogShell(message);
      dialog.insertAdjacentHTML(
        "beforeend",
        `<div class="pglite-app-dialog-body">
         <input type="text" class="pglite-app-dialog-input" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(defaultValue)}" />
       </div>
       <div class="pglite-app-dialog-actions">
         <button type="button" class="btn pglite-app-dialog-cancel">${escapeHtml(cancelLabel)}</button>
         <button type="button" class="btn btn-primary pglite-app-dialog-confirm">${escapeHtml(confirmLabel)}</button>
       </div>`
      );

      const input = dialog.querySelector(".pglite-app-dialog-input");
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        document.removeEventListener("keydown", onKeydown);
        overlay.remove();
        resolve(result);
      };
      const onKeydown = (e) => {
        if (e.repeat) return;
        if (e.key === "Escape") {
          e.preventDefault();
          finish(null);
        } else if (e.key === "Enter") {
          e.preventDefault();
          finish(input.value);
        }
      };

      dialog.querySelector(".pglite-app-dialog-cancel").addEventListener("click", () => finish(null));
      dialog.querySelector(".pglite-app-dialog-confirm").addEventListener("click", () => finish(input.value));
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) finish(null);
      });
      document.addEventListener("keydown", onKeydown);
      input.focus();
      input.select();
    });
  }

  /**
   * Enables or disables primary actions and shows a spinner on the Run button.
   * @param {boolean} isBusy - Whether the UI should appear busy.
   */
  function setBusy(isBusy) {
    el.run.disabled = isBusy;
    el.run.classList.toggle("is-busy", isBusy);
    el.run.setAttribute("aria-busy", isBusy ? "true" : "false");
    const runIcon = el.run.querySelector(".run-icon");
    const runSpinner = el.run.querySelector(".spinner");
    if (runIcon) runIcon.hidden = isBusy;
    if (runSpinner) runSpinner.hidden = !isBusy;
  }

  function showDbLoadingOverlay(title, subtitle) {
    el.dbLoadingTitle.textContent = title || "Loading database…";
    el.dbLoadingSubtitle.textContent = subtitle || "This may take a moment on first load.";
    el.dbLoadingOverlay.hidden = false;
  }

  function hideDbLoadingOverlay() {
    el.dbLoadingOverlay.hidden = true;
  }

  function setDataLoading(isLoading, message = "Loading data…") {
    if (isLoading) {
      dataLoadingDepth += 1;
      showDbLoadingOverlay(message, "This may take a moment.");
      return;
    }

    dataLoadingDepth = Math.max(dataLoadingDepth - 1, 0);
    if (dataLoadingDepth === 0) {
      hideDbLoadingOverlay();
    }
  }

  // ---- Monaco setup ----------------------------------------------------------

  function initMonaco() {
    return ensureMonacoLoaderLoaded().then(() => new Promise((resolve) => {
      require.config({
        paths: { vs: `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs` },
      });
      require(["vs/editor/editor.main"], (monaco) => {
        monacoRef = monaco;
        const params = new URLSearchParams(window.location.search);
        const initialSql = options.initialSql ?? (params.has("sql") ? params.get("sql") : DEFAULT_SQL);
        editor = monaco.editor.create(el.editorPane, {
          value: initialSql || DEFAULT_SQL,
          language: "sql",
          theme: monacoThemeFor(document.documentElement.getAttribute("data-pglite-theme")),
          fontSize: 13,
          minimap: { enabled: false },
          automaticLayout: true,
          scrollBeyondLastLine: false,
          wordWrap: "on",
        });
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => userRunQuery());
        resolve();
      });
    }));
  }

  /**
   * Loads the `sql` URL parameter's query into the editor. Never auto-runs it -
   * every studio waits for the reader's own Run/Ctrl+Enter (see useDeferredDb) -
   * so this only ever seeds the editor's starting text.
   */
  function applySqlUrlParameter() {
    if (!editor) return;
    // A studio seeded from a pre.websql snippet keeps its own SQL regardless
    // of a page-wide ?sql= param (which would otherwise clobber every studio).
    if (options.initialSql) return;

    const params = new URLSearchParams(window.location.search);
    if (!params.has("sql")) return;

    const value = params.get("sql");
    if (value !== null) {
      editor.setValue(value);
    }
  }

  /**
   * Loads a dataset published on websqldata.blogspot.com when the page is
   * opened with a `data` URL parameter (e.g. the "Load Data" modal's links to
   * `/2000/03/blank.html?data=<label>`). Falls back to the `data` label
   * recorded on a fetched canned `result` object (see handleResultFeed) when
   * the URL parameter itself is omitted, or to this instance's own
   * `options.datasetLabel` (see datasetLabelFromClassList) - checked first,
   * since a per-instance dataset class names exactly which dataset that one
   * studio should load regardless of any page-wide `?data=` param.
   *
   * Checks the currently-attached database for that same label (see
   * getLoadedDatasetLabel) before fetching anything - the shared idb:// store
   * persists across reloads, so a reload with the same `data` param would
   * otherwise re-run the load script against tables it already created,
   * failing with "relation already exists" on the first CREATE TABLE.
   */
  async function applyDataUrlParameter() {
    const params = new URLSearchParams(window.location.search);
    const label = options.datasetLabel || params.get("data") || resultDataFallback;
    if (!label) return;
    if ((await getLoadedDatasetLabel()) === label) {
      currentLabel = label;
      setDbLabel(label);
      setDataUrlParam(label);
      return;
    }
    await getDataFromBlog(label);
  }

  /** Schema used for this app's own bookkeeping tables, kept out of the public schema so it never shows up in the table list/ERD or collides with a dataset's own tables. */
  const APP_META_SCHEMA = "_websql_studio";
  const LOADED_DATASET_TABLE = `${APP_META_SCHEMA}.loaded_dataset`;

  /**
   * Reads the blog dataset label recorded on the currently-attached database
   * by recordLoadedDatasetLabel, or null if none is recorded (fresh/empty
   * store, or one populated some other way - file import, manual SQL, etc.).
   */
  async function getLoadedDatasetLabel() {
    if (!pg) return null;
    try {
      const { rows } = await pg.query(`select label from ${LOADED_DATASET_TABLE} limit 1;`);
      return rows[0]?.label ?? null;
    } catch (_) {
      return null;
    }
  }

  /** Records that `label` is the blog dataset now loaded into the current database, for getLoadedDatasetLabel to check on a future reload. */
  async function recordLoadedDatasetLabel(label) {
    if (!pg) return;
    try {
      await pg.exec(
        `create schema if not exists ${APP_META_SCHEMA};
       create table if not exists ${LOADED_DATASET_TABLE} (label text);
       delete from ${LOADED_DATASET_TABLE};`
      );
      await pg.query(`insert into ${LOADED_DATASET_TABLE} (label) values ($1);`, [label]);
    } catch (err) {
      console.error("Failed to record loaded dataset label", err);
    }
  }

  /**
   * Rejects with `message` if `promise` hasn't settled within `ms`. Used to
   * turn a stuck cross-tab coordination handshake into a visible, recoverable
   * failure instead of leaving the UI waiting forever.
   */
  function withTimeout(promise, ms, message) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), ms);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  /**
   * Waits until `pg` is actually ready to run queries. PGliteWorker.create()
   * can resolve before the instance has finished connecting to the leader (or,
   * for the leader itself, before its local PGlite is ready) — `waitReady`
   * resolves once that settles. Plain (non-shared) PGlite instances don't
   * expose it and are already ready by the time create() resolves.
   * Bounded by DB_READY_TIMEOUT_MS so a stuck cross-tab handshake (e.g. one of
   * several simultaneously-booting iframes never completing leader election)
   * surfaces as an error instead of hanging the caller forever.
   */
  async function waitForDbReady() {
    if (pg && "waitReady" in pg) {
      await withTimeout(
        pg.waitReady,
        DB_READY_TIMEOUT_MS,
        "Timed out waiting for the shared database connection to become ready. Try reloading this frame."
      );
    }
  }

  /**
   * Updates the `data` URL parameter to reflect the dataset currently loaded,
   * leaving every other URL parameter untouched, so copying the address bar
   * gives a direct link back to this dataset. Uses replaceState so loading
   * datasets one after another doesn't pile up browser history entries.
   */
  function setDataUrlParam(label) {
    const url = new URL(window.location.href);
    url.searchParams.set("data", label);
    window.history.replaceState(window.history.state, "", url);
  }

  /**
   * Builds a shareable URL for the current page setup: same path, with `sql`
   * set to the editor contents. Omits shared/readonly/style so the new tab is
   * a normal private studio session (not an embed or shared DB).
   */
  function buildCurrentSetupUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete("style");
    url.searchParams.delete(SHARED_DB_PARAM);
    url.searchParams.delete("readonly");
    if (editor) {
      const sql = editor.getValue();
      if (sql) url.searchParams.set("sql", sql);
      else url.searchParams.delete("sql");
    }
    return url.toString();
  }

  /**
   * Opens a new browser tab with a URL reflecting the current studio setup.
   */
  function handleOpenInNewTab() {
    const url = buildCurrentSetupUrl();
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // ---- PGlite setup ------------------------------------------------------------

  /**
   * Dynamically loads the main-thread PGlite constructor from the CDN.
   */
  async function loadPGlite() {
    const mod = await import(PGLITE_URL);
    return mod.PGlite;
  }

  /**
   * Dynamically loads the PGliteWorker client from the CDN.
   */
  async function loadPGliteWorker() {
    const mod = await import(PGLITE_WORKER_URL);
    return mod.PGliteWorker;
  }

  /**
   * Creates a module Worker from an inlined Blob URL (no separate worker file).
   */
  function createPGliteBlobWorker() {
    const source = `
import { PGlite } from ${JSON.stringify(PGLITE_URL)};
import { worker } from ${JSON.stringify(PGLITE_WORKER_URL)};

worker({
  async init(options) {
    return new PGlite({
      dataDir: options.dataDir,
      loadDataDir: options.loadDataDir,
    });
  },
});
`;
    const blob = new Blob([source], { type: "text/javascript" });
    return new Worker(URL.createObjectURL(blob), { type: "module" });
  }

  /**
   * Serializes an async operation across same-origin tabs/iframes using the
   * Web Locks API, keyed by `id`. Whoever asks first runs `fn` immediately;
   * everyone else queues and only starts once the current holder's `fn`
   * promise has settled. Falls back to running `fn` directly if Web Locks
   * isn't available.
   * Bounded by DB_READY_TIMEOUT_MS: the lock is released after that timeout
   * even if `fn` never settles (e.g. a dedicated worker that never boots), so
   * one stuck instance can't starve every other instance queued behind it on
   * the same lock - only its own attempt fails/surfaces as an error.
   * @param {string} id - Lock name scope (e.g. DB_ID).
   * @param {() => Promise<any>} fn - Async operation to serialize.
   */
  function withInitLock(id, fn) {
    if (!("locks" in navigator)) return fn();
    return new Promise((resolve, reject) => {
      navigator.locks
        .request(`pglite-init:${id}`, () =>
          withTimeout(fn(), DB_READY_TIMEOUT_MS, "Timed out creating the shared database connection.").then(
            resolve,
            reject
          )
        )
        .catch(reject);
    });
  }

  /**
   * Claims a persistent, never-released Web Lock scoped to `id`. The first
   * caller (across all same-origin tabs/iframes) to request it gets it and
   * holds it for the lifetime of this page/frame; the browser releases it
   * automatically when this browsing context goes away (tab close, navigation,
   * or the iframe being removed). Everyone else's `{ ifAvailable: true }`
   * request comes back empty-handed as soon as the first caller holds it, so
   * this doubles as a durable "am I the primary instance?" flag - unlike
   * PGliteWorker's own internal leader state, which this code doesn't read
   * because its exact readiness/timing isn't part of PGlite's documented API.
   * Falls back to `true` (best effort, uncoordinated) if Web Locks isn't
   * available.
   * @param {string} id - Lock name scope (e.g. DB_ID).
   */
  function claimPrimaryRole(id) {
    if (!("locks" in navigator)) return Promise.resolve(true);
    return new Promise((resolve) => {
      navigator.locks
        .request(`pglite-primary:${id}`, { ifAvailable: true }, (lock) => {
          if (!lock) {
            resolve(false);
            return;
          }
          resolve(true);
          return new Promise(() => { }); // hold the lock until this context is torn down
        })
        .catch(() => resolve(false));
    });
  }

  /**
   * Caches claimPrimaryRole's result for the lifetime of this page. The lock it
   * requests is held forever once granted (see claimPrimaryRole), so a second
   * request for the same id - e.g. createDatabase() running again for a data
   * reload after the first call already claimed it - would find its own lock
   * unavailable and wrongly resolve false. Every createDatabase() call reuses
   * this instead of re-requesting the lock.
   */
  let primaryRoleClaim = null;
  function claimPrimaryRoleOnce(id) {
    if (!primaryRoleClaim) primaryRoleClaim = claimPrimaryRole(id);
    return primaryRoleClaim;
  }

  /** Set once per page load by createDatabase(); see claimPrimaryRole(). */
  let isPrimaryInstance = false;

  /**
   * Creates a database: private in-memory PGlite by default, or a shared
   * PGliteWorker + IndexedDB instance when ?shared=1 is present.
   * Shared instances are keyed by location.pathname (via DB_ID), so only
   * tabs/iframes on the same path share one database.
   * Shared creation is serialized via withInitLock so that when several
   * iframes/tabs boot at once, one becomes primary and finishes creating the
   * PGliteWorker before the next one starts, instead of all racing at once.
   * Primary status (see claimPrimaryRole) is decided inside that same
   * serialized turn, so the first instance processed is always the one that
   * wins it.
   * @param {{ loadDataDir?: Blob | File }} [options] - Extra PGlite options (e.g. tarball load).
   */
  async function createDatabase(options = {}) {
    if (useSharedDb) {
      const PGliteWorker = await loadPGliteWorker();
      return withInitLock(DB_ID, async () => {
        isPrimaryInstance = await claimPrimaryRoleOnce(DB_ID);
        return PGliteWorker.create(createPGliteBlobWorker(), {
          id: DB_ID,
          dataDir: DATA_DIR,
          ...options,
        });
      });
    }

    isPrimaryInstance = true;
    const PGlite = await loadPGlite();
    return PGlite.create(options);
  }

  /**
   * Deletes the shared IndexedDB database used by dataDir.
   * @param {string} name - IndexedDB database name (path after idb://).
   */
  function deleteIndexedDb(name) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error(`Failed to delete IndexedDB "${name}"`));
      req.onblocked = () => {
        // Other tabs/iframes may still hold the DB; deletion finishes when they close.
        console.warn(`IndexedDB "${name}" delete blocked by other connections`);
      };
    });
  }

  /**
   * Closes the current client. In shared mode, also wipes the IndexedDB store.
   */
  async function wipeCurrentDatabaseStore() {
    if (unsubLeaderChange) {
      unsubLeaderChange();
      unsubLeaderChange = null;
    }
    if (pg) {
      try {
        await pg.close();
      } catch (_) {
        /* ignore */
      }
      pg = null;
    }
    if (useSharedDb) {
      await deleteIndexedDb(DB_ID);
    }
  }

  /**
   * Subscribes to leader changes so the table list stays in sync across tabs/iframes.
   * @param {object} instance - PGlite or PGliteWorker instance.
   */
  function bindLeaderChange(instance) {
    if (unsubLeaderChange) {
      unsubLeaderChange();
      unsubLeaderChange = null;
    }
    if (!useSharedDb || !instance || typeof instance.onLeaderChange !== "function") return;
    unsubLeaderChange = instance.onLeaderChange(() => {
      refreshTables().catch(() => { });
    });
  }

  /**
   * Replaces the active database handle and refreshes UI.
   * @param {() => Promise<object>} factory - Async factory that returns a DB client.
   * @param {string} label - Label shown in the status bar.
   * @param {{ showLoadingOverlay?: boolean, overlayText?: string }} [options] - Set
   *   showLoadingOverlay to false for blank/fresh database creation, which is
   *   effectively instant and isn't "loading" anything. Set overlayText to
   *   override the default `Loading "${label}"…` text - e.g. when label is
   *   the raw idb:// storage URI and a real dataset load is about to follow.
   */
  async function switchDatabase(factory, label, { showLoadingOverlay = true, overlayText } = {}) {
    setBusy(true);
    setStatus("Loading database…");
    if (showLoadingOverlay) {
      setDataLoading(true, overlayText || (label && label !== "in-memory" ? `Loading "${label}"…` : "Loading database…"));
    }
    try {
      const next = await factory();
      if (pg) {
        try {
          await pg.close();
        } catch (_) {
          /* ignore */
        }
      }
      pg = next;
      await waitForDbReady();
      bindLeaderChange(pg);
      hasShownSchemaForCurrentDb = false;
      erdState = null;
      erdPositions = new Map();
      setDbLabel(label);
      setStatus("Ready");
      await refreshTables();
      clearResults("Run a query to see results here.");
      clearUnsavedChanges();
    } catch (err) {
      console.error(err);
      setStatus("Failed to load database");
      showToast("Could not load database: " + err.message, "error");
    } finally {
      setBusy(false);
      if (showLoadingOverlay) setDataLoading(false);
    }
  }

  /**
   * Locks the current session so subsequent transactions are read-only.
   * No-op unless ?readonly=1 is set. Call only after data has been loaded.
   */
  async function maybeSetDatabaseReadOnly() {
    if (!useReadOnly || !pg) return;
    await pg.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY;");
  }

  // ---- Query execution ---------------------------------------------------------

  function isMetaCommand(text) {
    return typeof text === "string" && text.trim().startsWith("\\");
  }

  /** Matches the leading keyword of statements that only read data. */
  const READ_ONLY_SQL_RE = /^\s*(select|with|explain|show|table)\b/i;

  /** Heuristic: every semicolon-separated statement in `sql` looks read-only. */
  function sqlLooksReadOnly(sql) {
    return sql
      .split(";")
      .map((stmt) => stmt.trim())
      .filter(Boolean)
      .every((stmt) => READ_ONLY_SQL_RE.test(stmt));
  }

  function markUnsavedChanges() {
    hasUnsavedChanges = true;
  }

  function clearUnsavedChanges() {
    hasUnsavedChanges = false;
  }

  function normalizeMetaObjectName(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    const withoutSchema = trimmed.replace(/^public\./i, "");
    return withoutSchema.replace(/^"(.*)"$/, "$1").split(".").pop() || "";
  }

  function buildResultSet(result) {
    const fields = Array.isArray(result.fields)
      ? result.fields.map((field) => ({ name: field.name || field.column_name || field.column || String(field) }))
      : Object.keys(result.rows?.[0] || {}).map((name) => ({ name }));
    const rows = Array.isArray(result.rows) ? result.rows : [];
    return { fields, rows };
  }

  async function runMetaCommand(text) {
    const trimmed = text.trim();
    const [commandToken, ...rest] = trimmed.split(/\s+/);
    const command = commandToken.toLowerCase();
    const arg = rest.join(" ").trim();
    const objectName = normalizeMetaObjectName(arg);

    if (command === "\\d" || command === "\\d+") {
      if (objectName) {
        const { rows, fields } = await pg.query(
          `select column_name as column_name, data_type as data_type, is_nullable as is_nullable
         from information_schema.columns
         where table_schema = 'public' and table_name = $1
         order by ordinal_position;`,
          [objectName]
        );
        return [buildResultSet({ fields, rows })];
      }

      const { rows, fields } = await pg.query(
        `select table_name as name, 'table' as kind
       from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'
       union all
       select table_name as name, 'view' as kind
       from information_schema.views
       where table_schema = 'public'
       order by name;`
      );
      return [buildResultSet({ fields, rows })];
    }

    if (command === "\\dt") {
      if (objectName) {
        const { rows, fields } = await pg.query(
          `select table_name as name, 'table' as kind
         from information_schema.tables
         where table_schema = 'public' and table_type = 'BASE TABLE' and table_name = $1;`,
          [objectName]
        );
        return [buildResultSet({ fields, rows })];
      }

      const { rows, fields } = await pg.query(
        `select table_name as name, 'table' as kind
       from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'
       order by table_name;`
      );
      return [buildResultSet({ fields, rows })];
    }

    if (command === "\\z") {
      if (objectName) {
        const { rows, fields } = await pg.query(
          `select grantee, privilege_type
         from information_schema.role_table_grants
         where table_schema = 'public' and table_name = $1
         order by grantee, privilege_type;`,
          [objectName]
        );
        return [buildResultSet({ fields, rows })];
      }

      const { rows, fields } = await pg.query(
        `select table_schema as schema_name, table_name as object_name, grantee, privilege_type
       from information_schema.role_table_grants
       where table_schema = 'public'
       order by table_name, grantee, privilege_type;`
      );
      return [buildResultSet({ fields, rows })];
    }

    if (command.startsWith("\\")) {
      const { rows, fields } = await pg.query(
        `select 'Unsupported meta command' as message, $1 as command;`,
        [commandToken]
      );
      return [buildResultSet({ fields, rows })];
    }

    throw new Error(`Unsupported meta command: ${commandToken}`);
  }

  function shrinkEditorToFitQuery() {
    if (!editor || !monacoRef) return;
    const minHeight = 80; // matches .editor-pane min-height in styles.css
    const lineCount = editor.getModel().getLineCount();
    const lineHeight = editor.getOption(monacoRef.editor.EditorOption.lineHeight);
    const padding = editor.getOption(monacoRef.editor.EditorOption.padding) || { top: 0, bottom: 0 };
    const fitHeight = lineCount * lineHeight + padding.top + padding.bottom;
    const targetHeight = Math.max(fitHeight, minHeight);
    const currentHeight = el.editorPane.getBoundingClientRect().height;
    if (targetHeight < currentHeight) {
      el.editorPane.style.flex = `0 0 ${targetHeight}px`;
      editor.layout();
    }
  }

  /**
   * Resolves once this studio's deferred database (see useDeferredDb) has
   * booted. Null until the first Run triggers it; cached afterward so
   * concurrent Run clicks (e.g. an impatient double-click while the engine is
   * still booting) await the same boot instead of one of them racing ahead and
   * running its query against a still-null `pg`.
   */
  let deferredDbBootPromise = null;

  /** Whether this instance has ever run a query (auto or manual) - guards against the autoCascade listener in main() re-running a query the reader already ran themselves. */
  let hasRunOnce = false;

  function ensureDeferredDbBooted() {
    if (!deferredDbBootPromise) {
      deferredDbBootPromise = (async () => {
        await switchDatabase(() => createDatabase(), DEFAULT_DB_LABEL, {
          showLoadingOverlay: true,
          overlayText: "Preparing database…",
        });
        if (isPrimaryInstance) {
          await applyDataUrlParameter();
        }
      })();
    }
    return deferredDbBootPromise;
  }

  /** Runs the query as an explicit user action - the first call boots this studio's database. */
  async function userRunQuery() {
    hasRunOnce = true;
    await ensureDeferredDbBooted();
    runQuery();
  }

  async function runQuery() {
    if (!pg) return;
    const sql = editor.getValue().trim();
    if (!sql) return;

    //console.log("Executing query:", sql);
    shrinkEditorToFitQuery();

    setBusy(true);
    setStatus("Running…");
    const startedAt = performance.now();
    try {
      const isMeta = isMetaCommand(sql);
      const results = isMeta ? await runMetaCommand(sql) : await pg.exec(sql);
      if (!isMeta && !sqlLooksReadOnly(sql)) markUnsavedChanges();
      const elapsed = Math.round(performance.now() - startedAt);
      addQueryHistoryEntry({ sql, ok: true, elapsedMs: elapsed });
      currentResultSetsSql = sql;
      renderResults(results, elapsed);
      setStatus("Ready");
      refreshTables();
    } catch (err) {
      console.error(err);
      addQueryHistoryEntry({ sql, ok: false, error: err.message || String(err) });
      renderError(err);
      setStatus("Query failed");
    } finally {
      setBusy(false);
      if (options.autoCascade) announceFirstQueryRan();
    }
  }

  function clearResults(message) {
    currentResultSets = [];
    currentResultSetsSql = "";
    resultPageByIdx = new Map();
    lastResultsHtml = `<div class="empty-hint">${escapeHtml(message)}</div>`;
    lastResultsMeta = "";
    lastResultsClassName = "results-body";
    setResultsView("results");
  }

  function renderError(err) {
    currentResultSets = [];
    currentResultSetsSql = "";
    resultPageByIdx = new Map();
    lastResultsHtml = `<div class="error-box">${escapeHtml(err.message || String(err))}</div>`;
    lastResultsMeta = "";
    lastResultsClassName = "results-body has-error";
    setResultsView("results");
  }

  function buildResultBlockHtml(res, i) {
    const hasRows = res.fields && res.fields.length > 0;
    const labelText = currentResultSets.length > 1 ? `Statement ${i + 1}` : "";
    const csvBtn = hasRows
      ? `<button class="csv-btn" data-idx="${i}" title="Download this result as CSV">⭳ CSV</button>`
      : "";
    const jsonBtn = hasRows && isAdminMode
      ? `<button class="result-json-btn" data-idx="${i}" title="Download the raw pg.exec() result as JSON, for hosting as a canned preview">⭳ JSON</button>`
      : "";
    const actions = `<div class="result-block-actions">${csvBtn}${jsonBtn}</div>`;
    const header = labelText || actions
      ? `<div class="result-block-label"><span>${labelText}</span>${actions}</div>`
      : "";
    if (!hasRows) {
      const affected = typeof res.affectedRows === "number" ? res.affectedRows : 0;
      return `<div class="result-block">${header}<div class="empty-hint">OK — ${affected} row(s) affected.</div></div>`;
    }

    const totalRows = res.rows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / RESULTS_PAGE_SIZE));
    const page = Math.min(resultPageByIdx.get(i) || 0, totalPages - 1);
    const start = page * RESULTS_PAGE_SIZE;
    const pageRows = totalRows > RESULTS_PAGE_SIZE ? res.rows.slice(start, start + RESULTS_PAGE_SIZE) : res.rows;
    const pager = totalRows > RESULTS_PAGE_SIZE ? renderPager(i, page, totalPages, totalRows, start, start + pageRows.length) : "";

    return `<div class="result-block">${header}${renderTable(res, pageRows, start)}${pager}</div>`;
  }

  function renderPager(idx, page, totalPages, totalRows, rangeStart, rangeEnd) {
    return `<div class="result-pager">
    <span class="pager-info">Rows ${rangeStart + 1}–${rangeEnd} of ${totalRows}</span>
    <div class="pager-controls">
      <button class="page-btn" data-idx="${idx}" data-dir="prev" ${page === 0 ? "disabled" : ""}>‹ Prev</button>
      <span class="pager-page">Page ${page + 1} of ${totalPages}</span>
      <button class="page-btn" data-idx="${idx}" data-dir="next" ${page >= totalPages - 1 ? "disabled" : ""}>Next ›</button>
    </div>
  </div>`;
  }

  function renderResults(results, elapsedMs) {
    currentResultSets = results || [];
    resultPageByIdx = new Map();

    if (!results || results.length === 0) {
      clearResults("No results.");
      return;
    }

    lastResultsHtml = currentResultSets.map((res, i) => buildResultBlockHtml(res, i)).join("");
    const totalRows = results.reduce((sum, r) => sum + (r.rows ? r.rows.length : 0), 0);
    lastResultsMeta = `${totalRows} row(s) · ${elapsedMs} ms`;
    lastResultsClassName = "results-body";
    setResultsView("results");
  }

  function goToResultPage(idx, dir) {
    const res = currentResultSets[idx];
    if (!res || !res.rows) return;
    const totalPages = Math.max(1, Math.ceil(res.rows.length / RESULTS_PAGE_SIZE));
    const current = Math.min(resultPageByIdx.get(idx) || 0, totalPages - 1);
    const next = dir === "next" ? current + 1 : current - 1;
    if (next < 0 || next >= totalPages) return;
    resultPageByIdx.set(idx, next);
    lastResultsHtml = currentResultSets.map((res, i) => buildResultBlockHtml(res, i)).join("");
    if (resultsViewMode === "results") {
      el.resultsBody.innerHTML = lastResultsHtml;
      markOverflowingCells();
    }
  }

  function isNumericValue(value) {
    return typeof value === "number" || (typeof value === "string" && /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(value.trim()));
  }

  function formatDateValue(d) {
    const iso = d.toISOString();
    if (iso.endsWith("T00:00:00.000Z")) return iso.slice(0, 10);
    return iso.replace("T", " ").replace("Z", "");
  }

  function renderTable(res, rows, rowOffset) {
    const cols = res.fields.map((f) => f.name);
    const displayRows = rows || res.rows;
    const offset = rowOffset || 0;
    const head = `<tr><th class="row-num-col"></th>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`;
    const body = displayRows
      .map((row, i) => {
        const cells = cols
          .map((c) => {
            const v = row[c];
            if (v === null || v === undefined) return `<td class="cell-null">null</td>`;
            const text = v instanceof Date ? formatDateValue(v) : typeof v === "object" ? JSON.stringify(v) : String(v);
            if (c.toLowerCase().endsWith("_html")) {
              return `<td class="cell-truncatable cell-html"><span class="cell-text">${text}</span></td>`;
            }
            const cellClass = isNumericValue(v) ? "cell-numeric" : "";
            return `<td class="cell-truncatable ${cellClass}"><span class="cell-text">${escapeHtml(text)}</span></td>`;
          })
          .join("");
        return `<tr><td class="row-num-col">${offset + i + 1}</td>${cells}</tr>`;
      })
      .join("");
    return `<table class="result-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  }

  function markOverflowingCells() {
    const cells = el.resultsBody.querySelectorAll("td.cell-truncatable");
    cells.forEach((td) => {
      if (td.querySelector(".cell-expand-btn")) return;
      const span = td.querySelector(".cell-text");
      if (!span || span.scrollWidth <= span.clientWidth + 1) return;
      const btn = document.createElement("button");
      btn.className = "cell-expand-btn";
      btn.title = "Show full text";
      btn.textContent = "…";
      td.appendChild(btn);
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---- CSV export -------------------------------------------------------------

  function csvCell(value) {
    if (value === null || value === undefined) return "";
    const str = typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  }

  function resultToCsv(res) {
    const cols = res.fields.map((f) => f.name);
    const lines = [cols.map(csvCell).join(",")];
    for (const row of res.rows) {
      lines.push(cols.map((c) => csvCell(row[c])).join(","));
    }
    return lines.join("\r\n");
  }

  function downloadResultAsCsv(idx) {
    const res = currentResultSets[idx];
    if (!res) return;
    const csv = resultToCsv(res);
    const filename = currentResultSets.length > 1 ? `query-results-${idx + 1}.csv` : "query-results.csv";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`Downloaded "${filename}"`, "success");
  }

  /**
   * Admin-only (?mode=admin): downloads the raw pg.exec() result for one
   * statement as JSON, in the same { fields, rows, affectedRows } shape
   * renderResults() expects, plus top-level `sql` and `data` properties
   * recording the query that produced it and the loaded dataset's label -
   * meant to be hosted and later loaded via the `result` URL parameter to
   * preview a query's output before the engine boots (see handleResultFeed,
   * which falls back to these when the `sql`/`data` URL parameters are absent).
   */
  function downloadResultAsJson(idx) {
    const res = currentResultSets[idx];
    if (!res) return;
    const json = JSON.stringify({ sql: currentResultSetsSql, data: currentLabel, ...res }, null, 2);
    const filename = currentResultSets.length > 1 ? `query-result-${idx + 1}.json` : "query-result.json";
    const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`Downloaded "${filename}"`, "success");
  }

  // ---- Schema refresh --------------------------------------------------------

  /** Rebuilds the ERD (if it's the visible view) after a query may have changed the schema. */
  async function refreshTables() {
    if (!pg) return;
    if (resultsViewMode === "erd") {
      await renderErd({ rebuild: true }).catch(console.error);
    }
  }

  // ---- ERD -------------------------------------------------------------------

  const ERD_NODE_WIDTH = 230;
  const ERD_HEADER_HEIGHT = 42;
  const ERD_ROW_HEIGHT = 22;
  const ERD_PAD_X = 48;
  const ERD_PAD_Y = 34;
  const ERD_GAP_X = 70;
  const ERD_GAP_Y = 48;
  const ERD_ZOOM_MIN = 0.5;
  const ERD_ZOOM_MAX = 2;
  const ERD_ZOOM_STEP = 0.1;
  const ERD_MIN_POS = 8;
  const ERD_CROWSFOOT_SPREAD = 7;
  const ERD_MARKER_CIRCLE_R = 3.5;

  /**
   * Switches the bottom pane between query results, history, and the ERD view.
   * @param {'results' | 'erd' | 'history'} mode
   */
  function setResultsView(mode) {
    resultsViewMode = mode;
    const showingErd = mode === "erd";
    const showingHistory = mode === "history";

    el.viewResults.classList.toggle("is-active", mode === "results");
    el.viewHistory.classList.toggle("is-active", showingHistory);
    el.viewErd.classList.toggle("is-active", showingErd);
    el.viewResults.setAttribute("aria-selected", String(mode === "results"));
    el.viewHistory.setAttribute("aria-selected", String(showingHistory));
    el.viewErd.setAttribute("aria-selected", String(showingErd));
    el.erdToolbar.hidden = !showingErd;

    if (showingErd) {
      if (!hasShownSchemaForCurrentDb) {
        hasShownSchemaForCurrentDb = true;
        firstBuildOfSchema();
      }
      renderErd().catch((err) => {
        console.error(err);
        el.resultsBody.className = "results-body has-error";
        el.resultsBody.innerHTML = `<div class="error-box">${escapeHtml(err.message || String(err))}</div>`;
        el.resultsMeta.textContent = "";
      });
      return;
    }

    if (showingHistory) {
      renderQueryHistory();
      return;
    }

    el.resultsBody.className = lastResultsClassName;
    el.resultsBody.innerHTML = lastResultsHtml;
    el.resultsMeta.textContent = lastResultsMeta;
    markOverflowingCells();
  }

  /** Per-instance sessionStorage key, so two studios on the same page keep separate history logs. */
  const HISTORY_STORAGE_KEY = `${QUERY_HISTORY_KEY}:${instanceId}`;

  /**
   * Reads the session query history from sessionStorage.
   */
  function loadQueryHistory() {
    try {
      const raw = sessionStorage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Persists the session query history to sessionStorage.
   * @param {Array<{ id: string, sql: string, at: number, ok: boolean, elapsedMs?: number, error?: string }>} entries
   */
  function saveQueryHistory(entries) {
    try {
      sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries));
    } catch (err) {
      console.warn("Could not save query history:", err);
    }
  }

  /**
   * Appends a query to the session history log (newest first).
   * @param {{ sql: string, ok: boolean, elapsedMs?: number, error?: string }} entry
   */
  function addQueryHistoryEntry(entry) {
    const history = loadQueryHistory();
    history.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sql: entry.sql,
      at: Date.now(),
      ok: entry.ok,
      elapsedMs: entry.elapsedMs,
      error: entry.error,
    });
    saveQueryHistory(history.slice(0, QUERY_HISTORY_MAX));
    if (resultsViewMode === "history") renderQueryHistory();
  }

  /**
   * Formats a history timestamp for display.
   * @param {number} at - Epoch milliseconds.
   */
  function formatHistoryTime(at) {
    try {
      return new Date(at).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return "";
    }
  }

  /**
   * Builds a one-line preview of a SQL string for the history list.
   * @param {string} sql
   */
  function historySqlPreview(sql) {
    return sql.replace(/\s+/g, " ").trim();
  }

  /**
   * Renders the session query history list in the results pane.
   */
  function renderQueryHistory() {
    const history = loadQueryHistory();
    el.resultsMeta.textContent = history.length
      ? `${history.length} quer${history.length === 1 ? "y" : "ies"} this session`
      : "";

    if (history.length === 0) {
      el.resultsBody.className = "results-body";
      el.resultsBody.innerHTML = `<div class="empty-hint">No queries yet this session. Run a query to start a history log.</div>`;
      return;
    }

    const items = history
      .map((entry) => {
        const statusClass = entry.ok ? "is-ok" : "is-error";
        const statusLabel = entry.ok ? "OK" : "Error";
        const metaParts = [formatHistoryTime(entry.at)];
        if (entry.ok && typeof entry.elapsedMs === "number") metaParts.push(`${entry.elapsedMs} ms`);
        if (!entry.ok && entry.error) metaParts.push(entry.error);
        return `<li class="history-item ${statusClass}" data-history-id="${escapeHtml(entry.id)}">
        <div class="history-item-top">
          <span class="history-status">${statusLabel}</span>
          <span class="history-meta">${escapeHtml(metaParts.join(" · "))}</span>
          <button type="button" class="history-load-btn" data-history-id="${escapeHtml(entry.id)}" title="Load and run this query">Run</button>
        </div>
        <pre class="history-sql">${escapeHtml(historySqlPreview(entry.sql))}</pre>
      </li>`;
      })
      .join("");

    el.resultsBody.className = "results-body history-body";
    el.resultsBody.innerHTML = `<div class="history-panel">
    <div class="history-toolbar">
      <button type="button" class="btn history-clear-btn" id="btn-clear-history">Clear history</button>
    </div>
    <ul class="history-list">${items}</ul>
  </div>`;
  }

  /**
   * Loads a history entry's SQL into the editor and runs it.
   * @param {string} id - History entry id.
   */
  function loadHistoryQuery(id) {
    const entry = loadQueryHistory().find((item) => item.id === id);
    if (!entry || !editor) return;
    editor.setValue(entry.sql);
    editor.focus();
    userRunQuery();
  }

  /**
   * Clears the session query history log.
   */
  function clearQueryHistory() {
    saveQueryHistory([]);
    if (resultsViewMode === "history") renderQueryHistory();
    showToast("Query history cleared");
  }

  /**
   * Runs the first time the schema/ERD view is shown for a loaded database.
   */
  function firstBuildOfSchema() {
    //console.log("Showing schema for the first time");
  }

  /**
   * Loads public tables, columns, primary keys, and foreign keys for the ERD.
   */
  async function fetchErdSchema() {
    const tablesRes = await pg.query(
      `select table_name
     from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name;`
    );

    const columnsRes = await pg.query(
      `select table_name, column_name, data_type, ordinal_position
     from information_schema.columns
     where table_schema = 'public'
     order by table_name, ordinal_position;`
    );

    const pkRes = await pg.query(
      `select kcu.table_name, kcu.column_name
     from information_schema.table_constraints tc
     join information_schema.key_column_usage kcu
       on tc.constraint_schema = kcu.constraint_schema
      and tc.constraint_name = kcu.constraint_name
     where tc.constraint_type = 'PRIMARY KEY'
       and tc.table_schema = 'public';`
    );

    const fkRes = await pg.query(
      `select
       kcu.table_name as from_table,
       kcu.column_name as from_column,
       kcu2.table_name as to_table,
       kcu2.column_name as to_column,
       col.is_nullable
     from information_schema.table_constraints tc
     join information_schema.key_column_usage kcu
       on tc.constraint_schema = kcu.constraint_schema
      and tc.constraint_name = kcu.constraint_name
     join information_schema.referential_constraints rc
       on tc.constraint_schema = rc.constraint_schema
      and tc.constraint_name = rc.constraint_name
     join information_schema.key_column_usage kcu2
       on rc.unique_constraint_schema = kcu2.constraint_schema
      and rc.unique_constraint_name = kcu2.constraint_name
      and kcu.position_in_unique_constraint = kcu2.ordinal_position
     join information_schema.columns col
       on col.table_schema = kcu.table_schema
      and col.table_name = kcu.table_name
      and col.column_name = kcu.column_name
     where tc.constraint_type = 'FOREIGN KEY'
       and tc.table_schema = 'public';`
    );

    const pkSet = new Set(pkRes.rows.map((r) => `${r.table_name}.${r.column_name}`));
    const fkCols = new Set(fkRes.rows.map((r) => `${r.from_table}.${r.from_column}`));

    /** @type {Map<string, { name: string, columns: Array<{ name: string, type: string, isPk: boolean, isFk: boolean }> }>} */
    const tables = new Map();
    for (const row of tablesRes.rows) {
      tables.set(row.table_name, { name: row.table_name, columns: [] });
    }
    for (const row of columnsRes.rows) {
      const table = tables.get(row.table_name);
      if (!table) continue;
      const key = `${row.table_name}.${row.column_name}`;
      table.columns.push({
        name: row.column_name,
        type: formatErdType(row.data_type),
        isPk: pkSet.has(key),
        isFk: fkCols.has(key),
      });
    }

    return {
      tables: [...tables.values()],
      relationships: fkRes.rows.map((r) => {
        const fkOptional = r.is_nullable === "YES";
        return {
          fromTable: r.from_table,
          fromColumn: r.from_column,
          toTable: r.to_table,
          toColumn: r.to_column,
          // Child end: a parent may have zero children (FK cannot require children).
          manyKind: "zero-or-many",
          // Parent end: required parent if FK is NOT NULL, otherwise optional.
          oneKind: fkOptional ? "zero-or-one" : "one",
        };
      }),
    };
  }

  /**
   * Shortens PostgreSQL data types for ERD labels.
   * @param {string} dataType
   */
  function formatErdType(dataType) {
    const map = {
      "character varying": "VARCHAR",
      "timestamp with time zone": "TIMESTAMPTZ",
      "timestamp without time zone": "TIMESTAMP",
      "double precision": "FLOAT8",
      integer: "INT",
      bigint: "BIGINT",
      smallint: "SMALLINT",
      boolean: "BOOL",
      text: "TEXT",
      numeric: "NUMERIC",
      real: "REAL",
      date: "DATE",
      uuid: "UUID",
      json: "JSON",
      jsonb: "JSONB",
    };
    return map[dataType] || String(dataType || "").toUpperCase();
  }

  /**
   * Computes the rendered height of an ERD table card.
   * @param {{ columns: unknown[] }} table
   */
  function erdTableHeight(table) {
    return ERD_HEADER_HEIGHT + Math.max(table.columns?.length || 0, 1) * ERD_ROW_HEIGHT + 8;
  }

  /**
   * Assigns each table a horizontal layer (parents left, children right) from FK edges.
   * @param {string[]} names
   * @param {Array<{ fromTable: string, toTable: string }>} relationships
   */
  function assignErdLayers(names, relationships) {
    const nameSet = new Set(names);
    /** @type {Map<string, string[]>} */
    const childrenOf = new Map(names.map((n) => [n, []]));
    /** @type {Map<string, string[]>} */
    const parentsOf = new Map(names.map((n) => [n, []]));
    /** @type {Map<string, number>} */
    const indegree = new Map(names.map((n) => [n, 0]));

    for (const rel of relationships) {
      if (!nameSet.has(rel.fromTable) || !nameSet.has(rel.toTable)) continue;
      if (rel.fromTable === rel.toTable) continue;
      const parent = rel.toTable;
      const child = rel.fromTable;
      if (childrenOf.get(parent).includes(child)) continue;
      childrenOf.get(parent).push(child);
      parentsOf.get(child).push(parent);
      indegree.set(child, indegree.get(child) + 1);
    }

    const queue = names.filter((n) => indegree.get(n) === 0);
    const indeg = new Map(indegree);
    const topo = [];
    while (queue.length) {
      const n = queue.shift();
      topo.push(n);
      for (const child of childrenOf.get(n)) {
        indeg.set(child, indeg.get(child) - 1);
        if (indeg.get(child) === 0) queue.push(child);
      }
    }
    for (const n of names) {
      if (!topo.includes(n)) topo.push(n);
    }

    /** @type {Map<string, number>} */
    const layer = new Map();
    for (const n of topo) {
      const parents = parentsOf.get(n);
      layer.set(n, parents.length ? Math.max(...parents.map((p) => layer.get(p) || 0)) + 1 : 0);
    }

    return { layer, childrenOf, parentsOf };
  }

  /**
   * Orders tables within each layer to reduce relationship-line crossings.
   * @param {string[]} names
   * @param {Map<string, number>} layerMap
   * @param {Map<string, string[]>} parentsOf
   * @param {Map<string, string[]>} childrenOf
   * @param {Array<{ fromTable: string, fromColumn: string, toTable: string }>} relationships
   * @param {Array<{ name: string, columns: Array<{ name: string }> }>} tables
   */
  function orderErdLayers(names, layerMap, parentsOf, childrenOf, relationships, tables) {
    const maxLayer = names.reduce((max, n) => Math.max(max, layerMap.get(n) || 0), 0);
    /** @type {string[][]} */
    const layers = Array.from({ length: maxLayer + 1 }, () => []);
    for (const n of names) layers[layerMap.get(n) || 0].push(n);
    for (const group of layers) group.sort((a, b) => a.localeCompare(b));

    /** @type {Map<string, Map<string, number>>} */
    const columnIndex = new Map();
    for (const table of tables) {
      const cols = new Map();
      (table.columns || []).forEach((col, idx) => cols.set(col.name, idx));
      columnIndex.set(table.name, cols);
    }

    /**
     * Average index of related tables in a neighboring layer.
     * @param {string[]} related
     * @param {string[]} neighbor
     */
    function barycenter(related, neighbor) {
      const hits = related.filter((r) => neighbor.includes(r));
      if (!hits.length) return neighbor.length / 2;
      return hits.reduce((sum, r) => sum + neighbor.indexOf(r), 0) / hits.length;
    }

    /**
     * Sort key for a parent using child positions and FK column order (reduces crossings).
     * @param {string} parent
     * @param {string[]} childLayer
     */
    function parentCrossingKey(parent, childLayer) {
      const rels = relationships.filter(
        (r) => r.toTable === parent && childLayer.includes(r.fromTable)
      );
      if (!rels.length) return barycenter(childrenOf.get(parent) || [], childLayer);
      return (
        rels.reduce((sum, r) => {
          const childIdx = childLayer.indexOf(r.fromTable);
          const colIdx = columnIndex.get(r.fromTable)?.get(r.fromColumn) ?? 0;
          return sum + childIdx * 1000 + colIdx;
        }, 0) / rels.length
      );
    }

    for (let pass = 0; pass < 4; pass += 1) {
      for (let i = 1; i < layers.length; i += 1) {
        layers[i].sort((a, b) => {
          const diff =
            barycenter(parentsOf.get(a) || [], layers[i - 1]) -
            barycenter(parentsOf.get(b) || [], layers[i - 1]);
          return diff || a.localeCompare(b);
        });
      }
      for (let i = layers.length - 2; i >= 0; i -= 1) {
        layers[i].sort((a, b) => {
          const diff = parentCrossingKey(a, layers[i + 1]) - parentCrossingKey(b, layers[i + 1]);
          return diff || a.localeCompare(b);
        });
      }
    }

    return layers;
  }

  /**
   * Places layered tables left-to-right with parents before children.
   * @param {Array<{ name: string, height: number }>} tables
   * @param {string[][]} layers
   */
  function placeErdLayers(tables, layers) {
    const byName = new Map(tables.map((t) => [t.name, t]));
    /** @type {Map<string, { x: number, y: number }>} */
    const positions = new Map();

    const layerHeights = layers.map((group) => {
      if (!group.length) return 0;
      return group.reduce((sum, name, idx) => {
        const h = byName.get(name)?.height || ERD_HEADER_HEIGHT;
        return sum + h + (idx > 0 ? ERD_GAP_Y : 0);
      }, 0);
    });
    const tallest = Math.max(0, ...layerHeights);

    let maxX = ERD_PAD_X;
    let maxY = ERD_PAD_Y;

    for (let li = 0; li < layers.length; li += 1) {
      const group = layers[li];
      if (!group.length) continue;
      const x = ERD_PAD_X + li * (ERD_NODE_WIDTH + ERD_GAP_X);
      let y = ERD_PAD_Y + Math.max(0, (tallest - layerHeights[li]) / 2);
      for (const name of group) {
        const table = byName.get(name);
        positions.set(name, { x, y });
        y += (table?.height || ERD_HEADER_HEIGHT) + ERD_GAP_Y;
        maxX = Math.max(maxX, x + ERD_NODE_WIDTH);
        maxY = Math.max(maxY, y - ERD_GAP_Y);
      }
    }

    return { positions, maxX, maxY };
  }

  /**
   * Lays out ERD tables using FK-aware layers so related tables sit cleanly
   * side-by-side. Reuses any saved drag positions for tables the user moved.
   * @param {Array<{ name: string, columns: unknown[] }>} tables
   * @param {Array<{ fromTable: string, toTable: string }>} [relationships]
   */
  function layoutErdNodes(tables, relationships = []) {
    const prepared = tables.map((table) => ({
      ...table,
      height: erdTableHeight(table),
    }));
    const names = prepared.map((t) => t.name);
    const linkedNames = new Set();
    for (const rel of relationships) {
      if (names.includes(rel.fromTable)) linkedNames.add(rel.fromTable);
      if (names.includes(rel.toTable)) linkedNames.add(rel.toTable);
    }
    const linked = names.filter((n) => linkedNames.has(n));
    const isolated = names.filter((n) => !linkedNames.has(n)).sort((a, b) => a.localeCompare(b));

    /** @type {Map<string, { x: number, y: number }>} */
    let autoPos = new Map();
    let maxX = ERD_PAD_X;
    let maxY = ERD_PAD_Y;

    if (linked.length) {
      const { layer, childrenOf, parentsOf } = assignErdLayers(linked, relationships);
      const layers = orderErdLayers(
        linked,
        layer,
        parentsOf,
        childrenOf,
        relationships,
        prepared.filter((t) => linkedNames.has(t.name))
      );
      const placed = placeErdLayers(
        prepared.filter((t) => linkedNames.has(t.name)),
        layers
      );
      autoPos = placed.positions;
      maxX = placed.maxX;
      maxY = placed.maxY;
    }

    // Isolated tables sit in a tidy row beneath the linked diagram.
    if (isolated.length) {
      const startY = linked.length ? maxY + ERD_GAP_Y : ERD_PAD_Y;
      let x = ERD_PAD_X;
      let y = startY;
      let rowMaxHeight = 0;
      const colsPerRow = Math.max(1, Math.ceil(Math.sqrt(isolated.length)));
      let col = 0;
      for (const name of isolated) {
        const table = prepared.find((t) => t.name === name);
        const height = table?.height || ERD_HEADER_HEIGHT;
        if (col >= colsPerRow) {
          x = ERD_PAD_X;
          y += rowMaxHeight + ERD_GAP_Y;
          rowMaxHeight = 0;
          col = 0;
        }
        autoPos.set(name, { x, y });
        maxX = Math.max(maxX, x + ERD_NODE_WIDTH);
        maxY = Math.max(maxY, y + height);
        rowMaxHeight = Math.max(rowMaxHeight, height);
        x += ERD_NODE_WIDTH + ERD_GAP_X;
        col += 1;
      }
    }

    const nodes = new Map();
    const tableNames = new Set(prepared.map((t) => t.name));
    for (const name of [...erdPositions.keys()]) {
      if (!tableNames.has(name)) erdPositions.delete(name);
    }

    for (const table of prepared) {
      const saved = erdPositions.get(table.name);
      const auto = autoPos.get(table.name) || { x: ERD_PAD_X, y: ERD_PAD_Y };
      const pos = saved || auto;
      nodes.set(table.name, {
        ...table,
        x: pos.x,
        y: pos.y,
        width: ERD_NODE_WIDTH,
      });
      maxX = Math.max(maxX, pos.x + ERD_NODE_WIDTH);
      maxY = Math.max(maxY, pos.y + table.height);
    }

    return {
      nodes,
      width: maxX + ERD_PAD_X,
      height: maxY + ERD_PAD_Y,
    };
  }

  /**
   * Returns the vertical center of a column row inside a table node.
   * @param {{ y: number, columns: Array<{ name: string }> }} node
   * @param {string} columnName
   */
  function erdColumnCenterY(node, columnName) {
    const idx = node.columns.findIndex((c) => c.name === columnName);
    const row = idx >= 0 ? idx : 0;
    return node.y + ERD_HEADER_HEIGHT + row * ERD_ROW_HEIGHT + ERD_ROW_HEIGHT / 2;
  }

  /**
   * Returns how far from the entity edge the relationship line should stop
   * so it meets the innermost crow's foot symbol with no gap.
   * @param {'zero-or-many' | 'one-or-many' | 'zero-or-one' | 'one'} kind
   */
  function erdMarkerDepth(kind) {
    if (kind === "one") return 12;
    if (kind === "one-or-many") return 10;
    if (kind === "zero-or-many" || kind === "zero-or-one") {
      // Crowfoot/bar near entity, then circle; line meets the far edge of the circle.
      return 8 + ERD_MARKER_CIRCLE_R * 2;
    }
    return 8 + ERD_MARKER_CIRCLE_R * 2;
  }

  /**
   * Builds an SVG path for a relationship between two table sides.
   * @param {{ x: number, y: number, width: number, height: number, columns: Array<{ name: string }> }} fromNode
   * @param {string} fromColumn
   * @param {{ x: number, y: number, width: number, height: number, columns: Array<{ name: string }> }} toNode
   * @param {string} toColumn
   * @param {number} fromDepth - Marker depth on the many (from) end.
   * @param {number} toDepth - Marker depth on the one (to) end.
   */
  function erdRelationshipPath(fromNode, fromColumn, toNode, toColumn, fromDepth, toDepth) {
    const fromY = erdColumnCenterY(fromNode, fromColumn);
    const toY = erdColumnCenterY(toNode, toColumn);
    const fromCenterX = fromNode.x + fromNode.width / 2;
    const toCenterX = toNode.x + toNode.width / 2;
    const goRight = toCenterX >= fromCenterX;
    const x1 = goRight ? fromNode.x + fromNode.width : fromNode.x;
    const x2 = goRight ? toNode.x : toNode.x + toNode.width;
    // Direction from the line toward each entity (horizontal).
    const fromToward = goRight ? -1 : 1;
    const toToward = goRight ? 1 : -1;
    const fromLineX = x1 - fromToward * fromDepth;
    const toLineX = x2 - toToward * toDepth;
    const midX = (fromLineX + toLineX) / 2;
    return {
      d: `M ${fromLineX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toLineX} ${toY}`,
      fromX: x1,
      fromY,
      toX: x2,
      toY,
      fromToward,
      toToward,
    };
  }

  /**
   * Renders a crow's foot cardinality marker at a relationship endpoint.
   * Outer symbol (nearest the entity) is maximum cardinality; inner is minimum.
   * The relationship line is drawn to meet the innermost symbol edge.
   * @param {number} x - Attachment x on the entity edge.
   * @param {number} y - Attachment y on the entity edge.
   * @param {number} towardEntity - Horizontal direction from line toward the entity (-1 or 1).
   * @param {'zero-or-many' | 'one-or-many' | 'zero-or-one' | 'one'} kind - Full crow's foot cardinality.
   */
  function renderErdCardinalityMarker(x, y, towardEntity, kind) {
    const spread = ERD_CROWSFOOT_SPREAD;
    const r = ERD_MARKER_CIRCLE_R;
    const depth = erdMarkerDepth(kind);
    /**
     * X position measured outward from the entity edge toward the relationship line.
     * @param {number} offset
     */
    const along = (offset) => x - towardEntity * offset;

    const crowfoot = (tipOffset, heelOffset) => {
      const tipX = along(tipOffset);
      const heelX = along(heelOffset);
      return `M ${heelX} ${y} L ${tipX} ${y - spread} M ${heelX} ${y} L ${tipX} ${y} M ${heelX} ${y} L ${tipX} ${y + spread}`;
    };

    const bar = (offset) => {
      const bx = along(offset);
      return `M ${bx} ${y - spread} L ${bx} ${y + spread}`;
    };

    const circleAt = (centerOffset) => {
      const cx = along(centerOffset);
      return `<circle class="erd-crowsfoot" cx="${cx}" cy="${y}" r="${r}"></circle>`;
    };

    if (kind === "zero-or-many") {
      // Foot against the entity; circle touches the foot heel; line meets far circle edge.
      const circleCenter = depth - r;
      const footHeel = circleCenter - r;
      return `${circleAt(circleCenter)}<path class="erd-crowsfoot" d="${crowfoot(0, footHeel)}"></path>`;
    }
    if (kind === "one-or-many") {
      // Foot against the entity; mandatory bar at the line junction.
      return `<path class="erd-crowsfoot" d="${bar(depth)} ${crowfoot(0, depth)}"></path>`;
    }
    if (kind === "zero-or-one") {
      const circleCenter = depth - r;
      return `${circleAt(circleCenter)}<path class="erd-crowsfoot" d="${bar(4)}"></path>`;
    }
    // one (one and only one): line meets the outer bar.
    return `<path class="erd-crowsfoot" d="${bar(5)} ${bar(depth)}"></path>`;
  }

  /**
   * Renders a key icon used for primary/foreign key columns.
   * @param {number} x
   * @param {number} y
   * @param {boolean} isPrimary
   */
  function erdKeyIcon(x, y, isPrimary) {
    const cls = isPrimary ? "erd-key-primary" : "erd-key-muted";
    return `<g class="${cls}" transform="translate(${x} ${y})">
    <circle cx="4" cy="4" r="3.2" fill="none" stroke-width="1.5"></circle>
    <path d="M 7 4 H 14 M 11 4 V 7 M 14 4 V 7" fill="none" stroke-width="1.5" stroke-linecap="round"></path>
  </g>`;
  }

  /**
   * Renders one table card for the ERD SVG.
   * @param {{ name: string, x: number, y: number, width: number, height: number, columns: Array<{ name: string, type: string, isPk: boolean, isFk: boolean }> }} node
   */
  function renderErdNode(node) {
    const rows = node.columns.length
      ? node.columns
        .map((col, i) => {
          const y = ERD_HEADER_HEIGHT + i * ERD_ROW_HEIGHT;
          const textY = y + 15;
          const classes = ["erd-column-row"];
          if (col.isPk) classes.push("primary-key");
          if (col.isFk) classes.push("foreign-key");
          const key =
            col.isPk || col.isFk
              ? erdKeyIcon(node.width - 44, y + 6, col.isPk)
              : "";
          return `<g class="${classes.join(" ")}" data-column="${escapeHtml(col.name)}">
            <rect class="erd-column-hit" x="0" y="${y}" width="${node.width}" height="${ERD_ROW_HEIGHT}"></rect>
            <text x="16" y="${textY}" class="erd-column-text">${escapeHtml(col.name)}<tspan class="erd-column-type"> - ${escapeHtml(col.type)}</tspan></text>
            ${key}
          </g>`;
        })
        .join("")
      : `<text x="16" y="${ERD_HEADER_HEIGHT + 15}" class="erd-column-type">(no columns)</text>`;

    return `<g class="erd-node" data-table="${escapeHtml(node.name)}" transform="translate(${node.x} ${node.y})">
    <rect width="${node.width}" height="${node.height}" rx="8" class="erd-node-body"></rect>
    <rect width="${node.width}" height="${ERD_HEADER_HEIGHT}" rx="8" class="erd-node-header"></rect>
    <path d="M 0 34 H ${node.width} V ${ERD_HEADER_HEIGHT} H 0 Z" class="erd-node-header"></path>
    <text x="16" y="26" class="erd-node-title">${escapeHtml(node.name)}</text>
    ${rows}
  </g>`;
  }

  /**
   * Renders a relationship line using crow's foot notation with min/max cardinality.
   * @param {{ fromTable: string, fromColumn: string, toTable: string, toColumn: string, manyKind: string, oneKind: string }} rel
   * @param {Map<string, any>} nodes
   * @param {number} index - Relationship index used for selection.
   */
  function renderErdRelationship(rel, nodes, index) {
    const fromNode = nodes.get(rel.fromTable);
    const toNode = nodes.get(rel.toTable);
    if (!fromNode || !toNode) return "";

    const manyKind = rel.manyKind || "zero-or-many";
    const oneKind = rel.oneKind || "one";
    const path = erdRelationshipPath(
      fromNode,
      rel.fromColumn,
      toNode,
      rel.toColumn,
      erdMarkerDepth(manyKind),
      erdMarkerDepth(oneKind)
    );
    const manyMarker = renderErdCardinalityMarker(path.fromX, path.fromY, path.fromToward, manyKind);
    const oneMarker = renderErdCardinalityMarker(path.toX, path.toY, path.toToward, oneKind);
    const selected = erdSelectedRelIndex === index ? " is-selected" : "";

    return `<g class="erd-relationship${selected}" data-rel-index="${index}" data-from="${escapeHtml(rel.fromTable)}" data-to="${escapeHtml(rel.toTable)}">
    <path d="${path.d}" class="erd-line-hit" fill="none"></path>
    <path d="${path.d}" class="erd-line" fill="none"></path>
    ${manyMarker}
    ${oneMarker}
  </g>`;
  }

  /**
   * Highlights a relationship by index, or clears the highlight when null.
   * @param {number | null} index
   */
  function selectErdRelationship(index) {
    erdSelectedRelIndex = index;
    const group = el.resultsBody.querySelector("#erd-relationships");
    if (!group) return;

    group.querySelectorAll(".erd-relationship.is-selected").forEach((relEl) => {
      relEl.classList.remove("is-selected");
    });

    if (index == null) return;

    const selected = group.querySelector(`.erd-relationship[data-rel-index="${index}"]`);
    if (!selected) {
      erdSelectedRelIndex = null;
      return;
    }
    selected.classList.add("is-selected");
    group.appendChild(selected);
  }

  /**
   * Converts a pointer event into ERD diagram coordinates (accounts for scroll + zoom).
   * @param {PointerEvent} event
   */
  function pointerToErdCoords(event) {
    const scroll = el.resultsBody.querySelector(".erd-scroll");
    if (!scroll) return { x: 0, y: 0 };
    const rect = scroll.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left + scroll.scrollLeft) / erdZoom,
      y: (event.clientY - rect.top + scroll.scrollTop) / erdZoom,
    };
  }

  /**
   * Expands the SVG canvas so dragged tables stay inside the scrollable area.
   */
  function syncErdCanvasSize() {
    if (!erdState) return;
    const svg = el.resultsBody.querySelector(".erd-svg");
    const scroll = el.resultsBody.querySelector(".erd-scroll");
    if (!svg || !scroll) return;

    let maxX = 0;
    let maxY = 0;
    for (const node of erdState.nodes.values()) {
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }

    const width = Math.max(Math.ceil(maxX + ERD_PAD_X), Math.ceil(scroll.clientWidth / erdZoom));
    const height = Math.max(Math.ceil(maxY + ERD_PAD_Y), Math.ceil(scroll.clientHeight / erdZoom));
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;
  }

  /**
   * Redraws relationship lines from the current node positions.
   */
  function updateErdRelationships() {
    if (!erdState) return;
    const group = el.resultsBody.querySelector("#erd-relationships");
    if (!group) return;
    group.innerHTML = erdState.relationships
      .map((rel, index) => renderErdRelationship(rel, erdState.nodes, index))
      .join("");
    selectErdRelationship(erdSelectedRelIndex);
  }

  /**
   * Attaches click handlers so relationship lines can be highlighted.
   */
  function bindErdRelationshipHandlers() {
    const svg = el.resultsBody.querySelector(".erd-svg");
    if (!svg || svg.dataset.relClickBound === "1") return;
    svg.dataset.relClickBound = "1";

    svg.addEventListener("click", (event) => {
      if (erdDrag) return;
      const relEl = event.target.closest(".erd-relationship");
      if (relEl) {
        const index = Number(relEl.getAttribute("data-rel-index"));
        if (!Number.isFinite(index)) return;
        selectErdRelationship(erdSelectedRelIndex === index ? null : index);
        if (erdMode === "sql") {
          const rel = erdState?.relationships?.[index];
          if (rel) {
            const fragment = `${rel.fromTable} JOIN ${rel.toTable} ON ${rel.fromTable}.${rel.fromColumn} = ${rel.toTable}.${rel.toColumn}`;
            erdAmendSql(fragment, "link", event.ctrlKey);
          }
        }
        event.stopPropagation();
        return;
      }
      selectErdRelationship(null);
    });
  }

  /**
   * Finds the SVG group for a table card by table name.
   * @param {string} tableName
   */
  function findErdNodeEl(tableName) {
    return [...el.resultsBody.querySelectorAll(".erd-node")].find(
      (nodeEl) => nodeEl.getAttribute("data-table") === tableName
    );
  }

  /**
   * Moves a table node in the diagram and updates connected relationship lines.
   * @param {string} tableName
   * @param {number} x
   * @param {number} y
   */
  function moveErdNode(tableName, x, y) {
    if (!erdState) return;
    const node = erdState.nodes.get(tableName);
    if (!node) return;

    node.x = Math.max(ERD_MIN_POS, x);
    node.y = Math.max(ERD_MIN_POS, y);
    erdPositions.set(tableName, { x: node.x, y: node.y });

    const nodeEl = findErdNodeEl(tableName);
    if (nodeEl) nodeEl.setAttribute("transform", `translate(${node.x} ${node.y})`);

    updateErdRelationships();
    syncErdCanvasSize();
  }

  /**
   * Logs the current ERD table positions as a JSON object of
   * `{ [tableName]: { x, y } }`, keyed the same way `applyErdTablePositions`
   * expects to receive them back.
   */
  function logErdTablePositions() {
    if (!erdState) return null;
    const positions = {};
    const stmt = []
    for (const [name, node] of erdState.nodes) {
      positions[name] = { x: node.x, y: node.y };
    }
    stmt.push("create schema system;")
    stmt.push("create table system.erd(data text);")
    stmt.push("insert into system.erd values('")
    stmt.push(JSON.stringify(positions, null, 2))
    stmt.push("');")
      ; console.log(stmt.join("\n"));
    return positions;
  }



  /**
   * Merges an object shaped like `{ [tableName]: { x, y } }` (as produced by
   * `logErdTablePositions`) into `erdPositions`, without re-rendering.
   * @param {Record<string, { x: number, y: number }>} positions
   */
  function mergeErdPositions(positions) {
    if (!positions || typeof positions !== "object") return;
    for (const [name, pos] of Object.entries(positions)) {
      if (pos && typeof pos.x === "number" && typeof pos.y === "number") {
        erdPositions.set(name, { x: pos.x, y: pos.y });
      }
    }
  }

  /**
   * Positions ERD tables from an object shaped like `{ [tableName]: { x, y } }`
   * (as produced by `logErdTablePositions`) and re-renders the diagram.
   * @param {Record<string, { x: number, y: number }>} positions
   */
  function applyErdTablePositions(positions) {
    mergeErdPositions(positions);
    if (erdState) {
      for (const node of erdState.nodes.values()) {
        const pos = erdPositions.get(node.name);
        if (pos) {
          node.x = pos.x;
          node.y = pos.y;
        }
      }
    }
    if (resultsViewMode === "erd") renderErdView();
  }

  /**
   * Reads saved ERD table positions from a `system.erd` table, if one exists.
   * That table is expected to hold a single row with a single column
   * containing a JSON object shaped like `{ [tableName]: { x, y } }`
   * (as produced by `logErdTablePositions`).
   * @returns {Promise<Record<string, { x: number, y: number }> | null>}
   */
  async function fetchErdPositionsFromDb() {
    const { rows: matches } = await pg.query(
      `select 1 from information_schema.tables where table_schema = 'system' and table_name = 'erd';`
    );
    if (!matches.length) return null;

    const { rows, fields } = await pg.query(`select * from system.erd limit 1;`);
    if (!rows.length || !fields.length) return null;

    const raw = rows[0][fields[0].name];
    if (raw == null) return null;
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (err) {
      console.error("Failed to parse system.erd positions", err);
      return null;
    }
  }
  window.applyErdTablePositions = applyErdTablePositions;

  // ---- ERD "Write SQL" query builder -----------------------------------------
  //
  // Clicking a table, column, or relationship in Write SQL mode builds up a
  // SELECT statement in the main SQL editor. While the editor still holds
  // exactly what this builder last generated, clicks grow the statement (add a
  // table, add a column, add a join). As soon as the user edits the SQL by
  // hand, clicks fall back to inserting the clicked name as text at the cursor
  // instead, so the builder never clobbers a query someone is writing.

  /** ERD-formatted column types (see `formatErdType`) that shouldn't be quoted in generated WHERE clauses. */
  const ERD_NUMERIC_TYPES = new Set(["INT", "BIGINT", "SMALLINT", "NUMERIC", "REAL", "FLOAT8"]);

  /** @type {{ select: string[], from: string[], tables: string[], where: Array<{ column: string, value: string, numeric: boolean }>, orderBy: string[] }} */
  let erdQuery = { select: [], from: [], tables: [], where: [], orderBy: [] };
  /** @type {string[]} JSON-stringified snapshots of `erdQuery`, oldest first. */
  let erdQueryHistory = [];
  let erdQueryHistoryPosition = 0;

  /**
   * Drops the table prefix from a `table.column` string when there's only one
   * table in the query (so it doesn't need qualifying to stay unambiguous).
   * @param {string} entry
   */
  function erdQualifyForRender(entry) {
    if (entry.indexOf(".") === -1) return entry;
    return erdQuery.tables.length === 1 ? entry.split(".")[1] : entry;
  }

  /**
   * Renders `erdQuery` as a SQL statement.
   * @returns {string}
   */
  function erdGetLocalSql() {
    let sql = "SELECT  ";
    for (let x = 0; x < erdQuery.select.length; x++) {
      if (x > 0) sql += "\n        ,";
      sql += erdQualifyForRender(erdQuery.select[x]);
    }
    for (let x = 0; x < erdQuery.from.length; x++) {
      sql += "\n";
      if (x === 0) sql += "FROM    ";
      sql += erdQuery.from[x];
    }
    if (erdQuery.where.length) {
      sql +=
        "\nWHERE   " +
        erdQuery.where
          .map((w) => `${erdQualifyForRender(w.column)} = ${w.numeric ? w.value : `'${w.value}'`}`)
          .join("\n  AND   ");
    }
    if (erdQuery.orderBy.length) {
      sql += "\nORDER BY " + erdQuery.orderBy.map(erdQualifyForRender).join(", ");
    }
    return sql.trim() === "SELECT" ? "" : sql;
  }

  /**
   * Adds a table (`field === "*"`) or column to the select list in `erdQuery`.
   * @param {string} table
   * @param {string} field
   * @returns {string | undefined} An error message, if the addition isn't valid.
   */
  function erdAddField(table, field) {
    if (erdQuery.select.indexOf(table + "." + field) > -1) return;

    if (erdQuery.tables.length === 0) {
      erdQuery.select.push(table + "." + field);
      erdQuery.tables.push(table);
      erdQuery.from.push(table);
      return;
    }
    if (erdQuery.tables.indexOf(table) === -1) {
      return `Cannot add table to query. Try clicking ON a link instead.`;
    }
    if (field === "*") {
      return `Cannot add table to query. Try clicking ON a field instead.`;
    }
    if (erdQuery.select.length === 1 && erdQuery.select[0] === "*") {
      erdQuery.select[0] = table + "." + field;
      return;
    }
    if (erdQuery.select.length === 1 && erdQuery.select[0].endsWith(".*")) {
      erdQuery.select.shift();
    }
    erdQuery.select.push(table + "." + field);
  }

  /**
   * Adds a column to the ORDER BY clause in `erdQuery`.
   * @param {string} table
   * @param {string} field
   * @returns {string | undefined} An error message, if the addition isn't valid.
   */
  function erdAddOrderBy(table, field) {
    if (erdQuery.tables.indexOf(table) === -1) {
      return `Add "${table}" to the query before ordering by one of its columns.`;
    }
    const qualified = table + "." + field;
    if (erdQuery.orderBy.indexOf(qualified) === -1) {
      erdQuery.orderBy.push(qualified);
    }
  }

  /**
   * Prompts for a value and adds a `column = value` condition to the WHERE
   * clause in `erdQuery`. Numeric columns get an unquoted value; everything
   * else is quoted, with single quotes doubled so they're valid inside the
   * SQL string literal.
   * @param {string} table
   * @param {string} field
   * @returns {string | undefined} An error message, if the addition isn't valid.
   */
  async function erdAddWhere(table, field) {
    if (erdQuery.tables.indexOf(table) === -1) {
      return `Add "${table}" to the query before filtering on one of its columns.`;
    }
    const raw = await showPromptDialog(`Value for ${table}.${field} =`);
    if (raw === null) return;
    const column = erdState?.nodes.get(table)?.columns.find((c) => c.name === field);
    const numeric = !!column && ERD_NUMERIC_TYPES.has(column.type);
    erdQuery.where.push({
      column: table + "." + field,
      value: numeric ? raw.trim() : raw.replace(/'/g, "''"),
      numeric,
    });
  }

  /** Writes the current `erdQuery` into the SQL editor. */
  function erdWriteQuery() {
    if (editor) editor.setValue(erdGetLocalSql());
  }

  /**
   * Handles a click on a table, column, or relationship in ERD Write SQL mode.
   * @param {string} fragment - `table`, `table.column`, or `table1 JOIN table2 ON table1.col = table2.col`.
   * @param {'table' | 'field' | 'link'} kind
   * @param {boolean} ctrlKey
   */
  async function erdAmendSql(fragment, kind, ctrlKey) {
    if (!editor) return;

    const current = editor.getValue();
    if (current.trim().length === 0) {
      erdQuery = { select: [], from: [], tables: [], where: [], orderBy: [] };
      erdQueryHistory = [];
      erdQueryHistoryPosition = 0;
    }

    if (current.trim() !== erdGetLocalSql()) {
      // The editor has diverged from what we last built, so just insert the
      // clicked atom as text at the cursor, like the user typed it themselves.
      let insert = fragment;
      if (kind === "table") {
        if (!ctrlKey) {
          const parts = insert.split(".");
          insert = parts[parts.length - 1];
        }
        insert = ", " + insert;
      } else if (kind === "field" && ctrlKey) {
        insert = ", " + insert;
      }
      editor.trigger("erd", "type", { text: insert });
      editor.focus();
      return;
    }

    let msg;
    if (fragment.indexOf(".") === -1) {
      msg = erdAddField(fragment, "*");
    } else if (fragment.indexOf(" JOIN ") === -1) {
      const table = fragment.split(".")[0];
      const field = fragment.split(".")[1];
      if (erdClause === "orderby") {
        msg = erdAddOrderBy(table, field);
      } else if (erdClause === "where") {
        msg = await erdAddWhere(table, field);
      } else {
        msg = erdAddField(table, field);
      }
    } else {
      const temp = fragment.replace(" JOIN ", " ").split(" ");
      const table1 = temp[0];
      const table2 = temp[1];

      if (erdQuery.tables.length === 0) {
        msg = erdAddField(table1, "*");
        if (!msg) {
          const onClause = fragment.split(" ON ")[1];
          erdQuery.from.push("  JOIN  " + table2 + "\n    ON  " + onClause);
          erdQuery.tables.push(table2);
        }
      } else {
        let matchCount = 0;
        let tableToAdd;
        for (const tname of erdQuery.tables) {
          if (tname === table1) {
            matchCount++;
            tableToAdd = table2;
          }
          if (tname === table2) {
            matchCount++;
            tableToAdd = table1;
          }
        }
        if (matchCount === 0) {
          msg = `Neither "${table1}" nor "${table2}" is already in the query, so we cannot add the selected join.`;
        } else if (matchCount === 1) {
          erdQuery.from.push(
            "  JOIN  " + tableToAdd + "\n    ON  " + fragment.split(" ON ")[1].replace(/ AND /g, "\n    AND ")
          );
          erdQuery.tables.push(tableToAdd);
        } else {
          msg = `Both "${table1}" and "${table2}" are already in the query, so we cannot add the selected join.`;
        }
      }
    }

    if (msg) {
      showToast(msg, "error");
      return;
    }

    if (erdQueryHistoryPosition < erdQueryHistory.length - 1) {
      erdQueryHistory.splice(erdQueryHistoryPosition + 1);
    }
    const snapshot = JSON.stringify(erdQuery);
    if (snapshot !== erdQueryHistory[erdQueryHistory.length - 1]) {
      erdQueryHistory.push(snapshot);
      erdQueryHistoryPosition = erdQueryHistory.length - 1;
    }

    erdWriteQuery();
  }

  /**
   * Starts dragging an ERD table card.
   * @param {PointerEvent} event
   * @param {SVGGElement} nodeEl
   */
  function startErdDrag(event, nodeEl) {
    if (event.button !== 0 || !erdState) return;
    const tableName = nodeEl.getAttribute("data-table");
    const node = tableName ? erdState.nodes.get(tableName) : null;
    if (!tableName || !node) return;

    const point = pointerToErdCoords(event);
    erdDrag = {
      tableName,
      offsetX: point.x - node.x,
      offsetY: point.y - node.y,
      pointerId: event.pointerId,
    };

    nodeEl.classList.add("is-dragging");
    nodeEl.parentNode.appendChild(nodeEl);
    const scroll = el.resultsBody.querySelector(".erd-scroll");
    if (scroll) scroll.classList.add("is-dragging");
    nodeEl.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  /**
   * Continues an active ERD table drag.
   * @param {PointerEvent} event
   */
  function onErdPointerMove(event) {
    if (!erdDrag || event.pointerId !== erdDrag.pointerId) return;
    const point = pointerToErdCoords(event);
    moveErdNode(erdDrag.tableName, point.x - erdDrag.offsetX, point.y - erdDrag.offsetY);
  }

  /**
   * Ends an active ERD table drag.
   * @param {PointerEvent} event
   */
  function endErdDrag(event) {
    if (!erdDrag || event.pointerId !== erdDrag.pointerId) return;
    const nodeEl = findErdNodeEl(erdDrag.tableName);
    if (nodeEl) nodeEl.classList.remove("is-dragging");
    const scroll = el.resultsBody.querySelector(".erd-scroll");
    if (scroll) scroll.classList.remove("is-dragging");
    erdDrag = null;
  }

  /**
   * Attaches pointer listeners so ERD table cards can be dragged (Edit Diagram
   * mode), or a click listener that feeds the clicked table/column into the
   * SQL builder (Write SQL mode, which doesn't allow rearranging tables).
   */
  function bindErdDragHandlers() {
    const svg = el.resultsBody.querySelector(".erd-svg");
    if (!svg) return;

    svg.querySelectorAll(".erd-node").forEach((nodeEl) => {
      if (erdMode === "sql") {
        nodeEl.addEventListener("click", (event) => {
          const tableName = nodeEl.getAttribute("data-table");
          if (!tableName) return;
          const columnName = event.target.closest(".erd-column-row")?.getAttribute("data-column");
          if (columnName) {
            erdAmendSql(`${tableName}.${columnName}`, "field", event.ctrlKey);
          } else {
            erdAmendSql(tableName, "table", event.ctrlKey);
          }
        });
        return;
      }
      nodeEl.addEventListener("pointerdown", (event) => startErdDrag(event, nodeEl));
      nodeEl.addEventListener("pointermove", onErdPointerMove);
      nodeEl.addEventListener("pointerup", endErdDrag);
      nodeEl.addEventListener("pointercancel", endErdDrag);
    });
  }

  /**
   * Applies the current ERD zoom to the SVG and label.
   */
  function applyErdZoom() {
    const svg = el.resultsBody.querySelector(".erd-svg");
    if (svg) svg.style.transform = `scale(${erdZoom})`;
    el.erdZoomLabel.textContent = `${Math.round(erdZoom * 100)}%`;
    syncErdCanvasSize();
  }

  /**
   * Clamps an ERD zoom factor to the allowed range.
   * @param {number} zoom
   */
  function clampErdZoom(zoom) {
    return Math.min(ERD_ZOOM_MAX, Math.max(ERD_ZOOM_MIN, zoom));
  }

  /**
   * Zooms the ERD toward a viewport point so that point stays under the cursor/fingers.
   * @param {number} clientX - Focal X in viewport coordinates.
   * @param {number} clientY - Focal Y in viewport coordinates.
   * @param {number} nextZoom - Desired zoom factor before clamping.
   */
  function setErdZoomAt(clientX, clientY, nextZoom) {
    const scroll = el.resultsBody.querySelector(".erd-scroll");
    if (!scroll) {
      erdZoom = clampErdZoom(nextZoom);
      applyErdZoom();
      return;
    }

    const zoom = clampErdZoom(nextZoom);
    if (zoom === erdZoom) {
      applyErdZoom();
      return;
    }

    const rect = scroll.getBoundingClientRect();
    const contentX = (clientX - rect.left + scroll.scrollLeft) / erdZoom;
    const contentY = (clientY - rect.top + scroll.scrollTop) / erdZoom;

    erdZoom = zoom;
    applyErdZoom();

    scroll.scrollLeft = contentX * erdZoom - (clientX - rect.left);
    scroll.scrollTop = contentY * erdZoom - (clientY - rect.top);
  }

  /**
   * Changes ERD zoom by a delta and clamps to min/max, centered in the viewport.
   * @param {number} delta
   */
  function changeErdZoom(delta) {
    const scroll = el.resultsBody.querySelector(".erd-scroll");
    const nextZoom = Math.round((erdZoom + delta) * 10) / 10;
    if (!scroll) {
      erdZoom = clampErdZoom(nextZoom);
      applyErdZoom();
      return;
    }
    const rect = scroll.getBoundingClientRect();
    setErdZoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, nextZoom);
  }

  /**
   * Clears any active ERD table drag (used when a pinch starts).
   */
  function cancelErdDrag() {
    if (!erdDrag) return;
    const nodeEl = findErdNodeEl(erdDrag.tableName);
    if (nodeEl) nodeEl.classList.remove("is-dragging");
    const scroll = el.resultsBody.querySelector(".erd-scroll");
    if (scroll) scroll.classList.remove("is-dragging");
    erdDrag = null;
  }

  /**
   * Starts an ERD pinch session from a two-finger touch.
   * @param {TouchEvent} event
   */
  function onErdTouchStart(event) {
    if (event.touches.length !== 2) {
      if (event.touches.length < 2) erdPinch = null;
      return;
    }
    cancelErdDrag();
    const a = event.touches[0];
    const b = event.touches[1];
    const distance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    if (distance < 8) return;
    erdPinch = { distance, zoom: erdZoom };
  }

  /**
   * Continues an ERD pinch-zoom toward the midpoint between fingers.
   * @param {TouchEvent} event
   */
  function onErdTouchMove(event) {
    if (event.touches.length !== 2 || !erdPinch) return;
    event.preventDefault();
    const a = event.touches[0];
    const b = event.touches[1];
    const distance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    if (distance < 8) return;
    setErdZoomAt(
      (a.clientX + b.clientX) / 2,
      (a.clientY + b.clientY) / 2,
      erdPinch.zoom * (distance / erdPinch.distance)
    );
  }

  /**
   * Ends an ERD pinch session when fewer than two fingers remain.
   * @param {TouchEvent} event
   */
  function onErdTouchEnd(event) {
    if (event.touches.length < 2) erdPinch = null;
  }

  /**
   * Zooms the ERD for trackpad pinch (ctrl+wheel) toward the cursor.
   * @param {WheelEvent} event
   */
  function onErdWheelZoom(event) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.01);
    setErdZoomAt(event.clientX, event.clientY, erdZoom * factor);
  }

  /**
   * Starts a Safari trackpad pinch gesture.
   * @param {Event} event
   */
  function onErdGestureStart(event) {
    event.preventDefault();
    erdGestureStartZoom = erdZoom;
  }

  /**
   * Continues a Safari trackpad pinch gesture toward the cursor.
   * @param {Event & { scale?: number, clientX?: number, clientY?: number }} event
   */
  function onErdGestureChange(event) {
    event.preventDefault();
    if (erdGestureStartZoom == null || typeof event.scale !== "number") return;
    const clientX = typeof event.clientX === "number" ? event.clientX : 0;
    const clientY = typeof event.clientY === "number" ? event.clientY : 0;
    setErdZoomAt(clientX, clientY, erdGestureStartZoom * event.scale);
  }

  /**
   * Ends a Safari trackpad pinch gesture.
   * @param {Event} event
   */
  function onErdGestureEnd(event) {
    event.preventDefault();
    erdGestureStartZoom = null;
  }

  /**
   * Attaches pinch and trackpad zoom listeners to the ERD scroll container.
   */
  function bindErdZoomHandlers() {
    const scroll = el.resultsBody.querySelector(".erd-scroll");
    if (!scroll) return;

    erdPinch = null;
    erdGestureStartZoom = null;

    scroll.addEventListener("touchstart", onErdTouchStart, { passive: true });
    scroll.addEventListener("touchmove", onErdTouchMove, { passive: false });
    scroll.addEventListener("touchend", onErdTouchEnd);
    scroll.addEventListener("touchcancel", onErdTouchEnd);
    scroll.addEventListener("wheel", onErdWheelZoom, { passive: false });
    scroll.addEventListener("gesturestart", onErdGestureStart);
    scroll.addEventListener("gesturechange", onErdGestureChange);
    scroll.addEventListener("gestureend", onErdGestureEnd);
  }

  /**
   * Fetches schema metadata (and any saved `system.erd` positions) and builds
   * `erdState` from scratch. Does not touch the DOM.
   * @returns {Promise<boolean>} Whether any tables were found.
   */
  async function buildErdState() {
    const schema = await fetchErdSchema();
    if (!schema.tables.length) {
      erdState = null;
      return false;
    }

    mergeErdPositions(await fetchErdPositionsFromDb());

    const { nodes } = layoutErdNodes(schema.tables, schema.relationships);
    erdState = {
      nodes,
      relationships: schema.relationships,
      tableCount: schema.tables.length,
    };
    return true;
  }

  /**
   * Draws the current `erdState` into the results pane and (re)binds
   * interaction handlers. Does not re-fetch anything from the database, so
   * dragged positions and zoom made during the session are preserved.
   */
  function renderErdView() {
    erdDrag = null;
    erdPinch = null;
    erdGestureStartZoom = null;
    erdSelectedRelIndex = null;
    el.resultsBody.className = "results-body erd-body";

    if (!erdState) {
      el.resultsBody.innerHTML = `<div class="empty-hint">No tables yet. Create or upload tables to see an ERD.</div>`;
      el.resultsMeta.textContent = "0 tables";
      return;
    }

    const { nodes, relationships, tableCount } = erdState;
    let maxX = 0;
    let maxY = 0;
    for (const node of nodes.values()) {
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }
    const width = maxX + ERD_PAD_X;
    const height = maxY + ERD_PAD_Y;

    const relationshipsSvg = relationships
      .map((rel, index) => renderErdRelationship(rel, nodes, index))
      .join("");
    const nodesSvg = [...nodes.values()].map((node) => renderErdNode(node)).join("");

    el.resultsBody.innerHTML = `
    <div class="erd-scroll${erdMode === "sql" ? " is-sql-mode" : ""}">
      <svg class="erd-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
           role="group" aria-label="Interactive entity relationship diagram"
           style="width: ${width}px; height: ${height}px; transform: scale(${erdZoom});">
        <g id="erd-relationships">${relationshipsSvg}</g>
        <g id="erd-nodes">${nodesSvg}</g>
      </svg>
    </div>`;

    const relCount = relationships.length;
    el.resultsMeta.textContent = `${tableCount} table(s) · ${relCount} relationship(s)`;
    bindErdDragHandlers();
    bindErdRelationshipHandlers();
    bindErdZoomHandlers();
    applyErdZoom();
  }

  /**
   * Shows the ERD view. Schema (and saved positions) are only fetched the
   * first time it's shown for the currently loaded database, or when
   * `rebuild` is requested (e.g. via the refresh button) — otherwise the
   * existing `erdState` is redrawn as-is, preserving any user dragging.
   * @param {{ rebuild?: boolean }} [opts]
   */
  async function renderErd({ rebuild = false } = {}) {
    if (!pg) return;

    if (rebuild || !erdState) {
      el.resultsBody.className = "results-body erd-body";
      el.resultsBody.innerHTML = `<div class="empty-hint">Loading ERD…</div>`;
      el.resultsMeta.textContent = "";
      await buildErdState();
    }

    renderErdView();
  }

  // ---- Resizable split ---------------------------------------------------------

  function initResizer() {
    let dragging = false;

    el.resizer.addEventListener("mousedown", () => {
      dragging = true;
      document.body.style.cursor = "row-resize";
    });

    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const layout = el.editorPane.parentElement.getBoundingClientRect();
      const relative = e.clientY - layout.top;
      const min = 80;
      const max = layout.height - 100;
      const clamped = Math.max(min, Math.min(max, relative));
      el.editorPane.style.flex = `0 0 ${clamped}px`;
    });

    window.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = "";
    });
  }

  // ---- Wire up UI ------------------------------------------------------------

  function initEventListeners() {
    window.addEventListener("beforeunload", (e) => {
      if (!hasUnsavedChanges) return;
      e.preventDefault();
      e.returnValue = "";
    });

    el.run.addEventListener("click", () => userRunQuery());

    el.resultsBody.addEventListener("click", async (e) => {
      const expandBtn = e.target.closest(".cell-expand-btn");
      if (expandBtn) {
        const td = expandBtn.closest("td");
        const expanded = td.classList.toggle("cell-expanded");
        expandBtn.title = expanded ? "Show less" : "Show full text";
        return;
      }

      const csvBtn = e.target.closest(".csv-btn");
      if (csvBtn) {
        downloadResultAsCsv(Number(csvBtn.getAttribute("data-idx")));
        return;
      }

      const jsonBtn = e.target.closest(".result-json-btn");
      if (jsonBtn) {
        downloadResultAsJson(Number(jsonBtn.getAttribute("data-idx")));
        return;
      }

      const pageBtn = e.target.closest(".page-btn");
      if (pageBtn) {
        goToResultPage(Number(pageBtn.getAttribute("data-idx")), pageBtn.getAttribute("data-dir"));
        return;
      }

      const clearHistoryBtn = e.target.closest(".history-clear-btn");
      if (clearHistoryBtn) {
        if (await showConfirmDialog("Clear all queries from this session's history?")) clearQueryHistory();
        return;
      }

      const loadBtn = e.target.closest(".history-load-btn");
      const historyItem = e.target.closest(".history-item");
      const historyId = (loadBtn || historyItem)?.getAttribute("data-history-id");
      if (historyId) loadHistoryQuery(historyId);
    });

    el.openNewTab.addEventListener("click", () => handleOpenInNewTab());

    el.viewResults.addEventListener("click", () => setResultsView("results"));
    el.viewHistory.addEventListener("click", () => setResultsView("history"));
    el.viewErd.addEventListener("click", () => setResultsView("erd"));
    el.erdModeSelect.addEventListener("change", () => {
      erdMode = el.erdModeSelect.value;
      el.erdClauseSelect.hidden = erdMode !== "sql";
      if (resultsViewMode === "erd") renderErdView();
    });
    el.erdClauseSelect.hidden = erdMode !== "sql";
    el.erdClauseSelect.addEventListener("change", () => {
      erdClause = el.erdClauseSelect.value;
    });
    el.erdZoomIn.addEventListener("click", () => changeErdZoom(ERD_ZOOM_STEP));
    el.erdZoomOut.addEventListener("click", () => changeErdZoom(-ERD_ZOOM_STEP));
    el.erdRefresh.addEventListener("click", () => {
      if (resultsViewMode === "erd") renderErd({ rebuild: true }).catch(console.error);
    });
    el.erdLogPositions.addEventListener("click", () => logErdTablePositions());
  }

  // ---- Boot -----------------------------------------------------------------

  async function main() {
    scheduleSplashRetryReveal();
    initEventListeners();
    initResizer();
    await initMonaco();
    hideSplash();
    applySqlUrlParameter();
    if (resultLabel) {
      setStatus("Loading preview…");
      loadResultFromBlog(resultLabel);
    }
    // Nothing else boots the database here (see useDeferredDb) - it's created
    // lazily on the reader's first Run, via ensureDeferredDbBooted() - unless
    // this instance names its own dataset (options.datasetLabel), in which
    // case there's no reason to make the reader click Run just to see the
    // query they were already shown: boot immediately and run it for them.
    if (options.datasetLabel) {
      await userRunQuery();
    } else if (options.autoCascade) {
      // A sibling code-block panel (not necessarily this one) is the one
      // that loads the shared dataset. Once whichever panel runs its query
      // first, run this one's too - fire-and-forget, so main() (and this
      // instance's `ready` promise) doesn't hang waiting on a sibling that
      // might never come, e.g. if no block on the page has a datasetLabel.
      firstQueryRan.then(() => {
        if (!hasRunOnce) userRunQuery();
      });
    }
  }

  // Resolves once this instance's default database is ready.
  return {
    instanceId,
    ready: main(),
    applyErdTablePositions,
    logErdTablePositions,
  };
}

/**
 * A `data-<label>` class on the fenced code block - e.g.
 * ```{.sql .websql .data-museum}``` becoming `<pre class="... data-museum">` -
 * names the dataset that block's query-studio should load, exactly as if
 * `?data=<label>` had been passed on the URL for that instance alone. Returns
 * null if no such class is present.
 */
function datasetLabelFromClassList(classList) {
  for (const cls of classList) {
    if (cls.startsWith("data-")) return cls.slice("data-".length);
  }
  return null;
}

/**
 * Replaces every `<pre class="... websql">` code block - the shape pandoc
 * produces for a ```{.sql .websql}```-tagged fenced code block in a blog
 * post - with an empty `.query-studio` container carrying that block's own
 * SQL text in `data-initial-sql` (and, if a `data-<label>` class was present,
 * the dataset label in `data-dataset-label`), ready for the bootstrap loop
 * below to turn into a live widget seeded with exactly that query.
 * @returns {number} How many blocks were converted.
 */
function convertWebsqlCodeBlocks() {
  const blocks = document.querySelectorAll("pre.websql");
  blocks.forEach((pre) => {
    const sql = pre.textContent.replace(/\u00a0/g, " ").trim();
    const datasetLabel = datasetLabelFromClassList(pre.classList);
    const root = document.createElement("div");
    root.dataset.initialSql = sql;
    if (datasetLabel) root.dataset.datasetLabel = datasetLabel;
    const host = pre.closest(".sourceCode") || pre;
    host.replaceWith(root);
  });
  return blocks.length;
}

// ---- Bootstrap: one independent instance per .query-studio container ------
//
// Each such element gets its own editor, database connection, and
// results/history/ERD state - nothing is shared between them except the
// boot splash above and, if the browser theme preference changes, the
// document-wide dark/light attribute. A container can be hand-placed
// (`<div class="query-studio">`) or produced by convertWebsqlCodeBlocks()
// above from a `pre.websql` snippet - either way createQueryStudio() injects
// its own markup, so the container itself can start out empty.

const websqlBlockCount = convertWebsqlCodeBlocks();
if (websqlBlockCount > 1) useSharedDb = true;

const studioRoots = document.querySelectorAll(".query-studio, [data-initial-sql]");
window.pgliteStudios = Array.from(studioRoots).map((root, index) => {
  const initialSql = root.dataset.initialSql;
  const datasetLabel = root.dataset.datasetLabel;
  // Only code-block-derived roots (see convertWebsqlCodeBlocks) join the
  // first-query-ran cascade; a hand-placed `.query-studio` container has no
  // `data-initial-sql` attribute even when empty, so presence (not truthiness)
  // is what distinguishes the two origins.
  const autoCascade = "initialSql" in root.dataset;
  delete root.dataset.initialSql;
  delete root.dataset.datasetLabel;
  return createQueryStudio(root, `studio-${index}`, {
    ...(initialSql ? { initialSql } : {}),
    ...(datasetLabel ? { datasetLabel } : {}),
    ...(autoCascade ? { autoCascade } : {}),
  });
});
// External code that wants to auto-load a default database on boot must
// wait on this first - otherwise it races each instance's own createDatabase()
// call and whichever finishes last silently overwrites the other.
window.pgliteReady = Promise.all(window.pgliteStudios.map((s) => s.ready));
