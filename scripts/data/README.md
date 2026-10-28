`kostat-municipalities-2013.json` is the unmodified KOSTAT 2013 simplified
municipal boundary dataset from
https://github.com/southkorea/southkorea-maps/blob/master/kostat/2013/json/skorea_municipalities_geo_simple.json.
Original source: Statistics Korea (KOSTAT), census administrative boundaries.
The upstream repository's license states: **KOSTAT: Free to share or remix**.
https://github.com/southkorea/southkorea-maps#copyright-and-license

This file is used only during data collection and validation; it is not included
in the browser bundle. A 4 km tolerance and explicit municipal merger aliases
avoid treating older boundary geometry as a precise current cadastral map.

The reviewed 청량리/철암 correction in `../station-locations.mjs` swaps only the
known erroneous coordinate pairs in ODCloud station dataset 15067652/v1
(2025-07-11 UUID). Both corrected points agree with the respective source street
address and municipality. Existing correct or subsequently updated upstream
coordinates are preserved. This is a correction to station locations, not a
source of railway track geometry.
