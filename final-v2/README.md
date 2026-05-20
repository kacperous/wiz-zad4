# Aktywność sejsmiczna Ziemi — wizualizacja USGS (live, 2D)

Wersja **robocza** (etap 4.3). Płaska mapa świata zamiast globu — zgodnie z planem 4.1.

## Co robi

Mapa świata w projekcji **Equal Earth** (zachowuje proporcje powierzchni, pokazuje całą Ziemię naraz, nie jest banalnym prostokątem równoodległościowym z Excela). Na mapie nanoszone są w czasie zbliżonym do rzeczywistego trzęsienia ziemi z USGS Earthquake Catalog. Każdy znacznik mapuje 10 cech zdarzenia na środki wyrazu (rozmiar, kolor, pulsacja, halo, kształt, pierścień, fala, etykieta, obrys), zgodnie z planem 4.1.

## Uruchomienie

W katalogu `final-v2/`:

```bash
python3 -m http.server 8000
```

i otwórz <http://localhost:8000/>.

(Lokalny serwer jest potrzebny, bo przeglądarki blokują niektóre żądania `fetch` przy otwieraniu pliku przez `file://`.)

## Sterowanie

- **przeciągnięcie myszą** — przesunięcie (pan)
- **scroll** — przybliżenie / oddalenie (zoom)
- **kliknięcie znacznika** — szczegóły w prawym dolnym panelu
- **najechanie znacznika** — tooltip
- **lista „Zakres czasu"** — przełącza feed (godzina / dzień / tydzień / miesiąc)
- **suwak „Próg magnitudy"** — filtruje widoczne zdarzenia
- **„Odśwież teraz"** — wymusza pobranie danych (auto-odświeżanie i tak działa co 60 s)
- **„Wyśrodkuj"** — przywraca domyślny widok mapy

## Uwagi

- Wszystkie dane pobierane są bezpośrednio z USGS bez pośrednika, w formacie GeoJSON.
- Rozmiary znaczników są skalowane odwrotnie do zoomu, żeby nie puchły przy przybliżaniu.
- Wersja końcowa (etap 4.4) doszlifuje warstwy wizualne (granice płyt tektonicznych, oś czasu, drobne polerowanie UX).
