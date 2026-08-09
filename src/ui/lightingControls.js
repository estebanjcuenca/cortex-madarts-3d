import { getVisualSettings, setVisualSettings, onVisualSettingsChange } from '../settings/visualSettings.js';

/**
 * @param {{
 *   root: HTMLElement,
 *   onFabricChange?: () => void,
 *   onSceneLightsChange?: () => void,
 * }} opts
 */
export function initLightingControls({ root, onFabricChange, onSceneLightsChange }) {
  root.innerHTML = `
    <div class="layergrouptitle" style="margin-top:4px;">Central light</div>
    <div class="numrow"><span>Intensity</span><input type="range" id="ltIntensity" min="0" max="2" step="0.05" value="1"></div>
    <div class="numrow"><span>Beam</span><input type="range" id="ltBeam" min="0" max="2" step="0.05" value="1"></div>
    <div class="numrow"><span>Base glow</span><input type="range" id="ltGlow" min="0" max="2" step="0.05" value="1"></div>
    <div class="numrow"><span>Bloom</span><input type="range" id="ltBloom" min="0" max="2" step="0.05" value="1"></div>
    <div class="layergrouptitle" style="margin-top:10px;">Fabric curtains</div>
    <div class="numrow"><span>Brightness</span><input type="range" id="fbBrightness" min="0.3" max="2" step="0.05" value="1"></div>
    <div class="numrow"><span>Light wash</span><input type="range" id="fbWash" min="0" max="1" step="0.05" value="0.2"></div>
    <div class="layergrouptitle" style="margin-top:10px;">Room fill</div>
    <div class="numrow"><span>Ambient</span><input type="range" id="scAmbient" min="0" max="2" step="0.05" value="1"></div>
    <div class="numrow"><span>Key + rim</span><input type="range" id="scFill" min="0" max="2" step="0.05" value="1"></div>
  `;

  const ids = {
    ltIntensity: 'centralLight.intensity',
    ltBeam: 'centralLight.beam',
    ltGlow: 'centralLight.glow',
    ltBloom: 'centralLight.bloom',
    fbBrightness: 'fabric.brightness',
    fbWash: 'fabric.wash',
    scAmbient: 'scene.ambient',
    scFill: 'scene.fill',
  };

  function setPath(path, val) {
    const parts = path.split('.');
    const patch = {};
    let cur = patch;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = val;
    setVisualSettings(patch);
  }

  Object.entries(ids).forEach(([elId, path]) => {
    const el = root.querySelector(`#${elId}`);
    el.addEventListener('input', () => {
      setPath(path, parseFloat(el.value));
      if (path.startsWith('fabric.')) onFabricChange?.();
      if (path.startsWith('scene.')) onSceneLightsChange?.();
    });
  });

  function syncFromState() {
    const s = getVisualSettings();
    root.querySelector('#ltIntensity').value = s.centralLight.intensity;
    root.querySelector('#ltBeam').value = s.centralLight.beam;
    root.querySelector('#ltGlow').value = s.centralLight.glow;
    root.querySelector('#ltBloom').value = s.centralLight.bloom;
    root.querySelector('#fbBrightness').value = s.fabric.brightness;
    root.querySelector('#fbWash').value = s.fabric.wash;
    root.querySelector('#scAmbient').value = s.scene.ambient;
    root.querySelector('#scFill').value = s.scene.fill;
  }

  onVisualSettingsChange(syncFromState);
  syncFromState();
}
