import { NextResponse } from 'next/server';
import { LISTS, fetchList } from '../../../lib/hdfc';

export const dynamic = 'force-dynamic';

/** Canlı liste: /api/list?key=korku&page=2  veya  /api/list?path=genres/xyz&page=1 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  let listPath = searchParams.get('path');
  if (key) {
    const l = LISTS.find((x) => x.key === key);
    if (!l) return NextResponse.json({ error: 'Bilinmeyen liste' }, { status: 400 });
    listPath = l.path;
  }
  if (!listPath) return NextResponse.json({ lists: LISTS });
  if (!/^[\w\-\/]+$/.test(listPath)) return NextResponse.json({ error: 'Geçersiz yol' }, { status: 400 });
  try {
    const r = await fetchList(listPath, page);
    return NextResponse.json({ page, path: listPath, ...r });
  } catch (e) {
    return NextResponse.json({ error: e.message, movies: [], hasMore: false }, { status: 502 });
  }
}
