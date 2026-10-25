# City locations

Made with Natural Earth. The city catalogue uses the public-domain Natural Earth
1:50m populated places dataset at commit `ca96624a56bd078437bca8184e78163e5039ad19`.

Source: https://github.com/nvkelso/natural-earth-vector/blob/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_50m_populated_places_simple.geojson

Terms: https://www.naturalearthdata.com/about/terms-of-use/

The bundled records retain cities with a source population estimate of at least
250,000, plus national capitals. Coordinates are rounded to four decimals.
Source population estimates are historical weights for choosing representative
locations and shaping a simplified urban exposure proxy; they are not current
population figures or casualty predictions.

Each Earth basin selects up to 85 representative cities, with modest spacing
to keep permanent wind labels readable. Coastal points can move up to 30 km to
the nearest land pixel in the bundled Earth map. Small islands can retain their
source point when that map cannot resolve them. Synthetic maps generate
unnamed settlements on their own land rather than importing Earth city names.

The city layer can be hidden in the in-game Menu. Since 0.21.0, Chinese city dots
have a second display-only spacing pass of 36 map units, retaining larger cities
first. Country membership uses the same pinned Natural Earth source. This pass
does not remove catalogue records, change tracked city IDs, redistribute exposure,
or discard city histories. Cities elsewhere keep their existing display selection.

All exposure, assets, damage and mortality values are game parameters. City
area impacts are allocated from the same land grid used for storm and regional
totals, without adding a second copy of city impacts.
