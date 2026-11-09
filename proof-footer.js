// ── Proof footer: live preview + Save PDF ──
// Reads the form, builds one footer per option from #tpl-footer-preview,
// and re-renders on every edit. Save PDF prints just that footer, the same
// way the MCS makes its PDFs (window.print + @page), with the page sized
// to the footer and the file name set from the job number.
//
// In Angular: readOption() is the form model, render() is a template bound
// to it, and savePdf() stays much the same.

(function () {
  'use strict';

  const form = document.getElementById('proof-form');
  const optionList = document.getElementById('option-list');
  const dock = document.getElementById('footer-dock');
  const list = document.getElementById('footer-list');
  const widthInput = document.getElementById('footer-width');
  const toggleBtn = document.getElementById('footer-dock-toggle');

  const PX_PER_IN = 96;   // CSS inch
  const tpl = id => document.getElementById(id).content.firstElementChild;
  const val = (root, sel) => {
    const el = root.querySelector(sel);
    return el ? el.value.trim() : '';
  };


  // ── Read the form → plain data for one option ──

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
    const featureType = name => {
      const f = data && data.features.find(x => x.name === name);
      return f ? f.type : '';
    };

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
      const what = detail || mat;   // a picked bookcloth prints on its own, without "Bookcloth —"
      return fn ? fn + ': ' + what : what;
    }).filter(Boolean);

    // Inserts: "Corners hold (2) 8.5 x 11, (4) 5.5 x 8.5 inserts"
    const inserts = [...card.querySelectorAll('.binding-row')].map(row => {
      const type = val(row, '.binding-row__type input');
      const sizes = [...row.querySelectorAll('[data-chip]')]
        .map(c => (c.dataset.count ? '(' + c.dataset.count + ') ' : '') + c.dataset.size);
      const pending = val(row, '.binding-row__count input');   // count typed but not used yet
      const holds = /s$/i.test(type) ? 'hold' : 'holds';
      // "insert" only when there's exactly one (one size with a count of 1)
      const counts = sizes.length ? [...row.querySelectorAll('[data-chip]')].map(c => c.dataset.count) : [pending];
      const noun = counts.length === 1 && Number(counts[0]) === 1 ? 'insert' : 'inserts';
      const listed = sizes.length ? sizes.join(', ') : pending;
      const what = listed ? listed + ' ' + noun : '';
      if (!type) return what;
      return what ? type + ' ' + holds + ' ' + what : type;
    }).filter(Boolean);

    // Selected toggles grouped by feature type, in the sheet's type order
    const pressed = [...card.querySelectorAll('.toggle-btn[aria-pressed="true"]')].map(b => b.dataset.feature);
    const types = data ? [...new Set(data.features.map(f => f.type))] : [];
    const byType = types.map(type => ({ type, items: pressed.filter(n => featureType(n) === type) }));

    return { material, inserts, byType };
  }


  // ── Render ──

  function fillList(section, items) {
    const ul = section.querySelector('[data-f-list]');
    ul.replaceChildren(...items.map(text => {
      const li = tpl('tpl-footer-item').cloneNode(true);
      li.textContent = text;
      return li;
    }));
    ul.classList.toggle('proof-footer__list--bullets', items.length > 1);   // bullets only for 2+
    section.hidden = !items.length;   // empty sections drop out and the rest reflow
  }

  function render() {
    const job = readJob();
    const cards = [...optionList.querySelectorAll('[data-option]')];

    list.replaceChildren(...cards.map((card, i) => {
      const name = 'Option ' + (i + 1);
      const opt = readOption(card);
      const preview = tpl('tpl-footer-preview').cloneNode(true);
      const footer = preview.querySelector('[data-footer]');

      preview.dataset.option = i + 1;
      preview.querySelector('[data-preview-name]').textContent = name;
      preview.querySelector('[data-action="save-pdf"]').setAttribute('aria-label', 'Save ' + name + ' as PDF');

      // Job section: "Mgmt Group / Customer" and "Job # - Description - Option N"
      const lines = {
        customer: [job.managementGroup, job.customer].filter(Boolean).join(' / '),
        job: [job.jobNumber, job.jobDescription, name].filter(Boolean).join(' - '),
      };
      Object.entries(lines).forEach(([key, text]) => {
        const el = footer.querySelector('[data-f-line="' + key + '"]');
        el.textContent = text;
        el.hidden = !text;
      });

      ['material', 'inserts'].forEach(key =>
        fillList(footer.querySelector('[data-f-section="' + key + '"]'), opt[key]));

      // One section per feature type, labeled with the type (Decorations, Features…)
      const sections = footer.querySelector('.proof-footer__sections');
      opt.byType.forEach(({ type, items }) => {
        const section = tpl('tpl-footer-type-section').cloneNode(true);
        section.dataset.fSection = type;
        section.querySelector('.proof-footer__label').textContent = type + 's';
        fillList(section, items);
        sections.appendChild(section);
      });

      return preview;
    }));
  }

  let queued = false;
  // While the pointer is down in the footer area (dragging a footer, clicking
  // Save PDF), hold re-renders so the element under the pointer isn't swapped out.
  let holding = false;
  let pending = false;

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


  // ── Width ──

  function applyWidth() {
    const w = Math.min(40, Math.max(2, Number(widthInput.value) || 10));
    dock.style.setProperty('--footer-width', w + 'in');   // dynamic value → custom property
    return w;
  }


  // ── Save PDF (one per option) ──

  function savePdf(preview) {
    const footer = preview.querySelector('[data-footer]');
    const wasCollapsed = dock.classList.contains('is-collapsed');
    dock.classList.remove('is-collapsed');   // must be visible to measure
    const w = applyWidth();
    const h = Math.ceil(footer.getBoundingClientRect().height / PX_PER_IN * 100) / 100;

    // @page can't read CSS variables, so the size is written in per print
    const pageStyle = document.createElement('style');
    pageStyle.textContent = '@page { size: ' + w + 'in ' + h + 'in; margin: 0; }';
    document.head.appendChild(pageStyle);

    const job = val(form, '#job-number');
    const originalTitle = document.title;
    document.title = (job ? job + ' ' : '') + 'Proof Footer Option ' + preview.dataset.option;   // = PDF file name

    preview.classList.add('is-printing');
    document.body.classList.add('is-printing-footer');

    window.addEventListener('afterprint', function cleanup() {
      window.removeEventListener('afterprint', cleanup);
      pageStyle.remove();
      document.title = originalTitle;
      preview.classList.remove('is-printing');
      document.body.classList.remove('is-printing-footer');
      dock.classList.toggle('is-collapsed', wasCollapsed);
    });

    window.print();
  }


  // ── Events ──

  ['input', 'change', 'click', 'keydown', 'focusout', 'combobox:commit', 'combobox:enter', 'sortable:change']
    .forEach(type => form.addEventListener(type, scheduleRender));
  document.addEventListener('bp:ready', scheduleRender);

  widthInput.addEventListener('input', applyWidth);

  list.addEventListener('pointerdown', () => { holding = true; });
  window.addEventListener('pointerup', () => setTimeout(release));   // after the click lands
  document.addEventListener('dragend', () => setTimeout(release));

  // Reordering footers reorders the options themselves (cards, numbers, footers)
  list.addEventListener('sortable:change', () => {
    const cards = [...optionList.querySelectorAll('[data-option]')];
    [...list.querySelectorAll('.footer-preview')].forEach(preview => {
      optionList.appendChild(cards[Number(preview.dataset.option) - 1]);
    });
    window.BP.renumber();
    render();
  });

  list.addEventListener('click', e => {
    const btn = e.target.closest('[data-action="save-pdf"]');
    if (btn) savePdf(btn.closest('.footer-preview'));
  });

  toggleBtn.addEventListener('click', () => {
    const open = toggleBtn.getAttribute('aria-expanded') !== 'true';
    toggleBtn.setAttribute('aria-expanded', String(open));
    dock.classList.toggle('is-collapsed', !open);
  });

  applyWidth();
  render();
})();
