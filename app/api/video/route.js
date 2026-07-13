import * as cheerio from 'cheerio';
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const BASE_URL = 'https://www.hdfilmcehennemi.nl';

function dcHello(base64Input) {
    const decodedOnce = decodeURIComponent(escape(atob(base64Input)));
    const reversedString = decodedOnce.split('').reverse().join('');
    const decodedTwice = decodeURIComponent(escape(atob(reversedString)));
    
    let hdchLink = decodedTwice;
    if (hdchLink.includes("+")) hdchLink = hdchLink.split("+").pop();
    else if (hdchLink.includes(" ")) hdchLink = hdchLink.split(" ").pop();
    else if (hdchLink.includes("|")) hdchLink = hdchLink.split("|").pop();
    
    return "https" + hdchLink.split("https")[1];
}

// Tüm video isteklerini maskeleyecek özel fonksiyon
async function fetchWithProxy(targetUrl) {
    let response = await fetch(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'X-Requested-With': 'fetch',
        'Referer': BASE_URL
      }
    });
    
    if (!response.ok) {
        response = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`);
    }
    
    return await response.text();
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  
  if (!url) return NextResponse.json({ error: 'URL eksik' }, { status: 400 });

  try {
    const pageHtml = await fetchWithProxy(url);
    const $ = cheerio.load(pageHtml);
    const videoId = $('button.alternative-link').first().attr('data-video');

    if(!videoId) return NextResponse.json({ error: 'Video ID bulunamadı (Telif yemiş olabilir)' }, { status: 404 });

    const apiText = await fetchWithProxy(`${BASE_URL}/video/${videoId}/`);
    
    let iframeUrl = apiText.match(/data-src=\\"([^"]+)/)[1].replace(/\\/g, '');
    if (iframeUrl.includes("rapidrame")) {
        iframeUrl = `${BASE_URL}/rplayer/` + iframeUrl.split("?rapidrame_id=")[1];
    }

    const iframeText = await fetchWithProxy(iframeUrl);
    const base64Match = iframeText.match(/dc_hello\("([^"]+)"\)/);
    
    if (base64Match && base64Match[1]) {
        const m3u8Url = dcHello(base64Match[1]);
        return NextResponse.json({ m3u8Url });
    }

    return NextResponse.json({ error: 'Şifre kırılamadı veya Proxy yakalandı' }, { status: 500 });
  } catch (error) {
    return NextResponse.json({ error: 'Hata oluştu', detay: error.message }, { status: 500 });
  }
}
