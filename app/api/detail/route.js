import { NextResponse } from 'next/server';
import { smartFetch, parseDetail, findLocalMovie, BASE_URL } from '../../../lib/hdfc';
import { RAW_MOVIES } from '../../../lib/catalog-data';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url).searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'URL parametresi eksik' }, { status: 400 });
  }

  try {
    const html = await smartFetch(url, { api: false, referer: BASE_URL + '/' });
    if (html) {
      const parsed = parseDetail(html, url);
      if (parsed && parsed.title) {
        return NextResponse.json(parsed);
      }
    }
  } catch {
    /* fallback to local database */
  }

  const local = findLocalMovie(url);
  if (local) {
    const recommendations = RAW_MOVIES
      .filter((m) => m.id !== local.id && m.genres?.some((g) => local.genres?.includes(g)))
      .slice(0, 8);

    return NextResponse.json({
      ...local,
      recommendations,
    });
  }

  return NextResponse.json({ error: 'Film detayı bulunamadı' }, { status: 404 });
}
