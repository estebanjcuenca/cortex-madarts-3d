import { el } from './dom.js';

/**
 * A selectable list of named things, with add, inline rename, and delete.
 *
 * Inputs:  { items, selectedId, addLabel, emptyText, onSelect, onRename, onDelete, onAdd }
 *          items are `{ id, label, meta?, badge?, locked? }`; `locked` hides delete
 * Outputs: { el, setItems, setSelected, getSelected, destroy }
 * Effects: none beyond its own subtree; deletion confirms with the user before reporting
 *
 * Fixtures, looks, and saved views are all this control — which is why it is a primitive
 * rather than three near-identical panels.
 */
export function namedList({
  items = [],
  selectedId = null,
  addLabel = 'Add',
  emptyText = 'Nothing saved yet.',
  onSelect, onRename, onDelete, onAdd,
} = {}) {
  let data = [...items];
  let selected = selectedId;
  let editingId = null;

  const list = el('div', { class: 'nlist' });
  const root = el('div', { class: 'ctl nlistwrap' }, [list]);

  if (onAdd) {
    const addBtn = el('button', { type: 'button', class: 'smallbtn', text: addLabel });
    addBtn.addEventListener('click', () => onAdd());
    root.appendChild(el('div', { class: 'btnrow' }, [addBtn]));
  }

  function beginRename(item) {
    editingId = item.id;
    render();
  }

  function commitRename(id, value) {
    const name = value.trim();
    editingId = null;
    const item = data.find((i) => i.id === id);
    if (name && item && name !== item.label) onRename?.(id, name);
    else render();
  }

  function renderRow(item) {
    const isSelected = item.id === selected;
    const row = el('div', {
      class: `nrow${isSelected ? ' selected' : ''}`,
      role: 'option', 'aria-selected': String(isSelected),
    });

    if (editingId === item.id) {
      const input = el('input', { type: 'text', class: 'nrename', value: item.label });
      input.addEventListener('click', (e) => e.stopPropagation());
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commitRename(item.id, input.value); }
        if (e.key === 'Escape') { editingId = null; render(); }
      });
      input.addEventListener('blur', () => {
        if (editingId === item.id) commitRename(item.id, input.value);
      });
      row.appendChild(input);
      // Focus after the row is in the document, otherwise the caret never lands.
      queueMicrotask(() => { input.focus(); input.select(); });
      return row;
    }

    row.appendChild(el('span', { class: 'nlabel', text: item.label }));
    if (item.badge) row.appendChild(el('span', { class: 'nbadge', text: item.badge }));
    if (item.meta) row.appendChild(el('span', { class: 'nmeta', text: item.meta }));

    const actions = el('span', { class: 'nactions' });
    if (onRename) {
      const btn = el('button', {
        type: 'button', class: 'niconbtn', text: '✎',
        title: `Rename ${item.label}`, 'aria-label': `Rename ${item.label}`,
      });
      btn.addEventListener('click', (e) => { e.stopPropagation(); beginRename(item); });
      actions.appendChild(btn);
    }
    if (onDelete && !item.locked) {
      const btn = el('button', {
        type: 'button', class: 'niconbtn ndelete', text: '×',
        title: `Delete ${item.label}`, 'aria-label': `Delete ${item.label}`,
      });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.confirm(`Delete "${item.label}"? This cannot be undone.`)) onDelete(item.id);
      });
      actions.appendChild(btn);
    }
    if (actions.childElementCount) row.appendChild(actions);

    row.addEventListener('click', () => {
      selected = item.id;
      render();
      onSelect?.(item.id);
    });
    return row;
  }

  function render() {
    list.replaceChildren();
    if (!data.length) {
      list.appendChild(el('div', { class: 'nempty', text: emptyText }));
      return;
    }
    list.setAttribute('role', 'listbox');
    for (const item of data) list.appendChild(renderRow(item));
  }

  render();

  return {
    el: root,
    setItems(next) {
      data = [...next];
      if (selected && !data.some((i) => i.id === selected)) selected = null;
      editingId = null;
      render();
    },
    setSelected(id) { selected = id; render(); },
    getSelected: () => selected,
    destroy() { root.remove(); },
  };
}
