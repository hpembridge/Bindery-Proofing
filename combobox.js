// ── Combobox (type-ahead with suggestions) ──
// Markup lives in index.html:
//   <div class="combobox" data-combobox data-source="…">
//     <input class="field combobox__input" role="combobox" …>
//     <ul class="combobox__listbox" role="listbox" hidden></ul>
//   </div>
//
// This file only filters, renders the suggestion <li>s (from the
// #tpl-combobox-* templates), handles keyboard/mouse, and checks the
// typed value is on the list. In Angular this becomes one Combobox
// component with an `options` input and a `valueChange` output.
//
// The page tells it where suggestions come from:
//   Combobox.optionsFor = (comboboxEl) => [{ value, group? }, …]
// and listens for:
//   'combobox:commit'  detail: { value }   value is '' when cleared,
//                                          null when it isn't on the list
//
// Free-form mode (add `data-freeform` to the .combobox): the typed text
// doesn't have to be on the list. Enter (or clicking a suggestion) fires
//   'combobox:enter'   detail: { value }
// and the page decides what to do with it (e.g. turn it into a chip).

(function () {
  'use strict';

  const MAX_RESULTS = 50;   // bookcloth has ~1,100 entries
  let uid = 0;

  const tpl = id => document.getElementById(id).content.firstElementChild;

  const Combobox = {
    optionsFor: () => [],

    matchKey: s => s.toLowerCase().replace(/[\s"”]+/g, '').replace(/×/g, 'x'),

    // Empty the input and close the list (free-form mode, after an entry).
    // Pass keepValue to just close the list and leave the text in place.
    reset(el, keepValue) {
      if (!keepValue) Combobox.setValue(el, '');
      close(el);
    },

    // Give the input/listbox an id pair. Call once per new combobox.
    setup(el) {
      const input = el.querySelector('.combobox__input');
      const list = el.querySelector('.combobox__listbox');
      list.id = 'cb-list-' + (++uid);
      // Chrome makes scrolling boxes Tab stops; keep the list out of the Tab
      // order so Tab goes to the next field, not into the (closing) list
      list.tabIndex = -1;
      input.setAttribute('aria-controls', list.id);
    },

    // Set a value from code (e.g. clearing Function when Material changes).
    setValue(el, value) {
      const input = el.querySelector('.combobox__input');
      input.value = value;
      el.dataset.value = value;
      setInvalid(el, false);
    },
  };


  // ── Rendering ──

  function matches(el) {
    const input = el.querySelector('.combobox__input');
    const all = Combobox.optionsFor(el);
    // When the field already holds a picked value, show the whole list.
    const q = input.value === el.dataset.value ? '' : input.value.trim().toLowerCase();
    if (!q) return { q, list: all };

    // Compare loosely: ignore spaces, inch marks and × vs x ("8.5x11" finds "8.5 x 11")
    const key = Combobox.matchKey(q);
    const hits = all.filter(o => Combobox.matchKey(o.value).includes(key));
    // Ungrouped lists: "starts with" matches first
    if (!all.some(o => o.group)) {
      hits.sort((a, b) =>
        Combobox.matchKey(b.value).startsWith(key) - Combobox.matchKey(a.value).startsWith(key));
    }
    return { q, list: hits };
  }

  function render(el) {
    const listbox = el.querySelector('.combobox__listbox');
    const { q, list } = matches(el);
    listbox.replaceChildren();
    el._options = [];

    if (!list.length) {
      listbox.appendChild(tpl('tpl-combobox-empty').cloneNode(true));
    }

    let group = null;
    list.slice(0, MAX_RESULTS).forEach((opt, i) => {
      if (opt.group && opt.group !== group) {
        group = opt.group;
        const g = tpl('tpl-combobox-group').cloneNode(true);
        g.textContent = group;
        listbox.appendChild(g);
      }
      const li = tpl('tpl-combobox-option').cloneNode(true);
      li.id = listbox.id + '-' + i;
      li.dataset.value = opt.value;
      li.setAttribute('aria-selected', String(opt.value === el.dataset.value));
      highlight(li, opt.value, q);
      listbox.appendChild(li);
      el._options.push(li);
    });

    if (list.length > MAX_RESULTS) {
      listbox.appendChild(tpl('tpl-combobox-more').cloneNode(true));
    }

    setActive(el, -1);
  }

  // Wrap the matched part of the text in <mark>.
  function highlight(li, text, q) {
    li.textContent = '';
    const at = q ? text.toLowerCase().indexOf(q) : -1;
    if (at < 0) { li.textContent = text; return; }
    const mark = document.createElement('mark');
    mark.className = 'combobox__match';
    mark.textContent = text.slice(at, at + q.length);
    li.append(text.slice(0, at), mark, text.slice(at + q.length));
  }


  // ── Open / close / active option ──

  function open(el) {
    render(el);
    // Free-form fields don't need a "No matches" list — just stay closed.
    if (el.hasAttribute('data-freeform') && !el._options.length) return close(el);
    el.querySelector('.combobox__listbox').hidden = false;
    el.querySelector('.combobox__input').setAttribute('aria-expanded', 'true');
    el.classList.add('is-open');
  }

  function close(el) {
    el.querySelector('.combobox__listbox').hidden = true;
    const input = el.querySelector('.combobox__input');
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    el.classList.remove('is-open');
  }

  function setActive(el, index) {
    const opts = el._options || [];
    const input = el.querySelector('.combobox__input');
    opts.forEach(li => li.classList.remove('is-active'));
    el._active = index;
    const li = opts[index];
    if (li) {
      li.classList.add('is-active');
      li.scrollIntoView({ block: 'nearest' });
      input.setAttribute('aria-activedescendant', li.id);
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }


  // ── Commit / validate ──

  function choose(el, value) {
    Combobox.setValue(el, value);
    close(el);
    el.dispatchEvent(new CustomEvent('combobox:commit', { bubbles: true, detail: { value } }));
  }

  function enter(el, value) {
    if (!value.trim()) return;
    el.dispatchEvent(new CustomEvent('combobox:enter', { bubbles: true, detail: { value } }));
  }

  // On blur: accept an exact (case-insensitive) match, else flag it.
  function validate(el) {
    const input = el.querySelector('.combobox__input');
    const text = input.value.trim();
    if (text === (el.dataset.value || '')) return;

    if (!text) return choose(el, '');
    const hit = Combobox.optionsFor(el).find(o => o.value.toLowerCase() === text.toLowerCase());
    if (hit) return choose(el, hit.value);

    el.dataset.value = '';
    setInvalid(el, true);
    el.dispatchEvent(new CustomEvent('combobox:commit', { bubbles: true, detail: { value: null } }));
  }

  function setInvalid(el, isInvalid) {
    el.querySelector('.combobox__input').setAttribute('aria-invalid', String(isInvalid));
  }


  // ── Events (delegated, so cloned rows just work) ──

  const comboOf = t => t.closest && t.closest('[data-combobox]');

  document.addEventListener('focusin', e => {
    if (e.target.matches('.combobox__input')) open(comboOf(e.target));
  });

  document.addEventListener('focusout', e => {
    if (!e.target.matches('.combobox__input')) return;
    const el = comboOf(e.target);
    close(el);
    if (!el.hasAttribute('data-freeform')) validate(el);
  });

  document.addEventListener('input', e => {
    if (!e.target.matches('.combobox__input')) return;
    const el = comboOf(e.target);
    setInvalid(el, false);
    open(el);
  });

  document.addEventListener('keydown', e => {
    if (!e.target.matches('.combobox__input')) return;
    const el = comboOf(e.target);
    const count = (el._options || []).length;
    const isOpen = el.classList.contains('is-open');

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) return open(el);
        setActive(el, Math.min(el._active + 1, count - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive(el, Math.max(el._active - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();   // never submit the form from a combobox
        if (el.hasAttribute('data-freeform')) {
          const active = isOpen && el._options[el._active];
          enter(el, active ? active.dataset.value : e.target.value);
          break;
        }
        if (isOpen && el._options[el._active]) choose(el, el._options[el._active].dataset.value);
        else if (isOpen && count === 1) choose(el, el._options[0].dataset.value);
        break;
      case 'Tab':
        // Commit before focus moves, so fields this choice reveals or enables
        // (e.g. Bookcloth search, Function) are next in the tab order.
        if (el.hasAttribute('data-freeform')) break;
        if (isOpen && el._options[el._active]) choose(el, el._options[el._active].dataset.value);
        else validate(el);
        break;
      case 'Escape':
        if (isOpen) { e.preventDefault(); close(el); }
        break;
    }
  });

  // mousedown keeps focus in the input; click picks the option.
  document.addEventListener('mousedown', e => {
    if (e.target.closest('.combobox__listbox')) e.preventDefault();
  });

  document.addEventListener('click', e => {
    const li = e.target.closest('.combobox__option');
    if (!li) return;
    const el = comboOf(li);
    if (el.hasAttribute('data-freeform')) enter(el, li.dataset.value);
    else choose(el, li.dataset.value);
  });

  window.Combobox = Combobox;
})();
