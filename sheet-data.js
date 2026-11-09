// ── Sheet data loader (prototype stand-in for a real API) ──
// Fetches each tab of the Google Sheet as CSV and shapes it into plain
// objects. If the sheet isn't configured or can't be reached, it falls back
// to the snapshots in data/*.csv.
//
// NOTE: fetch() needs the page served over http (e.g. `python3 -m http.server`),
// not opened by double-clicking (file://).
//
// Exposes: window.loadSheetData() → Promise<{ source, data }>
//   data.materials    [{ name, functions: [..], detailList }]
//   data.functions    ['Front', 'Back', …]  (column order from the sheet)
//   data.bindingTypes [{ name, standard, folded, variable }]  (x columns → true/false)
//   data.features     [{ name, type }]
//   data.detailLists  { bookcloth: ['Majilite Attache Copper (50)', …] }  (search names)
//   data.customerNames { bookcloth: { 'Majilite Attache Copper (50)': 'Majilite (50)' } }
//   data.sizes        [{ w, h, folded, flatW, flatH }]
//   data.settings     { inchMarks: true|false }  (the "inch marks?" checkbox on the Sizes tab)

(function () {
  'use strict';

  const cfg = window.SHEET_CONFIG;
  const MATERIAL_COL = 'Material';
  const DETAIL_COL = 'Detail List';

  function sheetUrl(tab) {
    return 'https://docs.google.com/spreadsheets/d/' + cfg.SHEET_ID +
      '/gviz/tq?tqx=out:csv&headers=1&sheet=' + encodeURIComponent(tab);
  }

  function snapshotUrl(tab) {
    return 'data/' + tab + '.csv';
  }

  // Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF).
  function parseCsv(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows
      .map(r => r.map(v => v.trim()))
      .filter(r => r.some(v => v !== ''));
  }

  // → array of { header: value } objects
  function toRecords(rows) {
    const [header, ...body] = rows;
    return body.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] || ''])));
  }

  async function fetchTab(tab, useSheet) {
    const res = await fetch(useSheet ? sheetUrl(tab) : snapshotUrl(tab));
    if (!res.ok) throw new Error(tab + ': HTTP ' + res.status);
    const text = await res.text();
    // A private sheet answers with a Google sign-in page instead of CSV.
    if (/^\s*</.test(text)) throw new Error(tab + ': not CSV (is the sheet shared?)');
    return parseCsv(text);
  }

  // Sizes tab: one row per size, using the numeric w / h / flat w / folded columns
  // (the display text is rebuilt by size-format.js so formatting stays consistent).
  function readSizes(rows) {
    return toRecords(rows)
      .filter(r => Number(r.w) > 0 && Number(r.h) > 0)
      .map(r => {
        const folded = String(r.folded).toUpperCase() === 'TRUE';
        return {
          w: Number(r.w),
          h: Number(r.h),
          folded,
          flatW: folded ? Number(r['flat w']) || Number(r.w) * 2 : undefined,
          flatH: folded ? Number(r.h) : undefined,
        };
      });
  }

  // A label cell anywhere on the tab (e.g. "inch marks?") with its value in the next cell.
  function readSetting(rows, label) {
    for (const row of rows) {
      const i = row.findIndex(v => v.toLowerCase().replace(/\?$/, '') === label);
      if (i >= 0) return (row[i + 1] || '').toUpperCase();
    }
    return '';
  }

  const isX = v => String(v || '').trim().toLowerCase() === 'x';

  async function loadFrom(useSheet) {
    const t = cfg.TABS;
    const [matRows, bindRows, featRows, sizeRows] = await Promise.all([
      fetchTab(t.materials, useSheet),
      fetchTab(t.bindingTypes, useSheet),
      fetchTab(t.features, useSheet),
      fetchTab(t.sizes, useSheet),
    ]);

    // Every column between "Material" and "Detail List" is a function.
    const functions = matRows[0].filter(h => h && h !== MATERIAL_COL && h !== DETAIL_COL);

    const materials = toRecords(matRows).map(r => ({
      name: r[MATERIAL_COL],
      functions: functions.filter(f => r[f].toLowerCase() === 'x'),
      detailList: r[DETAIL_COL] || '',
    }));

    const detailTabs = [...new Set(materials.map(m => m.detailList).filter(Boolean))];
    const detailRows = await Promise.all(detailTabs.map(tab => fetchTab(tab, useSheet)));
    // Detail tabs: first column is the name you search by; an optional
    // "Customer Facing Name" column is what prints on the proof footer.
    const detailLists = {}, customerNames = {};
    detailTabs.forEach((tab, i) => {
      const rows = toRecords(detailRows[i]);
      const nameCol = detailRows[i][0][0];
      detailLists[tab] = [];
      customerNames[tab] = {};
      rows.forEach(r => {
        const name = (r[nameCol] || '').trim();
        if (!name) return;
        detailLists[tab].push(name);
        customerNames[tab][name] = r['Customer Facing Name'] || name;   // used exactly as written in the sheet
      });
    });

    return {
      materials,
      functions,
      bindingTypes: toRecords(bindRows).map(r => ({
        name: r['Binding Type'],
        standard: isX(r.standard),   // suggest flat (non-folded) sizes
        folded: isX(r.folded),       // suggest folded sizes
        variable: isX(r.variable),   // suggest "Variable" for insert count
      })),
      features: toRecords(featRows).map(r => ({ name: r.Feature, type: r.Type || 'Feature' })),
      detailLists,
      customerNames,
      sizes: readSizes(sizeRows),
      settings: { inchMarks: readSetting(sizeRows, 'inch marks') === 'TRUE' },
    };
  }

  window.loadSheetData = async function () {
    if (cfg.SHEET_ID) {
      try {
        return { source: 'live', data: await loadFrom(true) };
      } catch (err) {
        console.warn('[sheet-data] Google Sheet unavailable, using snapshot:', err);
        return { source: 'fallback', error: err, data: await loadFrom(false) };
      }
    }
    return { source: 'snapshot', data: await loadFrom(false) };
  };
})();
