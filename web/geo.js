/* Pure helpers: no DOM, no network. Unit-tested in tests/geo.test.js. */
(function (root) {
  const EARTH_MILES = 3958.8;
  const PHOENIX_BBOX = { south: 33.29, north: 33.92, west: -112.34, east: -111.92 };

  function haversineMiles(a, b) {
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_MILES * Math.asin(Math.sqrt(h));
  }

  function inPhoenix(point) {
    const b = PHOENIX_BBOX;
    return point.lat >= b.south && point.lat <= b.north && point.lon >= b.west && point.lon <= b.east;
  }

  /** Sort stations by straight-line distance (used as a fallback when routing is unavailable). */
  function rankByDistance(origin, stations) {
    return stations
      .map((s) => ({ ...s, straightMiles: haversineMiles(origin, s) }))
      .sort((x, y) => x.straightMiles - y.straightMiles);
  }

  /** Normalize an address for matching: lower case, single spaces, common suffixes shortened. */
  function normalizeAddress(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[.,#]/g, ' ')
      .replace(/\bstreet\b/g, 'st').replace(/\bavenue\b/g, 'ave').replace(/\broad\b/g, 'rd')
      .replace(/\bdrive\b/g, 'dr').replace(/\bboulevard\b/g, 'blvd').replace(/\blane\b/g, 'ln')
      .replace(/\bnorth\b/g, 'n').replace(/\bsouth\b/g, 's').replace(/\beast\b/g, 'e').replace(/\bwest\b/g, 'w')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Minimal CSV parser that respects quoted commas (the original split(',') broke on them). */
  function parseCsv(text) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const header = rows.shift().map((h) => h.trim());
    return rows.filter((r) => r.some((v) => v.trim())).map((r) =>
      Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])));
  }

  /** Is a station open at `date`? Phoenix stays on UTC-7 all year (no daylight saving). */
  function openStatus(station, date = new Date()) {
    const az = new Date(date.getTime() - 7 * 3600 * 1000);
    const day = az.getUTCDay();          // 0 = Sunday
    const minutes = az.getUTCHours() * 60 + az.getUTCMinutes();
    const window = day === 0 ? station.hours.sunday : day === 6 ? station.hours.saturday : station.hours.weekday;
    if (!window) return { open: false, label: 'Closed today' };
    const [start, end] = window;
    if (minutes < start) return { open: false, label: `Opens at ${fmt(start)}` };
    if (minutes >= end) return { open: false, label: 'Closed for the day' };
    return { open: true, label: `Open now · closes ${fmt(end)}` };
  }

  function fmt(mins) {
    const h = Math.floor(mins / 60), m = mins % 60;
    const ap = h >= 12 ? 'p.m.' : 'a.m.';
    const h12 = ((h + 11) % 12) + 1;
    return m ? `${h12}:${String(m).padStart(2, '0')} ${ap}` : `${h12} ${ap}`;
  }

  const api = { haversineMiles, inPhoenix, rankByDistance, normalizeAddress, parseCsv, openStatus, fmt, PHOENIX_BBOX };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Geo = api;
})(typeof window !== 'undefined' ? window : globalThis);
