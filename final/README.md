# Aktywność sejsmiczna Ziemi — wizualizacja USGS (live)

Wersja **robocza** (etap 4.3). Pokazuje zamysł wizualizacji opisanej w `4.1/plan.md`.

## Co robi

Mapa świata w projekcji ortograficznej (D3 + d3-geo) z naniesionymi w czasie zbliżonym do rzeczywistego trzęsieniami ziemi z USGS Earthquake Catalog (pokazujemy wyłącznie zdarzenia typu `earthquake`). Mapa jest obracana przeciągnięciem, przybliżana scrollem. Każdy znacznik mapuje cechy zdarzenia na środki wyrazu: rozmiar = magnituda, kolor = głębokość, przezroczystość/pulsacja + poświata = świeżość, żółta fala = liczba zgłoszeń odczucia (felt), niebieski pierścień = alert tsunami, styl obrysu = status weryfikacji, biały pierścień = zaznaczenie, etykieta = miejsce. Pozostałe pola (np. istotność, współrzędne, czas UTC) widoczne są w panelu szczegółów.

## Uruchomienie

Aplikacja to czysty front: jeden HTML + jeden JS, biblioteki z CDN. Wymaga jedynie serwowania plików przez **lokalny serwer HTTP** (przeglądarki blokują niektóre żądania przy otwieraniu z `file://`).

Najprościej, w katalogu `final/`:

```bash
python3 -m http.server 8000
```

a następnie otwórz w przeglądarce: <http://localhost:8000/>

Alternatywnie:

```bash
npx --yes serve .
```

## Sterowanie

- **przeciągnięcie myszą** — obrót globu
- **scroll** — przybliżenie / oddalenie
- **kliknięcie znacznika** — szczegóły w prawym dolnym panelu
- **najechanie znacznika** — tooltip
- **lista „Zakres czasu"** — przełącza feed (godzina / dzień / tydzień / miesiąc)
- **suwak „Próg magnitudy"** — filtruje widoczne zdarzenia
- **„Odśwież teraz"** — wymusza pobranie danych (auto-odświeżanie i tak działa co 60 s)
- **„Wyśrodkuj"** — przywraca domyślną orientację globu

## Uwagi

- Pierwsze pobranie konturów państw i danych USGS może zająć 1–2 sekundy.
- Wszystkie dane pobierane są bezpośrednio z USGS bez pośrednika.
- Wersja końcowa (etap 4.4) doszlifuje warstwy wizualne (granice płyt tektonicznych, oś czasu, statystyki) oraz drobne zachowania UX.
