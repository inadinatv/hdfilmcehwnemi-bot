import { rewriteM3u8, UA, BASE_URL } from '../../../lib/hdfc';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ALLOWED = /^https:\/\//i;

/**
 * HLS proxy: Referer/Origin başlıklarını ekleyerek m3u8 ve segmentleri geçirir.
 * m3u8 içindeki tüm bağlantılar yeniden bu uç noktaya yönlendirilir.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get('url');
  const ref = searchParams.get('ref') || BASE_URL + '/';
  if (!target || !ALLOWED.test(target)) return new Response('Geçersiz URL', { status: 400 });

  let origin = BASE_URL;
  try { origin = new URL(ref).origin; } catch { /* */ }

  const headers = {
    'User-Agent': UA,
    Accept: '*/*',
    Referer: ref,
    Origin: origin,
  };
  const range = request.headers.get('range');
  if (range) headers.Range = range;

  let upstream;
  try {
    upstream = await fetch(target, { headers, redirect: 'follow', cache: 'no-store' });
  } catch (e) {
    return new Response('Upstream hatası: ' + e.message, { status: 502 });
  }
  if (!upstream.ok && upstream.status !== 206) {
    return new Response('Upstream ' + upstream.status, { status: upstream.status });
  }

  const ct = upstream.headers.get('content-type') || '';
  const isPlaylist = /mpegurl|application\/x-mpegurl|vnd\.apple/i.test(ct) || /\.m3u8(\?|$)|master\.txt|\/txt\//i.test(target);

  const common = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': isPlaylist ? 'no-store' : 'public, max-age=3600',
  };

  if (isPlaylist) {
    const text = await upstream.text();
    if (!text.includes('#EXTM3U')) {
      return new Response(text, { status: 200, headers: { ...common, 'Content-Type': 'text/plain' } });
    }
    const out = rewriteM3u8(text, upstream.url || target, ref);
    return new Response(out, { status: 200, headers: { ...common, 'Content-Type': 'application/vnd.apple.mpegurl' } });
  }

  const passHeaders = { ...common, 'Content-Type': ct || 'video/mp2t' };
  for (const h of ['content-length', 'content-range', 'accept-ranges']) {
    const v = upstream.headers.get(h);
    if (v) passHeaders[h] = v;
  }
  return new Response(upstream.body, { status: upstream.status, headers: passHeaders });
}
