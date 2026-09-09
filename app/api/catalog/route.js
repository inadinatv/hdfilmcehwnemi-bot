import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { buildFullCatalog } from '../../../lib/catalog-data';

export const dynamic = 'force-dynamic';

/**
 * /api/catalog
 * Bot tarafından üretilen public/movies.json dosyasını okur.
 * Dosya yoksa veya boşsa dinamik zengin kataloğu döner.
 */
export async function GET() {
  try {
    const file = path.join(process.cwd(), 'public', 'movies.json');
    const raw = await fs.readFile(file, 'utf-8');
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.movies) && data.movies.length > 0) {
      return NextResponse.json(data, {
        headers: {
          'Cache-Control': 'public, max-age=120, stale-while-revalidate=600',
        },
      });
    }
  } catch {
    /* fallback to dynamic catalog */
  }

  const defaultCatalog = buildFullCatalog();
  return NextResponse.json(defaultCatalog, {
    headers: {
      'Cache-Control': 'public, max-age=120, stale-while-revalidate=600',
    },
  });
}
