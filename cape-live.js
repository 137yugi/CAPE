/* global LipsyncEngine, AudioCapture */

const $ = (id) => document.getElementById(id);
const CAPE_MAGIC = 'CAPEv001';
const WORKSPACE_MAGIC = 'CAPEW001';
const UI_OPACITY_STORAGE_KEY = 'cape.uiOpacity.v2';
const DEFAULT_UI_OPACITY = 100;
const DEFAULT_WORKSPACE_NAME = 'CAPE Workspace';
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

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
  sceneManagerList: $('sceneManagerList'),
  uiOpacitySlider: $('uiOpacitySlider'),
  uiOpacityValue: $('uiOpacityValue'),
  resetUiOpacityBtn: $('resetUiOpacityBtn'),
  stageFitSelect: $('stageFitSelect'),
  backgroundSelect: $('backgroundSelect'),
  sensitivitySlider: $('sensitivitySlider'),
  sensitivityValue: $('sensitivityValue'),
  audioQualitySelect: $('audioQualitySelect'),
  mouthOpacitySlider: $('mouthOpacitySlider'),
  mouthOpacityValue: $('mouthOpacityValue'),
  mouthBrightnessSlider: $('mouthBrightnessSlider'),
  mouthBrightnessValue: $('mouthBrightnessValue'),
  mouthSaturationSlider: $('mouthSaturationSlider'),
  mouthSaturationValue: $('mouthSaturationValue'),
  mouthOffsetXSlider: $('mouthOffsetXSlider'),
  mouthOffsetXValue: $('mouthOffsetXValue'),
  mouthOffsetYSlider: $('mouthOffsetYSlider'),
  mouthOffsetYValue: $('mouthOffsetYValue'),
  mouthScaleSlider: $('mouthScaleSlider'),
  mouthScaleValue: $('mouthScaleValue'),
  trackOffsetSlider: $('trackOffsetSlider'),
  trackOffsetValue: $('trackOffsetValue'),
  resetMouthBtn: $('resetMouthBtn'),
  workspaceNameInput: $('workspaceNameInput'),
  sheetImportBtn: $('sheetImportBtn'),
  downloadWorkspaceBtn: $('downloadWorkspaceBtn'),
  sheetDemoBtn: $('sheetDemoBtn'),
  productNameText: $('productNameText'),
  appVersionText: $('appVersionText'),
  sheetProductName: $('sheetProductName'),
  sheetVersionText: $('sheetVersionText'),
  menuBannerList: $('menuBannerList'),
  creditsList: $('creditsList'),
  statusPanel: $('statusPanel'),
  zipInput: $('zipInput')
};

const SITE_CONFIG_URL = 'cape-site-config.json?v=20260523-workspace-name';

const state = {
  scenes: [],
  activeSceneId: null,
  micRunning: false,
  loading: false,
  uiOpacity: storedNumber(UI_OPACITY_STORAGE_KEY, DEFAULT_UI_OPACITY),
  sensitivity: Number(localStorage.getItem('cape.sensitivity') || 58),
  audioQuality: localStorage.getItem('cape.audioQuality') || 'hq',
  stageFit: localStorage.getItem('cape.stageFit') || 'contain',
  background: localStorage.getItem('cape.background') || 'dark',
  workspaceName: DEFAULT_WORKSPACE_NAME,
  mouth: defaultMouthAdjust()
};

const DEMO_SCENE_PACKAGES = [
  { url: 'demo-data/cape-scenes/cool.cape', fileName: 'cool.cape' },
  { url: 'demo-data/cape-scenes/tryv.cape', fileName: 'tryv.cape' },
  { url: 'demo-data/cape-scenes/pink.cape', fileName: 'pink.cape' }
];

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
  loadSiteConfig();
  applyUiOpacity(state.uiOpacity);
  applySensitivity(state.sensitivity);
  applyAudioQuality(state.audioQuality);
  applyStageFit(state.stageFit);
  applyBackground(state.background);
  applyMouthAdjust(state.mouth, { persistToScene: false });
  bindEvents();
  render();
}

async function loadSiteConfig() {
  try {
    const response = await fetch(SITE_CONFIG_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`config ${response.status}`);
    applySiteConfig(await response.json());
  } catch {
    renderMenuBanners([]);
    renderCredits([]);
  }
}

function applySiteConfig(config) {
  const product = config?.product || {};
  const stable = config?.channels?.stable || {};
  const name = product.name || 'CAPE ANIME';
  const version = product.versionLabel || (product.version ? `v${product.version}` : 'v0.4.0');

  document.title = name;
  el.productNameText.textContent = name;
  el.sheetProductName.textContent = name;
  el.appVersionText.textContent = version;
  el.sheetVersionText.textContent = version;
  renderMenuBanners(config?.banners || []);
  renderCredits(config?.credits || []);
}

function renderMenuBanners(banners) {
  el.menuBannerList.innerHTML = '';
  banners.slice(0, 2).forEach((banner) => {
    const href = String(banner.href || '').trim();
    const tag = href ? 'a' : 'div';
    const item = document.createElement(tag);
    item.className = `menu-banner${href ? '' : ' disabled'}`;
    if (href) {
      item.href = href;
      item.target = '_blank';
      item.rel = 'noopener';
    }
    if (banner.image) {
      const image = document.createElement('img');
      image.src = banner.image;
      image.alt = '';
      item.append(image);
    }

    const label = document.createElement('span');
    label.textContent = banner.label || 'Banner';
    const meta = document.createElement('small');
    meta.textContent = href ? 'Open' : `Design slot ${banner.recommendedSize || '1200x375'}`;
    item.append(label, meta);
    el.menuBannerList.append(item);
  });
}

function renderCredits(credits) {
  el.creditsList.innerHTML = '';
  credits.forEach((credit) => {
    const href = String(credit.url || '').trim();
    const item = document.createElement(href ? 'a' : 'span');
    if (href) {
      item.href = href;
      item.target = '_blank';
      item.rel = 'noopener';
    }
    item.innerHTML = `<strong>${escapeHtml(credit.name || '')}</strong> ${escapeHtml(credit.role || '')}`;
    el.creditsList.append(item);
  });
}

function bindEvents() {
  el.emptyImportBtn.addEventListener('click', openZipPicker);
  el.packBtn.addEventListener('click', openSheet);
  el.sheetImportBtn.addEventListener('click', openZipPicker);
  el.zipInput.addEventListener('change', handleZipInput);

  el.demoBtn.addEventListener('click', addDemoScenes);
  el.sheetDemoBtn.addEventListener('click', addDemoScenes);

  el.micToggleBtn.addEventListener('click', toggleMic);
  el.menuBtn.addEventListener('click', openSheet);
  el.closeSheetBtn.addEventListener('click', closeSheet);
  el.renameSceneBtn.addEventListener('click', renameActiveScene);
  el.sceneManagerList.addEventListener('click', handleSceneManagerClick);
  el.sceneManagerList.addEventListener('change', handleSceneManagerChange);
  el.workspaceNameInput.addEventListener('input', (event) => {
    state.workspaceName = normalizeWorkspaceName(event.target.value);
  });
  el.downloadWorkspaceBtn.addEventListener('click', downloadWorkspace);

  el.uiOpacitySlider.addEventListener('input', (event) => {
    applyUiOpacity(Number(event.target.value));
  });
  el.resetUiOpacityBtn.addEventListener('click', () => applyUiOpacity(DEFAULT_UI_OPACITY));
  el.stageFitSelect.addEventListener('change', (event) => {
    applyStageFit(event.target.value);
  });
  el.backgroundSelect.addEventListener('change', (event) => {
    applyBackground(event.target.value);
  });

  el.sensitivitySlider.addEventListener('input', (event) => {
    applySensitivity(Number(event.target.value));
  });
  el.audioQualitySelect.addEventListener('change', (event) => {
    applyAudioQuality(event.target.value);
  });

  [
    el.mouthOpacitySlider,
    el.mouthBrightnessSlider,
    el.mouthSaturationSlider,
    el.mouthOffsetXSlider,
    el.mouthOffsetYSlider,
    el.mouthScaleSlider,
    el.trackOffsetSlider
  ].forEach((input) => {
    input.addEventListener('input', () => {
      applyMouthAdjust(readMouthInputs());
    });
  });
  el.resetMouthBtn.addEventListener('click', () => applyMouthAdjust(defaultMouthAdjust()));
}

function openZipPicker() {
  el.zipInput.click();
}

async function handleZipInput(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  if (!files.length) return;

  state.loading = true;
  setStatus('CAPE / Workspaceを読み込み中...');
  try {
    const imports = [];
    for (const file of files) {
      imports.push(await importInputFile(file));
    }

    let loadedWorkspace = false;
    let addedScenes = 0;
    let nextScenes = state.scenes;
    let nextActiveSceneId = state.activeSceneId;
    let nextWorkspaceSettings = null;
    for (const imported of imports) {
      if (imported.workspace) {
        nextScenes = imported.scenes;
        nextActiveSceneId = imported.activeSceneId || null;
        state.workspaceName = imported.name;
        nextWorkspaceSettings = imported.settings;
        loadedWorkspace = true;
      } else {
        if (nextScenes === state.scenes) nextScenes = [...state.scenes];
        nextScenes.push(...imported.scenes);
        addedScenes += imported.scenes.length;
      }
    }

    state.scenes = nextScenes;
    state.activeSceneId = nextActiveSceneId;
    if (nextWorkspaceSettings) applyWorkspaceSettings(nextWorkspaceSettings);
    if (state.scenes[0]) await activateScene(state.activeSceneId || state.scenes[0].id);
    setStatus(loadedWorkspace ? 'Workspaceを読み込みました。' : `${addedScenes}個のSceneを追加しました。`);
  } catch (error) {
    setStatus(error.message || 'CAPEファイルの読み込みに失敗しました。', 'error');
  } finally {
    state.loading = false;
    render();
  }
}

async function importInputFile(file) {
  if (/\.zip$/i.test(file.name)) {
    throw new Error('ZIPは読み込めません。');
  }

  const buffer = await file.arrayBuffer();
  const magic = buffer.byteLength >= 8 ? textDecoder.decode(new Uint8Array(buffer).slice(0, 8)) : '';
  if (magic === WORKSPACE_MAGIC || /\.capeworkspace$/i.test(file.name)) {
    return importWorkspaceBuffer(buffer, file.name);
  }
  return {
    workspace: false,
    scenes: importCapeBuffer(buffer, file.name)
  };
}

function importCapeBuffer(buffer, sourceName) {
  const packageData = parseCapePackage(buffer);
  const scene = buildSceneFromCapePackage(packageData, sourceName);
  validateMotionScene(scene.files, scene.name);
  return [scene];
}

function parseCapePackage(buffer) {
  if (buffer.byteLength < 12) {
    throw new Error('CAPEファイルが壊れています。');
  }

  const bytes = new Uint8Array(buffer);
  const magic = textDecoder.decode(bytes.slice(0, 8));
  if (magic !== CAPE_MAGIC) {
    throw new Error('CAPE v1ファイルではありません。');
  }

  const manifestLength = new DataView(buffer).getUint32(8, true);
  const manifestStart = 12;
  const manifestEnd = manifestStart + manifestLength;
  if (manifestEnd > buffer.byteLength) {
    throw new Error('CAPE manifestが壊れています。');
  }

  let manifest = null;
  try {
    manifest = JSON.parse(textDecoder.decode(bytes.slice(manifestStart, manifestEnd)));
  } catch {
    throw new Error('CAPE manifestを読めません。');
  }

  if (manifest?.format !== 'cape-scene-package' || manifest.version !== 1 || !Array.isArray(manifest.files)) {
    throw new Error('対応していないCAPE形式です。');
  }

  return {
    buffer,
    manifest,
    payloadStart: manifestEnd
  };
}

function buildSceneFromCapePackage(packageData, sourceName) {
  const { buffer, manifest, payloadStart } = packageData;
  const sceneMeta = manifest.scene || {};
  const files = manifest.files.map((entry) => {
    const path = normalizePackagePath(entry.path);
    const offset = Number(entry.offset);
    const size = Number(entry.size);
    if (!path || !Number.isInteger(offset) || !Number.isInteger(size) || offset < 0 || size < 0) {
      throw new Error('CAPE file tableが壊れています。');
    }

    const start = payloadStart + offset;
    const end = start + size;
    if (start < payloadStart || end > buffer.byteLength) {
      throw new Error(`${path}: CAPE payloadが壊れています。`);
    }

    const file = new File([buffer.slice(start, end)], path.split('/').pop() || path, {
      type: entry.mime || guessMime(path)
    });
    defineRelativePath(file, path);
    return file;
  });

  return {
    id: `scene_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: manifest.name || cleanPackageName(sourceName) || 'Scene',
    source: sourceName,
    packageBuffer: buffer.slice(0),
    files,
    mouthAdjust: initialMouthAdjust({
      mouthAdjust: sceneMeta.mouthAdjust || manifest.mouthAdjust
    })
  };
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

function importWorkspaceBuffer(buffer, sourceName) {
  const workspace = parseWorkspacePackage(buffer);
  const scenes = workspace.manifest.scenes.map((entry, index) => {
    const offset = Number(entry.offset);
    const size = Number(entry.size);
    if (!Number.isInteger(offset) || !Number.isInteger(size) || offset < 0 || size < 0) {
      throw new Error('WorkspaceのScene tableが壊れています。');
    }

    const start = workspace.payloadStart + offset;
    const end = start + size;
    if (start < workspace.payloadStart || end > buffer.byteLength) {
      throw new Error('WorkspaceのScene payloadが壊れています。');
    }

    const sceneSource = entry.source || `${cleanPackageName(sourceName) || 'scene'}-${index + 1}.cape`;
    const [scene] = importCapeBuffer(buffer.slice(start, end), sceneSource);
    scene.name = String(entry.name || scene.name || `Scene ${index + 1}`).trim();
    scene.mouthAdjust = entry.mouthAdjust
      ? initialMouthAdjust({ mouthAdjust: entry.mouthAdjust })
      : scene.mouthAdjust;
    return scene;
  });

  const activeIndex = Math.round(clampNumber(workspace.manifest.activeIndex, 0, scenes.length - 1, 0));
  return {
    workspace: true,
    name: normalizeWorkspaceName(workspace.manifest.name || cleanPackageName(sourceName)),
    scenes,
    activeSceneId: scenes[activeIndex]?.id || null,
    settings: workspace.manifest.settings || {}
  };
}

function parseWorkspacePackage(buffer) {
  if (buffer.byteLength < 12) {
    throw new Error('Workspaceファイルが壊れています。');
  }

  const bytes = new Uint8Array(buffer);
  const magic = textDecoder.decode(bytes.slice(0, 8));
  if (magic !== WORKSPACE_MAGIC) {
    throw new Error('CAPE Workspace v1ファイルではありません。');
  }

  const manifestLength = new DataView(buffer).getUint32(8, true);
  const manifestStart = 12;
  const manifestEnd = manifestStart + manifestLength;
  if (manifestEnd > buffer.byteLength) {
    throw new Error('Workspace manifestが壊れています。');
  }

  let manifest = null;
  try {
    manifest = JSON.parse(textDecoder.decode(bytes.slice(manifestStart, manifestEnd)));
  } catch {
    throw new Error('Workspace manifestを読めません。');
  }

  if (manifest?.format !== 'cape-workspace' || manifest.version !== 1 || !Array.isArray(manifest.scenes)) {
    throw new Error('対応していないWorkspace形式です。');
  }

  return {
    manifest,
    payloadStart: manifestEnd
  };
}

async function activateScene(sceneId) {
  const scene = state.scenes.find((item) => item.id === sceneId);
  if (!scene) return;

  state.activeSceneId = scene.id;
  applyMouthAdjust(scene.mouthAdjust || defaultMouthAdjust(), { persistToScene: false });
  render();
  await engine.loadFiles(scene.files);
  await engine.start();
  applyMouthAdjust(scene.mouthAdjust || defaultMouthAdjust(), { persistToScene: false });
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

function handleSceneManagerClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const sceneId = button.dataset.sceneId;
  const action = button.dataset.action;
  const index = state.scenes.findIndex((item) => item.id === sceneId);
  if (index < 0) return;

  if (action === 'select') {
    activateScene(sceneId);
    return;
  }

  if (action === 'up' || action === 'down') {
    const nextIndex = action === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= state.scenes.length) return;
    const [scene] = state.scenes.splice(index, 1);
    state.scenes.splice(nextIndex, 0, scene);
    render();
    setStatus('Sceneの順番を変更しました。');
    return;
  }

  if (action === 'remove') {
    removeScene(sceneId);
  }
}

function handleSceneManagerChange(event) {
  const input = event.target.closest('input[data-scene-id]');
  if (!input) return;
  const scene = state.scenes.find((item) => item.id === input.dataset.sceneId);
  if (!scene) return;
  const nextName = input.value.trim();
  if (!nextName) {
    input.value = scene.name;
    return;
  }
  scene.name = nextName;
  if (scene.id === state.activeSceneId) {
    el.sceneNameInput.value = nextName;
    el.liveStatus.textContent = nextName;
  }
  render();
  setStatus('シーン名を保存しました。');
}

async function removeScene(sceneId) {
  const index = state.scenes.findIndex((item) => item.id === sceneId);
  if (index < 0) return;
  const wasActive = state.activeSceneId === sceneId;
  state.scenes.splice(index, 1);
  if (!state.scenes.length) {
    state.activeSceneId = null;
    engine.stop();
    setStatus('Sceneを削除しました。');
    render();
    return;
  }

  if (wasActive) {
    const nextScene = state.scenes[Math.min(index, state.scenes.length - 1)];
    await activateScene(nextScene.id);
  } else {
    render();
  }
  setStatus('Sceneを削除しました。');
}

function renderSceneManager() {
  el.sceneManagerList.innerHTML = '';
  if (!state.scenes.length) {
    const empty = document.createElement('div');
    empty.className = 'scene-manager-empty';
    empty.textContent = 'Scene未追加';
    el.sceneManagerList.append(empty);
    return;
  }

  state.scenes.forEach((scene, index) => {
    const item = document.createElement('div');
    item.className = `manager-scene-item${scene.id === state.activeSceneId ? ' active' : ''}`;
    item.innerHTML = `
      <button type="button" data-action="select" data-scene-id="${escapeAttr(scene.id)}">${index + 1}</button>
      <input class="manager-scene-name" data-scene-id="${escapeAttr(scene.id)}" value="${escapeAttr(scene.name)}" />
      <button type="button" data-action="up" data-scene-id="${escapeAttr(scene.id)}" ${index === 0 ? 'disabled' : ''}>↑</button>
      <button type="button" data-action="down" data-scene-id="${escapeAttr(scene.id)}" ${index === state.scenes.length - 1 ? 'disabled' : ''}>↓</button>
      <button type="button" class="danger" data-action="remove" data-scene-id="${escapeAttr(scene.id)}">×</button>
    `;
    el.sceneManagerList.append(item);
  });
}

async function addDemoScenes() {
  state.loading = true;
  setStatus('Demoを読み込み中...');
  try {
    const demos = [];
    for (const demo of DEMO_SCENE_PACKAGES) {
      demos.push(...await loadDemoPackage(demo.url, demo.fileName));
    }

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

async function loadDemoPackage(url, fileName) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${fileName}: Demo CAPEファイルを読み込めません。`);
  const blob = await response.blob();
  return importCapeBuffer(await blob.arrayBuffer(), fileName);
}

function render() {
  el.emptyState.style.display = state.scenes.length ? 'none' : 'block';
  el.sceneCountText.textContent = `${state.scenes.length} scenes`;
  el.workspaceNameInput.value = state.workspaceName;

  const scene = activeScene();
  el.liveStatus.textContent = scene ? scene.name : 'No pack';
  el.sceneNameInput.value = scene?.name || '';
  el.sceneNameInput.disabled = !scene;
  el.renameSceneBtn.disabled = !scene;
  el.downloadWorkspaceBtn.disabled = !state.scenes.length;

  el.sceneStrip.innerHTML = '';
  if (!state.scenes.length) {
    const placeholder = document.createElement('button');
    placeholder.type = 'button';
    placeholder.className = 'scene-button add-scene-button';
    placeholder.innerHTML = '<span class="scene-name">Add CAPE</span><span class="scene-meta">Scene</span>';
    placeholder.addEventListener('click', openZipPicker);
    el.sceneStrip.append(placeholder);
    renderSceneManager();
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
  renderSceneManager();
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
  state.uiOpacity = clampNumber(value, 0, 100, DEFAULT_UI_OPACITY);
  localStorage.setItem(UI_OPACITY_STORAGE_KEY, String(state.uiOpacity));
  el.uiOpacitySlider.value = String(state.uiOpacity);
  el.uiOpacityValue.textContent = `${state.uiOpacity}%`;
  document.documentElement.style.setProperty('--ui-alpha', String(state.uiOpacity / 100));
}

function applySensitivity(value) {
  state.sensitivity = clampNumber(value, 0, 100, 58);
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

function applyStageFit(value) {
  state.stageFit = value === 'cover' ? 'cover' : 'contain';
  localStorage.setItem('cape.stageFit', state.stageFit);
  el.stageFitSelect.value = state.stageFit;
  el.appShell.classList.toggle('fit-cover', state.stageFit === 'cover');
}

function applyBackground(value) {
  state.background = ['green', 'white', 'checker'].includes(value) ? value : 'dark';
  localStorage.setItem('cape.background', state.background);
  el.backgroundSelect.value = state.background;
  el.appShell.classList.toggle('bg-green', state.background === 'green');
  el.appShell.classList.toggle('bg-white', state.background === 'white');
  el.appShell.classList.toggle('bg-checker', state.background === 'checker');
}

function applyWorkspaceSettings(settings = {}) {
  if (settings.uiOpacity !== undefined) applyUiOpacity(Number(settings.uiOpacity));
  if (settings.sensitivity !== undefined) applySensitivity(Number(settings.sensitivity));
  if (settings.audioQuality !== undefined) applyAudioQuality(settings.audioQuality);
  if (settings.stageFit !== undefined) applyStageFit(settings.stageFit);
  if (settings.background !== undefined) applyBackground(settings.background);
}

function workspaceSettings() {
  return {
    uiOpacity: state.uiOpacity,
    sensitivity: state.sensitivity,
    audioQuality: state.audioQuality,
    stageFit: state.stageFit,
    background: state.background
  };
}

function applyMouthAdjust(next, options = {}) {
  state.mouth = normalizeMouthAdjust(next);
  if (options.persistToScene !== false) {
    const scene = activeScene();
    if (scene) scene.mouthAdjust = { ...state.mouth };
  }
  syncMouthInputs(state.mouth);
  engine.setMouthRenderAdjust(state.mouth);
  engine.setTrackTimeOffset(state.mouth.trackOffset);
}

function setStatus(message, status = '') {
  el.statusPanel.textContent = message;
  el.statusPanel.dataset.status = status;
}

function downloadWorkspace() {
  if (!state.scenes.length) {
    setStatus('保存するSceneがありません。', 'error');
    return;
  }

  try {
    const buffer = buildWorkspaceBuffer();
    const blob = new Blob([buffer], { type: 'application/x-cape-workspace' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeFileName(state.workspaceName)}.capeworkspace`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('Workspaceを保存しました。');
  } catch (error) {
    setStatus(error.message || 'Workspaceを保存できません。', 'error');
  }
}

function buildWorkspaceBuffer() {
  const manifest = {
    format: 'cape-workspace',
    version: 1,
    name: state.workspaceName,
    product: 'CAPE ANIME',
    createdAt: new Date().toISOString(),
    activeIndex: Math.max(0, state.scenes.findIndex((scene) => scene.id === state.activeSceneId)),
    settings: workspaceSettings(),
    scenes: []
  };

  let offset = 0;
  const packages = state.scenes.map((scene, index) => {
    if (!scene.packageBuffer) {
      throw new Error(`${scene.name || `Scene ${index + 1}`}: 元CAPEデータが見つかりません。`);
    }

    const bytes = new Uint8Array(scene.packageBuffer);
    manifest.scenes.push({
      name: scene.name || `Scene ${index + 1}`,
      source: scene.source || `${safeFileName(scene.name || `scene-${index + 1}`)}.cape`,
      mouthAdjust: normalizeMouthAdjust(scene.mouthAdjust || defaultMouthAdjust()),
      offset,
      size: bytes.byteLength
    });
    offset += bytes.byteLength;
    return bytes;
  });

  const manifestBytes = textEncoder.encode(JSON.stringify(manifest));
  const output = new Uint8Array(12 + manifestBytes.byteLength + offset);
  output.set(textEncoder.encode(WORKSPACE_MAGIC), 0);
  new DataView(output.buffer).setUint32(8, manifestBytes.byteLength, true);
  output.set(manifestBytes, 12);

  let cursor = 12 + manifestBytes.byteLength;
  packages.forEach((bytes) => {
    output.set(bytes, cursor);
    cursor += bytes.byteLength;
  });
  return output.buffer;
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

function normalizePackagePath(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function cleanPackageName(fileName) {
  return decodeURIComponent(String(fileName || '').replace(/\.cape$/i, ''))
    .replace(/\.capeworkspace$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWorkspaceName(value) {
  return String(value || '').trim() || DEFAULT_WORKSPACE_NAME;
}

function safeFileName(value) {
  return String(value || 'cape-workspace')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'cape-workspace';
}

function defaultMouthAdjust() {
  return {
    opacity: 1,
    brightness: 1,
    saturation: 1,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    trackOffset: 0
  };
}

function initialMouthAdjust(manifest) {
  const manifestAdjust = manifest?.mouthAdjust || manifest?.defaultMouthAdjust || null;
  if (!manifestAdjust) return defaultMouthAdjust();
  return normalizeMouthAdjust({ ...defaultMouthAdjust(), ...manifestAdjust });
}

function normalizeMouthAdjust(next = {}) {
  return {
    opacity: clampNumber(next.opacity, 0, 1, 1),
    brightness: clampNumber(next.brightness, 0.6, 1.4, 1),
    saturation: clampNumber(next.saturation, 0.5, 1.6, 1),
    offsetX: clampNumber(next.offsetX, -80, 80, 0),
    offsetY: clampNumber(next.offsetY, -80, 80, 0),
    scale: clampNumber(next.scale, 0.7, 1.4, 1),
    trackOffset: clampNumber(next.trackOffset, -0.5, 0.5, 0)
  };
}

function readMouthInputs() {
  return {
    opacity: Number(el.mouthOpacitySlider.value) / 100,
    brightness: Number(el.mouthBrightnessSlider.value) / 100,
    saturation: Number(el.mouthSaturationSlider.value) / 100,
    offsetX: Number(el.mouthOffsetXSlider.value),
    offsetY: Number(el.mouthOffsetYSlider.value),
    scale: Number(el.mouthScaleSlider.value) / 100,
    trackOffset: Number(el.trackOffsetSlider.value) / 100
  };
}

function syncMouthInputs(adjust) {
  const opacity = Math.round(adjust.opacity * 100);
  const brightness = Math.round(adjust.brightness * 100);
  const saturation = Math.round(adjust.saturation * 100);
  const offsetX = Math.round(adjust.offsetX);
  const offsetY = Math.round(adjust.offsetY);
  const scale = Math.round(adjust.scale * 100);
  const trackOffset = Math.round(adjust.trackOffset * 100);

  el.mouthOpacitySlider.value = String(opacity);
  el.mouthOpacityValue.textContent = `${opacity}%`;
  el.mouthBrightnessSlider.value = String(brightness);
  el.mouthBrightnessValue.textContent = `${brightness}%`;
  el.mouthSaturationSlider.value = String(saturation);
  el.mouthSaturationValue.textContent = `${saturation}%`;
  el.mouthOffsetXSlider.value = String(offsetX);
  el.mouthOffsetXValue.textContent = `${offsetX}px`;
  el.mouthOffsetYSlider.value = String(offsetY);
  el.mouthOffsetYValue.textContent = `${offsetY}px`;
  el.mouthScaleSlider.value = String(scale);
  el.mouthScaleValue.textContent = `${scale}%`;
  el.trackOffsetSlider.value = String(trackOffset);
  el.trackOffsetValue.textContent = formatTrackOffset(adjust.trackOffset);
}

function formatTrackOffset(seconds) {
  const value = clampNumber(seconds, -0.5, 0.5, 0);
  if (Math.abs(value) < 0.005) return '0.00s';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}s`;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function storedNumber(key, fallback) {
  const value = localStorage.getItem(key);
  return value === null ? fallback : clampNumber(value, 0, 100, fallback);
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

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

boot();
