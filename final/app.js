/* global d3, topojson */
// =====================================================================
// Aktywnosc sejsmiczna Ziemi - mapa trzesien ziemi z danych USGS.
//
// Jak to dziala w skrocie:
//   1. Pobieramy z internetu liste trzesien ziemi (format GeoJSON).
//   2. Rysujemy kule ziemska (glob) za pomoca biblioteki D3.
//   3. Na globie stawiamy kropki - jedna kropka = jedno trzesienie.
//   4. Co 60 sekund pobieramy dane na nowo (zeby byly aktualne).
//
// Nie trzeba niczego budowac - wystarczy otworzyc index.html w przegladarce.
// =====================================================================


// --- Adresy, z ktorych bierzemy dane (USGS udostepnia 4 zakresy czasu) ---
const FEEDS = {
  hour:  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
  day:   "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
  week:  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson",
  month: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson",
};

// Adres z ksztaltami panstw (potrzebny, zeby narysowac kontynenty).
const WORLD_TOPO = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Co ile czasu odswiezamy dane. 60 * 1000 milisekund = 60 sekund.
const REFRESH_MS = 60 * 1000;


// =====================================================================
// SKALE - czyli "przeliczniki" liczby na rozmiar albo kolor.
// =====================================================================

// Im wieksza magnituda, tym wieksza kropka (od 1.5 do 22 pikseli).
const rScale = d3.scaleSqrt().domain([0, 8]).range([1.5, 22]).clamp(true);

// Glebokosc trzesienia -> kolor kropki.
// Plytkie (grozniejsze) = czerwone/pomaranczowe, glebokie = niebieskie.
const depthScale = d3.scaleLinear()
  .domain([0, 35, 70, 150, 300, 700])
  .range(["#ff5d5d", "#ff8c42", "#ffd166", "#9be15d", "#34d399", "#38bdf8"])
  .clamp(true);

// Ile osob odczulo trzesienie -> rozmiar zoltej "fali" wokol kropki.
const feltScale = d3.scaleSqrt().domain([0, 5000]).range([0, 60]).clamp(true);


// =====================================================================
// PRZYGOTOWANIE RYSUNKU (SVG) I GLOBU.
// =====================================================================

const svg = d3.select("#map");        // plotno, na ktorym rysujemy
const tooltip = d3.select("#tooltip"); // male okienko z opisem po najechaniu

// "defs" to miejsce na definicje efektow. Robimy tu efekt poswiaty (glow),
// ktory rozmywa ksztalt i dodaje go z powrotem - tak powstaje swiecenie.
const defs = svg.append("defs");
const glow = defs.append("filter").attr("id", "glow")
  .attr("x", "-80%").attr("y", "-80%").attr("width", "260%").attr("height", "260%");
glow.append("feGaussianBlur").attr("stdDeviation", 2.5).attr("result", "blur");
const feMerge = glow.append("feMerge");
feMerge.append("feMergeNode").attr("in", "blur");
feMerge.append("feMergeNode").attr("in", "SourceGraphic");

// Kolorowy pasek legendy glebokosci (zwykle tlo CSS w postaci gradientu).
document.getElementById("depth-gradient").style.background =
  `linear-gradient(to right, ${d3.range(0, 1.01, 0.05).map(t =>
    `${depthScale(t * 700)} ${t * 100}%`).join(", ")})`;

// projekcja = sposob, w jaki kula 3D jest "splaszczana" na ekran 2D.
// geoOrthographic wyglada jak globus ogladany z kosmosu.
const projection = d3.geoOrthographic().precision(0.5).clipAngle(90);

// "path" zamienia ksztalty geograficzne na linie do narysowania.
const path = d3.geoPath(projection);

// Warstwy rysunku (kolejnosc = co jest pod czym):
const gSphere    = svg.append("g"); // niebieski ocean (tlo kuli)
const gGraticule = svg.append("g"); // siatka poludnikow i rownoleznikow
const gCountries = svg.append("g"); // ladunki / panstwa
const gQuakes    = svg.append("g").attr("class", "quakes"); // kropki trzesien


// =====================================================================
// LEGENDA ROZMIARU - trzy przykladowe kolka M2, M4, M6 obok siebie.
// =====================================================================
function buildSizeLegend() {
  const mags = [2, 4, 6];
  const sel = d3.select("#size-legend");
  const maxR = rScale(d3.max(mags));
  const cy = maxR + 3;
  const labelY = cy + maxR + 13;
  const H = labelY + 4;
  sel.attr("viewBox", `0 0 250 ${H}`).selectAll("*").remove();

  let cx = maxR + 6;
  mags.forEach((m, i) => {
    const r = rScale(m);
    sel.append("circle")
      .attr("cx", cx).attr("cy", cy).attr("r", r)
      .attr("fill", "none").attr("stroke", "#aeb8d8").attr("stroke-width", 1.2);
    sel.append("text")
      .attr("x", cx).attr("y", labelY).attr("text-anchor", "middle")
      .attr("fill", "#c7cef0").attr("font-size", 11)
      .text(`M ${m}`);
    // przesuwamy sie w prawo, zeby kolejne kolko sie nie nakladalo
    const next = mags[i + 1];
    if (next != null) cx += r + 20 + rScale(next);
  });
}
buildSizeLegend();


// =====================================================================
// STAN APLIKACJI - jedno miejsce, w ktorym trzymamy wszystkie dane.
// =====================================================================
const state = {
  feed: "day",            // wybrany zakres czasu
  magMin: 0,              // minimalna magnituda z suwaka (filtr)
  features: [],           // lista trzesien pobrana z USGS
  generated: null,        // kiedy USGS wygenerowal dane
  selectedId: null,       // id klikni etego trzesienia (biale podswietlenie)
  countries: null,        // ksztalty panstw
  graticule: d3.geoGraticule10(), // siatka na globie
  sphere: { type: "Sphere" },     // sama kula (ocean)
  nextRefreshAt: null,    // o ktorej godzinie nastepne odswiezenie
};


// =====================================================================
// POBIERANIE DANYCH Z INTERNETU.
// =====================================================================

// Pobiera ksztalty panstw (robimy to tylko raz na starcie).
async function loadCountries() {
  const topo = await d3.json(WORLD_TOPO);
  state.countries = topojson.feature(topo, topo.objects.countries);
}

// Pobiera liste trzesien ziemi dla wybranego zakresu czasu.
async function loadFeed() {
  setStatus("pobieranie…");
  try {
    const data = await d3.json(FEEDS[state.feed]);
    state.features = data.features || [];
    state.generated = data.metadata?.generated ?? Date.now();
    state.nextRefreshAt = Date.now() + REFRESH_MS;
    setStatus("OK");
    updateStats();
    redrawQuakes();
  } catch (err) {
    console.error(err);
    setStatus("blad: " + err.message);
  }
}


// =====================================================================
// RYSOWANIE TLA (kula, siatka, panstwa).
// =====================================================================
function redrawBase() {
  gSphere.selectAll("path").data([state.sphere])
    .join("path").attr("class", "sphere").attr("d", path);
  gGraticule.selectAll("path").data([state.graticule])
    .join("path").attr("class", "graticule").attr("d", path);
  if (state.countries) {
    gCountries.selectAll("path").data(state.countries.features, d => d.id)
      .join("path").attr("class", "country").attr("d", path);
  }
}


// =====================================================================
// RYSOWANIE TRZESIEN ZIEMI (kropki).
// =====================================================================

// Sprawdza, czy punkt jest na widocznej stronie globu.
// (Na globie widac tylko polowe Ziemi - druga polowa jest "z tylu".)
// d3.geoDistance liczy odleglosc katowa miedzy punktem a srodkiem globu.
// Jesli jest mniejsza niz 90 stopni (PI/2), to punkt jest z przodu.
function isVisible(feature) {
  const rotate = projection.rotate();
  const center = [-rotate[0], -rotate[1]];
  return d3.geoDistance(feature.geometry.coordinates, center) < Math.PI / 2;
}

function redrawQuakes() {
  const now = Date.now();

  // 1. Zostawiamy tylko prawdziwe trzesienia ziemi, ktore przeszly filtr magnitudy.
  const filtered = state.features.filter(f => {
    const mag = f.properties.mag ?? 0;
    const isQuake = (f.properties.type || "earthquake") === "earthquake";
    const hasCoords = f.geometry?.coordinates?.length >= 2;
    return isQuake && hasCoords && mag >= state.magMin;
  });

  document.getElementById("stat-visible").textContent = filtered.length;

  // 2. Sortujemy od najslabszych do najsilniejszych,
  //    zeby duze trzesienia byly narysowane na wierzchu.
  filtered.sort((a, b) => (a.properties.mag ?? 0) - (b.properties.mag ?? 0));

  // 3. Laczymy dane z elementami na ekranie (wzorzec "data join" z D3).
  //    Kazde trzesienie to grupa <g> z kilkoma kolkami w srodku.
  const groups = gQuakes.selectAll("g.quake-group").data(filtered, d => d.id);
  groups.exit().remove(); // usun trzesienia, ktorych juz nie ma

  // Dla nowych trzesien tworzymy zestaw kolek (od spodu do gory):
  const enter = groups.enter().append("g").attr("class", "quake-group");
  enter.append("circle").attr("class", "quake-wave");   // zolta fala (felt)
  enter.append("circle").attr("class", "quake-fresh");  // pierscien "swiezosci"
  enter.append("circle").attr("class", "quake-tsu");    // pierscien tsunami
  enter.append("circle").attr("class", "quake quake-marker"); // glowna kropka
  enter.append("circle").attr("class", "quake-sel");    // biale zaznaczenie

  // 4. Dla kazdego trzesienia (nowego i istniejacego) ustawiamy pozycje i wyglad.
  enter.merge(groups).each(function (d) {
    const node = d3.select(this);

    // Jesli punkt jest po niewidocznej stronie globu - chowamy cala grupe.
    if (!isVisible(d)) {
      node.style("display", "none");
      return;
    }
    node.style("display", null);

    // Wyciagamy potrzebne dane z trzesienia.
    const [lon, lat, depth] = d.geometry.coordinates;
    const [x, y] = projection([lon, lat]); // pozycja na ekranie
    const mag = d.properties.mag ?? 0;
    const felt = d.properties.felt ?? 0;          // ile osob odczulo
    const isTsunami = d.properties.tsunami === 1;
    const isReviewed = (d.properties.status || "automatic") !== "automatic";
    const ageHours = (now - d.properties.time) / 3.6e6; // wiek w godzinach
    const isFresh = ageHours < 1;                  // swieze = mlodsze niz 1h
    const isSelected = d.id === state.selectedId;

    const r = rScale(mag); // promien glownej kropki

    // Im starsze trzesienie, tym bardziej przezroczyste (blednie z czasem).
    const opacity = d3.scaleLinear()
      .domain([0, ageMax(state.feed)])
      .range([1, 0.18]).clamp(true)(ageHours);

    // Zolta fala - wieksza, gdy wiecej osob odczulo wstrzas.
    node.select(".quake-wave")
      .attr("cx", x).attr("cy", y)
      .attr("r", r + feltScale(felt))
      .attr("stroke-width", felt > 0 ? 1 : 0)
      .style("display", felt > 0 ? null : "none");

    // Pierscien "swiezosci" - animowana fala wokol swiezych trzesien.
    node.select(".quake-fresh")
      .attr("cx", x).attr("cy", y)
      .attr("r", r + 1.5)
      .style("display", isFresh ? null : "none");

    // Pierscien tsunami (niebieski).
    node.select(".quake-tsu")
      .attr("cx", x).attr("cy", y)
      .attr("r", r + 4)
      .style("display", isTsunami ? null : "none");

    // Glowna kropka - kolor wg glebokosci, wielkosc wg magnitudy.
    node.select(".quake-marker")
      .attr("cx", x).attr("cy", y)
      .attr("r", r)
      .attr("fill", depthScale(Math.max(0, depth)))
      .attr("fill-opacity", opacity)
      .attr("stroke", "#ffffff")
      .attr("stroke-opacity", isSelected ? 1 : 0.9)
      .attr("stroke-width", isSelected ? 1.6 : 1)
      .attr("filter", isFresh ? "url(#glow)" : null)
      .classed("stroke-dashed", !isReviewed) // przerywany = dane wstepne
      .classed("stroke-solid", isReviewed)   // ciagly = dane sprawdzone
      .classed("pulse", isFresh)
      // Reakcje na mysz: pokazuj opis i reaguj na klikniecie.
      .on("mouseenter", (e) => showTooltip(e, d))
      .on("mousemove", (e) => moveTooltip(e))
      .on("mouseleave", hideTooltip)
      .on("click", () => {
        state.selectedId = d.id;
        redrawQuakes();
        showDetails(d);
      });

    // Biale podswietlenie klikni etego trzesienia.
    node.select(".quake-sel")
      .attr("cx", x).attr("cy", y)
      .attr("r", r + 6)
      .style("display", isSelected ? null : "none");

    // Zaznaczone trzesienie przesuwamy na sam wierzch.
    if (isSelected) node.raise();
  });
}

// Maksymalny wiek (w godzinach) dla danego zakresu - uzywany do blakniecia.
function ageMax(feed) {
  return ({ hour: 1, day: 24, week: 168, month: 720 })[feed] || 24;
}


// =====================================================================
// OKIENKO Z OPISEM (tooltip) I PANEL SZCZEGOLOW.
// =====================================================================

// Male okienko pokazywane po najechaniu na kropke.
function showTooltip(event, d) {
  const p = d.properties;
  tooltip.html(`
    <div class="t-place">${escapeHtml(p.place || "—")}</div>
    <div class="t-mag">M ${fmtMag(p.mag)}${p.magType ? ` (${escapeHtml(p.magType)})` : ""}</div>
    <div style="color:var(--muted);margin-top:4px">
      glebokosc: ${fmtNum(d.geometry.coordinates[2])} km<br/>
      ${new Date(p.time).toLocaleString("pl-PL")}
    </div>
  `).classed("visible", true);
  moveTooltip(event);
}
// Przesuwa okienko za kursorem myszy.
function moveTooltip(event) {
  tooltip.style("left", event.clientX + "px").style("top", event.clientY + "px");
}
function hideTooltip() {
  tooltip.classed("visible", false);
}

// Duzy panel ze szczegolami - pojawia sie po klikni eciu w kropke.
function showDetails(d) {
  const p = d.properties;
  const [lon, lat, depth] = d.geometry.coordinates;
  d3.select("#details-body").html(`
    <div class="kv"><span class="k">Miejsce</span><span class="v wrap" style="max-width:170px">${escapeHtml(p.place || "—")}</span></div>
    <div class="kv"><span class="k">Magnituda</span><span class="v">M ${fmtMag(p.mag)}${p.magType ? ` <span style="color:var(--muted)">(${escapeHtml(p.magType)})</span>` : ""}</span></div>
    <div class="kv"><span class="k">Glebokosc</span><span class="v">${fmtNum(depth)} km</span></div>
    <div class="kv"><span class="k">Wspolrzedne</span><span class="v">${fmtNum(lat)}°, ${fmtNum(lon)}°</span></div>
    <div class="kv"><span class="k">Czas (UTC)</span><span class="v time">${new Date(p.time).toISOString().replace("T", " ").slice(0, 19)}</span></div>
    <div class="kv"><span class="k">Istotnosc (sig)</span><span class="v">${p.sig ?? "—"}</span></div>
    <div class="kv"><span class="k">Odczute przez</span><span class="v">${p.felt != null ? p.felt + " osob" : "—"}</span></div>
    <div class="kv"><span class="k">Tsunami</span><span class="v">${p.tsunami ? "tak" : "nie"}</span></div>
    <div class="kv"><span class="k">Status</span><span class="v">${escapeHtml(p.status || "—")}</span></div>
    <div class="kv"><span class="k">Typ</span><span class="v">${escapeHtml(type2pl(p.type))}</span></div>
    <p class="footer-note"><a href="${escapeHtml(p.url || "#")}" target="_blank" rel="noopener">Karta zdarzenia w USGS →</a></p>
  `);
}


// =====================================================================
// STATUS I STATYSTYKI (prawy gorny panel).
// =====================================================================
function setStatus(text) {
  document.getElementById("status-text").textContent = text;
}

function updateStats() {
  const quakes = state.features.filter(f => (f.properties.type || "earthquake") === "earthquake");
  document.getElementById("stat-total").textContent = quakes.length;

  const max = d3.max(quakes, f => f.properties.mag) ?? null;
  document.getElementById("stat-max").textContent = max != null ? fmtMag(max) : "—";

  document.getElementById("stat-gen").textContent = state.generated
    ? new Date(state.generated).toISOString().slice(11, 19)
    : "—";
}

// Co sekunde liczy, ile zostalo do nastepnego odswiezenia.
function tickCountdown() {
  if (!state.nextRefreshAt) return;
  const remaining = Math.max(0, Math.round((state.nextRefreshAt - Date.now()) / 1000));
  document.getElementById("stat-next").textContent = remaining + " s";
}
setInterval(tickCountdown, 1000);


// =====================================================================
// OBRACANIE GLOBU MYSZA + PRZYBLIZANIE SCROLLEM.
// =====================================================================
function attachInteraction() {
  // Czulosc obracania: o ile stopni obrocic glob na 1 piksel ruchu myszy.
  const sensitivity = 0.25;
  let lastX, lastY;

  // Przeciaganie mysza = obracanie globu.
  const drag = d3.drag()
    .on("start", (event) => {
      lastX = event.x;
      lastY = event.y;
    })
    .on("drag", (event) => {
      const rotate = projection.rotate(); // [obrot poziomy, obrot pionowy]
      const dx = event.x - lastX;
      const dy = event.y - lastY;
      // ruch w poziomie obraca w lewo/prawo, w pionie w gore/dol.
      projection.rotate([
        rotate[0] + dx * sensitivity,
        rotate[1] - dy * sensitivity,
      ]);
      lastX = event.x;
      lastY = event.y;
      redrawBase();
      redrawQuakes();
    });

  // Scroll = przyblizanie / oddalanie (zmiana skali projekcji).
  const zoom = d3.zoom()
    .scaleExtent([0.5, 8])
    .on("zoom", (event) => {
      const baseScale = Math.min(window.innerWidth, window.innerHeight) * 0.45;
      projection.scale(baseScale * event.transform.k);
      redrawBase();
      redrawQuakes();
    });

  svg.call(drag).call(zoom);
}


// =====================================================================
// PRZYCISKI I KONTROLKI (lewy panel).
// =====================================================================
function attachControls() {
  // Lista wyboru zakresu czasu.
  document.getElementById("feed").addEventListener("change", (e) => {
    state.feed = e.target.value;
    loadFeed();
  });

  // Suwak minimalnej magnitudy.
  const magInput = document.getElementById("mag");
  const magLabel = document.getElementById("mag-label");
  magInput.addEventListener("input", (e) => {
    state.magMin = +e.target.value;
    magLabel.textContent = "≥ " + state.magMin.toFixed(1);
    redrawQuakes();
  });

  // Przycisk "Odswiez teraz".
  document.getElementById("refresh").addEventListener("click", loadFeed);

  // Przycisk "Wysrodkuj" - przywraca domyslny widok globu.
  document.getElementById("reset").addEventListener("click", () => {
    projection.rotate([0, -10]);
    redrawBase();
    redrawQuakes();
  });
}


// =====================================================================
// DROBNE FUNKCJE POMOCNICZE.
// =====================================================================

// Magnituda jako tekst z jednym miejscem po przecinku (albo "—").
const fmtMag = (v) => v == null ? "—" : (+v).toFixed(1);

// Liczba z dwoma miejscami po przecinku (albo "—").
const fmtNum = (v) => v == null || isNaN(v) ? "—" : (+v).toFixed(2);

// Zamienia niebezpieczne znaki na bezpieczne (zeby tekst z USGS nie zepsul HTML).
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// Tlumaczy typ zdarzenia z angielskiego na polski.
function type2pl(t) {
  const map = {
    "earthquake": "trzesienie ziemi",
    "quarry blast": "wybuch w kamieniolomie",
    "explosion": "eksplozja",
    "ice quake": "trzesienie lodu",
    "mining explosion": "eksplozja gornicza",
    "rock burst": "tapniecie",
    "nuclear explosion": "eksplozja nuklearna",
  };
  return map[t] || t || "—";
}


// =====================================================================
// DOSTOSOWANIE DO ROZMIARU OKNA.
// =====================================================================
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  svg.attr("width", w).attr("height", h).attr("viewBox", `0 0 ${w} ${h}`);
  projection.translate([w / 2, h / 2]).scale(Math.min(w, h) * 0.45);
  redrawBase();
  redrawQuakes();
}
window.addEventListener("resize", resize);


// =====================================================================
// START - to uruchamia sie raz, gdy strona sie zaladuje.
// =====================================================================
(async function init() {
  attachControls();      // podlacz przyciski i suwak
  attachInteraction();   // wlacz obracanie i przyblizanie
  resize();              // dopasuj rozmiar do okna
  projection.rotate([0, -10]); // ustaw poczatkowy widok globu
  await loadCountries(); // pobierz ksztalty panstw
  redrawBase();          // narysuj glob
  await loadFeed();      // pobierz i narysuj trzesienia
  setInterval(loadFeed, REFRESH_MS); // odswiezaj co 60 sekund
})();
