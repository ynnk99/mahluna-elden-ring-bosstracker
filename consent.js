/**
 * consent.js – DSGVO-konformes Cookie-Banner
 * Blockiert Google Fonts & Google Analytics bis zur Einwilligung.
 * Speichert die Entscheidung in localStorage.
 */
(function () {
  'use strict';

  const CONSENT_KEY  = 'cookie_consent_v1';
  const CONSENT_DATE = 'cookie_consent_date';
  const GA_ID        = 'G-DDZ4BFG7JS';

  /* ── Ressourcen laden ─────────────────────────────────────────── */

  function loadGoogleAnalytics() {
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_ID);
  }

  /* ── Einwilligung anwenden ────────────────────────────────────── */

  function applyConsent(analytics) {
    if (analytics) loadGoogleAnalytics();
  }

  /* ── Speichern / Lesen ────────────────────────────────────────── */

  function saveConsent(analytics) {
    localStorage.setItem(CONSENT_KEY,  analytics ? 'accepted' : 'rejected');
    localStorage.setItem(CONSENT_DATE, new Date().toISOString());
  }

  function getConsent() {
    return localStorage.getItem(CONSENT_KEY); // 'accepted' | 'rejected' | null
  }

  /* ── Banner entfernen ─────────────────────────────────────────── */

  function hideBanner() {
    const el = document.getElementById('cookie-consent-banner');
    if (el) {
      el.style.transform  = 'translateY(110%)';
      el.style.opacity    = '0';
      setTimeout(function () { el.remove(); }, 400);
    }
  }

  /* ── Aktionen ─────────────────────────────────────────────────── */

  function acceptAll() {
    saveConsent(true);
    applyConsent(true);
    hideBanner();
  }

  function rejectAll() {
    saveConsent(false);
    applyConsent(false); // Fonts werden trotzdem geladen (kein Tracking)
    hideBanner();
  }

  /* Öffentliche API – z. B. für einen "Cookie-Einstellungen"-Link */
  window.cookieConsent = {
    reset: function () {
      localStorage.removeItem(CONSENT_KEY);
      localStorage.removeItem(CONSENT_DATE);
      location.reload();
    },
    getStatus: function () { return getConsent(); }
  };

  /* ── Banner-HTML + CSS ────────────────────────────────────────── */

  function injectBanner() {
    /* ── CSS ── */
    const style = document.createElement('style');
    style.textContent = `
      #cookie-consent-banner {
        position: fixed;
        bottom: 0; left: 0; right: 0;
        z-index: 99999;
        background: linear-gradient(180deg, #1a1208 0%, #0d0b06 100%);
        border-top: 1px solid #7a5c1e;
        box-shadow: 0 -4px 32px rgba(0,0,0,0.7);
        padding: 18px 24px 20px;
        font-family: Georgia, 'Times New Roman', serif;
        color: #c8b078;
        transition: transform 0.4s ease, opacity 0.4s ease;
      }
      #cookie-consent-banner a {
        color: #c8b078;
      }
      .ccb-inner {
        max-width: 900px;
        margin: 0 auto;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 14px 24px;
        align-items: center;
      }
      .ccb-title {
        font-size: 13px;
        font-weight: bold;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #e8c87a;
        margin-bottom: 5px;
      }
      .ccb-text {
        font-size: 12.5px;
        line-height: 1.6;
        color: #a89060;
        margin: 0;
      }
      .ccb-text a {
        color: #c8b078;
        text-decoration: underline;
        cursor: pointer;
      }
      .ccb-text a:hover { color: #e8c87a; }
      .ccb-buttons {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 190px;
      }
      .ccb-btn {
        display: block;
        width: 100%;
        padding: 9px 18px;
        border: none;
        border-radius: 3px;
        font-family: Georgia, serif;
        font-size: 12px;
        letter-spacing: 0.06em;
        cursor: pointer;
        transition: background 0.2s, color 0.2s;
        white-space: nowrap;
      }
      .ccb-btn-accept {
        background: linear-gradient(135deg, #8b6914 0%, #c8960a 50%, #8b6914 100%);
        color: #0d0b06;
        font-weight: bold;
        border: 1px solid #e8c87a;
        text-transform: uppercase;
      }
      .ccb-btn-accept:hover {
        background: linear-gradient(135deg, #c8960a 0%, #e8d060 50%, #c8960a 100%);
      }
      .ccb-btn-reject {
        background: transparent;
        color: #7a6040;
        border: 1px solid #3a2e18;
        text-transform: uppercase;
      }
      .ccb-btn-reject:hover {
        border-color: #7a5c1e;
        color: #a89060;
      }
      .ccb-settings-link {
        display: block;
        text-align: center;
        font-size: 10.5px;
        color: #5a4a28 !important;
        text-decoration: underline;
        cursor: pointer;
        margin-top: 2px;
        background: none;
        border: none;
        font-family: Georgia, serif;
        letter-spacing: 0.04em;
      }
      .ccb-settings-link:hover { color: #a89060 !important; }
      @media (max-width: 600px) {
        .ccb-inner {
          grid-template-columns: 1fr;
        }
        .ccb-buttons {
          flex-direction: row;
          min-width: unset;
        }
        .ccb-btn { font-size: 11px; padding: 8px 10px; }
        .ccb-settings-link { display: none; }
      }
    `;
    document.head.appendChild(style);

    /* ── HTML ── */
    const banner = document.createElement('div');
    banner.id = 'cookie-consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie-Einstellungen');
    banner.innerHTML = `
      <div class="ccb-inner">
        <div class="ccb-content">
          <div class="ccb-title">🍪 Datenschutz-Einstellungen</div>
          <p class="ccb-text">
            Diese Seite verwendet <strong>Google Analytics</strong> um anonymisierte
            Nutzungsstatistiken zu erfassen. Dabei wird deine IP-Adresse an Google LLC, USA übertragen.
            Ohne deine Einwilligung wird kein Tracking-Cookie gesetzt.<br>
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Datenschutz</a>
            &nbsp;·&nbsp;
            <span role="button" tabindex="0" onclick="window.cookieConsent && window.cookieConsent.reset()" onkeydown="if(event.key==='Enter')window.cookieConsent&&window.cookieConsent.reset()" style="cursor:pointer;text-decoration:underline;">Einwilligung widerrufen</span>
          </p>
        </div>
        <div class="ccb-buttons">
          <button class="ccb-btn ccb-btn-accept" id="ccb-accept">Alle akzeptieren</button>
          <button class="ccb-btn ccb-btn-reject" id="ccb-reject">Nur notwendige</button>
        </div>
      </div>
    `;
    document.body.appendChild(banner);

    document.getElementById('ccb-accept').addEventListener('click', acceptAll);
    document.getElementById('ccb-reject').addEventListener('click', rejectAll);
  }

  /* ── Initialisierung ──────────────────────────────────────────── */

  const stored = getConsent();

  if (stored === 'accepted') {
    // Einwilligung bereits erteilt → sofort laden
    applyConsent(true);
  } else if (stored === 'rejected') {
    // Nur Fonts, kein Analytics
    applyConsent(false);
  } else {
    // Keine Entscheidung → Banner zeigen, nichts laden
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectBanner);
    } else {
      injectBanner();
    }
  }

})();
