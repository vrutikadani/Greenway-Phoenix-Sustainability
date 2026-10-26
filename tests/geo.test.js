// node --test tests/geo.test.js
const test = require('node:test');
const assert = require('node:assert');
const Geo = require('../web/geo.js');
const STATIONS = require('../web/stations.js');

const downtown = { lat: 33.4484, lon: -112.074 };

test('haversine: downtown Phoenix to the 27th Ave station is about 3 miles', () => {
  const s = STATIONS.find((x) => x.id === '27');
  const d = Geo.haversineMiles(downtown, s);
  assert.ok(d > 2 && d < 4, `got ${d}`);
});

test('rankByDistance puts the closest station first', () => {
  assert.equal(Geo.rankByDistance(downtown, STATIONS)[0].id, '27');
  assert.equal(Geo.rankByDistance({ lat: 33.72, lon: -112.1 }, STATIONS)[0].id, 'NG');
});

test('inPhoenix accepts downtown and rejects Tucson', () => {
  assert.ok(Geo.inPhoenix(downtown));
  assert.ok(!Geo.inPhoenix({ lat: 32.2226, lon: -110.9747 }));
});

test('normalizeAddress makes spelling variants match', () => {
  assert.equal(Geo.normalizeAddress('200 West Washington Street, Phoenix'), Geo.normalizeAddress('200 W washington st phoenix'));
});

test('parseCsv keeps quoted commas inside one cell', () => {
  const rows = Geo.parseCsv('Id,Address,Service_Area\n1,"200 W Washington St, Phoenix, AZ 85003",Central\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].Address, '200 W Washington St, Phoenix, AZ 85003');
  assert.equal(rows[0].Service_Area, 'Central');
});

test('openStatus uses Arizona time (UTC-7) and the weekly hours', () => {
  const s = STATIONS[0];
  // Wed 2026-10-21 10:00 AZ = 17:00 UTC -> open
  assert.equal(Geo.openStatus(s, new Date(Date.UTC(2026, 9, 21, 17, 0))).open, true);
  // Wed 05:00 AZ -> not yet open
  assert.match(Geo.openStatus(s, new Date(Date.UTC(2026, 9, 21, 12, 0))).label, /Opens at 5:30 a\.m\./);
  // Sat 16:00 AZ -> closed (Saturday ends 3 p.m.)
  assert.equal(Geo.openStatus(s, new Date(Date.UTC(2026, 9, 24, 23, 0))).open, false);
  // Sunday -> closed all day
  assert.equal(Geo.openStatus(s, new Date(Date.UTC(2026, 9, 25, 18, 0))).label, 'Closed today');
});
