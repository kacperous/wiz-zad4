# Ćwiczenie 4 — Etap 4.1

**Autor:** Kacper Kleczaj

## Źródło danych

USGS Earthquake Catalog — publiczne API United States Geological Survey, format GeoJSON, bez klucza i rejestracji.

- Strona serwisu: <https://earthquake.usgs.gov/>
- Opis feedów: <https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php>
- Wykorzystywany endpoint: <https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson> (wszystkie wstrząsy z ostatnich 24 h; w aplikacji przełączane będą równoległe warianty `all_hour`, `all_week`, `all_month`).

## Opis danych

Wizualizowane są trzęsienia ziemi rejestrowane na całym świecie przez globalną sieć sejsmiczną USGS w czasie zbliżonym do rzeczywistego. Każdy rekord opisuje pojedyncze zdarzenie: jego lokalizację, magnitudę, głębokość ogniska, czas wystąpienia oraz parametry pochodne (istotność, alarm tsunami, liczba zgłoszeń odczucia). Celem jest pokazanie skali i rozkładu przestrzennego bieżącej aktywności sejsmicznej Ziemi w sposób, który ułatwia dostrzeżenie wzorców takich jak granice płyt tektonicznych czy sekwencje wstrząsów wtórnych.

## Dynamika danych

Feed USGS jest aktualizowany po stronie dostawcy w odstępach około jednej minuty. Dane zmieniają się trojako: nowe rekordy są **dodawane** natychmiast po wykryciu zdarzenia przez stacje sejsmiczne, istniejące rekordy są **aktualizowane**, gdy sejsmolodzy weryfikują magnitudę, głębokość czy istotność i status (`automatic` → `reviewed`), a najstarsze rekordy **wypadają** z okien krótkookresowych wraz z upływem czasu. Każde kolejne pobranie tego samego endpointu zwraca inny zestaw danych — w czasie pisania tego dokumentu feed dobowy zawierał 218 rekordów po 26 pól każdy. Aplikacja będzie odpytywała API cyklicznie (co 60 s) oraz na żądanie użytkownika.

## Forma wizualizacji

Mapa świata 2D w projekcji ortograficznej (D3.js + d3-geo), obracana przeciągnięciem myszą — zachowuje czytelność płaskiej mapy i jednocześnie unika trywialności prostego prostokąta równoodległościowego. Trzęsienia ziemi nanoszone są jako interaktywne znaczniki, w tle warstwa konturów państw oraz opcjonalnie granic płyt tektonicznych.

## Lista wizualizowanych cech — środek wyrazu

- lokalizacja geograficzna (`geometry.coordinates[0]`, `[1]`) — pozycja znacznika na mapie
- magnituda (`properties.mag`) — rozmiar znacznika
- głębokość ogniska (`geometry.coordinates[2]`) — kolor (gradient od jasnego dla płytkich do ciemnego dla głębokich)
- czas wystąpienia (`properties.time`) — przezroczystość i pulsacja (świeże zdarzenia jasne i pulsujące, starsze blakną)
- istotność (`properties.sig`) — wartość liczbowa w panelu szczegółów (USGS wylicza ją głównie z magnitudy i liczby zgłoszeń odczucia, więc nie dublujemy jej osobnym kanałem wizualnym)
- typ zdarzenia (`properties.type`) — prezentowany tekstowo w tooltipie i panelu szczegółów (wszystkie znaczniki mają ujednolicony kształt koła dla czytelności)
- alarm tsunami (`properties.tsunami`) — dodatkowy pierścień widoczny tylko przy wartości 1
- liczba zgłoszeń odczucia (`properties.felt`) — promień animowanej fali rozchodzącej się z epicentrum
- nazwa miejsca (`properties.place`) — etykieta tekstowa w tooltipie po najechaniu kursorem
- status weryfikacji (`properties.status`) — styl obrysu znacznika (przerywany dla `automatic`, ciągły dla `reviewed`)

## Element interaktywny

Wymóg ćwiczenia (≥ 1) zostanie spełniony z zapasem: obrót i zoom mapy myszą, suwak progu magnitudy, przełącznik zakresu czasu (godzina / dzień / tydzień / miesiąc), przycisk ręcznego odświeżenia plus automatyczne odświeżanie w tle, tooltip i panel szczegółów po najechaniu / kliknięciu znacznika.
