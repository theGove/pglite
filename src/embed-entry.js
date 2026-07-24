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

/*__CORE_PAGE__*/

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


  /** Resolves loadDataFromBlog's in-flight promise (see getDataFromBlog); JSONP has no return value to await, so completion is signaled through this instead. */
  let dataLoadCompleteResolve = null;


  /** Timestamp captured right before fetching a canned result post; read by handleResultFeed once the JSONP callback fires. */
  let resultFetchStartedAt = null;

  /** Dataset label from the fetched canned result's `data` property; used by applyDataUrlParameter when the `data` URL parameter itself is absent. */
  let resultDataFallback = null;



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

  const HAS_SAVED_QUERIES = false;
  const THEME_ATTR = "data-pglite-theme";
  const CSS_PREFIX = "pglite-";

  /*__CORE__*/

  console.log("websql code is running", instanceId)
  applyTheme(getPreferredTheme());
  el.erdLogPositions.hidden = !isAdminMode;

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

  /** Tracks the most recently kicked-off refreshTables() call; unused directly in the embed build today but kept in scope since the shared runQuery() assigns it. */
  let pendingTablesRefresh = Promise.resolve();




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
