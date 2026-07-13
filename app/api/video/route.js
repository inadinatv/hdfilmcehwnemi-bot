import * as cheerio from 'cheerio';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BASE_URL = 'https://www.hdfilmcehennemi.nl';

function dcHello(base64Input) {
    try {
        const decodedOnce = Buffer.from(base64Input, 'base64').toString('utf-8');
        const reversedString = decodedOnce.split('').reverse().join('');
        const decodedTwice = Buffer.from(reversedString, 'base64').toString('utf-8');
        
        let hdchLink = decodedTwice;
        if (hdchLink.includes("+")) hdchLink = hdchLink.split("+").pop();
        else if (hdchLink.includes(" ")) hdchLink = hdchLink.split(" ").pop();
        else if (hdchLink.includes("|")) hdchLink = hdchLink.split("|").pop();
        
        if (hdchLink.includes('https')) {
            return "https" + hdchLink.split("https")[1];
        }
        return hdchLink;
    } catch (e) {
        return base64Input;
    }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  
  if (!url) return NextResponse.json({ error: 'URL eksik' }, { status: 400 });

  try {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': BASE_URL + '/'
    };

    // 1. Film detay sayfasına istek at
    const pageRes = await fetch(url, { headers });
    const pageHtml = await pageRes.text();
    const $ = cheerio.load(pageHtml);
    
    const videoId = $('button.alternative-link').first().attr('data-video');
    if (!videoId) return NextResponse.json({ error: 'Video ID bulunamadı' }, { status: 404 });

    // 2. Video API endpoint'inden iframe verisini al
    const apiRes = await fetch(`${BASE_URL}/video/${videoId}/`, {
        headers: {
            ...headers,
            'X-Requested-With': 'fetch',
            'Accept': 'application/json, text/plain, */*'
        }
    });
    const apiText = await apiRes.text();

    // 3. Iframe linkini ayıkla
    let iframeMatch = apiText.match(/data-src=\\"([^"]+)/) || apiText.match(/data-src="([^"]+)"/);
    if (!iframeMatch) {
        return NextResponse.json({ error: 'Iframe bulunamadı' }, { status: 500 });
    }
    
    let iframe = iframeMatch[1].replace(/\\/g, '');
    if (apiText.includes("rapidrame") && apiText.includes("?rapidrame_id=")) {
        const rapidId = apiText.split('?rapidrame_id=')[1].split('"')[0].split('\\')[0];
        iframe = `${BASE_URL}/rplayer/` + rapidId;
    }

    // 4. Iframe sayfasına bağlanıp dc_hello şifresini bul
    const iframeRes = await fetch(iframe, { headers: { ...headers, 'Referer': url } });
    const iframeText = await iframeRes.text();

    const dcMatch = iframeText.match(/dc_hello\("([^"]+)"\)/) || iframeText.match(/dc_hello\('([^']+)'\)/);
    
    if (!dcMatch || !dcMatch[1]) {
        // Doğrudan .m3u8 linki varsa onu yakala
        const m3u8Direct = iframeText.match(/https?:\/\/[^\s"'<>]+?\.m3u8[^\s"'<>*/]*/);
        if (m3u8Direct) {
            return NextResponse.json({ m3u8Url: m3u8Direct[0] });
        }
        return NextResponse.json({ error: 'dc_hello şifresi çözülemedi' }, { status: 500 });
    }

    const m3u8Url = dcHello(dcMatch[1]);
    return NextResponse.json({ m3u8Url });

  } catch (error) {
    return NextResponse.json({ error: 'Video çözme hatası', detay: error.message }, { status: 500 });
  }
}
