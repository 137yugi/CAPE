/* global JSZip, LipsyncEngine, AudioCapture */

const $ = (id) => document.getElementById(id);

const el = {
  appShell: $('appShell'),
  stage: $('stage'),
  video: $('base-video'),
  mouthCanvas: $('mouth-canvas'),
  liveStatus: $('liveStatus'),
  emptyState: $('emptyState'),
  emptyImportBtn: $('emptyImportBtn'),
  demoBtn: $('demoBtn'),
  liveDock: $('liveDock'),
  sceneStrip: $('sceneStrip'),
  micToggleBtn: $('micToggleBtn'),
  micStateText: $('micStateText'),
  packBtn: $('packBtn'),
  menuBtn: $('menuBtn'),
  sceneCountText: $('sceneCountText'),
  settingsSheet: $('settingsSheet'),
  closeSheetBtn: $('closeSheetBtn'),
  sceneNameInput: $('sceneNameInput'),
  renameSceneBtn: $('renameSceneBtn'),
  uiOpacitySlider: $('uiOpacitySlider'),
  uiOpacityValue: $('uiOpacityValue'),
  resetUiOpacityBtn: $('resetUiOpacityBtn'),
  sensitivitySlider: $('sensitivitySlider'),
  sensitivityValue: $('sensitivityValue'),
  audioQualitySelect: $('audioQualitySelect'),
  sheetImportBtn: $('sheetImportBtn'),
  sheetDemoBtn: $('sheetDemoBtn'),
  statusPanel: $('statusPanel'),
  zipInput: $('zipInput')
};

const state = {
  scenes: [],
  activeSceneId: null,
  micRunning: false,
  loading: false,
  outputMode: new URLSearchParams(location.search).get('output') === '1',
  uiOpacity: Number(localStorage.getItem('cape.uiOpacity') || 86),
  sensitivity: Number(localStorage.getItem('cape.sensitivity') || 58),
  audioQuality: localStorage.getItem('cape.audioQuality') || 'hq'
};

const engine = new LipsyncEngine({
  elements: {
    video: el.video,
    mouthCanvas: el.mouthCanvas,
    stage: el.stage
  },
  callbacks: {
    onLog: () => {},
    onFileStatus: (status, message) => setStatus(message, status),
    onVolumeChange: (level) => {
      el.micStateText.textContent = state.micRunning ? `${Math.round(level * 100)}%` : 'OFF';
    },
    onSectionsVisibility: () => {},
    onError: (message) => setStatus(message, 'error')
  },
  options: {
    debug: false,
    hqAudioEnabled: true,
    sensitivity: state.sensitivity
  }
});

const audioCapture = new AudioCapture({
  workletUrl: 'cape-motion/audio-worklet.js',
  onVolumeData: (data) => engine.processAudioData(data),
  onStateChange: (running) => {
    state.micRunning = running;
    el.micToggleBtn.classList.toggle('on', running);
    el.micStateText.textContent = running ? 'ON' : 'OFF';
    if (!running) engine.resetAudioStats();
  },
  onError: (message) => setStatus(message, 'error')
});

function boot() {
  if (state.outputMode) el.appShell.classList.add('output-mode');
  applyUiOpacity(state.uiOpacity);
  applySensitivity(state.sensitivity);
  applyAudioQuality(state.audioQuality);
  bindEvents();
  render();
}

function bindEvents() {
  el.emptyImportBtn.addEventListener('click', openZipPicker);
  el.packBtn.addEventListener('click', openZipPicker);
  el.sheetImportBtn.addEventListener('click', openZipPicker);
  el.zipInput.addEventListener('change', handleZipInput);

  el.demoBtn.addEventListener('click', addDemoScenes);
  el.sheetDemoBtn.addEventListener('click', addDemoScenes);

  el.micToggleBtn.addEventListener('click', toggleMic);
  el.menuBtn.addEventListener('click', openSheet);
  el.closeSheetBtn.addEventListener('click', closeSheet);
  el.renameSceneBtn.addEventListener('click', renameActiveScene);

  el.uiOpacitySlider.addEventListener('input', (event) => {
    applyUiOpacity(Number(event.target.value));
  });
  el.resetUiOpacityBtn.addEventListener('click', () => applyUiOpacity(86));

  el.sensitivitySlider.addEventListener('input', (event) => {
    applySensitivity(Number(event.target.value));
  });
  el.audioQualitySelect.addEventListener('change', (event) => {
    applyAudioQuality(event.target.value);
  });
}

function openZipPicker() {
  el.zipInput.click();
}

async function handleZipInput(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  if (!files.length) return;

  state.loading = true;
  setStatus('Scene ZIPを読み込み中...');
  try {
    for (const file of files) {
      const imported = await importSceneZip(file);
      state.scenes.push(...imported);
    }
    if (!state.activeSceneId && state.scenes[0]) {
      await activateScene(state.scenes[0].id);
    }
    setStatus(`${files.length}個のZIPを追加しました。`);
  } catch (error) {
    setStatus(error.message || 'ZIPの読み込みに失敗しました。', 'error');
  } finally {
    state.loading = false;
    render();
  }
}

async function importSceneZip(file) {
  if (!window.JSZip) {
    throw new Error('ZIPライブラリを読み込めません。ネットワークを確認してください。');
  }

  const zip = await JSZip.loadAsync(file);
  const manifest = await readJson(zip, 'manifest.json');
  const sceneRoots = detectSceneRoots(zip, manifest);
  const scenes = [];

  for (const root of sceneRoots) {
    const scene = await buildSceneFromZip(zip, file.name, root, manifest);
    scenes.push(scene);
  }

  if (!scenes.length) {
    throw new Error('Scene ZIPに有効なMotionPNGTuberデータが見つかりません。');
  }

  return scenes;
}

function detectSceneRoots(zip, manifest) {
  if (manifest?.format === 'cape-project' && Array.isArray(manifest.scenes)) {
    return manifest.scenes.map((scene) => normalizeRoot(scene.path || `scenes/${scene.id || scene.name || ''}`));
  }

  const roots = new Set();
  for (const path of Object.keys(zip.files)) {
    const normalized = path.replace(/\\/g, '/');
    const match = normalized.match(/^scenes\/([^/]+)\//);
    if (match) roots.add(`scenes/${match[1]}/`);
  }
  if (roots.size) return Array.from(roots);
  return [''];
}

async function buildSceneFromZip(zip, zipName, root, projectManifest) {
  const rootManifest = await readJson(zip, `${root}manifest.json`);
  const manifest = rootManifest || (root ? null : projectManifest);
  const files = filesUnderRoot(zip, root);
  const name = manifest?.name || manifest?.title || cleanZipName(zipName, root);
  const normalizedFiles = await normalizeSceneFiles(files, manifest, root);
  validateMotionScene(normalizedFiles, name);

  return {
    id: `scene_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name,
    source: zipName,
    files: normalizedFiles
  };
}

function filesUnderRoot(zip, root) {
  const files = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    if (root && !path.startsWith(root)) continue;
    if (path.includes('__MACOSX/') || path.endsWith('.DS_Store')) continue;
    files.push({ path, entry });
  }
  return files;
}

async function normalizeSceneFiles(files, manifest, root) {
  const out = [];
  const manifestPaths = collectManifestPaths(manifest);

  for (const item of files) {
    const relative = stripRoot(item.path, root);
    if (!relative || relative === 'manifest.json') continue;
    const blob = await item.entry.async('blob');
    const mapped = mapPath(relative, manifestPaths);
    const file = new File([blob], mapped.name, { type: guessMime(mapped.path) });
    defineRelativePath(file, mapped.path);
    out.push(file);
  }

  return out;
}

function collectManifestPaths(manifest) {
  if (!manifest) return null;
  return {
    video: manifest.video || manifest.baseVideo || null,
    track: manifest.track || manifest.mouthTrack || 'mouth_track.json',
    mouth: manifest.mouth || manifest.mouthSet || {}
  };
}

function mapPath(relative, manifestPaths) {
  const normalized = relative.replace(/\\/g, '/');
  const lower = normalized.toLowerCase();

  if (manifestPaths?.video && normalized === manifestPaths.video) {
    return { path: 'scene_mouthless_h264.mp4', name: 'scene_mouthless_h264.mp4' };
  }
  if (manifestPaths?.track && normalized === manifestPaths.track) {
    return { path: 'mouth_track.json', name: 'mouth_track.json' };
  }

  for (const state of ['closed', 'open', 'half', 'e', 'u']) {
    if (manifestPaths?.mouth?.[state] && normalized === manifestPaths.mouth[state]) {
      return { path: `mouth/${state}.png`, name: `${state}.png` };
    }
  }

  if (lower.endsWith('.mp4') && !lower.includes('mouthless')) {
    return { path: 'scene_mouthless_h264.mp4', name: 'scene_mouthless_h264.mp4' };
  }

  return { path: normalized, name: normalized.split('/').pop() || normalized };
}

function validateMotionScene(files, name) {
  const paths = files.map((file) => file.webkitRelativePath.toLowerCase());
  const names = files.map((file) => file.name.toLowerCase());
  const missing = [];

  if (!names.some((value) => value.includes('mouthless') && value.endsWith('.mp4'))) missing.push('mouthless mp4');
  if (!names.includes('mouth_track.json')) missing.push('mouth_track.json');
  if (!paths.some((value) => value.includes('mouth/closed.png'))) missing.push('mouth/closed.png');
  if (!paths.some((value) => value.includes('mouth/open.png'))) missing.push('mouth/open.png');

  if (missing.length) {
    throw new Error(`${name}: ${missing.join(', ')} が足りません。`);
  }
}

async function activateScene(sceneId) {
  const scene = state.scenes.find((item) => item.id === sceneId);
  if (!scene) return;

  state.activeSceneId = scene.id;
  render();
  await engine.loadFiles(scene.files);
  await engine.start();
  setStatus(`${scene.name} を再生中`);
}

async function toggleMic() {
  if (state.micRunning) {
    audioCapture.stop();
    return;
  }
  await audioCapture.start();
}

function renameActiveScene() {
  const scene = activeScene();
  if (!scene) return;
  const nextName = el.sceneNameInput.value.trim();
  if (!nextName) return;
  scene.name = nextName;
  render();
  setStatus('シーン名を保存しました。');
}

async function addDemoScenes() {
  state.loading = true;
  setStatus('Demoを読み込み中...');
  try {
    const demos = await Promise.all([
      loadDemoScene('assets14', 'Demo A', [
        ['demo-data/official_assets/assets14/pinkchan_mouthless_h264.mp4', 'demo_mouthless_h264.mp4'],
        ['demo-data/official_assets/assets14/mouth_track.json', 'mouth_track.json'],
        ['demo-data/official_assets/assets14/mouth/closed.png', 'mouth/closed.png'],
        ['demo-data/official_assets/assets14/mouth/open.png', 'mouth/open.png'],
        ['demo-data/official_assets/assets14/mouth/half.png', 'mouth/half.png'],
        ['demo-data/official_assets/assets14/mouth/e.png', 'mouth/e.png'],
        ['demo-data/official_assets/assets14/mouth/u.png', 'mouth/u.png']
      ]),
      loadDemoScene('assets23', 'Demo B', [
        ['demo-data/official_assets/assets23/loop_mouthless_h264.mp4', 'demo_mouthless_h264.mp4'],
        ['demo-data/official_assets/assets23/mouth_track.json', 'mouth_track.json'],
        ['demo-data/official_assets/assets23/mouth/closed.png', 'mouth/closed.png'],
        ['demo-data/official_assets/assets23/mouth/open.png', 'mouth/open.png'],
        ['demo-data/official_assets/assets23/mouth/half.png', 'mouth/half.png'],
        ['demo-data/official_assets/assets23/mouth/e.png', 'mouth/e.png'],
        ['demo-data/official_assets/assets23/mouth/u.png', 'mouth/u.png']
      ])
    ]);

    state.scenes.push(...demos);
    if (!state.activeSceneId) await activateScene(demos[0].id);
    setStatus('Demoシーンを追加しました。');
  } catch (error) {
    setStatus(error.message || 'Demoの読み込みに失敗しました。', 'error');
  } finally {
    state.loading = false;
    render();
  }
}

async function loadDemoScene(source, name, entries) {
  const files = [];
  for (const [url, path] of entries) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${source}: ${url} を読み込めません。`);
    const blob = await response.blob();
    const file = new File([blob], path.split('/').pop(), { type: guessMime(path) });
    defineRelativePath(file, path);
    files.push(file);
  }
  return {
    id: `demo_${source}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name,
    source,
    files
  };
}

function render() {
  el.emptyState.style.display = state.scenes.length ? 'none' : 'block';
  el.sceneCountText.textContent = `${state.scenes.length} scenes`;

  const scene = activeScene();
  el.liveStatus.textContent = scene ? scene.name : 'No pack';
  el.sceneNameInput.value = scene?.name || '';

  el.sceneStrip.innerHTML = '';
  if (!state.scenes.length) {
    const placeholder = document.createElement('button');
    placeholder.type = 'button';
    placeholder.className = 'scene-button';
    placeholder.innerHTML = '<span class="scene-name">Add ZIP</span><span class="scene-meta">Scene</span>';
    placeholder.addEventListener('click', openZipPicker);
    el.sceneStrip.append(placeholder);
    return;
  }

  state.scenes.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `scene-button${item.id === state.activeSceneId ? ' active' : ''}`;
    button.innerHTML = `
      <span class="scene-name">${escapeHtml(item.name)}</span>
      <span class="scene-meta">${index + 1}</span>
    `;
    button.addEventListener('click', () => activateScene(item.id));
    el.sceneStrip.append(button);
  });
}

function activeScene() {
  return state.scenes.find((item) => item.id === state.activeSceneId) || null;
}

function openSheet() {
  el.settingsSheet.classList.add('open');
  el.appShell.classList.add('sheet-open');
  el.settingsSheet.setAttribute('aria-hidden', 'false');
}

function closeSheet() {
  el.settingsSheet.classList.remove('open');
  el.appShell.classList.remove('sheet-open');
  el.settingsSheet.setAttribute('aria-hidden', 'true');
}

function applyUiOpacity(value) {
  state.uiOpacity = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 86));
  localStorage.setItem('cape.uiOpacity', String(state.uiOpacity));
  el.uiOpacitySlider.value = String(state.uiOpacity);
  el.uiOpacityValue.textContent = `${state.uiOpacity}%`;
  document.documentElement.style.setProperty('--ui-alpha', String(state.uiOpacity / 100));
}

function applySensitivity(value) {
  state.sensitivity = Math.max(0, Math.min(100, value));
  localStorage.setItem('cape.sensitivity', String(state.sensitivity));
  el.sensitivitySlider.value = String(state.sensitivity);
  el.sensitivityValue.textContent = String(state.sensitivity);
  engine.setSensitivity(state.sensitivity);
}

function applyAudioQuality(value) {
  state.audioQuality = value === 'standard' ? 'standard' : 'hq';
  localStorage.setItem('cape.audioQuality', state.audioQuality);
  el.audioQualitySelect.value = state.audioQuality;
  const hqEnabled = state.audioQuality === 'hq';
  engine.setHQAudioEnabled(hqEnabled);
  audioCapture.setHQAudioEnabled(hqEnabled);
}

function setStatus(message, status = '') {
  el.statusPanel.textContent = message;
  el.statusPanel.dataset.status = status;
}

function normalizeRoot(path = '') {
  const normalized = String(path).replace(/\\/g, '/').replace(/^\/+/, '');
  return normalized && !normalized.endsWith('/') ? `${normalized}/` : normalized;
}

function stripRoot(path, root) {
  const normalized = path.replace(/\\/g, '/');
  return root ? normalized.slice(root.length) : normalized;
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

function defineRelativePath(file, path) {
  try {
    Object.defineProperty(file, 'webkitRelativePath', {
      value: path,
      configurable: true
    });
  } catch {
    file.webkitRelativePath = path;
  }
}

function cleanZipName(zipName, root) {
  const base = root ? root.replace(/^scenes\//, '').replace(/\/$/, '') : zipName.replace(/\.zip$/i, '');
  return base || 'Scene';
}

function guessMime(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.mp4')) return 'video/mp4';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
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
