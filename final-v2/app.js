/* global d3, topojson */
// =====================================================================
// Aktywność sejsmiczna Ziemi — wizualizacja USGS (etap roboczy, 2D)
// Płaska mapa świata w projekcji Equal Earth, D3 v7 + topojson-client.
// Brak budowania, otwórz index.html przez lokalny serwer HTTP.
// =====================================================================

const FEEDS = {
  hour:  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson",
  day:   "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
  week:  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson",
  month: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson",
};

const WORLD_TOPO = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const REFRESH_MS = 60 * 1000;

// --- skale -----------------------------------------------------------
// magnituda (-1..8) -> promień znacznika
const rScale     = d3.scaleSqrt().domain([0, 8]).range([1.5, 22]).clamp(true);
// głębokość (0..700 km) -> kolor
const depthScale = d3.scaleSequential(d3.interpolateInferno).domain([0, 700]);
// istotność (0..1000) -> dodatek do promienia halo
const haloScale  = d3.scaleLinear().domain([0, 1000]).range([0, 18]).clamp(true);
// felt (zgłoszenia) -> promień fali
const feltScale  = d3.scaleSqrt().domain([0, 5000]).range([0, 60]).clamp(true);

// =====================================================================
// SVG: warstwy + grupa transformowana zoomem (pan/zoom XY, czysto 2D)
// =====================================================================
const svg = d3.select("#map");
const tooltip = d3.select("#tooltip");

// gradient legendy głębokości
document.getElementById("depth-gradient").style.background =
  `linear-gradient(to right, ${d3.range(0, 1.01, 0.05)
    .map(t => `${depthScale(t * 700)} ${t * 100}%`).join(", ")})`;

// projekcja: Equal Earth — płaska mapa, zachowuje proporcje powierzchni
const projection = d3.geoEqualEarth();
const path = d3.geoPath(projection);

const root        = svg.append("g").attr("class", "root");
const gSphere     = root.append("g");
const gGraticule  = root.append("g");
const gCountries  = root.append("g");
const gQuakes     = root.append("g").attr("class", "quakes");

// =====================================================================
// rozmiar / dopasowanie projekcji do okna
// =====================================================================
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  svg.attr("width", w).attr("height", h).attr("viewBox", `0 0 ${w} ${h}`);
  // dopasuj projekcję do całego widocznego obszaru z marginesem
  projection.fitExtent([[20, 20], [w - 20, h - 20]], { type: "Sphere" });
  redrawBase();
  redrawQuakes();
}
window.addEventListener("resize", resize);

// =====================================================================
// stan
// =====================================================================
const state = {
  feed: "day",
  magMin: 0,
  features: [],
  generated: null,
  countries: null,
  graticule: d3.geoGraticule10(),
  sphere: { type: "Sphere" },
  nextRefreshAt: null,
  zoomK: 1,
};

// =====================================================================
// pobieranie danych
// =====================================================================
async function loadCountries() {
  const topo = await d3.json(WORLD_TOPO);
  state.countries = topojson.feature(topo, topo.objects.countries);
}

async function loadFeed() {
  setStatus("pobieranie…");
  try {
    const url = FEEDS[state.feed];
    const data = await d3.json(url);
    state.features = data.features || [];
    state.generated = data.metadata?.generated ?? Date.now();
    state.nextRefreshAt = Date.now() + REFRESH_MS;
    setStatus("ok");
    updateStats();
    redrawQuakes();
  } catch (err) {
    console.error(err);
    setStatus("błąd: " + err.message);
  }
}

// =====================================================================
// rendering — tło
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
// rendering — trzęsienia
// =====================================================================
function redrawQuakes() {
  const now = Date.now();
  const filtered = state.features.filter(f => {
    const m = f.properties.mag ?? 0;
    return m >= state.magMin && f.geometry?.coordinates?.length >= 2;
  });
  document.getElementById("stat-visible").textContent = filtered.length;

  // mocniejsze na wierzchu
  filtered.sort((a, b) => (a.properties.mag ?? 0) - (b.properties.mag ?? 0));

  const join = gQuakes.selectAll("g.quake-group")
    .data(filtered, d => d.id);
  join.exit().remove();

  const enter = join.enter().append("g").attr("class", "quake-group");
  enter.append("circle").attr("class", "quake-wave");      // fala "felt"
  enter.append("circle").attr("class", "quake-halo");      // halo istotności
  enter.append("circle").attr("class", "quake-tsu");       // pierścień tsunami
  enter.append("path"  ).attr("class", "quake quake-marker"); // główny znacznik

  const all = enter.merge(join);
  const k = state.zoomK || 1;
  // antyzoom dla rozmiarów punktów: pozycja podlega skali grupy `root`,
  // ale rozmiary obliczamy w pikselach widoku, więc dzielimy przez k
  const inv = 1 / k;

  all.each(function (d) {
    const [lon, lat, depth] = d.geometry.coordinates;
    const xy = projection([lon, lat]);
    const node = d3.select(this);
    if (!xy) { node.style("display", "none"); return; }
    node.style("display", null);

    const [x, y] = xy;
    const mag    = d.properties.mag ?? 0;
    const sig    = d.properties.sig ?? 0;
    const felt   = d.properties.felt ?? 0;
    const tsu    = d.properties.tsunami === 1;
    const type   = d.properties.type || "earthquake";
    const stat   = d.properties.status || "automatic";
    const ageH   = (now - d.properties.time) / 3.6e6;
    const fresh  = ageH < 1;
    const opacity = d3.scaleLinear()
      .domain([0, ageMax(state.feed)])
      .range([1, 0.18]).clamp(true)(ageH);

    const r     = rScale(mag) * inv;
    const haloR = (rScale(mag) + haloScale(sig)) * inv;
    const waveR = (rScale(mag) + feltScale(felt)) * inv;

    node.select(".quake-wave")
      .attr("cx", x).attr("cy", y).attr("r", waveR)
      .attr("stroke-width", felt > 0 ? 1 : 0)
      .style("display", felt > 0 ? null : "none");

    node.select(".quake-halo")
      .attr("cx", x).attr("cy", y).attr("r", haloR)
      .attr("stroke", depthScale(Math.max(0, depth)))
      .attr("stroke-width", 1 * inv)
      .attr("stroke-opacity", 0.35);

    node.select(".quake-tsu")
      .attr("cx", x).attr("cy", y).attr("r", r + 4 * inv)
      .style("display", tsu ? null : "none");

    const marker = node.select(".quake-marker")
      .attr("d", markerShape(type, r))
      .attr("transform", `translate(${x},${y})`)
      .attr("fill", depthScale(Math.max(0, depth)))
      .attr("fill-opacity", opacity)
      .attr("stroke", "#ffffff")
      .attr("stroke-opacity", 0.9)
      .attr("stroke-width", 1 * inv)
      .classed("stroke-dashed", stat === "automatic")
      .classed("stroke-solid",  stat !== "automatic")
      .classed("pulse", fresh);

    marker
      .on("mouseenter", (e) => showTooltip(e, d))
      .on("mousemove",  (e) => moveTooltip(e))
      .on("mouseleave", hideTooltip)
      .on("click",      () => showDetails(d));
  });
}

function markerShape(type, r) {
  switch (type) {
    case "quarry blast":
    case "explosion":
    case "nuclear explosion":
    case "mining explosion":
      // kwadrat
      return `M${-r},${-r} L${r},${-r} L${r},${r} L${-r},${r} Z`;
    case "ice quake":
    case "rock burst":
      // trójkąt
      return `M0,${-r} L${r},${r} L${-r},${r} Z`;
    default:
      return d3.symbol().type(d3.symbolCircle).size(Math.PI * r * r)();
  }
}

function ageMax(feed) {
  return ({ hour: 1, day: 24, week: 168, month: 720 })[feed] || 24;
}

// =====================================================================
// tooltip + panel szczegółów
// =====================================================================
function showTooltip(event, d) {
  const p = d.properties;
  tooltip.html(`
    <div class="t-place">${escapeHtml(p.place || "—")}</div>
    <div class="t-mag">M ${fmtMag(p.mag)} · ${type2pl(p.type)}</div>
    <div style="color:var(--muted);margin-top:4px">
      głębokość: ${fmtNum(d.geometry.coordinates[2])} km<br/>
      ${new Date(p.time).toLocaleString("pl-PL")}
    </div>
  `).classed("visible", true);
  moveTooltip(event);
}
function moveTooltip(event) {
  tooltip.style("left", event.clientX + "px").style("top", event.clientY + "px");
}
function hideTooltip() { tooltip.classed("visible", false); }

function showDetails(d) {
  const p = d.properties;
  const [lon, lat, depth] = d.geometry.coordinates;
  d3.select("#details-body").html(`
    <div class="kv"><span class="k">Miejsce</span><span class="v" style="text-align:right;max-width:170px">${escapeHtml(p.place || "—")}</span></div>
    <div class="kv"><span class="k">Magnituda</span><span class="v">${fmtMag(p.mag)} ${escapeHtml(p.magType || "")}</span></div>
    <div class="kv"><span class="k">Głębokość</span><span class="v">${fmtNum(depth)} km</span></div>
    <div class="kv"><span class="k">Współrzędne</span><span class="v">${fmtNum(lat)}, ${fmtNum(lon)}</span></div>
    <div class="kv"><span class="k">Czas (UTC)</span><span class="v">${new Date(p.time).toISOString().replace("T", " ").slice(0, 19)}</span></div>
    <div class="kv"><span class="k">Istotność</span><span class="v">${p.sig ?? "—"}</span></div>
    <div class="kv"><span class="k">Odczute przez</span><span class="v">${p.felt ?? "—"}</span></div>
    <div class="kv"><span class="k">Tsunami</span><span class="v">${p.tsunami ? "tak" : "nie"}</span></div>
    <div class="kv"><span class="k">Status</span><span class="v">${escapeHtml(p.status || "—")}</span></div>
    <div class="kv"><span class="k">Typ</span><span class="v">${escapeHtml(type2pl(p.type))}</span></div>
    <p class="footer-note"><a href="${escapeHtml(p.url || "#")}" target="_blank" rel="noopener">Karta zdarzenia w USGS →</a></p>
  `);
}

// =====================================================================
// status / statystyki
// =====================================================================
function setStatus(text) { document.getElementById("status-text").textContent = text; }
function updateStats() {
  document.getElementById("stat-total").textContent = state.features.length;
  const max = d3.max(state.features, f => f.properties.mag) ?? null;
  document.getElementById("stat-max").textContent = max != null ? fmtMag(max) : "—";
  document.getElementById("stat-gen").textContent = state.generated
    ? new Date(state.generated).toISOString().replace("T", " ").slice(0, 19)
    : "—";
}
function tickCountdown() {
  if (!state.nextRefreshAt) return;
  const remaining = Math.max(0, Math.round((state.nextRefreshAt - Date.now()) / 1000));
  document.getElementById("stat-next").textContent = remaining + " s";
}
setInterval(tickCountdown, 1000);

// =====================================================================
// interakcja: pan + zoom (czyste 2D)
// =====================================================================
function attachInteraction() {
  const zoom = d3.zoom()
    .scaleExtent([1, 12])
    .on("zoom", (event) => {
      state.zoomK = event.transform.k;
      root.attr("transform", event.transform);
      // przeskaluj rozmiary znaczników, żeby nie puchły razem z mapą
      redrawQuakes();
    });
  svg.call(zoom);
  svg.node().__zoom__ = zoom;
}

function resetView() {
  const z = svg.node().__zoom__;
  if (z) svg.transition().duration(400).call(z.transform, d3.zoomIdentity);
}

// =====================================================================
// kontrolki
// =====================================================================
function attachControls() {
  document.getElementById("feed").addEventListener("change", (e) => {
    state.feed = e.target.value;
    loadFeed();
  });
  const magInput = document.getElementById("mag");
  const magLabel = document.getElementById("mag-label");
  magInput.addEventListener("input", (e) => {
    state.magMin = +e.target.value;
    magLabel.textContent = "≥ " + state.magMin.toFixed(1);
    redrawQuakes();
  });
  document.getElementById("refresh").addEventListener("click", loadFeed);
  document.getElementById("reset").addEventListener("click", resetView);
}

// =====================================================================
// utils
// =====================================================================
const fmtMag = (v) => v == null ? "—" : (+v).toFixed(1);
const fmtNum = (v) => v == null || isNaN(v) ? "—" : (+v).toFixed(2);
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function type2pl(t) {
  const map = {
    "earthquake": "trzęsienie ziemi",
    "quarry blast": "wybuch w kamieniołomie",
    "explosion": "eksplozja",
    "ice quake": "trzęsienie lodu",
    "mining explosion": "eksplozja górnicza",
    "rock burst": "tąpnięcie",
    "nuclear explosion": "eksplozja nuklearna",
  };
  return map[t] || t || "—";
}

// =====================================================================
// start
// =====================================================================
(async function init() {
  attachControls();
  attachInteraction();
  resize();
  await loadCountries();
  redrawBase();
  await loadFeed();
  setInterval(loadFeed, REFRESH_MS);
})();
