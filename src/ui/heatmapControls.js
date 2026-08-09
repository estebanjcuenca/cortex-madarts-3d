import { getVisualSettings, setVisualSettings, onVisualSettingsChange } from '../settings/visualSettings.js';

/**
 * @param {{ root: HTMLElement, onChange?: () => void }} opts
 */
export function initHeatmapControls({ root, onChange }) {
  root.innerHTML = `
    <div class="numrow"><span>Overall brightness</span><input type="range" id="hmOverall" min="0.05" max="0.7" step="0.01" value="0.28"></div>
    <div class="numrow"><span id="hmBiasLabel">Toward center</span><input type="range" id="hmCenterBias" min="-1" max="1" step="0.05" value="0.45"></div>
    <div class="sectionhint">Bias −1 = brighter outside · 0 = even · +1 = brighter at center</div>
  `;

  const overall = root.querySelector('#hmOverall');
  const bias = root.querySelector('#hmCenterBias');
  const biasLabel = root.querySelector('#hmBiasLabel');

  function syncFromState() {
    const h = getVisualSettings().heatmap;
    overall.value = String(h.overall);
    bias.value = String(h.centerBias);
    biasLabel.textContent = h.centerBias < -0.05 ? 'Toward outside' : h.centerBias > 0.05 ? 'Toward center' : 'Even';
  }

  function push() {
    setVisualSettings({
      heatmap: {
        overall: parseFloat(overall.value),
        centerBias: parseFloat(bias.value),
      },
    });
    onChange?.();
  }

  overall.addEventListener('input', push);
  bias.addEventListener('input', push);
  onVisualSettingsChange(syncFromState);
  syncFromState();
}
