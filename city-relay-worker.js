const cameraSlugs = new Set(["depan-ataqwa", "satpol-pp", "sudarsono", "bypass", "lemah-wungkuk", "simpang-pulasaren", "simpang-samsat", "simpang-terminal", "simpang-kanggraksan", "simpang-perumnas", "simpang-gunung-sari", "simpang-diklatpri", "simpang-siliwangi", "simpang-krucuk", "depan-kantor-pd", "simpang-winaon", "simpang-asia", "simpang-jabang-bayi", "pintu-masuk-balaikota", "pintu-masuk-balkot", "jl-pemuda", "simpang-drajat", "simpang-kesambi"]);
const upstreamOrigin = 'https://cctv.cirebonkota.go.id';
const cors = {
  'Access-Control-Allow-Origin': 'https://savemeours.github.io',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
  'X-Content-Type-Options': 'nosniff'
};

function reply(message, status = 200) {
  return new Response(message, {
    status,
    headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function upstreamPath(path) {
  if (path === '/city/api/status') return '/api/status';
  const heartbeat = path.match(/^\/city\/api\/stream\/heartbeat\/([a-z0-9-]+)$/);
  if (heartbeat && cameraSlugs.has(heartbeat[1])) return path.slice(5);
  const media = path.match(/^\/city\/hls\/([a-z0-9-]+)\/(index(?:[0-9]+)?\.(?:m3u8|ts))$/);
  if (media && cameraSlugs.has(media[1])) return path.slice(5);
  return null;
}

function rewritePlaylist(text, baseUrl) {
  return text.split('\n').map(line => {
    if (!line.trim()) return line;
    const resolve = value => {
      const resolved = new URL(value, baseUrl);
      const relayPath = '/city' + resolved.pathname;
      if (resolved.origin !== upstreamOrigin || !upstreamPath(relayPath) || resolved.search) {
        throw new Error('Unexpected media URL');
      }
      return relayPath;
    };
    if (line.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/g, (_match, value) => 'URI="' + resolve(value) + '"');
    }
    return resolve(line.trim());
  }).join('\n');
}

const recentSegments = new Map();
let retainedBytes = 0;

function removeSegment(path) {
  const entry = recentSegments.get(path);
  retainedBytes -= entry?.size || 0;
  recentSegments.delete(path);
}

function loadSegment(path) {
  const now = Date.now();
  for (const [key, entry] of recentSegments) {
    if (entry.expires < now) removeSegment(key);
  }
  const existing = recentSegments.get(path);
  if (existing) return existing.promise;
  while (recentSegments.size >= 32) removeSegment(recentSegments.keys().next().value);
  const entry = { expires: now + 60000, size: 0 };
  entry.promise = (async () => {
    try {
      const response = await fetch(upstreamOrigin + path.slice(5), {
        redirect: 'manual', signal: AbortSignal.timeout(15000)
      });
      if (!response.ok || Number(response.headers.get('Content-Length')) > 8 * 1024 * 1024) {
        removeSegment(path);
        return null;
      }
      const bytes = await response.arrayBuffer();
      if (recentSegments.get(path) === entry) {
        entry.size = bytes.byteLength;
        retainedBytes += entry.size;
        while (retainedBytes > 24 * 1024 * 1024 && recentSegments.size) {
          removeSegment(recentSegments.keys().next().value);
        }
      }
      return bytes;
    } catch {
      if (recentSegments.get(path) === entry) removeSegment(path);
      return null;
    }
  })();
  recentSegments.set(path, entry);
  return entry.promise;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!['GET', 'HEAD'].includes(request.method)) return reply('Method not allowed', 405);
    if (url.pathname === '/' || url.pathname === '/health') return reply('Pantau Cirebon stream relay ready');
    const path = upstreamPath(url.pathname);
    if (!path || url.search) return reply('Not found', 404);

    if (path.endsWith('.ts') && request.method === 'GET' && !request.headers.has('Range')) {
      const bytes = await loadSegment(url.pathname);
      if (!bytes) return reply('Segment is no longer available', 404);
      return new Response(bytes, {
        headers: { ...cors, 'Content-Type': 'video/mp2t', 'Cache-Control': 'public, max-age=60' }
      });
    }
    const headers = new Headers();
    if (request.headers.has('Range')) headers.set('Range', request.headers.get('Range'));
    try {
      const upstream = await fetch(upstreamOrigin + path, {
        method: request.method,
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(20000)
      });
      if (upstream.status >= 300 && upstream.status < 400) return reply('Unexpected upstream redirect', 502);
      const responseHeaders = new Headers(cors);
      for (const name of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges']) {
        if (upstream.headers.has(name)) responseHeaders.set(name, upstream.headers.get(name));
      }
      responseHeaders.set('Cache-Control', path.endsWith('.ts') && upstream.ok
        ? 'public, max-age=60, immutable' : 'no-store');
      if (path.endsWith('.m3u8') && upstream.ok && request.method !== 'HEAD') {
        const playlist = await upstream.text();
        if (!playlist.trimStart().startsWith('#EXTM3U')) return reply('Invalid upstream playlist', 502);
        const rewritten = rewritePlaylist(playlist, upstreamOrigin + path);
        const preload = Promise.all(rewritten.split('\n')
          .filter(line => line.startsWith('/city/') && line.endsWith('.ts'))
          .map(loadSegment));
        ctx.waitUntil(preload);
        responseHeaders.delete('Content-Length');
        responseHeaders.set('Content-Type', 'application/vnd.apple.mpegurl');
        return new Response(rewritten, {
          status: upstream.status,
          headers: responseHeaders
        });
      }
      return new Response(request.method === 'HEAD' ? null : upstream.body, {
        status: upstream.status,
        headers: responseHeaders
      });
    } catch {
      return reply('Stream source is temporarily unavailable', 502);
    }
  }
};
