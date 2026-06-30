// ═══════════════════════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const TWITCH_CLIENT_ID   = "n3oqt780bnsi3lb2gzinxdbrrazork";
const TWITCH_REDIRECT_URI = window.location.origin + window.location.pathname;
const APPS_SCRIPT_URL    = "https://script.google.com/macros/s/AKfycbzTt2y1Cgt7wzQpBGJC57LFa8B2o90MmkeJXuf83lDxC8aUyJPhzu6O_jJm4J65j5ri/exec";
const TOOLBOX_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzTt2y1Cgt7wzQpBGJC57LFa8B2o90MmkeJXuf83lDxC8aUyJPhzu6O_jJm4J65j5ri/exec";

const ALLOWED_USERS = [
  "ynnk99",
  "mahluna",
  "der_gude_nico",
  "Deeichkind",
];

const SPREADSHEET_ID = "1r9BzZJYFrk4rQLlMn4ZPBBUuc8u_peqwThTi1UTCQcE";

const SHEET_URL = "https://docs.google.com/spreadsheets/d/" + SPREADSHEET_ID
  + "/gviz/tq?sheet=OBS_OVERLAY&tqx=out:json";

// ── Twitch-Token für serverseitige Validierung ────────────────────────────
function getTwitchToken() {
  return localStorage.getItem("twitch_token") || "";
}


// GEÄNDERT: W→X, AB→AC (Spaltenverschiebung)
const CLIPS_URL = "https://docs.google.com/spreadsheets/d/" + SPREADSHEET_ID
  + "/gviz/tq?sheet=OBS_OVERLAY&tqx=out:json&range=X9:AC1000";

// GEÄNDERT: N→O, R→S (Spaltenverschiebung)
const BINGO_TEXT_URL  = "https://docs.google.com/spreadsheets/d/" + SPREADSHEET_ID
  + "/gviz/tq?sheet=OBS_OVERLAY&tqx=out:json&range=O15:S19";
const BINGO_STATE_URL = "https://docs.google.com/spreadsheets/d/" + SPREADSHEET_ID
  + "/gviz/tq?sheet=OBS_OVERLAY&tqx=out:json&range=O20:S24";

const RANKING_TOP_N = 10;
const STREAMER_LOGIN = "mahluna";

const MAIN_BOSSES = new Set([
  "Margit, das Grausame Mal",
  "Godrick der Verpflanzte",
  "Rennala, Königin des Vollmonds",
  "Roter Wolf von Radagon",
  "Sternengeißel Radahn",
  "Götterverschlingende Schlange / Rykard, Fürst der Blasphemie",
  "Drachenbaumwächter",
  "Godfrey, Erster Eldenfürst",
  "Morgott, König des Mals",
  "Mohg, Fürst des Blutes",
  "Feuerriese",
  "Bestienkleriker / Maliketh, die Schwarze Klinge",
  "Duo der Götterskalpe",
  "Malenia, Klinge von Miquella",
  "Godfrey, Erster Eldenfürst (Hoarah Loux)",
  "Sir Gideon Ofnir, der Allwissende",
  "Radagon von der Goldenen Ordnung / Eldenbestie",
  "Rellana, Zwillings-Mondritterin",
  "Göttliche Bestie - Tanzender Löwe",
  "Messmer der Pfähler + Böse Schlange Messmer",
  "Bayle der Schreckliche",
  "Midra, Herr der Rasenden Flamme",
  "Kommandant Gaius",
  "Romina, Heilige der Knospe",
  "Radahn, versprochener Gemahl + Radahn, Miquellas Gemahl",
]);

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

var localCollapsed      = {};
var showBase            = true;
var showDLC             = true;
var showOnlyMain        = false;
var showOnlyDone        = false;
var showOnlyOpen        = false;
var previousBossStates  = {};
var prevDeaths          = null;
var prevDoneBosses      = null;
var cachedRows = null;

var timerStartTs  = 0;
var timerElapsed  = 0;
var timerVisible  = false;
var timerInterval = null;
var timerLabel    = ""; // M3: wenn befüllt, ersetzt "Aktueller Boss:" im Timer

// ─── BOSS LEVEL PANEL ────────────────────────────────────────────────────────
var bossLevelData = []; // { boss, level, area, deaths, done, isMain }

function openBossLevelPanel() {
  document.getElementById("boss-level-backdrop").classList.add("open");
  document.getElementById("boss-level-modal").classList.add("open");
  document.body.style.overflow = "hidden";
  renderBossLevelPanel();
}

function closeBossLevelPanel() {
  document.getElementById("boss-level-backdrop").classList.remove("open");
  document.getElementById("boss-level-modal").classList.remove("open");
  document.body.style.overflow = "";
}

function renderBossLevelPanel() {
  var list = document.getElementById("boss-level-list");
  if (!list) return;

  // Hilfsfunktion: "9/2" → { primary: 9, secondary: 2 }; "9" → { primary: 9, secondary: 0 }
  function parseLevel(raw) {
    if (!raw) return null;
    var parts = String(raw).split("/");
    var p = parseInt(parts[0], 10);
    var s = parts.length > 1 ? parseInt(parts[1], 10) : 0;
    return isNaN(p) ? null : { primary: p, secondary: isNaN(s) ? 0 : s };
  }

  // Nur besiegte Bosse mit gültigem Level
  var done = bossLevelData.filter(function(b) {
    return b.done && b.level !== null && parseLevel(b.level) !== null;
  });

  // Aufsteigend sortieren: erst nach Level (vor /), dann nach Suffix (nach /)
  done.sort(function(a, b) {
    var pa = parseLevel(a.level), pb = parseLevel(b.level);
    if (pa.primary !== pb.primary) return pa.primary - pb.primary;
    return pa.secondary - pb.secondary;
  });

  var subtitle = document.getElementById("boss-level-subtitle");
  if (subtitle) subtitle.textContent = done.length + " Bosse besiegt";

  if (done.length === 0) {
    list.innerHTML = '<div class="boss-level-empty">Noch keine Bosse mit Level-Eintrag besiegt.</div>';
    return;
  }

  list.innerHTML = done.map(function(b, i) {
    var isMain = MAIN_BOSSES.has(b.boss);
    // DLC: "Scadubaum-Stufe X", Base Game: "Lv X"
    var displayLevel = String(b.level).split("/")[0].trim();
    var levelLabel   = b.isDLC ? 'Scadu-Lvl.&nbsp;' : 'Lvl&nbsp;';

    // Bosskill-Clip suchen
    var bossKey  = (b.area && b.area.length > 0) ? b.area + "|" + b.boss : b.boss;
    var allClips = (clipsByBoss[bossKey] || []).concat(clipsByBoss[b.boss] || []);
    allClips = allClips.filter(function(c, idx, arr) {
      return arr.findIndex(function(x) { return x.url === c.url; }) === idx;
    });
    var bosskillClip = allClips.find(function(c) { return c.category === "Bosskill"; });
    var clipHtml = bosskillClip
      ? '<a class="boss-level-clip-link" href="' + escAttr(bosskillClip.url) + '" target="_blank" rel="noopener" data-tip="Bosskill-Clip ansehen" data-tip-always="1">'
        + '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21 2H3C1.9 2 1 2.9 1 4v16c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H3V4h18v16zM10 8.5v7l6-3.5-6-3.5z"/></svg>'
        + '</a>'
      : '<span class="boss-level-clip-empty"></span>';

    return '<div class="boss-level-entry' + (isMain ? " main" : "") + ' has-clip-col">'
      + '<span class="boss-level-rank">' + (i + 1) + '</span>'
      + '<span class="boss-level-badge' + (b.isDLC ? ' dlc' : '') + '">' + levelLabel + escHtml(displayLevel) + '</span>'
      + '<div class="boss-level-info">'
      + '<span class="boss-level-name' + (isMain ? " main" : "") + '" data-tip="' + escAttr(b.boss) + '" data-tip-always="1">' + escHtml(b.boss) + '</span>'
      + '<span class="boss-level-area">' + escHtml(b.area) + '</span>'
      + '</div>'
      + '<span class="boss-level-deaths' + (b.deaths === 0 ? " nodeath" : "") + '">'
      + (b.deaths > 0 ? '†' + b.deaths : '†–')
      + '</span>'
      + clipHtml
      + '</div>';
  }).join("");
}
// ─── END BOSS LEVEL PANEL ────────────────────────────────────────────────────

// ─── EDITOR TOOLBOX ────────────────────────────────────────────────────────
var toolboxTimerTick = null;
// GEÄNDERT: alle Zellnamen auf neue Spaltenadressen angepasst (N→O, Q→R, S→T, Y→Z)
var toolboxCellState = { O1: false, O2: false, R1: true, R2: true, T1: false, T2: false, Z1: false };
var toolboxPendingCells = {}; // cell → timestamp, schützt Button-States vor Sheet-Überschreibung

function toolboxInit() {
  var box = document.getElementById("editor-toolbox");
  if (!box) return;
  var show = isAuthorized();
  box.style.display = show ? "flex" : "none";
  document.body.classList.toggle("editor-mode", show);
}

function toolboxOpenPanel(name) {
  var panels = ['timer', 'obs', 'filter'];
  var wasOpen = false;
  panels.forEach(function(p) {
    var item = document.getElementById('etb-item-' + p);
    if (!item) return;
    if (p === name && item.classList.contains('open')) wasOpen = true;
    item.classList.toggle('open', p === name && !item.classList.contains('open'));
    if (p !== name) item.classList.remove('open');
  });
  if (name === 'timer' && !wasOpen) toolboxFillTimeInputs();
}

function toolboxFillTimeInputs() {
  var ms  = timerStartTs > 0 ? timerElapsed + (Date.now() - timerStartTs) : timerElapsed;
  var s   = Math.floor(ms / 1000);
  var h   = Math.floor(s / 3600);
  var m   = Math.floor((s % 3600) / 60);
  var sec = s % 60;
  var hEl = document.getElementById('etb-elapsed-h');
  var mEl = document.getElementById('etb-elapsed-m');
  var sEl = document.getElementById('etb-elapsed-s');
  if (hEl) hEl.value = h > 0 ? h : '';
  if (mEl) mEl.value = m > 0 ? m : '';
  if (sEl) sEl.value = sec > 0 ? sec : '';
  var labelInput = document.getElementById('etb-timer-label-input');
  if (labelInput) labelInput.value = timerLabel || '';
}

function toolboxSetElapsed() {
  if (!isAuthorized()) return;
  var h   = Math.max(0, parseInt(document.getElementById('etb-elapsed-h').value) || 0);
  var m   = Math.max(0, Math.min(59, parseInt(document.getElementById('etb-elapsed-m').value) || 0));
  var s   = Math.max(0, Math.min(59, parseInt(document.getElementById('etb-elapsed-s').value) || 0));
  var ms  = (h * 3600 + m * 60 + s) * 1000;

  pendingLocalTimer = Date.now();
  timerElapsed = ms;
  if (timerStartTs > 0) timerStartTs = Date.now(); // Timer läuft weiter ab neuer Zeit

  toolboxPatchTimerCells();
  updateTimerDisplay();
  toolboxSyncTimerUI();

  if (TOOLBOX_SCRIPT_URL) {
    fetch(TOOLBOX_SCRIPT_URL
      + "?action=setElapsed&elapsed=" + encodeURIComponent(ms)
      + "&twitchToken=" + encodeURIComponent(getTwitchToken()),
      { method: "GET", mode: "no-cors" }
    ).catch(function(e) { console.error("[Toolbox] setElapsed:", e); });
  }

  showToast("⏱ Timer gesetzt: " + fmtTime(ms), 2000);
}

function toolboxSetTimerLabel() {
  if (!isAuthorized()) return;
  var input = document.getElementById('etb-timer-label-input');
  var label = input ? input.value.trim() : "";

  // Lokal sofort anwenden
  timerLabel = label;
  var labelEl = document.getElementById("val-timer-label");
  if (labelEl) labelEl.textContent = timerLabel ? timerLabel + ":" : "Aktueller Boss:";

  // Sheet: N3 setzen (leer = Inhalt löschen)
  if (TOOLBOX_SCRIPT_URL) {
    fetch(TOOLBOX_SCRIPT_URL
      + "?action=setCell&cell=N3&value=" + encodeURIComponent(label)
      + "&twitchToken=" + encodeURIComponent(getTwitchToken()),
      { method: "GET", mode: "no-cors" }
    ).catch(function(e) { console.error("[Toolbox] setTimerLabel:", e); });
  }

  showToast(label ? "\uD83C\uDFF7 Label gesetzt: " + label : "\uD83C\uDFF7 Label geleert", 2000);
}

document.addEventListener('click', function(e) {
  var toolbox = document.getElementById('editor-toolbox');
  if (toolbox && !toolbox.contains(e.target)) {
    ['timer','obs','filter'].forEach(function(p) {
      var item = document.getElementById('etb-item-' + p);
      if (item) item.classList.remove('open');
    });
  }
});

function toolboxWriteCell(cell, value) {
  if (!isAuthorized() || !TOOLBOX_SCRIPT_URL) return;
  fetch(TOOLBOX_SCRIPT_URL
    + "?action=setCell&cell=" + encodeURIComponent(cell)
    + "&value=" + encodeURIComponent(value)
    + "&twitchToken=" + encodeURIComponent(getTwitchToken()),
    { method: "GET", mode: "no-cors" }
  ).catch(function(e) { console.error("[Toolbox] setCell:", e); });
}

function toolboxWriteTimerCells(startTs, elapsed) {
  if (!isAuthorized() || !TOOLBOX_SCRIPT_URL) return;
  fetch(TOOLBOX_SCRIPT_URL
    + "?action=setTimer&startTs=" + encodeURIComponent(startTs)
    + "&elapsed=" + encodeURIComponent(elapsed)
    + "&twitchToken=" + encodeURIComponent(getTwitchToken()),
    { method: "GET", mode: "no-cors" }
  ).catch(function(e) { console.error("[Toolbox] setTimer:", e); });
}

function toolboxSetBtnActive(btnId, active) {
  var btn = document.getElementById(btnId);
  if (btn) btn.classList.toggle("active", active);
}

// ── Cell toggle (O1, O2, R1, R2, T1, T2, Z1) ────────────────────────────
// HINWEIS: HTML-Button-onclick-Attribute müssen ebenfalls auf neue Zellnamen aktualisiert werden
// z.B. toolboxToggleCell('O1','etb-btn-O1') statt ('N1','etb-btn-N1')
function toolboxToggleCell(cell, btnId) {
  if (!isAuthorized()) return;
  toolboxCellState[cell] = !toolboxCellState[cell];
  var v = toolboxCellState[cell];
  // GEÄNDERT: S1→T1, S2→T2
  if (cell === 'T1' && v) {
    toolboxCellState.T2 = false;
    toolboxPendingCells['T2'] = Date.now();
    toolboxSetBtnActive('etb-btn-T2', false);
    toolboxWriteCell('T2', 'FALSE');
  }
  if (cell === 'T2' && v) {
    toolboxCellState.T1 = false;
    toolboxPendingCells['T1'] = Date.now();
    toolboxSetBtnActive('etb-btn-T1', false);
    toolboxWriteCell('T1', 'FALSE');
  }
  toolboxPendingCells[cell] = Date.now();
  toolboxWriteCell(cell, v ? "TRUE" : "FALSE");
  toolboxSetBtnActive(btnId, v);
  toolboxPatchCell(cell, v);   // keep cachedRows in sync
  toolboxApplyCell(cell, v);   // update page immediately
}

// ── Timer Start/Pause ────────────────────────────────────────────────────
function toolboxToggleTimer() {
  if (!isAuthorized()) return;
  pendingLocalTimer = Date.now();
  if (timerStartTs > 0) {
    timerElapsed += Date.now() - timerStartTs;
    timerStartTs = 0;
    // GEÄNDERT: L1→M1
    toolboxWriteCell("M1", "FALSE");
    toolboxWriteTimerCells(0, timerElapsed);
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  } else {
    timerStartTs = Date.now();
    // GEÄNDERT: L1→M1
    toolboxWriteCell("M1", "TRUE");
    toolboxWriteTimerCells(timerStartTs, timerElapsed);
    startTimerTick();
  }
  updateTimerDisplay();
  toolboxSyncTimerUI();
}

function toolboxTimerReset() {
  if (!isAuthorized()) return;
  pendingLocalTimer = Date.now();
  timerStartTs = 0;
  timerElapsed = 0;
  if (TOOLBOX_SCRIPT_URL) {
    // GEÄNDERT: L2→M2
    fetch(TOOLBOX_SCRIPT_URL + "?action=pulseCell&cell=M2&twitchToken=" + encodeURIComponent(getTwitchToken()), { method: "GET", mode: "no-cors" })
      .catch(function(e) { console.error("[Toolbox] pulseCell:", e); });
  }
  toolboxWriteTimerCells(0, 0);
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  updateTimerDisplay();
  toolboxSyncTimerUI();
}

// Patch helpers – keep cachedRows in sync so next real fetch doesn't revert
// GEÄNDERT: alle Spaltenindizes um +1 (ab ex-Spalte G, 0-basiert: ≥6 → +1)
// N→O: 13→14, Q→R: 16→17, S→T: 18→19, Y→Z: 24→25
var CELL_MAP = {
  O1: [0, 14], O2: [1, 14],
  R1: [0, 17], R2: [1, 17],
  T1: [0, 19], T2: [1, 19],
  Z1: [0, 25]
};

function toolboxPatchCell(cell, value) {
  if (!cachedRows) return;
  var pos = CELL_MAP[cell];
  if (!pos) return;
  var r = pos[0], c = pos[1];
  if (!cachedRows[r]) return;
  if (!cachedRows[r].c) cachedRows[r].c = [];
  if (!cachedRows[r].c[c]) cachedRows[r].c[c] = {};
  cachedRows[r].c[c].v = value;
}

function toolboxPatchTimerCells() {
  if (!cachedRows) return;
  function set(r, c, v) {
    if (!cachedRows[r]) return;
    if (!cachedRows[r].c) cachedRows[r].c = [];
    if (!cachedRows[r].c[c]) cachedRows[r].c[c] = {};
    cachedRows[r].c[c].v = v;
  }
  // GEÄNDERT: W→X, 0-basiert: 22→23
  set(0, 23, timerStartTs);
  set(2, 23, timerElapsed);
}

// Direct UI update – no processData, no re-read from cachedRows
function toolboxRefresh() {
  // Also keep cachedRows patched so the next real sheet poll doesn't revert
  toolboxPatchTimerCells();
  // GEÄNDERT: N1→O1, Q1→R1, Q2→R2
  toolboxPatchCell('O1', toolboxCellState.O1);
  toolboxPatchCell('R1', toolboxCellState.R1);
  toolboxPatchCell('R2', toolboxCellState.R2);
}

// Apply cell change immediately to page state
// GEÄNDERT: alle case-Bezeichner auf neue Spaltennamen
function toolboxApplyCell(cell, val) {
  switch (cell) {
    case 'O1': // war N1
      pendingLocalTimer = Date.now();
      timerVisible = val;
      updateTimerDisplay();
      if (val && timerStartTs > 0) startTimerTick();
      else if (!val && timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      break;
    case 'R1': // war Q1
      showBase = val;
      var b = document.getElementById('btn-basegame');
      if (b) b.classList.toggle('active', val);
      updateFieldDeathsVisibility();
      renderAreas(currentAreas);
      break;
    case 'R2': // war Q2
      showDLC = val;
      var b = document.getElementById('btn-dlc');
      if (b) b.classList.toggle('active', val);
      updateFieldDeathsVisibility();
      renderAreas(currentAreas);
      break;
    case 'T1': // war S1
      showOnlyOpen = val;
      if (val) { showOnlyDone = false; toolboxCellState.T2 = false; toolboxSetBtnActive('etb-btn-T2', false); }
      var bo = document.getElementById('btn-open');
      var bd = document.getElementById('btn-done');
      if (bo) bo.classList.toggle('active', showOnlyOpen);
      if (bd) bd.classList.toggle('active', showOnlyDone);
      document.body.classList.toggle('filter-open', showOnlyOpen);
      renderAreas(currentAreas);
      break;
    case 'T2': // war S2
      showOnlyDone = val;
      if (val) { showOnlyOpen = false; toolboxCellState.T1 = false; toolboxSetBtnActive('etb-btn-T1', false); }
      var bo = document.getElementById('btn-open');
      var bd = document.getElementById('btn-done');
      if (bd) bd.classList.toggle('active', showOnlyDone);
      if (bo) bo.classList.toggle('active', showOnlyOpen);
      document.body.classList.toggle('filter-open', showOnlyOpen);
      renderAreas(currentAreas);
      break;
  }
}

function toolboxSyncTimerUI() {
  var btn  = document.getElementById("etb-btn-L1");
  var disp = document.getElementById("etb-timer-display");
  if (!btn || !disp) return;
  var running = timerStartTs > 0;
  btn.classList.toggle("timer-running", running);
  // Update icon and text without replacing innerHTML (replacing it destroys
  // the click target mid-event, causing the panel to close)
  var iconEl = btn.querySelector(".etb-btn-icon");
  var textEl = btn.querySelector(".etb-btn-text");
  if (iconEl) iconEl.textContent = running ? "⏸" : "▶";
  if (textEl) textEl.textContent = running ? "Pause" : "Start";
  disp.classList.toggle("running", running);
  if (toolboxTimerTick) clearInterval(toolboxTimerTick);
  if (running) toolboxTimerTick = setInterval(toolboxUpdateTimerDisplay, 500);
  toolboxUpdateTimerDisplay();
}

function toolboxUpdateTimerDisplay() {
  var disp = document.getElementById("etb-timer-display");
  if (!disp) return;
  var ms = timerStartTs > 0 ? timerElapsed + (Date.now() - timerStartTs) : timerElapsed;
  disp.textContent = fmtTime(ms);
}

function toolboxSyncFromRows(rows) {
  if (!isAuthorized()) return;
  var now = Date.now();
  var GRACE = 10000;
  function getCell(r, c) {
    return rows[r] && rows[r].c && rows[r].c[c] ? rows[r].c[c].v : null;
  }
  function syncCell(cell, r, c, btnId) {
    if (toolboxPendingCells[cell] && (now - toolboxPendingCells[cell]) < GRACE) return;
    delete toolboxPendingCells[cell];
    toolboxCellState[cell] = isTrue(getCell(r, c));
    toolboxSetBtnActive(btnId, toolboxCellState[cell]);
  }
  // GEÄNDERT: alle Zellnamen (N→O, Q→R, S→T, Y→Z) und 0-basierten Indizes (+1 ab ex-Spalte G)
  syncCell('O1', 0, 14, 'etb-btn-O1');  // war: N1, 0, 13
  syncCell('O2', 1, 14, 'etb-btn-O2');  // war: N2, 1, 13
  syncCell('R1', 0, 17, 'etb-btn-R1');  // war: Q1, 0, 16
  syncCell('R2', 1, 17, 'etb-btn-R2');  // war: Q2, 1, 16
  syncCell('T1', 0, 19, 'etb-btn-T1');  // war: S1, 0, 18
  syncCell('T2', 1, 19, 'etb-btn-T2');  // war: S2, 1, 18
  syncCell('Z1', 0, 25, 'etb-btn-Z1');  // war: Y1, 0, 24
  toolboxSyncTimerUI();
  toolboxInit();
}
// ─── END TOOLBOX ───────────────────────────────────────────────────────────


var clipsData      = [];
var clipDateFilter = 'all';
var clipDateFrom   = null;
var clipDateTo     = null;
var activeCategory = null;
var clipViewMode   = 'grid'; // 'grid' oder 'reels'
var clipReelsObserver = null;
var clipReelsTimers = null;
var reelSoundPreferred = false; // wird true, sobald der Nutzer einmal manuell den Ton einschaltet
var currentAreas   = {};
var searchQuery    = "";
var prevRankingSnapshot = "";
var prevChartSnapshot = "";
var clipsByBoss         = {};
var deathsWriteTimer = null;
var pendingLocalChanges = {};
var pendingLocalTimer   = 0; // timestamp of last toolbox timer action
var fieldDeaths = { base: 0, dlc: 0 };
var fieldDeathsTimer = { base: null, dlc: null };
var fieldDeathsPending = { base: 0, dlc: 0 }; // timestamp of last local write (grace period)
var FIELD_DEATHS_GRACE = 10000; // 10s – same grace as pendingLocalChanges
var PENDING_GRACE = 35000; // 35s – Zeit bis Sheet-Wert nach lokalem Write wieder übernommen wird (GAS braucht bis zu 30s)
var liveCheckInterval = null;

// Auth state
var currentUser = null;
var userIsEditor = false;

// Boss menu state
var menuState = {
  area:   null,
  boss:   null,
  deaths: 0,
  done:   false,
  pinned: false,
  level:  null
};

var bingoCells          = [];
var bingoChecked        = [];
var bingoPanelCollapsed = false;
var prevBingoTextSnap   = "";
var prevBingoStateSnap  = "";

// ═══════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════

function isTrue(v) {
  return [true, "TRUE", "WAHR", 1, "1", "true", "wahr"].indexOf(v) !== -1;
}

function fmtTime(ms) {
  var s   = Math.floor(ms / 1000);
  var h   = String(Math.floor(s / 3600)).padStart(2, "0");
  var m   = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  var sec = String(s % 60).padStart(2, "0");
  return h + ":" + m + ":" + sec;
}

function showToast(msg, duration) {
  duration = duration || 3500;
  var el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(function() { el.classList.remove("show"); }, duration);
}

function pulseEl(el) {
  if (!el) return;
  el.classList.remove("stat-pulse");
  void el.offsetWidth;
  el.classList.add("stat-pulse");
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escAttr(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH / TWITCH OAUTH
// ═══════════════════════════════════════════════════════════════════════════

function loginWithTwitch() {
  if (!TWITCH_CLIENT_ID || TWITCH_CLIENT_ID === "DEINE_CLIENT_ID_HIER") {
    showToast("⚠ Twitch Client ID nicht konfiguriert!", 4000);
    return;
  }
  var scope = "";
  var url   = "https://id.twitch.tv/oauth2/authorize"
    + "?client_id="    + encodeURIComponent(TWITCH_CLIENT_ID)
    + "&redirect_uri=" + encodeURIComponent(TWITCH_REDIRECT_URI)
    + "&response_type=token"
    + "&scope="        + encodeURIComponent(scope)
    + "&force_verify=false";
  window.location.href = url;
}

function logout() {
  localStorage.removeItem("twitch_token");
  localStorage.removeItem("twitch_user");
  currentUser  = null;
  userIsEditor = false;
  updateLoginUI();
  renderFromCache();
  checkLiveStatus();
}

function checkAuthOnLoad() {
  var hash = window.location.hash;
  if (hash && hash.includes("access_token=")) {
    var params = new URLSearchParams(hash.substring(1));
    var token  = params.get("access_token");
    if (token) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
      fetchTwitchUser(token);
      return;
    }
  }

  var savedToken = localStorage.getItem("twitch_token");
  var savedUser  = localStorage.getItem("twitch_user");
  if (savedToken && savedUser) {
    try {
      currentUser  = JSON.parse(savedUser);
      userIsEditor = ALLOWED_USERS.indexOf(currentUser.login.toLowerCase()) !== -1;
      updateLoginUI();
      // Token im Hintergrund validieren – abgelaufene Tokens führen sonst
      // zu stillem Scheitern beim Sheet-Schreiben (mode:no-cors zeigt keinen Fehler)
      fetch("https://id.twitch.tv/oauth2/validate", {
        headers: { "Authorization": "OAuth " + savedToken }
      })
      .then(function(r) { if (!r.ok) throw new Error("expired"); })
      .catch(function() {
        localStorage.removeItem("twitch_token");
        localStorage.removeItem("twitch_user");
        currentUser  = null;
        userIsEditor = false;
        updateLoginUI();
        showToast("\u26a0 Twitch-Sitzung abgelaufen – bitte neu einloggen.", 6000);
      });
    } catch (e) {
      localStorage.removeItem("twitch_token");
      localStorage.removeItem("twitch_user");
    }
  }
}

function fetchTwitchUser(token) {
  fetch("https://api.twitch.tv/helix/users", {
    headers: {
      "Authorization": "Bearer " + token,
      "Client-Id":     TWITCH_CLIENT_ID
    }
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (!data.data || data.data.length === 0) { throw new Error("No user data"); }
    var user = data.data[0];
    currentUser = {
      login:             user.login,
      display_name:      user.display_name,
      profile_image_url: user.profile_image_url
    };
    userIsEditor = ALLOWED_USERS.indexOf(user.login.toLowerCase()) !== -1;
    localStorage.setItem("twitch_token", token);
    localStorage.setItem("twitch_user", JSON.stringify(currentUser));
    updateLoginUI();
    renderFromCache();
    showToast(userIsEditor
      ? "✔ Willkommen " + currentUser.display_name + " — Bearbeitungsrechte aktiv"
      : "👁 Eingeloggt als " + currentUser.display_name + " (nur lesen)", 4000);
    checkLiveStatus();
  })
  .catch(function(err) {
    console.error("[Auth] Fehler:", err);
    showToast("⚠ Twitch-Anmeldung fehlgeschlagen", 3500);
  });
}

// ── Twitch Clip-Erstelldatum abrufen ─────────────────────────────────────────
function fetchTwitchClipData(slug) {
  return new Promise(function(resolve) {
    var fallback = { addedAt: new Date().toISOString(), creatorName: "" };
    var token = localStorage.getItem("twitch_token");
    if (!token || !slug || slug === "") { resolve(fallback); return; }
    fetch("https://api.twitch.tv/helix/clips?id=" + encodeURIComponent(slug), {
      headers: {
        "Authorization": "Bearer " + token,
        "Client-Id":     TWITCH_CLIENT_ID
      }
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.data && data.data[0]) {
        resolve({
          addedAt:     data.data[0].created_at  || fallback.addedAt,
          creatorName: data.data[0].creator_name || ""
        });
      } else {
        console.warn("[Clips] Keine Clip-Daten in Twitch-Antwort:", data);
        resolve(fallback);
      }
    })
    .catch(function(err) {
      console.warn("[Clips] Twitch-API-Fehler:", err);
      resolve(fallback);
    });
  });
}

function fetchTwitchClipDate(slug) {
  return fetchTwitchClipData(slug).then(function(d) { return d.addedAt; });
}

function updateLoginUI() {
  var loginBtn   = document.getElementById("twitch-login-btn");
  var userWidget = document.getElementById("user-widget");
  var authNotice = document.getElementById("auth-notice");

  if (currentUser) {
    loginBtn.style.display  = "none";
    userWidget.classList.add("visible");
    document.getElementById("user-name").textContent = currentUser.display_name;

    var avatarImg         = document.getElementById("user-avatar");
    var avatarPlaceholder = document.getElementById("user-avatar-placeholder");
    if (currentUser.profile_image_url) {
      avatarImg.src           = currentUser.profile_image_url;
      avatarImg.style.display = "block";
      avatarPlaceholder.style.display = "none";
    } else {
      avatarPlaceholder.textContent   = currentUser.display_name.charAt(0).toUpperCase();
      avatarPlaceholder.style.display = "flex";
    }

    var badge = document.getElementById("user-role-badge");
    if (userIsEditor) {
      badge.textContent  = "✦ Editor";
      badge.className    = "user-role-badge editor";
      authNotice.classList.remove("visible");
    } else {
      badge.textContent  = "● Zuschauer";
      badge.className    = "user-role-badge viewer";
      authNotice.classList.add("visible");
    }
  } else {
    loginBtn.style.display = "";
    userWidget.classList.remove("visible");
    authNotice.classList.remove("visible");
  }
  updateAddClipButton();

  var bar = document.getElementById("field-deaths-bar");
  if (bar) bar.style.display = isAuthorized() ? "flex" : "none";
  updateFieldDeathsVisibility();
  toolboxInit();
}

function isAuthorized() {
  return userIsEditor && currentUser !== null;
}

// ═══════════════════════════════════════════════════════════════════════════
// TWITCH LIVE STATUS
// ═══════════════════════════════════════════════════════════════════════════

function checkLiveStatus() {
  var token = localStorage.getItem("twitch_token");
  var badge = document.getElementById("live-badge");
  if (!badge) return;

  if (!token) {
    badge.className = "live-badge no-token";
    badge.innerHTML = '<a class="live-link" href="https://twitch.tv/' + STREAMER_LOGIN + '" target="_blank" rel="noopener">'
      + '<svg width="12" height="12" viewBox="0 0 24 24" fill="#9146ff" style="flex-shrink:0"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>'
      + 'twitch.tv/' + STREAMER_LOGIN + '</a>';
    return;
  }

  fetch("https://api.twitch.tv/helix/streams?user_login=" + encodeURIComponent(STREAMER_LOGIN), {
    headers: {
      "Authorization": "Bearer " + token,
      "Client-Id":     TWITCH_CLIENT_ID
    }
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    var el = document.getElementById("live-badge");
    if (!el) return;
    if (data.data && data.data.length > 0) {
      var stream  = data.data[0];
      var viewers = stream.viewer_count.toLocaleString("de-DE");
      el.className = "live-badge is-live";
      el.innerHTML = '<a class="live-link" href="https://twitch.tv/' + STREAMER_LOGIN + '" target="_blank" rel="noopener">'
        + '<span class="live-dot"></span>'
        + 'LIVE &mdash; ' + viewers + ' Zuschauer</a>';
    } else {
      el.className = "live-badge is-offline";
      el.innerHTML = '<a class="live-link" href="https://twitch.tv/' + STREAMER_LOGIN + '" target="_blank" rel="noopener">'
        + '<span class="offline-dot"></span>Offline</a>';
    }
  })
  .catch(function() {
    var el = document.getElementById("live-badge");
    if (!el) return;
    el.className = "live-badge no-token";
    el.innerHTML = '<a class="live-link" href="https://twitch.tv/' + STREAMER_LOGIN + '" target="_blank" rel="noopener">'
      + '<svg width="12" height="12" viewBox="0 0 24 24" fill="#9146ff" style="flex-shrink:0"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>'
      + 'twitch.tv/' + STREAMER_LOGIN + '</a>';
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SHEET WRITE-BACK
// ═══════════════════════════════════════════════════════════════════════════

function writeToSheet(area, boss, action, value) {
  if (APPS_SCRIPT_URL === "DEINE_APPS_SCRIPT_URL_HIER" || !APPS_SCRIPT_URL) {
    console.warn("[Sheet] Apps Script URL nicht konfiguriert – Änderung nur lokal.");
    return;
  }
  var url = APPS_SCRIPT_URL
    + "?area="   + encodeURIComponent(area)
    + "&boss="   + encodeURIComponent(boss)
    + "&action=" + encodeURIComponent(action)
    + "&value="  + encodeURIComponent(value)
    + "&twitchToken=" + encodeURIComponent(getTwitchToken());

  // cors zuerst um Fehlerantwort lesen zu können (z.B. abgelaufener Token).
  // Schlägt CORS fehl (Apps Script hat kein CORS-Header) → no-cors Fallback.
  fetch(url, { method: "GET", mode: "cors" })
    .then(function(r) { return r.text(); })
    .then(function(t) {
      if (t && t.indexOf("unauthorized") !== -1) {
        localStorage.removeItem("twitch_token");
        localStorage.removeItem("twitch_user");
        currentUser  = null;
        userIsEditor = false;
        updateLoginUI();
        showToast("\u26a0 Sitzung abgelaufen – bitte neu einloggen.", 5000);
      }
    })
    .catch(function() {
      fetch(url, { method: "GET", mode: "no-cors" })
        .catch(function(err) { console.error("[Sheet] Schreibfehler:", err); });
    });
}

function applyLocalBossChange(area, boss, field, value) {
  pendingLocalChanges[area + "|" + boss] = Date.now();
  if (!currentAreas[area]) return;
  var bossData = currentAreas[area].bosses.find(function(b) { return b.boss === boss; });
  if (!bossData) return;

  var oldDone = bossData.done;
  bossData[field] = value;

  currentAreas[area].done = currentAreas[area].bosses.filter(function(b) { return b.done; }).length;

  updateBossRow(area, boss, bossData);
  updateAreaHeader(area);
  updatePinnedCard(area, boss, bossData);

  var row = document.querySelector('.boss-row[data-area="' + CSS.escape(area) + '"][data-boss="' + CSS.escape(boss) + '"]');
  if (row) {
    row.classList.add("syncing");
    setTimeout(function() { row.classList.remove("syncing"); }, 3000);
  }

  if (field === "done" && value === true && !oldDone && MAIN_BOSSES.has(boss)) {
    showToast("✔ " + boss + " besiegt!");
  }
}

function adjustFieldDeaths(type, delta) {
  if (!isAuthorized()) return;
  var newVal = Math.max(0, fieldDeaths[type] + delta);
  fieldDeaths[type] = newVal;
  document.getElementById("fdeath-val-" + type).textContent = newVal;
  fieldDeathsPending[type] = Date.now(); // protect against processData overwrite
  if (fieldDeathsTimer[type]) clearTimeout(fieldDeathsTimer[type]);
  var t = type, v = newVal;
  fieldDeathsTimer[type] = setTimeout(function() {
    writeFieldDeathsToSheet(t, v);
    fieldDeathsTimer[t] = null;
  }, 600);
}

function updateFieldDeathsVisibility() {
  var chipBase    = document.getElementById("fdeath-chip-base");
  var chipDlc     = document.getElementById("fdeath-chip-dlc");
  var divider     = document.getElementById("fdeath-divider");
  if (!chipBase || !chipDlc) return;

  chipBase.style.display = showBase ? "" : "none";
  chipDlc.style.display  = showDLC  ? "" : "none";
  // Trenner nur anzeigen wenn beide sichtbar sind
  if (divider) divider.style.display = (showBase && showDLC) ? "" : "none";
}

function writeFieldDeathsToSheet(type, value) {
  if (!APPS_SCRIPT_URL) return;
  var url = APPS_SCRIPT_URL
    + "?action=setFieldDeaths"
    + "&type="  + encodeURIComponent(type)
    + "&value=" + encodeURIComponent(value)
    + "&twitchToken=" + encodeURIComponent(getTwitchToken());
  fetch(url, { method: "GET", mode: "cors" })
    .then(function(r) { return r.text(); })
    .then(function(t) { if (t && t.indexOf("unauthorized") !== -1) { showToast("\u26a0 Sitzung abgelaufen – bitte neu einloggen.", 5000); } })
    .catch(function() {
      fetch(url, { method: "GET", mode: "no-cors" })
        .catch(function(e) { console.error("[FieldDeaths]", e); });
    });
}

function updateBossRow(areaName, bossName, bossData) {
  var row = document.querySelector(
    '.boss-row[data-area="' + CSS.escape(areaName) + '"][data-boss="' + CSS.escape(bossName) + '"]'
  );
  if (!row) return;

  var isDone       = bossData.done;
  var isMain       = MAIN_BOSSES.has(bossName);
  var editClass    = isAuthorized() ? " editable" : "";

  row.className    = "boss-row" + (isDone ? " done" : "") + editClass;
  var deathsEl     = row.querySelector(".boss-deaths");
  var nameEl       = row.querySelector(".boss-name");
  if (deathsEl) deathsEl.textContent = bossData.deaths > 0 ? "†" + bossData.deaths : "†–";
  if (nameEl)   nameEl.className     = "boss-name" + (isMain ? " main" : "");
}

function updatePinnedCard(areaName, bossName, bossData) {
  var card = document.querySelector(
    '.pinned-card[data-area="' + CSS.escape(areaName) + '"][data-boss="' + CSS.escape(bossName) + '"]'
  );
  if (!card) return;
  card.classList.toggle("done", bossData.done);
  var deathsEl = card.querySelector(".pinned-deaths");
  if (deathsEl) deathsEl.textContent = "📌 " + (bossData.deaths > 0 ? bossData.deaths : "–");
}

function updateAreaHeader(areaName) {
  var data = currentAreas[areaName];
  if (!data) return;
  var card = document.querySelector('.area-card[data-area="' + CSS.escape(areaName) + '"]');
  if (!card) return;
  var fraction = card.querySelector(".area-fraction");
  var fillEl   = card.querySelector(".area-progress-fill");
  var pct      = data.total > 0 ? (data.done / data.total) * 100 : 0;
  var complete = data.done === data.total && data.total > 0;
  if (fraction) fraction.textContent = data.done + "/" + data.total;
  if (fillEl) {
    fillEl.style.width = pct + "%";
    fillEl.classList.toggle("complete", complete);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BOSS CONTEXT MENU
// ═══════════════════════════════════════════════════════════════════════════

var menuOpen = false;

function openBossMenu(e, areaName, bossName) {
  if (!isAuthorized()) return;
  e.stopPropagation();

  var area     = currentAreas[areaName];
  if (!area) return;
  var bossData = null;
  for (var i = 0; i < area.bosses.length; i++) {
    if (area.bosses[i].boss === bossName) { bossData = area.bosses[i]; break; }
  }
  if (!bossData) return;

  menuState = {
    area:   areaName,
    boss:   bossName,
    deaths: bossData.deaths,
    done:   bossData.done,
    pinned: bossData.pinned,
    level:  bossData.level || null
  };

  document.getElementById("menu-boss-name").textContent = bossName;
  document.getElementById("menu-area-name").textContent = areaName;
  updateMenuDisplay();

  positionMenu(e);

  document.querySelectorAll(".boss-row.menu-open, .pinned-card.menu-open").forEach(function(r) {
    r.classList.remove("menu-open");
  });
  e.currentTarget.classList.add("menu-open");

  var menu = document.getElementById("boss-menu");
  menu.classList.add("open");
  menuOpen = true;
}

function positionMenu(e) {
  var menu   = document.getElementById("boss-menu");
  menu.style.display = "block";
  var mw     = 240;
  var mh     = 280;
  var vw     = window.innerWidth;
  var vh     = window.innerHeight;
  var touch  = e.changedTouches && e.changedTouches[0];
  var cx     = touch ? touch.clientX : e.clientX;
  var cy     = touch ? touch.clientY : e.clientY;

  var left   = cx + 10;
  var top    = cy + 4;

  if (left + mw > vw - 12) left = cx - mw - 10;
  if (top  + mh > vh - 12) top  = cy - mh - 4;
  if (left < 8) left = 8;
  if (top  < 8) top  = 8;

  menu.style.left = left + "px";
  menu.style.top  = top  + "px";
}

function closeBossMenu() {
  if (deathsWriteTimer) {
    clearTimeout(deathsWriteTimer);
    writeToSheet(menuState.area, menuState.boss, "setDeaths", menuState.deaths);
    deathsWriteTimer = null;
  }

  var menu = document.getElementById("boss-menu");
  menu.classList.remove("open");
  menuOpen = false;
  document.querySelectorAll(".boss-row.menu-open, .pinned-card.menu-open").forEach(function(r) {
    r.classList.remove("menu-open");
  });
}

function updateMenuDisplay() {
  document.getElementById("menu-deaths-val").textContent = menuState.deaths;
  document.getElementById("menu-level-input").value = menuState.level !== null ? menuState.level : "";

  var doneBtn   = document.getElementById("menu-done-btn");
  var doneIcon  = document.getElementById("menu-done-icon");
  var doneLabel = document.getElementById("menu-done-label");
  if (menuState.done) {
    doneBtn.className   = "boss-menu-action-btn active";
    doneIcon.textContent = "☑";
    doneLabel.textContent = "Als nicht besiegt markieren";
  } else {
    doneBtn.className   = "boss-menu-action-btn";
    doneIcon.textContent = "☐";
    doneLabel.textContent = "Als besiegt markieren";
  }

  var pinBtn   = document.getElementById("menu-pin-btn");
  var pinIcon  = document.getElementById("menu-pin-icon");
  var pinLabel = document.getElementById("menu-pin-label");
  if (menuState.pinned) {
    pinBtn.className    = "boss-menu-action-btn active-pin";
    pinIcon.textContent = "📍";
    pinLabel.textContent = "Anpinnung entfernen";
  } else {
    pinBtn.className    = "boss-menu-action-btn";
    pinIcon.textContent = "📌";
    pinLabel.textContent = "Anpinnen";
  }
}

function menuAdjustDeaths(delta) {
  var newDeaths = Math.max(0, menuState.deaths + delta);
  menuState.deaths = newDeaths;
  updateMenuDisplay();
  applyLocalBossChange(menuState.area, menuState.boss, "deaths", newDeaths);

  if (deathsWriteTimer) clearTimeout(deathsWriteTimer);
  var capturedArea   = menuState.area;
  var capturedBoss   = menuState.boss;
  var capturedDeaths = newDeaths;
  deathsWriteTimer = setTimeout(function() {
    writeToSheet(capturedArea, capturedBoss, "setDeaths", capturedDeaths);
    deathsWriteTimer = null;
  }, 600);
}

function menuToggleDone() {
  var newDone = !menuState.done;
  menuState.done = newDone;
  updateMenuDisplay();
  applyLocalBossChange(menuState.area, menuState.boss, "done", newDone);
  writeToSheet(menuState.area, menuState.boss, "setDone", newDone ? "TRUE" : "FALSE");
}

function menuTogglePin() {
  var newPinned = !menuState.pinned;
  menuState.pinned = newPinned;
  updateMenuDisplay();
  applyLocalBossChange(menuState.area, menuState.boss, "pinned", newPinned);
  writeToSheet(menuState.area, menuState.boss, "setPinned", newPinned ? "TRUE" : "FALSE");
}

var levelWriteTimer = null;

function menuSetLevel(val) {
  var v = String(val).trim();
  menuState.level = v === "" ? null : v;
  applyLocalBossChange(menuState.area, menuState.boss, "level", menuState.level);

  if (levelWriteTimer) clearTimeout(levelWriteTimer);
  var capturedArea  = menuState.area;
  var capturedBoss  = menuState.boss;
  var capturedLevel = v;
  levelWriteTimer = setTimeout(function() {
    writeToSheet(capturedArea, capturedBoss, "setLevel", capturedLevel);
    levelWriteTimer = null;
  }, 800);
}

document.addEventListener("click", function(e) {
  if (!menuOpen) return;
  var menu = document.getElementById("boss-menu");
  if (!menu.contains(e.target)) closeBossMenu();
});

// ═══════════════════════════════════════════════════════════════════════════
// QUICK CLIP MENU (Rechtsklick auf Boss)
// ═══════════════════════════════════════════════════════════════════════════

var quickClipMenuOpen = false;
var quickClipBoss     = "";
var quickClipArea     = "";

function openQuickClipMenu(e, bossName, areaName) {
  if (!isAuthorized()) return;
  e.preventDefault();
  e.stopPropagation();

  if (menuOpen) closeBossMenu();

  quickClipBoss = bossName;
  quickClipArea = areaName || "";
  document.getElementById("quick-clip-boss-name").textContent = bossName;
  document.getElementById("quick-clip-url").value             = "";
  document.getElementById("quick-clip-cat").value             = "Allgemein";
  document.getElementById("quick-clip-feedback").textContent  = "";
  document.getElementById("quick-clip-feedback").className    = "quick-clip-feedback";

  var menu = document.getElementById("quick-clip-menu");
  var mw   = 272;
  var mh   = 200;
  var vw   = window.innerWidth;
  var vh   = window.innerHeight;
  var left = e.clientX + 10;
  var top  = e.clientY + 4;
  if (left + mw > vw - 12) left = e.clientX - mw - 10;
  if (top  + mh > vh - 12) top  = e.clientY - mh - 4;
  if (left < 8) left = 8;
  if (top  < 8) top  = 8;
  menu.style.left = left + "px";
  menu.style.top  = top  + "px";

  menu.classList.add("open");
  quickClipMenuOpen = true;

  setTimeout(function() {
    var inp = document.getElementById("quick-clip-url");
    if (inp) inp.focus();
  }, 80);
}

function closeQuickClipMenu() {
  document.getElementById("quick-clip-menu").classList.remove("open");
  quickClipMenuOpen = false;
}

function submitQuickClip() {
  if (!isAuthorized()) return;

  var urlEl  = document.getElementById("quick-clip-url");
  var catEl  = document.getElementById("quick-clip-cat");
  var feedEl = document.getElementById("quick-clip-feedback");

  var url      = urlEl.value.trim();
  var category = catEl.value;
  var boss     = quickClipBoss;
  var area     = quickClipArea;

  feedEl.className = "quick-clip-feedback";

  if (!url) {
    feedEl.textContent = "⚠ Bitte einen Twitch-Link eingeben.";
    feedEl.classList.add("error");
    urlEl.focus();
    return;
  }

  var parsed = parseTwitchClip(url);
  if (!parsed || parsed.type === "link") {
    feedEl.textContent = "⚠ Kein gültiger Twitch-Clip- oder VOD-Link.";
    feedEl.classList.add("error");
    urlEl.focus();
    return;
  }

  var isDupe = clipsData.some(function(c) { return c.url.trim() === url; });
  if (isDupe) {
    feedEl.textContent = "⚠ Clip bereits in der Sammlung vorhanden.";
    feedEl.classList.add("error");
    return;
  }

  feedEl.textContent = "⏳ Clip-Datum wird abgerufen…";

  fetchTwitchClipData(parsed.slug).then(function(clipData) {
    var newClip = { url: url, category: category, title: "", boss: boss, area: area, addedAt: clipData.addedAt, creatorName: clipData.creatorName };
    clipsData.push(newClip);
    rebuildClipsByBoss();

    var countEl = document.getElementById("btn-clips-count");
    if (countEl) countEl.textContent = "(" + clipsData.length + ")";
    var modalCount = document.getElementById("modal-clip-count");
    if (modalCount) modalCount.textContent = clipsData.length;

    renderAreas(currentAreas);

    feedEl.textContent = "✔ Clip gespeichert!";
    feedEl.classList.add("success");

    writeClipToSheet(url, category, "", boss, clipData.addedAt, clipData.creatorName, area);

    setTimeout(closeQuickClipMenu, 1400);
  });
}

document.addEventListener("click", function(e) {
  if (!quickClipMenuOpen) return;
  var menu = document.getElementById("quick-clip-menu");
  if (!menu.contains(e.target)) closeQuickClipMenu();
});

document.addEventListener("touchend", function(e) {
  if (!isAuthorized()) return;
  var row = e.target.closest(".boss-row[data-boss]");
  if (!row) return;
  if (e.target.closest(".boss-clip-badge")) return;
  e.preventDefault();
  openBossMenu(e, row.dataset.area, row.dataset.boss);
}, { passive: false });

document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") {
    closeBossLevelPanel();
    closeBossClipsPanel();
    closeBingoEdit();
    closeClipModal();
    closeQuickClipMenu();
    closeBossMenu();
    if (searchQuery) clearSearch();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key === "f") {
    var searchInput = document.getElementById("search-input");
    if (searchInput) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
    return;
  }

  if (menuOpen) {
    var tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      menuAdjustDeaths(1);
      return;
    }
    if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      menuAdjustDeaths(-1);
      return;
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TIMER
// ═══════════════════════════════════════════════════════════════════════════

function updateTimerDisplay() {
  var timerChip = document.getElementById("timer-chip");
  if (!timerChip) return;
  if (!timerVisible) { timerChip.style.display = "none"; return; }
  timerChip.style.display = "flex";
  var elapsed = timerStartTs > 0
    ? timerElapsed + (Date.now() - timerStartTs)
    : timerElapsed;
  document.getElementById("val-timer").textContent = fmtTime(elapsed);
  var labelEl = document.getElementById("val-timer-label");
  if (labelEl) labelEl.textContent = timerLabel ? timerLabel + ":" : "Aktueller Boss:";
}

function startTimerTick() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(updateTimerDisplay, 1000);
}

// ═══════════════════════════════════════════════════════════════════════════
// TOGGLE CONTROLS
// ═══════════════════════════════════════════════════════════════════════════

function toggleFlag(flag) {
  if (flag === "base") {
    showBase = !showBase;
    document.getElementById("btn-basegame").classList.toggle("active", showBase);
  } else if (flag === "dlc") {
    showDLC = !showDLC;
    document.getElementById("btn-dlc").classList.toggle("active", showDLC);
  } else if (flag === "main") {
    showOnlyMain = !showOnlyMain;
    document.getElementById("btn-mainbosses").classList.toggle("active", showOnlyMain);
  } else if (flag === "done") {
    showOnlyDone = !showOnlyDone;
    if (showOnlyDone) {
      showOnlyOpen = false;
      document.getElementById("btn-open").classList.remove("active");
    }
    document.getElementById("btn-done").classList.toggle("active", showOnlyDone);
  } else if (flag === "open") {
    showOnlyOpen = !showOnlyOpen;
    if (showOnlyOpen) {
      showOnlyDone = false;
      document.getElementById("btn-done").classList.remove("active");
    }
    document.getElementById("btn-open").classList.toggle("active", showOnlyOpen);
    document.body.classList.toggle("filter-open", showOnlyOpen);
  }
  updateFieldDeathsVisibility();
  renderFromCache();
}

function setAllCollapsed(val) {
  Object.keys(currentAreas).forEach(function(k) { localCollapsed[k] = val; });
  renderAreas(currentAreas);
}

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH
// ═══════════════════════════════════════════════════════════════════════════

function onSearchInput(val) {
  searchQuery = val.trim().toLowerCase();
  var clearBtn = document.getElementById("search-clear");
  clearBtn.classList.toggle("visible", searchQuery.length > 0);
  document.body.classList.toggle("searching", searchQuery.length > 0);
  applySearch();
}

function clearSearch() {
  searchQuery = "";
  document.getElementById("search-input").value = "";
  document.getElementById("search-clear").classList.remove("visible");
  document.getElementById("search-result-count").classList.remove("visible");
  document.getElementById("search-result-count").textContent = "";
  document.body.classList.remove("searching");
  applySearch();
}

function highlightMatch(text, query) {
  if (!query) return escHtml(text);
  var idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return escHtml(text);
  return escHtml(text.substring(0, idx))
    + "<mark>" + escHtml(text.substring(idx, idx + query.length)) + "</mark>"
    + escHtml(text.substring(idx + query.length));
}

function applySearch() {
  var query   = searchQuery;
  var countEl = document.getElementById("search-result-count");
  var grid    = document.getElementById("areas-grid");
  if (!grid) return;

  var totalMatches = 0;

  grid.querySelectorAll(".area-card[data-area]").forEach(function(card) {
    var rows        = card.querySelectorAll(".boss-row[data-boss]");
    var areaMatches = 0;

    rows.forEach(function(row) {
      var bossName = row.dataset.boss || "";
      var matches  = !query || bossName.toLowerCase().indexOf(query) !== -1;
      row.classList.toggle("search-nomatch", !matches);

      if (matches) {
        areaMatches++;
        var nameEl = row.querySelector(".boss-name");
        if (nameEl) nameEl.innerHTML = highlightMatch(bossName, query);
      } else {
        var nameEl = row.querySelector(".boss-name");
        if (nameEl) nameEl.innerHTML = escHtml(bossName);
      }
    });

    var hidden = query.length > 0 && areaMatches === 0;
    card.classList.toggle("search-hidden", hidden);
    if (!hidden) totalMatches += areaMatches;
  });

  if (query.length > 0) {
    countEl.textContent = totalMatches + " Treffer";
    countEl.classList.add("visible");
  } else {
    countEl.classList.remove("visible");
    countEl.textContent = "";
    grid.querySelectorAll(".boss-row[data-boss]").forEach(function(row) {
      var nameEl   = row.querySelector(".boss-name");
      var bossName = row.dataset.boss || "";
      if (nameEl) nameEl.innerHTML = escHtml(bossName);
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RANKING
// ═══════════════════════════════════════════════════════════════════════════

var rankingCollapsed = false;

function toggleRanking() {
  rankingCollapsed = !rankingCollapsed;
  document.getElementById("ranking-panel").classList.toggle("collapsed", rankingCollapsed);
}

function renderRanking(allBosses) {
  var withDeaths = allBosses.filter(function(b) { return b.deaths > 0; });
  withDeaths.sort(function(a, b) { return b.deaths - a.deaths; });
  var top = withDeaths.slice(0, RANKING_TOP_N);

  var maxDeaths       = top.length > 0 ? top[0].deaths : 1;
  var totalDeaths     = allBosses.reduce(function(s, b) { return s + b.deaths; }, 0);
  var bossesAttempted = allBosses.filter(function(b) { return b.done; }).length;
  var avgDeaths       = bossesAttempted > 0 ? (totalDeaths / bossesAttempted).toFixed(1) : "–";

  document.getElementById("val-avg").textContent = avgDeaths === "–" ? "–" : avgDeaths + " †";

  var subtitle = document.getElementById("ranking-subtitle");
  if (subtitle) {
    var doneBossCount = allBosses.filter(function(b) { return b.done; }).length;
    subtitle.textContent = top.length > 0
      ? "— Top " + top.length + " von " + doneBossCount + " erledigten Bossen"
      : "— Mahluna ist noch nicht gestorben - noch.";
  }

  var listEl = document.getElementById("ranking-list");
  if (!listEl) return;

  if (top.length === 0) {
    listEl.innerHTML = '<div class="ranking-empty">Mahluna ist noch nicht gestorben - noch.</div>';
    return;
  }

  var medals = ["🥇", "🥈", "🥉"];

  listEl.innerHTML = top.map(function(b, i) {
    var pct        = maxDeaths > 0 ? (b.deaths / maxDeaths * 100) : 0;
    var isMain     = MAIN_BOSSES.has(b.boss);
    var rankLabel  = i < 3 ? medals[i] : "#" + (i + 1);
    var rankClass  = i === 0 ? "top1" : (i === 1 ? "top2" : (i === 2 ? "top3" : ""));
    var entryClass = i === 0 ? "rank-entry-1" : (i === 1 ? "rank-entry-2" : "");
    var delayStyle = "animation-delay:" + (i * 55) + "ms";

    return '<div class="ranking-entry ' + entryClass + '" style="' + delayStyle + '">'
      + '<span class="rank-number ' + rankClass + '">' + rankLabel + '</span>'
      + '<div class="rank-bar-wrap">'
      + '<span class="boss-name' + (isMain ? " main" : "") + '" data-tip="' + escAttr(b.boss) + '">' + escHtml(b.boss) + '</span>'
      + '<div class="rank-bar-row">'
      + '<div class="rank-bar-bg"><div class="rank-bar-fill" style="width:' + pct + '%"></div></div>'
      + '<span class="rank-deaths">' + b.deaths.toLocaleString("de-DE") + '<span class="unit"> †</span></span>'
      + '</div></div></div>';
  }).join("");
}

var chartCollapsed = false;
var chartInstance  = null;

function toggleChart() {
  chartCollapsed = !chartCollapsed;
  document.getElementById("chart-panel").classList.toggle("collapsed", chartCollapsed);
  document.getElementById("chart-toggle-icon").style.transform = chartCollapsed ? "rotate(-90deg)" : "";
}

function renderChart(allBosses) {
  var byDate = {};
  allBosses.forEach(function(b) {
    if (!b.done || !b.date) return;
    if (!byDate[b.date]) byDate[b.date] = [];
    byDate[b.date].push(b.boss);
  });

  var dates = Object.keys(byDate).sort(function(a, b) {
    var pa = a.split("."); var pb = b.split(".");
    var da = new Date(pa[2], pa[1]-1, pa[0]);
    var db = new Date(pb[2], pb[1]-1, pb[0]);
    return da - db;
  });

  if (dates.length === 0) {
    document.getElementById("chart-section").style.display = "none";
    return;
  }

  document.getElementById("chart-section").style.display = "block";
  var dayCount  = dates.length;
  var bossCount = allBosses.filter(function(b){ return b.done && b.date; }).length;
  document.getElementById("chart-subtitle").textContent =
  "— " + dayCount + (dayCount === 1 ? " Tag, " : " Tage, ") + bossCount + (bossCount === 1 ? " Boss erledigt" : " Bosse erledigt");

  var counts  = dates.map(function(d) { return byDate[d].length; });
  var bossList = dates.map(function(d) { return byDate[d]; });

  var ctx = document.getElementById("boss-chart").getContext("2d");

  if (chartInstance) { chartInstance.destroy(); }

  chartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: dates,
      datasets: [{
        label: "Bosse besiegt",
        data: counts,
        backgroundColor: "rgba(201, 164, 74, 0.35)",
        borderColor: "rgba(201, 164, 74, 0.85)",
        borderWidth: 1,
        borderRadius: 4,
        hoverBackgroundColor: "rgba(227, 184, 115, 0.5)",
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(14, 11, 7, 0.97)",
          borderColor: "rgba(201, 164, 74, 0.4)",
          borderWidth: 1,
          titleColor: "#e3b873",
          bodyColor: "#e6dcc8",
          titleFont: { family: "Cinzel, serif", size: 12 },
          bodyFont: { family: "Crimson Pro, Georgia, serif", size: 13 },
          padding: 12,
          callbacks: {
            title: function(items) { return items[0].label; },
            label: function(item) {
              var list = bossList[item.dataIndex];
              return ["† " + list.length + " Boss" + (list.length > 1 ? "e" : "") + ":"]
                .concat(list.map(function(n){ return "  · " + n; }));
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#a89880",
            font: { family: "Crimson Pro, serif", size: 12 }
          },
          grid: { color: "rgba(201,164,74,0.07)" }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "#a89880",
            stepSize: 1,
            font: { family: "Cinzel, serif", size: 11 }
          },
          grid: { color: "rgba(201,164,74,0.07)" }
        }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIP HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function parseTwitchClip(url) {
  if (!url || typeof url !== "string") return null;
  url = url.trim();

  var m = url.match(/clips\.twitch\.tv\/([A-Za-z0-9_\-]+)/);
  if (m) return { type: "clip", slug: m[1], original: url };

  m = url.match(/twitch\.tv\/[^/]+\/clip\/([A-Za-z0-9_\-]+)/);
  if (m) return { type: "clip", slug: m[1], original: url };

  m = url.match(/twitch\.tv\/videos\/(\d+)/);
  if (m) return { type: "vod", id: m[1], original: url };

  if (!url.includes("/") && url.length > 4) return { type: "clip", slug: url, original: url };

  return { type: "link", original: url };
}

function buildEmbedUrl(parsed) {
  var parent = window.location.hostname || "localhost";
  if (!parsed) return null;
  if (parsed.type === "clip") {
    return "https://clips.twitch.tv/embed?clip=" + parsed.slug + "&parent=" + parent;
  }
  if (parsed.type === "vod") {
    return "https://player.twitch.tv/?video=" + parsed.id + "&parent=" + parent;
  }
  return null;
}

// Lazy Loading: ersetzt den Platzhalter durch den echten Twitch-iframe (erst bei Klick).
function loadClipEmbed(wrapperEl) {
  var embedUrl = wrapperEl.getAttribute("data-embed-url");
  var index    = wrapperEl.getAttribute("data-clip-index");
  if (!embedUrl) return;

  var iframe = document.createElement("iframe");
  iframe.src = embedUrl + "&autoplay=true&muted=false";
  iframe.allowFullscreen = true;
  iframe.setAttribute("scrolling", "no");
  iframe.setAttribute("allow", "autoplay; fullscreen");
  iframe.title = "Clip " + (parseInt(index, 10) + 1);

  wrapperEl.removeAttribute("onclick");
  wrapperEl.classList.remove("clip-lazy");
  wrapperEl.innerHTML = "";
  wrapperEl.appendChild(iframe);
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIP DATUM-FILTER
// ═══════════════════════════════════════════════════════════════════════════

function setClipDateFilter(f) {
  clipDateFilter = f;
  document.querySelectorAll(".clip-date-btn").forEach(function(btn) {
    btn.classList.toggle("active", btn.dataset.filter === f);
  });
  var rangeEl = document.getElementById("clip-date-range");
  if (rangeEl) rangeEl.style.display = (f === "custom") ? "flex" : "none";
  if (f !== "custom") {
    clipDateFrom = null;
    clipDateTo   = null;
  }
  if (document.getElementById("clip-modal").classList.contains("open")) {
    renderClipModal();
  }
}

function applyCustomDateFilter() {
  var fromEl = document.getElementById("clip-date-from");
  var toEl   = document.getElementById("clip-date-to");
  clipDateFrom = fromEl && fromEl.value ? new Date(fromEl.value) : null;
  clipDateTo   = toEl   && toEl.value   ? new Date(toEl.value + "T23:59:59") : null;
  if (document.getElementById("clip-modal").classList.contains("open")) {
    renderClipModal();
  }
}

function getFilteredClips() {
  if (clipDateFilter === "all") return clipsData;
  var now = new Date();
  var from, to;
  if (clipDateFilter === "today") {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    to   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  } else if (clipDateFilter === "7d") {
    from = new Date(now - 7 * 24 * 60 * 60 * 1000);
  } else if (clipDateFilter === "30d") {
    from = new Date(now - 30 * 24 * 60 * 60 * 1000);
  } else if (clipDateFilter === "custom") {
    from = clipDateFrom;
    to   = clipDateTo;
  }
  return clipsData.filter(function(c) {
    if (!c.addedAt) return false;
    var d = new Date(c.addedAt);
    if (isNaN(d)) return false;
    if (from && d < from) return false;
    if (to   && d > to  ) return false;
    return true;
  });
}

function formatClipDate(iso) {
  if (!iso) return "";
  var d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("de-DE", {
    day:      "2-digit",
    month:    "2-digit",
    year:     "numeric",
    timeZone: "Europe/Berlin"
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIP MODAL
// ═══════════════════════════════════════════════════════════════════════════

function openClipModal() {
  document.getElementById("clip-backdrop").classList.add("open");
  document.getElementById("clip-modal").classList.add("open");
  document.body.style.overflow = "hidden";

  // Immer im Grid-Modus starten, damit UI-Zustand (Tabs/Filter/Toggle) konsistent bleibt.
  clipViewMode = 'grid';
  var toggleBtn = document.getElementById("clip-view-toggle");
  var tabsEl    = document.getElementById("clip-tabs");
  var filterEl  = document.getElementById("clip-date-filter");
  var bodyEl    = document.getElementById("clip-body");
  var reelsEl   = document.getElementById("clip-reels");
  if (toggleBtn) toggleBtn.classList.remove("active");
  if (tabsEl)   tabsEl.style.display   = "";
  if (filterEl) filterEl.style.display = "";
  if (bodyEl)   bodyEl.style.display   = "";
  if (reelsEl) { reelsEl.style.display = "none"; reelsEl.innerHTML = ""; }

  renderClipModal();
}

function closeClipModal() {
  document.getElementById("clip-backdrop").classList.remove("open");
  document.getElementById("clip-modal").classList.remove("open");
  document.body.style.overflow = "";
  teardownClipReelsObserver();
}

function toggleClipViewMode() {
  clipViewMode = (clipViewMode === 'grid') ? 'reels' : 'grid';
  var toggleBtn = document.getElementById("clip-view-toggle");
  var tabsEl    = document.getElementById("clip-tabs");
  var filterEl  = document.getElementById("clip-date-filter");
  var bodyEl    = document.getElementById("clip-body");
  var reelsEl   = document.getElementById("clip-reels");

  if (clipViewMode === 'reels') {
    toggleBtn.classList.add("active");
    toggleBtn.querySelector(".clip-view-toggle-icon").textContent = "▤";
    toggleBtn.setAttribute("data-tip", "Raster-Ansicht");
    tabsEl.style.display   = "none";
    filterEl.style.display = "none";
    bodyEl.style.display   = "none";
    reelsEl.style.display  = "flex";
    renderClipReels();
  } else {
    toggleBtn.classList.remove("active");
    toggleBtn.querySelector(".clip-view-toggle-icon").textContent = "▤";
    toggleBtn.setAttribute("data-tip", "Reel-Modus");
    tabsEl.style.display   = "";
    filterEl.style.display = "";
    bodyEl.style.display   = "";
    reelsEl.style.display  = "none";
    teardownClipReelsObserver();
    reelsEl.innerHTML = "";
  }
}

function renderClipModal() {
  var tabsEl = document.getElementById("clip-tabs");
  var bodyEl = document.getElementById("clip-body");
  var loadEl = document.getElementById("clip-modal-loading");

  if (clipsData.length === 0) {
    if (loadEl) loadEl.style.display = "flex";
    tabsEl.innerHTML = "";
    bodyEl.innerHTML = '<div class="clip-empty"><span class="clip-empty-icon">🎬</span><span>Noch keine Clips vorhanden.</span></div>';
    return;
  }

  if (loadEl) loadEl.style.display = "none";

  var filtered = getFilteredClips();

  if (filtered.length === 0) {
    tabsEl.innerHTML = "";
    var filterLabel = { "today": "heute", "7d": "in den letzten 7 Tagen", "30d": "in den letzten 30 Tagen", "custom": "in diesem Zeitraum" }[clipDateFilter] || "";
    bodyEl.innerHTML = '<div class="clip-empty"><span class="clip-empty-icon">📅</span><span>Keine Clips ' + filterLabel + ' vorhanden.</span></div>';
    return;
  }

  var categories = {};
  filtered.forEach(function(c) {
    var cat = c.category || "Sonstige";
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(c);
  });

  var catNames = Object.keys(categories);
  if (!activeCategory || !categories[activeCategory]) {
    activeCategory = catNames[0];
  }

  tabsEl.innerHTML = catNames.map(function(cat) {
    return '<button class="clip-tab' + (cat === activeCategory ? " active" : "") + '"'
      + ' onclick="switchClipTab(\'' + escAttr(cat) + '\')">'
      + escHtml(cat)
      + '<span class="tab-count">' + categories[cat].length + '</span>'
      + '</button>';
  }).join("");

  bodyEl.innerHTML = catNames.map(function(cat) {
    return '<div class="clip-category-section' + (cat === activeCategory ? " active" : "") + '" data-category="' + escAttr(cat) + '">'
      + '<div class="clip-grid">'
      + categories[cat].map(function(c, i) { return renderClipCard(c, i); }).join("")
      + '</div></div>';
  }).join("");

  if (clipViewMode === 'reels') {
    renderClipReels();
  }
}

// ── REEL-MODUS: vertikales Durchscrollen, ein Clip pro Bildschirm ──────────

function renderClipReels() {
  var reelsEl = document.getElementById("clip-reels");
  var filtered = getFilteredClips();

  teardownClipReelsObserver();

  reelsEl.innerHTML = filtered.map(function(c, i) {
    return renderClipReelSlide(c, i);
  }).join("");

  setupClipReelsObserver();
}

function renderClipReelSlide(clip, index) {
  var parsed   = parseTwitchClip(clip.url);
  var embedUrl = buildEmbedUrl(parsed);
  var linkUrl  = clip.url;

  var mediaHtml = embedUrl
    ? '<div class="clip-reel-media" data-embed-url="' + escAttr(embedUrl) + '" data-clip-index="' + index + '" data-muted="' + (reelSoundPreferred ? "0" : "1") + '">'
      + '<div class="clip-reel-media-inner"></div>'
      + '<button class="clip-reel-mute" onclick="toggleReelMute(this)" data-tip="Ton ein/aus" data-tip-always="1">'
      + '<span class="clip-reel-mute-icon">' + (reelSoundPreferred ? "🔊" : "🔇") + '</span></button>'
      + '</div>'
    : '<div class="clip-reel-media">'
      + '<div class="clip-placeholder" onclick="window.open(\'' + escAttr(linkUrl) + '\',\'_blank\')">'
      + '<span class="clip-placeholder-icon">▶️</span>'
      + '<span class="clip-placeholder-text">Clip öffnen</span>'
      + '</div></div>';

  return '<div class="clip-reel-slide" data-reel-index="' + index + '">'
    + mediaHtml
    + '<div class="clip-reel-info">'
    + (clip.title ? '<p class="clip-reel-title">' + escHtml(clip.title) + '</p>' : '')
    + '<div class="clip-reel-meta">'
    + '<span class="clip-reel-category">' + escHtml(clip.category || "Sonstige") + '</span>'
    + (clip.boss ? '<span class="clip-reel-boss">🎮 ' + escHtml(clip.boss) + '</span>' : '')
    + (clip.creatorName ? '<span class="clip-reel-creator">✂ ' + escHtml(clip.creatorName) + '</span>' : '')
    + (clip.addedAt ? '<span class="clip-reel-date">📅 ' + formatClipDate(clip.addedAt) + '</span>' : '')
    + '</div></div>'
    + '<a href="' + escAttr(linkUrl) + '" target="_blank" rel="noopener" class="clip-reel-open" data-tip="Auf Twitch öffnen" data-tip-always="1">'
    + '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42L17.59 5H14V3zM5 5h6v2H7v10h10v-4h2v6H5V5z"/></svg>'
    + '</a></div>';
}

// Schaltet Ton eines Reels per Klick um (lädt den Player mit neuer "muted"-Einstellung neu).
function toggleReelMute(btnEl) {
  var media = btnEl.closest(".clip-reel-media[data-embed-url]");
  var inner = media && media.querySelector(".clip-reel-media-inner");
  if (!media || !inner) return;

  var isMuted = media.getAttribute("data-muted") !== "0";
  var newMuted = !isMuted;
  media.setAttribute("data-muted", newMuted ? "1" : "0");
  reelSoundPreferred = !newMuted; // merken für alle danach automatisch ladenden Reel-Clips

  var icon = btnEl.querySelector(".clip-reel-mute-icon");
  if (icon) icon.textContent = newMuted ? "🔇" : "🔊";

  var embedUrl = media.getAttribute("data-embed-url");
  var index    = media.getAttribute("data-clip-index");
  var iframe = document.createElement("iframe");
  iframe.src = embedUrl + "&autoplay=true&muted=" + (newMuted ? "true" : "false");
  iframe.allowFullscreen = true;
  iframe.setAttribute("scrolling", "no");
  iframe.setAttribute("allow", "autoplay; fullscreen");
  iframe.title = "Clip " + (parseInt(index, 10) + 1);
  inner.innerHTML = "";
  inner.appendChild(iframe);
}

function setupClipReelsObserver() {
  var reelsEl = document.getElementById("clip-reels");
  if (!reelsEl || !("IntersectionObserver" in window)) return;

  clipReelsTimers = new Map();

  function activateSlide(slide) {
    var media = slide.querySelector(".clip-reel-media[data-embed-url]");
    var inner = media && media.querySelector(".clip-reel-media-inner");
    if (!media || !inner || inner.querySelector("iframe")) return;

    // Immer die aktuell gültige, globale Ton-Präferenz verwenden (nicht den Stand von beim Rendern).
    var muted = !reelSoundPreferred;
    media.setAttribute("data-muted", muted ? "1" : "0");
    var iconEl = slide.querySelector(".clip-reel-mute-icon");
    if (iconEl) iconEl.textContent = muted ? "🔇" : "🔊";

    var embedUrl = media.getAttribute("data-embed-url");
    var index    = media.getAttribute("data-clip-index");
    var iframe = document.createElement("iframe");
    iframe.src = embedUrl + "&autoplay=true&muted=" + (muted ? "true" : "false");
    iframe.allowFullscreen = true;
    iframe.setAttribute("scrolling", "no");
    iframe.setAttribute("allow", "autoplay; fullscreen");
    iframe.title = "Clip " + (parseInt(index, 10) + 1);
    inner.appendChild(iframe);
  }

  function deactivateSlide(slide) {
    var media = slide.querySelector(".clip-reel-media[data-embed-url]");
    var inner = media && media.querySelector(".clip-reel-media-inner");
    if (inner) inner.innerHTML = "";
  }

  clipReelsObserver = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      var slide = entry.target;

      // Laufenden Timer für diese Slide abbrechen (verhindert Flackern bei schnellem Scrollen).
      if (clipReelsTimers.has(slide)) {
        clearTimeout(clipReelsTimers.get(slide));
        clipReelsTimers.delete(slide);
      }

      if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
        // Kurze Verzögerung, damit Scroll-Snap sich setzt, bevor der Player geladen/gestartet wird.
        clipReelsTimers.set(slide, setTimeout(function() { activateSlide(slide); }, 180));
      } else {
        clipReelsTimers.set(slide, setTimeout(function() { deactivateSlide(slide); }, 180));
      }
    });
  }, { root: reelsEl, threshold: [0, 0.6] });

  reelsEl.querySelectorAll(".clip-reel-slide").forEach(function(slide) {
    clipReelsObserver.observe(slide);
  });
}

function teardownClipReelsObserver() {
  if (clipReelsTimers) {
    clipReelsTimers.forEach(function(t) { clearTimeout(t); });
    clipReelsTimers = null;
  }
  if (clipReelsObserver) {
    clipReelsObserver.disconnect();
    clipReelsObserver = null;
  }
}

function switchClipTab(cat) {
  activeCategory = cat;
  document.querySelectorAll(".clip-tab").forEach(function(btn) {
    var label = btn.childNodes[0] ? btn.childNodes[0].textContent.trim() : "";
    btn.classList.toggle("active", label === cat);
  });
  document.querySelectorAll(".clip-category-section").forEach(function(sec) {
    sec.classList.toggle("active", sec.dataset.category === cat);
  });
  document.getElementById("clip-body").scrollTop = 0;
}

function renderClipCard(clip, index) {
  var parsed   = parseTwitchClip(clip.url);
  var embedUrl = buildEmbedUrl(parsed);
  var linkUrl  = clip.url;
  var embedHtml;

  if (embedUrl) {
    // Lazy Loading: iframe wird erst bei Klick eingesetzt, nicht beim Rendern der Liste.
    embedHtml = '<div class="clip-embed-wrapper clip-lazy" data-embed-url="' + escAttr(embedUrl) + '" data-clip-index="' + index + '" onclick="loadClipEmbed(this)">'
      + '<div class="clip-lazy-thumb">'
      + '<span class="clip-lazy-play">▶</span>'
      + '</div></div>';
  } else {
    embedHtml = '<div class="clip-embed-wrapper">'
      + '<div class="clip-placeholder" onclick="window.open(\'' + escAttr(linkUrl) + '\',\'_blank\')">'
      + '<span class="clip-placeholder-icon">▶️</span>'
      + '<span class="clip-placeholder-text">Clip öffnen</span>'
      + '</div></div>';
  }

  var titleHtml = clip.title
    ? '<p class="clip-title">' + escHtml(clip.title) + '</p>'
    : '';

  var bossEditHtml = '';
  if (isAuthorized()) {
    bossEditHtml = '<div class="clip-boss-row">'
      + '<label>Boss:</label>'
      + '<select class="clip-boss-select" onchange="updateClipBoss(\'' + escAttr(clip.url) + '\',this.value)">'
      + getBossOptions(clip.boss || "")
      + '</select>'
      + '</div>';
  } else if (clip.boss) {
    bossEditHtml = '<div class="clip-boss-label">🎮 ' + escHtml(clip.boss) + '</div>';
  }

  return '<div class="clip-card">'
    + embedHtml
    + '<div class="clip-card-footer">'
    + titleHtml
    + '<div class="clip-card-footer-row">'
    + '<span class="clip-number">Clip ' + String(index + 1).padStart(2, "0") + '</span>'
    + (clip.addedAt ? '<span class="clip-date">📅 ' + formatClipDate(clip.addedAt) + '</span>' : '')
    + (clip.creatorName ? '<span class="clip-creator">✂ ' + escHtml(clip.creatorName) + '</span>' : '')
    + '<a href="' + escAttr(linkUrl) + '" target="_blank" rel="noopener" class="clip-open-link">'
    + '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42L17.59 5H14V3zM5 5h6v2H7v10h10v-4h2v6H5V5z"/></svg>'
    + 'Auf Twitch</a>'
    + '</div>'
    + '</div>'
    + bossEditHtml
    + '</div>';
}

// ═══════════════════════════════════════════════════════════════════════════
// ADD CLIP (Editor only)
// ═══════════════════════════════════════════════════════════════════════════

var addClipPanelOpen = false;

function toggleAddClipPanel() {
  addClipPanelOpen = !addClipPanelOpen;
  var panel = document.getElementById("add-clip-panel");
  var btn   = document.getElementById("add-clip-btn");
  panel.classList.toggle("open", addClipPanelOpen);
  btn.classList.toggle("active", addClipPanelOpen);
  if (addClipPanelOpen) {
    var bossSelect = document.getElementById("clip-boss-select");
    if (bossSelect && bossSelect.options.length <= 1) {
      Array.from(MAIN_BOSSES).sort().forEach(function(b) {
        var opt = document.createElement("option");
        opt.value = b; opt.textContent = b;
        bossSelect.appendChild(opt);
      });
    }
    setTimeout(function() {
      var inp = document.getElementById("clip-url-input");
      if (inp) inp.focus();
    }, 360);
  }
  document.getElementById("add-clip-feedback").textContent = "";
}

function submitNewClip() {
  if (!isAuthorized()) return;

  var urlEl     = document.getElementById("clip-url-input");
  var catEl     = document.getElementById("clip-cat-select");
  var titleEl   = document.getElementById("clip-title-input");
  var bossEl    = document.getElementById("clip-boss-select");
  var feedEl    = document.getElementById("add-clip-feedback");
  var submitBtn = document.getElementById("add-clip-submit");

  var url      = urlEl.value.trim();
  var category = catEl.value;
  var title    = titleEl.value.trim();
  var boss     = bossEl ? bossEl.value : "";

  feedEl.className = "add-clip-feedback";
  if (!url) {
    feedEl.textContent = "⚠ Bitte einen Twitch-Link eingeben.";
    feedEl.classList.add("error");
    urlEl.focus();
    return;
  }
  var parsed = parseTwitchClip(url);
  if (!parsed || parsed.type === "link") {
    feedEl.textContent = "⚠ Kein gültiger Twitch-Clip- oder VOD-Link erkannt.";
    feedEl.classList.add("error");
    urlEl.focus();
    return;
  }

  var isDupe = clipsData.some(function(c) { return c.url.trim() === url; });
  if (isDupe) {
    feedEl.textContent = "⚠ Dieser Clip ist bereits in der Sammlung.";
    feedEl.classList.add("error");
    return;
  }

  feedEl.textContent = "⏳ Clip-Datum wird abgerufen…";

  fetchTwitchClipData(parsed.slug).then(function(clipData) {
    var newClip = { url: url, category: category, title: title, boss: boss, addedAt: clipData.addedAt, creatorName: clipData.creatorName };
    clipsData.push(newClip);
    rebuildClipsByBoss();

    var countEl = document.getElementById("btn-clips-count");
    if (countEl) countEl.textContent = "(" + clipsData.length + ")";
    var modalCount = document.getElementById("modal-clip-count");
    if (modalCount) modalCount.textContent = clipsData.length;

    activeCategory = category;
    renderClipModal();

    feedEl.textContent = "✔ Clip gespeichert – wird gleich im Sheet hinterlegt.";
    urlEl.value   = "";
    titleEl.value = "";
    catEl.value   = "Allgemein";
    if (bossEl) bossEl.value = "";

    setTimeout(function() {
      addClipPanelOpen = false;
      var panel = document.getElementById("add-clip-panel");
      var btn   = document.getElementById("add-clip-btn");
      if (panel) panel.classList.remove("open");
      if (btn)   btn.classList.remove("active");
      var fb = document.getElementById("add-clip-feedback");
      if (fb) fb.textContent = "";
    }, 2200);

    writeClipToSheet(url, category, title, boss, clipData.addedAt, clipData.creatorName);
  });
}

function writeClipToSheet(url, category, title, boss, addedAt, creatorName, area) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === "DEINE_APPS_SCRIPT_URL_HIER") {
    console.warn("[Clips] Apps Script URL nicht konfiguriert – Clip nur lokal.");
    return;
  }
  var bossEncoded = (area && area.length > 0) ? area + "|" + boss : boss;
  var reqUrl = APPS_SCRIPT_URL
    + "?action=addClip"
    + "&value="       + encodeURIComponent(url)
    + "&category="    + encodeURIComponent(category)
    + "&title="       + encodeURIComponent(title)
    + "&boss="        + encodeURIComponent(bossEncoded)
    + "&addedAt="     + encodeURIComponent(addedAt || getNowISO())
    + "&creatorName=" + encodeURIComponent(creatorName || "")
    + "&twitchToken="  + encodeURIComponent(getTwitchToken());
  fetch(reqUrl, { method: "GET", mode: "no-cors" })
    .catch(function(err) { console.error("[Clips] Schreibfehler:", err); });
}

function getNowISO() {
  var d   = new Date();
  var off = -d.getTimezoneOffset();
  var sign = off >= 0 ? "+" : "-";
  var hh   = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  var mm   = String(Math.abs(off) % 60).padStart(2, "0");
  var local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, -1) + sign + hh + ":" + mm;
}

// ═══════════════════════════════════════════════════════════════════════════
// BOSS CLIPS
// ═══════════════════════════════════════════════════════════════════════════

function rebuildClipsByBoss() {
  clipsByBoss = {};
  clipsData.forEach(function(c) {
    if (c.boss) {
      var key = (c.area && c.area.length > 0) ? c.area + "|" + c.boss : c.boss;
      if (!clipsByBoss[key]) clipsByBoss[key] = [];
      clipsByBoss[key].push(c);
    }
  });
}

function getBossOptions(selectedBoss) {
  var opts = '<option value="">– Kein Boss –</option>';
  Array.from(MAIN_BOSSES).sort().forEach(function(b) {
    opts += '<option value="' + escAttr(b) + '"' + (b === selectedBoss ? ' selected' : '') + '>' + escHtml(b) + '</option>';
  });
  return opts;
}

function openBossClipsPanel(bossName, areaName, e) {
  if (e) e.stopPropagation();
  var bossKey = (areaName && areaName.length > 0) ? areaName + "|" + bossName : bossName;
  var clips = (clipsByBoss[bossKey] || []).concat(clipsByBoss[bossName] || []);
  clips = clips.filter(function(c, i, arr) { return arr.findIndex(function(x) { return x.url === c.url; }) === i; });
  if (clips.length === 0) return;

  document.getElementById("boss-clips-heading").textContent = bossName;
  document.getElementById("boss-clips-badge").textContent =
    clips.length + (clips.length === 1 ? " Clip" : " Clips");

  var body = document.getElementById("boss-clips-body");
  body.innerHTML = '<div class="clip-grid">'
    + clips.map(function(c, i) { return renderClipCard(c, i); }).join("")
    + '</div>';

  document.getElementById("boss-clips-backdrop").classList.add("open");
  document.getElementById("boss-clips-modal").classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeBossClipsPanel() {
  document.getElementById("boss-clips-backdrop").classList.remove("open");
  document.getElementById("boss-clips-modal").classList.remove("open");
  if (!document.getElementById("clip-modal").classList.contains("open")) {
    document.body.style.overflow = "";
  }
}

function updateClipBoss(clipUrl, newBoss) {
  var clip = clipsData.find(function(c) { return c.url === clipUrl; });
  if (!clip) return;

  var oldBoss = clip.boss || "";
  var oldArea = clip.area || "";
  clip.boss = newBoss;
  clip.area = "";
  rebuildClipsByBoss();

  var panel = document.getElementById("boss-clips-modal");
  if (panel && panel.classList.contains("open")) {
    var heading  = document.getElementById("boss-clips-heading");
    var panelBoss = heading ? heading.textContent : "";
    if (panelBoss === oldBoss || panelBoss === newBoss) {
      var panelKey = oldArea ? oldArea + "|" + panelBoss : panelBoss;
      var clips = (clipsByBoss[panelKey] || []).concat(clipsByBoss[panelBoss] || []);
      clips = clips.filter(function(c, i, arr) { return arr.findIndex(function(x) { return x.url === c.url; }) === i; });
      var body  = document.getElementById("boss-clips-body");
      var badge = document.getElementById("boss-clips-badge");
      if (clips.length === 0) {
        closeBossClipsPanel();
      } else {
        badge.textContent = clips.length + (clips.length === 1 ? " Clip" : " Clips");
        body.innerHTML = '<div class="clip-grid">'
          + clips.map(function(c, i) { return renderClipCard(c, i); }).join("")
          + '</div>';
      }
    }
  }

  if (document.getElementById("clip-modal").classList.contains("open")) {
    renderClipModal();
  }

  renderFromCache();

  writeBossTagToSheet(clipUrl, newBoss);
  showToast(newBoss ? "🎮 Boss gesetzt: " + newBoss : "Boss-Zuordnung entfernt", 2500);
}

function writeBossTagToSheet(clipUrl, boss) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === "DEINE_APPS_SCRIPT_URL_HIER") return;
  var reqUrl = APPS_SCRIPT_URL
    + "?action=setBossTag"
    + "&value=" + encodeURIComponent(clipUrl)
    + "&boss="  + encodeURIComponent(boss || "")
    + "&twitchToken=" + encodeURIComponent(getTwitchToken());
  fetch(reqUrl, { method: "GET", mode: "no-cors" })
    .catch(function(err) { console.error("[Clips] BossTag Schreibfehler:", err); });
}

function updateAddClipButton() {
  var btn = document.getElementById("add-clip-btn");
  if (!btn) return;
  if (isAuthorized()) {
    btn.classList.add("editor-visible");
  } else {
    btn.classList.remove("editor-visible");
    if (addClipPanelOpen) toggleAddClipPanel();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIPS LADEN
// ═══════════════════════════════════════════════════════════════════════════

function loadClips() {
  fetch(CLIPS_URL + "&nocache=" + Date.now())
    .then(function(res) { return res.text(); })
    .then(function(text) {
      var json = JSON.parse(text.substring(47).slice(0, -2));
      var rows = json.table.rows;
      var newClips = [];

      rows.forEach(function(row) {
        if (!row || !row.c) return;
        var url         = row.c[0] && row.c[0].v ? String(row.c[0].v).trim() : "";
        var category    = row.c[1] && row.c[1].v ? String(row.c[1].v).trim() : "Sonstige";
        var title       = row.c[2] && row.c[2].v ? String(row.c[2].v).trim() : "";
        var bossRaw     = row.c[3] && row.c[3].v ? String(row.c[3].v).trim() : "";
        var addedAt     = row.c[4] && row.c[4].v ? String(row.c[4].v).trim() : "";
        var creatorName = row.c[5] && row.c[5].v ? String(row.c[5].v).trim() : "";
        var areaParsed  = "";
        var bossParsed  = bossRaw;
        var pipeIdx = bossRaw.indexOf("|");
        if (pipeIdx > 0) {
          areaParsed = bossRaw.substring(0, pipeIdx);
          bossParsed = bossRaw.substring(pipeIdx + 1);
        }
        if (url) newClips.push({ url: url, category: category, title: title, boss: bossParsed, area: areaParsed, addedAt: addedAt, creatorName: creatorName });
      });

      var clipsChanged = JSON.stringify(newClips) !== JSON.stringify(clipsData);
      if (clipsChanged) {
        clipsData = newClips;
        rebuildClipsByBoss();
        renderFromCache();

        var countEl = document.getElementById("btn-clips-count");
        if (countEl) countEl.textContent = clipsData.length > 0 ? "(" + clipsData.length + ")" : "";

        var modalCount = document.getElementById("modal-clip-count");
        if (modalCount) modalCount.textContent = clipsData.length;

        if (document.getElementById("clip-modal").classList.contains("open")) {
          renderClipModal();
        }
      }
    })
    .catch(function(err) { console.error("[Clips] Fehler:", err); });
}

// ═══════════════════════════════════════════════════════════════════════════
// HAUPT-DATEN LADEN
// ═══════════════════════════════════════════════════════════════════════════

function setRefreshState(state) {
  var dot  = document.getElementById("refresh-dot");
  var text = document.getElementById("refresh-text");
  if (state === "loading") {
    dot.className = "refresh-dot loading";
    text.textContent = "Lade…";
  } else if (state === "ok") {
    dot.className = "refresh-dot";
    var now = new Date();
    text.textContent = "Zuletzt: " + now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } else {
    dot.style.background = "#c44a3a";
    text.textContent = "Verbindungsfehler";
  }
}

function loadData() {
  setRefreshState("loading");
  fetch(SHEET_URL + "&nocache=" + Date.now())
    .then(function(res) { return res.text(); })
    .then(function(text) {
      var json = JSON.parse(text.substring(47).slice(0, -2));
      var rows = json.table.rows;
      processData(rows);
      setRefreshState("ok");
      document.getElementById("loading-overlay").style.display = "none";
      document.getElementById("areas-grid").style.display      = "grid";
    })
    .catch(function(err) {
      console.error("[Main] Fehler beim Laden:", err);
      setRefreshState("error");
    });
}

function processData(rows) {
  cachedRows = rows;
  if (isAuthorized()) {
    // GEÄNDERT: J→K, 0-basiert: 9→10
    var fdBase = rows[1]   && rows[1].c[10]   ? (Number(rows[1].c[10].v)   || 0) : 0;
    var fdDlc  = rows[168] && rows[168].c[10] ? (Number(rows[168].c[10].v) || 0) : 0;
    if (!fieldDeathsTimer.base && Date.now() - fieldDeathsPending.base > FIELD_DEATHS_GRACE) { fieldDeaths.base = fdBase; document.getElementById("fdeath-val-base").textContent = fdBase; }
    if (!fieldDeathsTimer.dlc  && Date.now() - fieldDeathsPending.dlc  > FIELD_DEATHS_GRACE) { fieldDeaths.dlc  = fdDlc;  document.getElementById("fdeath-val-dlc").textContent  = fdDlc; }
    document.getElementById("field-deaths-bar").style.display = "flex";
  } else {
    document.getElementById("field-deaths-bar").style.display = "none";
  }
  // GEÄNDERT: Q→R, 0-basiert: 16→17
  var baseGameFlag = isTrue(rows[0] && rows[0].c[17] ? rows[0].c[17].v : false);
  var dlcFlag      = isTrue(rows[1] && rows[1].c[17] ? rows[1].c[17].v : false);

  if (prevDeaths === null) {
    showBase = baseGameFlag;
    showDLC  = dlcFlag;
    document.getElementById("btn-basegame").classList.toggle("active", showBase);
    document.getElementById("btn-dlc").classList.toggle("active", showDLC);
    updateFieldDeathsVisibility();
  }

  // Only overwrite local timer state if no recent toolbox action (10s grace period)
  if (!pendingLocalTimer || Date.now() - pendingLocalTimer > 10000) {
    pendingLocalTimer = 0;
    // GEÄNDERT: W→X, 0-basiert: 22→23
    timerStartTs = Number(rows[0] && rows[0].c[23] ? rows[0].c[23].v : 0) || 0;
    timerElapsed = Number(rows[2] && rows[2].c[23] ? rows[2].c[23].v : 0) || 0;
    // GEÄNDERT: N→O, 0-basiert: 13→14
    timerVisible = isTrue(rows[0] && rows[0].c[14] ? rows[0].c[14].v : false);
  }
  // GEÄNDERT: M→N, 0-basiert: 12→13
  timerLabel = (rows[2] && rows[2].c[13] && rows[2].c[13].v)
    ? String(rows[2].c[13].v).trim()
    : "";
  updateTimerDisplay();
  if (timerStartTs > 0) startTimerTick(); else if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  toolboxSyncFromRows(rows);

  var separatorIndex = -1;
  for (var si = 0; si < rows.length; si++) {
    if (rows[si] && rows[si].c[1] && rows[si].c[1].v && rows[si].c[1].v.trim() === "SHADOW OF THE ERDTREE DLC") {
      separatorIndex = si;
      break;
    }
  }

  var areas     = {};
  var allBosses = [];

  rows.forEach(function(r, index) {
    if (!r || !r.c) return;
    var area = r.c[0] && r.c[0].v ? r.c[0].v.trim() : "";
    var boss = r.c[1] && r.c[1].v ? r.c[1].v.trim() : "";
    if (!area || !boss) return;
    if (area === "Gebiet" && boss === "Boss") return;
    if (boss === "SHADOW OF THE ERDTREE DLC") return;

    var isBaseGame = separatorIndex === -1 || index < separatorIndex;
    var isDLC      = separatorIndex !== -1  && index > separatorIndex;
    if (isBaseGame && !showBase) return;
    if (isDLC      && !showDLC)  return;
    if (showOnlyMain && !MAIN_BOSSES.has(boss)) return;

    var done           = isTrue(r.c[2] ? r.c[2].v : false);
    var date           = r.c[3] && r.c[3].f ? r.c[3].f.trim() : "";
    var deaths         = Number(r.c[4] ? r.c[4].v : 0) || 0;
    var pinned         = isTrue(r.c[5] ? r.c[5].v : false);
    // Spalte G (Index 6): Level beim Boss-Kill, z.B. "9" oder "9/2" (gleiche Level aufsteigend nummeriert)
    var level          = (r.c[6] && r.c[6].v !== null && r.c[6].v !== "") ? String(r.c[6].v).trim() : null;

    if (showOnlyDone && !done) return;
    if (showOnlyOpen && done) return;

    var pendingKey = area + "|" + boss;
    if (pendingLocalChanges[pendingKey]) {
      var age = Date.now() - pendingLocalChanges[pendingKey];
      if (age < PENDING_GRACE) {
        var localBoss = currentAreas[area] && currentAreas[area].bosses.find(function(b) { return b.boss === boss; });
        if (localBoss) {
          deaths = localBoss.deaths;
          done   = localBoss.done;
          pinned = localBoss.pinned;
        }
      } else {
        delete pendingLocalChanges[pendingKey];
      }
    }
    // GEÄNDERT: G→H, 0-basiert: 6→7
    var sheetCollapsed = isTrue(r.c[7] ? r.c[7].v : false);
    var key            = area + "|" + boss;

    if (!(key in previousBossStates)) {
      previousBossStates[key] = done;
    } else if (!previousBossStates[key] && done) {
      if (MAIN_BOSSES.has(boss)) showToast("✔ " + boss + " besiegt!");
    }
    previousBossStates[key] = done;

    if (!areas[area]) {
      var collapsed = (area in localCollapsed) ? localCollapsed[area] : sheetCollapsed;
      areas[area] = { total: 0, done: 0, bosses: [], collapsed: collapsed, isDLC: isDLC };
    }

    areas[area].total++;
    if (done) areas[area].done++;
    areas[area].bosses.push({ boss: boss, done: done, deaths: deaths, pinned: pinned, level: level });

    allBosses.push({ boss: boss, deaths: deaths, done: done, area: area, date: date, level: level, isDLC: isDLC });
  });

  // GEÄNDERT: K→L, 0-basiert: 10→11
  var kBase = rows[1]   && rows[1].c[11]   ? (Number(rows[1].c[11].v)   || 0) : 0;
  var kDlc  = rows[168] && rows[168].c[11] ? (Number(rows[168].c[11].v) || 0) : 0;
  var globalDeaths;
  if (showOnlyMain) {
    globalDeaths = allBosses.reduce(function(s, b) { return s + b.deaths; }, 0);
  } else if (showBase && showDLC)       globalDeaths = kBase + kDlc;
  else if (showBase && !showDLC) globalDeaths = kBase;
  else if (!showBase && showDLC) globalDeaths = kDlc;
  else                           globalDeaths = 0;

  if (prevDeaths !== null && globalDeaths !== prevDeaths) {
    pulseEl(document.getElementById("stat-deaths"));
    var el = document.getElementById("stat-deaths");
    el.classList.remove("death-flash");
    void el.offsetWidth;
    el.classList.add("death-flash");
  }
  document.getElementById("val-deaths").textContent = globalDeaths.toLocaleString("de-DE");
  prevDeaths = globalDeaths;

  currentAreas = areas;

  var totalBosses = 0, doneBosses = 0;
  Object.values(areas).forEach(function(a) { totalBosses += a.total; doneBosses += a.done; });

  if (prevDoneBosses !== null && doneBosses !== prevDoneBosses) {
    pulseEl(document.getElementById("stat-bosses"));
    pulseEl(document.getElementById("stat-percent"));
  }
  if (showOnlyDone || showOnlyOpen) {
    document.getElementById("val-bosses").textContent = totalBosses;
  } else {
    document.getElementById("val-bosses").textContent = doneBosses + " / " + totalBosses;
  }
  var pct = totalBosses > 0 ? Math.round((doneBosses / totalBosses) * 100) : 0;
  document.getElementById("val-percent").textContent = pct + "%";
  prevDoneBosses = doneBosses;

  document.getElementById("stat-percent").style.display = (showOnlyOpen || showOnlyDone) ? "none" : "";
  document.getElementById("stat-avg").style.display     = showOnlyOpen ? "none" : "";

  var rankingSnapshot = JSON.stringify(
    allBosses.map(function(b) { return b.boss + "|" + b.deaths + "|" + b.done; })
  );
  if (rankingSnapshot !== prevRankingSnapshot) {
    prevRankingSnapshot = rankingSnapshot;
    renderRanking(allBosses);
  }

  var chartSnapshot = JSON.stringify(
    allBosses.filter(function(b) { return b.done && b.date; })
      .map(function(b) { return b.boss + "|" + b.date; })
  );
  if (chartSnapshot !== prevChartSnapshot) {
    prevChartSnapshot = chartSnapshot;
    renderChart(allBosses);
  }

  // Levelübersicht aktualisieren (alle gefilterten Bosse mit Level)
  bossLevelData = allBosses;
  if (document.getElementById("boss-level-modal").classList.contains("open")) {
    renderBossLevelPanel();
  }

  renderAreas(areas);
}

function renderFromCache() {
  if (cachedRows) {
    processData(cachedRows);
  } else if (Object.keys(currentAreas).length > 0) {
    renderAreas(currentAreas);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER AREAS
// ═══════════════════════════════════════════════════════════════════════════

function renderAreas(areas) {
  var grid = document.getElementById("areas-grid");

  var allPinned = [];
  Object.keys(areas).forEach(function(areaName) {
    var a = areas[areaName];
    a.bosses.forEach(function(b) {
      if (b.pinned) allPinned.push(Object.assign({}, b, { area: areaName }));
    });
  });

  var pinnedSection = document.getElementById("pinned-section");
  var pinnedList    = document.getElementById("pinned-list");
  if (allPinned.length > 0) {
    pinnedSection.style.display = "block";
    pinnedList.innerHTML = "";
    allPinned.forEach(function(b) {
      var isMain    = MAIN_BOSSES.has(b.boss);
      var editClass = isAuthorized() ? " editable" : "";
      var card      = document.createElement("div");
      card.className    = "pinned-card" + (b.done ? " done" : "") + editClass;
      card.dataset.boss = b.boss;
      card.dataset.area = b.area;
      if (isAuthorized()) {
        card.addEventListener("click", function(e) {
          openBossMenu(e, b.area, b.boss);
        });
        card.addEventListener("touchend", function(e) {
          e.preventDefault();
          openBossMenu(e, b.area, b.boss);
        });
      }
      card.innerHTML = '<span class="pinned-deaths">📌 ' + (b.deaths > 0 ? b.deaths : "–") + '</span>'
        + '<span class="pinned-name' + (isMain ? " main-boss" : "") + '">' + escHtml(b.boss) + '</span>'
        + (isAuthorized() ? '<span class="boss-edit-hint" data-tip="Bearbeiten" data-tip-always="1">✏</span>' : '');
      pinnedList.appendChild(card);
    });
  } else {
    pinnedSection.style.display = "none";
  }

  var existingCards = {};
  grid.querySelectorAll(".area-card[data-area]").forEach(function(el) {
    existingCards[el.dataset.area] = el;
  });

  var newKeys = Object.keys(areas);
  Object.keys(existingCards).forEach(function(k) {
    if (!areas[k]) existingCards[k].remove();
  });

  newKeys.forEach(function(areaName, idx) {
    var data = areas[areaName];
    var card = existingCards[areaName];

    if (!card) {
      card = document.createElement("div");
      card.className  = "area-card";
      card.dataset.area = areaName;
    }

    if (!(areaName in localCollapsed)) localCollapsed[areaName] = data.collapsed;
    var collapsed = localCollapsed[areaName];
    card.classList.toggle("collapsed", collapsed);

    var pct      = data.total > 0 ? (data.done / data.total) * 100 : 0;
    var complete = data.done === data.total && data.total > 0;
    var dlcLabel = data.isDLC
      ? ' <span style="font-size:11px;color:var(--gold-dim);font-family:\'Crimson Pro\',serif;font-style:italic;">DLC</span>'
      : "";

    card.innerHTML = '<div class="area-header" onclick="toggleArea(\'' + escAttr(areaName) + '\')">'
      + '<div class="area-header-left">'
      + '<span class="area-toggle-icon">▼</span>'
      + '<span class="area-name" data-tip="' + escAttr(areaName) + '">' + escHtml(areaName) + dlcLabel + '</span>'
      + '</div>'
      + '<div class="area-progress-wrap">'
      + '<span class="area-fraction">' + data.done + '/' + data.total + '</span>'
      + '<div class="area-progress-bar">'
      + '<div class="area-progress-fill' + (complete ? " complete" : "") + '" style="width:' + pct + '%"></div>'
      + '</div></div></div>'
      + '<div class="boss-list">'
      + data.bosses.map(function(b) { return renderBossRow(b, areaName); }).join("")
      + '</div>';

    var children     = Array.from(grid.children);
    var currentIndex = children.indexOf(card);
    if (currentIndex !== idx) {
      if (idx >= grid.children.length) {
        grid.appendChild(card);
      } else {
        grid.insertBefore(card, grid.children[idx]);
      }
    }
  });

  if (searchQuery) applySearch();
}

function renderBossRow(b, areaName) {
  var isMain     = MAIN_BOSSES.has(b.boss);
  var deathClass = b.deaths === 0 ? " boss-deaths-zero" : "";
  var editClass  = isAuthorized() ? " editable" : "";

  var clickAttr = isAuthorized()
    ? ' onclick="openBossMenu(event,\'' + escAttr(areaName) + '\',\'' + escAttr(b.boss) + '\')"'
    : '';

  var ctxAttr = isAuthorized()
    ? ' oncontextmenu="openQuickClipMenu(event,\'' + escAttr(b.boss) + '\',\'' + escAttr(areaName) + '\')"'
    : '';

  var bossClipKey   = areaName + "|" + b.boss;
  var bossClipCount = ((clipsByBoss[bossClipKey] || []).length) + ((clipsByBoss[b.boss] || []).length);
  var clipBadge = bossClipCount > 0
    ? '<span class="boss-clip-badge" onclick="openBossClipsPanel(\'' + escAttr(b.boss) + '\',\'' + escAttr(areaName) + '\',event)" data-tip="' + bossClipCount + ' Clip' + (bossClipCount > 1 ? 's' : '') + ' ansehen" data-tip-always="1">🎬 ' + bossClipCount + '</span>'
    : '';

  return '<div class="boss-row' + (b.done ? " done" : "") + editClass + '"'
    + ' data-boss="' + escAttr(b.boss) + '"'
    + ' data-area="' + escAttr(areaName) + '"'
    + clickAttr + ctxAttr + '>'
    + '<span class="boss-deaths' + deathClass + '">' + (b.deaths > 0 ? "†" + b.deaths : "†–") + '</span>'
    + '<span class="boss-name' + (isMain ? " main" : "") + '" data-tip="' + escAttr(b.boss) + '">' + escHtml(b.boss) + '</span>'
    + clipBadge
    + '<span class="boss-check">✓</span>'
    + (isAuthorized() ? '<span class="boss-edit-hint" data-tip="Bearbeiten" data-tip-always="1">✏</span>' : '')
    + '</div>';
}

function toggleArea(areaName) {
  localCollapsed[areaName] = !localCollapsed[areaName];
  var card = document.querySelector('.area-card[data-area="' + CSS.escape(areaName) + '"]');
  if (card) card.classList.toggle("collapsed", localCollapsed[areaName]);
}

document.addEventListener("keydown", function(e) {
  if (e.key === "Enter" && addClipPanelOpen) {
    var active = document.activeElement;
    if (active && (active.id === "clip-url-input" || active.id === "clip-title-input" || active.id === "clip-cat-select")) {
      e.preventDefault();
      submitNewClip();
    }
  }
});

// ─── CUSTOM TOOLTIP ───
(function() {
  var tip = document.getElementById("custom-tooltip");
  var offset = 14;

  document.addEventListener("mouseover", function(e) {
    var el = e.target.closest("[data-tip]");
    if (!el) return;
    if (!el.dataset.tipAlways && el.scrollWidth <= el.offsetWidth) return;
    tip.textContent = el.dataset.tip;
    tip.classList.add("visible");
  });

  document.addEventListener("mouseout", function(e) {
    var el = e.target.closest("[data-tip]");
    if (!el) return;
    tip.classList.remove("visible");
  });

  document.addEventListener("mousemove", function(e) {
    if (!tip.classList.contains("visible")) return;
    var x = e.clientX + offset;
    var y = e.clientY + offset;
    if (x + tip.offsetWidth > window.innerWidth - 8) x = e.clientX - tip.offsetWidth - offset;
    if (y + tip.offsetHeight > window.innerHeight - 8) y = e.clientY - tip.offsetHeight - offset;
    tip.style.left = x + "px";
    tip.style.top  = y + "px";
  });
})();

// ═══════════════════════════════════════════════════════════════════════════
// BINGO
// ═══════════════════════════════════════════════════════════════════════════

function toggleBingoPanel() {
  bingoPanelCollapsed = !bingoPanelCollapsed;
  var panel = document.getElementById("bingo-panel");
  if (panel) panel.classList.toggle("collapsed", bingoPanelCollapsed);
}

function loadBingo() {
  fetch(BINGO_TEXT_URL + "&nocache=" + Date.now())
    .then(function(r) { return r.text(); })
    .then(function(text) {
      var json  = JSON.parse(text.substring(47).slice(0, -2));
      var rows  = (json.table && json.table.rows) ? json.table.rows : [];
      var cells = [];
      for (var r = 0; r < 5; r++) {
        var row = [];
        for (var c = 0; c < 5; c++) {
          var cell = (rows[r] && rows[r].c && rows[r].c[c]) ? rows[r].c[c] : null;
          row.push(cell && cell.v !== null && cell.v !== undefined ? String(cell.v).trim() : "");
        }
        cells.push(row);
      }
      var snap = JSON.stringify(cells);
      if (snap !== prevBingoTextSnap) {
        prevBingoTextSnap = snap;
        bingoCells = cells;
        renderBingo();
      }
    })
    .catch(function(e) { console.error("[Bingo] Text-Fehler:", e); });

  fetch(BINGO_STATE_URL + "&nocache=" + Date.now())
    .then(function(r) { return r.text(); })
    .then(function(text) {
      var json    = JSON.parse(text.substring(47).slice(0, -2));
      var rows    = (json.table && json.table.rows) ? json.table.rows : [];
      var checked = [];
      for (var r = 0; r < 5; r++) {
        var row = [];
        for (var c = 0; c < 5; c++) {
          var cell = (rows[r] && rows[r].c && rows[r].c[c]) ? rows[r].c[c] : null;
          row.push(isTrue(cell ? cell.v : null));
        }
        checked.push(row);
      }
      var snap = JSON.stringify(checked);
      if (snap !== prevBingoStateSnap) {
        prevBingoStateSnap = snap;
        bingoChecked = checked;
        renderBingo();
      }
    })
    .catch(function(e) { console.error("[Bingo] State-Fehler:", e); });
}

function getBingoWinLines() {
  var lines = [];
  var chk   = bingoChecked;
  function allChecked(coords) {
    return coords.every(function(rc) { return chk[rc[0]] && chk[rc[0]][rc[1]]; });
  }
  for (var r = 0; r < 5; r++) {
    if (allChecked([[r,0],[r,1],[r,2],[r,3],[r,4]])) lines.push([[r,0],[r,1],[r,2],[r,3],[r,4]]);
  }
  for (var c = 0; c < 5; c++) {
    if (allChecked([[0,c],[1,c],[2,c],[3,c],[4,c]])) lines.push([[0,c],[1,c],[2,c],[3,c],[4,c]]);
  }
  if (allChecked([[0,0],[1,1],[2,2],[3,3],[4,4]])) lines.push([[0,0],[1,1],[2,2],[3,3],[4,4]]);
  if (allChecked([[0,4],[1,3],[2,2],[3,1],[4,0]])) lines.push([[0,4],[1,3],[2,2],[3,1],[4,0]]);
  return lines;
}

function renderBingo() {
  var section  = document.getElementById("bingo-section");
  var grid     = document.getElementById("bingo-grid");
  var banner   = document.getElementById("bingo-win-banner");
  var subtitle = document.getElementById("bingo-subtitle");
  if (!section || !grid) return;

  section.style.display = "block";

  if (!bingoCells.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:30px;'
      + 'font-family:\'Crimson Pro\',serif;font-style:italic;color:var(--parchment-dim);opacity:0.5;">'
      + 'Bingo-Felder werden geladen…</div>';
    return;
  }

  var winLines = getBingoWinLines();
  var winCells = {};
  winLines.forEach(function(line) {
    line.forEach(function(rc) { winCells[rc[0] + "," + rc[1]] = true; });
  });

  var totalChecked = 0;
  var html = "";

  for (var r = 0; r < 5; r++) {
    for (var c = 0; c < 5; c++) {
      var text    = (bingoCells[r] && bingoCells[r][c]) ? bingoCells[r][c] : "";
      var checked = (bingoChecked[r] && bingoChecked[r][c]) || false;
      var isWin   = !!winCells[r + "," + c];
      var isFree  = /^free$/i.test(text.trim());

      if (checked || isFree) totalChecked++;

      var cls = "bingo-cell";
      if (isFree)       cls += " free-cell checked";
      else if (isWin)   cls += " checked bingo-line";
      else if (checked) cls += " checked";
      if (isAuthorized() && !isFree) cls += " editable";

      var click = (isAuthorized() && !isFree)
        ? ' onclick="toggleBingoCell(' + r + ',' + c + ')"'
        + ' oncontextmenu="openBingoEdit(event,' + r + ',' + c + ')"' : '';

      html += '<div class="' + cls + '"' + click + '>'
        + '<span class="bingo-cell-text">' + escHtml(text) + '</span>'
        + '</div>';
    }
  }

  grid.innerHTML = html;

  if (subtitle) {
    subtitle.textContent = winLines.length > 0
      ? "— ✨ BINGO! " + winLines.length + (winLines.length === 1 ? " Linie" : " Linien") + " abgeschlossen"
      : "— " + totalChecked + " / 25 Felder markiert";
  }
  if (banner) banner.style.display = winLines.length > 0 ? "block" : "none";
}

function toggleBingoCell(row, col) {
  if (!isAuthorized()) return;
  if (!bingoChecked[row]) bingoChecked[row] = Array(5).fill(false);
  bingoChecked[row][col] = !bingoChecked[row][col];
  prevBingoStateSnap = JSON.stringify(bingoChecked);
  renderBingo();
  showToast((bingoChecked[row][col] ? "✔ " : "○ ") + (bingoCells[row] ? bingoCells[row][col] : ""), 2000);
  writeBingoCellToSheet(row, col, bingoChecked[row][col]);
}

function writeBingoCellToSheet(row, col, value) {
  if (!APPS_SCRIPT_URL) return;
  fetch(APPS_SCRIPT_URL
    + "?action=setBingo"
    + "&row="   + encodeURIComponent(row)
    + "&col="   + encodeURIComponent(col)
    + "&value=" + encodeURIComponent(value ? "TRUE" : "FALSE")
    + "&twitchToken=" + encodeURIComponent(getTwitchToken()),
    { method: "GET", mode: "no-cors" }
  ).catch(function(e) { console.error("[Bingo] Schreibfehler:", e); });
}

// ──────────── BINGO EDIT ────────────
var bingoEditState = { row: -1, col: -1 };

function openBingoEdit(e, row, col) {
  e.preventDefault();
  e.stopPropagation();
  if (!isAuthorized()) return;
  bingoEditState = { row: row, col: col };
  var input = document.getElementById("bingo-edit-input");
  var popup = document.getElementById("bingo-edit-popup");
  input.value = (bingoCells[row] && bingoCells[row][col]) ? bingoCells[row][col] : "";
  var vw = window.innerWidth, vh = window.innerHeight;
  var pw = 300, ph = 160;
  var left = e.clientX + 10, top = e.clientY + 4;
  if (left + pw > vw - 12) left = e.clientX - pw - 10;
  if (top  + ph > vh - 12) top  = e.clientY - ph - 4;
  if (left < 8) left = 8;
  if (top  < 8) top  = 8;
  popup.style.left = left + "px";
  popup.style.top  = top  + "px";
  document.getElementById("bingo-edit-backdrop").classList.add("open");
  popup.classList.add("open");
  setTimeout(function() { input.focus(); input.select(); }, 120);
}

function closeBingoEdit() {
  document.getElementById("bingo-edit-backdrop").classList.remove("open");
  document.getElementById("bingo-edit-popup").classList.remove("open");
  bingoEditState = { row: -1, col: -1 };
}

function saveBingoEdit() {
  var row = bingoEditState.row;
  var col = bingoEditState.col;
  if (row < 0 || col < 0) return;
  var newText = document.getElementById("bingo-edit-input").value.trim();
  if (!bingoCells[row]) bingoCells[row] = Array(5).fill("");
  bingoCells[row][col] = newText;
  prevBingoTextSnap = JSON.stringify(bingoCells);
  closeBingoEdit();
  renderBingo();
  showToast("✏ Bingo-Feld gespeichert", 2000);
  writeBingoTextToSheet(row, col, newText);
}

function writeBingoTextToSheet(row, col, text) {
  if (!APPS_SCRIPT_URL) return;
  fetch(APPS_SCRIPT_URL
    + "?action=setBingoText"
    + "&row="   + encodeURIComponent(row)
    + "&col="   + encodeURIComponent(col)
    + "&value=" + encodeURIComponent(text)
    + "&twitchToken=" + encodeURIComponent(getTwitchToken()),
    { method: "GET", mode: "no-cors" }
  ).catch(function(e) { console.error("[Bingo] Text-Schreibfehler:", e); });
}

// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════

checkAuthOnLoad();
loadData();
loadClips();
setInterval(loadData,  3000);
setInterval(loadClips, 15000);
startTimerTick();
checkLiveStatus();
liveCheckInterval = setInterval(checkLiveStatus, 60000);
loadBingo();
setInterval(loadBingo, 10000);
