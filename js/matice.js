// js/matice.js
// Carte choroplèthe (échelle log) + tiroir droit local à la page (Treemap, Détails bruts, Filtres)
// Dépendances : d3 v7, topojson-client v3, ../data/global_house_purchase_dataset.csv, ../data/worldcities.csv

(function () {
  if (typeof topojson === "undefined") {
    throw new Error(
      "topojson-client manquant. Ajoute <script src='https://cdn.jsdelivr.net/npm/topojson-client@3'></script>."
    );
  }

  // ---- Chemins & constantes
  const CSV_PATH = "../data/global_house_purchase_dataset.csv";
  const WORLD_URL =
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
  const CITY_DB_LOCAL = "../data/worldcities.csv"; // city,country,lat,lng

  const MAP_H = 600;
  const PANEL_W = 420;
  const GAP = 12;
  const TREEMAP_H = 300;

  const OUT_OF_RANGE_FILL = "#f2f2f2";
  const HOVER_GLOW_COLOR = "#222";

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

  // ---- Racine / Scope page
  const host = d3.select("#viz-container");
  host.html("");
  // Nettoyage défensif d’un éventuel tiroir global laissé par un ancien run
  d3.selectAll("#side-drawer,#drawer-handle").remove();

  const container = host
    .append("div")
    .attr("id", "vis")
    .style("position", "relative")
    .style("width", "100vw"); // ← pleine largeur viewport

  // Wrapper carte + svg (plus de centrage ni max-width)
  const mapWrap = container
    .append("div")
    .attr("id", "map-wrap")
    .style("width", "100%")
    .style("margin", "0");

  let mapW = 980; // recalé par layout()
  const svg = mapWrap
    .append("svg")
    .attr("width", mapW)
    .attr("height", MAP_H)
    .style("display", "block");

  // Couches
  const gSphere = svg.append("g");
  const gCountries = svg.append("g");
  const gFocus = svg.append("g");
  const gLabels = svg.append("g");
  const gCities = svg.append("g");
  const gUI = svg.append("g");

  // Tooltip global
  const tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "tooltip")
    .style("position", "fixed")
    .style("pointer-events", "none")
    .style("padding", "6px 8px")
    .style("background", "rgba(0,0,0,.85)")
    .style("color", "#fff")
    .style("border-radius", "4px")
    .style("font", "12px system-ui,Segoe UI,Roboto,Arial")
    .style("max-width", "300px")
    .style("opacity", 0)
    .style("z-index", "10000"); // au-dessus du tiroir

  // Projection / path (mis à jour par layout())
  let projection = d3
    .geoNaturalEarth1()
    .fitSize([mapW, MAP_H], { type: "Sphere" });
  let path = d3.geoPath(projection);

  // defs: glow
  const defs = svg.append("defs");
  const glow = defs.append("filter").attr("id", "hover-glow");
  glow
    .append("feGaussianBlur")
    .attr("stdDeviation", 2)
    .attr("result", "coloredBlur");
  const feMerge = glow.append("feMerge");
  feMerge.append("feMergeNode").attr("in", "coloredBlur");
  feMerge.append("feMergeNode").attr("in", "SourceGraphic");

  // Bouton reset (carte)
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

  function drawSphere() {
    gSphere.selectAll("*").remove();
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
  }
  svg.on("dblclick", (e) => {
    e.preventDefault();
    resetZoom();
  });

  // ---- Tiroir à droite (local au container, collé au bord droit)
  let drawerOpen = true;

  const drawer = container
    .append("div")
    .attr("id", "side-drawer")
    .style("position", "absolute")
    .style("top", "0")
    .style("right", "0")
    .style("height", MAP_H + "px")
    .style("width", PANEL_W + "px")
    .style("background", "#fff")
    .style("border-left", "1px solid #e5e7eb")
    .style("box-shadow", "-6px 0 24px rgba(0,0,0,.08)")
    .style("z-index", "4")
    .style("display", "flex")
    .style("flex-direction", "column")
    .style("color", "#111");

  const tabs = ["Treemap", "Détails", "Filtres"];
  const tabHeader = drawer
    .append("div")
    .style("display", "flex")
    .style("gap", "6px")
    .style("padding", "8px")
    .style("border-bottom", "1px solid #eee")
    .style("background", "#fafafa")
    .style("color", "#111");

  const tabBtns = {};
  tabs.forEach((name) => {
    tabBtns[name] = tabHeader
      .append("button")
      .text(name)
      .style("padding", "6px 10px")
      .style("border", "1px solid #ddd")
      .style("border-radius", "8px")
      .style("background", name === "Treemap" ? "#111" : "#fff")
      .style("color", name === "Treemap" ? "#fff" : "#111")
      .style("cursor", "pointer")
      .on("click", () => showTab(name));
  });

  const tabBody = drawer
    .append("div")
    .style("flex", "1 1 auto")
    .style("position", "relative")
    .style("overflow", "hidden")
    .style("color", "#111");

  const tabTreemap = tabBody
    .append("div")
    .attr("id", "tab-treemap")
    .style("position", "absolute")
    .style("inset", "0")
    .style("padding", "8px")
    .style("overflow", "auto");

  const tabDetails = tabBody
    .append("div")
    .attr("id", "tab-details")
    .style("position", "absolute")
    .style("inset", "0")
    .style("padding", "8px")
    .style("overflow", "auto")
    .style("display", "none");

  const tabFilters = tabBody
    .append("div")
    .attr("id", "tab-filters")
    .style("position", "absolute")
    .style("inset", "0")
    .style("padding", "12px")
    .style("overflow", "auto")
    .style("display", "none");

  function showTab(name) {
    tabTreemap.style("display", name === "Treemap" ? null : "none");
    tabDetails.style("display", name === "Détails" ? null : "none");
    tabFilters.style("display", name === "Filtres" ? null : "none");
    tabs.forEach((n) => {
      tabBtns[n]
        .style("background", n === name ? "#111" : "#fff")
        .style("color", n === name ? "#fff" : "#111");
    });
  }

  // Treemap title + svg
  tabTreemap.html("");
  const treemapTitle = tabTreemap
    .append("div")
    .style("font-weight", "700")
    .style("margin", "2px 0 6px 2px")
    .text("Répartition par ville");
  const treemapSvg = tabTreemap
    .append("svg")
    .attr("width", PANEL_W - 16)
    .attr("height", TREEMAP_H)
    .style("border", "1px solid #eee")
    .style("border-radius", "8px")
    .style("background", "#fff");

  // Détails (conteneur)
  const detailsContainer = tabDetails.append("div").attr("id", "details-inner");

  // Filtres + tooltips
  const unitStyle = "position:relative;display:flex;align-items:center;";
  const unitSpan =
    "position:absolute;right:8px;top:50%;transform:translateY(-50%);color:#666;font-size:11px;pointer-events:none;";
  const inputCss =
    "width:100%;padding:6px 22px 6px 8px;border:1px solid #ddd;border-radius:6px;";
  tabFilters.html(`
    <div style="font-weight:700;margin-bottom:10px;">Filtres investisseur</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div>
        <label style="display:block;margin-bottom:4px;">
          Prix minimum
          <span class="help-tip" data-tip="Prix demandé du bien. Écarte toutes les annonces en dessous de ce seuil (en euros).">?</span>
          <span style="color:#666">(€)</span>
        </label>
        <div style="${unitStyle}">
          <input type="number" id="f-price-min" placeholder="min" style="${inputCss}">
          <span style="${unitSpan}">€</span>
        </div>
      </div>
      <div>
        <label style="display:block;margin-bottom:4px;">
          Prix maximum
          <span class="help-tip" data-tip="Prix demandé du bien. Écarte toutes les annonces au-dessus de ce seuil (en euros).">?</span>
          <span style="color:#666">(€)</span>
        </label>
        <div style="${unitStyle}">
          <input type="number" id="f-price-max" placeholder="max" style="${inputCss}">
          <span style="${unitSpan}">€</span>
        </div>
      </div>

      <div>
        <label style="display:block;margin-bottom:4px;">
          EMI / revenu (max)
          <span class="help-tip" data-tip="Ratio entre la mensualité de prêt (EMI) et le revenu mensuel net. Ex.: 0.35 = 35% du revenu.">?</span>
          <span style="color:#666">(ratio 0–1)</span>
        </label>
        <div style="${unitStyle}">
          <input type="number" step="0.01" id="f-emi-max" placeholder="0.35" style="${inputCss}">
          <span style="${unitSpan}">ratio</span>
        </div>
        <div style="color:#777;font-size:11px;margin-top:4px;">Ex. 0.35 = 35% du revenu</div>
      </div>

      <div style="display:flex;align-items:center;gap:8px;">
        <input type="checkbox" id="f-legal-zero" style="cursor:pointer;">
        <label for="f-legal-zero" style="margin:0;cursor:pointer;">
          Dossiers légaux = 0 uniquement
          <span class="help-tip" data-tip="Exclut les biens avec litiges/dossiers juridiques associés. Sélectionner = seulement les biens sans cas.">?</span>
          <span style="color:#666">(nb de cas)</span>
        </label>
      </div>

      <div>
        <label style="display:block;margin-bottom:4px;">
          Note quartier (min)
          <span class="help-tip" data-tip="Qualité perçue du quartier (services, écoles, propreté...). Garde uniquement les biens avec une note ≥ seuil.">?</span>
          <span style="color:#666">(/10)</span>
        </label>
        <div style="${unitStyle}">
          <input type="number" id="f-neigh-min" min="0" max="10" style="${inputCss}">
          <span style="${unitSpan}">/10</span>
        </div>
      </div>

      <div>
        <label style="display:block;margin-bottom:4px;">
          Criminalité (max)
          <span class="help-tip" data-tip="Nombre de cas de criminalité rapportés autour du bien. Écarte les zones au-dessus du seuil.">?</span>
          <span style="color:#666">(nb de cas)</span>
        </label>
        <div style="${unitStyle}">
          <input type="number" id="f-crime-max" style="${inputCss}">
          <span style="${unitSpan}">cas</span>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
      <button id="f-reset" style="padding:6px 10px;border:1px solid #ddd;border-radius:6px;background:#fff;cursor:pointer;color:#111;">Réinitialiser</button>
      <button id="f-apply" style="padding:6px 10px;border:0;border-radius:6px;background:#111;color:#fff;cursor:pointer;">Appliquer</button>
    </div>
    <div id="f-stats" style="margin-top:6px;color:#555;"></div>
  `);

  // Style + wiring des “?” (tooltips)
  tabFilters
    .selectAll(".help-tip")
    .attr("title", function () {
      return this.getAttribute("data-tip") || "";
    }) // fallback natif
    .style("display", "inline-flex")
    .style("align-items", "center")
    .style("justify-content", "center")
    .style("width", "16px")
    .style("height", "16px")
    .style("font-size", "11px")
    .style("line-height", "16px")
    .style("border-radius", "50%")
    .style("margin-left", "6px")
    .style("background", "#111")
    .style("color", "#fff")
    .style("cursor", "help")
    .text("?")
    .on("mouseenter", function (event) {
      const txt = this.getAttribute("data-tip") || "";
      tooltip.style("opacity", 1).html(txt);
    })
    .on("mousemove", function (event) {
      tooltip
        .style("left", event.clientX + 12 + "px")
        .style("top", event.clientY + 12 + "px");
    })
    .on("mouseleave", function () {
      tooltip.style("opacity", 0);
    });

  // Poignée (bouton noir) — locale au container
  const handle = container
    .append("button")
    .attr("id", "drawer-handle")
    .text("⟨⟩")
    .style("position", "absolute")
    .style("top", MAP_H / 2 + "px")
    .style("right", drawerOpen ? PANEL_W + 6 + "px" : "6px")
    .style("transform", "translateY(-50%)")
    .style("z-index", "5")
    .style("padding", "8px 10px")
    .style("border", "1px solid #111")
    .style("border-radius", "8px")
    .style("background", "#111")
    .style("color", "#fff")
    .style("cursor", "pointer")
    .on("click", toggleDrawer);

  function toggleDrawer() {
    drawerOpen = !drawerOpen;
    drawer.style("display", drawerOpen ? "flex" : "none");
    handle.style("right", drawerOpen ? PANEL_W + 6 + "px" : "6px");
    layout();
    if (currentCountryName) {
      resetZoom();
    } else {
      applyFiltersAndRender();
    }
  }

  // ---- Réfs filtres
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

  // ---- Données/état
  let rowsAll = [];
  let rowsFilteredCurrent = [];
  let countries = [];
  let countriesByName = new Map();
  let countsCityCurrent = new Map();
  let cityDB = [];
  let cityIndex = null;
  let currentCountryName = null;

  // Utils format
  const fmt = d3.format(",.0f");

  function layout() {
    const viewportW = Math.max(
      document.documentElement.clientWidth,
      window.innerWidth || 0
    );
    const reserved = drawerOpen ? PANEL_W + GAP : 0;
    mapW = Math.max(480, viewportW - reserved - 24);
    mapWrap.style("width", mapW + "px");
    svg.attr("width", mapW).attr("height", MAP_H);
    projection = d3
      .geoNaturalEarth1()
      .fitSize([mapW, MAP_H], { type: "Sphere" });
    path = d3.geoPath(projection);
    drawSphere();
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
      .attr("transform", `translate(${mapW - legendW - 20},${MAP_H - 88})`);
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
        if (val > 0)
          d3.select(this)
            .attr("stroke", HOVER_GLOW_COLOR)
            .attr("stroke-width", 1.5)
            .style("filter", "url(#hover-glow)")
            .raise();
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
        currentCountryName = d.properties.name;
        zoomCountry(d);
      });

    return colorCountry;
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

    // Reset couches
    gLabels.selectAll("*").remove();
    gFocus.selectAll("*").remove();
    gCities.selectAll("*").remove();
    resetBtn.style("display", "none");
    d3.selectAll([gCountries.node(), gFocus.node(), gCities.node()]).attr(
      "transform",
      null
    );

    // Affichage monde
    gSphere.style("display", null);
    gCountries.style("display", null);

    renderMap(byFeature);
    countsCityCurrent = countsCity;

    // Points villes en vue globale
    if (cityIndex) drawGlobalCityPoints(countsCityCurrent);

    // Tiroir : treemap/détails par défaut
    treemapSvg.selectAll("*").remove();
    tabTreemap.selectAll(".note-empty").remove();
    treemapTitle.text("Répartition par ville");
    tabTreemap
      .append("div")
      .attr("class", "note-empty")
      .style("margin-top", "6px")
      .style("color", "#666")
      .text("Cliquez un pays pour afficher la treemap des villes.");
    detailsContainer.html(
      `<div style="color:#666">Cliquez une ville (ou un pays) pour voir la liste des biens.</div>`
    );
    showTab("Treemap");
  }

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
      .on("click", (event, d) => openCityDetails(d.country, d.city));

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

  // ---- DÉTAILS BRUTS (table)
  function renderDetailsTable(title, rows) {
    if (!rows.length) {
      detailsContainer.html(
        `<div style="padding:10px;color:#666;">Aucun bien trouvé pour <strong>${title}</strong> (après filtrage).</div>`
      );
      return;
    }

    const columns = [
      "city",
      "property_type",
      "furnishing_status",
      "property_size_sqft",
      "price",
      "constructed_year",
      "rooms",
      "bathrooms",
      "garage",
      "garden",
      "crime_cases_reported",
      "legal_cases_on_property",
      "neighbourhood_rating",
      "connectivity_score",
      "satisfaction_score",
    ];

    rows = rows.slice().sort((a, b) => (b.price || 0) - (a.price || 0));

    const headerHTML = columns
      .map(
        (c) =>
          `<th style="padding:6px 8px;text-align:left;border-bottom:1px solid #ddd;white-space:nowrap;">${c.replace(
            /_/g,
            " "
          )}</th>`
      )
      .join("");
    const rowsHTML = rows
      .map(
        (r) => `
      <tr>
        ${columns
          .map(
            (c) =>
              `<td style="padding:4px 8px;border-bottom:1px solid #eee;">${
                r[c] ?? ""
              }</td>`
          )
          .join("")}
      </tr>`
      )
      .join("");

    detailsContainer.html(`
      <div style="font-weight:700;margin-bottom:8px;color:#111;">${title}</div>
      <div style="overflow:auto;max-height:calc(100vh - 180px);border:1px solid #ddd;border-radius:6px;">
        <table style="border-collapse:collapse;width:100%;font-size:12px;color:#111;background:#fff;">
          <thead style="background:#f9f9f9;position:sticky;top:0;">
            <tr>${headerHTML}</tr>
          </thead>
          <tbody>${rowsHTML}</tbody>
        </table>
      </div>
      <div style="color:#555;font-size:12px;margin-top:6px;">${fmt(
        rows.length
      )} biens affichés</div>
    `);
  }

  function fillCountryDetails(countryName) {
    const countryRows = rowsFilteredCurrent.filter((r) => {
      const nn = COUNTRY_ALIAS.get(r.country) || r.country;
      return nn === countryName;
    });
    renderDetailsTable(`Pays : ${countryName}`, countryRows);
    showTab("Détails");
  }

  function openCityDetails(countryName, cityName) {
    const cityRows = rowsFilteredCurrent.filter((r) => {
      const nn = COUNTRY_ALIAS.get(r.country) || r.country;
      const cc = r.city || r.City;
      return nn === countryName && cc === cityName;
    });
    renderDetailsTable(`Ville : ${cityName}, ${countryName}`, cityRows);
    showTab("Détails");
  }

  // ---- ZOOM PAYS
  function zoomCountry(feature) {
    // Masquer monde + points
    gSphere.style("display", "none");
    gCountries.style("display", "none");
    gCities.selectAll("*").remove();

    // Nettoyer focus/labels
    gFocus.selectAll("*").remove();
    gLabels.selectAll("*").remove();

    // Transform centrage
    const b = path.bounds(feature);
    const dx = b[1][0] - b[0][0];
    const dy = b[1][1] - b[0][1];
    const x = (b[0][0] + b[1][0]) / 2;
    const y = (b[0][1] + b[1][1]) / 2;
    const scale = Math.min(8, 0.9 / Math.max(dx / mapW, dy / MAP_H));
    const translate = [mapW / 2 - scale * x, MAP_H / 2 - scale * y];

    // Fond pays (scalé)
    gFocus
      .attr("transform", `translate(${translate}) scale(${scale})`)
      .append("path")
      .attr("d", path(feature))
      .attr("fill", "#fff")
      .attr("stroke", "#666")
      .attr("stroke-width", 0.8);

    // Label non-scalé
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

    // Treemap + Détails pour le pays
    const worldName = feature.properties.name;
    const entries = [];
    countsCityCurrent.forEach((count, key) => {
      const [kCountry, kCity] = key.split("|");
      if (kCountry === worldName) entries.push({ city: kCity, value: count });
    });
    drawTreemapInPanel(worldName, entries);
    fillCountryDetails(worldName);
    showTab("Détails");
  }

  function drawTreemapInPanel(countryName, cityEntries) {
    treemapSvg.selectAll("*").remove();
    tabTreemap.selectAll(".note-empty").remove();
    treemapTitle.text(`Répartition par ville — ${countryName}`);

    if (!cityEntries.length) {
      tabTreemap
        .append("div")
        .style("margin-top", "6px")
        .style("color", "#666")
        .text("Aucune ville disponible (après filtrage).");
      return;
    }

    const layoutW = +treemapSvg.attr("width");
    const layoutH = +treemapSvg.attr("height");

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
      .size([layoutW - 16, layoutH - 16])
      .paddingInner(2)
      .paddingOuter(8)(root);

    const gCells = treemapSvg.append("g").attr("transform", `translate(0,0)`);

    const nodes = gCells
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
  }

  function resetZoom() {
    currentCountryName = null;
    applyFiltersAndRender();
  }

  // ---- RUN
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
      cityDB = citiesRes.value;
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

    showTab("Treemap");
    tabTreemap
      .append("div")
      .attr("class", "note-empty")
      .style("margin-top", "6px")
      .style("color", "#666")
      .text("Cliquez un pays pour afficher la treemap des villes.");

    inputs.apply.addEventListener("click", () => {
      readFilters();
      applyFiltersAndRender();
      showTab("Treemap");
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
      showTab("Treemap");
    });

    layout();
    applyFiltersAndRender();

    window.addEventListener("resize", () => {
      layout();
      if (currentCountryName) resetZoom();
      else applyFiltersAndRender();
    });
  }

  run().catch((err) => {
    console.error(err);
    container
      .append("p")
      .style("color", "crimson")
      .text(
        "Erreur de chargement. Vérifie le CSV principal et worldcities.csv."
      );
  });
})();
