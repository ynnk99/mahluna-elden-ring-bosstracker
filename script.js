// ═══════════════════════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const TWITCH_CLIENT_ID   = "n3oqt780bnsi3lb2gzinxdbrrazork";
const TWITCH_REDIRECT_URI = window.location.origin + window.location.pathname;
const APPS_SCRIPT_URL    = "https://script.google.com/macros/s/AKfycbwBW3krabNJWaNzIApY2be5dKenM5gyu03LpDggwiQOvyvA6cir2rCgE8Hxc01ZV-L8/exec";

const ALLOWED_USERS = [
  "ynnk99",
  "mahluna",
  "der_gude_nico",
];

const SPREADSHEET_ID = "1r9BzZJYFrk4rQLlMn4ZPBBUuc8u_peqwThTi1UTCQcE";

const SHEET_URL = "https://docs.google.com/spreadsheets/d/" + SPREADSHEET_ID
  + "/gviz/tq?sheet=OBS_OVERLAY&tqx=out:json";

const CLIPS_URL = "https://docs.google.com/spreadsheets/d/" + SPREADSHEET_ID
  + "/gviz/tq?sheet=OBS_OVERLAY&tqx=out:json&range=W10:Z100";

const RANKING_TOP_N = 10;

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

var clipsData      = [];
var activeCategory = null;
var currentAreas   = {};
var searchQuery    = "";
var prevRankingSnapshot = "";
var prevChartSnapshot = "";
var clipsByBoss         = {};
var deathsWriteTimer = null;
var pendingLocalChanges = {};

// Auth state
var currentUser = null;
var userIsEditor = false;

// Boss menu state
var menuState = {
  area: null,
  boss: null,
  deaths: 0,
  done: false,
  pinned: false
};

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
  if (TWITCH_CLIENT_ID === "n3oqt780bnsi3lb2gzinxdbrrazork") {
    showToast("⚠ Twitch Client ID nicht konfiguriert!", 4000);
    return;
  }
  var scope = "user:read:email";
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
  })
  .catch(function(err) {
    console.error("[Auth] Fehler:", err);
    showToast("⚠ Twitch-Anmeldung fehlgeschlagen", 3500);
  });
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
}

function isAuthorized() {
  return userIsEditor && currentUser !== null;
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
    + "&value="  + encodeURIComponent(value);

  fetch(url, { method: "GET", mode: "no-cors" })
    .catch(function(err) {
      console.error("[Sheet] Schreibfehler:", err);
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
    pinned: bossData.pinned
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
  var mh     = 260;
  var vw     = window.innerWidth;
  var vh     = window.innerHeight;
  var cx     = e.clientX;
  var cy     = e.clientY;

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

document.addEventListener("click", function(e) {
  if (!menuOpen) return;
  var menu = document.getElementById("boss-menu");
  if (!menu.contains(e.target)) closeBossMenu();
});

document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") {
    closeBossClipsPanel();
    closeClipModal();
    closeBossMenu();
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
  var bossesAttempted = allBosses.filter(function(b) { return b.deaths > 0; }).length;
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
    return "https://clips.twitch.tv/embed?clip=" + parsed.slug + "&parent=" + parent + "&autoplay=false";
  }
  if (parsed.type === "vod") {
    return "https://player.twitch.tv/?video=" + parsed.id + "&parent=" + parent + "&autoplay=false";
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLIP MODAL
// ═══════════════════════════════════════════════════════════════════════════

function openClipModal() {
  document.getElementById("clip-backdrop").classList.add("open");
  document.getElementById("clip-modal").classList.add("open");
  document.body.style.overflow = "hidden";
  renderClipModal();
}

function closeClipModal() {
  document.getElementById("clip-backdrop").classList.remove("open");
  document.getElementById("clip-modal").classList.remove("open");
  document.body.style.overflow = "";
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

  var categories = {};
  clipsData.forEach(function(c) {
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
    embedHtml = '<div class="clip-embed-wrapper">'
      + '<iframe src="' + escAttr(embedUrl) + '" allowfullscreen scrolling="no" allow="autoplay; fullscreen" title="Clip ' + (index + 1) + '"></iframe>'
      + '</div>';
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

  var newClip = { url: url, category: category, title: title, boss: boss };
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

  writeClipToSheet(url, category, title, boss);
}

function writeClipToSheet(url, category, title, boss) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === "DEINE_APPS_SCRIPT_URL_HIER") {
    console.warn("[Clips] Apps Script URL nicht konfiguriert – Clip nur lokal.");
    return;
  }
  var reqUrl = APPS_SCRIPT_URL
    + "?action=addClip"
    + "&value="    + encodeURIComponent(url)
    + "&category=" + encodeURIComponent(category)
    + "&title="    + encodeURIComponent(title)
    + "&boss="     + encodeURIComponent(boss || "");
  fetch(reqUrl, { method: "GET", mode: "no-cors" })
    .catch(function(err) { console.error("[Clips] Schreibfehler:", err); });
}

// ═══════════════════════════════════════════════════════════════════════════
// BOSS CLIPS
// ═══════════════════════════════════════════════════════════════════════════

function rebuildClipsByBoss() {
  clipsByBoss = {};
  clipsData.forEach(function(c) {
    if (c.boss && MAIN_BOSSES.has(c.boss)) {
      if (!clipsByBoss[c.boss]) clipsByBoss[c.boss] = [];
      clipsByBoss[c.boss].push(c);
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

function openBossClipsPanel(bossName, e) {
  if (e) e.stopPropagation();
  var clips = clipsByBoss[bossName] || [];
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
  clip.boss   = newBoss;
  rebuildClipsByBoss();

  var panel = document.getElementById("boss-clips-modal");
  if (panel && panel.classList.contains("open")) {
    var heading  = document.getElementById("boss-clips-heading");
    var panelBoss = heading ? heading.textContent : "";
    if (panelBoss === oldBoss || panelBoss === newBoss) {
      var clips = clipsByBoss[panelBoss] || [];
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
    + "&boss="  + encodeURIComponent(boss || "");
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
        var url      = row.c[0] && row.c[0].v ? String(row.c[0].v).trim() : "";
        var category = row.c[1] && row.c[1].v ? String(row.c[1].v).trim() : "Sonstige";
        var title    = row.c[2] && row.c[2].v ? String(row.c[2].v).trim() : "";
        var boss     = row.c[3] && row.c[3].v ? String(row.c[3].v).trim() : "";
        if (url) newClips.push({ url: url, category: category, title: title, boss: boss });
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
  var baseGameFlag = isTrue(rows[0] && rows[0].c[16] ? rows[0].c[16].v : false);
  var dlcFlag      = isTrue(rows[1] && rows[1].c[16] ? rows[1].c[16].v : false);

  if (prevDeaths === null) {
    showBase = baseGameFlag;
    showDLC  = dlcFlag;
    document.getElementById("btn-basegame").classList.toggle("active", showBase);
    document.getElementById("btn-dlc").classList.toggle("active", showDLC);
  }

  timerStartTs = Number(rows[0] && rows[0].c[22] ? rows[0].c[22].v : 0) || 0;
  timerElapsed = Number(rows[2] && rows[2].c[22] ? rows[2].c[22].v : 0) || 0;
  timerVisible = isTrue(rows[0] && rows[0].c[13] ? rows[0].c[13].v : false);
  updateTimerDisplay();

  var baseDeaths   = Number(rows[1] && rows[1].c[10] ? rows[1].c[10].v : 0) || 0;
  var dlcDeaths    = Number(rows[166] && rows[166].c[10] ? rows[166].c[10].v : 0) || 0;
  var globalDeaths = 0;
  if (showBase && showDLC)  globalDeaths = baseDeaths + dlcDeaths;
  else if (showBase)         globalDeaths = baseDeaths;
  else if (showDLC)          globalDeaths = dlcDeaths;

  if (prevDeaths !== null && globalDeaths !== prevDeaths) {
    pulseEl(document.getElementById("stat-deaths"));
    var el = document.getElementById("stat-deaths");
    el.classList.remove("death-flash");
    void el.offsetWidth;
    el.classList.add("death-flash");
  }
  document.getElementById("val-deaths").textContent = globalDeaths.toLocaleString("de-DE");
  prevDeaths = globalDeaths;

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

    if (showOnlyDone && !done) return;
    if (showOnlyOpen && done) return;

    var pendingKey = area + "|" + boss;
    if (pendingLocalChanges[pendingKey]) {
      var age = Date.now() - pendingLocalChanges[pendingKey];
      if (age < 10000) {
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
    var sheetCollapsed = isTrue(r.c[6] ? r.c[6].v : false);
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
    areas[area].bosses.push({ boss: boss, done: done, deaths: deaths, pinned: pinned });

    allBosses.push({ boss: boss, deaths: deaths, done: done, area: area, date: date });
  });

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
      }
      card.innerHTML = '<span class="pinned-deaths">📌 ' + (b.deaths > 0 ? b.deaths : "–") + '</span>'
        + '<span class="pinned-name' + (isMain ? " main-boss" : "") + '">' + escHtml(b.boss) + '</span>'
        + (isAuthorized() ? '<span class="boss-edit-hint" title="Bearbeiten">✏</span>' : '');
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

  var bossClipCount = (clipsByBoss[b.boss] || []).length;
  var clipBadge = bossClipCount > 0
    ? '<span class="boss-clip-badge" onclick="openBossClipsPanel(\'' + escAttr(b.boss) + '\',event)" title="' + bossClipCount + ' Clip' + (bossClipCount > 1 ? 's' : '') + ' ansehen">🎬 ' + bossClipCount + '</span>'
    : '';

  return '<div class="boss-row' + (b.done ? " done" : "") + editClass + '"'
    + ' data-boss="' + escAttr(b.boss) + '"'
    + ' data-area="' + escAttr(areaName) + '"'
    + clickAttr + '>'
    + '<span class="boss-deaths' + deathClass + '">' + (b.deaths > 0 ? "†" + b.deaths : "†–") + '</span>'
    + '<span class="boss-name' + (isMain ? " main" : "") + '" data-tip="' + escAttr(b.boss) + '">' + escHtml(b.boss) + '</span>'
    + clipBadge
    + '<span class="boss-check">✓</span>'
    + (isAuthorized() ? '<span class="boss-edit-hint" title="Bearbeiten">✏</span>' : '')
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
    if (el.scrollWidth <= el.offsetWidth) return;
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
// INIT
// ═══════════════════════════════════════════════════════════════════════════

checkAuthOnLoad();
loadData();
loadClips();
setInterval(loadData,  5000);
setInterval(loadClips, 15000);
startTimerTick();
