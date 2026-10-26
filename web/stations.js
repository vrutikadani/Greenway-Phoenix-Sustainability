/* City of Phoenix public drop-off sites (from the 2024 project data).
   Hours are minutes after midnight, Arizona time. Check phoenix.gov before relying on them. */
(function (root) {
  const HOLIDAYS = [
    "Martin Luther King Jr. Day", "Presidents' Day", "Cesar Chavez Day", "Memorial Day", "Juneteenth",
    "Independence Day", "Labor Day", "Indigenous Peoples' Day", "Veterans Day",
    "Thanksgiving and the day after", "Christmas", "New Year's Day",
    "Christmas Eve: open 6 a.m. to 12 p.m.", "New Year's Eve: regular hours",
  ];
  const HOURS = { weekday: [330, 1020], saturday: [360, 900], sunday: null }; // 5:30a-5p, 6a-3p, closed

  const stations = [
    { id: 'NG', name: 'North Gateway Transfer Station', address: '30205 N Black Canyon Hwy, Phoenix, AZ 85085',
      lat: 33.7605925, lon: -112.1163813, hours: HOURS, holidays: HOLIDAYS },
    { id: '27', name: '27th Avenue Transfer Station', address: '3060 S 27th Ave, Phoenix, AZ 85009',
      lat: 33.4169941, lon: -112.1186168, hours: HOURS, holidays: HOLIDAYS },
    { id: 'SR', name: 'SR-85 Landfill', address: '28361 W Patterson Rd, Buckeye, AZ 85326',
      lat: 33.1890375, lon: -112.6686124, hours: HOURS, holidays: HOLIDAYS },
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = stations;
  else root.STATIONS = stations;
})(typeof window !== 'undefined' ? window : globalThis);
