/* global JSZip */

const CAPE_MAGIC = 'CAPEv001';
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const objectUrls = [];

const el = {
  dropzone: document.getElementById('dropzone'),
  zipInput: document.getElementById('zipInput'),
  pickButton: document.getElementById('pickButton'),
  clearButton: document.getElementById('clearButton'),
  resultList: document.getElementById('resultList'),
  emptyState: document.getElementById('emptyState'),
  dropText: document.getElementById('dropText')
};

function boot() {
  el.pickButton.addEventListener('click', () => el.zipInput.click());
  el.zipInput.addEventListener('change', (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    handleFiles(files);
  });

  el.clearButton.addEventListener('click', clearResults);

  ['dragenter', 'dragover'].forEach((type) => {
    el.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      el.dropzone.classList.add('dragging');
    });
  });

  ['dragleave', 'drop'].forEach((type) => {
    el.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      el.dropzone.classList.remove('dragging');
    });
  });

  el.dropzone.addEventListener('drop', (event) => {
    const files = Array.from(event.dataTransfer?.files || []);
    handleFiles(files);
  });
}

async function handleFiles(files) {
  const zipFiles = files.filter((file) => /\.zip$/i.test(file.name));
  const rejected = files.filter((file) => !/\.zip$/i.test(file.name));

  for (const file of rejected) {
    renderError(file.name, '.zipだけ変換できます。');
  }

  if (!zipFiles.length) return;
  el.emptyState.classList.add('hidden');
  el.dropText.textContent = `${zipFiles.length} file${zipFiles.length === 1 ? '' : 's'}`;

  for (const file of zipFiles) {
    const card = renderPending(file.name);
    try {
      const packageResult = await convertZipToCape(file);
      renderSuccess(card, packageResult);
    } catch (error) {
      renderCardError(card, file.name, error.message || '変換に失敗しました。');
    }
  }

  el.dropText.textContent = 'MotionPNGTuber ZIP → .cape';
}

async function convertZipToCape(file) {
  if (!window.JSZip) throw new Error('ZIPライブラリを読み込めません。');

  const zip = await JSZip.loadAsync(file);
  const rootManifest = await readJson(zip, 'manifest.json');
  const roots = detectSceneRoots(zip);
  const errors = [];

  for (const root of roots) {
    try {
      const scene = await buildScene(zip, file, root, rootManifest);
      const cape = await encodeCapePackage(scene, file);
      const verified = parseCapePackage(cape.buffer);
      if (verified.manifest.files.length !== scene.files.length) {
        throw new Error('CAPE検証に失敗しました。');
      }
      return cape;
    } catch (error) {
      errors.push(`${root || '/'}: ${error.message}`);
    }
  }

  throw new Error(errors[0] || '有効なSceneが見つかりません。');
}

function detectSceneRoots(zip) {
  const sceneRoots = new Set();
  const topRoots = new Set();
  for (const path of Object.keys(zip.files)) {
    const normalized = normalizePath(path);
    if (isJunkPath(normalized)) continue;

    const sceneMatch = normalized.match(/^scenes\/([^/]+)\//);
    if (sceneMatch) sceneRoots.add(`scenes/${sceneMatch[1]}/`);

    const firstSlash = normalized.indexOf('/');
    if (firstSlash > 0) topRoots.add(`${normalized.slice(0, firstSlash)}/`);
  }
  return [...sceneRoots, ...topRoots, ''];
}

async function buildScene(zip, sourceFile, root, projectManifest) {
  const rootManifest = await readJson(zip, `${root}manifest.json`);
  const manifest = rootManifest || (root ? null : projectManifest);
  const files = filesUnderRoot(zip, root);
  const resolved = resolveSceneFiles(files, manifest);
  const name = pickSceneName(manifest, sourceFile.name, root);
  const sceneFiles = [];

  sceneFiles.push(await readSceneFile(resolved.video, 'scene_mouthless_h264.mp4', 'video/mp4'));
  sceneFiles.push(await readSceneFile(resolved.track, 'mouth_track.json', 'application/json'));

  for (const state of ['closed', 'open', 'half', 'e', 'u']) {
    if (resolved.mouth[state]) {
      sceneFiles.push(await readSceneFile(resolved.mouth[state], `mouth/${state}.png`, 'image/png'));
    }
  }

  if (!sceneFiles.some((item) => item.path === 'mouth/closed.png')) throw new Error('mouth/closed.png が足りません。');
  if (!sceneFiles.some((item) => item.path === 'mouth/open.png')) throw new Error('mouth/open.png が足りません。');

  return {
    name,
    mouthAdjust: normalizeMouthAdjust(manifest?.mouthAdjust || manifest?.defaultMouthAdjust || {}),
    files: sceneFiles
  };
}

function filesUnderRoot(zip, root) {
  const files = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    const normalized = normalizePath(path);
    if (entry.dir || isJunkPath(normalized)) continue;
    if (root && !normalized.startsWith(root)) continue;
    const relative = root ? normalized.slice(root.length) : normalized;
    if (!relative || isJunkPath(relative)) continue;
    files.push({ path: normalized, relative, entry });
  }
  return files;
}

function resolveSceneFiles(files, manifest) {
  const byRelative = new Map(files.map((file) => [file.relative, file]));
  const lowerFiles = files.map((file) => ({
    ...file,
    lower: file.relative.toLowerCase()
  }));

  const video = pickByManifestPath(byRelative, manifest?.video || manifest?.baseVideo)
    || lowerFiles.find((file) => file.lower.endsWith('.mp4') && file.lower.includes('mouthless'))
    || lowerFiles.find((file) => file.lower === 'loop.mp4')
    || lowerFiles.find((file) => file.lower.endsWith('.mp4'));

  const track = pickByManifestPath(byRelative, manifest?.track || manifest?.mouthTrack)
    || lowerFiles.find((file) => file.lower === 'mouth_track.json')
    || lowerFiles.find((file) => file.lower.endsWith('/mouth_track.json'));

  const mouth = {};
  const manifestMouth = manifest?.mouth || manifest?.mouthSet || {};
  for (const state of ['closed', 'open', 'half', 'e', 'u']) {
    mouth[state] = pickByManifestPath(byRelative, manifestMouth[state])
      || lowerFiles.find((file) => file.lower === `mouth/${state}.png`)
      || lowerFiles.find((file) => file.lower.endsWith(`/mouth/${state}.png`))
      || lowerFiles.find((file) => file.lower.endsWith(`/mouth/1x/${state}.png`));
  }

  const missing = [];
  if (!video) missing.push('mp4');
  if (!track) missing.push('mouth_track.json');
  if (!mouth.closed) missing.push('mouth/closed.png');
  if (!mouth.open) missing.push('mouth/open.png');
  if (missing.length) throw new Error(`${missing.join(', ')} が足りません。`);

  return { video, track, mouth };
}

function pickByManifestPath(byRelative, path) {
  if (!path) return null;
  return byRelative.get(normalizePath(path)) || null;
}

async function readSceneFile(file, path, mime) {
  const buffer = await file.entry.async('arraybuffer');
  return {
    path,
    mime,
    buffer,
    size: buffer.byteLength,
    sha256: await sha256(buffer)
  };
}

async function encodeCapePackage(scene, sourceFile) {
  let payloadOffset = 0;
  const files = scene.files.map((file) => {
    const entry = {
      path: file.path,
      mime: file.mime,
      offset: payloadOffset,
      size: file.size,
      sha256: file.sha256
    };
    payloadOffset += file.size;
    return entry;
  });

  const manifest = {
    format: 'cape-scene-package',
    version: 1,
    name: scene.name,
    createdAt: new Date().toISOString(),
    source: {
      name: sourceFile.name,
      size: sourceFile.size
    },
    scene: {
      video: 'scene_mouthless_h264.mp4',
      track: 'mouth_track.json',
      mouth: {
        closed: 'mouth/closed.png',
        open: 'mouth/open.png',
        half: 'mouth/half.png',
        e: 'mouth/e.png',
        u: 'mouth/u.png'
      },
      mouthAdjust: scene.mouthAdjust
    },
    files
  };

  const manifestBytes = textEncoder.encode(JSON.stringify(manifest));
  const header = new Uint8Array(12);
  header.set(textEncoder.encode(CAPE_MAGIC), 0);
  new DataView(header.buffer).setUint32(8, manifestBytes.byteLength, true);

  const chunks = [header, manifestBytes, ...scene.files.map((file) => new Uint8Array(file.buffer))];
  const blob = new Blob(chunks, { type: 'application/x-cape' });
  const arrayBuffer = await blob.arrayBuffer();
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);

  return {
    name: scene.name,
    fileName: `${safeFileName(scene.name)}.cape`,
    url,
    blob,
    buffer: arrayBuffer,
    sourceSize: sourceFile.size,
    outputSize: blob.size,
    files: scene.files,
    manifest
  };
}

function parseCapePackage(buffer) {
  const bytes = new Uint8Array(buffer);
  const magic = textDecoder.decode(bytes.slice(0, 8));
  if (magic !== CAPE_MAGIC) throw new Error('CAPE magicが一致しません。');

  const manifestLength = new DataView(buffer).getUint32(8, true);
  const manifestStart = 12;
  const manifestEnd = manifestStart + manifestLength;
  if (manifestEnd > bytes.byteLength) throw new Error('CAPE manifestが壊れています。');

  const manifest = JSON.parse(textDecoder.decode(bytes.slice(manifestStart, manifestEnd)));
  return {
    manifest,
    payloadStart: manifestEnd
  };
}

async function readJson(zip, path) {
  const entry = zip.files[path];
  if (!entry || entry.dir) return null;
  try {
    return JSON.parse(await entry.async('text'));
  } catch {
    return null;
  }
}

async function sha256(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function pickSceneName(manifest, zipName, root) {
  return manifest?.name
    || manifest?.title
    || cleanName(root ? root.replace(/\/$/, '').split('/').pop() : zipName.replace(/\.zip$/i, ''))
    || 'Scene';
}

function normalizeMouthAdjust(input) {
  return {
    opacity: clampNumber(input.opacity, 0, 1, 1),
    brightness: clampNumber(input.brightness, 0.6, 1.4, 1),
    saturation: clampNumber(input.saturation, 0.5, 1.6, 1),
    offsetX: clampNumber(input.offsetX, -80, 80, 0),
    offsetY: clampNumber(input.offsetY, -80, 80, 0),
    scale: clampNumber(input.scale, 0.7, 1.4, 1),
    trackOffset: clampNumber(input.trackOffset, -0.5, 0.5, 0)
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizePath(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function isJunkPath(path) {
  return path.includes('__MACOSX/')
    || path.endsWith('/.DS_Store')
    || path === '.DS_Store'
    || path.split('/').some((part) => part.startsWith('._'));
}

function cleanName(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeFileName(value) {
  const cleaned = String(value || 'scene')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-');
  return cleaned || 'scene';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function renderPending(fileName) {
  el.emptyState.classList.add('hidden');
  const card = document.createElement('article');
  card.className = 'result-card';
  card.dataset.status = 'pending';
  card.innerHTML = `
    <div class="result-main">
      <div>
        <div class="result-name">${escapeHtml(fileName)}</div>
        <div class="result-meta">変換中</div>
      </div>
      <span class="status-pill">WORK</span>
    </div>
  `;
  el.resultList.prepend(card);
  return card;
}

function renderSuccess(card, result) {
  card.dataset.status = 'done';
  card.innerHTML = `
    <div class="result-main">
      <div>
        <div class="result-name">${escapeHtml(result.name)}</div>
        <div class="result-meta">${escapeHtml(result.fileName)} · ${formatBytes(result.outputSize)}</div>
      </div>
      <span class="status-pill">OK</span>
    </div>
    <div class="result-detail">${result.files.length} files · source ${formatBytes(result.sourceSize)}</div>
    <a class="download-button" href="${result.url}" download="${escapeHtml(result.fileName)}">Download</a>
  `;
}

function renderError(fileName, message) {
  const card = renderPending(fileName);
  renderCardError(card, fileName, message);
}

function renderCardError(card, fileName, message) {
  card.dataset.status = 'error';
  card.innerHTML = `
    <div class="result-main">
      <div>
        <div class="result-name">${escapeHtml(fileName)}</div>
        <div class="result-meta">${escapeHtml(message)}</div>
      </div>
      <span class="status-pill">NG</span>
    </div>
  `;
}

function clearResults() {
  for (const url of objectUrls.splice(0)) URL.revokeObjectURL(url);
  el.resultList.innerHTML = '';
  el.emptyState.classList.remove('hidden');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

boot();
