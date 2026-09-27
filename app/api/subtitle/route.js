import { UA, BASE_URL } from '../../../lib/hdfc';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

/** SRT → VTT dönüştürür */
function srtToVtt(srt) {
  return 'WEBVTT\n\n' + srt.replace(/\r/g, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .replace(/^\d+\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** public/ altındaki statik dosyayı döndürür (yerel demo altyazıları vb.) */
function serveLocal(target) {
  const cleanPath = target.replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '').split('?')[0];
  const filePath = path.join(process.cwd(), 'public', cleanPath);
  if (!fsSync.existsSync(filePath)) return null;
  return fs.readFile(filePath);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const target = searchParams.get('url');
  const ref = searchParams.get('ref') || BASE_URL + '/';
  if (!target) return new Response('Geçersiz URL', { status: 400 });

  const common = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'text/vtt; charset=utf-8',
    'Cache-Control': 'public, max-age=86400',
  };

  // 1) Yerel dosyalar: göreceli yol, localhost veya kendi hostumuz → public/ altından
  if (
    target.startsWith('/') ||
    target.includes('localhost') ||
    target.includes('127.0.0.1') ||
    (request.headers.get('host') && target.includes(`//${request.headers.get('host')}`) && !target.startsWith('https'))
  ) {
    try {
      const data = await serveLocal(target);
      if (data) {
        let text = data.toString('utf-8');
        if (!text.trim().startsWith('WEBVTT')) text = srtToVtt(text);
        return new Response(text, { status: 200, headers: common });
      }
    } catch {
      /* aşağıdaki upstream denemesine düş */
    }
  }

  // 2) Uzaktan altyazı (https)
  if (/^https:\/\//.test(target)) {
    try {
      const r = await fetch(target, { headers: { 'User-Agent': UA, Referer: ref }, cache: 'no-store' });
      if (!r.ok) return new Response('Upstream ' + r.status, { status: r.status });
      let text = await r.text();
      if (!text.trim().startsWith('WEBVTT')) text = srtToVtt(text);
      return new Response(text, { status: 200, headers: common });
    } catch (e) {
      return new Response('Hata: ' + e.message, { status: 502 });
    }
  }

  return new Response('Geçersiz URL', { status: 400 });
}
