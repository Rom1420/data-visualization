// js/matice.js
// Carte choroplèthe (log) des biens par pays.
// VUE GLOBALE : points de villes (rayon ∝ √(comptage)) + clic ville => panneau "details on demand" (sans zoom).
// ZOOM PAYS   : treemap des villes (en haut du panneau) + détails pays en dessous (panneau scrollable).
// Fix label : texte du pays non-scalé (layer séparé). Contours noirs. Filtres dynamiques.

(function () {
  if (typeof topojson === "undefined") {
    throw new Error(
      "topojson-client manquant. Ajoute <script src='https://cdn.jsdelivr.net/npm/topojson-client@3'></script>."
    );
  }

  const CSV_PATH = "../data/global_house_purchase_dataset.csv";
  const WORLD_URL =
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
  const CITY_DB_LOCAL = "../data/worldcities.csv"; // city,country,lat,long

  const OUT_OF_RANGE_FILL = "#f2f2f2";
  const HOVER_GLOW_COLOR = "#222";

  // Treemap layout interne au panneau
  const PANEL_W = 420,
    PANEL_H = 460;
  const PANEL_X = 980 - PANEL_W - 18; // width - PANEL_W - margin
  const PANEL_Y = 20;
  const TREEMAP_H = 260; // hauteur réservée à la treemap dans le panneau focus

  const COUNTRY_ALIAS = new Map([
    ["USA", "United States of America"],
    ["U.S.A.", "United States of America"],
    ["US", "United States of America"],
    ["UK", "United Kingdom"],
    ["UAE", "United Arab Emirates"],
  ]);

  const normalize = (s) =>
    (s || "")
      .toString()
      .trim()
      .toLowerCase()
      .normalize("NFKD")
      .replace(/\p{Diacritic}/gu, "");

  // ---------- Conteneur ----------
  const host = d3.select("#viz-container");
  host.html("");
  const root = host
    .append("div")
    .attr("id", "vis")
    .style("user-select", "none")
    .style("max-width", "1000px")
    .style("margin", "0 auto");

  const width = 980,
    height = 600;
  const svg = root
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .style("display", "block")
    .style("margin", "0 auto")
    .style("user-select", "none");

  // Couches
  const gSphere = svg.append("g");
  const gCountries = svg.append("g");
  const gFocus = svg.append("g"); // polygone pays zoomé (scalé)
  const gLabels = svg.append("g"); // labels non-scalés
  const gCities = svg.append("g"); // points VILLES (vue globale uniquement)
  const gDetail = svg.append("g"); // panneau treemap/détails (droite)
  const gUI = svg.append("g"); // légende, boutons

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

  // defs: hover glow
  const defs = svg.append("defs");
  const glow = defs.append("filter").attr("id", "hover-glow");
  glow
    .append("feGaussianBlur")
    .attr("stdDeviation", 2)
    .attr("result", "coloredBlur");
  const feMerge = glow.append("feMerge");
  feMerge.append("feMergeNode").attr("in", "coloredBlur");
  feMerge.append("feMergeNode").attr("in", "SourceGraphic");

  // Bouton reset
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

  // Toggle treemap +/− (visible en focus pays)
  let treemapVisible = true;
  const treemapToggle = gUI
    .append("g")
    .attr("transform", `translate(${width - 48},20)`)
    .style("cursor", "pointer")
    .style("display", "none")
    .on("click", () => {
      treemapVisible = !treemapVisible;
      gDetail
        .selectAll(".treemap-block")
        .style("display", treemapVisible ? null : "none");
      treemapToggle.select("text").text(treemapVisible ? "−" : "+");
      treemapToggle
        .select("title")
        .text(treemapVisible ? "Masquer la treemap" : "Afficher la treemap");
    });
  treemapToggle
    .append("rect")
    .attr("width", 28)
    .attr("height", 28)
    .attr("rx", 6)
    .attr("fill", "#fff")
    .attr("stroke", "#ddd");
  treemapToggle
    .append("text")
    .attr("x", 14)
    .attr("y", 18)
    .attr("text-anchor", "middle")
    .attr("font-size", 18)
    .attr("font-weight", 700)
    .attr("fill", "#333")
    .text("−");
  treemapToggle.append("title").text("Masquer la treemap");

  // Fond + graticule
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

  function drawLegendLog(minPos, maxVal) {
    gUI.selectAll(".legend").remove();

    const legendW = 180,
      legendH = 12,
      gradId = "legendGradDyn";
    const lg = defs.select(`#${gradId}`).empty()
      ? defs
          .append("linearGradient")
          .attr("id", gradId)
          .attr("x1", "0%")
          .attr("x2", "100%")
      : defs.select(`#${gradId}`);
    lg.selectAll("stop").remove();
    for (let i = 0; i <= 10; i++) {
      lg.append("stop")
        .attr("offset", `${i * 10}%`)
        .attr("stop-color", d3.interpolateYlOrRd(i / 10));
    }

    const legend = gUI
      .append("g")
      .attr("class", "legend")
      .attr("transform", `translate(${width - legendW - 20},${height - 88})`);

    legend
      .append("text")
      .text("Densité de biens (log)")
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

  svg.on("dblclick", (event) => {
    event.preventDefault();
    resetZoom();
  });

  // ====== Filtres (locaux, sous la viz) ======
  const filterWrapper = root
    .append("div")
    .attr("id", "filters-wrapper")
    .style("max-width", `${width}px`)
    .style("margin", "14px auto 0 auto");

  const filterToggle = filterWrapper
    .append("button")
    .attr("id", "filters-toggle")
    .text("Filtres")
    .style("display", "none")
    .style("padding", "8px 12px")
    .style("border", "0")
    .style("border-radius", "8px")
    .style("background", "#111")
    .style("color", "#fff")
    .style("cursor", "pointer")
    .style("box-shadow", "0 6px 24px rgba(0,0,0,.12)");

  const filterDiv = filterWrapper
    .append("div")
    .attr("id", "filters-panel")
    .style("background", "#ffffff")
    .style("border", "1px solid #e5e7eb")
    .style("border-radius", "10px")
    .style("box-shadow", "0 6px 24px rgba(0,0,0,.08)")
    .style("padding", "12px")
    .style("font", "12px system-ui,Segoe UI,Roboto,Arial")
    .style("color", "#111");

  const unitStyle = "position:relative;display:flex;align-items:center;";
  const unitSpan =
    "position:absolute;right:8px;top:50%;transform:translateY(-50%);color:#666;font-size:11px;pointer-events:none;";
  const inputCss =
    "width:100%;padding:6px 22px 6px 8px;border:1px solid #ddd;border-radius:6px;";

  filterDiv.html(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <div style="font-weight:700;">Filtres investisseur</div>
      <button id="f-close" title="Replier" style="padding:4px 8px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;">Replier</button>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div>
        <label style="display:block;margin-bottom:4px;">Prix minimum <span style="color:#666">(€)</span></label>
        <div style="${unitStyle}">
          <input type="number" id="f-price-min" placeholder="min" style="${inputCss}">
          <span style="${unitSpan}">€</span>
        </div>
      </div>

      <div>
        <label style="display:block;margin-bottom:4px;">Prix maximum <span style="color:#666">(€)</span></label>
        <div style="${unitStyle}">
          <input type="number" id="f-price-max" placeholder="max" style="${inputCss}">
          <span style="${unitSpan}">€</span>
        </div>
      </div>

      <div>
        <label style="display:block;margin-bottom:4px;">EMI / revenu (max) <span style="color:#666">(ratio 0–1)</span></label>
        <div style="${unitStyle}">
          <input type="number" step="0.01" id="f-emi-max" placeholder="0.35" style="${inputCss}">
          <span style="${unitSpan}">ratio</span>
        </div>
        <div style="color:#777;font-size:11px;margin-top:4px;">Ex. 0.35 = 35% du revenu</div>
      </div>

      <div style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="f-legal-zero" style="cursor:pointer;">
        <label for="f-legal-zero" style="margin:0;cursor:pointer;">Dossiers légaux = 0 uniquement <span style="color:#666">(nb de cas)</span></label>
      </div>

      <div>
        <label style="display:block;margin-bottom:4px;">Note quartier (min) <span style="color:#666">(/10)</span></label>
        <div style="${unitStyle}">
          <input type="number" id="f-neigh-min" min="0" max="10" style="${inputCss}">
          <span style="${unitSpan}">/10</span>
        </div>
      </div>

      <div>
        <label style="display:block;margin-bottom:4px;">Criminalité (max) <span style="color:#666">(nb de cas)</span></label>
        <div style="${unitStyle}">
          <input type="number" id="f-crime-max" style="${inputCss}">
          <span style="${unitSpan}">cas</span>
        </div>
      </div>
    </div>

    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
      <button id="f-reset" style="padding:6px 10px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;">Réinitialiser</button>
      <button id="f-apply" style="padding:6px 10px;border:0;border-radius:6px;background:#111;color:#fff;cursor:pointer;">Appliquer</button>
    </div>
    <div id="f-stats" style="margin-top:6px;color:#555;"></div>
  `);

  const collapseFilters = () => {
    filterDiv.style("display", "none");
    filterToggle.style("display", null);
  };
  const expandFilters = () => {
    filterDiv.style("display", null);
    filterToggle.style("display", "none");
  };
  filterWrapper.select("#f-close").on("click", collapseFilters);
  filterToggle.on("click", expandFilters);

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

  // Données & état
  let rowsAll = [];
  let countries = [];
  let countsCityCurrent = new Map();
  let rowsFilteredCurrent = [];
  let cityDB = [];
  let countriesByName = new Map(); // name -> feature
  let cityIndex = null; // city name -> candidates

  // MAIN
  async function run() {
    const [rowsRes, worldRes, citiesRes] = await Promise.allSettled([
      d3.csv(CSV_PATH, d3.autoType),
      d3.json(WORLD_URL),
      d3.csv(CITY_DB_LOCAL, d3.autoType),
    ]);

    if (rowsRes.status !== "fulfilled" || worldRes.status !== "fulfilled") {
      throw new Error("Données/carte introuvables.");
    }

    rowsAll = rowsRes.value;
    const world = worldRes.value;
    countries = topojson.feature(world, world.objects.countries).features;
    countriesByName = new Map(countries.map((f) => [f.properties?.name, f]));

    if (citiesRes.status === "fulfilled") {
      cityDB = citiesRes.value; // city,country,lat,long
      buildCityIndex();
    } else {
      console.warn("DB villes non chargée – points globaux désactivés.");
    }

    // init filtres
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

  function buildCityIndex() {
    cityIndex = new Map();
    for (const r of cityDB) {
      const name = (r.city || "").toString().trim();
      const lat = +r.lat;
      const lon = +(r.lng ?? r.lon ?? r.long);
      if (!name || !isFinite(lat) || !isFinite(lon)) continue;
      const key = normalize(name);
      const cur = cityIndex.get(key) || [];
      cur.push({ city: name, country: r.country, lat, lon });
      cityIndex.set(key, cur);
    }
  }

  function readFilters() {
    const toNum = (v) => (v === null || v === "" ? null : +v);
    filters.priceMin = toNum(inputs.priceMin.value);
    filters.priceMax = toNum(inputs.priceMax.value);
    filters.emiMax = toNum(inputs.emiMax.value);
    filters.legal0 = !!inputs.legal0.checked;
    filters.neighMin = toNum(inputs.neighMin.value);
    filters.crimeMax = toNum(inputs.crimeMax.value);
  }

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
    const countsCity = new Map(); // `${country}|${city}` -> count

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

    drawLegendLog(minPos, maxVal);

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
      .attr("stroke", "#000")
      .attr("stroke-width", 0.5)
      .style("cursor", (d) =>
        (byFeature.get(d) || 0) > 0 ? "pointer" : "default"
      )
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
          .attr("stroke", "#000")
          .attr("stroke-width", 0.5)
          .style("filter", null);
      })
      .on("click", (event, d) => {
        const val = byFeature.get(d) || 0;
        if (val === 0) return;
        collapseFilters();
        zoomCountry(d);
      });

    return colorCountry;
  }

  // Helpers stats
  const fmt = d3.format(",.0f");
  const fmt1 = d3.format(",.1f");
  function median(arr) {
    if (!arr.length) return 0;
    const a = arr.slice().sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function summarize(rows) {
    const n = rows.length;
    if (!n) return { n: 0 };
    const prices = rows.map((d) => +d.price || 0);
    const rooms = rows.map((d) => +d.rooms || 0);
    const baths = rows.map((d) => +d.bathrooms || 0);
    const emi = rows.map((d) => +d.emi_to_income_ratio || 0);
    const neigh = rows.map((d) => +d.neighbourhood_rating || 0);
    const crime = rows.map((d) => +d.crime_cases_reported || 0);
    const legal0 = rows.map((d) =>
      (+d.legal_cases_on_property || 0) === 0 ? 1 : 0
    );

    return {
      n,
      avgPrice: d3.mean(prices) || 0,
      medPrice: median(prices),
      minPrice: d3.min(prices) || 0,
      maxPrice: d3.max(prices) || 0,
      avgRooms: d3.mean(rooms) || 0,
      avgBaths: d3.mean(baths) || 0,
      avgEmi: d3.mean(emi) || 0,
      avgNeigh: d3.mean(neigh) || 0,
      avgCrime: d3.mean(crime) || 0,
      pctLegal0: (d3.mean(legal0) || 0) * 100,
    };
  }

  function detailsHTML(title, stats, extraBlocks = []) {
    // Retourne un bloc HTML (string) pour le foreignObject
    if (!stats || !stats.n) {
      return `<div style="padding:10px;color:#555;">Aucune donnée disponible pour <strong>${title}</strong> (après filtrage).</div>`;
    }
    const blocks = [
      `<div style="font-weight:700;margin-bottom:6px;">${title}</div>`,
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;">
        <div><span style="color:#666">Biens</span><br><strong>${fmt(
          stats.n
        )}</strong></div>
        <div><span style="color:#666">Prix moyen (€)</span><br><strong>${fmt(
          stats.avgPrice
        )}</strong></div>
        <div><span style="color:#666">Prix médian (€)</span><br><strong>${fmt(
          stats.medPrice
        )}</strong></div>
        <div><span style="color:#666">Min–Max (€)</span><br><strong>${fmt(
          stats.minPrice
        )} – ${fmt(stats.maxPrice)}</strong></div>
        <div><span style="color:#666">Pièces moy.</span><br><strong>${fmt1(
          stats.avgRooms
        )}</strong></div>
        <div><span style="color:#666">Sdb moy.</span><br><strong>${fmt1(
          stats.avgBaths
        )}</strong></div>
        <div><span style="color:#666">EMI / revenu (moy.)</span><br><strong>${fmt1(
          stats.avgEmi
        )}</strong></div>
        <div><span style="color:#666">Note quartier (moy.)</span><br><strong>${fmt1(
          stats.avgNeigh
        )}</strong></div>
        <div><span style="color:#666">Criminalité (moy.)</span><br><strong>${fmt1(
          stats.avgCrime
        )}</strong></div>
        <div><span style="color:#666">% dossiers légaux = 0</span><br><strong>${fmt1(
          stats.pctLegal0
        )}%</strong></div>
      </div>`,
    ];
    if (extraBlocks.length) blocks.push(...extraBlocks);
    return `<div style="padding:10px;">${blocks.join("")}</div>`;
  }

  function applyFiltersAndRender() {
    rowsFilteredCurrent = filterRows(rowsAll);
    const { byFeature, countsCity } = aggregate(rowsFilteredCurrent);

    const totalProps = rowsFilteredCurrent.length;
    const nbCountries = new Set(
      rowsFilteredCurrent.map((r) => r.country || r.Country).filter(Boolean)
    ).size;
    const nbCities = new Set(
      rowsFilteredCurrent.map((r) => r.city || r.City).filter(Boolean)
    ).size;
    inputs.stats.innerText = `${totalProps} biens | ${nbCountries} pays | ${nbCities} villes`;

    // Reset couches détail / labels / points
    gDetail.selectAll("*").remove();
    gFocus.selectAll("*").remove();
    gCities.selectAll("*").remove();
    gLabels.selectAll("*").remove();
    resetBtn.style("display", "none");
    treemapToggle.style("display", "none");

    d3.selectAll([gCountries.node(), gFocus.node(), gCities.node()]).attr(
      "transform",
      null
    );

    // Vue monde visible
    gSphere.style("display", null);
    gCountries.style("display", null);

    // Carte pays
    renderMap(byFeature);
    countsCityCurrent = countsCity;

    // Points des villes en VUE GLOBALE
    if (cityIndex) drawGlobalCityPoints(countsCityCurrent);
  }

  // ----- POINTS VILLES — VUE GLOBALE -----
  function drawGlobalCityPoints(countsCity) {
    const enriched = [];
    const values = [];

    countsCity.forEach((count, key) => {
      const [worldName, cityName] = key.split("|");
      const candidates = cityIndex.get(normalize(cityName));
      if (!candidates || !candidates.length) return;

      const feat = countriesByName.get(worldName);
      let chosen = null;

      if (feat) {
        for (const c of candidates) {
          if (d3.geoContains(feat, [c.lon, c.lat])) {
            chosen = c;
            break;
          }
        }
      }
      if (!chosen) chosen = candidates[0];

      const [x, y] = projection([chosen.lon, chosen.lat]);
      enriched.push({
        city: chosen.city,
        country: worldName,
        value: count,
        x,
        y,
      });
      values.push(count);
    });

    if (!enriched.length) return;

    const minV = d3.min(values) || 1;
    let maxV = d3.max(values) || minV;
    if (maxV < minV) maxV = minV;

    const rScale = d3.scaleSqrt().domain([minV, maxV]).range([1.8, 7]);

    const sel = gCities
      .selectAll("g.city-pt")
      .data(enriched, (d) => `${d.country}|${d.city}`);

    const enter = sel
      .enter()
      .append("g")
      .attr("class", "city-pt")
      .attr("transform", (d) => `translate(${d.x},${d.y})`)
      .style("pointer-events", "auto")
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        // Ouvre panneau DoD ville (sans zoom)
        openCityDetailsPanel(d.country, d.city);
      });

    enter
      .append("circle")
      .attr("r", (d) => rScale(d.value))
      .attr("fill", "#111")
      .attr("opacity", 0.85)
      .attr("stroke", "#fff")
      .attr("stroke-width", 0.6);

    enter
      .on("mousemove", (event, d) => {
        tooltip
          .style("opacity", 1)
          .html(
            `<strong>${d.city}</strong> — ${d.country}<br/>Biens: ${d.value}`
          )
          .style("left", event.clientX + 12 + "px")
          .style("top", event.clientY + 12 + "px");
      })
      .on("mouseleave", () => tooltip.style("opacity", 0));
  }

  // ----- Panneau DoD VILLE (vue globale, pas de zoom) -----
  function openCityDetailsPanel(countryName, cityName) {
    // Nettoie panneau et affiche un panneau au format identique
    gDetail.selectAll("*").remove();

    const panel = gDetail
      .append("g")
      .attr("transform", `translate(${PANEL_X},${PANEL_Y})`);

    // Card
    panel
      .append("rect")
      .attr("width", PANEL_W)
      .attr("height", PANEL_H)
      .attr("rx", 12)
      .attr("fill", "#ffffff")
      .attr("stroke", "#e5e7eb");

    // Header
    panel
      .append("text")
      .text(`Détails — ${cityName}, ${countryName}`)
      .attr("x", 16)
      .attr("y", 22)
      .attr("font-size", 13)
      .attr("font-weight", 700)
      .attr("fill", "#333");

    // Contenu scrollable via foreignObject
    const inner = panel
      .append("foreignObject")
      .attr("x", 12)
      .attr("y", 30)
      .attr("width", PANEL_W - 24)
      .attr("height", PANEL_H - 42);

    const container = inner
      .append("xhtml:div")
      .style("width", PANEL_W - 24 + "px")
      .style("height", PANEL_H - 42 + "px")
      .style("overflow", "auto")
      .style("font", "12px system-ui,Segoe UI,Roboto,Arial")
      .style("color", "#111");

    // Sous-échantillon de rows filtrées
    const cityRows = rowsFilteredCurrent.filter((r) => {
      const ctry = countriesByName.has(r.country)
        ? r.country
        : COUNTRY_ALIAS.get(r.country) || r.country;
      return ctry === countryName && (r.city || r.City) === cityName;
    });

    const stats = summarize(cityRows);
    container.html(detailsHTML(`Ville : ${cityName}`, stats));
  }

  // ----- ZOOM PAYS -> TREEMAP + DÉTAILS PAYS -----
  function zoomCountry(feature) {
    const b = path.bounds(feature);
    const dx = b[1][0] - b[0][0];
    const dy = b[1][1] - b[0][1];
    const x = (b[0][0] + b[1][0]) / 2;
    const y = (b[0][1] + b[1][1]) / 2;
    const scale = Math.min(8, 0.9 / Math.max(dx / width, dy / height));
    const translate = [width / 2 - scale * x, height / 2 - scale * y];

    // Masquer monde
    gSphere.style("display", "none");
    gCountries.style("display", "none");

    // Nettoyer détail & points & labels
    gDetail.selectAll("*").remove();
    gFocus.selectAll("*").remove();
    gCities.selectAll("*").remove();
    gLabels.selectAll("*").remove();

    // Fond blanc du pays (polygone SCALÉ)
    gFocus
      .attr("transform", `translate(${translate}) scale(${scale})`)
      .append("path")
      .attr("d", path(feature))
      .attr("fill", "#fff")
      .attr("stroke", "#666")
      .attr("stroke-width", 0.8);

    // Label NON-SCALÉ
    const c = path.centroid(feature);
    const screenX = translate[0] + scale * c[0];
    const screenY = translate[1] + scale * c[1];
    gLabels
      .append("text")
      .attr("class", "country-label")
      .attr("x", screenX)
      .attr("y", screenY - 12)
      .attr("font-size", 14)
      .attr("font-weight", 700)
      .attr("fill", "#333")
      .attr("text-anchor", "middle")
      .text(feature.properties.name);

    resetBtn.style("display", null);
    treemapToggle.style("display", null);
    treemapToggle.select("text").text(treemapVisible ? "−" : "+");
    treemapToggle
      .select("title")
      .text(treemapVisible ? "Masquer la treemap" : "Afficher la treemap");

    // Données villes du pays (post-filtrage)
    const worldName = feature.properties.name;
    const entries = [];
    countsCityCurrent.forEach((count, key) => {
      const [kCountry, kCity] = key.split("|");
      if (kCountry === worldName) entries.push({ city: kCity, value: count });
    });

    // Panneau treemap + détails (scroll)
    drawCountryPanel(worldName, entries);
  }

  // Panneau pays = treemap (haut) + détails (bas, scroll)
  function drawCountryPanel(countryName, cityEntries) {
    const panel = gDetail
      .append("g")
      .attr("transform", `translate(${PANEL_X},${PANEL_Y})`);

    // Card
    panel
      .append("rect")
      .attr("width", PANEL_W)
      .attr("height", PANEL_H)
      .attr("rx", 12)
      .attr("fill", "#ffffff")
      .attr("stroke", "#e5e7eb");

    // Header
    panel
      .append("text")
      .text(`Répartition par ville — ${countryName}`)
      .attr("x", 16)
      .attr("y", 22)
      .attr("font-size", 13)
      .attr("font-weight", 700)
      .attr("fill", "#333");

    // Bloc treemap (toggle +/−)
    const treemapBlock = panel
      .append("g")
      .attr("class", "treemap-block")
      .attr("transform", `translate(20,36)`);

    if (cityEntries.length) {
      const root = d3
        .hierarchy({ name: "root", children: cityEntries })
        .sum((d) => d.value);

      const vals = cityEntries.map((d) => d.value);
      const minV = d3.min(vals) || 1;
      let maxV = d3.max(vals) || minV;
      if (maxV < minV) maxV = minV;

      const color = d3
        .scaleLog()
        .domain([minV, maxV])
        .range([d3.interpolateYlOrRd(0.08), d3.interpolateYlOrRd(1)])
        .clamp(true);

      d3
        .treemap()
        .size([PANEL_W - 40, TREEMAP_H]) // largeur = PANEL_W-2*20 ; hauteur = TREEMAP_H
        .paddingInner(2)
        .paddingOuter(0)(root);

      const nodes = treemapBlock
        .selectAll("g.node")
        .data(root.leaves())
        .join("g")
        .attr("class", "node")
        .attr("transform", (d) => `translate(${d.x0},${d.y0})`);

      nodes
        .append("rect")
        .attr("width", (d) => Math.max(0, d.x1 - d.x0))
        .attr("height", (d) => Math.max(0, d.y1 - d.y0))
        .attr("fill", (d) => color(d.data.value))
        .attr("stroke", "rgba(255,255,255,0.8)")
        .attr("stroke-width", 0.8)
        .on("mousemove", (event, d) => {
          tooltip
            .style("opacity", 1)
            .html(`<strong>${d.data.city}</strong><br/>Biens: ${d.data.value}`)
            .style("left", event.clientX + 12 + "px")
            .style("top", event.clientY + 12 + "px");
        })
        .on("mouseleave", () => tooltip.style("opacity", 0));

      nodes
        .append("text")
        .attr("x", 4)
        .attr("y", 14)
        .attr("font-size", 11)
        .attr("fill", "#111")
        .text((d) => d.data.city)
        .each(function (d) {
          const w = d.x1 - d.x0,
            h = d.y1 - d.y0;
          if (w < 60 || h < 20) d3.select(this).style("display", "none");
        });

      nodes
        .append("text")
        .attr("x", 4)
        .attr("y", 28)
        .attr("font-size", 10)
        .attr("fill", "#333")
        .text((d) => d.data.value)
        .each(function (d) {
          const w = d.x1 - d.x0,
            h = d.y1 - d.y0;
          if (w < 60 || h < 28) d3.select(this).style("display", "none");
        });
    } else {
      treemapBlock
        .append("text")
        .text("Aucune ville disponible (après filtrage).")
        .attr("x", 0)
        .attr("y", 16)
        .attr("font-size", 12)
        .attr("fill", "#777");
    }

    // --- Bloc DÉTAILS PAYS (scroll) ---
    const detailsY = 36 + TREEMAP_H + 8;
    const inner = panel
      .append("foreignObject")
      .attr("x", 12)
      .attr("y", detailsY)
      .attr("width", PANEL_W - 24)
      .attr("height", PANEL_H - detailsY - 8);

    const container = inner
      .append("xhtml:div")
      .style("width", PANEL_W - 24 + "px")
      .style("height", PANEL_H - detailsY - 8 + "px")
      .style("overflow", "auto")
      .style("font", "12px system-ui,Segoe UI,Roboto,Arial")
      .style("color", "#111");

    // Lignes filtrées pour ce pays
    const countryRows = rowsFilteredCurrent.filter((r) => {
      const nn = COUNTRY_ALIAS.get(r.country) || r.country;
      return nn === countryName;
    });

    const stats = summarize(countryRows);

    // Top 10 villes (dans ce pays)
    const byCity = d3
      .rollups(
        countryRows,
        (v) => v.length,
        (d) => d.city || d.City
      )
      .sort((a, b) => d3.descending(a[1], b[1]))
      .slice(0, 10);

    const topCityHTML = `
      <div style="margin-top:8px;">
        <div style="font-weight:700;margin-bottom:4px;">Top villes (par nb de biens)</div>
        <ol style="margin:0;padding-left:18px;">
          ${byCity
            .map(([c, n]) => `<li>${c}: <strong>${fmt(n)}</strong></li>`)
            .join("")}
        </ol>
      </div>`;

    container.html(detailsHTML(`Pays : ${countryName}`, stats, [topCityHTML]));
  }

  // ---------- Reset ----------
  function resetZoom() {
    applyFiltersAndRender(); // réaffiche monde + points + enlève treemap/labels
  }

  // ---- Lancement ----
  run().catch((err) => {
    console.error(err);
    root
      .append("p")
      .style("color", "crimson")
      .text(
        "Erreur de chargement. Vérifie le CSV principal et worldcities.csv."
      );
  });
})();
