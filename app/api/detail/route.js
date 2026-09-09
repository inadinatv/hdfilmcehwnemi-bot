import { NextResponse } from 'next/server';
import { smartFetch, parseDetail, BASE_URL } from '../../../lib/hdfc';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url).searchParams.get('url');
  if (!url || !/hdfilmcehennemi/.test(url)) return NextResponse.json({ error: 'URL eksik/geçersiz' }, { status: 400 });
  try {
    const html = await smartFetch(url, { api: false, referer: BASE_URL + '/' });
    if (!html) return NextResponse.json({ error: 'Sayfa alınamadı' }, { status: 502 });
    return NextResponse.json(parseDetail(html, url));
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
