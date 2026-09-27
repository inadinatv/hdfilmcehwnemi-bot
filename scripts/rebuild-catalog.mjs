/**
 * public/movies.json'u yeniden derler:
 *   node scripts/rebuild-catalog.mjs
 * - Scraper çıktısı (public/movies.json) + kuratlı RAW_MOVIES birleşir
 * - Kategori sayaçları yeniden hesaplanır
 * Scraper ulaşılamayan ortamlarda (bölgesel blok vb.) sitede zengin katalog kalmasını sağlar.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mergeCatalogs } from '../lib/catalog-data.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outFile = path.join(root, 'public', 'movies.json');

let existing = null;
try {
  existing = JSON.parse(await fs.readFile(outFile, 'utf-8'));
} catch {
  /* dosya yoksa sıfırdan üret */
}

const out = mergeCatalogs(existing);
await fs.writeFile(outFile, JSON.stringify(out, null, 2), 'utf-8');
console.log(`✅ public/movies.json güncellendi: ${out.total} içerik, ${out.categories.length} kategori`);
