/**
 * Layers panel — visibility toggles grouped by scene component.
 * @param {{
 *   root: HTMLElement,
 *   layers: Record<string, import('three').Group>,
 *   onLayerChange?: (id: string, visible: boolean) => void,
 *   circulationHtml?: string,
 * }} opts
 */
export function initLayersPanel({ root, layers, onLayerChange, circulationHtml = '' }) {
  const groups = [
    {
      title: 'Architecture',
      items: [
        { id: 'room', label: 'Room shell', swatch: '#3a4048', checked: true },
        { id: 'floor', label: 'Central floor (Ø4.8m)', swatch: '#c0392b', checked: true },
        { id: 'curtain', label: 'Curtain rings', swatch: '#ffffff', checked: true },
        { id: 'screen', label: 'Projection screen', swatch: '#e0c341', checked: true },
        { id: 'technical', label: 'Technical / ventilation', swatch: '#6a7380', checked: false },
        { id: 'grid', label: '1m reference grid', swatch: '#555b64', checked: false },
      ],
    },
    {
      title: 'Circulation',
      items: [
        { id: 'circulation', label: 'Circulation', swatch: '#aacdf0', checked: false },
      ],
      extra: circulationHtml,
    },
    {
      title: 'Lighting & rig',
      items: [
        { id: 'rig', label: 'Sensor + DMX light', swatch: '#ff3b30', checked: true },
        { id: 'box', label: 'Background light box', swatch: '#9b59b6', checked: true },
        { id: 'ceilingLights', label: 'Ceiling lights', swatch: '#ffd23f', checked: true },
        { id: 'fixtures', label: 'Sprinklers / exit', swatch: '#ff4d4d', checked: true },
      ],
    },
  ];

  root.innerHTML = groups.map(g => `
    <div class="layergroup">
      <div class="layergrouptitle">${g.title}</div>
      ${g.items.map(it => `
        <label class="row">
          <input type="checkbox" data-layer="${it.id}" ${it.checked ? 'checked' : ''}>
          <span class="swatch" style="background:${it.swatch}"></span>${it.label}
        </label>
      `).join('')}
      ${g.extra || ''}
    </div>
  `).join('');

  root.querySelectorAll('[data-layer]').forEach((inp) => {
    inp.addEventListener('change', () => {
      const id = inp.dataset.layer;
      const g = layers[id];
      if (g) g.visible = inp.checked;
      onLayerChange?.(id, inp.checked);
    });
  });
}
