# Dokumentacja procesu — Ćwiczenie 4

**Autor:** Kacper Kleczaj
**Temat:** Aktywność sejsmiczna Ziemi w czasie zbliżonym do rzeczywistego (USGS)

Etapy nazwane wg pipeline'u Bena Fry'a (*acquire → parse → filter → mine → represent → refine → interact*). Dopisywane są w trakcie pracy.

---

## Etap 4.1 — Planowanie

### Burza mózgów

Po przeczytaniu PDF-a uznałem, że potrzebuję czegoś realnie dynamicznego i nietrywialnego (PDF wprost wyklucza słupkowe / kołowe / liniowe / punktowe). Padło na trzęsienia ziemi z USGS, bo aktualizują się co minutę, a jeden rekord ma masę cech do mapowania. Pierwszy odruch to był globus 3D, ale po przemyśleniu przeszedłem na płaską mapę w projekcji Equal Earth ze względu na lepszą prezencję danych na pierwszy rzut oka

### Acquire (zdobądź dane)

Wybrane źródło to USGS Earthquake Catalog — feedy GeoJSON dla okien `hour / day / week / month`, bez klucza i bez rejestracji. W momencie snapshottu feed dobowy zwracał 217 rekordów (`snapshots/feed_metadata.json`):

```json
{
  "generated": 1779270476000,
  "url": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
  "title": "USGS All Earthquakes, Past Day",
  "status": 200,
  "api": "2.4.0",
  "count": 217
}
```

feed-metadata.png

### Parse (zweryfikuj strukturę)

Zanim zaplanowałem mapowanie cech, sprawdziłem, czy nazwy pól z planu na pewno są w odpowiedzi API. Wszystkie 26 pól się zgadza, `geometry.coordinates` to potwierdzone `[longitude, latitude, depth_km]`.

structure.png

Reprezentatywny rekord w Japoni — na nim widać prawie wszystkie środki wyrazu naraz:

```json
{
  "type": "Feature",
  "properties": {
    "mag": 5.9,
    "place": "8 km E of Wadomari, Japan",
    "time": 1779245184884,
    "updated": 1779266147627,
    "tz": null,
    "url": "https://earthquake.usgs.gov/earthquakes/eventpage/us6000syw4",
    "detail": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/us6000syw4.geojson",
    "felt": 19,
    "cdi": 3.6,
    "mmi": 4.728,
    "alert": "green",
    "status": "reviewed",
    "tsunami": 0,
    "sig": 542,
    "net": "us",
    "code": "6000syw4",
    "ids": ",us6000syw4,",
    "sources": ",us,",
    "types": ",dyfi,ground-failure,losspager,moment-tensor,origin,phase-data,shakemap,",
    "nst": 109,
    "dmin": 0.69,
    "rms": 1.28,
    "gap": 19,
    "magType": "mww",
    "type": "earthquake",
    "title": "M 5.9 - 8 km E of Wadomari, Japan"
  },
  "geometry": {
    "type": "Point",
    "coordinates": [
      128.7336,
      27.392,
      42
    ]
  },
  "id": "us6000syw4"
}
```

sketch.png

### Co wyszło na koniec etapu

Zamysł: Mapa 2D Equal Earth, stack: HTML5 + D3 v7 + topojson-client (bez Node-a), 10 zaplanowanych cech, 5 elementów interaktywnych, auto-odświeżanie co 60 s.
