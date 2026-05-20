"""Pobiera jeden 'ładny' rekord z USGS i zrzuca go w czytelnym JSON-ie
do dokumentacji (jako reprezentatywna próbka stanu źródła danych).
"""
import json, urllib.request, pathlib

URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson"
OUT = pathlib.Path(__file__).parent / "sample_feature.json"
META = pathlib.Path(__file__).parent / "feed_metadata.json"

with urllib.request.urlopen(URL, timeout=15) as r:
    data = json.load(r)

META.write_text(json.dumps(data["metadata"], indent=2, ensure_ascii=False))

# wybierz najsilniejszy rekord — taki, na którym widać wypełnione cechy
best = max(data["features"], key=lambda f: f["properties"].get("mag") or -10)
OUT.write_text(json.dumps(best, indent=2, ensure_ascii=False))

print("Zapisano:", OUT)
print("Magnituda:", best["properties"]["mag"], "·", best["properties"]["place"])
print("Liczba pól w properties:", len(best["properties"]))
print("Wszystkie zaobserwowane klucze:", sorted(best["properties"].keys()))
