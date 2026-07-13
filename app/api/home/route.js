import axios from 'axios';
import * as cheerio from 'cheerio';
import { NextResponse } from 'next/server';

// Next.js'in API'yi dondurmasını (cache) kesin olarak engelliyoruz
export const dynamic = 'force-dynamic'; 

const BASE_URL = 'https://www.hdfilmcehennemi.nl';

export async function GET() {
  try {
    const { data } = await axios.get(`${BASE_URL}/load/page/1/home/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'X-Requested-With': 'fetch',
      },
      timeout: 10000 // 10 saniye bekleme süresi
    });

    if (!data || !data.html) {
      return NextResponse.json({ error: 'Siteye bağlanıldı ama HTML verisi boş döndü.' }, { status: 500 });
    }

    const $ = cheerio.parseHTML(data.html);
    const movies = [];

    cheerio.load(data.html)('a').each((i, el) => {
      const title = cheerio(el).attr('title');
      const href = cheerio(el).attr('href');
      const poster = cheerio(el).find('img').attr('data-src') || cheerio(el).find('img').attr('src');

      if (title && href) {
        movies.push({ title, href, poster });
      }
    });

    if (movies.length === 0) {
      return NextResponse.json({ error: 'Sayfa çekildi ama film kartları bulunamadı. Site yapısı değişmiş olabilir.' }, { status: 500 });
    }

    return NextResponse.json({ movies });
  } catch (error) {
    // Cloudflare engeli veya başka bir hatayı yakalıyoruz
    return NextResponse.json({ 
      error: 'Vercel IP Adresi site tarafından engellendi (Cloudflare vb.) veya siteye ulaşılamadı.',
      detay: error.message 
    }, { status: 500 });
  }
}
