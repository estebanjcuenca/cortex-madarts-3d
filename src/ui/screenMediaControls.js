/**
 * Controls for what the projection screen shows: a local video or image file, a direct
 * media URL, or the generated deep-space still.
 *
 * @param {{
 *   root: HTMLElement,
 *   media: ReturnType<import('../space/screenMedia.js').createScreenMedia>,
 *   dropTarget?: HTMLElement,
 * }} opts
 *   `dropTarget` also accepts dragged files, so media can be dropped straight onto the view.
 */
export function initScreenMediaControls({ root, media, dropTarget }) {
  root.innerHTML = `
    <div class="btnrow">
      <button class="smallbtn" id="screenMediaFile">Choose file…</button>
      <button class="smallbtn" id="screenMediaPause">Pause</button>
      <button class="smallbtn" id="screenMediaClear">Clear</button>
    </div>
    <input type="file" id="screenMediaInput" accept="video/*,image/*" style="display:none;">
    <div class="numrow" style="margin-top:8px;"><span>Or a direct media URL</span></div>
    <input type="text" id="screenMediaUrl" placeholder="https://…/clip.mp4 or image.jpg" style="width:100%;box-sizing:border-box;">
    <div class="btnrow" style="margin-top:6px;">
      <button class="smallbtn" id="screenMediaLoad">Show on screen</button>
    </div>
    <label class="row" style="margin-top:8px;"><input type="checkbox" id="screenMediaMirror" checked>Mirror for rear projection</label>
    <div id="screenMediaStatus" style="font-size:10px;line-height:1.4;color:var(--dim);margin-top:6px;"></div>
    <div style="font-size:10px;line-height:1.4;color:var(--dim);margin-top:6px;">
      Local files always work. Remote URLs must be a direct video or image file and must allow
      cross-origin use — Vimeo and YouTube page links cannot be used. You can also drag a file
      onto the view. The projectors throw outward from inside the screen cylinder, so the image
      is mirrored to read correctly from the ring field; untick to see the file as authored.
    </div>
  `;

  const fileBtn = root.querySelector('#screenMediaFile');
  const fileInput = root.querySelector('#screenMediaInput');
  const pauseBtn = root.querySelector('#screenMediaPause');
  const clearBtn = root.querySelector('#screenMediaClear');
  const urlInput = root.querySelector('#screenMediaUrl');
  const loadBtn = root.querySelector('#screenMediaLoad');
  const statusEl = root.querySelector('#screenMediaStatus');

  function sync(text) {
    statusEl.textContent = text ?? media.getStatus();
    const isVideo = media.isVideo();
    pauseBtn.disabled = !isVideo;
    pauseBtn.textContent = isVideo && !media.isPlaying() ? 'Resume' : 'Pause';
    // Read back rather than assume: the media may have been changed programmatically,
    // as autosave restore does after this panel is built.
    root.querySelector('#screenMediaMirror').checked = media.isMirrored();
  }
  media.onStatus(sync);
  sync();

  fileBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    statusEl.textContent = `Loading ${file.name}…`;
    await media.loadFile(file);
    fileInput.value = ''; // let the same file be picked again after a Clear
  });

  loadBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) { statusEl.textContent = 'Enter a direct media URL first.'; return; }
    loadBtn.disabled = true;
    statusEl.textContent = 'Loading…';
    await media.loadUrl(url);
    loadBtn.disabled = false;
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadBtn.click();
  });

  pauseBtn.addEventListener('click', () => media.setPaused(media.isPlaying()));

  const mirrorBox = root.querySelector('#screenMediaMirror');
  mirrorBox.addEventListener('change', () => media.setMirrored(mirrorBox.checked));

  clearBtn.addEventListener('click', () => {
    urlInput.value = '';
    media.clear();
  });

  if (dropTarget) {
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    dropTarget.addEventListener('dragover', stop);
    dropTarget.addEventListener('drop', async (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      stop(e);
      statusEl.textContent = `Loading ${file.name}…`;
      await media.loadFile(file);
    });
  }
}
