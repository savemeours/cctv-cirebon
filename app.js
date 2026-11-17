const source = 'https://socakaton.cirebonkab.go.id/';
const viewerHosts = new Set(['socakaton.cirebonkab.go.id', 'cctv-backend.cirebonkab.go.id']);
const citySource = 'https://cctv.cirebonkota.go.id/';
const areaConfig = {
  city: { label: 'Kota Cirebon', portal: citySource, center: [-6.727, 108.552], zoom: 13 },
  regency: { label: 'Kabupaten Cirebon', portal: source, center: [-6.717, 108.5], zoom: 11 }
};
let activeArea = 'city';
let hls;
let heartbeatTimer;
let connectionTimer;
let activeVideo;
const catalogs = new Map();
const sourceLabels = new Map();
const center = [-6.717, 108.5];
const mapView = document.querySelector('#map');
const mapPlaceholder = document.querySelector('#map-placeholder');
const resetMap = document.querySelector('#reset-map');
const search = document.querySelector('#camera-search');
const status = document.querySelector('#camera-status');
const cameraSource = document.querySelector('#camera-source');
const list = document.querySelector('#camera-list');
const refresh = document.querySelector('#refresh');
const dialog = document.querySelector('#camera-dialog');
const player = document.querySelector('#camera-player');
const streamLink = document.querySelector('#camera-link');

let map;
let markers;
let cameras = [];
let currentSource = '';

if (window.L) {
  mapPlaceholder.remove();
  map = L.map(mapView, { scrollWheelZoom: false }).setView(areaConfig[activeArea].center, areaConfig[activeArea].zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  markers = L.layerGroup().addTo(map);
  resetMap.disabled = false;
  resetMap.addEventListener('click', () => map.setView(areaConfig[activeArea].center, areaConfig[activeArea].zoom));
} else {
  mapPlaceholder.textContent = 'Peta dasar tidak dapat dimuat. Anda masih dapat menggunakan daftar kamera.';
}

function normalizeCamera(row) {
  if (!row || ![false, 0, '0', 'false'].includes(row.locked) || typeof row.nama !== 'string' || !row.nama.trim()) return null;
  if (Object.hasOwn(row, 'show_public') && ![true, 1, '1', 'true'].includes(row.show_public)) return null;
  if (typeof row.urlCctv !== 'string' || !row.urlCctv.trim()) return null;
  let url;
  try {
    url = new URL(row.urlCctv, source);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !viewerHosts.has(url.hostname) || url.username || url.password) return null;

  const parseCoordinate = (value, limit) => {
    if ((typeof value !== 'number' && typeof value !== 'string') || !String(value).trim()) return null;
    const number = Number(value);
    return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
  };
  const lat = parseCoordinate(row.lat, 90);
  const lng = parseCoordinate(row.lng, 180);
  return {
    name: row.nama.trim(),
    group: typeof row.group === 'string' ? row.group.trim() : '',
    coordinates: lat !== null && lng !== null ? [lat, lng] : null,
    url: url.href
  };
}

function normalizeCityCamera(row) {
  if (!row || typeof row.name !== 'string' || !row.name.trim() ||
      typeof row.slug !== 'string' || !/^[a-z0-9-]+$/.test(row.slug)) return null;
  const lat = row.lat === null || row.lat === undefined ? NaN : Number(row.lat);
  const lon = row.lon === null || row.lon === undefined ? NaN : Number(row.lon);
  return {
    name: row.name.trim(),
    group: 'Kota Cirebon · ' + (row.kecamatan || 'Kamera publik'),
    coordinates: Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180 ? [lat, lon] : null,
    url: citySource,
    slug: row.slug,
    city: true,
    online: row.online === true
  };
}

function stopPlayer() {
  clearTimeout(connectionTimer);
  clearInterval(heartbeatTimer);
  heartbeatTimer = undefined;
  hls?.destroy();
  hls = undefined;
  if (activeVideo) {
    activeVideo.pause();
    activeVideo.removeAttribute('src');
    activeVideo.load();
    activeVideo = undefined;
  }
  player.replaceChildren();
}

function openCityCamera(camera) {
  const message = document.querySelector('#player-status');
  streamLink.textContent = 'Buka portal Kota Cirebon ↗';
  if (!camera.online) {
    message.textContent = 'Kamera tercatat tidak aktif pada pembaruan sumber. Periksa ketersediaannya di portal Kota Cirebon.';
    return;
  }
  const video = document.createElement('video');
  video.controls = true;
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  activeVideo = video;
  player.replaceChildren(video);
  message.textContent = 'Menghubungkan tayangan Kota Cirebon…';
  const failed = () => {
    clearTimeout(connectionTimer);
    clearInterval(heartbeatTimer);
    hls?.destroy();
    hls = undefined;
    message.textContent = 'Tayangan belum dapat diputar di halaman ini. Buka portal Kota Cirebon dan pilih ' + camera.name + '.';
  };
  connectionTimer = setTimeout(failed, 12000);
  video.addEventListener('playing', () => {
    clearTimeout(connectionTimer);
    message.textContent = 'Tayangan Kota Cirebon';
  });
  video.addEventListener('error', failed);
  const heartbeat = () => fetch(citySource + 'api/stream/heartbeat/' + camera.slug, {
    credentials: 'omit', signal: AbortSignal.timeout(8000)
  }).catch(() => {});
  heartbeat();
  heartbeatTimer = setInterval(heartbeat, 15000);
  const url = citySource + 'hls/' + camera.slug + '/index.m3u8';
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    video.play().catch(failed);
  } else if (window.Hls?.isSupported()) {
    hls = new window.Hls({ lowLatencyMode: true, backBufferLength: 6 });
    hls.on(window.Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        failed();
        hls?.destroy();
        hls = undefined;
        clearInterval(heartbeatTimer);
      }
    });
    hls.loadSource(url);
    hls.attachMedia(video);
  } else {
    failed();
    clearInterval(heartbeatTimer);
  }
}

function openCamera(camera) {
  if (dialog.open) return;
  if (map && camera.coordinates) map.setView(camera.coordinates, Math.max(map.getZoom(), 14));
  document.querySelector('#camera-title').textContent = camera.name;
  document.querySelector('#camera-group').textContent = camera.group;
  streamLink.href = camera.url;
  streamLink.textContent = 'Buka tayangan ↗';
  document.querySelector('#player-portal').href = areaConfig[activeArea].portal;
  document.querySelector('#player-status').textContent = '';
  dialog.showModal();
  if (camera.city) {
    openCityCamera(camera);
    return;
  }
  const frame = document.createElement('iframe');
  frame.title = 'Tayangan ' + camera.name;
  frame.src = camera.url;
  frame.sandbox = 'allow-scripts allow-same-origin allow-presentation';
  frame.allowFullscreen = true;
  player.replaceChildren(frame);
}

dialog.addEventListener('close', stopPlayer);

function renderCameras() {
  const query = search.value.trim().toLocaleLowerCase('id');
  const matches = cameras.filter(camera =>
    (camera.name + ' ' + camera.group).toLocaleLowerCase('id').includes(query));
  list.replaceChildren();
  markers?.clearLayers();
  status.textContent = matches.length
    ? matches.length + ' dari ' + cameras.length + ' kamera publik'
    : cameras.length ? 'Tidak ada kamera yang cocok.' : 'Tidak ada tayangan publik HTTPS dalam daftar sumber.';

  for (const camera of matches) {
    const name = document.createElement('span');
    name.textContent = camera.name;
    const group = document.createElement('small');
    group.textContent = camera.group || 'Kamera publik';
    if (camera.city) group.textContent += camera.online ? ' · Aktif menurut sumber' : ' · Tidak aktif menurut sumber';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'camera-row';
    button.append(name, group);
    button.addEventListener('click', () => openCamera(camera));
    const item = document.createElement('li');
    item.append(button);
    list.append(item);

    if (markers && camera.coordinates) {
      L.marker(camera.coordinates, {
        title: camera.name,
        icon: L.divIcon({ className: 'camera-pin', html: '●', iconSize: [30, 30], iconAnchor: [15, 15] })
      }).on('click', () => openCamera(camera)).addTo(markers);
    }
  }
}

function parseCameras(result) {
  if (!Array.isArray(result?.data)) throw new Error('Format data tidak sesuai');
  return result.data.map(normalizeCamera).filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'id', { numeric: true }));
}

function parseCityCameras(result) {
  if (!Array.isArray(result)) throw new Error('Format daftar Kota Cirebon tidak sesuai');
  return result.map(normalizeCityCamera).filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'id'));
}

function showArea() {
  cameras = catalogs.get(activeArea) || [];
  currentSource = sourceLabels.get(activeArea) || '';
  search.disabled = cameras.length === 0;
  cameraSource.textContent = currentSource;
  renderCameras();
}

async function loadCameras() {
  const area = activeArea;
  refresh.disabled = true;
  if (!catalogs.has(area)) {
    const catalogId = area === 'city' ? '#city-catalog' : '#camera-catalog';
    const snapshot = JSON.parse(document.querySelector(catalogId).textContent);
    catalogs.set(area, area === 'city' ? parseCityCameras(snapshot) : parseCameras(snapshot));
    sourceLabels.set(area, area === 'city'
      ? 'Salinan daftar Kota Cirebon · 18 November 2026'
      : 'Salinan data Socakaton · 17 November 2026');
    showArea();
  }
  cameraSource.textContent = sourceLabels.get(area) + '. Memeriksa pembaruan…';
  try {
    const endpoint = area === 'city' ? citySource + 'api/status' : source + 'api/get_public_cctv';
    const response = await fetch(endpoint, {
      credentials: 'omit',
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const result = await response.json();
    catalogs.set(area, area === 'city' ? parseCityCameras(result) : parseCameras(result));
    sourceLabels.set(area, 'Daftar terbaru dari ' + areaConfig[area].label);
  } catch {
    sourceLabels.set(area, sourceLabels.get(area).replace(/\. Pembaruan belum tersedia\.$/, '') + '. Pembaruan belum tersedia.');
  } finally {
    if (area === activeArea) {
      showArea();
      refresh.hidden = false;
      refresh.disabled = false;
    }
  }
}

function selectArea(area) {
  if (activeArea === area) return;
  dialog.close();
  stopPlayer();
  activeArea = area;
  search.value = '';
  for (const name of ['city', 'regency']) {
    document.querySelector('#area-' + name).setAttribute('aria-pressed', String(name === area));
  }
  const portal = document.querySelector('#portal-link');
  portal.href = areaConfig[area].portal;
  portal.textContent = 'Portal ' + areaConfig[area].label + ' ↗';
  map?.setView(areaConfig[area].center, areaConfig[area].zoom);
  showArea();
  loadCameras();
}

document.querySelector('#area-city').addEventListener('click', () => selectArea('city'));
document.querySelector('#area-regency').addEventListener('click', () => selectArea('regency'));
search.addEventListener('input', renderCameras);
refresh.addEventListener('click', loadCameras);
loadCameras();

