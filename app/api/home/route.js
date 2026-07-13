import axios from 'axios';
import * as cheerio from 'cheerio';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BASE_URL = 'https://www.hdfilmcehennemi.nl';

export async function GET() {
  try {
    // İstekleri AllOrigins Proxy'si üzerinden geçiriyoruz.
    // Bu sayede Vercel'in kendi IP'si gizleniyor.
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(`${BASE_URL}/load/page/1/home/`)}`;

    const response = await axios.get(proxyUrl);

    // AllOrigins sonucu 'contents' objesi içinde JSON string olarak döndürür
    const rawData = response.data.contents;
    
    if (!rawData) {
      return NextResponse.json({ error: 'Proxy çalıştı ama içerik boş döndü.' }, { status: 500 });
    }

    // Gelen veri kendi içinde de bir JSON yapısı barındırıyor (hdfilmcehennemi'nin döndürdüğü yapı)
    const parsedData = JSON.parse(rawData);
    
    if (!parsedData.html) {
      return NextResponse.json({ error: 'Proxy içeriği çekti ama HTML verisi bulunamadı.' }, { status: 500 });
    }

    const $ = cheerio.parseHTML(parsedData.html);
    const movies = [];

    cheerio.load(parsedData.html)('a').each((i, el) => {
      const title = cheerio(el).attr('title');
      const href = cheerio(el).attr('href');
      const poster = cheerio(el).find('img').attr('data-src') || cheerio(el).find('img').attr('src');

      if (title && href) {
        movies.push({ title, href, poster });
      }
    });

    if (movies.length === 0) {
      return NextResponse.json({ error: 'Sayfa proxy üzerinden çekildi ama film kartları bulunamadı.' }, { status: 500 });
    }

    return NextResponse.json({ movies });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Proxy üzerinden de siteye ulaşılamadı. Cloudflare Proxy sunucularını da engelliyor olabilir.',
      detay: error.message 
    }, { status: 500 });
  }
}
