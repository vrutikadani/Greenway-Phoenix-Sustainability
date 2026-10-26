/* Greenway UI: find the closest City of Phoenix drop-off site and drive there.
   No API keys: OpenStreetMap Nominatim for geocoding, the public OSRM server for driving routes. */
(function () {
  const { haversineMiles, inPhoenix, rankByDistance, normalizeAddress, parseCsv, openStatus } = window.Geo;
  const STATIONS = window.STATIONS;
  const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  const OSRM = 'https://router.project-osrm.org/route/v1/driving';
  const BULK_TRASH = 'https://www.phoenix.gov/publicworks/bulktrash';
  const $ = (id) => document.getElementById(id);

  // ---------- map ----------
  const map = L.map('map', { zoomControl: false }).setView([33.48, -112.2], 10);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const pin = (color, glyph) => L.divIcon({
    className: '', iconSize: [30, 40], iconAnchor: [15, 38], popupAnchor: [0, -34],
    html: `<svg viewBox="0 0 30 40" width="30" height="40"><path d="M15 1C7.3 1 1 7.2 1 14.9 1 25.4 15 39 15 39s14-13.6 14-24.1C29 7.2 22.7 1 15 1z" fill="${color}" stroke="#fff" stroke-width="2"/><text x="15" y="19" text-anchor="middle" font-size="12" font-family="system-ui" fill="#fff">${glyph}</text></svg>`,
  });
  const stationLayer = L.layerGroup().addTo(map);
  STATIONS.forEach((s) => L.marker([s.lat, s.lon], { icon: pin('#355E3B', '♻') })
    .bindPopup(`<strong>${s.name}</strong><br>${s.address}`).addTo(stationLayer));
  let userMarker = null, routeLayer = null;

  // Optional city boundary (drop City_Limit_Dark_Outline.geojson into web/data/ to show it).
  fetch('data/City_Limit_Dark_Outline.geojson').then((r) => (r.ok ? r.json() : null)).then((gj) => {
    if (gj) L.geoJSON(gj, { style: { color: '#355E3B', weight: 2, fillOpacity: 0.03 } }).addTo(map);
  }).catch(() => {});

  // Optional service-address file from Phoenix Open Data (web/data/active-service-addresses.csv).
  // When present, addresses are validated against it and the service area is shown.
  let serviceIndex = null;
  fetch('data/active-service-addresses.csv').then((r) => (r.ok ? r.text() : null)).then((txt) => {
    if (!txt) return;
    serviceIndex = new Map(parseCsv(txt).map((row) => [normalizeAddress(row.Address), row.Service_Area]));
  }).catch(() => {});

  // ---------- helpers ----------
  function setStatus(msg, kind = 'info') {
    const el = $('status');
    el.textContent = msg;
    el.className = `status ${kind}`;
    el.hidden = !msg;
  }

  async function geocode(address) {
    const b = window.Geo.PHOENIX_BBOX;
    const url = `${NOMINATIM}?format=json&addressdetails=1&limit=1&countrycodes=us` +
      `&viewbox=${b.west - 0.6},${b.north + 0.2},${b.east + 0.3},${b.south - 0.3}&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('The address lookup service is busy. Try again in a moment.');
    const [hit] = await res.json();
    if (!hit) return null;
    return { lat: +hit.lat, lon: +hit.lon, label: hit.display_name, city: hit.address?.city || hit.address?.town || '' };
  }

  async function route(from, to) {
    const url = `${OSRM}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('routing unavailable');
    const data = await res.json();
    if (!data.routes?.length) throw new Error('no route');
    const r = data.routes[0];
    return {
      miles: r.distance / 1609.344,
      minutes: r.duration / 60,
      geometry: r.geometry,
      steps: r.legs[0].steps.map((s) => describeStep(s)).filter(Boolean),
    };
  }

  function describeStep(s) {
    const m = s.maneuver;
    const road = s.name || 'the road';
    const dist = s.distance > 160 ? ` for ${(s.distance / 1609.344).toFixed(1)} mi` : '';
    if (m.type === 'depart') return `Head ${m.bearing_after ? compass(m.bearing_after) : ''} on ${road}${dist}`.replace('  ', ' ');
    if (m.type === 'arrive') return 'Arrive at the drop-off site';
    const turn = m.modifier ? `${m.type === 'turn' ? 'Turn' : capitalize(m.type)} ${m.modifier}` : capitalize(m.type);
    return `${turn} onto ${road}${dist}`;
  }
  const compass = (deg) => ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(deg / 45) % 8];
  const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ');

  // ---------- main flow ----------
  async function findNearest(evt) {
    evt?.preventDefault();
    const address = $('address').value.trim();
    if (!address) return setStatus('Enter a street address in Phoenix.', 'warn');
    $('go').disabled = true;
    $('result').hidden = true;
    setStatus('Finding your address…');

    try {
      if (serviceIndex && !serviceIndex.has(normalizeAddress(address))) {
        setStatus('That address is not on the City of Phoenix service list. Check the spelling, or include the ZIP.', 'warn');
      }
      const home = await geocode(address);
      if (!home) return setStatus("We couldn't find that address. Try adding the ZIP code.", 'warn');
      if (!inPhoenix(home) && !/phoenix/i.test(home.city)) {
        return setStatus('That address looks outside Phoenix. Greenway covers City of Phoenix residents.', 'warn');
      }

      if (userMarker) userMarker.remove();
      userMarker = L.marker([home.lat, home.lon], { icon: pin('#4C9AD8', '●') }).addTo(map)
        .bindTooltip('Your address', { direction: 'top', offset: [0, -34] });

      setStatus('Comparing driving routes to each site…');
      let ranked;
      try {
        const routes = await Promise.all(STATIONS.map((s) => route(home, s).then((r) => ({ ...s, ...r }))));
        ranked = routes.sort((a, b) => a.miles - b.miles);
      } catch {
        // Routing server down: fall back to straight-line distance so the user still gets an answer.
        ranked = rankByDistance(home, STATIONS).map((s) => ({ ...s, miles: s.straightMiles, steps: [], approx: true }));
      }
      const best = ranked[0];
      render(home, best, ranked);
      setStatus('');
    } catch (err) {
      setStatus(err.message || 'Something went wrong. Please try again.', 'error');
    } finally {
      $('go').disabled = false;
    }
  }

  function render(home, s, ranked) {
    if (routeLayer) routeLayer.remove();
    if (s.geometry) {
      routeLayer = L.geoJSON(s.geometry, { style: { color: '#355E3B', weight: 5, opacity: 0.85 } }).addTo(map);
      map.fitBounds(routeLayer.getBounds(), { padding: [40, 40] });
    } else {
      map.fitBounds([[home.lat, home.lon], [s.lat, s.lon]], { padding: [60, 60] });
    }

    const status = openStatus(s);
    const area = serviceIndex?.get(normalizeAddress($('address').value));
    $('result').innerHTML = `
      <div class="eyebrow">Closest drop-off site</div>
      <h2>${s.name}</h2>
      <p class="addr">${s.address}</p>
      <div class="stats">
        <div><span>${s.miles.toFixed(1)} mi</span><small>${s.approx ? 'straight line' : 'driving'}</small></div>
        ${s.minutes ? `<div><span>${Math.round(s.minutes)} min</span><small>drive time</small></div>` : ''}
        <div><span class="${status.open ? 'open' : 'closed'}">${status.open ? 'Open' : 'Closed'}</span><small>${status.label}</small></div>
      </div>
      ${area ? `<p class="meta">Your service area: <strong>${area}</strong></p>` : ''}
      <details open><summary>Hours</summary>
        <p>Mon–Fri 5:30 a.m.–5 p.m. · Sat 6 a.m.–3 p.m. · Sun closed</p></details>
      <details><summary>Closed on these holidays</summary><ul>${s.holidays.map((h) => `<li>${h}</li>`).join('')}</ul></details>
      ${s.steps.length ? `<details><summary>Turn-by-turn directions</summary><ol>${s.steps.map((t) => `<li>${t}</li>`).join('')}</ol></details>` : ''}
      <details><summary>Other sites</summary><ul>${ranked.slice(1).map((o) => `<li>${o.name}: ${o.miles.toFixed(1)} mi</li>`).join('')}</ul></details>
      <a class="link" href="${BULK_TRASH}" target="_blank" rel="noopener">Check your bulk trash collection week →</a>
      <a class="link" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.address)}" target="_blank" rel="noopener">Open in Google Maps →</a>`;
    $('result').hidden = false;
  }

  $('search').addEventListener('submit', findNearest);
  document.querySelectorAll('[data-example]').forEach((b) =>
    b.addEventListener('click', () => { $('address').value = b.dataset.example; findNearest(); }));
})();
