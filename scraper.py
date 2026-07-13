import requests
from bs4 import BeautifulSoup
import json
import os

# Hedef siteyi Google Translate sunucuları üzerinden geçiriyoruz
URL = 'https://www-hdfilmcehennemi-nl.translate.goog/load/page/1/home/?_x_tr_sl=tr&_x_tr_tl=tr&_x_tr_hl=tr&_x_tr_pto=wapp'

print("Bot çalıştırıldı, Google Translate Bypass taktiği kullanılıyor...")

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

try:
    response = requests.get(URL, headers=headers)
    
    # Google Translate genelde bozmadan içeriği döndürür
    try:
        data = response.json()
        html = data.get('html', response.text)
    except:
        html = response.text

    soup = BeautifulSoup(html, 'html.parser')
    movies = []

    for a in soup.find_all('a'):
        title = a.get('title')
        href = a.get('href')
        img = a.find('img')
        
        if img:
            poster = img.get('data-src') or img.get('src')
            if title and href and poster:
                # Google Translate'in eklediği kendi link yapısını temizliyoruz
                if 'translate.goog' in href:
                    href = href.replace('https://www-hdfilmcehennemi-nl.translate.goog', 'https://www.hdfilmcehennemi.nl')
                    href = href.split('?_x_tr_sl')[0]
                    
                movies.append({'title': title.strip(), 'href': href, 'poster': poster})

    if movies:
        os.makedirs('public', exist_ok=True)
        with open('public/movies.json', 'w', encoding='utf-8') as f:
            json.dump({'movies': movies}, f, ensure_ascii=False, indent=2)
        print(f"BAŞARILI: {len(movies)} film public/movies.json dosyasına kaydedildi.")
    else:
        print("HATA: Site aşıldı ama film kartları bulunamadı.")
        
except Exception as e:
    print(f"KRİTİK HATA: {e}")
