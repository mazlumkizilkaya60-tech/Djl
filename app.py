import os
import random
import requests
from urllib.parse import quote, urlparse
from flask import Flask, render_template, request, jsonify, Response, stream_with_context, redirect

app = Flask(__name__)
from flask import request, Response, stream_with_context
import requests

@app.route('/proxy-test')
def proxy_test():
    return 'proxy ok', 200

@app.route('/proxy')
def proxy():
    url = (request.args.get('url') or '').strip()
    if not url:
        return 'url missing', 400

    headers = {
        'User-Agent': request.headers.get('User-Agent', 'Mozilla/5.0'),
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
        'Connection': 'close',
    }

    if request.headers.get('Range'):
        headers['Range'] = request.headers.get('Range')

    try:
        r = requests.get(url, headers=headers, stream=True, timeout=30)
    except Exception as e:
        return f'proxy error: {e}', 502

    def generate():
        try:
            for chunk in r.iter_content(chunk_size=256 * 1024):
                if chunk:
                    yield chunk
        except Exception:
            return

    resp = Response(stream_with_context(generate()), status=r.status_code)

    for key, value in r.headers.items():
        if key.lower() in ['content-type', 'content-length', 'accept-ranges', 'content-range']:
            resp.headers[key] = value

    return resp
# IPTV configuration
BASE_URL = os.getenv('IPTV_BASE_URL', 'http://xbluex5k.xyz:8080').rstrip('/')
USER = os.getenv('IPTV_USER', 'asan8442')
PASS = os.getenv('IPTV_PASS', '6748442')

session = requests.Session()
session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Connection': 'keep-alive'
})


# ---------- helpers ----------
def get_data(action: str, extra: str = ''):
    url = f"{BASE_URL}/player_api.php?username={USER}&password={PASS}&action={action}{extra}"
    try:
        r = session.get(url, timeout=20)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print('API ERROR', action, e)
        return []


def safe_int(v, default=0):
    try:
        return int(v)
    except Exception:
        return default


def newest_key(item):
    for k in ('added', 'created', 'date', 'timestamp'):
        if item.get(k):
            return safe_int(item.get(k), 0)
    for k in ('stream_id', 'series_id', 'id'):
        if item.get(k):
            return safe_int(item.get(k), 0)
    return 0


def image_of(item):
    return (
        item.get('stream_icon')
        or item.get('cover')
        or item.get('cover_big')
        or 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600"><rect width="100%" height="100%" fill="#111"/><text x="50%" y="50%" fill="#fff" font-family="Segoe UI, Arial" font-size="26" dominant-baseline="middle" text-anchor="middle">Resim Yok</text></svg>'
    )


def build_stream_url(mode: str, item_id: str, ext: str = 'mp4'):
    item_id = str(item_id)
    if mode == 'live':
        return f"{BASE_URL}/live/{USER}/{PASS}/{item_id}.ts"
    if mode == 'series':
        return f"{BASE_URL}/series/{USER}/{PASS}/{item_id}.{ext or 'mp4'}"
    return f"{BASE_URL}/movie/{USER}/{PASS}/{item_id}.{ext or 'mp4'}"


def normalize_vod_item(item):
    sid = str(item.get('stream_id') or item.get('id') or '')
    ext = item.get('container_extension', 'mp4')
    return {
        'id': sid,
        'title': item.get('name', 'İsimsiz'),
        'img': image_of(item),
        'desc': item.get('description') or item.get('plot') or item.get('info') or '',
        'year': str(item.get('year') or '')[:4],
        'rating': item.get('rating') or item.get('imdb_rating') or '',
        'genre': item.get('genre') or '',
        'mode': 'movies',
        'url': build_stream_url('movies', sid, ext),
    }


def normalize_live_item(item):
    sid = str(item.get('stream_id') or item.get('id') or '')
    return {
        'id': sid,
        'title': item.get('name', 'Kanal'),
        'img': image_of(item),
        'desc': item.get('epg_channel_id') or 'Canlı yayın',
        'year': '',
        'rating': '',
        'genre': item.get('category_name') or '',
        'mode': 'live',
        'url': build_stream_url('live', sid, 'ts'),
    }


def normalize_series_item(item):
    sid = str(item.get('series_id') or item.get('id') or '')
    return {
        'id': sid,
        'title': item.get('name', 'Dizi'),
        'img': image_of(item),
        'desc': item.get('plot') or item.get('description') or item.get('info') or '',
        'year': str(item.get('year') or '')[:4],
        'rating': item.get('rating') or item.get('imdb_rating') or '',
        'genre': item.get('genre') or '',
        'mode': 'series',
        'url': '',
    }


def strict_http_url(target: str) -> bool:
    try:
        p = urlparse(target)
        return p.scheme in ('http', 'https')
    except Exception:
        return False


# ---------- routes ----------
@app.route('/')
def landing():
    raw_vod = get_data('get_vod_streams') or []
    raw_series = get_data('get_series') or []
    raw_live = get_data('get_live_streams') or []

    if isinstance(raw_vod, list):
        raw_vod = sorted(raw_vod, key=newest_key, reverse=True)
    if isinstance(raw_series, list):
        raw_series = sorted(raw_series, key=newest_key, reverse=True)
    if isinstance(raw_live, list):
        raw_live = sorted(raw_live, key=newest_key, reverse=True)

    hero_pool = [normalize_vod_item(x) for x in raw_vod[:30]]
    if len(hero_pool) > 8:
        hero_items = random.sample(hero_pool, 8)
    else:
        hero_items = hero_pool

    latest_movies = [normalize_vod_item(x) for x in raw_vod[:18]]
    trending_movies = [normalize_vod_item(x) for x in raw_vod[18:36]]
    popular_series = [normalize_series_item(x) for x in raw_series[:18]]
    live_channels = [normalize_live_item(x) for x in raw_live[:18]]

    return render_template(
        'landing.html',
        hero_items=hero_items,
        latest_movies=latest_movies,
        trending_movies=trending_movies,
        popular_series=popular_series,
        live_channels=live_channels,
    )


@app.route('/browse')
def browse():
    mode = request.args.get('m', 'movies')
    cat_id = request.args.get('c', '')

    if mode == 'live':
        categories = get_data('get_live_categories') or []
        action = 'get_live_streams'
        raw = get_data(action, f'&category_id={cat_id}' if cat_id else '') or []
        items = [normalize_live_item(x) for x in raw[:250]]
    elif mode == 'series':
        categories = get_data('get_series_categories') or []
        action = 'get_series'
        raw = get_data(action, f'&category_id={cat_id}' if cat_id else '') or []
        items = [normalize_series_item(x) for x in raw[:250]]
    else:
        categories = get_data('get_vod_categories') or []
        action = 'get_vod_streams'
        raw = get_data(action, f'&category_id={cat_id}' if cat_id else '') or []
        items = [normalize_vod_item(x) for x in raw[:250]]

    if isinstance(raw, list):
        raw.sort(key=newest_key, reverse=True)

    return render_template('browse.html', mode=mode, categories=categories, items=items, cat_id=str(cat_id))


@app.route('/api/series/<series_id>')
def series_details(series_id):
    data = get_data('get_series_info', f'&series_id={series_id}')
    result = {'id': series_id, 'seasons': []}
    episodes = data.get('episodes', {}) if isinstance(data, dict) else {}
    if not episodes:
        return jsonify(result)

    season_keys = sorted(episodes.keys(), key=lambda x: safe_int(str(x), 99999))
    for s in season_keys:
        eps = episodes.get(s, [])
        season = {'season_num': str(s), 'episodes': []}
        for ep in eps:
            eid = str(ep.get('id') or ep.get('episode_id') or '')
            ext = ep.get('container_extension', 'mp4')
            season['episodes'].append({
                'id': eid,
                'num': ep.get('episode_num') or '',
                'title': ep.get('title') or f'Bölüm {ep.get("episode_num") or ""}'.strip(),
                'url': build_stream_url('series', eid, ext),
            })
        result['seasons'].append(season)
    return jsonify(result)


@app.route('/search')
def search():
    q = request.args.get('q', '').strip().lower()
    out = {'results': []}
    if len(q) < 2:
        return jsonify(out)

    try:
        vod = get_data('get_vod_streams') or []
        series = get_data('get_series') or []
        live = get_data('get_live_streams') or []

        results = []
        for x in vod[:300]:
            if q in (x.get('name', '').lower()):
                results.append(normalize_vod_item(x))
        for x in series[:250]:
            if q in (x.get('name', '').lower()):
                results.append(normalize_series_item(x))
        for x in live[:250]:
            if q in (x.get('name', '').lower()):
                results.append(normalize_live_item(x))

        out['results'] = results[:60]
    except Exception as e:
        print('SEARCH ERROR', e)

    return jsonify(out)


@app.route('/player')
def player():
    title = request.args.get('title', '')
    url = request.args.get('url', '')
    item_id = request.args.get('id', '')
    mode = request.args.get('mode', 'movies')
    series_id = request.args.get('series_id', '')

    if not url and item_id:
        if mode == 'live':
            url = build_stream_url('live', item_id, 'ts')
        elif mode == 'series':
            url = build_stream_url('series', item_id, 'mp4')
        else:
            url = build_stream_url('movies', item_id, 'mp4')

    if not strict_http_url(url):
        return 'Oynatilacak URL eksik veya gecersiz', 400

    playback_url = '/proxy?url=' + quote(url, safe='')
    return render_template('player.html', url=url, playback_url=playback_url, title=title, item_id=item_id, mode=mode, series_id=series_id)


@app.route('/proxy')
def proxy():
    target = (request.args.get('url') or '').strip()
    if not strict_http_url(target):
        return 'Gecersiz URL', 400

    headers = {
        'User-Agent': request.headers.get('User-Agent', session.headers.get('User-Agent')),
        'Accept': request.headers.get('Accept', '*/*'),
        'Accept-Encoding': 'identity',
        'Connection': 'close',
    }

    if request.headers.get('Range'):
        headers['Range'] = request.headers.get('Range')

    try:
        upstream = session.get(target, stream=True, timeout=(10, 180), headers=headers, allow_redirects=True)
    except requests.RequestException as e:
        return f'Upstream hatasi: {e}', 502

    passthrough = ['Content-Type', 'Content-Range', 'Content-Length', 'Accept-Ranges', 'Cache-Control', 'ETag', 'Last-Modified']
    response_headers = {h: upstream.headers[h] for h in passthrough if h in upstream.headers}

    def generate():
        try:
            for chunk in upstream.iter_content(chunk_size=128 * 1024):
                if chunk:
                    yield chunk
        finally:
            upstream.close()

    return Response(stream_with_context(generate()), status=upstream.status_code, headers=response_headers)


@app.route('/health')
def health():
    return jsonify({'ok': True})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, threaded=True, debug=False)
