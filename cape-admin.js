const CONFIG_URL = 'cape-site-config.json?v=20260523-demo-refresh';

const el = {
  productMeta: document.getElementById('productMeta'),
  stableLaunch: document.getElementById('stableLaunch'),
  productName: document.getElementById('productName'),
  productVersion: document.getElementById('productVersion'),
  versionList: document.getElementById('versionList'),
  releaseGrid: document.getElementById('releaseGrid'),
  promotionRule: document.getElementById('promotionRule'),
  linkGrid: document.getElementById('linkGrid'),
  bannerGrid: document.getElementById('bannerGrid'),
  bannerSpec: document.getElementById('bannerSpec'),
  creditList: document.getElementById('creditList')
};

async function boot() {
  const config = await loadConfig();
  render(config);
}

async function loadConfig() {
  const response = await fetch(CONFIG_URL, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`config ${response.status}`);
  return response.json();
}

function render(config) {
  const product = config.product || {};
  const stable = config.channels?.stable || {};
  const beta = config.channels?.beta || {};
  const versionLabel = product.versionLabel || `v${product.version || '0.0.0'}`;

  document.title = `${product.name || 'CAPE'} Admin`;
  el.productName.textContent = product.name || 'CAPE ANIME';
  el.productVersion.textContent = versionLabel;
  el.productMeta.textContent = `${versionLabel} · updated ${product.updatedAt || '-'}`;
  el.stableLaunch.href = stable.url || './';

  el.versionList.innerHTML = [
    infoItem('Stable', stable.version || product.version || '-'),
    infoItem('Beta', beta.version || '-'),
    infoItem('Previous Name', product.previousName || '-')
  ].join('');

  el.releaseGrid.innerHTML = [
    releaseCard(stable, 'Latest'),
    releaseCard(beta, 'Beta')
  ].join('');
  el.promotionRule.textContent = config.management?.promotionRule || '';

  const tools = config.tools || {};
  el.linkGrid.innerHTML = [
    linkCard('CAPE ANIME', stable.url),
    linkCard(tools.packager?.label || 'CAPE Packager', tools.packager?.url),
    linkCard(tools.maker?.label || 'CAPE Maker', tools.maker?.url, tools.maker?.status),
    linkCard(tools.repository?.label || 'Repository', tools.repository?.url),
    linkCard(tools.actions?.label || 'Actions', tools.actions?.url)
  ].join('');

  el.bannerSpec.textContent = (config.management?.bannerSpec || '1200 x 375 px').split('.')[0];
  el.bannerGrid.innerHTML = (config.banners || []).map(bannerCard).join('');
  el.creditList.innerHTML = (config.credits || []).map(creditItem).join('');
}

function infoItem(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function releaseCard(channel, fallbackLabel) {
  const label = channel.label || fallbackLabel;
  const version = channel.version || '-';
  const status = channel.status || '-';
  const href = channel.url || '#';
  return `
    <section class="release-card">
      <h2>${escapeHtml(label)}</h2>
      <p>${escapeHtml(version)} · ${escapeHtml(status)}</p>
      <a href="${escapeAttr(href)}" target="_blank" rel="noopener">Open</a>
    </section>
  `;
}

function linkCard(label, href, status = '') {
  const ready = Boolean(href);
  return `
    <a class="link-card" data-status="${escapeAttr(status || (ready ? 'ready' : 'preparing'))}" href="${escapeAttr(ready ? href : '#')}" target="_blank" rel="noopener">
      ${escapeHtml(label)}${ready ? '' : ' · preparing'}
    </a>
  `;
}

function bannerCard(banner) {
  const href = banner.href || '';
  const image = banner.image || '';
  const previewStyle = image ? ` style="background-image:url('${escapeAttr(image)}')"` : '';
  return `
    <section class="banner-card">
      <div class="banner-preview"${previewStyle}>
        <strong>${escapeHtml(banner.label || 'Banner')}</strong>
        <span>${escapeHtml(banner.recommendedSize || '1200x375')}</span>
      </div>
      <h2>${escapeHtml(banner.id || 'banner')}</h2>
      <p>${href ? escapeHtml(href) : 'リンク未設定'}</p>
    </section>
  `;
}

function creditItem(credit) {
  const body = `
    <strong>${escapeHtml(credit.name || '')}</strong>
    <p>${escapeHtml(credit.role || '')}</p>
  `;
  if (!credit.url) return `<div class="credit-item">${body}</div>`;
  return `<a class="credit-item" href="${escapeAttr(credit.url)}" target="_blank" rel="noopener">${body}</a>`;
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

boot().catch((error) => {
  el.productMeta.textContent = error.message || 'Config load failed';
});
