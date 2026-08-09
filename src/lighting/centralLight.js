import * as THREE from 'three';

const BEAM_COLOR = new THREE.Color(0xff3b30);
/** Same red as the 3D beam, for 2D views that draw it. */
export const BEAM_COLOR_HEX = '#ff3b30';
// PointLight uses physical decay (²) — the legacy intensity numbers (~1–2.6) are far too
// dim under inverse-square falloff, so the preserved pulse formula is scaled by this.
const INTENSITY_SCALE = 7;

// Pulse envelope. The beam breathes between these radii as the room fills; `update()` and
// the floorplan footprint below both read them, so the drawing cannot drift from the scene.
const PULSE_MIN_R = 0.045;
const PULSE_MAX_R = 0.42;
const GEOMETRY_R = 0.05; // cylinder radius before the pulse scales it

const pulseAmountAt = (occupancyFactor) => 0.25 + occupancyFactor * 0.15;
const pulseSpeedAt = (occupancyFactor) => 0.6 + occupancyFactor * 1.4;
const baseRadiusAt = (occupancyFactor) => THREE.MathUtils.lerp(PULSE_MIN_R, PULSE_MAX_R, occupancyFactor);

/**
 * The beam's plan footprint in metres, for the technical drawing.
 *
 * Returns the radius the beam holds on average at this occupancy plus the two extremes it
 * pulses between, because a single number would describe the beam only for the instant the
 * drawing was generated.
 *
 * @param {{occupancyFactor?: number, beamScale?: number, wallHeight?: number}} opts
 * @returns {{nominalRadius: number, minRadius: number, maxRadius: number, height: number}}
 */
export function centralBeamPlanFootprint({ occupancyFactor = 0, beamScale = 1, wallHeight = 3 } = {}) {
  const occ = THREE.MathUtils.clamp(occupancyFactor, 0, 1);
  const nominal = baseRadiusAt(occ) * beamScale;
  const amount = pulseAmountAt(occ);
  return {
    nominalRadius: nominal,
    minRadius: nominal * (1 - amount),
    maxRadius: nominal * (1 + amount),
    height: wallHeight - 0.2,
  };
}

function makeSoftBeamMaterial() {
  // Soft-silhouette beam: brightest where the surface faces the camera (center of the
  // cylinder's silhouette), fading to nothing at the edges — reads as a volumetric core
  // instead of a hard-walled tube. Bloom then supplies the halo.
  return new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uColor: { value: BEAM_COLOR.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vNormal = normalMatrix * normal;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewDir = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec2 vUv;
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(vViewDir)));
        float core = pow(facing, 2.4);
        float vertical = smoothstep(1.0, 0.72, vUv.y) * smoothstep(0.0, 0.06, vUv.y);
        float a = core * vertical;
        vec3 col = uColor * (0.55 + 1.05 * core);
        gl_FragColor = vec4(col, a);
      }
    `,
  });
}

function makeGlowSpriteTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,80,64,0.95)');
  g.addColorStop(0.35, 'rgba(255,59,48,0.45)');
  g.addColorStop(1, 'rgba(255,59,48,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The pulsing central light: soft-edge beam, base glow halo, and a shadow-casting
 * physical point light. Owns all pulse animation via update(t, occupancyFactor) —
 * the pulse formulas are preserved verbatim from the original implementation
 * (only the light intensity is scaled for physical decay).
 *
 * @param {THREE.Group} parent  rig group (positioned at the circle center by the caller)
 * @param {{wallHeight: number}} opts
 */
export function createCentralLightRig(parent, { wallHeight }) {
  const beamH = centralBeamPlanFootprint({ wallHeight }).height;

  const beamMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(GEOMETRY_R, GEOMETRY_R, beamH, 20, 1, true),
    makeSoftBeamMaterial(),
  );
  beamMesh.position.set(0, beamH / 2 + 0.06, 0);
  beamMesh.renderOrder = 999; // draw after everything so it reads through translucent curtains
  // The line-drawing mode hides glows and beams by default. The central beam is the one
  // light that must survive into the drawing, so it asks to be outlined instead.
  beamMesh.userData.lineViewSymbol = { kind: 'beam', color: BEAM_COLOR_HEX };
  parent.add(beamMesh);

  const baseGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowSpriteTexture(),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    transparent: true,
  }));
  baseGlow.scale.setScalar(1.1);
  baseGlow.position.set(0, 0.12, 0);
  baseGlow.renderOrder = 999;
  parent.add(baseGlow);

  const light = new THREE.PointLight(0xff3b30, 1.6 * INTENSITY_SCALE, 14, 2);
  light.position.set(0, 1.6, 0); // mid-beam so people are lit from the beam, not the floor
  light.castShadow = true;       // the ONLY shadow-casting light in the scene (perf budget)
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.near = 0.2;
  light.shadow.camera.far = 10;
  light.shadow.bias = -0.004;
  parent.add(light);

  const multipliers = { intensity: 1, beam: 1, glow: 1 };

  return {
    light,
    beamMesh,
    baseGlow,
    setMultipliers(partial) {
      Object.assign(multipliers, partial);
    },
    /**
     * Per-frame pulse. Formulas preserved from the original animate loop:
     * radius, speed, and amount all scale with occupancy.
     */
    update(t, occupancyFactor) {
      const baseRadius = baseRadiusAt(occupancyFactor);
      const pulseSpeed = pulseSpeedAt(occupancyFactor);
      const pulseAmount = pulseAmountAt(occupancyFactor);
      const pulse = baseRadius * (1 + Math.sin(t * pulseSpeed) * pulseAmount);

      const beamScale = (pulse / GEOMETRY_R) * multipliers.beam;
      beamMesh.scale.set(beamScale, 1, beamScale);
      baseGlow.scale.setScalar((0.7 + occupancyFactor * 1.1) * 1.1 * multipliers.glow);
      light.intensity = ((1.0 + occupancyFactor * 1.6) + Math.sin(t * pulseSpeed) * 0.35) * INTENSITY_SCALE * multipliers.intensity;
    },
  };
}
