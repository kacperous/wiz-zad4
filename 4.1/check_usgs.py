"""
Skrypt weryfikacyjny: sprawdza, czy nazwy pól wymienione w plan.md
faktycznie istnieją w odpowiedzi USGS GeoJSON oraz czy geometry.coordinates
ma format [longitude, latitude, depth_km].
"""
import json
import urllib.request

URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"

# Pola właściwości używane w plan.md
EXPECTED_PROPERTIES = [
    "mag", "place", "time", "updated", "tz", "url", "detail",
    "felt", "cdi", "mmi", "alert", "status", "tsunami", "sig",
    "net", "code", "ids", "sources", "types", "nst", "dmin",
    "rms", "gap", "magType", "type", "title",
]

with urllib.request.urlopen(URL, timeout=15) as r:
    d = json.load(r)

count = d["metadata"]["count"]
features = d["features"]
print(f"records: {count}")
print(f"generated: {d['metadata']['generated']}")
print(f"title: {d['metadata']['title']}\n")

# 1. Sprawdzenie pól properties
prop_keys = set()
for f in features:
    prop_keys.update(f["properties"].keys())

missing = [p for p in EXPECTED_PROPERTIES if p not in prop_keys]
extra = sorted(prop_keys - set(EXPECTED_PROPERTIES))
print("missing properties (referenced in plan.md but absent in API):", missing or "NONE")
print("extra properties (present in API, not referenced in plan.md):", extra)

# 2. Sprawdzenie geometry.coordinates: [lon, lat, depth_km]
geom_ok = 0
geom_bad = 0
lon_min, lon_max, lat_min, lat_max, depth_min, depth_max = 1e9, -1e9, 1e9, -1e9, 1e9, -1e9
for f in features:
    c = f["geometry"]["coordinates"]
    if (
        isinstance(c, list)
        and len(c) == 3
        and -180 <= c[0] <= 180
        and -90 <= c[1] <= 90
    ):
        geom_ok += 1
        lon_min, lon_max = min(lon_min, c[0]), max(lon_max, c[0])
        lat_min, lat_max = min(lat_min, c[1]), max(lat_max, c[1])
        depth_min, depth_max = min(depth_min, c[2]), max(depth_max, c[2])
    else:
        geom_bad += 1

print(f"\ngeometry.coordinates layout = [longitude, latitude, depth_km]")
print(f"  features with valid layout: {geom_ok}/{len(features)}")
print(f"  features with unexpected layout: {geom_bad}")
print(f"  longitude range: {lon_min:.3f} .. {lon_max:.3f}")
print(f"  latitude  range: {lat_min:.3f} .. {lat_max:.3f}")
print(f"  depth km  range: {depth_min:.3f} .. {depth_max:.3f}")

# 3. Statystyki kluczowych pól wykorzystywanych w mapowaniu
def stat(prop):
    vals = [f["properties"].get(prop) for f in features]
    nn = [v for v in vals if v is not None]
    if not nn:
        return f"{prop}: all None"
    if isinstance(nn[0], (int, float)):
        return f"{prop}: non-null {len(nn)}/{len(vals)}, min={min(nn)}, max={max(nn)}"
    return f"{prop}: non-null {len(nn)}/{len(vals)}, sample={nn[0]!r}"

print("\nfield statistics for the 24h feed:")
for p in ["mag", "sig", "felt", "tsunami", "mmi", "alert", "status", "type", "place"]:
    print(" ", stat(p))
