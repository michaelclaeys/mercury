"""
Mercury Dev Server — Static files + API proxy for Polymarket, Kalshi, CLOB & News
Run: python server.py
Then open http://localhost:8080
"""

import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import os
import sys
import xml.etree.ElementTree as ET
import re
import html
import threading

PORT = 8080
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))

PROXY_ROUTES = {
    '/proxy/polymarket/': 'https://gamma-api.polymarket.com/',
    '/proxy/polymarket-clob/': 'https://clob.polymarket.com/',
    '/proxy/kalshi/': 'https://api.elections.kalshi.com/trade-api/v2/',
}


class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def do_GET(self):
        # News RSS proxy — converts Google News XML to JSON
        if self.path.startswith('/proxy/news'):
            return self._proxy_news()

        # Check if this is a proxy request
        for prefix, target_base in PROXY_ROUTES.items():
            if self.path.startswith(prefix):
                remote_path = self.path[len(prefix):]
                target_url = target_base + remote_path
                return self._proxy(target_url)

        # Otherwise serve static files
        return super().do_GET()

    def _proxy(self, url):
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 Mercury/1.0',
                'Accept': 'application/json',
            })
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = resp.read()
                self.send_response(resp.status)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Cache-Control', 'max-age=15')
                self.end_headers()
                self.wfile.write(data)
        except Exception as e:
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())

    def _proxy_news(self):
        """Fetch Google News RSS for prediction-market-relevant queries, return JSON."""
        try:
            # Parse query param: /proxy/news?q=polymarket+kalshi
            qs = urllib.parse.urlparse(self.path).query
            params = urllib.parse.parse_qs(qs)
            query = params.get('q', ['prediction market polymarket kalshi'])[0]

            rss_url = (
                f'https://news.google.com/rss/search?q={urllib.parse.quote(query)}'
                f'&hl=en-US&gl=US&ceid=US:en'
            )
            req = urllib.request.Request(rss_url, headers={
                'User-Agent': 'Mozilla/5.0 Mercury/1.0',
                'Accept': 'application/xml',
            })
            with urllib.request.urlopen(req, timeout=8) as resp:
                xml_data = resp.read()

            root = ET.fromstring(xml_data)
            channel = root.find('channel')
            items = []
            for item in (channel.findall('item') if channel is not None else []):
                title = item.findtext('title', '')
                link = item.findtext('link', '')
                pub_date = item.findtext('pubDate', '')
                source_el = item.find('source')
                source = source_el.text if source_el is not None else ''
                # Clean HTML from title
                title = html.unescape(re.sub(r'<[^>]+>', '', title))
                items.append({
                    'title': title,
                    'link': link,
                    'pubDate': pub_date,
                    'source': source,
                })
                if len(items) >= 30:
                    break

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'max-age=120')
            self.end_headers()
            self.wfile.write(json.dumps({'articles': items}).encode())

        except Exception as e:
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e), 'articles': []}).encode())

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, format, *args):
        # Quieter logging — only show proxy requests
        msg = format % args
        if '/proxy/' in msg:
            sys.stderr.write(f"\033[36m[proxy]\033[0m {msg}\n")


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


if __name__ == '__main__':
    print(f"\n  Mercury Dev Server")
    print(f"  http://localhost:{PORT}")
    print(f"  Proxying: Polymarket + Kalshi + CLOB + News")
    print(f"  Threaded — static files won't block on slow proxies")
    print(f"  Press Ctrl+C to stop\n")

    server = ThreadedHTTPServer(('', PORT), ProxyHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()
