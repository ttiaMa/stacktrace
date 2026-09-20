"""Small read-only WSGI app. Gunicorn owns HTTP and concurrency in Docker."""
import argparse
import datetime as dt
import json
import logging
import os
import threading
from pathlib import Path
from app.config import load
from app import __version__

STATIC = Path(__file__).parent / 'static'
CONFIG = Path(os.environ.get('STACKTRACE_CONFIG', 'config/timeline.yaml'))
ASSETS = {'/': ('index.html', 'text/html'), '/app.js': ('app.js', 'text/javascript'),
          '/i18n.js': ('i18n.js', 'text/javascript'),
          '/style.css': ('style.css', 'text/css'), '/favicon.svg': ('favicon.svg', 'image/svg+xml')}
ASSETS.update({f'/icons/{path.name}': (f'icons/{path.name}', 'image/svg+xml')
               for path in (STATIC / 'icons').glob('*.svg')})
lock = threading.Lock()
last_good = None
last_error = None


def snapshot():
    global last_good, last_error
    with lock:
        try:
            data, revision = load(CONFIG)
            last_good = dict(data, revision=revision)
            last_error = None
        except (ValueError, OSError, TypeError) as error:
            if str(error) != last_error:
                logging.error('Configuration rejected: %s', error)
                last_error = str(error)
        if last_good is None:
            return {'error': 'Configuration unavailable. Check server logs.'}, False
        return dict(last_good, stale=last_error is not None, app_version=__version__,
                    today=dt.datetime.now(dt.timezone.utc).date().isoformat()), last_error is None


def application(environ, start_response):
    method = environ.get('REQUEST_METHOD', 'GET')
    path = environ.get('PATH_INFO', '/')
    status, mime, extra = '200 OK', 'application/json', []
    if method not in ('GET', 'HEAD'):
        status, body = '405 Method Not Allowed', b'{"error":"Read only"}'
        extra = [('Allow', 'GET, HEAD')]
    elif path in ('/api/timeline', '/healthz'):
        data, healthy = snapshot()
        if path == '/healthz':
            data = {'status': 'ok' if healthy else 'invalid-config'}
        if not healthy and (path == '/healthz' or 'error' in data):
            status = '503 Service Unavailable'
        body = json.dumps(data, ensure_ascii=False).encode()
    elif path in ASSETS:
        filename, mime = ASSETS[path]
        body = (STATIC / filename).read_bytes()
    else:
        status, body = '404 Not Found', b'{"error":"Not found"}'
    headers = [('Content-Type', mime + '; charset=utf-8'), ('Content-Length', str(len(body))),
               ('Cache-Control', 'no-store'), ('X-Content-Type-Options', 'nosniff'),
               ('Referrer-Policy', 'no-referrer'),
               ('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"), *extra]
    start_response(status, headers)
    return [b'' if method == 'HEAD' else body]


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true', help='Validate YAML and exit')
    args = parser.parse_args()
    if args.check:
        data, _ = load(CONFIG)
        print(f"Valid: {len(data['entries'])} entries")
    else:
        from wsgiref.simple_server import make_server
        print('Development server: http://127.0.0.1:8080', flush=True)
        make_server('127.0.0.1', 8080, application).serve_forever()
