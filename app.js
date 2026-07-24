// GENERATED FILE - do not hand-edit.
// Built by build.py from src/core.js + src/app-entry.js.
// Edit the sources in src/ and run `python build.py` to regenerate.

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
/** Enable multi-tab shared DB with ?shared=1 */
const SHARED_DB_PARAM = "shared";
const useSharedDb = new URLSearchParams(window.location.search).get(SHARED_DB_PARAM) === "1";
/** Lock the session read-only after data load when ?readonly=1 */
const useReadOnly = new URLSearchParams(window.location.search).get("readonly") === "1";
/** Compact embed chrome when ?style=minimal */
const isMinimalStyle = new URLSearchParams(window.location.search).get("style") === "minimal";
/**
 * Defers booting the PGlite engine until the learner clicks Run when ?result=
 * is present. The editor loads normally and shows the `sql` param's query,
 * but nothing touches the database until an explicit run. Meanwhile the
 * `result` value is used as a websqldata.blogspot.com post label (see
 * loadResultFromBlog) to fetch and display a canned result in its place.
 */
const useDeferredDb = new URLSearchParams(window.location.search).has("result");
/** Blogger post label to fetch a canned query result from; see loadResultFromBlog. */
const resultLabel = new URLSearchParams(window.location.search).get("result");
/** Max time to wait for the shared DB's cross-tab leader-election handshake before giving up. */
const DB_READY_TIMEOUT_MS = 10000;
/** How long the splash screen shows before revealing its "Retry" button, in case boot is stuck somewhere no timeout above covers. */
const SPLASH_RETRY_REVEAL_MS = 10000;


// admin menu system for doing things at the command prompt
function menu(){
    console.log("\n\n\n")
    console.log("Admin Menu:")
    console.log("  a. Print ERD Table Positions")
}
function a(){
  logErdTablePositions()
}



//for getting data from websqldata.blogspot.com
let scriptFragments=null
let postsFetched=null
let currentLabel = null
let dataCallback= null
const metadata=[]



  
/** Resolves loadDataFromBlog's in-flight promise (see getDataFromBlog); JSONP has no return value to await, so completion is signaled through this instead. */
let dataLoadCompleteResolve = null;


/** Timestamp captured right before fetching a canned result post; read by handleResultFeed once the JSONP callback fires. */
let resultFetchStartedAt = null;

/** Dataset label from the fetched canned result's `data` property; used by applyDataUrlParameter when the `data` URL parameter itself is absent. */
let resultDataFallback = null;



function showDatasets(data){
  if(data){
    //console.log("data",data)
    // we have fetched the data, show it as a modal listing each dataset
    const overlay = document.createElement("div");
    overlay.className = "loading-overlay dataset-modal-overlay";

    const dialog = document.createElement("div");
    dialog.className = "loading-dialog dataset-modal-dialog";

    const closeModal = () => overlay.remove();

    const sortedData = [...data].sort((a, b) =>
      (a.title || a.label || "").localeCompare(b.title || b.label || "", undefined, { sensitivity: "base" })
    );

    const itemsHtml = sortedData.map(ds => {
      const label = ds.label || "";
      const title = ds.title || label || "Untitled dataset";
      const description = escapeHtml(ds.description || "").replace(/\r\n|\r|\n/g, "<br>");
      return `
        <div class="dataset-modal-item">
          <button type="button" class="dataset-modal-title" data-label="${escapeHtml(label)}">${escapeHtml(title)}</button>
          <div class="dataset-modal-description" hidden>
            ${description}
            <div class="dataset-modal-actions">
              <button type="button" class="btn btn-primary btn-sm dataset-modal-load-btn" data-label="${escapeHtml(label)}">
                <span class="spinner spinner-btn" hidden aria-hidden="true"></span>
                Load Dataset
              </button>
            </div>
          </div>
        </div>`;
    }).join("");

    dialog.innerHTML = `
      <div class="dataset-modal-content">
        <div class="dataset-modal-header">
          <div class="loading-dialog-title">Available Datasets</div>
          <button type="button" class="icon-btn dataset-modal-close" aria-label="Close">✕</button>
        </div>
        <div class="dataset-modal-list">${itemsHtml || "<p>No datasets found.</p>"}</div>
      </div>`;

    dialog.querySelector(".dataset-modal-close").addEventListener("click", closeModal);
    dialog.querySelectorAll(".dataset-modal-title").forEach((toggle) => {
      toggle.addEventListener("click", () => {
        const item = toggle.closest(".dataset-modal-item");
        const desc = item.querySelector(".dataset-modal-description");
        if (desc) desc.hidden = !desc.hidden;
      });
    });
    dialog.querySelectorAll(".dataset-modal-load-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const label = btn.getAttribute("data-label") || "";
        const spinner = btn.querySelector(".spinner");
        if (spinner) spinner.hidden = false;
        closeModal();
        getDataFromBlog(label);
      });
    });
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener("keydown", function onKeydown(e) {
      if (e.key === "Escape") {
        closeModal();
        document.removeEventListener("keydown", onKeydown);
      }
    });

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }else{
    //no data, we need to fetch it
    loadBloggerFeed('metadata',showDatasets)
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
let savedQueriesCache = [];
/**
 * True once the current in-browser database has changes (edits, imports,
 * saved queries) that only exist in memory/IndexedDB and haven't been
 * captured by a full "Download" (see handleDownload). Drives the
 * beforeunload warning so a refresh/close doesn't silently lose them.
 */
let hasUnsavedChanges = false;
/**
 * Tracks the most recently kicked-off refreshTables() call, which itself
 * runs a saved-queries select as its last step. refreshTables() is normally
 * fired without awaiting it so the UI doesn't stall after a query run, but
 * anything that needs the database to be quiescent first (e.g. handleSaveQuery's
 * existence check) must await this or risk racing an overlapping query on the
 * same PGlite connection.
 */
let pendingTablesRefresh = Promise.resolve();
let columnsCache = new Map();
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

/** Finds an element by its `data-role` attribute (shared with core.js/embed.js). */
function ref(role) {
  return document.querySelector(`[data-role="${role}"]`);
}

const el = {
  run: ref("btn-run"),
  openNewTab: ref("btn-open-new-tab"),
  menu: document.getElementById("menu"),
  menuButton: document.getElementById("btn-menu"),
  menuPanel: document.getElementById("menu-panel"),
  menuUpload: document.getElementById("menu-upload"),
  menuDownload: document.getElementById("menu-download"),
  //menuImportGist: document.getElementById("menu-import-gist"),
  //menuSaveGist: document.getElementById("menu-save-gist"),
  menuExportExcel: document.getElementById("menu-export-excel"),
  menuSchemaAi: document.getElementById("menu-schema-ai"),
  menuOpenNewTab: document.getElementById("menu-open-new-tab"),
  menuTheme: document.getElementById("menu-theme"),
  themeIcon: document.getElementById("theme-icon"),
  themeLabel: document.getElementById("theme-label"),
  menuClear: document.getElementById("menu-clear"),
  menuAbout: document.getElementById("menu-about"),
  menuLoadData: document.getElementById("menu-load-data"),
  fileInput: document.getElementById("file-input"),
  refreshTables: document.getElementById("btn-refresh-tables"),
  toggleSidebar: document.getElementById("btn-toggle-sidebar"),
  sidebar: document.getElementById("sidebar"),
  tableList: document.getElementById("table-list"),
  savedQueriesList: document.getElementById("saved-queries-list"),
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
  statusText: document.getElementById("status-text"),
  loadingIndicator: document.getElementById("loading-indicator"),
  statusBar: document.getElementById("statusbar"),
  dbName: document.getElementById("db-name"),
  toast: ref("toast"),
  resizer: ref("resizer"),
  editorPane: ref("editor-pane"),
  dbLoadingOverlay: ref("db-loading-overlay"),
  dbLoadingTitle: ref("db-loading-title"),
  dbLoadingSubtitle: ref("db-loading-subtitle"),
  brandName: document.getElementById("brand-name") || document.querySelector(".brand-name"),
};

/** Shared boot splash (single instance on this page, so ids are fine here). */
const splashEl = {
  splash: document.getElementById("splash"),
  splashRetry: document.getElementById("splash-retry"),
  appShell: document.getElementById("app-shell"),
};

const HAS_SAVED_QUERIES = true;
const THEME_ATTR = "data-theme";
const CSS_PREFIX = "";
/** Per-instance seed/boot options; always empty for the single-instance app (embed.js's studios pass real values here). */
const options = {};
/** JSONP callback names; a plain literal is fine here since app.js only ever has one instance (see embed.js for the per-instance-namespaced version). */
const jsonpFeedCallbackName = "handleFeed";
const jsonpResultCallbackName = "handleResultFeed";

/** index.html always loads the Monaco AMD loader directly, so there's nothing to lazily inject here (see embed.js for the lazy version). */
function ensureMonacoLoaderLoaded() {
  return Promise.resolve();
}

/** Single instance, so no per-instance namespacing needed (see embed.js for that version). */
const HISTORY_STORAGE_KEY = QUERY_HISTORY_KEY;

function stripFileExtension(name) {
  return name.replace(/\.(tar\.gz|tgz|[a-z0-9]+)$/i, "");
}

function setMenuOpen(isOpen) {
  el.menuPanel.hidden = !isOpen;
  el.menuButton.setAttribute("aria-expanded", String(isOpen));
}

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

function setStatus(text) {
  if (el.statusText) el.statusText.textContent = text;
}

/**
 * Updates the status-bar and header labels that show the current database name.
 * @param {string} label - Filename or display name for the loaded database.
 */
function setDbLabel(label) {
  currentFileLabel = label;
  if (el.dbName || el.brandName) {
    const displayLabel = stripFileExtension(label);
    if (el.dbName) el.dbName.textContent = displayLabel;
    if (el.brandName) el.brandName.textContent = displayLabel;
  }
}

function setStatusBarVisible(isVisible) {
  if (el.statusBar) {
    el.statusBar.hidden = !isVisible;
    el.statusBar.style.display = isVisible ? "flex" : "none";
  }
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

/** THEME_ATTR is namespaced per entry (e.g. `data-pglite-theme` for embed.js) so a host blog's own dark-mode toggling on <html> isn't clobbered. */
function applyTheme(theme) {
  document.documentElement.setAttribute(THEME_ATTR, theme);
  localStorage.setItem(THEME_KEY, theme);
  if (monacoRef && editor) monacoRef.editor.setTheme(monacoThemeFor(theme));

  if (el.themeIcon && el.themeLabel) {
    const next = theme === "dark" ? "light" : "dark";
    el.themeIcon.textContent = next === "dark" ? "🌙" : "☀️";
    el.themeLabel.textContent = next === "dark" ? "Dark Mode" : "Light Mode";
  }
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
 * browser's native dialog boxes. Classes are CSS_PREFIX-namespaced so the
 * embed build doesn't clobber (or get clobbered by) a host blog's styles.
 * @param {string} title
 * @returns {{ overlay: HTMLElement, dialog: HTMLElement }}
 */
function createAppDialogShell(title) {
  const overlay = document.createElement("div");
  overlay.className = `${CSS_PREFIX}loading-overlay ${CSS_PREFIX}app-dialog-overlay`;

  const dialog = document.createElement("div");
  dialog.className = `${CSS_PREFIX}loading-dialog ${CSS_PREFIX}app-dialog`;
  dialog.innerHTML = `<div class="${CSS_PREFIX}app-dialog-header ${CSS_PREFIX}loading-dialog-title">${escapeHtml(title)}</div>`;

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
      `<div class="${CSS_PREFIX}app-dialog-actions">
         <button type="button" class="btn ${CSS_PREFIX}app-dialog-cancel">${escapeHtml(cancelLabel)}</button>
         <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"} ${CSS_PREFIX}app-dialog-confirm">${escapeHtml(confirmLabel)}</button>
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

    dialog.querySelector(`.${CSS_PREFIX}app-dialog-cancel`).addEventListener("click", () => finish(false));
    dialog.querySelector(`.${CSS_PREFIX}app-dialog-confirm`).addEventListener("click", () => finish(true));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) finish(false);
    });
    document.addEventListener("keydown", onKeydown);
    dialog.querySelector(`.${CSS_PREFIX}app-dialog-confirm`).focus();
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
      `<div class="${CSS_PREFIX}app-dialog-body">
         <input type="text" class="${CSS_PREFIX}app-dialog-input" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(defaultValue)}" />
       </div>
       <div class="${CSS_PREFIX}app-dialog-actions">
         <button type="button" class="btn ${CSS_PREFIX}app-dialog-cancel">${escapeHtml(cancelLabel)}</button>
         <button type="button" class="btn btn-primary ${CSS_PREFIX}app-dialog-confirm">${escapeHtml(confirmLabel)}</button>
       </div>`
    );

    const input = dialog.querySelector(`.${CSS_PREFIX}app-dialog-input`);
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

    dialog.querySelector(`.${CSS_PREFIX}app-dialog-cancel`).addEventListener("click", () => finish(null));
    dialog.querySelector(`.${CSS_PREFIX}app-dialog-confirm`).addEventListener("click", () => finish(input.value));
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
  if (el.menuButton) el.menuButton.disabled = isBusy;
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
    setStatusBarVisible(true);
    if (el.loadingIndicator) {
      el.loadingIndicator.hidden = false;
      el.loadingIndicator.style.display = "inline-flex";
      el.loadingIndicator.querySelector(".loading-label").textContent = message;
    }
    showDbLoadingOverlay(message, "This may take a moment.");
    return;
  }

  dataLoadingDepth = Math.max(dataLoadingDepth - 1, 0);
  if (dataLoadingDepth === 0) {
    if (el.loadingIndicator) {
      el.loadingIndicator.hidden = true;
      el.loadingIndicator.style.display = "none";
    }
    setStatusBarVisible(false);
    hideDbLoadingOverlay();
  }
}

// ---- Fetching data from websqldata.blogspot.com ----------------------------

function loadBloggerFeed(label, callback, bloggerStartIndex = 1, isNextPage = false) {
  if (callback) {
    scriptFragments = {}
    postsFetched = 0
    dataCallback = callback
    metadata.length = 0
  }
  currentLabel = label
  const script = document.createElement('script');
  script.src = `https://websqldata.blogspot.com/feeds/posts/default/-/${label}?alt=json-in-script&start-index=${bloggerStartIndex}&callback=${jsonpFeedCallbackName}`;
  document.head.appendChild(script);
}

function handleFeed(json) {
  const entries = json.feed.entry || [];
  if (entries.length > 0) {
    postsFetched += entries.length
    entries.forEach(entry => {
      for (const cat of entry.category) {
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
    const startIndex = postsFetched + 1
    loadBloggerFeed(currentLabel, null, startIndex, true);
  } else {
    if (Object.keys(scriptFragments).length === 0) {
      // assume we are getting metadata
      dataCallback(metadata)
    } else {
      // we have gotten the data
      const order = Object.keys(scriptFragments).map(Number).sort((a, b) => a - b)
      for (let x = 0; x < order.length; x++) {
        order[x] = scriptFragments[order[x]]
      }
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
        theme: monacoThemeFor(document.documentElement.getAttribute(THEME_ATTR)),
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
 * Loads the `sql` URL parameter's query into the editor. A studio seeded
 * from its own `options.initialSql` (e.g. a pre.websql snippet) keeps that
 * SQL regardless of a page-wide `?sql=` param, which would otherwise
 * clobber every studio on the page.
 */
function applySqlUrlParameter() {
  if (!editor) return;
  if (options.initialSql) return;

  const params = new URLSearchParams(window.location.search);
  if (!params.has("sql")) return;

  const value = params.get("sql");
  if (value !== null) {
    editor.setValue(value);
    if (!useDeferredDb) {
      runInitialSqlQuery();
    }
  }
}

/**
 * Loads a dataset published on websqldata.blogspot.com when the page is
 * opened with a `data` URL parameter (e.g. the "Load Data" modal's links to
 * `/2000/03/blank.html?data=<label>`). Falls back to this instance's own
 * `options.datasetLabel` (see datasetLabelFromClassList), then to the `data`
 * label recorded on a fetched canned `result` object (see handleResultFeed),
 * when the URL parameter itself is omitted.
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

/** Resolves once the deferred database (see useDeferredDb) has booted; cached so concurrent Run clicks await the same boot instead of racing. */
function ensureDeferredDbBooted() {
  if (!useDeferredDb) return Promise.resolve();
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

/** Runs the query as an explicit user action; the first call boots a deferred database, and stops the initial `sql` URL parameter's auto-retry loop. */
async function userRunQuery() {
  hasRunOnce = true;
  await ensureDeferredDbBooted();
  runQuery();
}

async function runQuery() {
  if (!pg) return;
  const sql = editor.getValue().trim();
  if (!sql) return;

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
    pendingTablesRefresh = refreshTables();
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

// ---- Boot -------------------------------------------------------------------

async function main() {
  scheduleSplashRetryReveal();
  initEventListeners();
  initResizer();
  await initMonaco();
  if (useDeferredDb) {
    hideSplash();
    applySqlUrlParameter();
    if (resultLabel) {
      setStatus("Loading preview…");
      loadResultFromBlog(resultLabel);
    }
    if (options.datasetLabel) {
      await userRunQuery();
    } else if (options.autoCascade) {
      firstQueryRan.then(() => {
        if (!hasRunOnce) userRunQuery();
      });
    }
    return;
  }
  await switchDatabase(() => createDatabase(), DEFAULT_DB_LABEL, { showLoadingOverlay: false });
  hideSplash();
  applySqlUrlParameter();
  if (isPrimaryInstance) {
    applyDataUrlParameter();
  }
}

// ---- Table sidebar (app.js only - el.tableList doesn't exist in the embed template) ---

/** Rebuilds the table sidebar (if present) and the ERD (if it's the visible view) after a query may have changed the schema. */
async function refreshTables() {
  if (!pg) return;
  if (el.tableList) {
    columnsCache.clear();
    try {
      const { rows } = await pg.query(
        `select table_name, table_type from information_schema.tables
         where table_schema = 'public' order by (table_type = 'VIEW'), table_name;`
      );
      if (!rows.length) {
        el.tableList.innerHTML = `<div class="empty-hint">No tables yet</div>`;
      } else {
        el.tableList.innerHTML = rows
          .map((r) => {
            const isView = r.table_type === "VIEW";
            return `
            <div class="table-group">
              <div class="table-row">
                <button class="table-toggle" data-table="${escapeHtml(r.table_name)}" aria-label="Toggle columns">▸</button>
                <span class="table-name${isView ? " is-view" : ""}" data-table="${escapeHtml(r.table_name)}">
                  <span class="table-icon">▦</span>${escapeHtml(r.table_name)}
                </span>
              </div>
              <div class="table-columns" hidden></div>
            </div>`;
          })
          .join("");

        el.tableList.querySelectorAll(".table-name").forEach((node) => {
          node.addEventListener("click", () => {
            const name = node.getAttribute("data-table");
            editor.setValue(`select * from "${name}" limit 100;`);
            userRunQuery();
          });
        });

        el.tableList.querySelectorAll(".table-toggle").forEach((btn) => {
          btn.addEventListener("click", () => toggleTableColumns(btn));
        });
      }
    } catch (err) {
      console.error(err);
    }
  }

  if (resultsViewMode === "erd") {
    renderErd({ rebuild: true }).catch(console.error);
  }
  if (HAS_SAVED_QUERIES) {
    await refreshSavedQueries();
  }
}

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

// ---- Results table ----------------------------------------------------------

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
  const saveQueryBtn = HAS_SAVED_QUERIES
    ? `<button class="save-query-btn" title="Save this query">⭳ Save Query</button>`
    : "";
  const actions = `<div class="result-block-actions">${csvBtn}${jsonBtn}${saveQueryBtn}</div>`;
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
  const stmt=[]
  for (const [name, node] of erdState.nodes) {
    positions[name] = { x: node.x, y: node.y };
  }
  stmt.push("create schema system;")
  stmt.push("create table system.erd(data text);")
  stmt.push("insert into system.erd values('")
  stmt.push(JSON.stringify(positions, null, 2))
  stmt.push("');")
  ;console.log(stmt.join("\n"));
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

console.log("websql code is running")
applyTheme(getPreferredTheme());
setStatusBarVisible(false);
el.erdLogPositions.hidden = !isAdminMode;
if (el.openNewTab) el.openNewTab.hidden = !isMinimalStyle;

/** Retry interval for the initial `sql` URL parameter's auto-run; see runInitialSqlQuery. */
const INITIAL_SQL_RETRY_MS = 3000;

/**
 * Runs the `sql` URL parameter's query, retrying every INITIAL_SQL_RETRY_MS
 * until it succeeds. Covers the case where the automatic initial run fires
 * before the (possibly shared) database connection is actually usable and
 * shows an error the user never asked for. Stops as soon as the user runs a
 * query themselves, so it never clobbers something they've typed or run.
 */
async function runInitialSqlQuery() {
  if (hasRunOnce) return;
  if (!pg) {
    setTimeout(runInitialSqlQuery, INITIAL_SQL_RETRY_MS);
    return;
  }
  await runQuery();
  if (!hasRunOnce && lastResultsClassName.includes("has-error")) {
    setTimeout(runInitialSqlQuery, INITIAL_SQL_RETRY_MS);
  }
}

/** Schema + table where user-named "Save Query" snippets are stored. */
const SAVED_QUERIES_SCHEMA = "system";
const SAVED_QUERIES_TABLE = `${SAVED_QUERIES_SCHEMA}.saved_query`;


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
        return new Promise(() => {}); // hold the lock until this context is torn down
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
    pendingTablesRefresh = refreshTables().catch(() => {});
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

async function importIntoCurrentDatabase(file) {
  if (!pg) {
    await switchDatabase(() => createDatabase(), DEFAULT_DB_LABEL, { showLoadingOverlay: false });
  }

  const kind = extOf(file.name);
  setDataLoading(true, kind === "sql" ? "Importing SQL…" : kind === "csv" ? "Importing CSV…" : "Importing workbook…");

  try {
    if (kind === "sql") {
      const text = await file.text();
      await pg.exec(text);
    } else if (kind === "csv") {
      await importCsvIntoDatabase(pg, file);
    } else if (kind === "excel") {
      await importExcelIntoDatabase(pg, file);
    } else {
      throw new Error("Unsupported file type. Use .sql, .csv or Excel.");
    }
    markUnsavedChanges();
  } finally {
    setDataLoading(false);
  }
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

/** True once the user has explicitly run a query themselves (Run button, Ctrl+Enter, clicking a table/history entry). */
let hasRunOnce = false;

/**
 * Resolves once the deferred database (see useDeferredDb) has booted. Null
 * until the first Run triggers it; cached afterward so concurrent Run clicks
 * (e.g. an impatient double-click while the engine is still booting) await
 * the same boot instead of one of them racing ahead and running its query
 * against a still-null `pg`.
 */
let deferredDbBootPromise = null;



/**
 * Loads the user's named "Save Query" snippets from `system.saved_queries`
 * (created lazily the first time a query is saved) and renders them below
 * the table list. Missing schema/table just means none have been saved yet.
 */
async function refreshSavedQueries() {
  if (!pg) return;
  try {
    const { rows } = await pg.query(`select name, sql from ${SAVED_QUERIES_TABLE} order by name;`);
    savedQueriesCache = rows;
  } catch (_) {
    savedQueriesCache = [];
  }

  if (!savedQueriesCache.length) {
    el.savedQueriesList.innerHTML = `<div class="empty-hint">No saved queries</div>`;
    return;
  }

  el.savedQueriesList.innerHTML = savedQueriesCache
    .map(
      (q, i) => `
      <div class="table-row saved-query-row">
        <span class="table-name saved-query-name" data-idx="${i}" title="${escapeHtml(q.sql)}">
          <span class="table-icon">🔖</span>${escapeHtml(q.name)}
        </span>
        <button type="button" class="table-toggle saved-query-delete-btn" data-idx="${i}" title="Delete saved query">🗑️</button>
      </div>`
    )
    .join("");

  el.savedQueriesList.querySelectorAll(".saved-query-name").forEach((node) => {
    node.addEventListener("click", () => {
      const query = savedQueriesCache[Number(node.getAttribute("data-idx"))];
      if (!query) return;
      editor.setValue(query.sql);
      runQuery();
    });
  });

  el.savedQueriesList.querySelectorAll(".saved-query-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const query = savedQueriesCache[Number(btn.getAttribute("data-idx"))];
      if (!query) return;
      if (!(await showConfirmDialog(`Delete saved query "${query.name}"?`, { confirmLabel: "Delete", danger: true }))) return;
      try {
        await pg.query(`delete from ${SAVED_QUERIES_TABLE} where name = $1;`, [query.name]);
        showToast(`Deleted query "${query.name}"`, "success");
        await refreshSavedQueries();
      } catch (err) {
        console.error(err);
        showToast(err.message || "Failed to delete query", "error");
      }
    });
  });
}

/**
 * Prompts for a name and records the SQL currently in the editor into
 * `system.saved_queries`, creating the `system` schema/table on first use.
 */
async function handleSaveQuery() {
  if (!pg) return;
  const sql = editor.getValue().trim();
  if (!sql) return;

  // Let any in-flight background refresh (kicked off by the last query run)
  // finish first, so its saved-queries select can't race the calls below.
  await pendingTablesRefresh;

  const name = await showPromptDialog("Save query as:");
  if (!name) return;

  try {
    await pg.exec(
      `create schema if not exists ${SAVED_QUERIES_SCHEMA};
       create table if not exists ${SAVED_QUERIES_TABLE} (name text primary key, sql text not null);`
    );

    const { rows: existingRows } = await pg.query(`select 1 from ${SAVED_QUERIES_TABLE} where name = $1;`, [name]);
    if (
      existingRows.length &&
      !(await showConfirmDialog(`A saved query named "${name}" already exists. Replace it?`, { confirmLabel: "Replace" }))
    ) {
      return;
    }

    await pg.query(
      `insert into ${SAVED_QUERIES_TABLE} (name, sql) values ($1, $2)
       on conflict (name) do update set sql = excluded.sql;`,
      [name, sql]
    );
    markUnsavedChanges();
    showToast(`Saved query "${name}"`, "success");
    await refreshSavedQueries();
  } catch (err) {
    console.error(err);
    showToast(err.message || "Failed to save query", "error");
  }
}

async function toggleTableColumns(btn) {
  const name = btn.getAttribute("data-table");
  const container = btn.closest(".table-group").querySelector(".table-columns");

  if (!container.hidden) {
    container.hidden = true;
    btn.textContent = "▸";
    return;
  }

  container.hidden = false;
  btn.textContent = "▾";
  if (container.dataset.loaded) return;

  container.innerHTML = `<div class="column-item empty-hint">Loading…</div>`;
  try {
    const columns = await fetchColumns(name);
    renderColumns(container, columns);
    container.dataset.loaded = "1";
  } catch (err) {
    container.innerHTML = `<div class="column-item empty-hint">${escapeHtml(err.message)}</div>`;
  }
}

async function fetchColumns(tableName) {
  if (columnsCache.has(tableName)) return columnsCache.get(tableName);
  const { rows } = await pg.query(
    `select column_name, data_type from information_schema.columns
     where table_schema = 'public' and table_name = $1
     order by ordinal_position;`,
    [tableName]
  );
  columnsCache.set(tableName, rows);
  return rows;
}

function renderColumns(container, columns) {
  if (!columns.length) {
    container.innerHTML = `<div class="column-item empty-hint">No columns</div>`;
    return;
  }
  container.innerHTML = columns
    .map(
      (c) =>
        `<div class="column-item"><span class="column-name">${escapeHtml(c.column_name)}</span><span>${escapeHtml(c.data_type)}</span></div>`
    )
    .join("");
}

// ---- Upload / Download -----------------------------------------------------

function sanitizeIdentifier(value) {
  const base = String(value || "column")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "_$1");
  return base || "column";
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  if (inQuotes) {
    row.push(field);
  } else {
    row.push(field);
  }

  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function inferSqlType(values) {
  const nonEmpty = values.filter((value) => value !== null && value !== undefined && String(value).trim() !== "");
  if (!nonEmpty.length) return "text";

  const normalized = nonEmpty.map((value) => String(value).trim());

  if (normalized.every((value) => /^(true|false)$/i.test(value))) return "boolean";
  if (normalized.every((value) => /^[-+]?\d+$/.test(value))) return "integer";
  if (normalized.every((value) => /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(value))) return "double precision";
  if (normalized.every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))) return "date";
  if (normalized.every((value) => /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/.test(value))) return "timestamp";

  return "text";
}

function sqlLiteral(value) {
  if (value === null || value === undefined || String(value).trim() === "") return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return "'" + String(value).replace(/'/g, "''") + "'";
}

async function importTabularRowsIntoDatabase(db, tableName, rows) {
  const nonEmptyRows = rows.filter((row) => Array.isArray(row) && row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""));
  if (!nonEmptyRows.length) {
    await db.exec(`create table ${tableName} (value text);`);
    return;
  }

  const headers = nonEmptyRows[0];
  const dataRows = nonEmptyRows.slice(1);
  const normalizedHeaders = [];
  const usedNames = new Set();

  headers.forEach((header, index) => {
    let name = sanitizeIdentifier(header || `column_${index + 1}`);
    if (usedNames.has(name)) {
      let suffix = 2;
      while (usedNames.has(`${name}_${suffix}`)) suffix += 1;
      name = `${name}_${suffix}`;
    }
    usedNames.add(name);
    normalizedHeaders.push(name);
  });

  const columnTypes = normalizedHeaders.map((_, index) => inferSqlType(dataRows.map((row) => row[index] ?? "")));
  const columnsSql = normalizedHeaders
    .map((name, index) => `${name} ${columnTypes[index]}`)
    .join(", ");

  await db.exec(`create table ${tableName} (${columnsSql});`);

  for (const row of dataRows) {
    const values = normalizedHeaders.map((_, index) => sqlLiteral(row[index] ?? ""));
    await db.exec(`insert into ${tableName} (${normalizedHeaders.join(", ")}) values (${values.join(", ")});`);
  }
}

async function importCsvTextIntoDatabase(db, text, tableName) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("CSV file is empty.");

  await importTabularRowsIntoDatabase(db, sanitizeIdentifier(tableName) || "uploaded_data", rows);
}

async function importCsvIntoDatabase(db, file) {
  const text = await file.text();
  const tableName = file.name.replace(/\.[^.]+$/, "");
  await importCsvTextIntoDatabase(db, text, tableName);
}

async function importExcelIntoDatabase(db, file) {
  if (!window.XLSX) throw new Error("Excel parsing library is not available.");

  const arrayBuffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(arrayBuffer, { type: "array" });
  const sheetNames = workbook.SheetNames || [];
  if (!sheetNames.length) throw new Error("Workbook has no worksheets.");

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const tableName = sanitizeIdentifier(sheetName) || "worksheet";
    await importTabularRowsIntoDatabase(db, tableName, rows);
  }
}

function extOf(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tarball";
  if (lower.endsWith(".tar")) return "tarball";
  if (lower.endsWith(".sql")) return "sql";
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm") || lower.endsWith(".xls")) return "excel";
  return "unknown";
}

async function importGistCsvs(gistId) {
  if (!gistId || !gistId.trim()) throw new Error("Please provide a gist ID.");
  if (!pg) {
    await switchDatabase(() => createDatabase(), DEFAULT_DB_LABEL, { showLoadingOverlay: false });
  }

  const id = gistId.trim();
  setDataLoading(true, `Importing gist ${id}…`);

  try {
    const response = await fetch(`https://api.github.com/gists/${id}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(`Could not load gist ${id}.`);

    const gist = await response.json();
    const csvFiles = Object.entries(gist.files || {}).filter(([, meta]) => meta && typeof meta.filename === "string" && /\.csv$/i.test(meta.filename));
    if (!csvFiles.length) throw new Error("No CSV files were found in that gist.");

    for (const [filename, meta] of csvFiles) {
      const rawUrl = meta.raw_url;
      if (!rawUrl) throw new Error(`Missing raw URL for ${filename}.`);
      const rawResponse = await fetch(rawUrl);
      if (!rawResponse.ok) throw new Error(`Could not fetch ${filename}.`);
      const text = await rawResponse.text();
      await importCsvTextIntoDatabase(pg, text, filename.replace(/\.csv$/i, ""));
    }

    markUnsavedChanges();
    await refreshTables();
    clearResults("Run a query to see results here.");
    await maybeSetDatabaseReadOnly();
    showToast(`Imported ${csvFiles.length} CSV file${csvFiles.length === 1 ? "" : "s"} from gist ${id}`, "success");
  } finally {
    setDataLoading(false);
  }
}

async function handleUpload(file) {
  const kind = extOf(file.name);
  setDataLoading(true, kind === "sql" ? "Importing SQL…" : kind === "csv" ? "Importing CSV…" : kind === "excel" ? "Importing workbook…" : "Loading data file…");

  try {
    if (kind === "tarball") {
      await wipeCurrentDatabaseStore();
      await switchDatabase(() => createDatabase({ loadDataDir: file }), file.name);
      await maybeSetDatabaseReadOnly();
      showToast(`Loaded "${file.name}"`, "success");
      return true;
    }

    if (kind === "sql" || kind === "csv" || kind === "excel") {
      await importIntoCurrentDatabase(file);
      setDbLabel(currentFileLabel === DEFAULT_DB_LABEL ? file.name : currentFileLabel);
      await refreshTables();
      clearResults("Run a query to see results here.");
      await maybeSetDatabaseReadOnly();
      showToast(`Imported "${file.name}"`, "success");
      return true;
    }

    showToast("Unsupported file type. Use .tar, .tar.gz, .sql, .csv or Excel", "error");
    return false;
  } catch (err) {
    console.error(err);
    showToast(`Could not import "${file.name}": ${err.message}`, "error");
    return false;
  } finally {
    setDataLoading(false);
  }
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function rowsToCsv(rows, fields) {
  const headers = (fields || []).map((field) => field.name || "");
  const lines = [];
  lines.push(headers.map(escapeCsvValue).join(","));
  for (const row of rows || []) {
    lines.push(headers.map((header) => escapeCsvValue(row[header] ?? "")).join(","));
  }
  return lines.join("\n");
}

async function handleSaveToGist() {
  if (!pg) return;

  const token = await showPromptDialog("Enter your GitHub personal access token:");
  if (!token) return;

  const description = (await showPromptDialog("Optional gist description:")) || "PGlite Studio export";
  setBusy(true);
  setStatus("Saving tables to gist…");
  try {
    const { rows: tables } = await pg.query(
      `select table_name from information_schema.tables where table_schema = 'public' order by table_name;`
    );

    if (!tables.length) {
      throw new Error("There are no tables to save.");
    }

    const files = {};
    for (const table of tables) {
      const tableName = table.table_name;
      const { rows, fields } = await pg.query(`select * from "${tableName}";`);
      const filename = `${sanitizeIdentifier(tableName) || "table"}.csv`;
      files[filename] = { content: rowsToCsv(rows, fields) };
    }

    const response = await fetch("https://api.github.com/gists", {
      method: "POST",
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        description,
        public: false,
        files,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Failed to create gist.");
    }

    const result = await response.json();
    const gistUrl = result.html_url || result.url || "";
    setStatus("Ready");
    showToast(`Saved ${tables.length} table${tables.length === 1 ? "" : "s"} to gist`, "success");
    if (gistUrl) {
      window.open(gistUrl, "_blank", "noopener,noreferrer");
    }
  } catch (err) {
    console.error(err);
    setStatus("Ready");
    showToast("Could not save to gist: " + err.message, "error");
  } finally {
    setBusy(false);
  }
}

async function handleDownload() {
  if (!pg) return;
  setBusy(true);
  setStatus("Preparing download…");
  try {
    const blob = await pg.dumpDataDir();
    const base = currentFileLabel.replace(/\.(tar(\.gz)?|tgz|sql)$/i, "") || "database";
    const filename = `${base}.tar.gz`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus("Ready");
    clearUnsavedChanges();
    showToast(`Downloaded "${filename}"`, "success");
  } catch (err) {
    console.error(err);
    showToast("Download failed: " + err.message, "error");
    setStatus("Ready");
  } finally {
    setBusy(false);
  }
}

/**
 * Builds a schema-only SQL dump (tables, constraints, indexes, views) for the
 * public schema, reading pg_catalog directly so column types/defaults match
 * exactly what Postgres would report.
 */
async function generateSchemaSql() {
  const { rows: tableRows } = await pg.query(
    `select c.relname as table_name
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
     order by c.relname;`
  );

  if (!tableRows.length) {
    throw new Error("There are no tables in this database.");
  }

  const { rows: columnRows } = await pg.query(
    `select c.relname as table_name, a.attname as column_name,
            format_type(a.atttypid, a.atttypmod) as data_type,
            a.attnotnull as not_null,
            pg_get_expr(ad.adbin, ad.adrelid) as default_expr
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     join pg_attribute a on a.attrelid = c.oid
     left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
     where n.nspname = 'public' and c.relkind = 'r'
       and a.attnum > 0 and not a.attisdropped
     order by c.relname, a.attnum;`
  );

  const { rows: constraintRows } = await pg.query(
    `select c.relname as table_name, con.conname, con.contype,
            pg_get_constraintdef(con.oid) as def
     from pg_constraint con
     join pg_class c on c.oid = con.conrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
     order by c.relname,
       case con.contype when 'p' then 1 when 'u' then 2 when 'f' then 3 else 4 end;`
  );

  const { rows: indexRows } = await pg.query(
    `select tablename, indexname, indexdef
     from pg_indexes
     where schemaname = 'public'
     order by tablename, indexname;`
  );

  const { rows: viewRows } = await pg.query(
    `select viewname, definition
     from pg_views
     where schemaname = 'public'
     order by viewname;`
  );

  const columnsByTable = new Map();
  for (const row of columnRows) {
    if (!columnsByTable.has(row.table_name)) columnsByTable.set(row.table_name, []);
    columnsByTable.get(row.table_name).push(row);
  }

  const constraintsByTable = new Map();
  const constraintNames = new Set();
  for (const row of constraintRows) {
    if (!constraintsByTable.has(row.table_name)) constraintsByTable.set(row.table_name, []);
    constraintsByTable.get(row.table_name).push(row);
    if (row.contype === "p" || row.contype === "u") constraintNames.add(row.conname);
  }

  const parts = [];

  for (const { table_name } of tableRows) {
    const columns = columnsByTable.get(table_name) || [];
    const columnLines = columns.map((col) => {
      let line = `  "${col.column_name}" ${col.data_type}`;
      if (col.not_null) line += " NOT NULL";
      if (col.default_expr) line += ` DEFAULT ${col.default_expr}`;
      return line;
    });
    parts.push(`CREATE TABLE "${table_name}" (\n${columnLines.join(",\n")}\n);`);
  }

  for (const { table_name } of tableRows) {
    for (const con of constraintsByTable.get(table_name) || []) {
      parts.push(`ALTER TABLE "${table_name}" ADD CONSTRAINT "${con.conname}" ${con.def};`);
    }
  }

  for (const idx of indexRows) {
    if (constraintNames.has(idx.indexname)) continue;
    parts.push(`${idx.indexdef};`);
  }

  for (const view of viewRows) {
    parts.push(`CREATE VIEW "${view.viewname}" AS\n${view.definition.trim().replace(/;$/, "")};`);
  }

  return parts.join("\n\n") + "\n";
}

async function handleCopySchemaForAi() {
  if (!pg) return;
  setBusy(true);
  setStatus("Building schema…");
  try {
    const sql = await generateSchemaSql();
    const messageForAi = `Here's a schema script for a postgresql database I'm wroking with.\n\n${sql}\n\n I'm going to ask for help writing some quereries once you unstand the structure.  I'll ask the questions in natural language.  You produce the SQL to answer the question using the given schema.`;
    await navigator.clipboard.writeText(messageForAi);
    setStatus("Ready");
    showToast("Schema copied to clipboard", "success");
  } catch (err) {
    console.error(err);
    setStatus("Ready");
    showToast("Could not copy schema: " + err.message, "error");
  } finally {
    setBusy(false);
  }
}

async function handleExportExcel() {
  if (!pg || !window.XLSX) {
    showToast("Excel export is unavailable right now.", "error");
    return;
  }

  setBusy(true);
  setStatus("Exporting workbook…");
  try {
    const { rows: tables } = await pg.query(
      `select table_name from information_schema.tables where table_schema = 'public' order by table_name;`
    );

    const workbook = window.XLSX.utils.book_new();
    for (const table of tables) {
      const tableName = table.table_name;
      const { rows, fields } = await pg.query(`select * from "${tableName}";`);
      const headers = (fields || []).map((field) => field.name);
      const sheetRows = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ""))];
      const worksheet = window.XLSX.utils.aoa_to_sheet(sheetRows);
      window.XLSX.utils.book_append_sheet(workbook, worksheet, tableName);
    }

    const base = currentFileLabel.replace(/\.(tar(\.gz)?|tgz|sql|csv|xlsx|xlsm|xls)$/i, "") || "database";
    const filename = `${base}.xlsx`;
    const buffer = window.XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus("Ready");
    showToast(`Exported "${filename}"`, "success");
  } catch (err) {
    console.error(err);
    setStatus("Ready");
    showToast("Excel export failed: " + err.message, "error");
  } finally {
    setBusy(false);
  }
}


// ---- Wire up UI ------------------------------------------------------------

function initEventListeners() {
  window.addEventListener("beforeunload", (e) => {
    if (!hasUnsavedChanges) return;
    e.preventDefault();
    e.returnValue = "";
  });

  splashEl.splashRetry?.addEventListener("click", () => window.location.reload());

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

    const saveQueryBtn = e.target.closest(".save-query-btn");
    if (saveQueryBtn) {
      handleSaveQuery();
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

  el.menuButton.addEventListener("click", () => {
    const isOpen = !el.menuPanel.hidden;
    setMenuOpen(!isOpen);
  });

  document.addEventListener("click", (e) => {
    if (!el.menu.contains(e.target)) setMenuOpen(false);
  });

  el.menuLoadData.addEventListener("click", () => {
    setMenuOpen(false);
    showDatasets();
  });

  el.menuUpload.addEventListener("click", () => {
    setMenuOpen(false);
    el.fileInput.click();
  });

  el.menuDownload.addEventListener("click", () => {
    setMenuOpen(false);
    handleDownload();
  });

  // el.menuSaveGist.addEventListener("click", () => {
  //   setMenuOpen(false);
  //   handleSaveToGist();
  // });

  // el.menuImportGist.addEventListener("click", async () => {
  //   setMenuOpen(false);
  //   const gistId = prompt("Enter a GitHub gist ID or URL:");
  //   if (!gistId) return;
  //   try {
  //     await importGistCsvs(gistId.replace(/^https?:\/\/gist\.github\.com\/[^/]+\//i, "").replace(/\/$/, ""));
  //   } catch (err) {
  //     console.error(err);
  //     showToast(err.message || "Could not import gist CSVs", "error");
  //   }
  // });

  el.menuExportExcel.addEventListener("click", () => {
    setMenuOpen(false);
    handleExportExcel();
  });

  el.menuSchemaAi.addEventListener("click", () => {
    setMenuOpen(false);
    handleCopySchemaForAi();
  });

  el.menuOpenNewTab.addEventListener("click", () => {
    setMenuOpen(false);
    handleOpenInNewTab();
  });

  if (el.openNewTab) {
    el.openNewTab.addEventListener("click", () => handleOpenInNewTab());
  }

  el.menuTheme.addEventListener("click", () => {
    setMenuOpen(false);
    const current = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(current === "dark" ? "light" : "dark");
  });

  el.menuClear.addEventListener("click", async () => {
    setMenuOpen(false);
    if (await showConfirmDialog("Start a new, empty database? Any unsaved changes will be lost.", { danger: true })) {
      await wipeCurrentDatabaseStore();
      await switchDatabase(() => createDatabase(), DEFAULT_DB_LABEL, { showLoadingOverlay: false });
    }
  });

  el.menuAbout.addEventListener("click", () => {
    setMenuOpen(false);
    window.open("https://www.websql.org/2000/01/about.html", "_blank", "noopener");
  });

  el.fileInput.addEventListener("change", async () => {
    const file = el.fileInput.files[0];
    el.fileInput.value = "";
    if (file) await handleUpload(file);
  });

  el.refreshTables.addEventListener("click", () => {
    pendingTablesRefresh = refreshTables();
  });

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

  el.toggleSidebar.addEventListener("click", () => {
    const collapsed = el.sidebar.classList.toggle("collapsed");
    el.toggleSidebar.textContent = collapsed ? "»" : "«";
    el.toggleSidebar.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
  });
}

// ---- Boot -----------------------------------------------------------------


// Resolves once the default database is ready. External code (e.g.
// the Blogger template) that wants to auto-load a default database on boot
// must wait on this first - otherwise it races main()'s own createDatabase()
// call and whichever finishes last silently overwrites the other.
window.pgliteReady = main();
