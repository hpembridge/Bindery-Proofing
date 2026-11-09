// ── Sortable: drag & drop reordering ──
// Markup decides what can be reordered (index.html):
//   container  [data-sortable]  (+ data-axis="x" for side-by-side items like chips)
//   item       [data-sortable-item]   — a direct child of the container
//   handle     [data-drag-handle]     — the grip you drag by
// Items only move within their own container (a binding row stays in its
// option, a chip stays in its row). When an item lands somewhere new, the
// container fires 'sortable:change' (bubbles) so the page can react.
//
// Keyboard: focus a handle and use the arrow keys to move the item.
//
// In Angular this is the CDK's cdkDropList / cdkDrag / cdkDragHandle.

(function () {
  'use strict';

  let dragged = null;
  let startIndex = -1;

  const itemOf = el => el.closest('[data-sortable-item]');
  const containerOf = item => item.parentElement.closest('[data-sortable]');
  const items = container => [...container.children].filter(c => c.matches('[data-sortable-item]'));
  const indexOf = item => items(containerOf(item)).indexOf(item);

  function changed(item, from) {
    if (indexOf(item) !== from) {
      containerOf(item).dispatchEvent(new CustomEvent('sortable:change', { bubbles: true, detail: { item } }));
    }
  }

  // Only the handle makes an item draggable, so text fields inside stay usable
  document.addEventListener('pointerdown', e => {
    const handle = e.target.closest('[data-drag-handle]');
    if (handle) itemOf(handle).draggable = true;
  });

  document.addEventListener('dragstart', e => {
    const item = e.target.closest && e.target.closest('[data-sortable-item][draggable="true"]');
    if (!item) return;
    dragged = item;
    startIndex = indexOf(item);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
    requestAnimationFrame(() => item.classList.add('is-dragging'));
  });

  document.addEventListener('dragover', e => {
    if (!dragged) return;
    const container = containerOf(dragged);
    if (!container.contains(e.target)) return;   // stay inside the same list
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const over = itemOf(e.target);
    if (!over || over === dragged || containerOf(over) !== container) return;

    // Before or after the item under the pointer, by its midpoint
    const r = over.getBoundingClientRect();
    const horizontal = container.dataset.axis === 'x';
    const after = horizontal ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
    container.insertBefore(dragged, after ? over.nextSibling : over);
  });

  document.addEventListener('drop', e => { if (dragged) e.preventDefault(); });

  document.addEventListener('dragend', () => {
    if (!dragged) return;
    const item = dragged;
    dragged = null;
    item.classList.remove('is-dragging');
    item.draggable = false;
    changed(item, startIndex);
  });

  // Arrow keys on a focused handle move its item by one place
  document.addEventListener('keydown', e => {
    const handle = e.target.closest && e.target.closest('[data-drag-handle]');
    if (!handle) return;
    const item = itemOf(handle);
    const container = containerOf(item);
    const list = items(container);
    const i = list.indexOf(item);
    const back = container.dataset.axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
    const fwd = container.dataset.axis === 'x' ? 'ArrowRight' : 'ArrowDown';

    if (e.key === back && i > 0) container.insertBefore(item, list[i - 1]);
    else if (e.key === fwd && i < list.length - 1) container.insertBefore(item, list[i + 1].nextSibling);
    else return;
    e.preventDefault();
    handle.focus();
    changed(item, i);
  });
})();
