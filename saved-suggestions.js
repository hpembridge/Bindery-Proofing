// ── Saved suggestions (Management Group, Customer) + Settings dialog ──
// Remembers values typed into Management Group and Customer in this
// browser (localStorage) and offers them back as type-ahead suggestions.
// The Settings dialog turns this on/off and removes individual entries.
//
// localStorage is per browser and per person, so each designer builds their
// own list. In Angular this becomes a small service + a settings dialog.

(function () {
  'use strict';

  const STORE_KEY = 'bindery-proofing.saved-suggestions';
  const FIELDS = {
    managementGroup: { input: '#management-group', label: 'Management groups' },
    customer: { input: '#customer', label: 'Customers' },
  };

  // ── Storage (wrapped: private windows can throw or come back empty) ──

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORE_KEY));
      if (data && typeof data === 'object') return data;
    } catch (err) { /* fall through to defaults */ }
    return { enabled: true, managementGroup: [], customer: [] };
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (err) { /* not saved */ }
  }

  const state = load();
  Object.keys(FIELDS).forEach(key => { if (!Array.isArray(state[key])) state[key] = []; });


  // ── API used by bindery-proofing.js (suggestion source) ──

  window.SavedSuggestions = {
    list(key) {
      return state.enabled ? state[key].slice().sort((a, b) => a.localeCompare(b)) : [];
    },
  };

  function remember(key, value) {
    const v = value.trim();
    if (!state.enabled || !v) return;
    if (state[key].some(x => x.toLowerCase() === v.toLowerCase())) return;
    state[key].push(v);
    save();
  }

  // Save when you leave the field with something in it
  Object.entries(FIELDS).forEach(([key, f]) => {
    document.querySelector(f.input).addEventListener('change', e => remember(key, e.target.value));
  });


  // ── Settings dialog ──

  const dialog = document.getElementById('settings-dialog');
  const enabledBox = document.getElementById('settings-suggestions-enabled');
  const tpl = id => document.getElementById(id).content.firstElementChild;

  function renderSettings() {
    enabledBox.checked = state.enabled;
    Object.keys(FIELDS).forEach(key => {
      const group = dialog.querySelector('[data-saved-list="' + key + '"]');
      const ul = group.querySelector('.saved-list__items');
      const items = state[key].slice().sort((a, b) => a.localeCompare(b));
      ul.replaceChildren(...items.map(value => {
        const li = tpl('tpl-saved-item').cloneNode(true);
        li.querySelector('.saved-list__text').textContent = value;
        const btn = li.querySelector('[data-action="remove-saved"]');
        btn.dataset.key = key;
        btn.dataset.value = value;
        btn.setAttribute('aria-label', 'Remove ' + value);
        return li;
      }));
      group.querySelector('.saved-list__empty').hidden = items.length > 0;
      group.querySelector('[data-action="clear-saved"]').disabled = !items.length;
    });
  }

  document.getElementById('settings-open').addEventListener('click', () => {
    renderSettings();
    dialog.showModal();
  });

  enabledBox.addEventListener('change', () => {
    state.enabled = enabledBox.checked;
    save();
  });

  dialog.addEventListener('click', e => {
    if (e.target === dialog) { dialog.close(); return; }   // click on the backdrop
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'remove-saved':
        state[btn.dataset.key] = state[btn.dataset.key].filter(v => v !== btn.dataset.value);
        break;
      case 'clear-saved':
        state[btn.closest('[data-saved-list]').dataset.savedList] = [];
        break;
      case 'close-settings':
        dialog.close();
        return;
    }
    save();
    renderSettings();
  });
})();
