import { UA, BASE_URL } from '../../../lib/hdfc';

export const dynamic = 'force-dynamic';

/** SRT → VTT dönüştürür */
function srtToVtt(srt) {
  return 'WEBVTT\n\n' + srt.replace(/\r/g, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .replace(/^\d+\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get('url');
  const ref = searchParams.get('ref') || BASE_URL + '/';
  if (!target || !/^https:\/\//.test(target)) return new Response('Geçersiz URL', { status: 400 });
  try {
    const r = await fetch(target, { headers: { 'User-Agent': UA, Referer: ref }, cache: 'no-store' });
    if (!r.ok) return new Response('Upstream ' + r.status, { status: r.status });
    let text = await r.text();
    if (!text.trim().startsWith('WEBVTT')) text = srtToVtt(text);
    return new Response(text, { headers: { 'Content-Type': 'text/vtt; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' } });
  } catch (e) {
    return new Response('Hata: ' + e.message, { status: 502 });
  }
}
