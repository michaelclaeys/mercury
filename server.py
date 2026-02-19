"""
Mercury Dev Server — Static files + Market Data Cache + API proxy
Run: python server.py
Then open http://localhost:8080

Architecture:
  - Background thread polls Polymarket + Kalshi every 15s
  - Caches combined market data in memory
  - Frontend hits /api/markets (instant, no external calls)
  - Proxy routes kept for chart history / candlestick endpoints
  - News proxy for Google News RSS → JSON
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
import time
import traceback
import signal

PORT = int(os.environ.get('PORT', 8080))
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))

# How often to poll external APIs (seconds)
POLL_INTERVAL = 15

# ═══════════════════════════════════════════════════════════════
# MARKET DATA CACHE — single source of truth for all clients
# ═══════════════════════════════════════════════════════════════

class MarketCache:
    """Background-threaded cache that polls Polymarket + Kalshi APIs."""

    def __init__(self):
        self.lock = threading.Lock()
        self._markets = []          # Combined market list
        self._last_update = 0       # Unix timestamp of last successful fetch
        self._status = 'starting'   # 'live', 'stale', 'error', 'starting'
        self._poly_count = 0
        self._kalshi_count = 0
        self._error = None
        self._thread = None

    def start(self):
        self._thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._thread.start()

    def get_data(self):
        with self.lock:
            return {
                'markets': self._markets,
                'status': self._status,
                'lastUpdate': self._last_update,
                'polyCount': self._poly_count,
                'kalshiCount': self._kalshi_count,
                'error': self._error,
            }

    def _poll_loop(self):
        while True:
            try:
                self._fetch_all()
            except Exception as e:
                with self.lock:
                    self._status = 'error' if not self._markets else 'stale'
                    self._error = str(e)
                sys.stderr.write(f"\033[31m[cache] Error: {e}\033[0m\n")
            time.sleep(POLL_INTERVAL)

    def _fetch_all(self):
        t0 = time.time()

        # Fetch all 4 sources in parallel using threads
        results = {}
        errors = {}

        def fetch_source(name, fn):
            try:
                results[name] = fn()
            except Exception as e:
                errors[name] = str(e)
                results[name] = []

        threads = [
            threading.Thread(target=fetch_source, args=('poly_events', lambda: self._fetch_poly_events())),
            threading.Thread(target=fetch_source, args=('poly_markets', lambda: self._fetch_poly_markets())),
            threading.Thread(target=fetch_source, args=('kalshi_events', lambda: self._fetch_kalshi_events())),
            threading.Thread(target=fetch_source, args=('kalshi_markets', lambda: self._fetch_kalshi_markets())),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=20)

        poly_events = results.get('poly_events', [])
        poly_markets = results.get('poly_markets', [])
        kalshi_events = results.get('kalshi_events', [])
        kalshi_markets = results.get('kalshi_markets', [])

        combined = self._merge_markets(poly_events, poly_markets, kalshi_events, kalshi_markets)

        elapsed = time.time() - t0
        poly_total = len(poly_events) + len(poly_markets)
        kalshi_total = len(kalshi_events) + len(kalshi_markets)

        # Only update if we got data — don't overwrite good data with empty on timeout
        with self.lock:
            if len(combined) > 0:
                self._markets = combined
                self._last_update = int(time.time() * 1000)
                self._poly_count = poly_total
                self._kalshi_count = kalshi_total
                self._status = 'live'
                self._error = None
            elif self._markets:
                # Keep stale data, just note the error
                self._status = 'stale'
                self._error = 'Fetch returned 0 markets — keeping previous data'
            else:
                self._status = 'error'
                self._error = 'No data available'

        err_str = f" (errors: {errors})" if errors else ""
        sys.stderr.write(
            f"\033[32m[cache]\033[0m {len(combined)} markets "
            f"(poly={poly_total}, kalshi={kalshi_total}) "
            f"in {elapsed:.1f}s{err_str}\n"
        )

    # ─── Polymarket ────────────────────────────────────────────

    def _fetch_json(self, url, timeout=15):
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 Mercury/1.0',
            'Accept': 'application/json',
        })
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())

    def _fetch_poly_events(self):
        events = []
        for page in range(1, 2):  # Single page — top 100 events by volume
            url = f'https://gamma-api.polymarket.com/events?limit=100&active=true&closed=false&order=volume24hr&ascending=false&offset={100*(page-1)}'
            data = self._fetch_json(url)
            if not data:
                break
            for ev in data:
                markets_list = ev.get('markets', [])
                if not markets_list:
                    continue
                active_markets = [m for m in markets_list if m.get('active') and not m.get('closed')]
                if not active_markets:
                    continue
                # Aggregate volume
                total_vol = sum(float(m.get('volume24hr', 0) or 0) for m in active_markets)
                # Best price from first market
                first = active_markets[0]
                price = round(float(first.get('outcomePrices', '["0.5"]').strip('[]').split(',')[0] or 0.5) * 100)
                # Build sub-markets
                subs = []
                for m in active_markets[:30]:
                    outcomes = m.get('outcomePrices', '[]')
                    try:
                        op = json.loads(outcomes)
                    except:
                        op = [0.5]
                    mp = round(float(op[0]) * 100) if op else 50
                    subs.append({
                        'name': m.get('groupItemTitle') or m.get('question', ''),
                        'price': mp,
                        'vol': self._fmt_vol(float(m.get('volume24hr', 0) or 0)),
                        '_volNum': float(m.get('volume24hr', 0) or 0),
                        'bestBid': round(float(m.get('bestBid', 0) or 0) * 100),
                        'bestAsk': round(float(m.get('bestAsk', 0) or 0) * 100),
                        'source': 'polymarket',
                        'conditionId': m.get('conditionId'),
                        'clobTokenId': (m.get('clobTokenIds', '[]').strip('[]').split(',')[0].strip(' "') if m.get('clobTokenIds') else None),
                    })
                is_event = len(active_markets) > 1
                first_clob = (first.get('clobTokenIds', '[]').strip('[]').split(',')[0].strip(' "') if first.get('clobTokenIds') else None)
                events.append({
                    'name': ev.get('title', ''),
                    'price': price,
                    'volume24h': total_vol,
                    'endDate': ev.get('endDate'),
                    'slug': ev.get('slug'),
                    'id': ev.get('id'),
                    'bestBid': round(float(first.get('bestBid', 0) or 0) * 100),
                    'bestAsk': round(float(first.get('bestAsk', 0) or 0) * 100),
                    'liquidity': float(first.get('liquidity', 0) or 0),
                    'conditionId': first.get('conditionId'),
                    'clobTokenId': first_clob,
                    'isEvent': is_event,
                    'subCount': len(active_markets),
                    'subMarkets': subs,
                    'source': 'polymarket',
                })
            break  # Single page
        return events

    def _fetch_poly_markets(self):
        url = 'https://gamma-api.polymarket.com/markets?limit=200&active=true&closed=false&order=volume24hr&ascending=false'
        data = self._fetch_json(url)
        markets = []
        for m in (data or []):
            if not m.get('active') or m.get('closed'):
                continue
            outcomes = m.get('outcomePrices', '[]')
            try:
                op = json.loads(outcomes)
            except:
                op = [0.5]
            price = round(float(op[0]) * 100) if op else 50
            clob = (m.get('clobTokenIds', '[]').strip('[]').split(',')[0].strip(' "') if m.get('clobTokenIds') else None)
            markets.append({
                'name': m.get('question', ''),
                'price': price,
                'volume24h': float(m.get('volume24hr', 0) or 0),
                'endDate': m.get('endDate'),
                'slug': m.get('slug'),
                'id': m.get('id'),
                'bestBid': round(float(m.get('bestBid', 0) or 0) * 100),
                'bestAsk': round(float(m.get('bestAsk', 0) or 0) * 100),
                'liquidity': float(m.get('liquidity', 0) or 0),
                'conditionId': m.get('conditionId'),
                'clobTokenId': clob,
                'source': 'polymarket',
            })
        return markets

    # ─── Kalshi ────────────────────────────────────────────────

    def _fetch_kalshi_events(self):
        events = []
        for page in range(1, 2):  # Single page — top 100 events
            url = f'https://api.elections.kalshi.com/trade-api/v2/events?limit=100&with_nested_markets=true&status=open&offset={100*(page-1)}'
            data = self._fetch_json(url)
            event_list = data.get('events', []) if isinstance(data, dict) else []
            if not event_list:
                break
            for ev in event_list:
                markets_list = ev.get('markets', [])
                active_markets = [m for m in markets_list if m.get('status') == 'active']
                if not active_markets:
                    continue
                total_vol = sum(m.get('volume_24h', 0) or 0 for m in active_markets)
                first = active_markets[0]
                price = round((first.get('yes_price', 0.5) or 0.5) * 100) if isinstance(first.get('yes_price'), (int, float)) else round(float(first.get('last_price', 50) or 50))
                subs = []
                for m in active_markets[:30]:
                    mp = round((m.get('yes_price', 0.5) or 0.5) * 100) if isinstance(m.get('yes_price'), (int, float)) else 50
                    subs.append({
                        'name': m.get('title') or m.get('subtitle', ''),
                        'ticker': m.get('ticker'),
                        'price': mp,
                        'vol': self._fmt_vol(m.get('volume_24h', 0) or 0),
                        '_volNum': m.get('volume_24h', 0) or 0,
                        'yesBid': round((m.get('yes_bid', 0) or 0) * 100) if isinstance(m.get('yes_bid'), float) else m.get('yes_bid', 0),
                        'yesAsk': round((m.get('yes_ask', 0) or 0) * 100) if isinstance(m.get('yes_ask'), float) else m.get('yes_ask', 0),
                        'source': 'kalshi',
                    })
                is_event = len(active_markets) > 1
                events.append({
                    'name': ev.get('title', ''),
                    'price': price,
                    'volume24h': total_vol,
                    'closeTime': ev.get('close_date') or ev.get('expected_expiration_time'),
                    'eventTicker': ev.get('event_ticker'),
                    'yesBid': round((first.get('yes_bid', 0) or 0) * 100) if isinstance(first.get('yes_bid'), float) else first.get('yes_bid', 0),
                    'yesAsk': round((first.get('yes_ask', 0) or 0) * 100) if isinstance(first.get('yes_ask'), float) else first.get('yes_ask', 0),
                    'liquidity': first.get('liquidity', 0) or 0,
                    'isEvent': is_event,
                    'subCount': len(active_markets),
                    'subMarkets': subs,
                    'source': 'kalshi',
                })
            break  # Single page
        return events

    def _fetch_kalshi_markets(self):
        url = 'https://api.elections.kalshi.com/trade-api/v2/markets?limit=200&status=open'
        data = self._fetch_json(url)
        markets_list = data.get('markets', []) if isinstance(data, dict) else []
        markets = []
        for m in markets_list:
            if m.get('status') not in ('active', 'open'):
                continue
            price = round((m.get('yes_price', 0.5) or 0.5) * 100) if isinstance(m.get('yes_price'), (int, float)) else 50
            markets.append({
                'name': m.get('title') or m.get('subtitle', ''),
                'price': price,
                'volume24h': m.get('volume_24h', 0) or 0,
                'closeTime': m.get('close_time') or m.get('expected_expiration_time'),
                'ticker': m.get('ticker'),
                'yesBid': round((m.get('yes_bid', 0) or 0) * 100) if isinstance(m.get('yes_bid'), float) else m.get('yes_bid', 0),
                'yesAsk': round((m.get('yes_ask', 0) or 0) * 100) if isinstance(m.get('yes_ask'), float) else m.get('yes_ask', 0),
                'liquidity': m.get('liquidity', 0) or 0,
                'source': 'kalshi',
            })
        return markets

    # ─── Merge + Dedup ─────────────────────────────────────────

    def _normalize(self, name):
        if not name:
            return ''
        return re.sub(r'[^a-z0-9]', '', name.lower())

    def _short_name(self, name):
        if not name:
            return ''
        name = re.sub(r'\?$', '', name.strip())
        words = name.split()[:5]
        short = ''.join(w[:4].upper() for w in words if len(w) > 2)
        return short[:12] if short else name[:12].upper()

    def _classify_tf(self, date_str):
        if not date_str:
            return '1M'
        try:
            from datetime import datetime
            if 'T' in str(date_str):
                dt = datetime.fromisoformat(str(date_str).replace('Z', '+00:00'))
            else:
                dt = datetime.fromisoformat(str(date_str))
            diff = (dt.timestamp() - time.time()) / 3600
            if diff < 0.5:
                return '15M'
            if diff < 3:
                return '1H'
            if diff < 168:
                return '1W'
            if diff < 720:
                return '1M'
            return '1Y'
        except:
            return '1M'

    def _fmt_vol(self, v):
        if v >= 1e6:
            return f'${v/1e6:.1f}M'
        if v >= 1e3:
            return f'${v/1e3:.0f}K'
        return f'${v:.0f}'

    def _chart_score(self, price, volume):
        """Score markets by charting quality — mid-range prices + high volume = best charts."""
        # Price quality: 1.0 at 50c, quadratic falloff toward extremes
        dist = abs(price - 50) / 50.0  # 0 at center, 1 at extremes
        price_weight = max(0.05, 1.0 - dist * dist)
        return volume * price_weight

    def _merge_markets(self, poly_events, poly_markets, kalshi_events, kalshi_markets):
        combined = []
        seen = set()

        # Polymarket events
        for ev in poly_events:
            norm = self._normalize(ev['name'])
            seen.add(norm)
            for sm in (ev.get('subMarkets') or []):
                seen.add(self._normalize(sm['name']))
            combined.append({
                'name': ev['name'],
                'short': self._short_name(ev['name']),
                'price': ev['price'],
                'vol': self._fmt_vol(ev['volume24h']),
                '_volNum': ev['volume24h'],
                'polyPrice': ev['price'],
                'kalshiPrice': None,
                'polyBid': ev.get('bestBid'),
                'polyAsk': ev.get('bestAsk'),
                'tf': self._classify_tf(ev.get('endDate')),
                '_endDate': ev.get('endDate'),
                'source': 'polymarket',
                'slug': ev.get('slug'),
                '_polyId': ev.get('id'),
                '_conditionId': ev.get('conditionId'),
                '_clobTokenId': ev.get('clobTokenId'),
                'liquidity': ev.get('liquidity', 0),
                'isEvent': ev.get('isEvent', False),
                'subCount': ev.get('subCount', 0),
                'subMarkets': ev.get('subMarkets'),
            })

        # Individual Polymarket markets
        for m in poly_markets:
            norm = self._normalize(m['name'])
            if norm in seen:
                continue
            seen.add(norm)
            combined.append({
                'name': m['name'],
                'short': self._short_name(m['name']),
                'price': m['price'],
                'vol': self._fmt_vol(m['volume24h']),
                '_volNum': m['volume24h'],
                'polyPrice': m['price'],
                'kalshiPrice': None,
                'polyBid': m.get('bestBid'),
                'polyAsk': m.get('bestAsk'),
                'tf': self._classify_tf(m.get('endDate')),
                '_endDate': m.get('endDate'),
                'source': 'polymarket',
                'slug': m.get('slug'),
                '_polyId': m.get('id'),
                '_conditionId': m.get('conditionId'),
                '_clobTokenId': m.get('clobTokenId'),
                'liquidity': m.get('liquidity', 0),
                'isEvent': False,
                'subCount': 0,
                'subMarkets': None,
            })

        # Kalshi events — merge or add
        for ev in kalshi_events:
            norm = self._normalize(ev['name'])
            existing = next((c for c in combined if self._normalize(c['name']) == norm), None)
            if existing:
                existing['kalshiPrice'] = ev['price']
                existing['kalshiBid'] = ev.get('yesBid')
                existing['kalshiAsk'] = ev.get('yesAsk')
                existing['_kalshiTicker'] = (ev.get('subMarkets', [{}])[0].get('ticker') or ev.get('eventTicker'))
                # Merge sub-markets
                if ev.get('isEvent') and ev.get('subMarkets'):
                    if not existing.get('isEvent'):
                        existing['isEvent'] = True
                        existing['subMarkets'] = existing.get('subMarkets') or []
                    for ksm in ev['subMarkets']:
                        kn = self._normalize(ksm['name'])
                        esub = next((s for s in (existing['subMarkets'] or []) if self._normalize(s['name']) == kn), None)
                        if esub:
                            esub['kalshiPrice'] = ksm['price']
                        else:
                            existing['subMarkets'] = existing.get('subMarkets') or []
                            existing['subMarkets'].append(ksm)
                    existing['subCount'] = len(existing['subMarkets'] or [])
            else:
                for sm in (ev.get('subMarkets') or []):
                    seen.add(self._normalize(sm['name']))
                seen.add(norm)
                combined.append({
                    'name': ev['name'],
                    'short': self._short_name(ev['name']),
                    'price': ev['price'],
                    'vol': self._fmt_vol(ev['volume24h']),
                    '_volNum': ev['volume24h'],
                    'polyPrice': None,
                    'kalshiPrice': ev['price'],
                    'kalshiBid': ev.get('yesBid'),
                    'kalshiAsk': ev.get('yesAsk'),
                    'tf': self._classify_tf(ev.get('closeTime')),
                    '_endDate': ev.get('closeTime'),
                    'source': 'kalshi',
                    '_kalshiTicker': (ev.get('subMarkets', [{}])[0].get('ticker') or ev.get('eventTicker')),
                    'liquidity': ev.get('liquidity', 0),
                    'isEvent': ev.get('isEvent', False),
                    'subCount': ev.get('subCount', 0),
                    'subMarkets': ev.get('subMarkets'),
                })

        # Remaining individual Kalshi markets
        for m in kalshi_markets:
            norm = self._normalize(m['name'])
            existing = next((c for c in combined if self._normalize(c['name']) == norm), None)
            if existing:
                if existing.get('kalshiPrice') is None:
                    existing['kalshiPrice'] = m['price']
                    existing['kalshiBid'] = m.get('yesBid')
                    existing['kalshiAsk'] = m.get('yesAsk')
                    existing['_kalshiTicker'] = m.get('ticker')
            elif norm not in seen:
                seen.add(norm)
                combined.append({
                    'name': m['name'],
                    'short': self._short_name(m['name']),
                    'price': m['price'],
                    'vol': self._fmt_vol(m['volume24h']),
                    '_volNum': m['volume24h'],
                    'polyPrice': None,
                    'kalshiPrice': m['price'],
                    'kalshiBid': m.get('yesBid'),
                    'kalshiAsk': m.get('yesAsk'),
                    'tf': self._classify_tf(m.get('closeTime')),
                    '_endDate': m.get('closeTime'),
                    'source': 'kalshi',
                    '_kalshiTicker': m.get('ticker'),
                    'liquidity': m.get('liquidity', 0),
                    'isEvent': False,
                    'subCount': 0,
                    'subMarkets': None,
                })

        # Add chart quality score and sort by it (mid-range prices + high volume = top)
        for m in combined:
            m['_chartScore'] = self._chart_score(m.get('price', 50), m.get('_volNum', 0))
        combined.sort(key=lambda x: x.get('_chartScore', 0), reverse=True)
        return combined


# Singleton cache instance
market_cache = MarketCache()


# ═══════════════════════════════════════════════════════════════
# TRENDING KEYWORDS CACHE — detects keyword spikes from news
# ═══════════════════════════════════════════════════════════════

# Words too common to be meaningful
_STOP_WORDS = frozenset(
    'the a an and or but in on at to for of is it that this with from by as be '
    'are was were will can has have had not no do does did so if its he she they '
    'we you his her my your our their than more most very also been about into '
    'over such what which who how when where all each new after says said could '
    'would should may first one two will just get set still even much many these '
    'those out up per day year time some other being between through during before '
    'after against under here there why next back last own any us them make made '
    'like know take help try use let big top go need way well long full part great '
    'think come look good high going want give find tell work call both few every '
    'keep same another while must show old again off number since right change '
    'turn point small end move follow act began begin lead left late might put run '
    'does set plan state world week month today report according data key things '
    'people news now may man de la el en le di von der von del u k s t re'.split()
)


class TrendingCache:
    """Background-threaded cache that extracts trending keywords from news."""

    POLL_INTERVAL = 300   # 5 minutes
    HISTORY_LEN = 288     # Keep ~24 hours of readings
    MIN_HISTORY = 6       # Need 30 min of data before spike detection

    def __init__(self):
        self.lock = threading.Lock()
        self._keywords = []        # Current top keywords
        self._history = {}         # keyword -> [count_t0, count_t1, ...]
        self._last_update = 0
        self._thread = None

    def start(self):
        self._thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._thread.start()

    def get_data(self):
        with self.lock:
            readings = max((len(h) for h in self._history.values()), default=0)
            return {
                'keywords': self._keywords,
                'lastUpdate': self._last_update,
                'readings': readings,
                'minReadings': self.MIN_HISTORY,
            }

    def _poll_loop(self):
        while True:
            try:
                self._fetch_and_analyze()
            except Exception as e:
                sys.stderr.write(f"\033[31m[trending] Error: {e}\033[0m\n")
            time.sleep(self.POLL_INTERVAL)

    def _fetch_news_headlines(self, query=None):
        """Fetch headlines from Google News RSS."""
        if query:
            rss_url = (
                f'https://news.google.com/rss/search?q={urllib.parse.quote(query)}'
                f'&hl=en-US&gl=US&ceid=US:en'
            )
        else:
            # Top stories — unbiased baseline, not filtered by search query
            rss_url = 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en'
        req = urllib.request.Request(rss_url, headers={
            'User-Agent': 'Mozilla/5.0 Mercury/1.0',
            'Accept': 'application/xml',
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            xml_data = resp.read()
        root = ET.fromstring(xml_data)
        channel = root.find('channel')
        titles = []
        for item in (channel.findall('item') if channel is not None else []):
            title = item.findtext('title', '')
            title = html.unescape(re.sub(r'<[^>]+>', '', title))
            if title:
                titles.append(title)
            if len(titles) >= 30:
                break
        return titles

    def _extract_keywords(self, headlines):
        """Extract meaningful keyword counts from headlines."""
        counts = {}
        for h in headlines:
            # Clean and tokenize
            words = re.findall(r"[A-Za-z'\-]+", h)
            cleaned = []
            for w in words:
                wl = w.lower().strip("'-")
                if len(wl) < 3 or wl in _STOP_WORDS:
                    continue
                cleaned.append(wl)

            # Count unigrams
            for w in cleaned:
                counts[w] = counts.get(w, 0) + 1

            # Count bigrams (more specific, more meaningful)
            for i in range(len(cleaned) - 1):
                bigram = cleaned[i] + ' ' + cleaned[i + 1]
                counts[bigram] = counts.get(bigram, 0) + 1

        # Filter: only keep keywords that appear 3+ times
        return {k: v for k, v in counts.items() if v >= 3}

    @staticmethod
    def _categorize(kw):
        """Assign a category to a keyword for coloring/grouping."""
        kl = kw.lower()
        if any(t in kl for t in ('bitcoin', 'btc', 'crypto', 'ethereum', 'eth', 'coin')):
            return 'crypto'
        if any(t in kl for t in ('trump', 'election', 'congress', 'senate', 'democrat', 'republican', 'politic', 'vote', 'biden', 'president')):
            return 'politics'
        if any(t in kl for t in ('fed', 'rate', 'inflation', 'cpi', 'gdp', 'recession', 'treasury', 'economy', 'tariff', 'trade war')):
            return 'econ'
        if any(t in kl for t in ('nvidia', 'openai', 'gpt', 'claude', 'artificial', 'intelligence')):
            return 'ai'
        if any(t in kl for t in ('ukraine', 'china', 'taiwan', 'iran', 'nato', 'war', 'ceasefire', 'russia')):
            return 'geopolitics'
        if any(t in kl for t in ('nba', 'nfl', 'super bowl', 'world cup', 'sport', 'mlb')):
            return 'sports'
        return 'general'

    def _fetch_and_analyze(self):
        """Fetch news, extract keywords, detect spikes."""
        queries = [
            None,  # Google News top stories (unbiased baseline)
            'prediction market polymarket kalshi',
            'bitcoin crypto ethereum solana',
            'elections politics congress federal reserve',
            'AI artificial intelligence technology nvidia openai',
            'geopolitics war trade tariff sanctions',
            'economy inflation GDP jobs market stocks',
        ]

        all_headlines = []
        errors = {}

        def fetch_q(q):
            try:
                titles = self._fetch_news_headlines(q)
                all_headlines.extend(titles)
            except Exception as e:
                errors[q[:20]] = str(e)

        threads = [threading.Thread(target=fetch_q, args=(q,)) for q in queries]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=12)

        if not all_headlines:
            return

        keyword_counts = self._extract_keywords(all_headlines)

        with self.lock:
            # Update history
            for kw, count in keyword_counts.items():
                if kw not in self._history:
                    self._history[kw] = []
                self._history[kw].append(count)
                if len(self._history[kw]) > self.HISTORY_LEN:
                    self._history[kw] = self._history[kw][-self.HISTORY_LEN:]

            # Decay: remove keywords not seen this round
            for kw in list(self._history.keys()):
                if kw not in keyword_counts:
                    self._history[kw].append(0)
                    if len(self._history[kw]) > self.HISTORY_LEN:
                        self._history[kw] = self._history[kw][-self.HISTORY_LEN:]
                    # Remove if dead for 6+ readings
                    if all(c == 0 for c in self._history[kw][-6:]):
                        del self._history[kw]

            # Build results with spike detection
            results = []
            for kw, count in sorted(keyword_counts.items(), key=lambda x: x[1], reverse=True)[:50]:
                hist = self._history.get(kw, [count])
                prior = hist[:-1] if len(hist) > 1 else []

                # Change from previous reading
                prev_count = prior[-1] if prior else count
                change = count - prev_count

                if len(prior) >= self.MIN_HISTORY:
                    avg = sum(prior) / len(prior)
                    # Standard deviation for statistical significance
                    variance = sum((x - avg) ** 2 for x in prior) / len(prior)
                    stddev = variance ** 0.5
                    spike_pct = ((count - avg) / max(avg, 1)) * 100
                    # Only flag as spike if beyond 1.5 std devs AND > 75%
                    if spike_pct > 75 and count > avg + 1.5 * max(stddev, 0.5):
                        trend = 'up'
                    elif spike_pct < -40:
                        trend = 'down'
                    else:
                        trend = 'flat'
                else:
                    # Not enough history — don't claim any trend
                    spike_pct = 0
                    trend = 'flat'

                results.append({
                    'keyword': kw,
                    'count': count,
                    'change': change,
                    'trend': trend,
                    'spikePct': round(spike_pct),
                    'category': self._categorize(kw),
                })

            self._keywords = results
            self._last_update = int(time.time() * 1000)

        err_str = f" (errors: {errors})" if errors else ""
        sys.stderr.write(
            f"\033[35m[trending]\033[0m {len(results)} keywords "
            f"from {len(all_headlines)} headlines{err_str}\n"
        )


trending_cache = TrendingCache()


# ═══════════════════════════════════════════════════════════════
# PROXY RESPONSE CACHE — shared across all users
# Caches chart history / candlestick responses for 60s
# ═══════════════════════════════════════════════════════════════

class ProxyCache:
    """Simple TTL cache for proxy responses — avoids repeated external API calls."""
    TTL = 60  # seconds

    def __init__(self):
        self.lock = threading.Lock()
        self._store = {}  # url -> (data_bytes, timestamp)

    def get(self, url):
        with self.lock:
            entry = self._store.get(url)
            if entry and time.time() - entry[1] < self.TTL:
                return entry[0]
            return None

    def put(self, url, data):
        with self.lock:
            self._store[url] = (data, time.time())
            # Evict old entries if cache grows too large
            if len(self._store) > 200:
                cutoff = time.time() - self.TTL
                self._store = {k: v for k, v in self._store.items() if v[1] > cutoff}

proxy_cache = ProxyCache()


# ═══════════════════════════════════════════════════════════════
# HTTP HANDLER
# ═══════════════════════════════════════════════════════════════

PROXY_ROUTES = {
    '/proxy/polymarket/': 'https://gamma-api.polymarket.com/',
    '/proxy/polymarket-clob/': 'https://clob.polymarket.com/',
    '/proxy/kalshi/': 'https://api.elections.kalshi.com/trade-api/v2/',
}


class MercuryHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def do_GET(self):
        # ── Cached market data endpoint ──
        if self.path == '/api/markets':
            return self._serve_markets()

        # ── Trending keywords endpoint ──
        if self.path == '/api/trending':
            return self._serve_trending()

        # ── News RSS proxy ──
        if self.path.startswith('/proxy/news'):
            return self._proxy_news()

        # ── Passthrough proxy (for chart history, candlesticks, etc.) ──
        for prefix, target_base in PROXY_ROUTES.items():
            if self.path.startswith(prefix):
                remote_path = self.path[len(prefix):]
                target_url = target_base + remote_path
                return self._proxy(target_url)

        # ── Static files ──
        return super().do_GET()

    def _serve_markets(self):
        data = market_cache.get_data()
        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'max-age=5')
        self.end_headers()
        self.wfile.write(body)

    def _serve_trending(self):
        data = trending_cache.get_data()
        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'max-age=30')
        self.end_headers()
        self.wfile.write(body)

    def _proxy(self, url):
        # Check server-side proxy cache first (shared across all users)
        cached = proxy_cache.get(url)
        if cached:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'max-age=15')
            self.end_headers()
            self.wfile.write(cached)
            return
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'Mozilla/5.0 Mercury/1.0',
                'Accept': 'application/json',
            })
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = resp.read()
                # Cache successful responses (chart history, candlesticks)
                if resp.status == 200 and len(data) < 500_000:
                    proxy_cache.put(url, data)
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
        try:
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
        msg = format % args
        if '/api/' in msg or '/proxy/' in msg:
            sys.stderr.write(f"\033[36m[http]\033[0m {msg}\n")


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


if __name__ == '__main__':
    print(f"\n  Mercury Dev Server")
    print(f"  http://localhost:{PORT}")
    print(f"  /api/markets  — cached market data (updates every {POLL_INTERVAL}s)")
    print(f"  /api/trending — trending keyword spikes (updates every 5m)")
    print(f"  /proxy/*      — passthrough for chart history")
    print(f"  Press Ctrl+C to stop\n")

    # Start background polling
    market_cache.start()
    trending_cache.start()

    server = ThreadedHTTPServer(('0.0.0.0', PORT), MercuryHandler)

    def shutdown_handler(sig, frame):
        print("\nShutting down...")
        server.server_close()
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown_handler)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()
