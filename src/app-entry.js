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

/*__CORE_PAGE__*/

/*__CORE__*/

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
