/**
 * consent.js – DSGVO-konformes Cookie-Banner
 *
 * Blockiert ALLE externen Drittanbieter-Requests (Google Sheets, Google
 * Analytics, Twitch API) bis der Nutzer eine aktive Entscheidung trifft.
 *
 * Ablauf:
 *   1. Seite lädt → consent.js prüft gespeicherte Entscheidung.
 *   2a. Entscheidung vorhanden → onReady-Callbacks sofort aufrufen.
 *   2b. Keine Entscheidung → Banner anzeigen; onReady erst nach Klick.
 *   3. script.js registriert initApp() via window.cookieConsent.onReady().
 *
 * Alle Schriften und Bibliotheken werden lokal ausgeliefert (keine externen
 * CDN-Requests vor Einwilligung).
 */
(function () {
  'use strict';

  const CONSENT_KEY  = 'cookie_consent_v1';
  const CONSENT_DATE = 'cookie_consent_date';
  const GA_ID        = 'G-DDZ4BFG7JS';

  /* ── onReady-Mechanismus ──────────────────────────────────────────────
   * script.js ruft window.cookieConsent.onReady(fn) auf.
   * Die Callback-Funktion wird aufgerufen, sobald der Nutzer entschieden
   * hat (oder sofort, wenn bereits eine gespeicherte Entscheidung vorliegt).
   * Dadurch starten loadData(), loadClips() usw. erst nach Einwilligung.
   */
  var _readyCallbacks = [];
  var _consentReady   = false;

  function triggerReady() {
    _consentReady = true;
    for (var i = 0; i < _readyCallbacks.length; i++) {
      try { _readyCallbacks[i](); } catch (e) { console.error(e); }
    }
    _readyCallbacks = [];
  }

  /* ── Google Analytics laden ───────────────────────────────────────── */

  function loadGoogleAnalytics() {
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_ID);
  }

  /* ── Einwilligung anwenden ────────────────────────────────────────── */

  function applyConsent(analytics) {
    if (analytics) loadGoogleAnalytics();
    // In beiden Fällen (accept & reject) App-Init freigeben
    triggerReady();
  }

  /* ── Speichern / Lesen ────────────────────────────────────────────── */

  function saveConsent(analytics) {
    localStorage.setItem(CONSENT_KEY,  analytics ? 'accepted' : 'rejected');
    localStorage.setItem(CONSENT_DATE, new Date().toISOString());
  }

  function getConsent() {
    return localStorage.getItem(CONSENT_KEY); // 'accepted' | 'rejected' | null
  }

  /* ── Banner entfernen ─────────────────────────────────────────────── */

  function hideBanner() {
    var el = document.getElementById('cookie-consent-banner');
    if (el) {
      el.style.transform = 'translateY(110%)';
      el.style.opacity   = '0';
      setTimeout(function () { el.remove(); }, 400);
    }
  }

  /* ── Aktionen ─────────────────────────────────────────────────────── */

  function acceptAll() {
    saveConsent(true);
    applyConsent(true);
    hideBanner();
  }

  function rejectAll() {
    saveConsent(false);
    applyConsent(false);
    hideBanner();
  }

  /* ── Öffentliche API ──────────────────────────────────────────────── */
  window.cookieConsent = {
    /** Callback wird aufgerufen, sobald der Nutzer entschieden hat. */
    onReady: function (fn) {
      if (_consentReady) { fn(); } else { _readyCallbacks.push(fn); }
    },
    /** Einwilligung zurücksetzen und Banner erneut anzeigen. */
    reset: function () {
      localStorage.removeItem(CONSENT_KEY);
      localStorage.removeItem(CONSENT_DATE);
      location.reload();
    },
    /** Aktuellen Status abfragen. */
    getStatus: function () { return getConsent(); }
  };

  /* ── Banner-HTML + CSS ────────────────────────────────────────────── */

  function injectBanner() {
    var style = document.createElement('style');
    style.textContent = [
      '#cookie-consent-banner {',
      '  position: fixed;',
      '  bottom: 0; left: 0; right: 0;',
      '  z-index: 99999;',
      '  background: linear-gradient(180deg, #1a1208 0%, #0d0b06 100%);',
      '  border-top: 1px solid #7a5c1e;',
      '  box-shadow: 0 -4px 32px rgba(0,0,0,0.7);',
      '  padding: 18px 24px 20px;',
      '  font-family: Georgia, "Times New Roman", serif;',
      '  color: #c8b078;',
      '  transition: transform 0.4s ease, opacity 0.4s ease;',
      '}',
      '#cookie-consent-banner a { color: #c8b078; }',
      '.ccb-inner {',
      '  max-width: 960px;',
      '  margin: 0 auto;',
      '  display: grid;',
      '  grid-template-columns: 1fr auto;',
      '  gap: 14px 24px;',
      '  align-items: center;',
      '}',
      '.ccb-title {',
      '  font-size: 13px;',
      '  font-weight: bold;',
      '  letter-spacing: 0.08em;',
      '  text-transform: uppercase;',
      '  color: #e8c87a;',
      '  margin-bottom: 6px;',
      '}',
      '.ccb-text {',
      '  font-size: 12.5px;',
      '  line-height: 1.65;',
      '  color: #a89060;',
      '  margin: 0;',
      '}',
      '.ccb-text a { color: #c8b078; text-decoration: underline; cursor: pointer; }',
      '.ccb-text a:hover { color: #e8c87a; }',
      '.ccb-notice {',
      '  display: inline-block;',
      '  margin-top: 6px;',
      '  font-size: 11px;',
      '  color: #6a5030;',
      '  font-style: italic;',
      '}',
      '.ccb-buttons {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 8px;',
      '  min-width: 200px;',
      '}',
      '.ccb-btn {',
      '  display: block;',
      '  width: 100%;',
      '  padding: 9px 18px;',
      '  border: none;',
      '  border-radius: 3px;',
      '  font-family: Georgia, serif;',
      '  font-size: 12px;',
      '  letter-spacing: 0.06em;',
      '  cursor: pointer;',
      '  transition: background 0.2s, color 0.2s;',
      '  white-space: nowrap;',
      '}',
      '.ccb-btn-accept {',
      '  background: linear-gradient(135deg, #8b6914 0%, #c8960a 50%, #8b6914 100%);',
      '  color: #0d0b06;',
      '  font-weight: bold;',
      '  border: 1px solid #e8c87a;',
      '  text-transform: uppercase;',
      '}',
      '.ccb-btn-accept:hover {',
      '  background: linear-gradient(135deg, #c8960a 0%, #e8d060 50%, #c8960a 100%);',
      '}',
      '.ccb-btn-reject {',
      '  background: transparent;',
      '  color: #7a6040;',
      '  border: 1px solid #3a2e18;',
      '  text-transform: uppercase;',
      '}',
      '.ccb-btn-reject:hover { border-color: #7a5c1e; color: #a89060; }',
      '@media (max-width: 640px) {',
      '  .ccb-inner { grid-template-columns: 1fr; }',
      '  .ccb-buttons { flex-direction: row; min-width: unset; }',
      '  .ccb-btn { font-size: 11px; padding: 8px 10px; }',
      '}'
    ].join('\n');
    document.head.appendChild(style);

    var banner = document.createElement('div');
    banner.id = 'cookie-consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-modal', 'true');
    banner.setAttribute('aria-label', 'Datenschutz-Einstellungen');
    banner.innerHTML = [
      '<div class="ccb-inner">',
      '  <div class="ccb-content">',
      '    <div class="ccb-title">&#127850; Datenschutz-Einstellungen</div>',
      '    <p class="ccb-text">',
      '      Bevor die Seite l&#228;dt, werden Daten aus einem &#246;ffentlichen',
      '      <strong>Google&nbsp;Spreadsheet</strong> abgerufen (IP&#8209;&#220;bertragung an Google&nbsp;LLC,&nbsp;USA).',
      '      Mit &bdquo;Alle&nbsp;akzeptieren&ldquo; stimmst du zus&#228;tzlich',
      '      <strong>Google&nbsp;Analytics&nbsp;4</strong> zu (anonymisierte Nutzungsstatistiken).',
      '      Mit &bdquo;Nur&nbsp;notwendige&ldquo; werden nur die f&#252;r die Funktion',
      '      der Seite erforderlichen Requests ausgef&#252;hrt.<br>',
      '      <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google&nbsp;Datenschutz</a>',
      '      &nbsp;&middot;&nbsp;',
      '      <span role="button" tabindex="0"',
      '        onclick="window.cookieConsent&&window.cookieConsent.reset()"',
      '        onkeydown="if(event.key===\'Enter\')window.cookieConsent&&window.cookieConsent.reset()"',
      '        style="cursor:pointer;text-decoration:underline;">Einwilligung widerrufen</span>',
      '    </p>',
      '    <span class="ccb-notice">',
      '      &#9888;&#65039; Ohne Auswahl bleibt die Seite gesperrt.',
      '    </span>',
      '  </div>',
      '  <div class="ccb-buttons">',
      '    <button class="ccb-btn ccb-btn-accept" id="ccb-accept">Alle akzeptieren</button>',
      '    <button class="ccb-btn ccb-btn-reject" id="ccb-reject">Nur notwendige</button>',
      '  </div>',
      '</div>'
    ].join('\n');
    document.body.appendChild(banner);

    document.getElementById('ccb-accept').addEventListener('click', acceptAll);
    document.getElementById('ccb-reject').addEventListener('click', rejectAll);
  }

  /* ── Initialisierung ──────────────────────────────────────────────── */

  var stored = getConsent();

  if (stored === 'accepted') {
    applyConsent(true);   // GA laden + App freigeben
  } else if (stored === 'rejected') {
    applyConsent(false);  // nur App freigeben, kein GA
  } else {
    // Noch keine Entscheidung → Banner zeigen; App wartet
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectBanner);
    } else {
      injectBanner();
    }
  }

})();
