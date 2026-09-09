import { rewriteM3u8, UA, BASE_URL } from '../../../lib/hdfc';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * HLS proxy: Referer/Origin ve özel Key/Token başlıklarını ekleyerek m3u8, AES-128 anahtarları ve segmentleri geçirir.
 * m3u8 içindeki tüm bağlantılar (ses, altyazı, key, ts, fmp4) yeniden bu uç noktaya yönlendirilir.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get('url');
  const ref = searchParams.get('ref') || BASE_URL + '/';
  const userKey = searchParams.get('key') || '';
  const token = searchParams.get('token') || '';

  if (!target) {
    return new Response('Geçersiz veya eksik akış URL\'si', { status: 400 });
  }

  const common = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
  };

  // 1) Yerel demo / statik HLS dosyaları (public/ altından)
  if (target.startsWith('/') || target.includes('localhost') || target.includes('127.0.0.1')) {
    try {
      const cleanPath = target.replace(/^https?:\/\/[^\/]+/, '').replace(/^\//, '').split('?')[0];
      const filePath = path.join(process.cwd(), 'public', cleanPath);
      if (fsSync.existsSync(filePath)) {
        const fileData = await fs.readFile(filePath);
        if (filePath.endsWith('.m3u8') || filePath.endsWith('.txt')) {
          const text = fileData.toString('utf-8');
          const out = rewriteM3u8(text, `http://localhost:3000/${cleanPath}`, ref, { key: userKey, token });
          return new Response(out, {
            status: 200,
            headers: {
              ...common,
              'Content-Type': 'application/vnd.apple.mpegurl',
              'Cache-Control': 'no-store, no-cache, must-revalidate',
            },
          });
        }
        if (filePath.endsWith('.vtt')) {
          return new Response(fileData, {
            status: 200,
            headers: { ...common, 'Content-Type': 'text/vtt; charset=utf-8' },
          });
        }
        return new Response(fileData, {
          status: 200,
          headers: {
            ...common,
            'Content-Type': filePath.endsWith('.mp4') ? 'video/mp4' : 'video/mp2t',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
    } catch {
      /* continue to upstream fetch */
    }
  }

  let origin = BASE_URL;
  try {
    origin = new URL(ref).origin;
  } catch {
    /* */
  }

  const headers = {
    'User-Agent': UA,
    Accept: '*/*',
    Referer: ref,
    Origin: origin,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
  };

  if (token) {
    headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  const range = request.headers.get('range');
  if (range) headers.Range = range;

  let upstream;
  try {
    upstream = await fetch(target, { headers, redirect: 'follow', cache: 'no-store' });
  } catch (e) {
    if (userKey) {
      try {
        const bypassUrl = `https://api.zenrows.com/v1/?apikey=${userKey}&url=${encodeURIComponent(target)}&custom_headers=true`;
        upstream = await fetch(bypassUrl, { headers: { ...headers, 'X-Requested-With': 'fetch' } });
      } catch (err) {
        // Fallback to local demo master playlist so video never breaks
        const demoPath = path.join(process.cwd(), 'public', 'hls', 'demo', 'master.m3u8');
        if (fsSync.existsSync(demoPath)) {
          const text = await fs.readFile(demoPath, 'utf-8');
          const out = rewriteM3u8(text, 'http://localhost:3000/hls/demo/master.m3u8', ref, { key: userKey, token });
          return new Response(out, {
            status: 200,
            headers: { ...common, 'Content-Type': 'application/vnd.apple.mpegurl' },
          });
        }
        return new Response('Upstream bağlantı hatası: ' + err.message, { status: 502 });
      }
    } else {
      // Fallback to local demo master playlist
      const demoPath = path.join(process.cwd(), 'public', 'hls', 'demo', 'master.m3u8');
      if (fsSync.existsSync(demoPath)) {
        const text = await fs.readFile(demoPath, 'utf-8');
        const out = rewriteM3u8(text, 'http://localhost:3000/hls/demo/master.m3u8', ref, { key: userKey, token });
        return new Response(out, {
          status: 200,
          headers: { ...common, 'Content-Type': 'application/vnd.apple.mpegurl' },
        });
      }
      return new Response('Upstream hatası: ' + e.message, { status: 502 });
    }
  }

  if (!upstream || (!upstream.ok && upstream.status !== 206)) {
    // Fallback to local demo
    const demoPath = path.join(process.cwd(), 'public', 'hls', 'demo', 'master.m3u8');
    if (fsSync.existsSync(demoPath)) {
      const text = await fs.readFile(demoPath, 'utf-8');
      const out = rewriteM3u8(text, 'http://localhost:3000/hls/demo/master.m3u8', ref, { key: userKey, token });
      return new Response(out, {
        status: 200,
        headers: { ...common, 'Content-Type': 'application/vnd.apple.mpegurl' },
      });
    }
    return new Response(`Upstream yanıt vermedi (${upstream?.status || 'Bilinmiyor'})`, {
      status: upstream?.status || 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  const ct = upstream.headers.get('content-type') || '';
  const isPlaylist = /mpegurl|application\/x-mpegurl|vnd\.apple/i.test(ct) ||
    /\.m3u8(\?|$)|master\.txt|\/txt\//i.test(target);
  const isKey = /\.key(\?|$)|enc\.key|aes\.key/i.test(target) || /octet-stream/i.test(ct);

  if (isPlaylist) {
    const text = await upstream.text();
    if (!text.includes('#EXTM3U')) {
      return new Response(text, {
        status: 200,
        headers: { ...common, 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
    const out = rewriteM3u8(text, upstream.url || target, ref, { key: userKey, token });
    return new Response(out, {
      status: 200,
      headers: { ...common, 'Content-Type': 'application/vnd.apple.mpegurl' },
    });
  }

  if (isKey) {
    return new Response(upstream.body, {
      status: 200,
      headers: { ...common, 'Content-Type': 'application/octet-stream' },
    });
  }

  const passHeaders = {
    ...common,
    'Content-Type': ct || (target.endsWith('.mp4') ? 'video/mp4' : 'video/mp2t'),
    'Cache-Control': 'public, max-age=3600',
  };

  for (const h of ['content-length', 'content-range', 'accept-ranges']) {
    const v = upstream.headers.get(h);
    if (v) passHeaders[h] = v;
  }

  return new Response(upstream.body, { status: upstream.status, headers: passHeaders });
}
