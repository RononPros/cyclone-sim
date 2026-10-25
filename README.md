# cyclone-sim
A p5.js tropical cyclone simulation game

Raptor Mod 0.24.0 adds estimated short wind gusts, smaller city labels and
independent city/heatmap value controls. The 0.23.0 Atlantic steering update remains.

City labels use 9-unit text and 12-unit-high tags (previously 10 and 14), with
measured text widths, tighter padding and retained click/touch targets. Menu →
City values cycles Wind, Gusts and Wind + gusts; the default is both, e.g.
`85 G110`. All numbers use the wind unit selected in Settings; `G` identifies the
estimated 3-second gust. City cards always include both local values and their
recorded peaks. Menu → Field values independently switches the optional cyclone
heatmap between sustained wind and estimated gusts. The two value modes and the
existing layer visibility switches persist in browser settings.

Gusts are calculated from the local one-minute sustained wind **after** radial
decay, motion asymmetry, land friction and directional terrain shelter. The gust
factor is 1.25–1.45 over land and 1.15–1.30 over water. These are tunable game
ranges, informed by [short-gust conversion research](https://www.aoml.noaa.gov/hrd/Powell/ASOS.pdf),
not a detailed turbulence model or a measured roughness map. Land/water is the
only exposure distinction; higher elevation does not automatically raise the
gust factor. Two smooth spherical waves with 36- and 17-hour periods provide
spatially coherent variation; their phase comes from basin seed without random
draws. Thus values are stable while paused and reproduce across reloads, including
at the dateline. Ordinary background weather receives gust estimates too.
Hourly simulation steps estimate brief gusts rather than resolving second-scale
bursts. The cyclone heatmap continues to exclude ordinary background weather.

Hourly city records now retain gust and peak gust alongside sustained wind and
area impacts (impact-record version 2). Version-1 saves and six-column city
history rows migrate without resetting wind observations, exposure or losses;
gusts unavailable in those old observations remain unknown. New gust peaks begin
when the updated simulation first records them. Rendering and display switches
cannot create records or damage. Cyclone categories, Human Risk and the existing
sustained-wind impact calculation are unchanged by the gust estimates.

Raptor Mod 0.23.0 added varied Atlantic Gulf steering through a seeded, shifting
subtropical ridge and passing troughs. The 0.22.0 asymmetric winds, directional
terrain shelter, stronger extreme-storm winds and finer core shading remain.

Normal and Calm Atlantic maps now let the western edge of the Bermuda/Azores
ridge extend west or retreat east. West of that edge, easterly steering relaxes
and northward flow strengthens. Broad troughs travel eastward every 8–12 days,
with event strengths varying by seed and stronger seasonal influence in autumn
and winter. Their southern/eastern flank can draw Gulf storms north or northeast;
westward tracks remain possible during blocking ridge patterns.
This is a tunable game approximation of [ridge and trough steering](https://www.aoml.noaa.gov/hrd/tcfaq/G5.html),
not a calibration to observed Gulf track percentages or a pressure-field solver.

The added synoptic flow blends smoothly over the Gulf and western Atlantic,
fading across 17–23°N, 35–43°N, 106–99°W and 63–53°W. Low- and upper-level winds
receive the same addition, preserving their shear difference from this component
while both shallow and deep storms respond. Tropical Caribbean trade winds and
the existing seasonal jet remain. Other basin maps and modes retain their prior
steering. Hourly storm movement and the five-day track forecast read the same fields.
Forecast environmental noise still uses the simulator's existing extrapolation.

Synoptic phases are derived from basin seed and absolute simulated time without
advancing random streams. Saves resume the same phases without additional saved
state. Existing basins adopt the update when loaded; steering field versions mark
older environmental reconstructions as changed, while recorded storm tracks,
city observations and impact totals stay recorded.

City dots sit near representative real city locations on Earth basin maps. Their
numeric wind/gust labels are visible by default; units follow Settings. Open the
in-game Menu to switch City winds and Cyclone wind field between Shown and Hidden.
The city layer defaults to shown and the heatmap to hidden; both choices are
remembered in browser settings. Hiding either layer leaves winds and hourly
impacts active. Hidden city dots have no click targets or open detail card. Between
cyclones they show ordinary background surface winds. Names are shown only in a detail card
opened by clicking/tapping a dot or its number. The card shows estimated local
one-minute sustained wind, estimated gust, both recorded peaks, hours at 34 kt or above, and
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
The local sustained speed is the stronger of background and cyclone wind;
scalar wind speeds are not added together. The Background wind (open terrain)
map layer shows the unreduced field; city readings include local terrain reduction.
Missing legacy background archives show an em dash where the background could
change the total and no archived city observation is available.

The shared cyclone footprint uses spherical distance, a persistent storm-size
factor, a radius of maximum wind, an inner core, outer decay, storm motion and
terrain shelter. It is a simplified game model, not an operational forecast.
Terrain wind reduction starts at about 5% near sea level and grows smoothly to
35% over the highest mapped terrain. The elevation response is gentler in
lowlands and hills. Directional shelter additionally checks higher ground at
5–200 km upwind of the local airflow. Barrier strength fades with distance and
can remove at most another 38% of the wind. Equal-height plains add no barrier;
shelter can extend over coastal water downwind of higher land. Thirty-two cached
upwind bearings interpolate smoothly as direction changes. Synthetic maps ignore
unknown terrain outside their edges. This approximates sheltering; it does not
model ridge acceleration, gap jets, downslope windstorms or building roughness.
The same local terrain response feeds background winds, cyclone winds, cities,
wind shading, Human Risk and hourly impacts.
The outer power-law decay is broader in 0.21.0 (exponent 0.50 for tropical and
subtropical systems, 0.45 otherwise), with a smooth cutoff at 600–3000 km depending
on intensity, type and saved storm size. Above 200 km/h the eyewall radius stops
contracting with intensity, so a rising maximum strengthens the outer field
instead of nearly cancelling itself. The independent size factor still permits
compact and large storms at the same intensity.

Storm motion comes from hourly geographic displacement, converted to east/north
knots, with a 100 kt sanity bound. A motion contribution of 65% of that speed,
capped at 30% of the reported maximum, redistributes the circulation. The two
vector components share the radial taper; their strongest possible combination
equals the storm's reported maximum. Circulation reverses in southern basins and
has a 15-degree inward flow angle. Motion generally favours the right side in the
northern hemisphere and the left in the southern hemisphere. These are tunable
game parameters; see [NOAA's motion explanation](https://www.aoml.noaa.gov/hrd/tcfaq/D6.html).
Exact motion components persist in active saves and advisory records. Older
advisories estimate motion from their preceding six-hour track segment; a lone
old advisory defaults to stationary. Saved city observations and impact totals
remain their recorded values.

The optional cyclone heatmap samples these same local winds, or their estimated
gusts, over land and water from 17 kt upward in the selected measure. Its base
grid is 8 map units, refining to 2 and 1 near strong
cores, with extra extreme colours at 170 and 210 kt (about 315 and 389 km/h).
It excludes background winds, follows the selected analysis time, refreshes after
paused storm or motion edits, and keeps tracks, icons and city readouts above
its shading. Hiding it keeps the wind physics and impacts active.
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

