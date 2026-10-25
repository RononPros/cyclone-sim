# cyclone-sim
A p5.js tropical cyclone simulation game

Raptor Mod 0.21.0 broadens cyclone wind fields, reduces city-label crowding in
China, and adds independent display switches for cities and storm-wind shading.

City dots sit near representative real city locations on Earth basin maps. Their
numeric wind labels are visible by default; units follow Settings. Open the
in-game Menu to switch City winds and Cyclone wind field between Shown and Hidden.
The city layer defaults to shown and the heatmap to hidden; both choices are
remembered in browser settings. Hiding either layer leaves winds and hourly
impacts active. Hidden city dots have no click targets or open detail card. Between
cyclones they show ordinary background surface winds. Names are shown only in a detail card
opened by clicking/tapping a dot or its number. The card shows estimated local
one-minute sustained wind, peak recorded wind, hours at 34 kt or above, and
simulated damage/deaths in the nearby area. Historical city observations are
retained after tracking begins. City coordinates and source notes: [CITY_DATA.md](CITY_DATA.md).
Synthetic maps generate unnamed settlements on their own land.
Chinese city labels have 36-unit display spacing, retaining the largest eligible
locations first. Other countries keep their existing dots. This only filters the
display: all 821 catalogue entries, existing tracked cities, city histories and
the impact exposure grid are retained.

Background surface wind has its own seeded environmental noise channels, varies
with location, season and simulated time, and saves its state with the other
environmental fields. Low-level steering supplies direction rather than a
map-units/hour-to-surface-speed conversion. A weather-dependent jet-corridor
boost adds up to 6 kt, tapering with distance over a 500 km scale. It is a game
climatology adjustment, not direct transfer of upper-level jet speed to the ground.
Background winds are capped at 25 kt
before terrain reduction, below the destructive-wind threshold in this game.
The displayed local speed is the stronger of background and cyclone wind;
scalar wind speeds are not added together. The Background wind (open terrain)
map layer shows the unreduced field; city readings include local terrain reduction.
Missing legacy background archives show an em dash where the background could
change the total and no archived city observation is available.

The shared cyclone footprint uses spherical distance, a persistent storm-size
factor, a radius of maximum wind, an inner core, outer decay and terrain
reduction. It is a simplified symmetric game model, not an operational forecast.
The outer power-law decay is broader in 0.21.0 (exponent 0.50 for tropical and
subtropical systems, 0.45 otherwise), with a smooth cutoff at 600–3000 km depending
on intensity, type and saved storm size. Peak wind and radius of maximum wind
retain their previous definitions. The optional cyclone heatmap samples these
same terrain-adjusted winds over land and water from 17 kt upward. It excludes
background winds, follows the selected analysis time, refreshes after paused
storm edits, and keeps tracks, icons and city readouts above its shading.
The same local wind calculation drives cities, Human Risk and a 6-unit land
exposure grid. Rainfall, flooding and storm surge are not modeled by this feature.

Impacts accrue once per simulated hour, regardless of centre landfall. Each land
cell is attributed to the strongest local storm; wind magnitudes are not added
together. Damage reduces a finite simulated asset pool and fatalities reduce a
finite simulated population pool, retaining fractional mortality until an integer
is reached. City-area totals are allocations from this grid, not extra impacts.
Regional totals follow the affected land's sub-basin; existing tropical
centre-crossing landfalls are counted separately. Pre-classification impacts survive later TC formation.

Cell loss state, city observations and storm size persist across save/reload.
Older saves retain existing storm/season totals and begin new local tracking at
the loaded hour. Earlier local impacts are unavailable, not reconstructed. Wind
estimates before tracking use the simulator's existing six-hour advisory data.
City area totals and cell depletion span the saved basin's lifetime; regional
season statistics receive only new hourly increments. Rendering cannot create
impacts, and repeated processing of the same hour is ignored.

The 0.19.0 temperature editor and earlier environmental improvements remain:

New Basin → Advanced has a Global SST adjustment slider (-5 to +5°C, 0.1°C
steps). During a simulation, open the side menu → Temperature Editor. Opening
the editor pauses the simulation; edits are available only at the present.
Choose Warm or Cold and click/drag over the ocean to place a stationary bubble.
Use Select / Move to drag an existing bubble, or Next to cycle through bubbles.
The anomaly slider changes its centre strength (-10 to +10°C); the radius slider
changes its reach (100–2500 km). Delete and Undo support experimentation.

Bubbles taper smoothly to zero at their radius using `1 - 3q² + 2q³`, where
`q` is spherical distance divided by radius. Global and local adjustments add to
the existing anomaly field exactly once, so actual SST, anomaly displays and
storm physics agree. Seasonal and procedural variability continue normally.
Bubble outlines can be shown/hidden in the editor or side menu, independently
of their physical effects. Up to 64 bubbles can be active at once.

Adjustments and visibility save with each basin; old saves default to zero and
no bubbles. Edits take effect at their simulated hour, and earlier analysis
views retain the adjustment that existed then. Undo records a new edit at the
present rather than erasing history. The last 50 edits can be undone during the
current session. Bubbles remain stationary until edited or deleted.

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

