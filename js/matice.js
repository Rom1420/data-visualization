// js/matice.js
// Choroplèthe par pays (échelle LOG) + hover + zoom pays.
// Zoom : Voronoi par ville si coords dispo, sinon panneau bar chart (fixe à l'écran).
// Panneau 5 filtres "investisseur" avec unités, repliable (auto-close au clic pays + bouton "Filtres" pour rouvrir).
// Anti-sélection au double-clic + bouton Retour.

(function () {
  if (typeof topojson === "undefined") {
    throw new Error(
      "topojson-client manquant. Ajoute <script src='https://cdn.jsdelivr.net/npm/topojson-client@3'></script>."
    );
  }

  const CSV_PATH = "../data/global_house_purchase_dataset.csv";
  const CITIES_COORDS = "../data/cities_latlon.csv"; // facultatif (country,city,lat,lon)
  const WORLD_URL =
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

  const OUT_OF_RANGE_FILL = "#f2f2f2";
  const HOVER_GLOW_COLOR = "#222";

  const COUNTRY_ALIAS = new Map([
    ["USA", "United States of America"],
    ["U.S.A.", "United States of America"],
    ["US", "United States of America"],
    ["UK", "United Kingdom"],
    ["UAE", "United Arab Emirates"],
  ]);

  // ---------- Conteneurs ----------
  const host = d3.select("#viz-container");
  host.html("");
  const root = host
    .append("div")
    .attr("id", "vis")
    .style("user-select", "none");

  const width = 980,
    height = 600;
  const svg = root
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .style("user-select", "none");

  const gSphere = svg.append("g");
  const gCountries = svg.append("g");
  const gCities = svg.append("g"); // cercles ville (Voronoi)
  const gVoronoi = svg.append("g"); // cellules Voronoi
  const gPanel = svg.append("g"); // panneau bar chart — FIXE (non zoomé)
  const gUI = svg.append("g"); // légende, bouton reset, notes

  // Tooltip
  const tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("position", "fixed")
    .style("pointer-events", "none")
    .style("padding", "6px 8px")
    .style("background", "rgba(0,0,0,.75)")
    .style("color", "#fff")
    .style("border-radius", "4px")
    .style("font", "12px system-ui,Segoe UI,Roboto,Arial")
    .style("opacity", 0);

  // Projection / path
  const projection = d3
    .geoNaturalEarth1()
    .fitSize([width, height], { type: "Sphere" });
  const path = d3.geoPath(projection);

  // defs: glow hover
  const defs = svg.append("defs");
  const glow = defs.append("filter").attr("id", "hover-glow");
  glow
    .append("feGaussianBlur")
    .attr("stdDeviation", 2)
    .attr("result", "coloredBlur");
  const feMerge = glow.append("feMerge");
  feMerge.append("feMergeNode").attr("in", "coloredBlur");
  feMerge.append("feMergeNode").attr("in", "SourceGraphic");

  // Bouton reset (cursor: pointer)
  const resetBtn = gUI
    .append("g")
    .attr("transform", `translate(20,20)`)
    .style("cursor", "pointer")
    .style("display", "none")
    .on("click", () => resetZoom());
  resetBtn
    .append("rect")
    .attr("width", 82)
    .attr("height", 28)
    .attr("rx", 6)
    .attr("fill", "#fff")
    .attr("stroke", "#ddd");
  resetBtn
    .append("text")
    .text("← Retour")
    .attr("x", 12)
    .attr("y", 18)
    .attr("font-size", 12)
    .attr("fill", "#333");

  // Fond
  gSphere
    .append("path")
    .attr("d", path({ type: "Sphere" }))
    .attr("fill", "#eef5ff");
  gSphere
    .append("path")
    .attr("d", path(d3.geoGraticule10()))
    .attr("stroke", "#cdd6e0")
    .attr("fill", "none")
    .attr("opacity", 0.5);

  // Légende (log)
  function drawLegendLog(minPos, maxVal) {
    const legendW = 160,
      legendH = 12,
      gradId = "legendGrad";
    const lgDefs = svg.append("defs");
    const lg = lgDefs
      .append("linearGradient")
      .attr("id", gradId)
      .attr("x1", "0%")
      .attr("x2", "100%");
    for (let i = 0; i <= 10; i++)
      lg.append("stop")
        .attr("offset", `${i * 10}%`)
        .attr("stop-color", d3.interpolateYlOrRd(i / 10));
    const legend = gUI
      .append("g")
      .attr("transform", `translate(${width - legendW - 20},${height - 88})`);
    legend
      .append("text")
      .text("Densité (log)")
      .attr("y", -6)
      .attr("font-size", 12)
      .attr("fill", "#333");
    legend
      .append("rect")
      .attr("width", legendW)
      .attr("height", legendH)
      .attr("fill", `url(#${gradId})`);
    legend
      .append("text")
      .text(minPos)
      .attr("y", legendH + 14)
      .attr("font-size", 11)
      .attr("fill", "#333");
    legend
      .append("text")
      .text(maxVal)
      .attr("x", legendW)
      .attr("y", legendH + 14)
      .attr("text-anchor", "end")
      .attr("font-size", 11)
      .attr("fill", "#333");
    legend
      .append("rect")
      .attr("x", 0)
      .attr("y", legendH + 24)
      .attr("width", 12)
      .attr("height", 12)
      .attr("fill", OUT_OF_RANGE_FILL)
      .attr("stroke", "#ddd");
    legend
      .append("text")
      .text("Hors tranche (0)")
      .attr("x", 18)
      .attr("y", legendH + 34)
      .attr("font-size", 11)
      .attr("fill", "#333");
  }

  // Empêche la sélection/zoom navigateur au dblclick pour dézoomer
  svg.on("dblclick", (event) => {
    event.preventDefault();
    resetZoom();
  });

  // ====== Panneau filtres avec unités + repliable ======
  const filterDiv = d3
    .select("body")
    .append("div")
    .attr("id", "filters-panel")
    .style("position", "fixed")
    .style("top", "20px")
    .style("right", "20px")
    .style("width", "300px")
    .style("background", "#ffffff")
    .style("border", "1px solid #e5e7eb")
    .style("border-radius", "10px")
    .style("box-shadow", "0 6px 24px rgba(0,0,0,.08)")
    .style("padding", "12px 12px")
    .style("font", "12px system-ui,Segoe UI,Roboto,Arial")
    .style("color", "#111")
    .style("z-index", "999")
    .style("transition", "transform 280ms ease")
    .style("transform", "translateX(0)"); // expanded by default

  // Bouton flottant pour ré-ouvrir le panneau quand il est replié
  const filterToggle = d3
    .select("body")
    .append("div")
    .attr("id", "filters-toggle")
    .style("position", "fixed")
    .style("top", "24px")
    .style("right", "20px")
    .style("padding", "8px 12px")
    .style("background", "#111")
    .style("color", "#fff")
    .style("border-radius", "999px")
    .style("box-shadow", "0 6px 24px rgba(0,0,0,.12)")
    .style("font", "12px system-ui,Segoe UI,Roboto,Arial")
    .style("cursor", "pointer")
    .style("z-index", "1000")
    .style("display", "none") // caché tant que le panneau est ouvert
    .text("Filtres")
    .on("click", () => expandFilters());

  let filtersCollapsed = false;
  function collapseFilters() {
    if (filtersCollapsed) return;
    filterDiv.style("transform", "translateX(110%)");
    filterToggle.style("display", null); // montrer le bouton
    filtersCollapsed = true;
  }
  function expandFilters() {
    if (!filtersCollapsed) return;
    filterDiv.style("transform", "translateX(0)");
    filterToggle.style("display", "none");
    filtersCollapsed = false;
  }

  // petits styles pour suffixes d’unités dans inputs
  const unitStyle = "position:relative;display:flex;align-items:center;";
  const unitSpan =
    "position:absolute;right:8px;top:50%;transform:translateY(-50%);color:#666;font-size:11px;pointer-events:none;";
  const inputCss =
    "width:100%;padding:6px 22px 6px 8px;border:1px solid #ddd;border-radius:6px;";

  // contenu du panneau (boutons avec cursor:pointer)
  filterDiv.html(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <div style="font-weight:700;">Filtres investisseur</div>
      <button id="f-close" title="Replier" style="padding:4px 8px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;">→</button>
    </div>

    <div style="margin-bottom:8px;">
      <label style="display:block;margin-bottom:4px;">Prix minimum <span style="color:#666">(€)</span></label>
      <div style="${unitStyle}">
        <input type="number" id="f-price-min" placeholder="min" style="${inputCss}">
        <span style="${unitSpan}">€</span>
      </div>
    </div>

    <div style="margin-bottom:8px;">
      <label style="display:block;margin-bottom:4px;">Prix maximum <span style="color:#666">(€)</span></label>
      <div style="${unitStyle}">
        <input type="number" id="f-price-max" placeholder="max" style="${inputCss}">
        <span style="${unitSpan}">€</span>
      </div>
    </div>

    <div style="margin-bottom:8px;">
      <label style="display:block;margin-bottom:4px;">EMI / revenu (max) <span style="color:#666">(ratio 0–1)</span></label>
      <div style="${unitStyle}">
        <input type="number" step="0.01" id="f-emi-max" placeholder="0.35" style="${inputCss}">
        <span style="${unitSpan}">ratio</span>
      </div>
      <div style="color:#777;font-size:11px;margin-top:4px;">Ex. 0.35 = 35% du revenu</div>
    </div>

    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <input type="checkbox" id="f-legal-zero" style="cursor:pointer;">
      <label for="f-legal-zero" style="margin:0;cursor:pointer;">Dossiers légaux = 0 uniquement <span style="color:#666">(nb de cas)</span></label>
    </div>

    <div style="margin-bottom:8px;">
      <label style="display:block;margin-bottom:4px;">Note quartier (min) <span style="color:#666">(/10)</span></label>
      <div style="${unitStyle}">
        <input type="number" id="f-neigh-min" min="0" max="10" style="${inputCss}">
        <span style="${unitSpan}">/10</span>
      </div>
    </div>

    <div style="margin-bottom:10px;">
      <label style="display:block;margin-bottom:4px;">Criminalité (max) <span style="color:#666">(nb de cas)</span></label>
      <div style="${unitStyle}">
        <input type="number" id="f-crime-max" style="${inputCss}">
        <span style="${unitSpan}">cas</span>
      </div>
    </div>

    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button id="f-reset" style="padding:6px 10px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;">Réinitialiser</button>
      <button id="f-apply" style="padding:6px 10px;border:0;border-radius:6px;background:#111;color:#fff;cursor:pointer;">Appliquer</button>
    </div>
    <div id="f-stats" style="margin-top:6px;color:#555;"></div>
  `);

  // bouton de repli (flèche)
  document.getElementById("f-close").addEventListener("click", collapseFilters);

  const inputs = {
    priceMin: document.getElementById("f-price-min"),
    priceMax: document.getElementById("f-price-max"),
    emiMax: document.getElementById("f-emi-max"),
    legal0: document.getElementById("f-legal-zero"),
    neighMin: document.getElementById("f-neigh-min"),
    crimeMax: document.getElementById("f-crime-max"),
    apply: document.getElementById("f-apply"),
    reset: document.getElementById("f-reset"),
    stats: document.getElementById("f-stats"),
  };

  const filters = {
    priceMin: null,
    priceMax: null,
    emiMax: null,
    legal0: false,
    neighMin: null,
    crimeMax: null,
  };

  let rowsAll = [];
  let countries = [];
  let citiesCoordsGlobal = null;
  let legendDrawn = false;

  svg.on("dblclick", (event) => {
    event.preventDefault();
    resetZoom();
  });

  // ---------- MAIN ----------
  async function run() {
    const [rowsRes, worldRes, citiesRes] = await Promise.allSettled([
      d3.csv(CSV_PATH, d3.autoType),
      d3.json(WORLD_URL),
      d3.csv(CITIES_COORDS, d3.autoType), // facultatif
    ]);

    if (rowsRes.status !== "fulfilled" || worldRes.status !== "fulfilled") {
      throw new Error("Données/carte introuvables.");
    }

    rowsAll = rowsRes.value;
    citiesCoordsGlobal =
      citiesRes.status === "fulfilled" ? citiesRes.value : null;

    const world = worldRes.value;
    countries = topojson.feature(world, world.objects.countries).features;

    const pMin = d3.min(rowsAll, (d) => +d.price || 0) ?? 0;
    const pMax = d3.max(rowsAll, (d) => +d.price || 0) ?? 0;
    const crimeMax = d3.max(rowsAll, (d) => +d.crime_cases_reported || 0) ?? 0;
    const emiMax = d3.max(rowsAll, (d) => +d.emi_to_income_ratio || 0) ?? 0.5;

    inputs.priceMin.value = Math.floor(pMin);
    inputs.priceMax.value = Math.ceil(pMax);
    inputs.crimeMax.value = Math.ceil(crimeMax);
    inputs.neighMin.value = 0;
    inputs.emiMax.value = Math.min(0.5, +emiMax || 0.35).toFixed(2);

    applyFiltersAndRender();

    // actions boutons (cursor déjà en pointer via style)
    inputs.apply.addEventListener("click", () => {
      readFilters();
      applyFiltersAndRender();
    });
    inputs.reset.addEventListener("click", () => {
      inputs.priceMin.value = Math.floor(pMin);
      inputs.priceMax.value = Math.ceil(pMax);
      inputs.emiMax.value = Math.min(0.5, +emiMax || 0.35).toFixed(2);
      inputs.legal0.checked = false;
      inputs.neighMin.value = 0;
      inputs.crimeMax.value = Math.ceil(crimeMax);
      readFilters();
      applyFiltersAndRender();
    });

    // live-apply
    ["input", "change"].forEach((evt) => {
      [
        inputs.priceMin,
        inputs.priceMax,
        inputs.emiMax,
        inputs.legal0,
        inputs.neighMin,
        inputs.crimeMax,
      ].forEach((el) =>
        el.addEventListener(evt, () => {
          readFilters();
          applyFiltersAndRender();
        })
      );
    });
  }

  function readFilters() {
    filters.priceMin = toNum(inputs.priceMin.value);
    filters.priceMax = toNum(inputs.priceMax.value);
    filters.emiMax = toNum(inputs.emiMax.value);
    filters.legal0 = !!inputs.legal0.checked;
    filters.neighMin = toNum(inputs.neighMin.value);
    filters.crimeMax = toNum(inputs.crimeMax.value);
  }
  const toNum = (v) => (v === null || v === "" ? null : +v);

  function filterRows(rows) {
    return rows.filter((r) => {
      const price = +r.price || 0;
      const emi = +r.emi_to_income_ratio || 0;
      const legal = +r.legal_cases_on_property || 0;
      const neigh = +r.neighbourhood_rating || 0;
      const crime = +r.crime_cases_reported || 0;

      if (filters.priceMin !== null && price < filters.priceMin) return false;
      if (filters.priceMax !== null && price > filters.priceMax) return false;
      if (filters.emiMax !== null && emi > filters.emiMax) return false;
      if (filters.legal0 && legal !== 0) return false;
      if (filters.neighMin !== null && neigh < filters.neighMin) return false;
      if (filters.crimeMax !== null && crime > filters.crimeMax) return false;
      return true;
    });
  }

  function aggregate(rows) {
    const countryCol =
      rows[0]?.country !== undefined
        ? "country"
        : rows[0]?.Country !== undefined
        ? "Country"
        : "country";
    const cityCol =
      rows[0]?.city !== undefined
        ? "city"
        : rows[0]?.City !== undefined
        ? "City"
        : "city";

    const countsCountryName = new Map();
    const countsCity = new Map();

    for (const r of rows) {
      let c = (r[countryCol] || "").toString().trim();
      if (!c) continue;
      if (COUNTRY_ALIAS.has(c)) c = COUNTRY_ALIAS.get(c);

      const feat = countries.find((f) => f.properties?.name === c);
      const worldName = feat ? feat.properties.name : c;
      countsCountryName.set(
        worldName,
        (countsCountryName.get(worldName) || 0) + 1
      );

      const city = (r[cityCol] || "").toString().trim();
      if (city) {
        const key = `${worldName}|${city}`;
        countsCity.set(key, (countsCity.get(key) || 0) + 1);
      }
    }

    const byFeature = new Map();
    countries.forEach((f) => {
      const name = f.properties?.name;
      const val = countsCountryName.get(name) || 0;
      if (val > 0) byFeature.set(f, val);
    });

    return { byFeature, countsCity };
  }

  function renderMap(byFeature) {
    const vals = [...byFeature.values()];
    const minPos = d3.min(vals) || 1;
    let maxVal = d3.max(vals) || minPos;
    if (maxVal < minPos) maxVal = minPos;

    const colorCountry = d3
      .scaleLog()
      .domain([minPos, maxVal])
      .range([d3.interpolateYlOrRd(0.05), d3.interpolateYlOrRd(1)])
      .clamp(true);

    if (!legendDrawn) {
      drawLegendLog(minPos, maxVal);
      legendDrawn = true;
    }

    gCountries
      .selectAll("path.country")
      .data(countries, (d) => d.id)
      .join("path")
      .attr("class", "country")
      .attr("d", path)
      .attr("fill", (d) => {
        const v = byFeature.get(d) || 0;
        return v === 0 ? OUT_OF_RANGE_FILL : colorCountry(v);
      })
      .attr("stroke", "#fff")
      .attr("stroke-width", 0.6)
      .style("cursor", (d) =>
        (byFeature.get(d) || 0) > 0 ? "pointer" : "default"
      ) // <- pointeur sur pays cliquables
      .on("mousemove", (event, d) => {
        const name = d.properties.name;
        const val = byFeature.get(d) || 0;
        tooltip
          .style("opacity", 1)
          .html(`<strong>${name}</strong><br/>Biens: ${val}`)
          .style("left", event.clientX + 12 + "px")
          .style("top", event.clientY + 12 + "px");
      })
      .on("mouseleave", () => tooltip.style("opacity", 0))
      .on("mouseenter", function (event, d) {
        const val = byFeature.get(d) || 0;
        if (val > 0) {
          d3.select(this)
            .attr("stroke", HOVER_GLOW_COLOR)
            .attr("stroke-width", 1.5)
            .style("filter", "url(#hover-glow)")
            .raise();
        }
      })
      .on("mouseout", function () {
        d3.select(this)
          .attr("stroke", "#fff")
          .attr("stroke-width", 0.6)
          .style("filter", null);
      })
      .on("click", (event, d) => {
        const val = byFeature.get(d) || 0;
        if (val === 0) return;
        collapseFilters(); // <- auto-replier le panneau de filtres
        zoomCountry(d);
      });

    return colorCountry;
  }

  let countsCityCurrent = new Map();
  let colorCountryCurrent = null;

  function applyFiltersAndRender() {
    const filtered = filterRows(rowsAll);
    const { byFeature, countsCity } = aggregate(filtered);

    const totalProps = filtered.length;
    const nbCountries = new Set(
      filtered.map((r) => r.country || r.Country).filter(Boolean)
    ).size;
    const nbCities = new Set(
      filtered.map((r) => r.city || r.City).filter(Boolean)
    ).size;
    inputs.stats.innerText = `${totalProps} biens | ${nbCountries} pays | ${nbCities} villes`;

    gVoronoi.selectAll("*").remove();
    gCities.selectAll("*").remove();
    gPanel.selectAll("*").remove();
    resetBtn.style("display", "none");
    d3.selectAll([gCountries.node(), gCities.node(), gVoronoi.node()]).attr(
      "transform",
      null
    );

    colorCountryCurrent = renderMap(byFeature);
    countsCityCurrent = countsCity;
  }

  function zoomCountry(feature) {
    const b = path.bounds(feature);
    const dx = b[1][0] - b[0][0];
    const dy = b[1][1] - b[0][1];
    const x = (b[0][0] + b[1][0]) / 2;
    const y = (b[0][1] + b[1][1]) / 2;
    const scale = Math.min(8, 0.9 / Math.max(dx / width, dy / height));
    const translate = [width / 2 - scale * x, height / 2 - scale * y];

    d3.selectAll([gCountries.node(), gCities.node(), gVoronoi.node()])
      .transition()
      .duration(900)
      .attr("transform", `translate(${translate}) scale(${scale})`);

    resetBtn.style("display", null);

    gVoronoi.selectAll("*").remove();
    gCities.selectAll("*").remove();
    gPanel.selectAll("*").remove();
    gPanel.raise();

    const worldName = feature.properties.name;

    const entries = [];
    countsCityCurrent.forEach((count, key) => {
      const [kCountry, kCity] = key.split("|");
      if (kCountry === worldName) entries.push({ city: kCity, count });
    });

    if (entries.length === 0) {
      drawCityPanel(worldName, []);
    } else if (citiesCoordsGlobal && citiesCoordsGlobal.length) {
      drawCityVoronoi(feature, entries, citiesCoordsGlobal);
    } else {
      drawCityPanel(worldName, entries);
    }
  }

  function drawCityPanel(countryName, cityEntries) {
    const panelW = 320,
      panelH = 260,
      pad = 10;
    const container = gPanel
      .append("g")
      .attr("class", "city-panel")
      .attr("transform", `translate(24,24)`);

    container
      .append("rect")
      .attr("width", panelW)
      .attr("height", panelH)
      .attr("rx", 10)
      .attr("fill", "#fff")
      .attr("stroke", "#ddd");

    container
      .append("text")
      .text(`Villes — ${countryName}`)
      .attr("x", pad)
      .attr("y", 22)
      .attr("font-size", 13)
      .attr("fill", "#333");

    if (!cityEntries.length) {
      container
        .append("text")
        .text("Aucune ville disponible (après filtrage).")
        .attr("x", pad)
        .attr("y", 48)
        .attr("font-size", 12)
        .attr("fill", "#777");
      return;
    }

    cityEntries.sort((a, b) => d3.descending(a.count, b.count));
    const top = cityEntries.slice(0, 15);

    const x = d3
      .scaleLinear()
      .domain([0, d3.max(top, (d) => d.count) || 1])
      .range([0, panelW - pad * 2 - 80]);
    const y = d3
      .scaleBand()
      .domain(top.map((d) => d.city))
      .range([40, panelH - 16])
      .padding(0.12);

    const color = d3
      .scaleLog()
      .domain([
        Math.max(
          1,
          d3.min(top, (d) => d.count)
        ),
        d3.max(top, (d) => d.count) || 1,
      ])
      .range([d3.interpolateYlOrRd(0.15), d3.interpolateYlOrRd(1)])
      .clamp(true);

    container
      .selectAll("text.citylabel")
      .data(top)
      .join("text")
      .attr("class", "citylabel")
      .attr("x", pad)
      .attr("y", (d) => y(d.city) + y.bandwidth() * 0.7)
      .attr("font-size", 11)
      .attr("fill", "#444")
      .text((d) => d.city);

    container
      .selectAll("rect.bar")
      .data(top)
      .join("rect")
      .attr("class", "bar")
      .attr("x", pad + 80)
      .attr("y", (d) => y(d.city))
      .attr("height", y.bandwidth())
      .attr("width", (d) => x(d.count))
      .attr("fill", (d) => color(d.count))
      .on("mousemove", (event, d) => {
        tooltip
          .style("opacity", 1)
          .html(`<strong>${d.city}</strong><br/>Biens: ${d.count}`)
          .style("left", event.clientX + 12 + "px")
          .style("top", event.clientY + 12 + "px");
      })
      .on("mouseleave", () => tooltip.style("opacity", 0));
  }

  function drawCityVoronoi(feature, entries, citiesCoords) {
    const norm = (s) => s.toString().trim().toLowerCase();

    const idx = new Map();
    citiesCoords.forEach((r) => {
      idx.set(`${norm(r.country)}|${norm(r.city)}`, {
        lat: +r.lat,
        lon: +r.lon,
      });
    });

    const enriched = [];
    const pts = [];
    const worldName = feature.properties.name;
    const missing = [];

    entries.forEach((d) => {
      const key = `${norm(worldName)}|${norm(d.city)}`;
      const geo = idx.get(key);
      if (!geo || isNaN(geo.lat) || isNaN(geo.lon)) {
        missing.push(d.city);
        return;
      }
      const [px, py] = projection([geo.lon, geo.lat]);
      enriched.push({ ...d, x: px, y: py });
      pts.push([px, py]);
    });

    if (!enriched.length) {
      drawCityPanel(worldName, entries);
      return;
    }
    if (missing.length)
      note(
        `Villes sans coordonnées: ${missing.slice(0, 8).join(", ")}${
          missing.length > 8 ? "…" : ""
        }`
      );

    const minCity = d3.min(enriched, (d) => d.count) || 1;
    let maxCity = d3.max(enriched, (d) => d.count) || minCity;
    if (maxCity < minCity) maxCity = minCity;
    const colorCity = d3
      .scaleLog()
      .domain([minCity, maxCity])
      .range([d3.interpolateYlOrRd(0.05), d3.interpolateYlOrRd(1)])
      .clamp(true);

    const delaunay = d3.Delaunay.from(pts);
    const vor = delaunay.voronoi([0, 0, width, height]);

    const clipId = `clip-${feature.id || worldName.replace(/\W+/g, "_")}`;
    const defsClip = svg.select("defs");
    defsClip
      .append("clipPath")
      .attr("id", clipId)
      .append("path")
      .attr("d", path(feature));

    const vorGroup = gVoronoi.append("g").attr("clip-path", `url(#${clipId})`);

    enriched.forEach((d, i) => {
      const cellPath = vor.renderCell(i);
      if (!cellPath) return;
      vorGroup
        .append("path")
        .attr("d", cellPath)
        .attr("fill", colorCity(d.count))
        .attr("stroke", "rgba(255,255,255,0.6)")
        .attr("stroke-width", 0.6)
        .on("mousemove", (event) => {
          tooltip
            .style("opacity", 1)
            .html(`<strong>${d.city}</strong><br/>Biens: ${d.count}`)
            .style("left", event.clientX + 12 + "px")
            .style("top", event.clientY + 12 + "px");
        })
        .on("mouseleave", () => tooltip.style("opacity", 0));
    });

    gCities
      .selectAll("circle.city")
      .data(enriched, (d) => d.city)
      .join("circle")
      .attr("class", "city")
      .attr("cx", (d) => d.x)
      .attr("cy", (d) => d.y)
      .attr("r", 2.2)
      .attr("fill", "#111")
      .attr("stroke", "#fff")
      .attr("stroke-width", 0.4)
      .attr("opacity", 0.9);
  }

  function resetZoom() {
    gVoronoi.selectAll("*").remove();
    gCities.selectAll("*").remove();
    gPanel.selectAll("*").remove();
    d3.selectAll([gCountries.node(), gCities.node(), gVoronoi.node()])
      .transition()
      .duration(700)
      .attr("transform", null);
    resetBtn.style("display", "none");
  }

  function note(msg) {
    const n = gUI.selectAll("text.note").data([msg]);
    n.join(
      (enter) =>
        enter
          .append("text")
          .attr("class", "note")
          .attr("x", 20)
          .attr("y", height - 16)
          .attr("font-size", 12)
          .attr("fill", "#555")
          .text(msg),
      (update) => update.text(msg)
    );
    setTimeout(() => gUI.selectAll("text.note").remove(), 4000);
  }

  run().catch((err) => {
    console.error(err);
    d3.select("#viz-container")
      .append("p")
      .style("color", "crimson")
      .text(
        "Erreur de chargement/mapping. Ajoute (optionnel) cities_latlon.csv pour un découpage géographique par villes."
      );
  });
})();
