// ---- Config -----------------------------------------------------------

const MONACO_VERSION = "0.52.2";
const PGLITE_VERSION = "0.5.4";
const PGLITE_URL = `https://cdn.jsdelivr.net/npm/@electric-sql/pglite@${PGLITE_VERSION}/dist/index.js`;
const PGLITE_WORKER_URL = `https://cdn.jsdelivr.net/npm/@electric-sql/pglite@${PGLITE_VERSION}/dist/worker/index.js`;
const THEME_KEY = "pglite-theme";
const DB_ID = "websql-studio";
const DATA_DIR = `idb://${DB_ID}`;
/** Enable multi-tab shared DB with ?shared=1 */
const SHARED_DB_PARAM = "shared";
const useSharedDb = new URLSearchParams(window.location.search).get(SHARED_DB_PARAM) === "1";
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
let columnsCache = new Map();
let dataLoadingDepth = 0;
let unsubLeaderChange = null;

// ---- DOM refs -------------------------------------------------------------

const el = {
  run: document.getElementById("btn-run"),
  menu: document.getElementById("menu"),
  menuButton: document.getElementById("btn-menu"),
  menuPanel: document.getElementById("menu-panel"),
  menuUpload: document.getElementById("menu-upload"),
  menuDownload: document.getElementById("menu-download"),
  //menuImportGist: document.getElementById("menu-import-gist"),
  //menuSaveGist: document.getElementById("menu-save-gist"),
  menuExportExcel: document.getElementById("menu-export-excel"),
  menuTheme: document.getElementById("menu-theme"),
  themeIcon: document.getElementById("theme-icon"),
  themeLabel: document.getElementById("theme-label"),
  menuClear: document.getElementById("menu-clear"),
  loadDataSection: document.getElementById("load-data-section"),
  loadDataSeparator: document.getElementById("load-data-separator"),
  loadDataToggle: document.getElementById("menu-load-data"),
  loadDataSubmenu: document.getElementById("load-data-submenu"),
  fileInput: document.getElementById("file-input"),
  refreshTables: document.getElementById("btn-refresh-tables"),
  toggleSidebar: document.getElementById("btn-toggle-sidebar"),
  sidebar: document.getElementById("sidebar"),
  tableList: document.getElementById("table-list"),
  resultsBody: document.getElementById("results-body"),
  resultsMeta: document.getElementById("results-meta"),
  statusText: document.getElementById("status-text"),
  loadingIndicator: document.getElementById("loading-indicator"),
  statusBar: document.getElementById("statusbar"),
  dbName: document.getElementById("db-name"),
  toast: document.getElementById("toast"),
  resizer: document.getElementById("resizer"),
  editorPane: document.getElementById("editor-pane"),
};

applyTheme(getPreferredTheme());
setStatusBarVisible(false);

// ---- Small UI helpers -----------------------------------------------------

function setStatus(text) {
  el.statusText.textContent = text;
}

function setDbLabel(label) {
  currentFileLabel = label;
  el.dbName.textContent = label;
}

function setMenuOpen(isOpen) {
  el.menuPanel.hidden = !isOpen;
  el.menuButton.setAttribute("aria-expanded", String(isOpen));
  if (!isOpen && el.loadDataToggle) {
    el.loadDataSubmenu.hidden = true;
    el.loadDataToggle.setAttribute("aria-expanded", "false");
    el.loadDataToggle.querySelector(".menu-caret").textContent = "▸";
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

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
  if (monacoRef && editor) monacoRef.editor.setTheme(monacoThemeFor(theme));

  const next = theme === "dark" ? "light" : "dark";
  el.themeIcon.textContent = next === "dark" ? "🌙" : "☀️";
  el.themeLabel.textContent = next === "dark" ? "Dark Mode" : "Light Mode";
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

function setBusy(isBusy) {
  el.run.disabled = isBusy;
  el.menuButton.disabled = isBusy;
}

function setStatusBarVisible(isVisible) {
  if (el.statusBar) {
    el.statusBar.hidden = !isVisible;
    el.statusBar.style.display = isVisible ? "flex" : "none";
  }
}

function setDataLoading(isLoading, message = "Loading data…") {
  if (isLoading) {
    dataLoadingDepth += 1;
    setStatusBarVisible(true);
    el.loadingIndicator.hidden = false;
    el.loadingIndicator.style.display = "inline-flex";
    el.loadingIndicator.querySelector(".loading-label").textContent = message;
    return;
  }

  dataLoadingDepth = Math.max(dataLoadingDepth - 1, 0);
  if (dataLoadingDepth === 0) {
    el.loadingIndicator.hidden = true;
    el.loadingIndicator.style.display = "none";
    setStatusBarVisible(false);
  }
}

// ---- Monaco setup ----------------------------------------------------------

function initMonaco() {
  return new Promise((resolve) => {
    require.config({
      paths: { vs: `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs` },
    });
    require(["vs/editor/editor.main"], (monaco) => {
      monacoRef = monaco;
      const params = new URLSearchParams(window.location.search);
      const initialSql = params.has("sql") ? params.get("sql") : DEFAULT_SQL;
      editor = monaco.editor.create(el.editorPane, {
        value: initialSql || DEFAULT_SQL,
        language: "sql",
        theme: monacoThemeFor(document.documentElement.getAttribute("data-theme")),
        fontSize: 13,
        minimap: { enabled: false },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        wordWrap: "on",
      });
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runQuery());
      resolve();
    });
  });
}

function applySqlUrlParameter() {
  if (!editor) return;

  const params = new URLSearchParams(window.location.search);
  if (!params.has("sql")) return;

  const value = params.get("sql");
  if (value !== null) {
    editor.setValue(value);
  }
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
 * Creates a database: private in-memory PGlite by default, or a shared
 * PGliteWorker + IndexedDB instance when ?shared=1 is present.
 * @param {{ loadDataDir?: Blob | File }} [options] - Extra PGlite options (e.g. tarball load).
 */
async function createDatabase(options = {}) {
  if (useSharedDb) {
    const PGliteWorker = await loadPGliteWorker();
    return PGliteWorker.create(createPGliteBlobWorker(), {
      id: DB_ID,
      dataDir: DATA_DIR,
      ...options,
    });
  }

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
    refreshTables().catch(() => {});
  });
}

/**
 * Replaces the active database handle and refreshes UI.
 * @param {() => Promise<object>} factory - Async factory that returns a DB client.
 * @param {string} label - Label shown in the status bar.
 */
async function switchDatabase(factory, label) {
  setBusy(true);
  setStatus("Loading database…");
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
    bindLeaderChange(pg);
    setDbLabel(label);
    setStatus("Ready");
    await refreshTables();
    clearResults("Run a query to see results here.");
  } catch (err) {
    console.error(err);
    setStatus("Failed to load database");
    showToast("Could not load database: " + err.message, "error");
  } finally {
    setBusy(false);
  }
}

async function importIntoCurrentDatabase(file) {
  if (!pg) {
    await switchDatabase(() => createDatabase(), DEFAULT_DB_LABEL);
  }

  const kind = extOf(file.name);
  setDataLoading(true, kind === "sql" ? "Importing SQL…" : kind === "csv" ? "Importing CSV…" : "Importing workbook…");

  try {
    if (kind === "sql") {
      const text = await file.text();
      await pg.exec(text);
      return;
    }

    if (kind === "csv") {
      await importCsvIntoDatabase(pg, file);
      return;
    }

    if (kind === "excel") {
      await importExcelIntoDatabase(pg, file);
      return;
    }

    throw new Error("Unsupported file type. Use .sql, .csv or Excel.");
  } finally {
    setDataLoading(false);
  }
}

// ---- Query execution ---------------------------------------------------------

function isMetaCommand(text) {
  return typeof text === "string" && text.trim().startsWith("\\");
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

async function runQuery() {
  if (!pg) return;
  const sql = editor.getValue().trim();
  if (!sql) return;

  console.log("Executing query:", sql);

  setBusy(true);
  setStatus("Running…");
  const startedAt = performance.now();
  try {
    const results = isMetaCommand(sql)
      ? await runMetaCommand(sql)
      : await pg.exec(sql);
    const elapsed = Math.round(performance.now() - startedAt);
    renderResults(results, elapsed);
    setStatus("Ready");
    refreshTables();
  } catch (err) {
    console.error(err);
    renderError(err);
    setStatus("Query failed");
  } finally {
    setBusy(false);
  }
}

function clearResults(message) {
  currentResultSets = [];
  el.resultsBody.className = "results-body";
  el.resultsBody.innerHTML = `<div class="empty-hint">${escapeHtml(message)}</div>`;
  el.resultsMeta.textContent = "";
}

function renderError(err) {
  currentResultSets = [];
  el.resultsBody.className = "results-body has-error";
  el.resultsBody.innerHTML = `<div class="error-box">${escapeHtml(err.message || String(err))}</div>`;
  el.resultsMeta.textContent = "";
}

function renderResults(results, elapsedMs) {
  el.resultsBody.className = "results-body";
  currentResultSets = results || [];

  if (!results || results.length === 0) {
    clearResults("No results.");
    return;
  }

  const blocks = results.map((res, i) => {
    const hasRows = res.fields && res.fields.length > 0;
    const labelText = results.length > 1 ? `Statement ${i + 1}` : "";
    const csvBtn = hasRows
      ? `<button class="csv-btn" data-idx="${i}" title="Download this result as CSV">⭳ CSV</button>`
      : "";
    const header = labelText || csvBtn
      ? `<div class="result-block-label"><span>${labelText}</span>${csvBtn}</div>`
      : "";
    if (hasRows) {
      return `<div class="result-block">${header}${renderTable(res)}</div>`;
    }
    const affected = typeof res.affectedRows === "number" ? res.affectedRows : 0;
    return `<div class="result-block">${header}<div class="empty-hint">OK — ${affected} row(s) affected.</div></div>`;
  });

  el.resultsBody.innerHTML = blocks.join("");

  const totalRows = results.reduce((sum, r) => sum + (r.rows ? r.rows.length : 0), 0);
  el.resultsMeta.textContent = `${totalRows} row(s) · ${elapsedMs} ms`;
}

function isNumericValue(value) {
  return typeof value === "number" || (typeof value === "string" && /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(value.trim()));
}

function formatDateValue(d) {
  const iso = d.toISOString();
  if (iso.endsWith("T00:00:00.000Z")) return iso.slice(0, 10);
  return iso.replace("T", " ").replace("Z", "");
}

function renderTable(res) {
  const cols = res.fields.map((f) => f.name);
  const head = `<tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`;
  const body = res.rows
    .map((row) => {
      const cells = cols
        .map((c) => {
          const v = row[c];
          if (v === null || v === undefined) return `<td class="cell-null">null</td>`;
          if (v instanceof Date) return `<td>${escapeHtml(formatDateValue(v))}</td>`;
          if (typeof v === "object") return `<td>${escapeHtml(JSON.stringify(v))}</td>`;
          const cellClass = isNumericValue(v) ? "cell-numeric" : "";
          return `<td class="${cellClass}">${escapeHtml(String(v))}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table class="result-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
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

// ---- Table sidebar --------------------------------------------------------

async function refreshTables() {
  if (!pg) return;
  columnsCache.clear();
  try {
    const { rows } = await pg.query(
      `select table_name from information_schema.tables
       where table_schema = 'public' order by table_name;`
    );
    if (!rows.length) {
      el.tableList.innerHTML = `<div class="empty-hint">No tables yet</div>`;
      return;
    }
    el.tableList.innerHTML = rows
      .map(
        (r) => `
        <div class="table-group">
          <div class="table-row">
            <button class="table-toggle" data-table="${escapeHtml(r.table_name)}" aria-label="Toggle columns">▸</button>
            <span class="table-name" data-table="${escapeHtml(r.table_name)}">
              <span class="table-icon">▦</span>${escapeHtml(r.table_name)}
            </span>
          </div>
          <div class="table-columns" hidden></div>
        </div>`
      )
      .join("");

    el.tableList.querySelectorAll(".table-name").forEach((node) => {
      node.addEventListener("click", () => {
        const name = node.getAttribute("data-table");
        editor.setValue(`select * from "${name}" limit 100;`);
        runQuery();
      });
    });

    el.tableList.querySelectorAll(".table-toggle").forEach((btn) => {
      btn.addEventListener("click", () => toggleTableColumns(btn));
    });
  } catch (err) {
    console.error(err);
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
    await switchDatabase(() => createDatabase(), DEFAULT_DB_LABEL);
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

    await refreshTables();
    clearResults("Run a query to see results here.");
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
      showToast(`Loaded "${file.name}"`, "success");
      return;
    }

    if (kind === "sql" || kind === "csv" || kind === "excel") {
      await importIntoCurrentDatabase(file);
      setDbLabel(currentFileLabel === DEFAULT_DB_LABEL ? file.name : currentFileLabel);
      await refreshTables();
      clearResults("Run a query to see results here.");
      showToast(`Imported "${file.name}"`, "success");
      return;
    }

    showToast("Unsupported file type. Use .tar, .tar.gz, .sql, .csv or Excel", "error");
  } finally {
    setDataLoading(false);
  }
}

// ---- Load Data (submenu of fetchable, preset sources) ----------------------

// Fetch one URL and normalize it to either a raw blob (direct file fetch) or
// text pulled out of a Blogger feed JSON response. A JSON response is assumed
// to be a blog post feed, and only its first post is used (single-entry
// `entry`, or `feed.entry[0]` for a multi-entry/label feed). A post tagged
// "binary" carries base64 content.
async function fetchDataPiece(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);

  let data;
  try {
    data = await response.clone().json();
  } catch (_) {
    return { kind: "blob", blob: await response.blob() };
  }

  const post = data.entry || (data.feed && data.feed.entry && data.feed.entry[0]);
  if (!post) return { kind: "text", text: "", isBinary: false };

  const text = post.content && post.content.$t ? post.content.$t : "";
  const labels = (post.category || []).map((c) => c.term);
  return { kind: "text", text, isBinary: labels.includes("binary") };
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Fetch every URL in `urls` in parallel, then assemble them in listed order
// (positional, regardless of which fetch actually resolved first) and hand
// the result to handleUpload() exactly as if it had been picked via "Upload DB".
async function loadDataFromUrls(label, urls) {
  setBusy(true);
  setDataLoading(true, `Fetching "${label}"…`);
  setStatus(`Fetching "${label}"…`);
  try {
    const resolvedPieces = await Promise.all(
      urls.map((url, index) => fetchDataPiece(url).then((piece) => ({ index, piece })))
    );
    const pieces = resolvedPieces
      .sort((a, b) => a.index - b.index)
      .map((entry) => entry.piece);

    let file;
    if (pieces.every((p) => p.kind === "blob")) {
      const blob = new Blob(pieces.map((p) => p.blob));
      const filename = urls[0].split("/").pop() || label;
      file = new File([blob], filename, { type: blob.type });
    } else {
      const combinedText = pieces.map((p) => (p.kind === "text" ? p.text : "")).join("");
      const isBinary = pieces.some((p) => p.isBinary);
      file = isBinary
        ? new File([base64ToBytes(combinedText)], `${label}.tar.gz`)
        : new File([combinedText], `${label}.sql`, { type: "text/plain" });
    }
    console.log("urls",urls)
    console.log("pieces",pieces)
    await wipeCurrentDatabaseStore();
    await switchDatabase(() => createDatabase(), DEFAULT_DB_LABEL);
    await handleUpload(file);
  } catch (err) {
    console.error(err);
    setStatus("Ready");
    showToast(`Could not load "${label}": ${err.message}`, "error");
  } finally {
    setDataLoading(false);
    setBusy(false);
  }
}

// Register an entry in the "Load Data" submenu. `label` is the text shown to
// the user; `url` is a relative path (or an array of them, fetched in
// parallel and assembled in listed order) handed to handleUpload() exactly
// as if that data had been picked via "Upload DB".
function addLoadDataOption(label, url) {
  const urls = Array.isArray(url) ? url : [url];

  el.loadDataSection.hidden = false;
  el.loadDataSeparator.hidden = false;

  const btn = document.createElement("button");
  btn.className = "menu-item";
  btn.textContent = label;
  btn.addEventListener("click", () => {
    setMenuOpen(false);
    loadDataFromUrls(label, urls);
  });
  el.loadDataSubmenu.appendChild(btn);
  return btn;
}
window.addLoadDataOption = addLoadDataOption;

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

  const token = prompt("Enter your GitHub personal access token:");
  if (!token) return;

  const description = prompt("Optional gist description:") || "PGlite Studio export";
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
    showToast(`Downloaded "${filename}"`, "success");
  } catch (err) {
    console.error(err);
    showToast("Download failed: " + err.message, "error");
    setStatus("Ready");
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
  el.run.addEventListener("click", () => runQuery());

  el.resultsBody.addEventListener("click", (e) => {
    const btn = e.target.closest(".csv-btn");
    if (!btn) return;
    downloadResultAsCsv(Number(btn.getAttribute("data-idx")));
  });

  el.menuButton.addEventListener("click", () => {
    const isOpen = !el.menuPanel.hidden;
    setMenuOpen(!isOpen);
  });

  document.addEventListener("click", (e) => {
    if (!el.menu.contains(e.target)) setMenuOpen(false);
  });

  el.loadDataToggle.addEventListener("click", () => {
    const isOpen = !el.loadDataSubmenu.hidden;
    el.loadDataSubmenu.hidden = isOpen;
    el.loadDataToggle.setAttribute("aria-expanded", String(!isOpen));
    el.loadDataToggle.querySelector(".menu-caret").textContent = isOpen ? "▸" : "▾";
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

  el.menuTheme.addEventListener("click", () => {
    setMenuOpen(false);
    const current = document.documentElement.getAttribute("data-theme") || "light";
    applyTheme(current === "dark" ? "light" : "dark");
  });

  el.menuClear.addEventListener("click", () => {
    setMenuOpen(false);
    if (confirm("Start a new, empty database? Any unsaved changes will be lost.")) {
      (async () => {
        await wipeCurrentDatabaseStore();
        await switchDatabase(() => createDatabase(), DEFAULT_DB_LABEL);
      })();
    }
  });

  el.fileInput.addEventListener("change", async () => {
    const file = el.fileInput.files[0];
    el.fileInput.value = "";
    if (file) await handleUpload(file);
  });

  el.refreshTables.addEventListener("click", () => refreshTables());

  el.toggleSidebar.addEventListener("click", () => {
    const collapsed = el.sidebar.classList.toggle("collapsed");
    el.toggleSidebar.textContent = collapsed ? "»" : "«";
    el.toggleSidebar.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
  });
}

// ---- Boot -----------------------------------------------------------------

async function main() {
  initEventListeners();
  initResizer();
  await initMonaco();
  await switchDatabase(() => createDatabase(), DEFAULT_DB_LABEL);
  applySqlUrlParameter();
}

// Resolves once the default database is ready. External code (e.g.
// the Blogger template) that wants to auto-load a default database on boot
// must wait on this first - otherwise it races main()'s own createDatabase()
// call and whichever finishes last silently overwrites the other.
window.pgliteReady = main();
