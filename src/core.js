/* ==== PAGE ==== */

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

/* ==== INSTANCE ==== */

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
