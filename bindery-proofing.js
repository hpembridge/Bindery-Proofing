// ── Bindery Proofing — prototype behavior ──
// Everything here simulates what would become Angular state + event
// handlers. Markup lives in index.html; this file only:
//   1. tells each combobox where its suggestions come from (sheet data)
//   2. adds/removes rows and option cards (cloning the <template>s)
//   3. ties Function suggestions to Material and shows the Bookcloth field

(function () {
  'use strict';

  const form = document.getElementById('proof-form');
  const optionList = document.getElementById('option-list');
  const statusEl = document.getElementById('data-status');

  let DATA = null;   // shaped sheet data (see sheet-data.js)
  let uid = 0;       // for label/for pairs on cloned rows

  const TEMPLATE_IDS = { binding: 'tpl-binding', material: 'tpl-material' };


  // ── 1. Suggestion sources ─────────────────────────────────────

  function materialOf(row) {
    const el = row && row.querySelector('.material-row__material');
    return el && DATA.materials.find(m => m.name === el.dataset.value);
  }

  // The binding type picked in this row (null until one is chosen)
  function bindingTypeOf(row) {
    const el = row && row.querySelector('.binding-row__type');
    return el && DATA.bindingTypes.find(b => b.name === el.dataset.value) || null;
  }

  window.Combobox.optionsFor = function (el) {
    // Saved in this browser — available even before the sheet loads
    if (el.dataset.source === 'savedManagementGroup') return window.SavedSuggestions.list('managementGroup').map(value => ({ value }));
    if (el.dataset.source === 'savedCustomer') return window.SavedSuggestions.list('customer').map(value => ({ value }));
    if (!DATA) return [];
    const row = el.closest('[data-row]');

    switch (el.dataset.source) {
      case 'bindingTypes':
        return DATA.bindingTypes.map(b => ({ value: b.name }));
      case 'materials':
        return DATA.materials.map(m => ({ value: m.name }));
      case 'functions': {
        const m = materialOf(row);
        return m ? m.functions.map(value => ({ value })) : [];
      }
      case 'insertCount': {
        // "Variable" only when the binding type allows it (or none is picked yet)
        const b = bindingTypeOf(row);
        return !b || b.variable ? [{ value: 'Variable' }] : [];
      }
      case 'sizes': {
        // Standard and/or folded sizes, per the binding type's columns.
        // Rebuilt from the numeric columns so formatting matches typed sizes.
        const b = bindingTypeOf(row);
        return DATA.sizes
          .filter(sz => !b || (sz.folded ? b.folded : b.standard))
          .map(sz => ({ value: window.SizeFormat.format(sz, DATA.settings.inchMarks) }));
      }
      case 'detail': {
        const m = materialOf(row);
        const list = m && DATA.detailLists[m.detailList];
        return list ? list.map(value => ({ value })) : [];
      }
    }
    return [];
  };

  function setStatus(state, text) {
    statusEl.dataset.state = state;
    statusEl.querySelector('.data-status__text').textContent = text;
    const icon = statusEl.querySelector('.data-status__icon');
    icon.className = 'fa-solid data-status__icon ' + ({
      live: 'fa-circle-check',
      snapshot: 'fa-file-csv',
      fallback: 'fa-triangle-exclamation',
      error: 'fa-circle-xmark',
    })[state];
  }


  // Fade the status toast out (after `delay` ms), then hide it.
  function dismissStatus(delay) {
    setTimeout(() => {
      statusEl.classList.add('is-dismissed');
      const hide = () => { statusEl.hidden = true; };
      statusEl.addEventListener('transitionend', hide, { once: true });
      setTimeout(hide, 450);   // in case there's no transition (reduced motion)
    }, delay || 0);
  }
  statusEl.querySelector('[data-action="dismiss-status"]').addEventListener('click', () => dismissStatus());


  // ── 2. Rows & options ─────────────────────────────────────────

  function addRow(section, type, quiet) {
    const row = document.getElementById(TEMPLATE_IDS[type]).content.firstElementChild.cloneNode(true);
    section.querySelector('[data-rows="' + type + '"]').appendChild(row);
    wireRow(row);
    if (!quiet) row.querySelector('input').focus();
    return row;
  }

  function addOption() {
    const card = document.getElementById('tpl-option-card').content.firstElementChild.cloneNode(true);
    optionList.appendChild(card);
    renderFeatureToggles(card);
    renumberOptions();
    announce('bp:option-added', { card });
    return card;
  }

  // proof-page.js listens for these to update the Pages panel and selection
  function announce(type, detail) {
    document.dispatchEvent(new CustomEvent(type, { detail }));
  }

  function removeOption(card) {
    const cards = [...optionList.querySelectorAll('[data-option]')];
    if (cards.length === 1) return;   // always keep at least one option
    const index = cards.indexOf(card);
    card.remove();
    renumberOptions();
    announce('bp:option-removed', { card, index });
  }

  // Duplicate: copy the card as it stands (values, chips, toggles) right after it
  function duplicateOption(card) {
    const copy = card.cloneNode(true);
    // Typed values live on the elements, not in the markup, so copy them over
    const from = card.querySelectorAll('input, textarea');
    copy.querySelectorAll('input, textarea').forEach((el, i) => { el.value = from[i].value; });
    // Fresh ids for the cloned comboboxes; nothing open or mid-drag
    copy.querySelectorAll('[data-row]').forEach(wireRow);
    copy.querySelectorAll('.combobox__listbox').forEach(l => { l.hidden = true; });
    copy.querySelectorAll('.is-open, .is-dragging').forEach(el => el.classList.remove('is-open', 'is-dragging'));
    copy.querySelectorAll('[aria-expanded]').forEach(el => el.setAttribute('aria-expanded', 'false'));

    card.after(copy);
    renumberOptions();
    announce('bp:option-added', { card: copy, source: card });
    return copy;
  }

  function renumberOptions() {
    const cards = optionList.querySelectorAll('[data-option]');
    cards.forEach((card, i) => {
      const label = 'Option ' + (i + 1);
      card.querySelector('[data-option-title]').textContent = label;
      const del = card.querySelector('[data-action="remove-option"]');
      del.setAttribute('aria-label', 'Delete ' + label);
      del.disabled = cards.length === 1;   // always keep at least one option
      card.querySelector('[data-action="duplicate-option"]').setAttribute('aria-label', 'Duplicate ' + label);
    });
  }

  // Wire comboboxes and the detail label/input pair on a new row.
  function wireRow(row) {
    row.querySelectorAll('[data-combobox]').forEach(window.Combobox.setup);
    const label = row.querySelector('[data-detail-label]');
    const input = row.querySelector('.material-row__detail-input');
    if (label && input) {
      input.id = 'detail-' + (++uid);
      label.htmlFor = input.id;
    }
  }


  // Features: one toggle button per feature, grouped by the sheet's Type column.
  function renderFeatureToggles(card) {
    const host = card.querySelector('[data-feature-toggles]');
    if (!DATA || !host) return;
    host.replaceChildren();
    const types = [...new Set(DATA.features.map(f => f.type))];
    types.forEach(type => {
      const group = document.getElementById('tpl-feature-group').content.firstElementChild.cloneNode(true);
      const label = type + 's';
      group.setAttribute('aria-label', label);
      group.dataset.type = type;
      group.querySelector('.feature-toggles__label').textContent = label;
      const custom = group.querySelector('.custom-feature__input');
      custom.placeholder = 'Custom ' + type.toLowerCase();
      custom.setAttribute('aria-label', 'Custom ' + type.toLowerCase());
      const buttons = group.querySelector('.feature-toggles__buttons');
      DATA.features.filter(f => f.type === type).forEach(f => buttons.appendChild(makeToggle(f.name)));
      host.appendChild(group);
    });
  }


  // Custom features: one field per feature type. Saving adds a toggle to that
  // option only (not the sheet, not the other options), switched on. Switching
  // a custom toggle off removes it.

  function makeToggle(name, custom) {
    const btn = document.getElementById('tpl-feature-toggle').content.firstElementChild.cloneNode(true);
    btn.dataset.feature = name;
    btn.querySelector('.toggle-btn__label').textContent = name;
    if (custom) {
      btn.dataset.custom = '';
      btn.setAttribute('aria-pressed', 'true');
      btn.title = 'Click to remove';
    }
    return btn;
  }

  function addCustomToggle(card, type, name) {
    const g = [...card.querySelectorAll('.feature-toggles__group')].find(x => x.dataset.type === type);
    if (g) g.querySelector('.feature-toggles__buttons').appendChild(makeToggle(name, true));
  }

  function saveCustomFeature(group) {
    const card = group.closest('[data-option]');
    const type = group.dataset.type;
    const input = group.querySelector('.custom-feature__input');
    const typed = input.value.trim();
    if (!typed || !DATA) return;

    // Already a toggle in this option (from the sheet, or saved before)? Just switch it on.
    const existing = [...card.querySelectorAll('.toggle-btn')]
      .find(b => b.dataset.feature.toLowerCase() === typed.toLowerCase());
    if (existing) existing.setAttribute('aria-pressed', 'true');
    else addCustomToggle(card, type, typed);
    input.value = '';
    input.focus();
  }


  // ── Insert sizes: chips ───────────────────────────────────────

  function addSizeChip(comboEl, typed) {
    const sizes = comboEl.closest('.binding-row__sizes');
    const result = window.SizeFormat.parse(typed, { inchMarks: DATA && DATA.settings.inchMarks });
    const input = comboEl.querySelector('input');

    if (!result.ok) {
      sizes.querySelector('[data-size-error]').hidden = false;
      input.setAttribute('aria-invalid', 'true');
      return;
    }

    // Consume the Insert Count: each chip stores { count, size }
    const row = comboEl.closest('.binding-row');
    const countEl = row.querySelector('.binding-row__count');
    const count = countEl.querySelector('input').value.trim();
    const label = (count ? '(' + count + ') ' : '') + result.text;

    const box = sizes.querySelector('[data-chip-input]');
    const exists = [...box.querySelectorAll('[data-chip]')].some(c => c.dataset.value === label);
    if (!exists) {
      const chip = document.getElementById('tpl-size-chip').content.firstElementChild.cloneNode(true);
      setChip(chip, count, result);
      box.insertBefore(chip, comboEl);
    }
    window.Combobox.reset(comboEl);
    updateSizeState(sizes);

    // Clear the count and jump back to it for the next count + size
    window.Combobox.setValue(countEl, '');
    updateBindingWording(row);
    countEl.querySelector('input').focus();
  }

  // Write a chip's count + parsed size into its data and text.
  function setChip(chip, count, result) {
    const label = (count ? '(' + count + ') ' : '') + result.text;
    chip.dataset.value = label;
    chip.dataset.count = count;
    chip.dataset.size = result.text;
    chip.querySelector('.chip__count').textContent = count;
    chip.querySelector('.chip__label').textContent = result.text;
    chip.querySelector('.chip__remove').setAttribute('aria-label', 'Remove ' + label);
    chip.classList.toggle('chip--warning', !!result.warning);
    chip.dataset.warning = result.warning || '';
    chip.title = result.warning || '';
  }

  // Editing a chip in place: the count can be anything; the size is
  // re-checked and re-formatted, or put back if it isn't a size.
  function commitChipEdit(chip) {
    const sizes = chip.closest('.binding-row__sizes');
    const count = chip.querySelector('.chip__count').textContent.trim();
    const typed = chip.querySelector('.chip__label').textContent;
    const result = window.SizeFormat.parse(typed, { inchMarks: DATA && DATA.settings.inchMarks });
    const ok = result.ok;
    setChip(chip, count, ok ? result : window.SizeFormat.parse(chip.dataset.size, { inchMarks: DATA && DATA.settings.inchMarks }));
    updateSizeState(sizes);
    sizes.querySelector('[data-size-error]').hidden = ok;
  }

  // Placeholder only when empty; list any fold warnings under the field.
  function updateSizeState(sizes) {
    const chips = [...sizes.querySelectorAll('[data-chip]')];
    const input = sizes.querySelector('.chip-input__input');
    input.placeholder = chips.length ? 'Add size' : 'Insert Size';
    input.setAttribute('aria-invalid', 'false');
    sizes.querySelector('[data-size-error]').hidden = true;

    const warnings = chips.map(c => c.dataset.warning).filter(Boolean);
    sizes.querySelector('[data-size-warning]').hidden = !warnings.length;
    sizes.querySelector('[data-size-warning-text]').textContent = warnings.join(' ');
  }


  // ── 3. Material → Function / detail ───────────────────────────

  function onMaterialCommit(row) {
    const material = materialOf(row);

    // Function: enable once a material is picked; clear if no longer eligible
    const fnEl = row.querySelector('.material-row__function');
    const fnInput = fnEl.querySelector('input');
    fnInput.disabled = !material;
    if (!material || !material.functions.includes(fnEl.dataset.value)) {
      window.Combobox.setValue(fnEl, '');
    }

    // Detail field (e.g. Bookcloth → pick the actual cloth)
    const detail = row.querySelector('.material-row__detail');
    const detailEl = detail.querySelector('[data-combobox]');
    const tab = material && material.detailList;
    if ((detail.dataset.list || '') !== (tab || '')) {   // list changed → clear old pick
      window.Combobox.setValue(detailEl, '');
      setDetailWarning(detail, false);
    }
    detail.hidden = !tab;
    detail.dataset.list = tab || '';
    if (tab) detail.querySelector('[data-detail-label]').textContent = titleCase(tab);
  }

  // Typed a detail that isn't on the list (e.g. a bookcloth not in the sheet).
  // It's allowed and prints as typed; the warning just says so.
  function setDetailWarning(detail, show) {
    const warning = detail.querySelector('[data-detail-warning]');
    const input = detail.querySelector('.material-row__detail-input');
    input.setAttribute('aria-invalid', 'false');    // combobox marks it invalid; here it's only a warning
    input.classList.toggle('field--warning', show);
    if (show) {
      const typed = input.value.trim();
      const list = titleCase(detail.dataset.list || '').toLowerCase();
      warning.querySelector('[data-detail-warning-text]').textContent =
        '“' + typed + '” isn’t on the ' + list + ' list. It will print as typed.';
    }
    warning.hidden = !show;
  }

  function titleCase(s) {
    return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }


  // ── Events (delegated) ────────────────────────────────────────

  form.addEventListener('click', e => {
    const toggle = e.target.closest('.toggle-btn');
    if (toggle) {
      if (toggle.hasAttribute('data-custom')) {
        // Custom toggles are always on; switching one off removes it
        const input = toggle.closest('.feature-toggles__group').querySelector('.custom-feature__input');
        toggle.remove();
        input.focus();
        return;
      }
      toggle.setAttribute('aria-pressed', String(toggle.getAttribute('aria-pressed') !== 'true'));
      return;
    }

    // Clicking the empty part of a chip field focuses its input
    if (e.target.matches('[data-chip-input]')) {
      e.target.querySelector('.chip-input__input').focus();
      return;
    }

    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    switch (btn.dataset.action) {
      case 'add-row':
        addRow(btn.closest('.option-section'), btn.dataset.rowType);
        break;
      case 'save-custom-feature':
        saveCustomFeature(btn.closest('.feature-toggles__group'));
        break;
      case 'remove-chip': {
        const sizes = btn.closest('.binding-row__sizes');
        btn.closest('[data-chip]').remove();
        updateSizeState(sizes);
        sizes.querySelector('.chip-input__input').focus();
        break;
      }
      case 'remove-row':
        btn.closest('[data-row]').remove();
        break;
      case 'add-option':
        addOption();
        break;
      case 'duplicate-option':
        duplicateOption(btn.closest('[data-option]'));
        break;
      case 'remove-option':
        removeOption(btn.closest('[data-option]'));
        break;
    }
  });

  form.addEventListener('combobox:enter', e => {
    if (e.target.dataset.source === 'sizes') addSizeChip(e.target, e.detail.value);
    if (e.target.dataset.source === 'insertCount' || e.target.dataset.source.startsWith('saved')) {
      window.Combobox.setValue(e.target, e.detail.value);
      window.Combobox.reset(e.target, true);   // keep the text, close the list
      const row = e.target.closest('.binding-row');
      if (row) updateBindingWording(row);
    }
  });

  // Chip editing: remember the text on focus, Enter commits, Esc puts it back
  form.addEventListener('focusin', e => {
    if (e.target.matches('.chip__count, .chip__label')) e.target.dataset.before = e.target.textContent;
  });
  form.addEventListener('focusout', e => {
    if (e.target.matches('.chip__count, .chip__label')) commitChipEdit(e.target.closest('[data-chip]'));
  });
  form.addEventListener('keydown', e => {
    if (!e.target.matches('.chip__count, .chip__label')) return;
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    if (e.key === 'Escape') { e.target.textContent = e.target.dataset.before; e.target.blur(); }
  });

  // Enter in the custom feature field = Save
  form.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.matches('.custom-feature__input')) return;
    e.preventDefault();
    saveCustomFeature(e.target.closest('.feature-toggles__group'));
  });

  // Backspace in an empty size field removes the last chip
  form.addEventListener('keydown', e => {
    if (e.key !== 'Backspace' || !e.target.matches('.chip-input__input') || e.target.value) return;
    const chips = e.target.closest('[data-chip-input]').querySelectorAll('[data-chip]');
    if (!chips.length) return;
    chips[chips.length - 1].remove();
    updateSizeState(e.target.closest('.binding-row__sizes'));
  });

  form.addEventListener('combobox:commit', e => {
    const el = e.target;
    if (el.matches('.binding-row__type')) updateBindingWording(el.closest('.binding-row'));
    if (el.matches('.material-row__material')) onMaterialCommit(el.closest('[data-row]'));
    if (el.dataset.source === 'detail') {
      setDetailWarning(el.closest('.material-row__detail'), e.detail.value === null);
    }
  });

  // Binding row wording: "Corners hold 2 inserts" / "Ring Binder holds 1 insert"
  function updateBindingWording(row) {
    const type = row.querySelector('.binding-row__type input').value.trim();
    const count = row.querySelector('.binding-row__count input').value.trim();
    row.querySelector('[data-holds]').textContent = /s$/i.test(type) ? 'hold' : 'holds';
    row.querySelector('[data-inserts]').textContent = Number(count) === 1 ? 'insert' : 'inserts';
  }

  // Hide the detail error as soon as the user starts fixing it.
  form.addEventListener('input', e => {
    const bindingRow = e.target.closest('.binding-row');
    if (bindingRow) updateBindingWording(bindingRow);

    if (e.target.matches('.chip-input__input')) {
      e.target.setAttribute('aria-invalid', 'false');
      e.target.closest('.binding-row__sizes').querySelector('[data-size-error]').hidden = true;
    }

    const detail = e.target.closest('.material-row__detail');
    if (detail) setDetailWarning(detail, false);
  });


  // ── Init ──────────────────────────────────────────────────────

  async function init() {
    renumberOptions();
    form.querySelectorAll('.job-details [data-combobox]').forEach(window.Combobox.setup);
    try {
      const { source, data } = await window.loadSheetData();
      DATA = data;
      optionList.querySelectorAll('[data-option]').forEach(renderFeatureToggles);
      document.dispatchEvent(new CustomEvent('bp:ready'));   // proof-footer.js re-renders
      setStatus(source, {
        live: 'Lists loaded live from the Google Sheet.',
        snapshot: 'Lists loaded from the CSV snapshot in data/ (no Google Sheet configured).',
        fallback: 'Couldn’t reach the Google Sheet — showing the CSV snapshot in data/.',
      }[source]);
      if (source === 'live') dismissStatus(1500);   // success fades out; warnings stay until dismissed
    } catch (err) {
      console.error(err);
      setStatus('error', 'Couldn’t load the lists. Serve this folder over http (python3 -m http.server).');
    }
  }

  // ── Save / reload the options (embedded in the PDF by proof-page.js) ──

  const inputVal = (root, sel) => root.querySelector(sel).value.trim();

  function serializeOptions() {
    return [...optionList.querySelectorAll('[data-option]')].map(card => ({
      bindings: [...card.querySelectorAll('.binding-row')].map(row => ({
        type: inputVal(row, '.binding-row__type input'),
        count: inputVal(row, '.binding-row__count input'),
        chips: [...row.querySelectorAll('[data-chip]')].map(c => ({ count: c.dataset.count, size: c.dataset.size })),
      })),
      materials: [...card.querySelectorAll('.material-row')].map(row => ({
        material: inputVal(row, '.material-row__material input'),
        detail: row.querySelector('.material-row__detail').hidden ? '' : inputVal(row, '.material-row__detail-input'),
        fn: inputVal(row, '.material-row__function input'),
      })),
      features: [...card.querySelectorAll('.toggle-btn[aria-pressed="true"]:not([data-custom])')].map(b => b.dataset.feature),
      custom: [...card.querySelectorAll('.toggle-btn[data-custom]')].map(b => ({
        name: b.dataset.feature,
        type: b.closest('.feature-toggles__group').dataset.type,
      })),
    }));
  }

  // Custom features are saved per option now (serializeOptions → custom).
  // Kept so older callers still work.
  function serializeCustom() { return []; }

  // `legacyCustom`: PDFs saved before custom features were per-option had one
  // shared list; those become custom toggles in the options that had them on.
  function restoreOptions(options, legacyCustom) {
    optionList.querySelectorAll('[data-option]').forEach(c => c.remove());

    const fill = (el, value) => window.Combobox.setValue(el, value || '');
    const cards = (options.length ? options : [{}]).map(opt => {
      const card = document.getElementById('tpl-option-card').content.firstElementChild.cloneNode(true);
      optionList.appendChild(card);
      renderFeatureToggles(card);
      const sections = card.querySelectorAll('.option-section');

      (opt.bindings || []).forEach(b => {
        const row = addRow(sections[0], 'binding', true);
        fill(row.querySelector('.binding-row__type'), b.type);
        fill(row.querySelector('.binding-row__count'), b.count);
        const box = row.querySelector('[data-chip-input]');
        const combo = box.querySelector('.chip-input__combobox');
        (b.chips || []).forEach(c => {
          const result = window.SizeFormat.parse(c.size, { inchMarks: DATA.settings.inchMarks });
          const chip = document.getElementById('tpl-size-chip').content.firstElementChild.cloneNode(true);
          setChip(chip, c.count || '', result.ok ? result : { text: c.size, warning: null });
          box.insertBefore(chip, combo);
        });
        updateSizeState(row.querySelector('.binding-row__sizes'));
        updateBindingWording(row);
      });

      (opt.materials || []).forEach(m => {
        const row = addRow(sections[1], 'material', true);
        fill(row.querySelector('.material-row__material'), m.material);
        onMaterialCommit(row);   // enables Function, shows the bookcloth search
        if (m.detail) fill(row.querySelector('.material-row__detail [data-combobox]'), m.detail);
        fill(row.querySelector('.material-row__function'), m.fn);
      });

      (opt.features || []).forEach(name => {
        const btn = [...card.querySelectorAll('.toggle-btn')].find(t => t.dataset.feature === name);
        if (btn) { btn.setAttribute('aria-pressed', 'true'); return; }
        const old = (legacyCustom || []).find(c => c.name === name);
        if (old) addCustomToggle(card, old.type, old.name);
      });
      (opt.custom || []).forEach(c => addCustomToggle(card, c.type, c.name));
      return card;
    });

    renumberOptions();
    announce('bp:restored', { cards });
  }

  // Read-only access to the sheet data for proof-footer.js
  window.BP = {
    data: () => DATA,
    renumber: renumberOptions,
    addOption,
    duplicateOption,
    removeOption,
    serializeOptions,
    serializeCustom,
    restoreOptions,
    ready: () => !!DATA,
  };

  init();
})();
