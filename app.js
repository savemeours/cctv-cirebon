const source = 'https://socakaton.cirebonkab.go.id/';
const viewerHosts = new Set(['socakaton.cirebonkab.go.id', 'cctv-backend.cirebonkab.go.id']);
const citySource = 'https://cctv.cirebonkota.go.id/';
const cityRelay = 'https://pantau-cirebon-stream.fnnanang.chatgpt.site/city/';
const areaConfig = {
  city: { label: 'Kota Cirebon', portal: citySource, center: [-6.727, 108.552], zoom: 13 },
  regency: { label: 'Kabupaten Cirebon', portal: source, center: [-6.717, 108.5], zoom: 11 }
};
let activeArea = 'city';
let statusFilter = 'all';
let libraryFilter = 'all';
let sortOrder = 'name';
let selectedCamera;
let monitorReturnTarget;
const monitorSelection = new Map();
const multiCleanups = [];
let pendingLink = new URLSearchParams(location.search).get('camera');
const linkedArea = new URLSearchParams(location.search).get('area');
if (['city', 'regency'].includes(linkedArea)) activeArea = linkedArea;
function readSaved(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value : fallback; } catch { return fallback; }
}
const favorites = new Set(readSaved('pantau-favorites', []).filter(value => typeof value === 'string'));
let recent = readSaved('pantau-recent', []).filter(value => value && typeof value.key === 'string' && Number.isFinite(value.time)).slice(0, 30);
function saveLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { announce('Penyimpanan browser tidak tersedia. Perubahan hanya tersimpan selama halaman terbuka.'); }
}
let noticeTimer;
function announce(message) {
  const notice = document.querySelector('#app-notice');
  if (dialog.open) dialog.append(notice); else document.body.append(notice);
  notice.textContent = message; notice.hidden = false; clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 4500);
}
const mobileLayout = window.matchMedia('(max-width: 800px)');
let currentView = 'list';
let hls;
let heartbeatTimer;
let connectionTimer;
let activeVideo;
let playerReturnKey;
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


let map;
let markers;
let cameras = [];
let currentSource = '';
const playbackChecks = new Map();
const rowViews = new Map();
const mapViews = new Map();
let checkGeneration = 0;
let searchCheckTimer;
const checkCancellations = new Set();
const checkSummary = document.querySelector('#camera-check-status');

function displayName(camera) {
  const name = camera.name
    .replace(/^(?:8001\s*-\s*)?\[D\d+\]\s*/i, '')
    .replace(/^KEC\.\s*[^-]+-/i, '');
  const acronyms = new Set(['PKK', 'DPRD', 'PD', 'PP', 'SD', 'SMP', 'ATCS', 'CCTV', 'RSUD']);
  return name.toLowerCase().replace(/\p{L}+/gu, word =>
    acronyms.has(word.toUpperCase()) ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1));
}

function locationName(camera) {
  if (camera.city) return camera.group.replace('Kota Cirebon · ', '');
  const location = camera.name.match(/KEC\.\s*([^-]+)/i)?.[1]?.trim();
  const label = location ? location.toLowerCase().replace(/\b\p{L}/gu, letter => letter.toUpperCase()) : 'Kabupaten Cirebon';
  const code = camera.name.match(/\[(D\d+)\]/)?.[1];
  return code ? label + ' · ' + code : label;
}

function isCameraVisible(camera) {
  const query = search.value.trim().toLocaleLowerCase('id');
  const matchesQuery = (camera.name + ' ' + camera.group).toLocaleLowerCase('id').includes(query);
  const state = playbackChecks.get(cameraKey(camera))?.state;
  const key = cameraKey(camera);
  const inLibrary = libraryFilter === 'all' || (libraryFilter === 'favorites' ? favorites.has(key) : recent.some(item => item.key === key));
  return inLibrary && matchesQuery && (statusFilter === 'all' || state === statusFilter);
}

function updateVisibleCameras() {
  let count = 0;
  for (const camera of cameras) {
    const key = cameraKey(camera);
    const visible = isCameraVisible(camera);
    if (visible) count++;
    const view = rowViews.get(key);
    if (view) view.item.hidden = !visible;
    const marker = mapViews.get(key);
    if (marker && markers) {
      if (visible && !markers.hasLayer(marker)) markers.addLayer(marker);
      if (!visible && markers.hasLayer(marker)) markers.removeLayer(marker);
    }
  }
  sortCameraRows();
  document.querySelector('#favorite-count').textContent = cameras.filter(camera => favorites.has(cameraKey(camera))).length;
  const message = count + ' kamera';
  if (status.textContent !== message) status.textContent = message;
  document.querySelector('#camera-empty').hidden = count !== 0;
  const noSearch = !search.value.trim();
  const title = document.querySelector('#empty-title');
  const description = document.querySelector('#empty-description');
  title.textContent = statusFilter === 'playable' && noSearch
    ? 'Belum ada kamera terverifikasi' : 'Kamera tidak ditemukan';
  description.textContent = statusFilter === 'playable' && noSearch
    ? (cameras.some(camera => !playbackChecks.has(cameraKey(camera)) || playbackChecks.get(cameraKey(camera)).state === 'checking')
      ? 'Pemeriksaan masih berjalan. Anda dapat melihat semua kamera sambil menunggu.'
      : 'Belum ada video yang berhasil diputar di browser ini. Pilih Semua untuk mencoba kamera lainnya.')
    : libraryFilter === 'favorites' ? 'Tekan ikon bintang pada kamera untuk menyimpannya di wilayah ini.'
    : libraryFilter === 'recent' ? 'Kamera yang Anda buka di wilayah ini akan muncul di sini.'
    : 'Coba nama lokasi lain atau tampilkan semua kamera.';
  if (libraryFilter !== 'all' && noSearch) title.textContent = libraryFilter === 'favorites' ? 'Belum ada favorit yang sesuai' : 'Belum ada riwayat yang sesuai';
}

function setView(view) {
  currentView = view;
  document.body.dataset.view = view;
  for (const button of document.querySelectorAll('[data-view-choice]')) {
    button.setAttribute('aria-pressed', String(button.dataset.viewChoice === view));
  }
  requestAnimationFrame(() => {
    map?.invalidateSize();
    if (view === 'map') fitAreaMap();
  });
}

function updateAreaInfo() {
  document.querySelector('#map-title').textContent = areaConfig[activeArea].label;
  document.querySelector('#map-camera-count').textContent = cameras.length + ' titik kamera publik';
  for (const area of ['city', 'regency']) {
    const id = area === 'city' ? '#city-catalog' : '#camera-catalog';
    const snapshot = JSON.parse(document.querySelector(id).textContent);
    const initialCount = area === 'city' ? snapshot.length : snapshot.data.length;
    document.querySelector('#' + area + '-count').textContent = catalogs.get(area)?.length ?? initialCount;
  }
}

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
    view.button.dataset.state = result?.state || 'pending';
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
  checkSummary.textContent = pending ? pending + ' belum diperiksa' : 'Pemeriksaan selesai';
  document.querySelector('#count-all').textContent = cameras.length;
  document.querySelector('#count-playable').textContent = playable;
  document.querySelector('#count-unavailable').textContent = unavailable;
  updateVisibleCameras();

}

function pauseChecks() {
  clearTimeout(searchCheckTimer);
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
  const query = search.value.trim().toLocaleLowerCase('id');
  const entries = [...cameras].sort((a, b) => {
    const firstMatches = (a.name + ' ' + a.group).toLocaleLowerCase('id').includes(query);
    const secondMatches = (b.name + ' ' + b.group).toLocaleLowerCase('id').includes(query);
    return Number(secondMatches) - Number(firstMatches);
  });
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
  map.zoomControl.setPosition('bottomright');
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
  for (const cleanup of multiCleanups.splice(0)) cleanup();
  player.classList.remove('multi-player');
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
  if (!camera.online) {
    message.textContent = 'Kamera tercatat tidak aktif pada pembaruan sumber. Silakan pilih kamera lainnya.';
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
    message.textContent = 'Tayangan belum dapat diputar. Tutup pemutar dan coba kamera lainnya atau periksa ulang daftar.';
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
  selectedCamera = camera;
  document.querySelector('#share-camera').hidden = false;
  document.querySelector('#retry-player').hidden = false;
  playerReturnKey = cameraKey(camera);
  recent = [{ key: playerReturnKey, time: Date.now() }, ...recent.filter(item => item.key !== playerReturnKey)].slice(0, 30);
  saveLocal('pantau-recent', recent);
  if (map && camera.coordinates) map.setView(camera.coordinates, Math.max(map.getZoom(), 14));
  document.querySelector('#camera-title').textContent = displayName(camera);
  document.querySelector('#camera-group').textContent = locationName(camera) + ' · ' + areaConfig[activeArea].label;
  document.querySelector('#player-status').textContent = '';
  dialog.showModal();
  dialog.scrollTop = 0;
  document.querySelector('#share-link-field').hidden = true;
  mountSingleCamera(camera);
}

function mountSingleCamera(camera) {
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
  updateVisibleCameras();
  beginChecks();
  const returnTarget = selectedCamera ? rowViews.get(playerReturnKey)?.button : monitorReturnTarget;
  if (document.fullscreenElement === dialog) document.exitFullscreen().catch(() => {});
  if (returnTarget?.getClientRects().length) returnTarget.focus({ preventScroll: true });
});

function renderCameras() {
  const matches = cameras;
  list.replaceChildren();
  rowViews.clear();
  mapViews.clear();
  markers?.clearLayers();
  for (const camera of matches) {
    const name = document.createElement('span');
    name.textContent = displayName(camera);
    name.className = 'camera-name';
    const group = document.createElement('small');
    group.textContent = locationName(camera);
    group.className = 'camera-location';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'camera-row';
    const image = document.createElement('img');
    image.className = 'camera-thumbnail';
    image.alt = 'Pratinjau ' + displayName(camera);
    image.hidden = true;
    const information = document.createElement('span');
    information.className = 'camera-information';
    const badge = document.createElement('span');
    const detail = document.createElement('small');
    detail.className = 'camera-check-detail';
    information.append(name, group, badge, detail);
    const media = document.createElement('span');
    media.className = 'camera-media';
    const placeholder = document.createElement('span');
    placeholder.className = 'camera-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    const cameraIcon = document.createElement('i');
    cameraIcon.className = 'fa-solid fa-video';
    const unavailableIcon = document.createElement('i');
    unavailableIcon.className = 'fa-solid fa-video-slash';
    placeholder.append(cameraIcon, unavailableIcon);
    const play = document.createElement('span');
    play.className = 'camera-play';
    play.setAttribute('aria-hidden', 'true');
    const playIcon = document.createElement('i');
    playIcon.className = 'fa-solid fa-play';
    play.append(playIcon);
    media.append(placeholder, image, play);
    button.append(media, information);
    button.title = camera.name;
    button.addEventListener('click', () => openCamera(camera));
    const item = document.createElement('li');
    const actions = document.createElement('div');
    actions.className = 'camera-actions';
    const favorite = document.createElement('button');
    favorite.type = 'button'; favorite.className = 'camera-action favorite-action';
    favorite.setAttribute('aria-label', 'Favorit ' + displayName(camera));
    favorite.title = 'Simpan atau hapus favorit';
    favorite.setAttribute('aria-pressed', String(favorites.has(cameraKey(camera))));
    const star = document.createElement('i'); star.className = 'fa-regular fa-star'; star.setAttribute('aria-hidden', 'true'); favorite.append(star);
    favorite.addEventListener('click', () => {
      const key = cameraKey(camera);
      if (favorites.has(key)) favorites.delete(key); else favorites.add(key);
      favorite.setAttribute('aria-pressed', String(favorites.has(key)));
      saveLocal('pantau-favorites', [...favorites]); updateVisibleCameras();
      announce(favorites.has(key) ? displayName(camera) + ' disimpan ke favorit.' : displayName(camera) + ' dihapus dari favorit.');
    });
    const compare = document.createElement('button');
    compare.type = 'button'; compare.className = 'camera-action monitor-action';
    compare.setAttribute('aria-label', 'Pilih multi CCTV ' + displayName(camera));
    compare.title = 'Pilih untuk memantau hingga 4 kamera bersamaan';
    compare.setAttribute('aria-pressed', String(monitorSelection.has(cameraKey(camera))));
    const gridIcon = document.createElement('i'); gridIcon.className = 'fa-solid fa-table-cells-large'; gridIcon.setAttribute('aria-hidden', 'true'); compare.append(gridIcon);
    compare.addEventListener('click', () => {
      const key = cameraKey(camera);
      if (monitorSelection.has(key)) monitorSelection.delete(key);
      else if (monitorSelection.size < 4) monitorSelection.set(key, camera);
      else { announce('Maksimal 4 kamera. Lepaskan salah satu pilihan terlebih dahulu.'); return; }
      compare.setAttribute('aria-pressed', String(monitorSelection.has(key))); updateMonitorTray();
    });
    actions.append(favorite, compare);
    item.append(button, actions);
    list.append(item);
    rowViews.set(cameraKey(camera), { image, badge, detail, button, item });

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
  updateAreaInfo();
  renderCameras();
  beginChecks();
  if (pendingLink) {
    const target = cameras.find(camera => shareId(camera) === pendingLink);
    pendingLink = null;
    if (target) openCamera(target); else announce('Kamera pada tautan ini tidak tersedia dalam daftar.');
  }
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
  statusFilter = 'all';
  libraryFilter = 'all';
  updateLibraryButtons();
  for (const button of document.querySelectorAll('[data-status-filter]')) {
    button.setAttribute('aria-pressed', String(button.dataset.statusFilter === 'all'));
  }
  for (const name of ['city', 'regency']) {
    document.querySelector('#area-' + name).setAttribute('aria-pressed', String(name === area));
  }
  map?.setView(areaConfig[area].center, areaConfig[area].zoom);
  showArea();
  loadCameras();
  fitAreaMap();
}

for (const button of document.querySelectorAll('[data-view-choice]')) {
  button.addEventListener('click', () => setView(button.dataset.viewChoice));
}
for (const button of document.querySelectorAll('[data-status-filter]')) {
  button.addEventListener('click', () => {
    statusFilter = button.dataset.statusFilter;
    for (const choice of document.querySelectorAll('[data-status-filter]')) {
      choice.setAttribute('aria-pressed', String(choice === button));
    }
    updateVisibleCameras();
  });
}
document.querySelector('#clear-filters').addEventListener('click', () => {
  search.value = '';
  statusFilter = 'all';
  libraryFilter = 'all';
  updateLibraryButtons();
  for (const button of document.querySelectorAll('[data-status-filter]')) {
    button.setAttribute('aria-pressed', String(button.dataset.statusFilter === 'all'));
  }
  renderCameras();
  beginChecks();
  search.focus();
});
mobileLayout.addEventListener('change', () => setView(currentView));
document.querySelector('#area-city').addEventListener('click', () => selectArea('city'));
document.querySelector('#area-regency').addEventListener('click', () => selectArea('regency'));
search.addEventListener('input', () => {
  renderCameras();
  clearTimeout(searchCheckTimer);
  searchCheckTimer = setTimeout(beginChecks, 300);
});
refresh.addEventListener('click', () => {
  for (const camera of cameras) playbackChecks.delete(cameraKey(camera));
  renderCameras();
  beginChecks();
  loadCameras();
});
for (const area of ['city', 'regency']) document.querySelector('#area-' + area).setAttribute('aria-pressed', String(activeArea === area));
function shareId(camera) {
  return camera.city ? camera.slug : new URL(camera.url).pathname.split('/').pop().replace(/\.html$/, '');
}
function sortCameraRows() {
  const ranks = { playable: 0, checking: 1, pending: 2, unavailable: 3 };
  const ordered = [...cameras].sort((a, b) => {
    if (sortOrder === 'status') {
      const delta = (ranks[playbackChecks.get(cameraKey(a))?.state || 'pending'] ?? 2) - (ranks[playbackChecks.get(cameraKey(b))?.state || 'pending'] ?? 2);
      if (delta) return delta;
    }
    if (sortOrder === 'recent' || libraryFilter === 'recent') {
      const delta = (recent.find(item => item.key === cameraKey(b))?.time || 0) - (recent.find(item => item.key === cameraKey(a))?.time || 0);
      if (delta) return delta;
    }
    return displayName(a).localeCompare(displayName(b), 'id', { numeric: true });
  });
  ordered.forEach((camera, index) => {
    const item = rowViews.get(cameraKey(camera))?.item;
    if (item && list.children[index] !== item) list.insertBefore(item, list.children[index] || null);
  });
}
function updateLibraryButtons() {
  for (const button of document.querySelectorAll('[data-library]')) button.setAttribute('aria-pressed', String(button.dataset.library === libraryFilter));
}
function updateMonitorTray() {
  document.querySelector('#monitor-tray').hidden = monitorSelection.size === 0;
  document.querySelector('#monitor-count').textContent = monitorSelection.size;
}
function mountMultiCamera(camera, target, note) {
  if (camera.city && !camera.online) { note.textContent = 'Kamera tercatat tidak aktif.'; return; }
  const video = document.createElement('video');
  video.controls = true; video.autoplay = true; video.muted = true; video.playsInline = true; target.append(video);
  let engine; let timer; let pulse; let disposed = false;
  const cleanup = () => {
    if (disposed) return; disposed = true;
    clearTimeout(timer); clearInterval(pulse); engine?.destroy();
    video.pause(); video.removeAttribute('src'); video.load();
  };
  multiCleanups.push(cleanup);
  const fail = () => { note.textContent = 'Tayangan belum dapat diputar. Tekan Coba lagi.'; cleanup(); };
  note.textContent = 'Menghubungkan tayangan…';
  const heartbeat = () => fetch(cityRelay + 'api/stream/heartbeat/' + camera.slug, { credentials: 'omit', signal: AbortSignal.timeout(8000) }).catch(() => {});
  if (camera.city) { heartbeat(); pulse = setInterval(heartbeat, 15000); }
  timer = setTimeout(fail, 30000);
  video.addEventListener('playing', () => { clearTimeout(timer); note.textContent = 'Tayangan berjalan · suara dimatikan'; });
  video.addEventListener('error', fail);
  const url = mediaUrl(camera);
  if (!url) { fail(); return; }
  if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = url; video.play().catch(fail); }
  else if (window.Hls?.isSupported()) {
    engine = new window.Hls({ maxBufferLength: 8, maxMaxBufferLength: 16, backBufferLength: 4, liveSyncDurationCount: 2 });
    engine.on(window.Hls.Events.ERROR, (_event, data) => { if (data.fatal) fail(); });
    engine.loadSource(url); engine.attachMedia(video);
  } else fail();
}
function startMonitor() {
  if (!monitorSelection.size) return;
  if (!dialog.open) monitorReturnTarget = document.activeElement;
  pauseChecks(); stopPlayer(); selectedCamera = null;
  const opened = [...monitorSelection.values()].map(camera => ({ key: cameraKey(camera), time: Date.now() }));
  recent = [...opened, ...recent.filter(item => !monitorSelection.has(item.key))].slice(0, 30);
  saveLocal('pantau-recent', recent);
  document.querySelector('#share-camera').hidden = true;
  document.querySelector('#retry-player').hidden = false;
  document.querySelector('#camera-title').textContent = 'Pantau bersamaan';
  document.querySelector('#camera-group').textContent = monitorSelection.size + ' kamera · Kota & Kabupaten Cirebon';
  document.querySelector('#player-status').textContent = 'Setiap tayangan mengikuti ketersediaan sumber dan dukungan video browser. Gunakan kontrol pada video untuk mengaktifkan suara.';
  player.classList.add('multi-player');
  for (const camera of monitorSelection.values()) {
    const tile = document.createElement('section'); tile.className = 'monitor-tile';
    const title = document.createElement('h3'); title.textContent = displayName(camera);
    const media = document.createElement('div'); media.className = 'monitor-media';
    const note = document.createElement('p'); note.setAttribute('role', 'status');
    tile.append(title, media, note); player.append(tile); mountMultiCamera(camera, media, note);
  }
  if (!dialog.open) dialog.showModal();
}
for (const button of document.querySelectorAll('[data-library]')) button.addEventListener('click', () => {
  libraryFilter = button.dataset.library; updateLibraryButtons(); updateVisibleCameras();
});
document.querySelector('#camera-sort').addEventListener('change', event => { sortOrder = event.target.value; sortCameraRows(); });
document.querySelector('#clear-monitor').addEventListener('click', () => {
  monitorSelection.clear(); updateMonitorTray();
  for (const button of document.querySelectorAll('.monitor-action')) button.setAttribute('aria-pressed', 'false');
});
document.querySelector('#open-monitor').addEventListener('click', startMonitor);
document.querySelector('#retry-player').addEventListener('click', () => {
  if (selectedCamera) { stopPlayer(); mountSingleCamera(selectedCamera); }
  else startMonitor();
});
document.querySelector('#fullscreen-player').addEventListener('click', async () => {
  try {
    if (!dialog.requestFullscreen) { announce('Layar penuh belum didukung browser ini.'); return; }
    if (document.fullscreenElement) await document.exitFullscreen(); else await dialog.requestFullscreen();
  } catch { announce('Layar penuh tidak dapat diaktifkan pada browser ini.'); }
});
document.querySelector('#share-camera').addEventListener('click', async () => {
  if (!selectedCamera) return;
  const url = new URL(location.href); url.search = ''; url.hash = '';
  url.searchParams.set('area', selectedCamera.city ? 'city' : 'regency');
  url.searchParams.set('camera', shareId(selectedCamera));
  try { await navigator.clipboard.writeText(url.href); announce('Tautan kamera disalin.'); }
  catch {
    const field = document.querySelector('#share-link-field'); field.hidden = false; field.value = url.href; field.focus(); field.select();
    announce('Penyalinan otomatis belum diizinkan. Salin tautan pada kolom di pemutar.');
  }
});

setView(currentView);
loadCameras();
