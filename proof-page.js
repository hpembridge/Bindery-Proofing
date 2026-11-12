// ── Proof page: pages panel, 17 x 11 canvas, images, footer, Save PDF ──
// Each option is one page. This file:
//   • lists the options in the Pages panel (select, add, duplicate, delete, reorder)
//   • shows the selected option on the 17 x 11 canvas, scaled to fit the window
//   • takes dropped PSD/PNG/JPG files (psd-import.js) and scales them together
//     to fit the art area, labeling each "Shown at X%"
//   • fills the footer live from the job fields and the option's form
//   • opens the option's form in the Edit drawer
//   • saves the page as a 17 x 11 PDF (window.print, like the MCS)
//   • links the proof's art folder (folder-link.js) so images can be found
//     again by file name after a reload, and flags options whose art changed
//     (or is missing) since the proof was saved
//
// In Angular: images per option + the selected option are component state;
// render functions become template bindings; fitImages() stays as a helper.

(function () {
  'use strict';

  const PX_PER_IN = 96;
  const PAGE_W_IN = 17;
  const PAGE_H_IN = 11;

  const form = document.getElementById('proof-form');
  const optionList = document.getElementById('option-list');
  const pagesList = document.getElementById('pages-list');
  const stage = document.getElementById('canvas-stage');
  const sizer = document.getElementById('canvas-sizer');
  const page = document.getElementById('proof-page');
  const art = document.getElementById('proof-art');
  const empty = document.getElementById('proof-empty');
  const footerSections = document.getElementById('proof-footer-sections');
  const header = document.getElementById('proof-header');
  const pageName = document.getElementById('canvas-page-name');
  const drawer = document.getElementById('edit-drawer');
  const drawerTitle = document.getElementById('edit-drawer-title');
  const notices = document.getElementById('notices');
  const imageInput = document.getElementById('image-input');

  const tpl = id => document.getElementById(id).content.firstElementChild.cloneNode(true);
  const val = (root, sel) => {
    const el = root.querySelector(sel);
    return el ? el.value.trim() : '';
  };
  const cards = () => [...optionList.querySelectorAll('[data-option]')];

  // ── State ──
  let selected = cards()[0];
  const images = new WeakMap();   // option card → [{ id, file, modified, baseline, name, label, url, widthIn, heightIn, warnings }]
  const missing = new WeakMap();  // option card → [{ label, file, modified }] images from a reloaded PDF not found yet
  let nextImageId = 1;
  const imagesOf = card => {
    if (!images.has(card)) images.set(card, []);
    return images.get(card);
  };


  // ══ Reading the form (job + one option) ══════════════════════════

  function readJob() {
    return {
      jobNumber: val(form, '#job-number'),
      managementGroup: val(form, '#management-group'),
      customer: val(form, '#customer'),
      jobDescription: val(form, '#job-description'),
    };
  }

  function readOption(card) {
    const data = window.BP.data();

    // Material: "Front: Majilite (#50)" (bookcloth) or "Back: Wood"
    const material = [...card.querySelectorAll('.material-row')].map(row => {
      const mat = val(row, '.material-row__material input');
      if (!mat) return '';
      const fn = val(row, '.material-row__function input');
      const detailWrap = row.querySelector('.material-row__detail');
      let detail = '';
      if (!detailWrap.hidden) {
        const picked = val(detailWrap, 'input');
        const names = data && data.customerNames[detailWrap.dataset.list];
        detail = (names && names[picked]) || picked;
      }
      const what = detail || mat;
      return fn ? fn + ': ' + what : what;
    }).filter(Boolean);

    // Inserts: "Corners hold (2) 8.5 x 11, (4) 5.5 x 8.5 inserts"
    const inserts = [...card.querySelectorAll('.binding-row')].map(row => {
      const type = val(row, '.binding-row__type input');
      const chips = [...row.querySelectorAll('[data-chip]')];
      const sizes = chips.map(c => (c.dataset.count ? '(' + c.dataset.count + ') ' : '') + c.dataset.size);
      const pending = val(row, '.binding-row__count input');
      const holds = /s$/i.test(type) ? 'hold' : 'holds';
      const counts = sizes.length ? chips.map(c => c.dataset.count) : [pending];
      const noun = counts.length === 1 && Number(counts[0]) === 1 ? 'insert' : 'inserts';
      const listed = sizes.length ? sizes.join(', ') : pending;
      const what = listed ? listed + ' ' + noun : '';
      if (!type) return what;
      return what ? type + ' ' + holds + ' ' + what : type;
    }).filter(Boolean);

    // Selected toggles grouped by feature type, in the sheet's order
    // (type comes from the toggle's group, so custom toggles land in the right column)
    const pressed = [...card.querySelectorAll('.toggle-btn[aria-pressed="true"]')].map(b => ({
      name: b.dataset.feature,
      type: b.closest('.feature-toggles__group').dataset.type,
    }));
    const types = data ? [...new Set(data.features.map(f => f.type))] : [];
    const byType = types.map(type => ({ type, items: pressed.filter(p => p.type === type).map(p => p.name) }));

    return { material, inserts, byType };
  }


  // ══ Pages panel ══════════════════════════════════════════════════

  function renderPages() {
    pagesList.replaceChildren(...cards().map((card, i) => {
      const name = 'Option ' + (i + 1);
      const item = tpl('tpl-page-item');
      item.dataset.index = i;
      item.querySelector('.page-item__name').textContent = name;
      item.querySelector('[data-action="page-select"]').setAttribute('aria-current', String(card === selected));
      item.classList.toggle('is-selected', card === selected);
      item.querySelector('[data-action="page-duplicate"]').setAttribute('aria-label', 'Duplicate ' + name);
      const del = item.querySelector('[data-action="page-remove"]');
      del.setAttribute('aria-label', 'Delete ' + name);
      del.disabled = cards().length === 1;

      // Flags: art changed since the proof was saved / not in the linked folder
      const flags = flagsOf(card);
      setFlag(item.querySelector('[data-flag="changed"]'), flags.changed,
        'Art changed since the proof was saved: ' + flags.changed.join(', ') + '. The specs may need edits.');
      setFlag(item.querySelector('[data-flag="missing"]'), flags.missing,
        'Not in the linked folder: ' + flags.missing.join(', ') + '. This option may have been omitted.');

      // Thumbnail: the page's first image
      const first = imagesOf(card)[0];
      const thumb = item.querySelector('.page-item__thumb-img');
      if (first) { thumb.src = first.url; thumb.hidden = false; }
      return item;
    }));
  }

  function setFlag(el, list, text) {
    el.hidden = !list.length;
    el.title = list.length ? text : '';
    el.querySelector('[data-flag-text]').textContent = list.length ? text : '';
  }

  function select(card) {
    if (!card) return;
    selected = card;
    cards().forEach(c => { c.hidden = c !== selected; });   // drawer shows only this option
    renderArt();
    render();
  }

  const cardFromItem = el => cards()[Number(el.closest('.page-item').dataset.index)];


  // ══ Canvas: fit the 17 x 11 page into the window ═════════════════

  function fitStage() {
    const pad = 32;
    const scale = Math.min(
      (stage.clientWidth - pad) / (PAGE_W_IN * PX_PER_IN),
      (stage.clientHeight - pad) / (PAGE_H_IN * PX_PER_IN)
    );
    sizer.style.setProperty('--page-scale', Math.max(0.1, scale).toFixed(4));   // dynamic value
  }


  // ══ Art area: images ═════════════════════════════════════════════

  function renderArt() {
    const list = imagesOf(selected);
    art.replaceChildren(...list.map(image => {
      const fig = tpl('tpl-proof-image');
      fig.dataset.id = image.id;
      fig.querySelector('.proof-image__label').textContent = image.label;
      const img = fig.querySelector('.proof-image__img');
      img.src = image.url;
      img.alt = image.label;
      if (image.warnings.length) {
        const badge = fig.querySelector('.proof-image__warning');
        badge.hidden = false;
        badge.title = image.warnings.join('\n');
        badge.querySelector('[data-warning-text]').textContent = image.colorMode !== 'RGB' ? image.colorMode : 'Check';
      }
      return fig;
    }));
    empty.hidden = list.length > 0;
    fitImages();
  }

  // Pick a tidy % at or below the largest that fits (never above 100%):
  //   • 25 / 50 / 75 if it's within 10 points of the fit (fits 58% → 50%)
  //   • otherwise rounded down to a multiple of 10 (fits 68% → 60%)
  //   • below 10%, a whole number (fits 7.4% → 7%)
  // Always rounds down, so the images still fit.
  function snapScale(fitPct) {
    if (fitPct >= 100) return 100;
    const quarter = Math.floor(fitPct / 25) * 25;
    if (quarter >= 25 && fitPct - quarter <= 10) return quarter;
    const tens = Math.floor(fitPct / 10) * 10;
    return tens >= 10 ? tens : Math.max(1, Math.floor(fitPct));
  }

  // Scale every image on the page by the same amount so they keep their real
  // proportions, at the % snapScale picks. That exact % is used, so
  // "Shown at" is accurate.
  function fitImages() {
    const figs = [...art.querySelectorAll('.proof-image')];
    if (!figs.length) return;
    const list = imagesOf(selected);
    const byId = id => list.find(i => String(i.id) === id);

    const cs = getComputedStyle(art);
    const gap = parseFloat(cs.columnGap) || 0;
    const availW = art.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - gap * (figs.length - 1);
    const f0 = figs[0];
    const fcs = getComputedStyle(f0);
    const overhead = f0.querySelector('.proof-image__label').offsetHeight +
      f0.querySelector('.proof-image__scale').offsetHeight + 2 * (parseFloat(fcs.rowGap) || 0);
    const availH = art.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - overhead;

    const totalW = figs.reduce((sum, f) => sum + byId(f.dataset.id).widthIn * PX_PER_IN, 0);
    const maxH = Math.max(...figs.map(f => byId(f.dataset.id).heightIn * PX_PER_IN));
    const fit = Math.min(1, availW / totalW, availH / maxH);
    const pct = snapScale(fit * 100);

    figs.forEach(f => {
      const image = byId(f.dataset.id);
      f.style.setProperty('--img-w', (image.widthIn * pct / 100) + 'in');   // dynamic value
      f.style.setProperty('--img-h', (image.heightIn * pct / 100) + 'in');
      f.querySelector('.proof-image__scale').textContent = 'Shown at ' + pct + '%';
    });
  }

  async function importFiles(fileList) {
    const files = [...fileList];
    const card = selected;
    for (const file of files) {
      const working = notice('info', 'Reading ' + file.name + '…');
      try {
        const image = await window.ImageImport.read(file);
        // A file this option had in the reloaded PDF: keep its label and saved date
        const list = missing.get(card) || [];
        const was = list.find(m => m.file && m.file.toLowerCase() === file.name.toLowerCase());
        if (was) list.splice(list.indexOf(was), 1);
        imagesOf(card).push(Object.assign({ id: nextImageId++, file: file.name, modified: file.lastModified }, image, {
          label: was ? was.label : image.name,
          baseline: (was && was.modified) || file.lastModified,
        }));
        working.remove();
        image.warnings.forEach(w => notice('warning', file.name + ': ' + w));
      } catch (err) {
        working.remove();
        notice('error', err.message);
      }
      if (card === selected) renderArt();
      renderPages();
    }
  }

  // opts (optional):
  //   action: { label, run }  → a button in the notice; clicking it runs `run`,
  //                             then clears and dismisses like the ✕
  //   clear: fn               → runs when the notice is dismissed (✕ or action)
  //   flag: 'changed' | 'missing' → marks page-flag notices so they're replaced, not stacked
  const noticeHandlers = new WeakMap();   // notice li → opts

  function notice(kind, text, opts) {
    const li = tpl('tpl-notice');
    li.dataset.kind = kind;
    li.querySelector('.notice__text').textContent = text;
    if (opts) {
      noticeHandlers.set(li, opts);
      if (opts.flag) li.dataset.flagNotice = opts.flag;
      if (opts.action) {
        const btn = li.querySelector('.notice__action');
        btn.textContent = opts.action.label;
        btn.hidden = false;
      }
    }
    li.querySelector('.notice__icon').className = 'fa-solid notice__icon ' +
      ({ info: 'fa-circle-notch fa-spin', 'info-done': 'fa-circle-check', warning: 'fa-triangle-exclamation', error: 'fa-circle-exclamation' })[kind];
    notices.appendChild(li);
    if (kind === 'info-done') dismissLater(li);   // nothing to act on: fades out by itself
    return li;
  }

  // Fade a notice out after a few seconds (stays while hovered), then remove it
  const NOTICE_MS = 5000;
  function dismissLater(li) {
    let timer;
    const start = () => { timer = setTimeout(() => {
      li.classList.add('is-dismissed');
      const remove = () => li.remove();
      li.addEventListener('transitionend', remove, { once: true });
      setTimeout(remove, 450);   // no transition (reduced motion)
    }, NOTICE_MS); };
    li.addEventListener('mouseenter', () => clearTimeout(timer));
    li.addEventListener('mouseleave', start);
    start();
  }


  // ══ Footer ═══════════════════════════════════════════════════════

  function fillList(section, items) {
    const ul = section.querySelector('[data-f-list]');
    ul.replaceChildren(...items.map(text => {
      const li = tpl('tpl-footer-item');
      li.textContent = text;
      return li;
    }));
    ul.classList.toggle('proof-footer__list--bullets', items.length > 1);   // "- " only for 2+
    section.hidden = !items.length;
  }

  function renderFooter() {
    const job = readJob();
    const all = cards();
    const index = all.indexOf(selected);
    const opt = readOption(selected);

    // Running header (no labels)
    //   left:  "Mgmt Group / Property Name"  (Mgmt Group only if filled in)
    //   right: "Job # Job Name" + an "Option N" chip (only with 2+ options)
    const left = [job.managementGroup, job.customer].filter(Boolean).join(' / ');
    const right = [job.jobNumber, job.jobDescription].filter(Boolean).join(' ');
    header.querySelector('[data-h-left]').textContent = left;
    header.querySelector('[data-h-right]').textContent = right;
    const chip = header.querySelector('[data-h-option]');
    chip.textContent = 'Option ' + (index + 1);
    chip.hidden = all.length < 2;

    ['material', 'inserts'].forEach(key =>
      fillList(footerSections.querySelector('[data-f-section="' + key + '"]'), opt[key]));

    // One section per feature type (Decoration, Feature…), labeled with the type
    footerSections.querySelectorAll('[data-f-type]').forEach(s => s.remove());
    opt.byType.forEach(({ type, items }) => {
      const section = tpl('tpl-footer-type-section');
      section.dataset.fType = type;
      section.querySelector('.proof-footer__label').textContent = type;
      fillList(section, items);
      footerSections.appendChild(section);
    });
  }


  // ══ Render (everything except rebuilding the images) ═════════════

  function render() {
    const index = cards().indexOf(selected);
    const name = 'Option ' + (index + 1);
    pageName.textContent = name;
    drawerTitle.textContent = 'Edit ' + name;
    renderPages();
    renderFooter();
    fitImages();   // footer height changes the art area
  }

  // Hold re-renders while the pointer is down in the Pages panel so the
  // item being dragged or clicked isn't swapped out underneath it.
  let queued = false, holding = false, pending = false;
  function scheduleRender() {
    if (holding) { pending = true; return; }
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  }
  function release() {
    if (!holding) return;
    holding = false;
    if (pending) { pending = false; scheduleRender(); }
  }


  // ══ Drawer ═══════════════════════════════════════════════════════

  function openDrawer() {
    drawer.hidden = false;
    document.body.classList.add('has-drawer');
    fitStage();
    const first = selected.querySelector('input:not([disabled]), button');
    if (first) first.focus({ preventScroll: true });
  }

  function closeDrawer() {
    drawer.hidden = true;
    document.body.classList.remove('has-drawer');
    fitStage();
  }


  // ══ Save PDF (every option, one 17 x 11 page each) ═══════════════
  // Each option is shown on the canvas in turn and a copy of the finished
  // page goes into #print-pages; then the print dialog saves them all as
  // one PDF. The option you were on is put back afterwards.

  async function savePdf() {
    const printPages = document.getElementById('print-pages');
    const current = selected;
    const pages = cards().map(card => {
      select(card);
      const copy = page.cloneNode(true);
      copy.removeAttribute('id');
      copy.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      return copy;
    });
    select(current);
    pages.forEach(p => { p.querySelector('[data-state-embed]').textContent = ''; });
    if (pages[0]) pages[0].querySelector('[data-state-embed]').textContent = MARK + encodeState(captureState()) + MARK;
    resetBaselines();   // the saved dates are the new "last seen"
    printPages.replaceChildren(...pages);

    // Make sure every image is ready before the dialog opens
    await Promise.all([...printPages.querySelectorAll('img')].map(img => img.decode().catch(() => {})));

    const job = val(form, '#job-number');
    const originalTitle = document.title;
    document.title = (job ? job + ' ' : '') + 'Proof';   // = the PDF's file name
    document.body.classList.add('is-printing');
    window.addEventListener('afterprint', function cleanup() {
      window.removeEventListener('afterprint', cleanup);
      document.title = originalTitle;
      document.body.classList.remove('is-printing');
      printPages.replaceChildren();
    });
    window.print();
  }


  // ══ Save & reload: the proof's data rides along in the PDF ═══════
  // Same idea as the MCS: on Save PDF the job, options and custom features
  // are written into the first page as tiny white text between %%BP%% marks.
  // Dropping that PDF back on the tool reads the text (pdf.js) and rebuilds
  // the proof. Images aren't stored (they'd make the PDF huge); their labels
  // and file names are, so a linked folder can fill them back in, or the tool
  // can say which files to drop back in.

  const MARK = '%%BP%%';
  const STATE_VERSION = 3;   // 2: images are { label, file } + folder name; 3: + modified date

  function captureState() {
    const job = readJob();
    job.designer = val(form, '#designer');
    return {
      v: STATE_VERSION,
      d: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      job,
      theme: page.dataset.footerTheme,
      custom: window.BP.serializeCustom(),
      options: window.BP.serializeOptions(),
      images: cards().map(card => imagesOf(card).map(i => ({ label: i.label, file: i.file || '', modified: i.modified || 0 }))),
      folder: folder.handle ? folder.handle.name : '',
    };
  }

  const encodeState = state => btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  const decodeState = b64 => JSON.parse(decodeURIComponent(escape(atob(b64.replace(/\s/g, '')))));

  // pdf.js (same version as the MCS), loaded the first time a PDF is dropped
  let pdfjsLoading = null;
  function ensurePdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfjsLoading) {
      pdfjsLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = () => {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          resolve(window.pdfjsLib);
        };
        s.onerror = () => { pdfjsLoading = null; reject(new Error('Couldn’t load the PDF reader. Check your internet connection.')); };
        document.head.appendChild(s);
      });
    }
    return pdfjsLoading;
  }

  async function loadFromPdf(file) {
    const working = notice('info', 'Reading ' + file.name + '…');
    try {
      const pdfjs = await ensurePdfJs();
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      let text = '';
      for (let n = 1; n <= pdf.numPages && text.indexOf(MARK) === text.lastIndexOf(MARK); n++) {
        const content = await (await pdf.getPage(n)).getTextContent();
        text += content.items.map(i => i.str).join('');
      }
      const m = text.match(/%%BP%%([\s\S]+?)%%BP%%/);
      working.remove();
      if (!m) { notice('error', file.name + ' has no proof data. Only PDFs saved from this tool can be reloaded.'); return; }

      const state = decodeState(m[1]);
      const hasWork = cards().some(c => imagesOf(c).length || c.querySelector('[data-row]'));
      if (hasWork && !window.confirm('Replace the current proof with ' + file.name + '?')) return;
      if (!window.BP.ready()) await new Promise(r => document.addEventListener('bp:ready', r, { once: true }));
      restoreState(state, file.name);
    } catch (err) {
      working.remove();
      notice('error', 'Couldn’t reload ' + file.name + ': ' + err.message);
    }
  }

  function restoreState(state, fileName) {
    const job = state.job || {};
    const setField = (id, value) => {
      const input = document.getElementById(id);
      const combo = input.closest('[data-combobox]');
      if (combo) window.Combobox.setValue(combo, value || '');
      else input.value = value || '';
    };
    setField('job-number', job.jobNumber);
    setField('management-group', job.managementGroup);
    setField('customer', job.customer);
    setField('job-description', job.jobDescription);
    if (job.designer) setField('designer', job.designer);
    setTheme(state.theme || 'light');

    window.BP.restoreOptions(state.options || [], state.custom);   // fires bp:restored

    // Images aren't in the PDF, only their labels, file names and modified
    // dates. Keep the list so a linked folder (or dropped files) can fill
    // them back in. Version 1 PDFs stored labels only; version 2 no dates.
    cards().forEach((card, i) => missing.set(card, ((state.images || [])[i] || [])
      .map(entry => typeof entry === 'string' ? { label: entry, file: '', modified: 0 } : entry)));
    notice('info-done', 'Reloaded ' + fileName + (state.d ? ' (saved ' + state.d + ')' : '') + '.');

    if (!missingSummary()) return;
    if (folder.handle) { fillFromFolder(); return; }
    notice('warning', (window.FolderLink.supported ? 'Link the job’s folder' +
      (state.folder ? ' (it was ' + state.folder + ')' : '') + ' to add the images, or drop them in — ' : 'Drop the images back in — ') +
      missingSummary() + '.');
  }

  // "Option 1: Cover, Interior; Option 2: Cover"
  function missingSummary() {
    return cards().map((card, i) => {
      const list = missing.get(card) || [];
      return list.length ? 'Option ' + (i + 1) + ': ' + list.map(m => m.label).join(', ') : '';
    }).filter(Boolean).join('; ');
  }


  // ══ Page flags: art changed / not in the folder ══════════════════
  // Each image keeps its file's last-modified date (`modified`) and the date
  // the proof last saw (`baseline`: from the reloaded PDF, or when the image
  // was added). Save PDF moves the baseline up to now and clears both flags.
  //   • changed: an image file is newer than its baseline → the art was
  //     edited, so the specs in the footer may need edits too
  //   • missing: an image from the reloaded PDF isn't in the linked folder →
  //     the option may have been omitted

  const changedImages = card => imagesOf(card).filter(i => i.baseline && i.modified > i.baseline);

  // `missing` only flags an option when none of its files were found
  // (some missing isn't an omitted option)
  function flagsOf(card) {
    const notFound = folder.handle ? missing.get(card) || [] : [];
    return {
      changed: changedImages(card).map(i => i.file || i.label),
      missing: notFound.length && !imagesOf(card).length ? notFound.map(m => m.file || m.label) : [],
    };
  }

  // Clearing a flag (✕ or the notice's button)
  function clearChanged(card) {
    imagesOf(card).forEach(i => { i.baseline = i.modified; });
    renderPages();
  }
  function clearMissing(list) {
    list.forEach(card => missing.set(card, []));
    renderPages();
  }

  function removeOptions(list) {
    list.forEach(card => window.BP.removeOption(card));   // the last option always stays
  }

  // "2", "2 and 4", "2, 4 and 6"
  const joinNumbers = nums => nums.length < 2 ? String(nums[0])
    : nums.slice(0, -1).join(', ') + ' and ' + nums[nums.length - 1];

  // One notice per option with changed art; one notice for options whose
  // files are all gone. Replaces any flag notices already showing.
  function reportFlags() {
    notices.querySelectorAll('[data-flag-notice]').forEach(n => n.remove());
    const all = cards();

    all.forEach((card, i) => {
      if (!flagsOf(card).changed.length) return;
      notice('warning', 'Artwork updated since last proof.', {
        flag: 'changed',
        action: { label: 'Review Option ' + (i + 1) + ' specifications', run: () => { select(card); openDrawer(); } },
        clear: () => clearChanged(card),
      });
    });

    const gone = all.filter(card => flagsOf(card).missing.length);
    if (gone.length) {
      const nums = gone.map(card => all.indexOf(card) + 1);
      notice('warning', 'Files for ' + (gone.length === 1 ? 'option ' : 'options ') + joinNumbers(nums) +
        ' weren’t found in the artwork folder.', {
        flag: 'missing',
        action: { label: 'Remove missing option' + (gone.length === 1 ? '' : 's'), run: () => removeOptions(gone) },
        clear: () => clearMissing(gone),
      });
    }
  }

  // Save PDF: what was just saved is the new baseline, and images that
  // weren't found aren't part of the proof anymore, so both flags clear
  function resetBaselines() {
    cards().forEach(card => {
      imagesOf(card).forEach(i => { i.baseline = i.modified; });
      missing.set(card, []);
    });
    renderPages();
  }


  // ══ Folder link (folder-link.js) ═════════════════════════════════
  // Each proof links its own folder; nothing is remembered. With it:
  //   • images from a reloaded PDF are found again by file name, and checked
  //     against the dates saved in the PDF
  //   • ↻ re-reads every image on the proof (after a PSD is re-saved)
  //   • Add images opens the file picker in that folder

  const folderEl = document.getElementById('folder-link');
  const folder = { handle: null };

  function setFolder(handle) {
    folder.handle = handle || null;
    folderEl.dataset.state = handle ? 'linked' : 'none';
    if (handle) {
      folderEl.querySelector('[data-folder-name]').textContent = handle.name;
      folderEl.querySelector('.folder-link__name').title = 'Linked folder: ' + handle.name;
    }
    renderPages();   // "not in folder" flags only apply with a folder linked
  }

  async function linkFolder() {
    let handle;
    try {
      handle = await window.FolderLink.pick();
    } catch (err) {
      notice('error', 'Couldn’t open that folder: ' + err.message);
      return;
    }
    if (!handle) return;
    setFolder(handle);
    if (missingSummary()) fillFromFolder();
  }

  // Read a folder file into an image record
  async function readFromFolder(entry) {
    const file = await entry.getFile();
    return { file: file.name, modified: file.lastModified, image: await window.ImageImport.read(file) };
  }

  // A PDF's image entry → the folder's file. By file name; for version 1
  // PDFs (labels only), the label + .psd / .png / .jpg.
  function findEntry(files, wanted) {
    if (wanted.file) return files.get(wanted.file.toLowerCase()) || null;
    for (const ext of ['.psd', '.png', '.jpg', '.jpeg']) {
      const hit = files.get((wanted.label + ext).toLowerCase());
      if (hit) return hit;
    }
    return null;
  }

  // Fill in the images a reloaded PDF had, in their original order and with
  // their original labels. Anything not found stays in `missing` (flagged).
  async function fillFromFolder() {
    const working = notice('info', 'Looking for images in ' + folder.handle.name + '…');
    let added = 0;
    try {
      const files = await window.FolderLink.listImages(folder.handle);
      for (const card of cards()) {
        const stillMissing = [];
        for (const wanted of missing.get(card) || []) {
          const entry = findEntry(files, wanted);
          if (!entry) { stillMissing.push(wanted); continue; }
          try {
            const { file, modified, image } = await readFromFolder(entry);
            imagesOf(card).push(Object.assign({ id: nextImageId++, file, modified }, image,
              { label: wanted.label, baseline: wanted.modified || modified }));
            added++;
          } catch (err) {
            stillMissing.push(wanted);
            notice('error', err.message);
          }
        }
        missing.set(card, stillMissing);
      }
    } catch (err) {
      notice('error', 'Couldn’t read ' + folder.handle.name + ': ' + err.message);
    }
    working.remove();
    renderArt();
    renderPages();
    if (added) notice('info-done', 'Added ' + added + ' image' + (added === 1 ? '' : 's') + ' from ' + folder.handle.name + '.');
    reportFlags();
  }

  // ↻: re-read every image on the proof from the folder (same file name),
  // keeping its label, place and baseline. Then fill in anything missing.
  async function refreshFromFolder() {
    const working = notice('info', 'Reloading images from ' + folder.handle.name + '…');
    let updated = 0;
    try {
      const files = await window.FolderLink.listImages(folder.handle);
      for (const card of cards()) {
        for (const image of imagesOf(card)) {
          const entry = image.file && files.get(image.file.toLowerCase());
          if (!entry) continue;
          try {
            const { modified, image: fresh } = await readFromFolder(entry);
            Object.assign(image, fresh, { label: image.label, modified });
            updated++;
          } catch (err) {
            notice('error', err.message);
          }
        }
      }
    } catch (err) {
      notice('error', 'Couldn’t read ' + folder.handle.name + ': ' + err.message);
    }
    working.remove();
    renderArt();
    renderPages();
    if (missingSummary()) { fillFromFolder(); return; }   // reports flags too
    notice('info-done', updated
      ? 'Reloaded ' + updated + ' image' + (updated === 1 ? '' : 's') + ' from ' + folder.handle.name + '.'
      : 'None of the images on this proof are in ' + folder.handle.name + '.');
    reportFlags();
  }

  document.addEventListener('bp:restored', e => {
    selected = e.detail.cards[0];
    select(selected);
  });


  // ══ Events ═══════════════════════════════════════════════════════

  ['input', 'change', 'click', 'keydown', 'focusout', 'combobox:commit', 'combobox:enter', 'sortable:change']
    .forEach(type => form.addEventListener(type, scheduleRender));
  document.addEventListener('bp:ready', scheduleRender);

  document.addEventListener('bp:option-added', e => {
    const { card, source } = e.detail;
    if (source) images.set(card, imagesOf(source).map(i => Object.assign({}, i, { id: nextImageId++ })));
    select(card);
  });
  document.addEventListener('bp:option-removed', e => {
    const all = cards();
    select(all[Math.min(e.detail.index, all.length - 1)]);
  });

  form.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'page-select': select(cardFromItem(btn)); break;
      case 'page-add': window.BP.addOption(); break;
      case 'page-duplicate': window.BP.duplicateOption(cardFromItem(btn)); break;
      case 'page-remove': window.BP.removeOption(cardFromItem(btn)); break;
      case 'edit-option': openDrawer(); break;
      case 'close-drawer': closeDrawer(); break;
      case 'save-pdf': savePdf(); break;
      case 'folder-link': linkFolder(); break;
      case 'folder-refresh': refreshFromFolder(); break;
      case 'folder-unlink': setFolder(null); break;
      case 'notice-dismiss':
      case 'notice-action': {
        const li = btn.closest('.notice');
        const opts = noticeHandlers.get(li) || {};
        if (btn.dataset.action === 'notice-action' && opts.action) opts.action.run();
        if (opts.clear) opts.clear();
        li.remove();
        break;
      }
      case 'image-remove': {
        const id = btn.closest('.proof-image').dataset.id;
        const list = imagesOf(selected);
        list.splice(list.findIndex(i => String(i.id) === id), 1);
        renderArt();
        break;
      }
    }
  });

  // Footer style
  function setTheme(theme) {
    page.dataset.footerTheme = theme;
    form.querySelectorAll('.segmented__btn[data-footer-theme]').forEach(b =>
      b.setAttribute('aria-pressed', String(b.dataset.footerTheme === theme)));
  }
  form.addEventListener('click', e => {
    const btn = e.target.closest('.segmented__btn[data-footer-theme]');
    if (btn) setTheme(btn.dataset.footerTheme);
  });

  // Designer: remembered in this browser and filled in automatically, like
  // the MCS (same localStorage key, so the two tools share it when they're
  // served from the same address).
  const DESIGNER_KEY = 'mcs_designer';
  const designer = document.getElementById('designer');
  try { designer.value = localStorage.getItem(DESIGNER_KEY) || ''; } catch (err) { /* storage unavailable */ }
  designer.addEventListener('input', () => {
    try { localStorage.setItem(DESIGNER_KEY, designer.value); } catch (err) { /* not saved */ }
  });

  // Reorder pages → reorder the option cards to match
  pagesList.addEventListener('sortable:change', () => {
    const all = cards();
    [...pagesList.querySelectorAll('.page-item')].forEach(item => optionList.appendChild(all[Number(item.dataset.index)]));
    window.BP.renumber();
    render();
  });
  pagesList.addEventListener('pointerdown', () => { holding = true; });
  window.addEventListener('pointerup', () => setTimeout(release));
  document.addEventListener('dragend', () => setTimeout(release));

  // Reorder images → reorder the option's image list to match
  art.addEventListener('sortable:change', () => {
    const list = imagesOf(selected);
    const order = [...art.querySelectorAll('.proof-image')].map(f => f.dataset.id);
    list.sort((a, b) => order.indexOf(String(a.id)) - order.indexOf(String(b.id)));
    renderPages();
  });

  // Image labels are edited in place on the page
  art.addEventListener('input', e => {
    if (!e.target.matches('.proof-image__label')) return;
    const image = imagesOf(selected).find(i => String(i.id) === e.target.closest('.proof-image').dataset.id);
    image.label = e.target.textContent;
  });
  art.addEventListener('keydown', e => {
    if (e.target.matches('.proof-image__label') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
  });

  // Drop files anywhere: a proof PDF reloads that proof; images go on the page
  const hasFiles = e => [...(e.dataTransfer && e.dataTransfer.types || [])].includes('Files');
  document.addEventListener('dragover', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    stage.classList.add('is-drop-target');
  });
  document.addEventListener('dragleave', e => {
    if (!e.relatedTarget || e.relatedTarget === document.documentElement) stage.classList.remove('is-drop-target');
  });
  document.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    stage.classList.remove('is-drop-target');
    const files = [...e.dataTransfer.files];
    const pdf = files.find(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf');
    if (pdf) loadFromPdf(pdf);
    const images = files.filter(f => window.ImageImport.accepts(f));
    if (images.length) importFiles(images);
  });
  // With a linked folder, Add images opens the file picker in that folder
  form.querySelector('[data-add-images]').addEventListener('click', async e => {
    if (!folder.handle || !('showOpenFilePicker' in window)) return;   // normal file input
    e.preventDefault();
    try {
      const files = await window.FolderLink.pickFiles(folder.handle);
      if (files.length) importFiles(files);
    } catch (err) {
      notice('error', 'Couldn’t open the file picker: ' + err.message);
    }
  });

  imageInput.addEventListener('change', () => {
    importFiles(imageInput.files);
    imageInput.value = '';
  });

  new ResizeObserver(fitStage).observe(stage);

  // ── Init ──
  select(selected);
  fitStage();
  folderEl.hidden = !window.FolderLink.supported;   // Chrome / Edge only

  // For testing / devtools
  window.ProofPage = { importFiles, loadFromPdf, setFolder, refreshFromFolder };
})();
