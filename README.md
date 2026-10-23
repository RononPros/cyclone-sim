# cyclone-sim
A p5.js tropical cyclone simulation game

Raptor Mod 0.18.0 adds circulation-wide land interaction and Pacific shear balancing.

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

