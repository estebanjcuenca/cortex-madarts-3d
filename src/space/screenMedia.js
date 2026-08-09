import * as THREE from 'three';

/**
 * Owns whatever the projection screen is showing: the generated deep-space still by
 * default, or a video or image supplied as a URL or a local file.
 *
 * The texture wraps the main arc exactly as the two edge-blended projectors would —
 * `CylinderGeometry` runs u from 0 to 1 across `thetaLength`, so media mapped onto the
 * 227° arc mesh needs no UV work. It is stretched to the arc's aspect (~3.9:1), which is
 * wider than 16:9 content; see `ASPECT_NOTE`.
 *
 * Local files are the most reliable source: they become blob URLs, so none of the
 * cross-origin rules that block most remote media apply to them.
 *
 * Side effects: may create one <video> element, kept out of the DOM flow.
 */

const DEFAULT_STATUS = 'Showing the generated deep-space still.';
const ASPECT_NOTE = 'Stretched to the arc (~3.9:1) — 16:9 content will look wide.';

const VIDEO_EXT = /\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i;
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|avif|bmp)(\?|#|$)/i;

/**
 * Hosts that only ever hand out a player page, never the decoded frames WebGL needs.
 * Detected so the panel can say why instead of failing with a generic media error.
 */
function embedOnlyHost(url) {
  try {
    const u = new URL(url, window.location.href);
    const host = u.hostname.replace(/^www\./, '');
    // Vimeo Pro progressive links ARE direct files, so only reject the player pages.
    if (host === 'vimeo.com') return 'Vimeo';
    if (host === 'player.vimeo.com' && !u.pathname.includes('progressive')) return 'Vimeo';
    if (host === 'youtube.com' || host === 'youtu.be') return 'YouTube';
    return null;
  } catch {
    return null;
  }
}

const EMBED_HELP = (name) => `${name} page links cannot be shown on the screen: the browser only `
  + `exposes a player iframe, and WebGL needs the decoded frames to paint them onto the curved `
  + `surface. Download the file and use "Choose file…" instead, or paste a direct `
  + `.mp4/.webm URL${name === 'Vimeo' ? ' (a Vimeo Pro progressive link works)' : ''}.`;

function makeSpaceTexture() {
  const w = 1024, h = 512;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#03050e');
  grad.addColorStop(0.5, '#0a1026');
  grad.addColorStop(1, '#04060f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 7; i++) { // faint nebula washes
    const x = Math.random() * w, y = Math.random() * h, rad = 70 + Math.random() * 170;
    const hue = [222, 252, 282][i % 3];
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `hsla(${hue},70%,42%,0.15)`);
    g.addColorStop(1, `hsla(${hue},70%,42%,0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 420; i++) { // stars
    const s = Math.random();
    ctx.fillStyle = `rgba(${205 + Math.round(50 * s)},${215 + Math.round(40 * s)},255,${0.3 + 0.7 * s})`;
    const size = s > 0.93 ? 2 : 1;
    ctx.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * @param {{
 *   onChange?: (texture: THREE.Texture) => void,
 *   onSourceChange?: (source: {kind: string, url?: string, file?: File, name?: string}) => void,
 * }} opts
 *   `onChange` fires whenever the active texture is replaced, so the screen meshes can
 *   swap their map without a full scene rebuild. `onSourceChange` fires only when the
 *   media itself changes — not on a mirror toggle — so persistence can save it once.
 */
export function createScreenMedia({ onChange, onSourceChange } = {}) {
  let stillTexture = null;
  let activeTexture = null;
  let video = null;
  let objectUrl = null;
  let status = DEFAULT_STATUS;
  let kind = 'still'; // 'still' | 'video' | 'image'
  // The projectors sit inside the screen cylinder and throw outward, while the audience
  // stands outside it in the ring field — rear projection, so the image reaches them
  // mirrored unless it is flipped first. On by default because that is what the room does.
  let mirrored = true;
  let source = { kind: 'still' };
  let pendingSource = null;
  const listeners = [];

  function applyMirror(tex) {
    if (!tex) return;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.x = mirrored ? -1 : 1;
    tex.offset.x = mirrored ? 1 : 0;
    tex.needsUpdate = true;
  }

  function current() {
    if (activeTexture) return activeTexture;
    if (!stillTexture) stillTexture = makeSpaceTexture();
    return stillTexture;
  }

  function notify() {
    onChange?.(current());
    listeners.forEach((fn) => fn(status, kind));
  }

  function clearActive() {
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
      video = null;
    }
    if (activeTexture) {
      activeTexture.dispose();
      activeTexture = null;
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    kind = 'still';
  }

  function settle(ok, message) {
    status = message;
    if (ok && pendingSource) {
      source = pendingSource;
      onSourceChange?.(source);
    }
    pendingSource = null;
    notify();
    return { ok, status };
  }

  function fail(message) {
    clearActive();
    pendingSource = null;
    return settle(false, message);
  }

  function loadImage(src, label) {
    return new Promise((resolve) => {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(
        src,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          applyMirror(tex);
          activeTexture = tex;
          kind = 'image';
          resolve(settle(true, `Showing image ${tex.image.width}×${tex.image.height}. ${ASPECT_NOTE}`));
        },
        undefined,
        () => resolve(fail(
          `Could not load ${label} as an image — it may be blocked by CORS, or not an image file.`,
        )),
      );
    });
  }

  function loadVideo(src, label) {
    return new Promise((resolve) => {
      video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.loop = true;
      video.muted = true;        // required for autoplay without a user gesture
      video.playsInline = true;
      video.preload = 'auto';
      video.style.display = 'none';
      document.body.appendChild(video);

      video.addEventListener('error', () => {
        const code = video?.error?.code;
        resolve(fail(code === 4
          ? `Could not load ${label}: unsupported format, blocked by CORS, or not a direct video `
            + 'file. A local file always works — try "Choose file…".'
          : `Could not load ${label} (media error ${code ?? '?'}).`));
      }, { once: true });

      video.addEventListener('loadeddata', () => {
        const tex = new THREE.VideoTexture(video);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        applyMirror(tex);
        activeTexture = tex;
        kind = 'video';
        video.play().then(
          () => resolve(settle(true, `Playing ${video.videoWidth}×${video.videoHeight}. ${ASPECT_NOTE}`)),
          (err) => resolve(fail(`Loaded but could not autoplay: ${err.message}`)),
        );
      }, { once: true });

      video.src = src;
    });
  }

  /**
   * Load a local file. Always works: the blob URL is same-origin, so no CORS rules apply.
   * @param {File} file
   */
  function loadFile(file) {
    clearActive();
    if (!file) return Promise.resolve(settle(true, DEFAULT_STATUS));
    pendingSource = { kind: 'file', file, name: file.name };
    objectUrl = URL.createObjectURL(file);
    const asVideo = file.type.startsWith('video/')
      || (!file.type.startsWith('image/') && VIDEO_EXT.test(file.name));
    return asVideo ? loadVideo(objectUrl, file.name) : loadImage(objectUrl, file.name);
  }

  /**
   * Load a **direct** media URL — a video (.mp4/.webm) or an image (.png/.jpg/…). The
   * server must send `Access-Control-Allow-Origin`, because cross-origin media without
   * CORS taints the canvas and cannot be sampled. Page links to Vimeo or YouTube are
   * rejected with an explanation rather than a generic failure.
   */
  function loadUrl(url) {
    clearActive();
    const trimmed = (url ?? '').trim();
    if (!trimmed) return Promise.resolve(settle(true, DEFAULT_STATUS));

    const embed = embedOnlyHost(trimmed);
    if (embed) return Promise.resolve(settle(false, EMBED_HELP(embed)));

    pendingSource = { kind: 'url', url: trimmed };
    if (IMAGE_EXT.test(trimmed)) return loadImage(trimmed, 'the URL');
    if (VIDEO_EXT.test(trimmed)) return loadVideo(trimmed, 'the URL');

    // Extension-less URL: try it as an image first, fall back to video. The failed image
    // attempt cleared the pending source, so restate it before the retry.
    return loadImage(trimmed, 'the URL').then((res) => {
      if (res.ok) return res;
      clearActive();
      pendingSource = { kind: 'url', url: trimmed };
      return loadVideo(trimmed, 'the URL');
    });
  }

  return {
    getTexture: current,
    loadUrl,
    loadFile,
    getKind: () => kind,
    isVideo: () => kind === 'video',
    isMirrored: () => mirrored,
    /** Rear-projection flip. Off shows the raw file as authored. */
    setMirrored(next) {
      mirrored = !!next;
      applyMirror(activeTexture);
      notify();
    },
    isPlaying: () => !!video && !video.paused,
    setPaused(paused) {
      if (!video) return;
      if (paused) video.pause(); else video.play();
      status = paused ? 'Paused.' : `Playing. ${ASPECT_NOTE}`;
      notify();
    },
    getSource: () => ({ ...source }),
    clear() {
      clearActive();
      pendingSource = { kind: 'still' };
      settle(true, DEFAULT_STATUS);
    },
    getStatus: () => status,
    onStatus(fn) {
      listeners.push(fn);
      return () => listeners.splice(listeners.indexOf(fn), 1);
    },
  };
}
