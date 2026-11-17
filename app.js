const source = 'https://socakaton.cirebonkab.go.id/';
const viewerHosts = new Set(['socakaton.cirebonkab.go.id', 'cctv-backend.cirebonkab.go.id']);
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
  map = L.map(mapView, { scrollWheelZoom: false }).setView(center, 11);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  markers = L.layerGroup().addTo(map);
  resetMap.disabled = false;
  resetMap.addEventListener('click', () => map.setView(center, 11));
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

function openCamera(camera) {
  if (dialog.open) return;
  if (map && camera.coordinates) map.setView(camera.coordinates, Math.max(map.getZoom(), 14));
  document.querySelector('#camera-title').textContent = camera.name;
  document.querySelector('#camera-group').textContent = camera.group;
  streamLink.href = camera.url;
  const frame = document.createElement('iframe');
  frame.title = 'Tayangan ' + camera.name;
  frame.src = camera.url;
  frame.sandbox = 'allow-scripts allow-same-origin allow-presentation';
  frame.allowFullscreen = true;
  player.replaceChildren(frame);
  dialog.showModal();
}

dialog.addEventListener('close', () => player.replaceChildren());

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

async function fetchCameras() {
  const response = await fetch(source + 'api/get_public_cctv', {
    credentials: 'omit',
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return parseCameras(await response.json());
}

function showCameras(entries, sourceLabel) {
  cameras = entries;
  currentSource = sourceLabel;
  search.disabled = cameras.length === 0;
  cameraSource.textContent = sourceLabel;
  renderCameras();
}

async function loadCameras() {
  refresh.disabled = true;
  try {
    if (!currentSource) {
      try {
        const snapshot = parseCameras(JSON.parse(document.querySelector('#camera-catalog').textContent));
        showCameras(snapshot, 'Salinan data Socakaton · 17 November 2026');
      } catch (error) {
        console.warn('Salinan daftar kamera gagal dimuat.', error);
        status.textContent = 'Memuat daftar dari Socakaton…';
      }
    }
    if (currentSource) cameraSource.textContent = currentSource + '. Memeriksa pembaruan…';
    const live = await fetchCameras();
    showCameras(live, 'Daftar terbaru dari API Socakaton');
  } catch {
    if (currentSource) {
      cameraSource.textContent = currentSource + '. API belum dapat diakses.';
    } else {
      status.textContent = 'Daftar kamera gagal dimuat. Coba muat ulang atau buka portal Socakaton.';
      cameraSource.textContent = '';
    }
  } finally {
    refresh.hidden = false;
    refresh.disabled = false;
  }
}

search.addEventListener('input', renderCameras);
refresh.addEventListener('click', loadCameras);
loadCameras();
