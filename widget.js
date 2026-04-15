(function() {

  // ── State ──────────────────────────────────────────────────────────────────
  let acceptatielijst = null;
  let debounceTimer;
  let activeIdx = -1;

  // ── Load list — from inline variable or fallback URL ───────────────────────
  async function loadLijst() {
    if (acceptatielijst) return;
    if (window.GP_ACCEPTATIELIJST) {
      acceptatielijst = window.GP_ACCEPTATIELIJST;
    } else {
      throw new Error('Geen acceptatielijst gevonden. Voeg GP_ACCEPTATIELIJST toe aan de pagina.');
    }
  }

  // ── Inject styles ──────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    .gp-widget {
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 15px;
      line-height: 1.6;
      max-width: 480px;
      margin: 0;
    }
    .gp-widget * { box-sizing: border-box; }
    .gp-widget .gp-label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 5px;
      color: #333;
    }
    .gp-widget .gp-input-wrap {
      position: relative;
      margin-bottom: 10px;
    }
    .gp-widget input[type=text],
    .gp-widget input[type=number] {
      width: 100%;
      height: 42px;
      border: 1px solid #ccc;
      border-radius: 6px;
      padding: 0 12px;
      font-size: 15px;
      outline: none;
      transition: border-color .15s;
      color: #1a1a1a;
      background: #fff;
    }
    .gp-widget input[type=text]:focus,
    .gp-widget input[type=number]:focus {
      border-color: #1a6b3c;
      box-shadow: 0 0 0 3px rgba(26,107,60,.12);
    }
    .gp-widget .gp-row {
      display: grid;
      grid-template-columns: 1fr 120px;
      gap: 10px;
      margin-bottom: 12px;
    }
    .gp-widget .gp-dropdown {
      position: absolute;
      top: calc(100% + 3px);
      left: 0; right: 0;
      background: #fff;
      border: 1px solid #ccc;
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0,0,0,.1);
      z-index: 9999;
      overflow: hidden;
    }
    .gp-widget .gp-dropdown div {
      padding: 9px 12px;
      cursor: pointer;
      font-size: 14px;
      color: #1a1a1a;
    }
    .gp-widget .gp-dropdown div:hover,
    .gp-widget .gp-dropdown div.gp-active { background: #f0f7f3; }
    .gp-widget .gp-btn {
      width: 100%;
      height: 42px;
      background: #1a6b3c;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: background .15s;
    }
    .gp-widget .gp-btn:hover { background: #145530; }
    .gp-widget .gp-btn:disabled { background: #aaa; cursor: not-allowed; }
    .gp-widget .gp-result {
      margin-top: 16px;
      padding: 14px 16px;
      border-radius: 8px;
      font-size: 14px;
      line-height: 1.6;
      display: none;
    }
    .gp-widget .gp-result.gp-yes {
      background: #eaf4ef;
      border: 1px solid #a3d4b5;
      color: #0f4a28;
    }
    .gp-widget .gp-result.gp-no {
      background: #fef2f2;
      border: 1px solid #fca5a5;
      color: #7f1d1d;
    }
    .gp-widget .gp-result .gp-result-title {
      font-weight: 600;
      font-size: 15px;
      margin-bottom: 4px;
    }
    .gp-widget .gp-error {
      margin-top: 8px;
      font-size: 13px;
      color: #c00;
      display: none;
    }
  `;
  document.head.appendChild(style);

  // ── Autocomplete from inline list ──────────────────────────────────────────
  function getSuggestions(q) {
    if (!acceptatielijst) return [];
    const lower = q.toLowerCase();
    return Object.keys(acceptatielijst.straten || {})
      .filter(s => s.toLowerCase().includes(lower))
      .slice(0, 8);
  }

  // ── Build widget HTML ──────────────────────────────────────────────────────
  function buildWidget(container) {
    container.innerHTML = `
      <div class="gp-widget">
        <div class="gp-row">
          <div>
            <label class="gp-label" for="gp-straat">Straatnaam</label>
            <div class="gp-input-wrap">
              <input id="gp-straat" type="text" placeholder="Begin te typen…" autocomplete="off">
              <div class="gp-dropdown" id="gp-dropdown" style="display:none"></div>
            </div>
          </div>
          <div>
            <label class="gp-label" for="gp-huisnummer">Huisnummer</label>
            <input id="gp-huisnummer" type="number" min="1" placeholder="bijv. 12">
          </div>
        </div>
        <button class="gp-btn" id="gp-check-btn" onclick="gpCheckAdres()">Controleer adres</button>
        <div class="gp-error" id="gp-error"></div>
        <div class="gp-result" id="gp-result">
          <div class="gp-result-title" id="gp-result-title"></div>
          <div id="gp-result-body"></div>
        </div>
      </div>
    `;
    setupAutocomplete();
  }

  // ── Autocomplete ───────────────────────────────────────────────────────────
  function setupAutocomplete() {
    const input    = document.getElementById('gp-straat');
    const dropdown = document.getElementById('gp-dropdown');

    input.addEventListener('input', () => {
      const q = input.value.trim();
      hideResult();
      if (q.length < 2) { dropdown.style.display = 'none'; return; }
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        // Ensure list is loaded before suggesting
        try { await loadLijst(); } catch(e) { return; }
        showSuggestions(getSuggestions(q), input, dropdown);
      }, 150);
    });

    input.addEventListener('keydown', e => {
      const items = dropdown.querySelectorAll('div');
      if (!items.length) return;
      if (e.key === 'ArrowDown') { activeIdx = Math.min(activeIdx+1, items.length-1); highlight(items); e.preventDefault(); }
      if (e.key === 'ArrowUp')   { activeIdx = Math.max(activeIdx-1, 0); highlight(items); e.preventDefault(); }
      if (e.key === 'Enter' && activeIdx >= 0) { selectItem(items[activeIdx].textContent, input, dropdown); e.preventDefault(); }
      if (e.key === 'Escape') { dropdown.style.display = 'none'; }
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('.gp-input-wrap')) dropdown.style.display = 'none';
    });
  }

  function showSuggestions(suggestions, input, dropdown) {
    if (!suggestions.length) { dropdown.style.display = 'none'; return; }
    dropdown.innerHTML = '';
    activeIdx = -1;
    suggestions.forEach(s => {
      const div = document.createElement('div');
      div.textContent = s;
      div.onclick = () => selectItem(s, input, dropdown);
      dropdown.appendChild(div);
    });
    dropdown.style.display = 'block';
  }

  function highlight(items) {
    items.forEach((el, i) => el.classList.toggle('gp-active', i === activeIdx));
    if (activeIdx >= 0) items[activeIdx].scrollIntoView({ block: 'nearest' });
  }

  function selectItem(name, input, dropdown) {
    input.value = name;
    dropdown.style.display = 'none';
    document.getElementById('gp-huisnummer').focus();
  }

  // ── Check address ──────────────────────────────────────────────────────────
  window.gpCheckAdres = async function() {
    const straat = document.getElementById('gp-straat').value.trim();
    const hnRaw  = document.getElementById('gp-huisnummer').value.trim();

    hideResult();

    if (!straat) { showError('Vul een straatnaam in.'); return; }
    if (!hnRaw)  { showError('Vul een huisnummer in.'); return; }

    const hn = parseInt(hnRaw);
    if (isNaN(hn) || hn < 1) { showError('Vul een geldig huisnummer in.'); return; }

    const btn = document.getElementById('gp-check-btn');
    btn.disabled = true;
    btn.textContent = 'Bezig…';

    try {
      await loadLijst();
      const entry = (acceptatielijst?.straten || {})[straat];
      const accepted = entry && Array.isArray(entry.huisnummers) && entry.huisnummers.includes(hn);
      showResult(accepted);
    } catch(e) {
      showError(e.message || 'Er is een fout opgetreden.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Controleer adres';
    }
  };

  function showResult(accepted) {
    const result = document.getElementById('gp-result');
    const title  = document.getElementById('gp-result-title');
    const body   = document.getElementById('gp-result-body');
    result.className = 'gp-result ' + (accepted ? 'gp-yes' : 'gp-no');
    if (accepted) {
      title.textContent = 'U valt binnen ons werkgebied.';
      body.textContent  = 'U kunt zich inschrijven bij onze praktijk. Neem contact met ons op of gebruik het inschrijfformulier op deze website.';
    } else {
      title.textContent = 'U valt helaas niet in ons werkgebied.';
      body.textContent  = 'Deze straat valt buiten ons aannamegebied. Wij adviseren u een andere huisarts in uw buurt te zoeken via de zorgzoeker of uw zorgverzekeraar.';
    }
    result.style.display = 'block';
  }

  function hideResult() {
    document.getElementById('gp-result').style.display = 'none';
    document.getElementById('gp-error').style.display  = 'none';
  }

  function showError(msg) {
    const el = document.getElementById('gp-error');
    el.textContent = msg;
    el.style.display = 'block';
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  // Pre-load the list immediately if it's already on the page
  if (window.GP_ACCEPTATIELIJST) {
    acceptatielijst = window.GP_ACCEPTATIELIJST;
  }

  const container = document.getElementById('gp-acceptatie-widget');
  if (container) buildWidget(container);

})();
