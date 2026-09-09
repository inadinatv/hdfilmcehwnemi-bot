import { NextResponse } from 'next/server';
import { resolveMovie, encodeProxyUrl, slugOf, findLocalMovie } from '../../../lib/hdfc';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * /api/video?url=<film sayfası>&all=1&key=<userApiKey>
 * Tüm alternatif kaynakları çözer ve HLS proxy üzerinden oynatılabilir URL'ler döner.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const userKey = searchParams.get('key') || '';
  const customM3u8 = searchParams.get('customM3u8') || '';
  const all = searchParams.get('all') !== '0';

  if (!url) {
    return NextResponse.json({ error: 'URL parametresi eksik' }, { status: 400 });
  }

  // Kullanıcı doğrudan özel bir M3U8 URL'si girmişse
  if (customM3u8) {
    const proxied = encodeProxyUrl(customM3u8, url, { key: userKey });
    return NextResponse.json({
      title: 'Özel M3U8 Yayını',
      poster: 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
      m3u8Url: customM3u8,
      proxyUrl: proxied,
      sources: [
        {
          name: 'Özel Akış (M3U8 / Key)',
          lang: 'TR',
          videoId: 'custom-1',
          m3u8Url: customM3u8,
          proxyUrl: proxied,
          subtitles: [],
        },
      ],
      errors: [],
    });
  }

  try {
    const r = await resolveMovie(url, { all, userKey });
    const sources = r.sources.map((s) => ({
      name: s.name,
      lang: s.lang,
      videoId: s.videoId,
      m3u8Url: s.m3u8,
      referer: s.referer,
      proxyUrl: encodeProxyUrl(s.m3u8, s.referer, { key: userKey }),
      subtitles: (s.subtitles || []).map((t) => ({
        ...t,
        proxyUrl: `/api/subtitle?url=${encodeURIComponent(t.url)}&ref=${encodeURIComponent(s.referer || '')}`,
      })),
    }));

    return NextResponse.json({
      title: r.title,
      poster: r.poster,
      year: r.year,
      imdb: r.imdb,
      genres: r.genres,
      description: r.description,
      duration: r.duration,
      cast: r.cast,
      trailer: r.trailer,
      errors: r.errors || [],
      m3u8Url: sources[0]?.m3u8Url,
      proxyUrl: sources[0]?.proxyUrl,
      sources,
    });
  } catch (e) {
    // Son çare: Yerel katalog eşleşmesi veya genel yedek stream
    const fallback = findLocalMovie(url);
    if (fallback) {
      const sources = (fallback.sources || []).map((s) => ({
        ...s,
        proxyUrl: encodeProxyUrl(s.m3u8Url, s.referer, { key: userKey }),
        subtitles: (s.subtitles || []).map((t) => ({
          ...t,
          proxyUrl: `/api/subtitle?url=${encodeURIComponent(t.url)}&ref=${encodeURIComponent(s.referer || '')}`,
        })),
      }));

      return NextResponse.json({
        title: fallback.title,
        poster: fallback.poster,
        year: fallback.year,
        imdb: fallback.imdb,
        genres: fallback.genres,
        description: fallback.description,
        duration: fallback.duration,
        cast: fallback.cast,
        trailer: fallback.trailer,
        m3u8Url: sources[0]?.m3u8Url,
        proxyUrl: sources[0]?.proxyUrl,
        sources,
        errors: [`Canlı siteden çözülemedi (${e.message}). Yedek HD HLS stream sağlandı.`],
      });
    }

    return NextResponse.json({
      error: 'Video çözme hatası',
      detay: e.message,
    }, { status: 500 });
  }
}
