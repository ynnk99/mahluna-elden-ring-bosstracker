// ── Steel Soul Tracker – Konfiguration ──────────────────────────────────
// Trag hier deinen eigenen CSV-Link ein, falls sich dein Sheet ändert.
// Standard-Export-Link funktioniert, solange das Sheet auf "Jeder mit
// Link kann ansehen" steht (Freigeben-Button oben rechts in Google Sheets).
// Alternativ: Datei → Freigeben → Im Web veröffentlichen → CSV, dann den
// dortigen Link hier einsetzen.

const STEELSOUL_CONFIG = {
  // Deine Tabelle, Tabellenblatt "Steelsoul" (gid=1668153894)
  csvUrl: 'https://docs.google.com/spreadsheets/d/1e_Y7ugMwyxYiwd5p4ZV0WezsmUH40fDiCSrIMtvQfVs/export?format=csv&gid=1668153894',

  // Wie oft neu geladen wird (Millisekunden). 5000 = alle 5 Sekunden.
  refreshIntervalMs: 5000,

  // Spaltennamen aus deinem Sheet (Header aus Zeile 1). Groß-/Kleinschreibung
  // egal. Wenn du Spalten umbenennst oder neue hinzufügst, hier ergänzen.
  columnAliases: {
    attempt:    ['versuch', 'versuch #', 'attempt', 'nr', 'run'],
    status:     ['geschafft?', 'geschafft', 'status'],
    deathCause: ['gescheitert an', 'todesursache', 'death', 'gestorben an'],
    date:       ['datum', 'date'],
    igt:        ['ingame-zeit', 'ingame zeit', 'igt', 'zeit'],
    nail:       ['nagel-level', 'nagel', 'nail'],
    note:       ['notiz', 'note', 'kommentar'],
  },

  // Spalte B enthält ein Emoji statt Text. So wird es erkannt:
  //  ⏳ / ⌛  → Versuch läuft gerade (das ist der "aktuelle Versuch")
  //  ✅ / ✔  → Versuch geschafft
  //  ❌ / ✖  → Versuch gescheitert
  statusEmoji: {
    running: ['⏳', '⌛', '🕐', '🕛'],
    success: ['✅', '✔️', '✔', '🟢'],
    failed:  ['❌', '✖️', '✖', '🔴', '🗙'],
  },

  // Bosse pro Run: Bereich J2:K100. Zeile 1 = Überschrift "Bosse", ignoriert.
  // J = Versuch-Referenz, K = Name des besiegten Bosses. Eine Zeile pro Boss,
  // mehrere Zeilen pro Versuch möglich.
  bossColumns: {
    attempt: 'J',
    boss:    'K',
  },

  // Clips pro Run: Bereich G2:I100. Zeile 1 = Überschrift "Clips", ignoriert.
  // G = Versuch-Referenz, H = Kategorie (Dropdown), I = Twitch-Link.
  clipColumns: {
    attempt:  'G',
    category: 'H',
    link:     'I',
  }
};
