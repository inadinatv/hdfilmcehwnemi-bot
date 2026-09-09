import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

/** Bot tarafından üretilen public/movies.json dosyasını okur (yoksa boş katalog) */
export async function GET() {
  try {
    const file = path.join(process.cwd(), 'public', 'movies.json');
    const raw = await fs.readFile(file, 'utf-8');
    const data = JSON.parse(raw);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'public, max-age=300' } });
  } catch {
    return NextResponse.json({ total: 0, categories: [], movies: [] });
  }
}
