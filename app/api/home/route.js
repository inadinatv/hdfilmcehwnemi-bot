import * as cheerio from 'cheerio';
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const BASE_URL = 'https://www.hdfilmcehennemi.nl';

export async function GET() {
  try {
    const targetUrl = `${BASE_URL}/load/page/1/home/`;
    
    // 1. Taktik: CORS Proxy üzerinden istek at (Cloudflare bunu genelde insan sanır)
    let response = await fetch(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'X-Requested-With': 'fetch'
      }
    });

    // 2. Taktik: Eğer ilk proxy yakalanırsa (403 vb. verirse) CodeTabs Proxy'ye geç
    if (!response.ok) {
       response = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`);
    }

    if (!response.ok) {
      return NextResponse.json({ error: `Proxy'ler de engellendi. HTTP: ${response.status}` }, { status: 500 });
    }

    const textData = await response.text();
    
    // Gelen veri formunu kontrol et ve HTML'i ayıkla
    let htmlContent = "";
    try {
        const parsed = JSON.parse(textData);
        htmlContent = parsed.html || textData; 
    } catch(e) {
        htmlContent = textData;
    }

    const $ = cheerio.load(htmlContent);
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
      return NextResponse.json({ error: 'Sayfa aşıldı ama film kartları boş döndü.' }, { status: 500 });
    }

    return NextResponse.json({ movies });
  } catch (error) {
    return NextResponse.json({ 
      error: 'Proxy sisteminde kritik hata.',
      detay: error.message 
    }, { status: 500 });
  }
}
