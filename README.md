# cyclone-sim
A p5.js tropical cyclone simulation game

Raptor Mod 0.18.1 adds reproducible environmental seeds to the land-interaction
and Pacific-shear changes from 0.18.0.

Land interaction samples the existing terrain in three distance zones: 0–50 km
(60% weight), 50–100 km (30%) and 100–200 km (10%). Samples use spherical
distances, including across the dateline, and ignore unknown terrain beyond
synthetic map edges. These fixed sampling zones are tunable game parameters;
they are not diagnosed eyewall or wind-field radii.

Effective land influence adjusts toward the sampled coverage over a three-hour
response time. Ocean support is `1 - influence^1.5`; organization also gradually
erodes with land exposure and terrain. Pressure and wind respond through the
existing storm physics. Recovery, RI tiers and manual-low assistance use the same
influence. New storms and older saves initialize from their actual footprint;
the current influence and consecutive contact hours persist in active saves.

Storm Debug shows coverage versus effective influence, coverage in each zone,
consecutive exposure hours, and ocean versus land-adjusted pressure potential.
Contact hours reset when current weighted coverage falls below 1%; the residual
influence still eases gradually as a storm returns offshore.

Normal Eastern and Western Pacific shear is calibrated toward the Atlantic's
typical tropical-belt magnitude over 8–26°N. Seasonal multipliers range from
0.34 to 0.57 of stock shear in that belt and fade toward unchanged values at
45° latitude. Vector direction, steering and procedural variability are retained.
Calm inherits this correction and then applies its 10% shear increase. These are
game-balancing values, not a real-world climatology or an exact per-location match.

Run the headless regression checks with Node.js:

```sh
node --test tests/*.test.js
```

Environmental noise channels have independent seeded random streams. With the
same basin seed, map and mode, new basins reproduce their starting environment
and its subsequent evolution. Player actions and storm-related random calls do
not change these streams. Their saved RNG state resumes after reload. Older saves
keep their existing fields and begin a deterministic continuation from that saved
state; they are not rewritten to match a freshly generated basin. Individual storm
spawning and intensity randomness are still stochastic.

Search the first simulated year for strong positive SST anomalies:

```sh
node scripts/find-hot-seeds.js --count 10000 --workers 4 --year 2026 --output scripts/seed-results/wpac-normal-first-year.json
```

This searches Normal / Western Pacific using the 957 ocean cells on the displayed
20-unit grid, generated from the bundled Earth map. It stops at the next calendar
year boundary: 8,760 hours for 2026. Initial screening samples every 28 days; the
top 50 candidates per ranking are refined daily, then the top five per ranking
are refined hourly. Both the largest anomaly anywhere over water and the largest
tropical anomaly (5–30°N) are reported, with actual SST, coordinates and UTC time.
Results are the strongest found by this finite, staged search, not guaranteed
global maxima over every seed or every point between map cells.

