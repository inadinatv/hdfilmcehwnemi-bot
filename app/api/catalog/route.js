import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { mergeCatalogs } from '../../../lib/catalog-data';

export const dynamic = 'force-dynamic';

/**
 * /api/catalog
 * public/movies.json (bot/scraper çıktısı) ile kuratlı RAW_MOVIES birleştirilerek
 * eksiksiz katalog döner. Dosya yoksa tamamen dinamik zengin katalog üretilir.
 */
export async function GET() {
  let merged = null;
  try {
    const file = path.join(process.cwd(), 'public', 'movies.json');
    const raw = await fs.readFile(file, 'utf-8');
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.movies) && data.movies.length > 0) {
      merged = mergeCatalogs(data);
    }
  } catch {
    /* fallback: dinamik katalog */
  }

  if (!merged) {
    merged = mergeCatalogs(null);
  }

  return NextResponse.json(merged, {
    headers: {
      'Cache-Control': 'public, max-age=120, stale-while-revalidate=600',
    },
  });
}
