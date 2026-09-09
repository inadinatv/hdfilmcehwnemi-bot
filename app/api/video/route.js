import { NextResponse } from 'next/server';
import { resolveMovie, encodeProxyUrl } from '../../../lib/hdfc';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * /api/video?url=<film sayfası>&all=1
 * Tüm alternatif kaynakları çözer ve HLS proxy üzerinden oynatılabilir URL'ler döner.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const all = searchParams.get('all') !== '0';
  if (!url || !/hdfilmcehennemi/.test(url)) return NextResponse.json({ error: 'URL eksik/geçersiz' }, { status: 400 });
  try {
    const r = await resolveMovie(url, { all });
    const sources = r.sources.map((s) => ({
      name: s.name, lang: s.lang, videoId: s.videoId,
      m3u8Url: s.m3u8, referer: s.referer,
      proxyUrl: encodeProxyUrl(s.m3u8, s.referer),
      subtitles: s.subtitles.map((t) => ({ ...t, proxyUrl: `/api/subtitle?url=${encodeURIComponent(t.url)}&ref=${encodeURIComponent(s.referer)}` })),
    }));
    return NextResponse.json({
      title: r.title, poster: r.poster, year: r.year, imdb: r.imdb, genres: r.genres,
      description: r.description, errors: r.errors,
      m3u8Url: sources[0].m3u8Url, proxyUrl: sources[0].proxyUrl, sources,
    });
  } catch (e) {
    return NextResponse.json({ error: 'Video çözme hatası', detay: e.message }, { status: 500 });
  }
}
