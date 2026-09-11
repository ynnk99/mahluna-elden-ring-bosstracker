// ── Steel Soul Tracker – Datenlogik (geteilt von Landingpage & Overlay) ──
const SteelSoul = (function () {

  function normalizeHeader(h) {
    return (h || '').toString().trim().toLowerCase();
  }

  function buildHeaderMap(headers) {
    const map = {};
    const aliases = STEELSOUL_CONFIG.columnAliases;
    headers.forEach((raw, idx) => {
      const h = normalizeHeader(raw);
      Object.keys(aliases).forEach(key => {
        if (aliases[key].some(alias => h === alias || h.includes(alias))) {
          map[key] = idx;
        }
      });
    });
    return map;
  }

  function colLetterToIndex(letter) {
    // unterstützt einzelne Buchstaben A-Z (reicht für G, H, J, K etc.)
    return letter.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
  }

  // Erkennt den Status aus dem Emoji in Spalte B.
  //  'running' → ⏳/⌛ (aktueller Versuch, noch offen)
  //  'success' → ✅/✔
  //  'failed'  → ❌/✖
  //  ''        → nichts erkannt / leer
  function classifyStatus(raw) {
    const v = (raw || '').toString().trim();
    if (!v) return '';
    const emoji = STEELSOUL_CONFIG.statusEmoji;
    for (const key of ['running', 'success', 'failed']) {
      if ((emoji[key] || []).some(e => v.includes(e))) return key;
    }
    return '';
  }

  // Generischer Parser für die "Versuch → Werte" Zusatzbereiche (Bosse, Clips).
  // Zeile 1 (Überschrift) wird übersprungen. Unterstützt beliebig viele
  // Wertespalten neben der Versuch-Referenz. Gibt attempt → [records] zurück.
  function parseRefRange(rows, colsCfg) {
    if (!colsCfg) return {};
    const attemptIdx = colLetterToIndex(colsCfg.attempt);
    const valueKeys = Object.keys(colsCfg).filter(k => k !== 'attempt');
    const idxByKey = {};
    valueKeys.forEach(k => { idxByKey[k] = colLetterToIndex(colsCfg[k]); });

    const byAttempt = {};
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const attemptRaw = (row[attemptIdx] || '').toString().trim();
      if (!attemptRaw) continue;
      const attempt = parseInt(attemptRaw, 10);
      if (Number.isNaN(attempt)) continue;

      const rec = { attempt };
      let hasAny = false;
      valueKeys.forEach(k => {
        const v = (row[idxByKey[k]] || '').toString().trim();
        rec[k] = v;
        if (v) hasAny = true;
      });
      if (!hasAny) continue;

      if (!byAttempt[attempt]) byAttempt[attempt] = [];
      byAttempt[attempt].push(rec);
    }
    return byAttempt;
  }

  function parseRows(csvText) {
    const parsed = Papa.parse(csvText.trim(), { skipEmptyLines: false });
    const rows = parsed.data;
    if (!rows.length) return [];
    const headerMap = buildHeaderMap(rows[0]);
    const bossesByAttempt = parseRefRange(rows, STEELSOUL_CONFIG.bossColumns);
    const clipsByAttempt = parseRefRange(rows, STEELSOUL_CONFIG.clipColumns);

    const runs = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const get = (key) => (headerMap[key] !== undefined ? (row[headerMap[key]] || '').toString().trim() : '');
      const attemptRaw = get('attempt');
      if (!attemptRaw) continue; // leere Zeile → überspringen
      const attempt = parseInt(attemptRaw, 10) || attemptRaw;
      const status = classifyStatus(get('status'));
      const bosses = (bossesByAttempt[attempt] || []).map(b => b.boss);
      runs.push({
        attempt,
        status,                      // 'running' | 'success' | 'failed' | ''
        running: status === 'running',
        success: status === 'success',
        failed: status === 'failed',
        deathCause: get('deathCause'),
        date: get('date'),
        igt: get('igt'),
        nail: get('nail'),
        note: get('note'),
        bosses,
        bossesKilled: bosses.length,
        clips: clipsByAttempt[attempt] || [],
      });
    }
    // Zeilen ohne gesetzten Status (Spalte B leer) sind nur vorbereitete
    // Versuchsnummern (z.B. für Dropdowns) und keine echten Versuche.
    return runs
      .filter(r => r.status !== '')
      .sort((a, b) => (parseInt(a.attempt, 10) || 0) - (parseInt(b.attempt, 10) || 0));
  }

  function computeStats(runs) {
    if (!runs.length) {
      return {
        totalAttempts: 0, currentAttempt: null, currentRun: null, successCount: 0,
        failedCount: 0, bestBossesKilled: 0, bestRun: null, topDeathCauses: [],
        latestRun: null, totalClips: 0, latestRunHasClips: false,
      };
    }
    const totalAttempts = runs.length;

    // "aktueller Versuch" = die Zeile mit dem Sanduhr-Emoji. Fällt keine
    // Zeile darunter, wird ersatzweise der letzte Eintrag genommen.
    const currentRun = runs.find(r => r.running) || runs[runs.length - 1];
    const currentAttempt = currentRun.attempt;
    const latestRun = runs[runs.length - 1];

    const successCount = runs.filter(r => r.success).length;
    const failedCount = runs.filter(r => r.failed).length;

    let bestRun = runs[0];
    runs.forEach(r => { if (r.bossesKilled > bestRun.bossesKilled) bestRun = r; });
    const bestBossesKilled = bestRun.bossesKilled;

    const causeCounts = {};
    runs.forEach(r => {
      if (!r.failed || !r.deathCause) return;
      causeCounts[r.deathCause] = (causeCounts[r.deathCause] || 0) + 1;
    });
    const topDeathCauses = Object.entries(causeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cause, count]) => ({ cause, count }));

    const totalClips = runs.reduce((sum, r) => sum + (r.clips ? r.clips.length : 0), 0);
    const latestRunHasClips = !!(currentRun.clips && currentRun.clips.length);

    return {
      totalAttempts, currentAttempt, currentRun, successCount, failedCount,
      bestBossesKilled, bestRun, topDeathCauses, latestRun, totalClips, latestRunHasClips,
    };
  }

  async function fetchRuns() {
    const res = await fetch(STEELSOUL_CONFIG.csvUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error('CSV konnte nicht geladen werden (' + res.status + ')');
    const text = await res.text();
    return parseRows(text);
  }

  function startPolling(onUpdate, onError) {
    let stopped = false;
    async function tick() {
      if (stopped) return;
      try {
        const runs = await fetchRuns();
        const stats = computeStats(runs);
        onUpdate(runs, stats);
      } catch (e) {
        if (onError) onError(e);
        else console.error(e);
      }
      if (!stopped) setTimeout(tick, STEELSOUL_CONFIG.refreshIntervalMs);
    }
    tick();
    return () => { stopped = true; };
  }

  return { fetchRuns, computeStats, startPolling, parseRows };
})();
