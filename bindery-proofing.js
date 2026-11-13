// ── Bindery Proofing — option editor behavior ──
// Everything here simulates what would become Angular state + event
// handlers. Markup lives in index.html (the option card and row
// <template>s); this file only:
//   1. tells each combobox where its suggestions come from (sheet data)
//   2. keeps one empty row at the bottom of every table (no Add buttons):
//      typing in it adds the next one; a row cleared of every value is
//      removed when focus leaves it
//   3. keeps the count columns in step with the option's image labels
//   4. ties Function to Type and Location, and checks sizes
//   5. turns an option into footer content, and saves / restores options
//
// Tables (per option): Material, Inserts, Decoration, Other.
// Count columns: one per image label on the option's page (Exterior,
// Interior…). Inserts only shows the ones that usually hold inserts
// (location_labels tab) unless you add others. With no images yet there's a single "Qty" column, whose
// counts move to the first image once there is one.

(function () {
  'use strict';

  const form = document.getElementById('proof-form');
  const optionList = document.getElementById('option-list');
  const statusEl = document.getElementById('data-status');

  let DATA = null;   // shaped sheet data (see sheet-data.js)

  const ROW_TEMPLATES = {
    material: 'tpl-material-row',
    insert: 'tpl-insert-row',
    decoration: 'tpl-feature-row',
    other: 'tpl-feature-row',
  };
  const NO_IMAGE = '';   // count column used before any image is added

  const tpl = id => document.getElementById(id).content.firstElementChild.cloneNode(true);
  const cardsAll = () => [...optionList.querySelectorAll('[data-option]')];
  const valueOf = (root, sel) => {
    const el = root.querySelector(sel);
    return el ? el.value.trim() : '';
  };


  // ══ 1. Suggestion sources ═══════════════════════════════════════

  const comboValue = (row, sel) => {
    const el = row && row.querySelector(sel);
    return el ? el.dataset.value || '' : '';
  };
  const materialOf = row => DATA.materials.find(m => m.name === comboValue(row, '.material-row__type')) || null;
  // Functions for a material row: the Type's functions (materials tab), narrowed
  // to the ones that go on its Location (functions_labels tab). A location
  // that isn't a functions_labels column doesn't narrow anything.
  function functionsFor(row) {
    const m = materialOf(row);
    if (!m) return [];
    const location = comboValue(row, '.material-row__location') || valueOf(row, '.material-row__location input');
    if (!location || !DATA.functionColumns.includes(location)) return m.functions;
    return m.functions.filter(f => (DATA.functionLabels[f] || []).includes(location));
  }

  const bindingOf = row => DATA.bindingTypes.find(b => b.name === comboValue(row, '.insert-row__binding')) || null;

  window.Combobox.optionsFor = function (el) {
    // Saved in this browser — available even before the sheet loads
    if (el.dataset.source === 'savedManagementGroup') return window.SavedSuggestions.list('managementGroup').map(value => ({ value }));
    if (el.dataset.source === 'savedCustomer') return window.SavedSuggestions.list('customer').map(value => ({ value }));
    if (!DATA) return [];
    const row = el.closest('[data-row]');

    switch (el.dataset.source) {
      case 'materials':
        return DATA.materials.map(m => ({ value: m.name }));
      case 'detail': {
        const m = materialOf(row);
        const list = m && DATA.detailLists[m.detailList];
        return list ? list.map(value => ({ value })) : [];
      }
      case 'functions':
        return functionsFor(row).map(value => ({ value }));
      case 'locations':   // the option's image labels
        return columnsOf(el.closest('[data-option]')).filter(Boolean).map(value => ({ value }));
      case 'insertCount': {
        // "Multiple" when the binding type allows it (sheet's "variable" column), or none is picked yet
        const b = bindingOf(row);
        return !b || b.variable ? [{ value: 'Multiple' }] : [];
      }
      case 'sizes': {
        // Standard and/or folded sizes, per the row's binding type (all sizes until one is picked)
        const b = bindingOf(row);
        return DATA.sizes
          .filter(sz => !b || (sz.folded ? b.folded : b.standard))
          .map(sz => ({ value: window.SizeFormat.format(sz, DATA.settings.inchMarks) }));
      }
      case 'bindingTypes':
        return DATA.bindingTypes.map(b => ({ value: b.name }));
      case 'decorations':
        return DATA.features.filter(f => f.type === 'Decoration').map(f => ({ value: f.name }));
      case 'others':
        return DATA.features.filter(f => f.type !== 'Decoration').map(f => ({ value: f.name }));
      case 'imageLabels':   // proof image labels on the canvas (proof-page.js)
        return DATA.imageLabels.map(value => ({ value }));
    }
    return [];
  };


  // ══ Data-source status toast (prototype only) ═══════════════════

  function setStatus(state, text) {
    statusEl.dataset.state = state;
    statusEl.querySelector('.data-status__text').textContent = text;
    statusEl.querySelector('.data-status__icon').className = 'fa-solid data-status__icon ' + ({
      live: 'fa-circle-check',
      snapshot: 'fa-file-csv',
      fallback: 'fa-triangle-exclamation',
      error: 'fa-circle-xmark',
    })[state];
  }

  // Fade the toast out (after `delay` ms), then hide it.
  function dismissStatus(delay) {
    setTimeout(() => {
      statusEl.classList.add('is-dismissed');
      const hide = () => { statusEl.hidden = true; };
      statusEl.addEventListener('transitionend', hide, { once: true });
      setTimeout(hide, 450);   // no transition (reduced motion)
    }, delay || 0);
  }
  statusEl.querySelector('[data-action="dismiss-status"]').addEventListener('click', () => dismissStatus());


  // ══ 2. Rows: always one empty row at the bottom ═════════════════

  const tables = card => [...card.querySelectorAll('[data-rows]')];
  const rowsOf = tbody => [...tbody.querySelectorAll(':scope > [data-row]')];

  // A row is blank when every field is empty. Counts that were filled in
  // automatically (one image → 1) don't count, so clearing the name still
  // lets the row go.
  function isBlank(row) {
    return [...row.querySelectorAll('input')].every(i => !i.value.trim() || i.hasAttribute('data-auto'));
  }

  function newRow(tbody) {
    const type = tbody.dataset.rows;
    const row = tpl(ROW_TEMPLATES[type]);
    row.dataset.row = type;
    if (type === 'decoration' || type === 'other') {
      const combo = row.querySelector('.feature-row__name');
      combo.dataset.source = type === 'decoration' ? 'decorations' : 'others';
      const input = combo.querySelector('input');
      input.placeholder = type === 'decoration' ? 'Decoration' : 'Other';
      input.setAttribute('aria-label', input.placeholder);
    }
    row.querySelectorAll('[data-combobox]').forEach(window.Combobox.setup);
    tbody.appendChild(row);
    buildCountCells(row, columnsFor(tbody.closest('[data-option]'), tbody));
    setRowState(row);
    return row;
  }

  // Blank rows can't be dragged (the empty one always stays at the bottom)
  function setRowState(row) {
    const blank = isBlank(row);
    row.classList.toggle('is-blank', blank);
    if (blank) row.removeAttribute('data-sortable-item');
    else row.setAttribute('data-sortable-item', '');
    row.querySelector('[data-drag-handle]').tabIndex = blank ? -1 : 0;
  }

  // Exactly one blank row, at the bottom
  function ensureTrailingRow(tbody) {
    const rows = rowsOf(tbody);
    const last = rows[rows.length - 1];
    if (!last || !isBlank(last)) newRow(tbody);
  }

  // Focus left a row: if it's blank (and not the last), it goes
  function tidyRow(row) {
    const tbody = row.parentElement;
    if (!tbody) return;
    const rows = rowsOf(tbody);
    if (isBlank(row) && row !== rows[rows.length - 1]) row.remove();
    else setRowState(row);
    ensureTrailingRow(tbody);
  }


  // ══ 3. Count columns = the option's image labels ════════════════

  // Image labels in page order, plus any label a count still refers to
  // (e.g. after a reload, before the images are back). Nothing at all →
  // one "Qty" column.
  function columnsOf(card) {
    if (!card) return [NO_IMAGE];
    const labels = [];
    const add = l => { if (l && !labels.includes(l)) labels.push(l); };
    (card._imageLabels || []).forEach(add);
    card.querySelectorAll('[data-count-col]').forEach(cell => {
      const input = cell.querySelector('input');
      if (input && input.value.trim()) add(cell.dataset.countCol);
    });
    return labels.length ? labels : [NO_IMAGE];
  }

  // Called by proof-page.js whenever an option's images change
  function setImageLabels(card, labels) {
    card._imageLabels = labels.filter(Boolean);
    renderColumns(card);
  }

  // Does this location usually hold inserts? (location_labels → holds_inserts)
  // A label that isn't on that tab might, so it counts as yes.
  function holdsInserts(label) {
    const entry = DATA && DATA.locationLabels.find(l => l.label.toLowerCase() === label.toLowerCase());
    return entry ? entry.holdsInserts : true;
  }

  const hasCounts = (tbody, label) => [...tbody.querySelectorAll('[data-count-col="' + CSS.escape(label) + '"] input')]
    .some(i => i.value.trim());

  // Count columns for one table. Inserts only shows the locations that
  // usually hold inserts, plus any added with "+ Add location" and any that
  // already have counts. The other tables show every location.
  function columnsFor(card, tbody) {
    const all = columnsOf(card);
    if (tbody.dataset.rows !== 'insert' || all[0] === NO_IMAGE) return all;
    const added = card._insertExtra || [];
    return all.filter(l => holdsInserts(l) || added.includes(l) || hasCounts(tbody, l));
  }

  // Rebuild header + count cells only when a table's columns change
  function renderColumns(card) {
    const all = columnsOf(card);
    const plan = [...card.querySelectorAll('[data-count-table]')].map(table => {
      const tbody = table.querySelector('[data-rows]');
      let cols = columnsFor(card, tbody);
      // Counts made before there were images move to the first image column
      const moved = [];
      if (all[0] !== NO_IMAGE) {
        tbody.querySelectorAll('[data-count-col=""] input').forEach(input => {
          if (input.value.trim()) moved.push({ row: input.closest('[data-row]'), value: input.value, auto: input.hasAttribute('data-auto') });
        });
      }
      // ...but in Inserts, only once there's a column that holds inserts;
      // until then they stay in "Qty"
      if (moved.length && !cols.length) cols = [NO_IMAGE];
      return { table, tbody, cols, moved };
    });

    const key = all.join('\u0001') + '|' + plan.map(t => t.cols.join('\u0001')).join('|');
    if (card._colKey === key) return;
    card._colKey = key;

    plan.forEach(({ table, tbody, cols, moved }) => {
      const anchor = table.querySelector('thead [data-counts-anchor]');
      table.querySelectorAll('thead [data-count-head]').forEach(th => th.remove());
      cols.slice().reverse().forEach(label => {
        const th = tpl('tpl-count-head');
        th.dataset.countHead = label;
        th.textContent = label || 'Qty';
        const orphan = !!label && !(card._imageLabels || []).includes(label);
        th.classList.toggle('is-orphan', orphan);
        th.title = orphan ? 'No image on this page is labeled ' + label : '';
        anchor.after(th);
      });
      rowsOf(tbody).forEach(row => buildCountCells(row, cols));
      if (cols[0] !== NO_IMAGE) moved.forEach(({ row, value, auto }) => {
        const target = row.querySelector('[data-count-col="' + CSS.escape(cols[0]) + '"] input');
        if (target && !target.value.trim()) {
          target.value = value;
          target.toggleAttribute('data-auto', auto);
        }
      });
    });

    renderAddLocation(card, all, plan.find(t => t.tbody.dataset.rows === 'insert').cols);
  }

  // "+ Add location" next to the Inserts heading: the page's locations that
  // aren't columns yet. Hidden when there are none.
  function renderAddLocation(card, all, shown) {
    const wrap = card.querySelector('[data-add-location]');
    const select = wrap.querySelector('select');
    const hidden = all.filter(l => l && !shown.includes(l));
    select.querySelectorAll('option:not([value=""])').forEach(o => o.remove());
    hidden.forEach(label => {
      const option = tpl('tpl-add-location-option');
      option.value = label;
      option.textContent = label;
      select.appendChild(option);
    });
    select.value = '';
    wrap.hidden = !hidden.length;
  }

  function addLocation(card, label) {
    card._insertExtra = (card._insertExtra || []).concat(label);
    renderColumns(card);
    const first = card.querySelector('[data-rows="insert"] [data-count-col="' + CSS.escape(label) + '"] input');
    if (first) first.focus();
  }

  // One count cell per column, after the row's [data-counts-anchor] cell.
  // Values are kept by label.
  function buildCountCells(row, cols) {
    const anchor = row.querySelector('[data-counts-anchor]');
    if (!anchor) return;   // Material rows have no counts
    const values = {}, auto = {};
    row.querySelectorAll('[data-count-col]').forEach(cell => {
      const input = cell.querySelector('input');
      values[cell.dataset.countCol] = input.value;
      auto[cell.dataset.countCol] = input.hasAttribute('data-auto');
      cell.remove();
    });
    const cellTemplate = row.matches('.insert-row') ? 'tpl-insert-count-cell' : 'tpl-count-cell';
    cols.slice().reverse().forEach(label => {
      const cell = tpl(cellTemplate);
      cell.querySelectorAll('[data-combobox]').forEach(window.Combobox.setup);
      cell.dataset.countCol = label;
      const input = cell.querySelector('input');
      input.setAttribute('aria-label', (label || 'Quantity') + ' count');
      input.value = values[label] || '';
      if (auto[label]) input.setAttribute('data-auto', '');
      anchor.after(cell);
    });
  }

  // An image label was renamed on the canvas: counts and Locations follow
  function renameColumn(card, from, to) {
    if (!from || !to || from === to) return;
    card.querySelectorAll('[data-count-col="' + CSS.escape(from) + '"]').forEach(cell => { cell.dataset.countCol = to; });
    card._insertExtra = (card._insertExtra || []).map(l => l === from ? to : l);
    card.querySelectorAll('.material-row__location').forEach(el => {
      if (el.dataset.value === from) window.Combobox.setValue(el, to);
    });
    card._colKey = null;
  }

  // One column and an untouched count: fill in 1 so a one-image option
  // works without touching the counts. Marked data-auto (see isBlank).
  // Only once per row: if you clear the 1, it stays cleared.
  // Not for Inserts: the count there is real information, so you type it.
  function autoCount(row) {
    if (row._autoCounted || row.matches('.insert-row')) return;
    const cells = row.querySelectorAll('[data-count-col] input');
    if (cells.length !== 1 || cells[0].value.trim()) return;
    const named = [...row.querySelectorAll('.combobox__input:not(.spec-count)')].some(i => i.value.trim());
    if (!named) return;
    row._autoCounted = true;
    const combo = cells[0].closest('[data-combobox]');
    if (combo) window.Combobox.setValue(combo, '1');   // counts as picked, so the list still shows "Multiple"
    else cells[0].value = '1';
    cells[0].setAttribute('data-auto', '');
  }

  // Clicking into a filled-in 1 selects it, so typing replaces it
  form.addEventListener('focusin', e => {
    if (e.target.matches('[data-count-col] input[data-auto]')) e.target.select();
  });


  // ══ 4. Field rules ══════════════════════════════════════════════

  // Type picked: Function suggestions follow it; Name searches its detail
  // list (Bookcloth, Rockboard) or is free text when it has none.
  function onTypeCommit(row) {
    const material = materialOf(row);
    const fnEl = row.querySelector('.material-row__function');
    fnEl.querySelector('input').disabled = !material;
    if (!material || !functionsFor(row).includes(fnEl.dataset.value)) window.Combobox.setValue(fnEl, '');

    // One image on the page: that's the Location (marked data-auto, see isBlank)
    const locEl = row.querySelector('.material-row__location');
    const locInput = locEl.querySelector('input');
    const cols = columnsOf(row.closest('[data-option]')).filter(Boolean);
    if (material && !locInput.value.trim() && cols.length === 1) {
      window.Combobox.setValue(locEl, cols[0]);
      locInput.setAttribute('data-auto', '');
    }

    const nameEl = row.querySelector('.material-row__name');
    const list = material && material.detailList && DATA.detailLists[material.detailList] ? material.detailList : '';
    if ((nameEl.dataset.list || '') !== list) {
      window.Combobox.setValue(nameEl, '');
      setNameWarning(row, false);
    }
    nameEl.dataset.list = list;
    nameEl.toggleAttribute('data-freeform', !list);   // no list → any name, no warning
    nameEl.querySelector('input').placeholder = list ? 'Search ' + list.toLowerCase() : 'Name';
  }

  // A name that isn't on the type's list is allowed (prints as typed), with a warning
  function setNameWarning(row, show) {
    const nameEl = row.querySelector('.material-row__name');
    const input = nameEl.querySelector('input');
    const warning = row.querySelector('[data-name-warning]');
    input.setAttribute('aria-invalid', 'false');    // combobox marks it invalid; here it's only a warning
    input.classList.toggle('field--warning', show);
    if (show) {
      warning.querySelector('[data-name-warning-text]').textContent =
        '“' + input.value.trim() + '” isn’t on the ' + (nameEl.dataset.list || '').toLowerCase() + ' list. It will print as typed.';
    }
    warning.hidden = !show;
  }

  // Location picked: Function suggestions narrow to it; a function that
  // doesn't go there is cleared
  function onLocationCommit(row) {
    row.querySelector('.material-row__location input').removeAttribute('data-auto');
    const fnEl = row.querySelector('.material-row__function');
    if (fnEl.dataset.value && !functionsFor(row).includes(fnEl.dataset.value)) window.Combobox.setValue(fnEl, '');
  }

  // Size: checked and formatted when you leave it (any W x H, not just the list)
  function commitSize(row) {
    const el = row.querySelector('.insert-row__size');
    const input = el.querySelector('input');
    const typed = input.value.trim();
    const error = row.querySelector('[data-size-error]');
    const warning = row.querySelector('[data-size-warning]');
    warning.hidden = true;
    error.hidden = true;
    input.setAttribute('aria-invalid', 'false');
    if (!typed) return;
    const result = window.SizeFormat.parse(typed, { inchMarks: DATA && DATA.settings.inchMarks });
    if (!result.ok) {
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      return;
    }
    window.Combobox.setValue(el, result.text);
    if (result.warning) {
      warning.querySelector('[data-size-warning-text]').textContent = result.warning;
      warning.hidden = false;
    }
  }


  // ══ Options ═════════════════════════════════════════════════════

  // proof-page.js listens for these to update the Pages panel and selection
  function announce(type, detail) {
    document.dispatchEvent(new CustomEvent(type, { detail }));
  }

  function prepareCard(card) {
    card._colKey = null;
    tables(card).forEach(tbody => {
      rowsOf(tbody).forEach(row => {
        row.querySelectorAll('[data-combobox]').forEach(window.Combobox.setup);
        setRowState(row);
      });
      ensureTrailingRow(tbody);
    });
    renderColumns(card);
  }

  function addOption() {
    const card = tpl('tpl-option-card');
    optionList.appendChild(card);
    prepareCard(card);
    announce('bp:option-added', { card });
    return card;
  }

  function removeOption(card) {
    const cards = cardsAll();
    if (cards.length === 1) return;   // always keep at least one option
    const index = cards.indexOf(card);
    card.remove();
    announce('bp:option-removed', { card, index });
  }

  // Duplicate: copy the option as it stands, right after it
  function duplicateOption(card) {
    const copy = card.cloneNode(true);
    // Typed values live on the elements, not in the markup, so copy them over
    const from = card.querySelectorAll('input');
    copy.querySelectorAll('input').forEach((el, i) => { el.value = from[i].value; });
    copy.querySelectorAll('.combobox__listbox').forEach(l => { l.hidden = true; });
    copy.querySelectorAll('.is-open, .is-dragging').forEach(el => el.classList.remove('is-open', 'is-dragging'));
    copy.querySelectorAll('[aria-expanded]').forEach(el => el.setAttribute('aria-expanded', 'false'));
    copy._imageLabels = (card._imageLabels || []).slice();
    copy._insertExtra = (card._insertExtra || []).slice();
    card.after(copy);
    prepareCard(copy);
    announce('bp:option-added', { card: copy, source: card });
    return copy;
  }


  // ══ Events (delegated) ══════════════════════════════════════════

  // Typing in a row: it's no longer blank → a new empty row below
  form.addEventListener('input', e => {
    const row = e.target.closest('[data-option] [data-row]');
    if (!row) return;
    if (e.target.matches('[data-count-col] input')) e.target.removeAttribute('data-auto');   // typed by hand now
    if (row.matches('[data-count-table] [data-row]')) autoCount(row);
    if (e.target.closest('.material-row__name')) setNameWarning(row, false);
    if (e.target.closest('.insert-row__size')) row.querySelector('[data-size-error]').hidden = true;
    setRowState(row);
    ensureTrailingRow(row.parentElement);
  });

  // Focus left a row (not just moved to another field in it): tidy up
  form.addEventListener('focusout', e => {
    const row = e.target.closest('[data-option] [data-row]');
    if (!row) return;
    if (e.target.closest('.insert-row__size')) commitSize(row);
    if (e.relatedTarget && row.contains(e.relatedTarget)) return;
    // Let the combobox finish committing first
    setTimeout(() => tidyRow(row));
  });

  form.addEventListener('combobox:commit', e => {
    const row = e.target.closest('[data-option] [data-row]');
    if (!row) return;
    if (e.target.matches('.material-row__type')) onTypeCommit(row);
    if (e.target.matches('.material-row__location')) onLocationCommit(row);
    if (e.target.matches('.material-row__name')) setNameWarning(row, e.detail.value === null);
    setRowState(row);
    ensureTrailingRow(row.parentElement);
    // Picked with Enter or a click (focus still here; Tab has already moved on): next field
    const input = e.target.querySelector('input');
    setTimeout(() => { if (document.activeElement === input && e.detail.value) focusNext(row, input); });
  });

  function focusNext(row, input) {
    const fields = [...row.querySelectorAll('input:not([disabled])')];
    const next = fields[fields.indexOf(input) + 1];
    if (next) next.focus();
  }

  // Free-text fields (Name, Size, Decoration, Other): Enter / clicking a
  // suggestion fills it in and moves on to the next field
  // Management Group / Property Name (free text, saved suggestions):
  // Enter or clicking a suggestion just fills it in
  form.addEventListener('combobox:enter', e => {
    if (!e.target.closest('.job-details')) return;
    window.Combobox.setValue(e.target, e.detail.value);
    window.Combobox.reset(e.target, true);   // keep the text, close the list
    e.target.querySelector('input').dispatchEvent(new Event('change', { bubbles: true }));   // saved-suggestions.js, footer
  });

  form.addEventListener('combobox:enter', e => {
    const row = e.target.closest('[data-option] [data-row]');
    if (!row) return;
    window.Combobox.setValue(e.target, e.detail.value);
    window.Combobox.reset(e.target, true);   // keep the text, close the list
    if (e.target.matches('.insert-row__size')) commitSize(row);
    if (row.matches('[data-count-table] [data-row]')) autoCount(row);
    setRowState(row);
    ensureTrailingRow(row.parentElement);
    focusNext(row, e.target.querySelector('input'));
  });

  // "+ Add location" (Inserts)
  form.addEventListener('change', e => {
    if (!e.target.matches('[data-add-location] select') || !e.target.value) return;
    addLocation(e.target.closest('[data-option]'), e.target.value);
  });

  // Dragging rows: the blank row stays at the bottom
  form.addEventListener('sortable:change', e => {
    const tbody = e.target.closest('[data-rows]');
    if (!tbody) return;
    rowsOf(tbody).filter(isBlank).forEach(r => tbody.appendChild(r));
  });


  // ══ 5. Footer content (proof-page.js renders it) ════════════════
  // One box per image column that has anything in it:
  //   { label, material: [text], inserts: [{ heading, items }], decoration: [text], other: [text] }

  const isNumber = v => /^\d+$/.test(v);

  // "(1) 8.5 x 11 insert", "(2) 8.5 x 11 inserts", "Multiple 8.5 x 11 inserts"
  // (the count always shows)
  function insertText(count, size) {
    if (isNumber(count)) return '(' + count + ') ' + size + (Number(count) === 1 ? ' insert' : ' inserts');
    return count + ' ' + size + ' inserts';
  }

  // "Deboss", "Deboss x2", "Screwposts (Variable)"
  function featureText(name, count) {
    if (!isNumber(count)) return name + ' (' + count + ')';
    return Number(count) > 1 ? name + ' x' + count : name;
  }

  const countIn = (row, label) => {
    const input = row.querySelector('[data-count-col="' + CSS.escape(label) + '"] input');
    const v = input ? input.value.trim() : '';
    return v === '0' ? '' : v;
  };

  function footerFor(card) {
    const cols = columnsOf(card);
    const boxes = cols.map(label => ({ label, material: [], inserts: [], decoration: [], other: [] }));
    const filled = type => rowsOf(card.querySelector('[data-rows="' + type + '"]')).filter(r => !isBlank(r));

    // Material: "Full Wrap: Majilite (#1)", in its Location's box (first box if none)
    filled('material').forEach(row => {
      const type = valueOf(row, '.material-row__type input');
      const name = valueOf(row, '.material-row__name input');
      const fn = valueOf(row, '.material-row__function input');
      const list = row.querySelector('.material-row__name').dataset.list;
      const shown = (list && DATA && DATA.customerNames[list] && DATA.customerNames[list][name]) || name || type;
      if (!shown) return;
      const location = valueOf(row, '.material-row__location input');
      (boxes.find(b => b.label === location) || boxes[0]).material.push(fn ? fn + ': ' + shown : shown);
    });

    boxes.forEach(box => {
      // Inserts, grouped by binding type: "Menu Cord holds:" + one line per size
      const groups = [];
      filled('insert').forEach(row => {
        const count = countIn(row, box.label);
        const size = valueOf(row, '.insert-row__size input');
        if (!count || !size) return;
        const binding = valueOf(row, '.insert-row__binding input');
        let group = groups.find(g => g.binding === binding);
        if (!group) {
          group = { binding, heading: binding ? binding + (/s$/i.test(binding) ? ' hold:' : ' holds:') : '', items: [] };
          groups.push(group);
        }
        group.items.push(insertText(count, size));
      });
      box.inserts = groups.map(({ heading, items }) => ({ heading, items }));

      ['decoration', 'other'].forEach(type => {
        filled(type).forEach(row => {
          const name = valueOf(row, '.feature-row__name input');
          const count = countIn(row, box.label);
          if (name && count) box[type].push(featureText(name, count));
        });
      });
    });

    return boxes.filter(b => b.material.length || b.inserts.length || b.decoration.length || b.other.length);
  }


  // ══ Save / restore (embedded in the PDF by proof-page.js) ═══════

  const countsOf = row => {
    const counts = {};
    row.querySelectorAll('[data-count-col]').forEach(cell => {
      const v = cell.querySelector('input').value.trim();
      if (v) counts[cell.dataset.countCol] = v;
    });
    return counts;
  };

  function serializeOptions() {
    return cardsAll().map(card => {
      const filled = type => rowsOf(card.querySelector('[data-rows="' + type + '"]')).filter(r => !isBlank(r));
      return {
        orientation: card.dataset.orientation || 'landscape',
        materials: filled('material').map(row => ({
          type: valueOf(row, '.material-row__type input'),
          name: valueOf(row, '.material-row__name input'),
          fn: valueOf(row, '.material-row__function input'),
          location: valueOf(row, '.material-row__location input'),
        })),
        inserts: filled('insert').map(row => ({
          size: valueOf(row, '.insert-row__size input'),
          binding: valueOf(row, '.insert-row__binding input'),
          counts: countsOf(row),
        })),
        decorations: filled('decoration').map(row => ({ name: valueOf(row, '.feature-row__name input'), counts: countsOf(row) })),
        others: filled('other').map(row => ({ name: valueOf(row, '.feature-row__name input'), counts: countsOf(row) })),
      };
    });
  }

  function restoreOptions(options) {
    optionList.querySelectorAll('[data-option]').forEach(c => c.remove());
    const fill = (row, sel, value) => window.Combobox.setValue(row.querySelector(sel), value || '');

    const cards = (options.length ? options : [{}]).map(opt => {
      const card = tpl('tpl-option-card');
      if (opt.orientation === 'portrait') card.dataset.orientation = 'portrait';
      optionList.appendChild(card);
      // Columns come from the saved counts until the images are back
      const labels = new Set();
      [...(opt.inserts || []), ...(opt.decorations || []), ...(opt.others || [])]
        .forEach(r => Object.keys(r.counts || {}).forEach(l => labels.add(l)));
      const cols = labels.size ? [...labels] : [NO_IMAGE];
      const add = type => {
        const tbody = card.querySelector('[data-rows="' + type + '"]');
        const row = newRow(tbody);
        buildCountCells(row, cols);
        return row;
      };
      const setCounts = (row, counts) => Object.entries(counts || {}).forEach(([label, v]) => {
        const input = row.querySelector('[data-count-col="' + CSS.escape(label) + '"] input');
        if (input) input.value = v;
      });

      (opt.materials || []).forEach(m => {
        const row = add('material');
        fill(row, '.material-row__type', m.type);
        onTypeCommit(row);
        fill(row, '.material-row__name', m.name);
        fill(row, '.material-row__location', m.location || m.image);   // "image" before it was renamed
        fill(row, '.material-row__function', m.fn);
      });
      (opt.inserts || []).forEach(r => {
        const row = add('insert');
        fill(row, '.insert-row__size', r.size);
        fill(row, '.insert-row__binding', r.binding);
        setCounts(row, r.counts);
      });
      [['decoration', opt.decorations], ['other', opt.others]].forEach(([type, list]) => (list || []).forEach(r => {
        const row = add(type);
        fill(row, '.feature-row__name', r.name);
        setCounts(row, r.counts);
      }));
      prepareCard(card);
      return card;
    });

    announce('bp:restored', { cards });
  }


  // ══ Init ════════════════════════════════════════════════════════

  async function init() {
    form.querySelectorAll('.job-details [data-combobox]').forEach(window.Combobox.setup);
    cardsAll().forEach(prepareCard);
    try {
      const { source, data } = await window.loadSheetData();
      DATA = data;
      cardsAll().forEach(card => { card._colKey = null; renderColumns(card); });   // holds_inserts is known now
      document.dispatchEvent(new CustomEvent('bp:ready'));   // proof-page.js re-renders
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

  // Used by proof-page.js
  window.BP = {
    data: () => DATA,
    addOption,
    duplicateOption,
    removeOption,
    setImageLabels,
    renameColumn,
    footerFor,
    serializeOptions,
    restoreOptions,
    ready: () => !!DATA,
  };

  init();
})();
