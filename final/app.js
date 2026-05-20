/* global d3, topojson */
// =====================================================================
// Aktywność sejsmiczna Ziemi — wizualizacja USGS (etap roboczy)
// D3 v7 + topojson-client. Brak budowania, otwórz index.html w przeglądarce.
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
const rScale = d3.scaleSqrt().domain([0, 8]).range([1.5, 22]).clamp(true);
// głębokość (0..700 km) -> kolor
const depthScale = d3.scaleSequential(d3.interpolateInferno).domain([0, 700]);
// istotność (sig 0..1000) -> rozmiar halo dodawany do promienia
const haloScale = d3.scaleLinear().domain([0, 1000]).range([0, 18]).clamp(true);
// felt (liczba zgłoszeń) -> promień fali
const feltScale = d3.scaleSqrt().domain([0, 5000]).range([0, 60]).clamp(true);

// =====================================================================
// SVG + projekcja
// =====================================================================
const svg = d3.select("#map");
const tooltip = d3.select("#tooltip");

const defs = svg.append("defs");
// gradient legendy głębokości
const grad = defs.append("linearGradient")
  .attr("id", "depth-grad").attr("x1", "0%").attr("x2", "100%");
d3.range(0, 1.0001, 0.05).forEach(t => {
  grad.append("stop").attr("offset", `${t * 100}%`)
      .attr("stop-color", depthScale(t * 700));
});
document.getElementById("depth-gradient").style.background =
  `linear-gradient(to right, ${d3.range(0, 1.01, 0.05).map(t =>
    `${depthScale(t * 700)} ${t * 100}%`).join(", ")})`;

const projection = d3.geoOrthographic()
  .precision(0.5)
  .clipAngle(90);

const path = d3.geoPath(projection);

// warstwy
const gSphere     = svg.append("g");
const gGraticule  = svg.append("g");
const gCountries  = svg.append("g");
const gQuakes     = svg.append("g").attr("class", "quakes");

// =====================================================================
// rozmiar / resize
// =====================================================================
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  svg.attr("width", w).attr("height", h).attr("viewBox", `0 0 ${w} ${h}`);
  const scale = Math.min(w, h) * 0.45;
  projection.translate([w / 2, h / 2]).scale(scale);
  redrawBase();
  redrawQuakes();
}
window.addEventListener("resize", resize);

// =====================================================================
// stan aplikacji
// =====================================================================
const state = {
  feed: "day",
  magMin: 0,
  features: [],
  generated: null,
  selectedId: null,
  countries: null,
  graticule: d3.geoGraticule10(),
  sphere: { type: "Sphere" },
  nextRefreshAt: null,
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
function isVisible(feature) {
  const [lon, lat] = feature.geometry.coordinates;
  // ortografia ukrywa drugą półkulę — zasłonięte punkty pomijamy
  const rotate = projection.rotate();
  const lambda = -rotate[0];
  const phi    = -rotate[1];
  const cosC = Math.sin(phi * Math.PI / 180) * Math.sin(lat * Math.PI / 180) +
               Math.cos(phi * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
               Math.cos((lon - lambda) * Math.PI / 180);
  return cosC >= 0;
}

function redrawQuakes() {
  const now = Date.now();
  const filtered = state.features.filter(f => {
    const m = f.properties.mag ?? 0;
    return m >= state.magMin && f.geometry?.coordinates?.length >= 2;
  });

  document.getElementById("stat-visible").textContent = filtered.length;

  // sortujemy: najsłabsze pod spodem, najsilniejsze na wierzchu
  filtered.sort((a, b) => (a.properties.mag ?? 0) - (b.properties.mag ?? 0));

  const join = gQuakes.selectAll("g.quake-group")
    .data(filtered, d => d.id);

  join.exit().remove();

  const enter = join.enter().append("g").attr("class", "quake-group");

  // 1. fala "felt" (najpierw, pod znacznikiem)
  enter.append("circle").attr("class", "quake-wave");
  // 2. halo istotności
  enter.append("circle").attr("class", "quake-halo");
  // 3. pierścień tsunami
  enter.append("circle").attr("class", "quake-tsu");
  // 4. główny znacznik (kółko / kwadrat / trójkąt zależnie od type)
  enter.append("path").attr("class", "quake quake-marker");

  const all = enter.merge(join);

  all.each(function (d) {
    const [lon, lat, depth] = d.geometry.coordinates;
    const visible = isVisible(d);
    const node = d3.select(this);
    node.style("display", visible ? null : "none");
    if (!visible) return;

    const [x, y] = projection([lon, lat]);
    const mag    = d.properties.mag ?? 0;
    const sig    = d.properties.sig ?? 0;
    const felt   = d.properties.felt ?? 0;
    const tsu    = d.properties.tsunami === 1;
    const type   = d.properties.type || "earthquake";
    const stat   = d.properties.status || "automatic";
    const ageH   = (now - d.properties.time) / 3.6e6; // wiek w godzinach
    const fresh  = ageH < 1;
    const opacity = d3.scaleLinear()
      .domain([0, ageMax(state.feed)])
      .range([1, 0.18]).clamp(true)(ageH);

    const r = rScale(mag);
    const haloR = r + haloScale(sig);
    const waveR = r + feltScale(felt);

    // fala felt
    node.select(".quake-wave")
      .attr("cx", x).attr("cy", y)
      .attr("r", waveR)
      .attr("stroke-width", felt > 0 ? 1 : 0)
      .style("display", felt > 0 ? null : "none");

    // halo
    node.select(".quake-halo")
      .attr("cx", x).attr("cy", y)
      .attr("r", haloR)
      .attr("stroke", depthScale(Math.max(0, depth)))
      .attr("stroke-width", 1)
      .attr("stroke-opacity", 0.35);

    // tsunami
    node.select(".quake-tsu")
      .attr("cx", x).attr("cy", y)
      .attr("r", r + 4)
      .style("display", tsu ? null : "none");

    // główny marker
    const marker = node.select(".quake-marker")
      .attr("d", markerShape(type, r))
      .attr("transform", `translate(${x},${y})`)
      .attr("fill", depthScale(Math.max(0, depth)))
      .attr("fill-opacity", opacity)
      .attr("stroke", "#ffffff")
      .attr("stroke-opacity", 0.9)
      .attr("stroke-width", 1)
      .classed("stroke-dashed", stat === "automatic")
      .classed("stroke-solid",  stat !== "automatic")
      .classed("pulse", fresh);

    // interakcja
    marker
      .on("mouseenter", (e) => showTooltip(e, d))
      .on("mousemove",  (e) => moveTooltip(e))
      .on("mouseleave", hideTooltip)
      .on("click",      () => showDetails(d));
  });
}

function markerShape(type, r) {
  // type: earthquake (default), quarry blast, explosion, ice quake, ...
  switch (type) {
    case "quarry blast":
    case "explosion":
      // kwadrat
      return `M${-r},${-r} L${r},${-r} L${r},${r} L${-r},${r} Z`;
    case "ice quake":
    case "rock burst":
    case "mining explosion":
      // trójkąt
      return `M0,${-r} L${r},${r} L${-r},${r} Z`;
    default:
      // kółko via path (żeby nie mieszać <circle> i <path> w jednym slocie)
      return d3.symbol().type(d3.symbolCircle).size(Math.PI * r * r)();
  }
}

function ageMax(feed) {
  // skala starzenia w godzinach
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
// interakcja: obrót przeciągnięciem + zoom scrollem
// =====================================================================
function attachInteraction() {
  let v0, r0, q0;

  const drag = d3.drag()
    .on("start", (event) => {
      v0 = versor.cartesian(projection.invert([event.x, event.y]));
      r0 = projection.rotate();
      q0 = versor(r0);
    })
    .on("drag", (event) => {
      const v1 = versor.cartesian(projection.rotate(r0).invert([event.x, event.y]));
      const q1 = versor.multiply(q0, versor.delta(v0, v1));
      projection.rotate(versor.rotation(q1));
      redrawBase();
      redrawQuakes();
    });

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
    document.getElementById("stat-visible").textContent =
      state.features.filter(f => (f.properties.mag ?? 0) >= state.magMin).length;
  });
  document.getElementById("refresh").addEventListener("click", loadFeed);
  document.getElementById("reset").addEventListener("click", () => {
    projection.rotate([0, -10]);
    redrawBase();
    redrawQuakes();
  });
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
// versor — minimalna implementacja kwaternionów do obrotu projekcji
// (na potrzeby drag; bez dodatkowej zależności)
// =====================================================================
const versor = (function () {
  const radians = Math.PI / 180, degrees = 180 / Math.PI;
  function versor(e) {
    const l = e[0] / 2 * radians, sl = Math.sin(l), cl = Math.cos(l),
          p = e[1] / 2 * radians, sp = Math.sin(p), cp = Math.cos(p),
          g = e[2] / 2 * radians, sg = Math.sin(g), cg = Math.cos(g);
    return [
      cl * cp * cg + sl * sp * sg,
      sl * cp * cg - cl * sp * sg,
      cl * sp * cg + sl * cp * sg,
      cl * cp * sg - sl * sp * cg,
    ];
  }
  versor.cartesian = function (e) {
    const l = e[0] * radians, p = e[1] * radians, cp = Math.cos(p);
    return [cp * Math.cos(l), cp * Math.sin(l), Math.sin(p)];
  };
  versor.rotation = function (q) {
    return [
      Math.atan2(2 * (q[0] * q[1] + q[2] * q[3]), 1 - 2 * (q[1] * q[1] + q[2] * q[2])) * degrees,
      Math.asin(Math.max(-1, Math.min(1, 2 * (q[0] * q[2] - q[3] * q[1])))) * degrees,
      Math.atan2(2 * (q[0] * q[3] + q[1] * q[2]), 1 - 2 * (q[2] * q[2] + q[3] * q[3])) * degrees,
    ];
  };
  versor.delta = function (v0, v1, alpha = 1) {
    const w = cross(v0, v1), l = Math.sqrt(dot(w, w));
    if (!l) return [1, 0, 0, 0];
    const t = alpha * Math.acos(Math.max(-1, Math.min(1, dot(v0, v1)))) / 2,
          s = Math.sin(t);
    return [Math.cos(t), w[2] / l * s, -w[1] / l * s, w[0] / l * s];
  };
  versor.multiply = function (q1, q2) {
    return [
      q1[0]*q2[0] - q1[1]*q2[1] - q1[2]*q2[2] - q1[3]*q2[3],
      q1[0]*q2[1] + q1[1]*q2[0] + q1[2]*q2[3] - q1[3]*q2[2],
      q1[0]*q2[2] - q1[1]*q2[3] + q1[2]*q2[0] + q1[3]*q2[1],
      q1[0]*q2[3] + q1[1]*q2[2] - q1[2]*q2[1] + q1[3]*q2[0],
    ];
  };
  function cross(a, b) {
    return [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
  }
  function dot(a, b) {
    return a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  }
  return versor;
})();

// =====================================================================
// start
// =====================================================================
(async function init() {
  attachControls();
  attachInteraction();
  resize();
  projection.rotate([0, -10]);
  await loadCountries();
  redrawBase();
  await loadFeed();
  // auto-odświeżanie
  setInterval(loadFeed, REFRESH_MS);
})();
