import * as THREE from 'three';

/**
 * Technical-drawing render mode: white edges on black, with opaque near-black fills.
 *
 * The fills are the point, not a stylistic choice — they are what makes this read as a
 * drawing rather than a wireframe. An opaque surface hides the lines behind it, which is
 * hidden-line removal done by the depth buffer instead of by geometry.
 *
 * Nothing is rebuilt. Materials are swapped and the originals are parked on the object
 * itself (`userData.__lineView`), so an object destroyed by a scene rebuild takes its
 * saved state with it and can never be restored onto the wrong mesh.
 *
 * Side effects: replaces materials scene-wide, adds edge children named `__lineEdges`,
 * overrides the scene background, and suppresses bloom while enabled.
 *
 * An object can ask to be treated differently via `userData.lineViewSymbol`:
 *
 *   { kind: 'beam',   color }  a light effect, normally hidden, outlined as a beam instead
 *   { kind: 'accent', color }  drawn as usual but in this colour rather than white
 *   { kind: 'omit' }           left out — the drawing already derives this line elsewhere
 */

const EDGE_COLOR = 0xffffff;
const FILL_COLOR = 0x06080c;   // near-black: occludes, without flattening into the void
const TRANSLUCENT_FILL_OPACITY = 0.3;
const FIGURE_COLOR = 0x8d97a4; // people read as silhouettes; see makeFigureMaterial
const BACKGROUND = 0x000000;

/** Above this angle a shared edge is drawn. 15° keeps curved surfaces from turning into mesh. */
const EDGE_THRESHOLD_DEG = 15;

/**
 * Fabric is drawn as seam dividers over a field of soft points.
 *
 * Dividers are the panel's real seams — full-strength white, at the spacing fabric is
 * actually made up in. Everything between them is carried by the splat field below rather
 * than by ruled lines: a curtain has no edges to draw, and a haze that thickens where
 * panels overlap describes sheer material better than any hatch can.
 */
const DIVIDER_SPACING_M = 0.42;

/**
 * The splat field: fine discrete dots, well under their own spacing, so the fabric reads
 * as a fabric weave seen close up rather than as a wash of tone. Pitch sets how dense the
 * dots are, size how big each one is.
 *
 * Dots stay smaller than the gaps between them on purpose. Once size passes roughly the
 * pitch they merge and the surface goes back to being a grey veil, which is the thing
 * this stipple replaced.
 *
 * These are hand-placed Gaussians, not the trained kind: real 3D Gaussian splatting fits
 * millions of anisotropic Gaussians to photographs of a scene that already exists, which
 * is the opposite problem to drawing one that does not.
 */
const SPLAT_PITCH_M = 0.035;
const SPLAT_SIZE_M = 0.022;
/**
 * High enough that a single dot is legible, since the dots no longer overlap to build
 * tone. Layering still works — a doubled-back curtain fills more of the gaps — but it now
 * comes from coverage rather than from stacked alpha.
 */
const SPLAT_OPACITY = 0.5;
/**
 * Fraction of a cell a point may wander, on top of the half-cell row offset. Kept modest:
 * heavy jitter clumps, and clumping across ten stacked curtains reads as blotching.
 */
const SPLAT_JITTER = 0.4;
/** Dimmer than the white outlines, so the field reads as texture and not as structure. */
const SPLAT_COLOR = 0xa8b1bd;
/** Guard against a degenerate panel asking for a million points. */
const MAX_SPLATS_PER_PANEL = 60000;
/**
 * Fabric is barely filled at all. A curtain in this drawing has to show what is behind it —
 * the beam, the far side of its own ring, the next ring out — because that layering through
 * sheer material is the thing the installation is made of.
 */
const FABRIC_FILL_OPACITY = 0.1;
/**
 * Accent surfaces are lit faces — the red front of the background box, say. A wash of
 * their own colour is what makes them read as emitting rather than as a panel that
 * happens to be outlined in red.
 */
const ACCENT_FILL_OPACITY = 0.22;

const EDGE_CHILD = '__lineEdges';

/**
 * Mark an object as part of the drawing rather than part of the model: named so the
 * restore pass can find and dispose it, and invisible to picking. The pick registry
 * raycasts recursively, so an overlay parented onto a clickable mesh would otherwise
 * intercept clicks meant for the mesh underneath.
 */
function markOverlay(obj) {
  obj.name = EDGE_CHILD;
  obj.raycast = () => {};
  return obj;
}

/**
 * A translucent surface is drawn as outline only — a curtain does not hide what is behind
 * it in a drawing any more than it does in the room. Opaque surfaces keep an opaque fill,
 * which is what performs the hidden-line removal.
 */
function makeFillMaterial(original, isFabric = false, accent = null) {
  const translucent = isFabric || !!accent
    || (!!original?.transparent && (original.opacity ?? 1) < 0.9);
  let opacity = 1;
  if (accent) opacity = ACCENT_FILL_OPACITY;
  else if (isFabric) opacity = FABRIC_FILL_OPACITY;
  else if (translucent) opacity = TRANSLUCENT_FILL_OPACITY;
  return new THREE.MeshBasicMaterial({
    color: accent ? new THREE.Color(accent) : FILL_COLOR,
    side: original?.side ?? THREE.FrontSide,
    transparent: translucent,
    opacity,
    depthWrite: !translucent,
    // Push fills away from the camera so the edge lines sitting on the same surface win
    // the depth test instead of z-fighting with it.
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

/**
 * Skinned meshes cannot use `EdgesGeometry`: it reads the bind-pose geometry and would
 * leave a frozen outline behind every moving figure. They get a flat silhouette instead.
 */
function makeFigureMaterial() {
  return new THREE.MeshBasicMaterial({ color: FIGURE_COLOR });
}

function makeEdgeMaterial() {
  return new THREE.LineBasicMaterial({ color: EDGE_COLOR });
}

function makeAccentMaterial(color) {
  return new THREE.LineBasicMaterial({ color: new THREE.Color(color) });
}

const drawBufferSize = new THREE.Vector2();

/**
 * The splat material: a Gaussian evaluated per fragment, sized in metres.
 *
 * `PointsMaterial` cannot be used here. A point smaller than one pixel is clamped to one
 * pixel by the rasterizer and keeps its full alpha, so distant fabric — where 140,000
 * splats are all sub-pixel — turns into fixed-density static that never thins with
 * distance. This shader keeps the clamp but scales alpha by the area it lost, which is
 * what lets a curtain across the room fade out instead of buzzing.
 *
 * Splats must not write depth: they are unsorted within a panel and layered many deep
 * between panels, so whichever drew first would cut holes in everything behind it.
 */
function makeSplatMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(SPLAT_COLOR) },
      uOpacity: { value: SPLAT_OPACITY },
      uSize: { value: SPLAT_SIZE_M },
      uScale: { value: 300 }, // replaced per frame from the drawing buffer height
    },
    vertexShader: /* glsl */ `
      uniform float uSize;
      uniform float uScale;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float wanted = uSize * (uScale / max(0.001, -mv.z));
        float drawn = max(wanted, 1.0);
        // Energy the clamp would have added back, removed again as alpha.
        vAlpha = uOpacity * min(1.0, (wanted * wanted) / (drawn * drawn));
        gl_PointSize = drawn;
        gl_Position = projectionMatrix * mv;
      }
    `,
      fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        // Solid core with a soft rim rather than a pure Gaussian: at two or three pixels
        // across, a Gaussian is all rim and the dot reads as a smudge instead of a dot.
        float r = length(gl_PointCoord - vec2(0.5)) * 2.0;   // 0 at centre, 1 at the edge
        float a = (1.0 - smoothstep(0.45, 1.0, r)) * vAlpha;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  });
}

/** Deterministic jitter: the same panel scatters the same way every time it is rebuilt. */
function hash2(a, b) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Glows, beams, and sprites describe light, not form, so their shaded appearance has no
 * place in a line drawing. They are hidden — unless they opt into a drawn symbol; see
 * `makeLightSymbol`.
 */
function isLightEffect(obj) {
  if (obj.isSprite || obj.isPoints) return true;
  const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
  return mats.some((m) => m && (m.blending === THREE.AdditiveBlending || m.isShaderMaterial));
}

/**
 * A drawn stand-in for a light effect that opts in with
 * `userData.lineViewSymbol = { kind, color }`.
 *
 * Hiding every glow is right for spill and halos, but the central beam is the subject of
 * the installation — a drawing of the room without it is missing the thing the room was
 * built around. It is drawn as a cylinder outline instead: base and top circles plus four
 * ribs, which is how a beam of light is drawn by hand.
 *
 * Built from the mesh's own geometry parameters and parented to it, so the symbol tracks
 * the occupancy pulse exactly as the shaded beam does.
 */
function makeLightSymbol(mesh) {
  const spec = mesh.userData.lineViewSymbol;
  if (spec?.kind !== 'beam') return null;

  const p = mesh.geometry?.parameters;
  const r = p?.radiusTop ?? p?.radius ?? 0;
  const h = p?.height ?? 0;
  if (!r || !h) return null;

  const SEGMENTS = 40;
  const RIBS = 4;
  const pts = [];
  for (const y of [-h / 2, h / 2]) {
    for (let i = 0; i < SEGMENTS; i++) {
      const a0 = (i / SEGMENTS) * Math.PI * 2;
      const a1 = ((i + 1) / SEGMENTS) * Math.PI * 2;
      pts.push(
        new THREE.Vector3(r * Math.cos(a0), y, r * Math.sin(a0)),
        new THREE.Vector3(r * Math.cos(a1), y, r * Math.sin(a1)),
      );
    }
  }
  for (let i = 0; i < RIBS; i++) {
    const a = (i / RIBS) * Math.PI * 2;
    pts.push(
      new THREE.Vector3(r * Math.cos(a), -h / 2, r * Math.sin(a)),
      new THREE.Vector3(r * Math.cos(a), h / 2, r * Math.sin(a)),
    );
  }

  const symbol = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({
      color: new THREE.Color(spec.color ?? EDGE_COLOR),
      // Deliberately exempt from hidden-line removal, matching the shaded view where the
      // beam reads through the curtains around it. Ten rings of fabric stand between the
      // beam and any outside viewpoint; occluding it would hide it from every angle but
      // plan, which is the bug this symbol exists to fix.
      depthTest: false,
      depthWrite: false,
    }),
  );
  symbol.renderOrder = 999;
  return markOverlay(symbol);
}

/**
 * Meshes that exist only to catch clicks are never drawn. Giving one a fill would put an
 * opaque lid over the room — the ceiling raycast plane is exactly that.
 */
function isInvisibleHelper(obj) {
  const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
  return mats.every((m) => m && m.visible === false);
}

/**
 * What a curtain panel is drawn with: seam dividers, and a splat field for the cloth
 * between them.
 *
 * Both are built from the cylinder's own parameters, so they sit exactly on the panel's
 * arc and inside its own edges rather than approximating either. Points are laid out on a
 * jittered grid rather than at random — pure random sampling clumps, and clumping in a
 * field this sparse shows up as blotches on the fabric.
 *
 * @returns {THREE.Object3D[]} the splat field and the dividers, in draw order
 */
function makeFabricRuling(mesh) {
  const p = mesh.geometry?.parameters;
  if (!p || p.thetaLength === undefined) return [];

  const r = p.radiusTop ?? p.radius ?? 0;
  const h = p.height ?? 0;
  if (!r || !h) return [];

  // CylinderGeometry lays out x = r·sinθ, z = r·cosθ.
  const at = (theta, y) => new THREE.Vector3(r * Math.sin(theta), y, r * Math.cos(theta));
  const arcLength = r * p.thetaLength;
  const out = [];

  // Splat field: a jittered grid across the panel surface.
  let cols = Math.max(2, Math.round(arcLength / SPLAT_PITCH_M));
  let rows = Math.max(2, Math.round(h / SPLAT_PITCH_M));
  if (cols * rows > MAX_SPLATS_PER_PANEL) {
    // Thin both axes by the same factor, so an over-budget panel loses density evenly
    // instead of turning into stripes.
    const k = Math.sqrt(MAX_SPLATS_PER_PANEL / (cols * rows));
    cols = Math.max(2, Math.floor(cols * k));
    rows = Math.max(2, Math.floor(rows * k));
  }

  const splatPts = [];
  for (let w = 0; w < rows; w++) {
    // Half-cell stagger between rows: hexagonal packing covers far more evenly than a
    // square grid at the same count, which is what keeps the tone from banding.
    const stagger = (w % 2) * 0.5;
    for (let c = 0; c < cols; c++) {
      const u = (c + 0.5 + stagger + (hash2(c, w) - 0.5) * SPLAT_JITTER) / cols;
      const v = (w + 0.5 + (hash2(w, c + 17) - 0.5) * SPLAT_JITTER) / rows;
      if (u < 0 || u > 1) continue;
      splatPts.push(at(p.thetaStart + p.thetaLength * u, -h / 2 + h * v));
    }
  }
  const splatMaterial = makeSplatMaterial();
  const splats = new THREE.Points(
    new THREE.BufferGeometry().setFromPoints(splatPts), splatMaterial,
  );
  markOverlay(splats);
  // The shader sizes points itself, so it needs the drawing buffer height that
  // PointsMaterial would have been given. Reading it here keeps resize and pixel-ratio
  // changes handled without this module having to know the renderer exists.
  splats.onBeforeRender = (renderer) => {
    splatMaterial.uniforms.uScale.value = renderer.getDrawingBufferSize(drawBufferSize).y * 0.5;
  };
  out.push(splats);

  // Dividers: the panel's seams, drawn at full weight over the field.
  const bays = Math.max(1, Math.round(arcLength / DIVIDER_SPACING_M));
  const dividerPts = [];
  for (let i = 1; i < bays; i++) {
    const theta = p.thetaStart + p.thetaLength * (i / bays);
    dividerPts.push(at(theta, -h / 2), at(theta, h / 2));
  }
  if (dividerPts.length) {
    const dividers = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(dividerPts), makeEdgeMaterial(),
    );
    out.push(markOverlay(dividers));
  }

  return out;
}

/**
 * @param {{scene: THREE.Scene, bloomPass?: {strength: number}}} ctx
 */
export function createLineView({ scene, bloomPass }) {
  let enabled = false;
  let savedBackground = null;

  function convert(obj) {
    if (obj.userData.__lineView) return; // already converted
    const isFabric = !Array.isArray(obj.material) && !!obj.material?.userData?.fabric;
    const spec = obj.userData.lineViewSymbol;

    obj.userData.__lineView = {
      material: obj.material,
      visible: obj.visible,
    };

    if (spec?.kind === 'omit') {
      obj.visible = false;
      return;
    }

    if (isLightEffect(obj) || isInvisibleHelper(obj)) {
      const symbol = makeLightSymbol(obj);
      if (!symbol) {
        obj.visible = false;
        return;
      }
      // The object stays in the graph so the symbol inherits its transform; only the
      // material is silenced. Hiding the object would hide the symbol with it.
      obj.material = new THREE.MeshBasicMaterial({ visible: false });
      obj.add(symbol);
      return;
    }

    if (obj.isSkinnedMesh) {
      obj.material = makeFigureMaterial();
      return;
    }

    const accent = spec?.kind === 'accent' ? spec.color : null;
    obj.material = Array.isArray(obj.material)
      ? obj.material.map((m) => makeFillMaterial(m, false, accent))
      : makeFillMaterial(obj.material, isFabric, accent);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(obj.geometry, EDGE_THRESHOLD_DEG),
      accent ? makeAccentMaterial(accent) : makeEdgeMaterial(),
    );
    obj.add(markOverlay(edges));

    if (isFabric) {
      for (const line of makeFabricRuling(obj)) obj.add(line);
    }
  }

  function convertLine(obj) {
    if (obj.userData.__lineView) return;
    obj.userData.__lineView = { material: obj.material, visible: obj.visible };
    const spec = obj.userData.lineViewSymbol;
    if (spec?.kind === 'omit') {
      obj.visible = false;
      return;
    }
    obj.material = spec?.kind === 'accent' ? makeAccentMaterial(spec.color) : makeEdgeMaterial();
  }

  function restoreOne(obj) {
    const saved = obj.userData.__lineView;
    if (!saved) return;
    obj.material = saved.material;
    obj.visible = saved.visible;
    delete obj.userData.__lineView;
  }

  /** Convert anything added since the mode was switched on (a ring rebuild, say). */
  function apply() {
    if (!enabled) return;
    const meshes = [];
    const lines = [];
    const strays = [];
    scene.traverse((obj) => {
      if (obj.name === EDGE_CHILD) return;
      if (obj.parent?.name === EDGE_CHILD) return;
      if (obj.isMesh) meshes.push(obj);
      else if (obj.isLine || obj.isLineSegments) lines.push(obj);
      else if (obj.isSprite || obj.isPoints) strays.push(obj);
    });
    // Collected first: converting adds children, which would extend a live traversal.
    meshes.forEach(convert);
    lines.forEach(convertLine);
    strays.forEach(convert);
  }

  return {
    isEnabled: () => enabled,

    setEnabled(next) {
      if (next === enabled) return;
      enabled = next;

      if (enabled) {
        savedBackground = scene.background;
        scene.background = new THREE.Color(BACKGROUND);
        apply();
      } else {
        const created = [];
        const converted = [];
        scene.traverse((obj) => {
          if (obj.name === EDGE_CHILD) created.push(obj);
          else if (obj.userData.__lineView) converted.push(obj);
        });
        created.forEach((edge) => {
          edge.parent?.remove(edge);
          edge.geometry.dispose();
          edge.material.dispose();
        });
        converted.forEach((obj) => {
          // The swapped-in material is ours to dispose; the original belongs to the scene.
          const swapped = obj.material;
          if (swapped !== obj.userData.__lineView.material) {
            if (Array.isArray(swapped)) swapped.forEach((m) => m?.dispose?.());
            else swapped?.dispose?.();
          }
          restoreOne(obj);
        });
        scene.background = savedBackground;
        savedBackground = null;
      }
    },

    /** Call after the scene rebuilds so new geometry joins the drawing. */
    refresh: apply,

    /** Bloom is a lighting effect; a drawing has none. Called from the render loop. */
    bloomStrengthFor(value) {
      return enabled ? 0 : value;
    },

    get bloomPass() { return bloomPass; },
  };
}
