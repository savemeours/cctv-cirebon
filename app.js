const source = 'https://socakaton.cirebonkab.go.id/';
const viewerHosts = new Set(['socakaton.cirebonkab.go.id', 'cctv-backend.cirebonkab.go.id']);
const citySource = 'https://cctv.cirebonkota.go.id/';
const cityRelay = 'https://pantau-cirebon-stream.fnnanang.chatgpt.site/city/';
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
const playbackChecks = new Map();
const rowViews = new Map();
const mapViews = new Map();
let checkGeneration = 0;
const checkCancellations = new Set();
const checkSummary = document.querySelector('#camera-check-status');

function cameraKey(camera) {
  return camera.city ? 'city:' + camera.slug : 'regency:' + camera.url;
}

function mediaUrl(camera) {
  if (camera.city) return cityRelay + 'hls/' + camera.slug + '/index.m3u8';
  const viewer = new URL(camera.url);
  const id = viewer.pathname.match(/^\/([a-f0-9-]+)\.html$/)?.[1];
  return id ? viewer.origin + '/memfs/' + id + '.m3u8' : null;
}

function checkLabel(result) {
  return {
    playable: 'Bisa diputar',
    unavailable: 'Belum bisa diputar',
    checking: 'Memeriksa…'
  }[result?.state] || 'Belum diperiksa';
}

function markerIcon(state) {
  return L.divIcon({
    className: 'camera-pin camera-pin-' + (state || 'pending'),
    html: '●',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

function updateCheckView(camera) {
  const key = cameraKey(camera);
  const result = playbackChecks.get(key);
  const view = rowViews.get(key);
  if (view) {
    view.badge.textContent = checkLabel(result);
    view.badge.title = result?.checkedAt && result.state !== 'checking'
      ? 'Diperiksa ' + new Date(result.checkedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      : '';
    view.badge.className = 'camera-availability availability-' + (result?.state || 'pending');
    view.detail.textContent = result?.reason || '';
    view.detail.hidden = !result?.reason;
    view.image.hidden = !result?.thumbnail;
    if (result?.thumbnail) view.image.src = result.thumbnail;
    else view.image.removeAttribute('src');
  }
  mapViews.get(key)?.setIcon(markerIcon(result?.state));
}

function updateCheckSummary() {
  let playable = 0;
  let unavailable = 0;
  for (const camera of cameras) {
    const state = playbackChecks.get(cameraKey(camera))?.state;
    if (state === 'playable') playable++;
    if (state === 'unavailable') unavailable++;
  }
  const pending = cameras.length - playable - unavailable;
  checkSummary.textContent = cameras.length
    ? playable + ' bisa diputar · ' + unavailable + ' belum bisa · ' + pending + ' belum selesai diperiksa'
    : '';
}

function pauseChecks() {
  checkGeneration++;
  for (const cancel of [...checkCancellations]) cancel();
}

function probeCamera(camera) {
  return new Promise(resolve => {
    const key = cameraKey(camera);
    const result = { state: 'checking', checkedAt: Date.now() };
    playbackChecks.set(key, result);
    updateCheckView(camera);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.crossOrigin = 'anonymous';
    video.className = 'camera-probe';
    video.setAttribute('aria-hidden', 'true');
    video.tabIndex = -1;
    document.body.append(video);
    let probeHls;
    let timer;
    let thumbnailTimer;
    let finished = false;
    const controller = new AbortController();

    const finish = (state, reason = '', thumbnail = '') => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(thumbnailTimer);
      controller.abort();
      probeHls?.destroy();
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
      checkCancellations.delete(cancel);
      if (playbackChecks.get(key) === result) {
        if (state) playbackChecks.set(key, { state, reason, thumbnail, checkedAt: Date.now() });
        else playbackChecks.delete(key);
        updateCheckView(camera);
        updateCheckSummary();
      }
      resolve();
    };
    const cancel = () => finish(null);
    checkCancellations.add(cancel);
    timer = setTimeout(() => finish('unavailable', 'Video belum berhasil dimuat dalam 25 detik.'), 25000);

    const captureFrame = () => {
      if (!video.videoWidth || finished) return;
      let thumbnail = '';
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = Math.round(320 * video.videoHeight / video.videoWidth);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        thumbnail = canvas.toDataURL('image/jpeg', 0.65);
      } catch {
        // Playback can succeed even when the source prevents a frame capture.
      }
      finish('playable', thumbnail ? '' : 'Video siap. Thumbnail belum tersedia.', thumbnail);
    };
    video.addEventListener('playing', () => {
      if (video.requestVideoFrameCallback) {
        video.requestVideoFrameCallback(() => video.requestVideoFrameCallback(captureFrame));
      } else {
        thumbnailTimer = setTimeout(captureFrame, 300);
      }
    }, { once: true });
    video.addEventListener('error', () => finish('unavailable', 'Koneksi atau format video belum dapat diputar di browser ini.'));

    const stream = mediaUrl(camera);
    if (!stream) {
      finish('unavailable', 'Alamat aliran video belum tersedia.');
      return;
    }
    if (camera.city && !camera.online) {
      finish('unavailable', 'Sumber Kota menandai kamera ini tidak aktif.');
      return;
    }
    if (camera.city) {
      fetch(cityRelay + 'api/stream/heartbeat/' + camera.slug, {
        credentials: 'omit', signal: controller.signal
      }).catch(() => {});
    }
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = stream;
      video.play().catch(() => finish('unavailable', 'Browser belum dapat memulai video otomatis.'));
    } else if (window.Hls?.isSupported()) {
      probeHls = new window.Hls({
        enableWorker: true,
        lowLatencyMode: true,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 4,
        maxBufferLength: 2,
        maxMaxBufferLength: 4,
        backBufferLength: 0,
        manifestLoadingTimeOut: 12000,
        manifestLoadingMaxRetry: 0,
        levelLoadingMaxRetry: 0,
        fragLoadingMaxRetry: 1
      });
      probeHls.on(window.Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) finish('unavailable', 'Sumber video atau codec belum dapat dimuat di browser ini.');
      });
      probeHls.loadSource(stream);
      probeHls.attachMedia(video);
    } else {
      finish('unavailable', 'Browser ini belum mendukung pemutar video HLS.');
    }
  });
}

function beginChecks() {
  pauseChecks();
  const generation = checkGeneration;
  const entries = [...cameras];
  let next = 0;
  const worker = async () => {
    while (generation === checkGeneration && !dialog.open && next < entries.length) {
      const camera = entries[next++];
      const previous = playbackChecks.get(cameraKey(camera));
      if (previous && previous.state !== 'checking' && Date.now() - previous.checkedAt < 180000) continue;
      await probeCamera(camera);
    }
    updateCheckSummary();
  };
  worker();
  worker();
  updateCheckSummary();
}


if (window.L) {
  mapPlaceholder.remove();
  map = L.map(mapView, { scrollWheelZoom: false }).setView(areaConfig[activeArea].center, areaConfig[activeArea].zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  markers = L.layerGroup().addTo(map);
  resetMap.disabled = false;
  resetMap.addEventListener('click', fitAreaMap);
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

  const originalUrl = url.href;
  if (url.hostname === 'socakaton.cirebonkab.go.id' && url.pathname === '/stream/player') {
    try {
      const direct = new URL(url.searchParams.get('url'));
      if (direct.protocol === 'https:' && direct.hostname === 'cctv-backend.cirebonkab.go.id' &&
          !direct.username && !direct.password && /^\/[a-f0-9-]+\.html$/.test(direct.pathname)) {
        url = direct;
      }
    } catch {
      // Keep the original public player when its nested URL is unavailable.
    }
  }

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
    url: url.href,
    portalUrl: originalUrl
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
  connectionTimer = setTimeout(failed, 30000);
  video.addEventListener('playing', () => {
    clearTimeout(connectionTimer);
    message.textContent = 'Tayangan Kota Cirebon';
  });
  video.addEventListener('error', failed);
  const heartbeat = () => fetch(cityRelay + 'api/stream/heartbeat/' + camera.slug, {
    credentials: 'omit', signal: AbortSignal.timeout(8000)
  }).catch(() => {});
  heartbeat();
  heartbeatTimer = setInterval(heartbeat, 15000);
  const url = cityRelay + 'hls/' + camera.slug + '/index.m3u8';
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = url;
    video.play().catch(failed);
  } else if (window.Hls?.isSupported()) {
    hls = new window.Hls({
      lowLatencyMode: true,
      backBufferLength: 6,
      liveSyncDurationCount: 1,
      liveMaxLatencyDurationCount: 4,
      manifestLoadingTimeOut: 25000,
      maxBufferLength: 8,
      maxMaxBufferLength: 16
    });
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
  pauseChecks();
  if (map && camera.coordinates) map.setView(camera.coordinates, Math.max(map.getZoom(), 14));
  document.querySelector('#camera-title').textContent = camera.name;
  document.querySelector('#camera-group').textContent = camera.group;
  streamLink.href = camera.portalUrl || camera.url;
  streamLink.textContent = 'Buka tayangan ↗';
  document.querySelector('#player-portal').href = areaConfig[activeArea].portal;
  document.querySelector('#player-status').textContent = '';
  dialog.showModal();
  dialog.scrollTop = 0;
  if (camera.city) {
    openCityCamera(camera);
    return;
  }
  const frame = document.createElement('iframe');
  frame.title = 'Tayangan ' + camera.name;
  const playerUrl = new URL(camera.url);
  playerUrl.searchParams.set('autoplay', 'true');
  playerUrl.searchParams.set('mute', 'true');
  frame.src = playerUrl.href;
  frame.allow = 'autoplay; fullscreen; picture-in-picture';
  frame.sandbox = 'allow-scripts allow-same-origin allow-presentation';
  frame.allowFullscreen = true;
  player.replaceChildren(frame);
}

dialog.addEventListener('close', () => {
  stopPlayer();
  beginChecks();
});

function renderCameras() {
  const query = search.value.trim().toLocaleLowerCase('id');
  const matches = cameras.filter(camera =>
    (camera.name + ' ' + camera.group).toLocaleLowerCase('id').includes(query));
  list.replaceChildren();
  rowViews.clear();
  mapViews.clear();
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
    const image = document.createElement('img');
    image.className = 'camera-thumbnail';
    image.alt = 'Pratinjau ' + camera.name;
    image.hidden = true;
    const information = document.createElement('span');
    information.className = 'camera-information';
    const badge = document.createElement('span');
    const detail = document.createElement('small');
    detail.className = 'camera-check-detail';
    information.append(name, group, badge, detail);
    button.append(image, information);
    rowViews.set(cameraKey(camera), { image, badge, detail });
    button.addEventListener('click', () => openCamera(camera));
    const item = document.createElement('li');
    item.append(button);
    list.append(item);

    if (markers && camera.coordinates) {
      const marker = L.marker(camera.coordinates, {
        title: camera.name,
        icon: markerIcon(playbackChecks.get(cameraKey(camera))?.state)
      }).on('click', () => openCamera(camera)).addTo(markers);
      mapViews.set(cameraKey(camera), marker);
    }
    updateCheckView(camera);
  }
  updateCheckSummary();
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
  beginChecks();
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
      : 'Salinan data Socakaton · 18 November 2026');
    showArea();
  }
  cameraSource.textContent = sourceLabels.get(area) + '. Memeriksa pembaruan…';
  try {
    const endpoint = area === 'city' ? cityRelay + 'api/status' : source + 'api/get_public_cctv';
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

function fitAreaMap() {
  if (!map) return;
  const locations = (catalogs.get(activeArea) || []).map(camera => camera.coordinates).filter(Boolean);
  if (locations.length) {
    map.fitBounds(locations, { padding: [28, 28], maxZoom: 13 });
  } else {
    map.setView(areaConfig[activeArea].center, areaConfig[activeArea].zoom);
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
  fitAreaMap();
}

document.querySelector('#area-city').addEventListener('click', () => selectArea('city'));
document.querySelector('#area-regency').addEventListener('click', () => selectArea('regency'));
search.addEventListener('input', renderCameras);
refresh.addEventListener('click', () => {
  for (const camera of cameras) playbackChecks.delete(cameraKey(camera));
  renderCameras();
  beginChecks();
  loadCameras();
});
loadCameras();

