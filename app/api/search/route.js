import { NextResponse } from 'next/server';
import { search } from '../../../lib/hdfc';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const q = (new URL(request.url).searchParams.get('q') || '').trim();
  if (q.length < 2) return NextResponse.json({ results: [] });
  try {
    return NextResponse.json({ results: await search(q) });
  } catch (e) {
    return NextResponse.json({ error: e.message, results: [] }, { status: 502 });
  }
}
