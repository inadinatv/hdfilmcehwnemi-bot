import * as cheerio from 'cheerio';
import { NextResponse } from 'next/server';

// İŞTE SİHİRLİ KOD: Vercel'in Cloudflare Edge altyapısını kullanmasını sağlar
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const BASE_URL = 'https://www.hdfilmcehennemi.nl';

export async function GET() {
  try {
    const response = await fetch(`${BASE_URL}/load/page/1/home/`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-Requested-With': 'fetch',
        'Accept': 'application/json, text/plain, */*'
      }
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Site HTTP Hatası Döndürdü: ${response.status}` }, { status: 500 });
    }

    const data = await response.json();
    
    if (!data || !data.html) {
      return NextResponse.json({ error: 'Edge bağlandı ama HTML boş döndü.' }, { status: 500 });
    }

    const $ = cheerio.load(data.html);
    const movies = [];

    $('a').each((i, el) => {
      const title = $(el).attr('title');
      const href = $(el).attr('href');
      const poster = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');

      if (title && href) {
        movies.push({ title, href, poster });
      }
    });

    if (movies.length === 0) {
      return NextResponse.json({ error: 'Veri çekildi ama film kartları bulunamadı.' }, { status: 500 });
    }

    return NextResponse.json({ movies });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Edge Proxy Hatası (Bağlantı Kurulamadı)',
      detay: error.message 
    }, { status: 500 });
  }
}
