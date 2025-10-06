// js/matice.js
// Heatmap densité par pays (13 pays) + échelle LOG + hover highlight + zoom pays + densité par VILLE
// Nécessite: d3 v7, topojson-client v3, <main id="viz-container">
// Données: ../data/global_house_purchase_dataset.csv
// Géocodage villes: ../data/cities_latlon.csv (colonnes: country,city,lat,lon)

(function () {
  if (typeof topojson === "undefined") {
    throw new Error(
      "topojson-client manquant. Ajoute <script src='https://cdn.jsdelivr.net/npm/topojson-client@3'></script>."
    );
  }

  // ---- Config fichiers ----
  const CSV_PATH = "../data/global_house_purchase_dataset.csv";
  const CITIES_COORDS = "../data/cities_latlon.csv"; // requis pour les cercles des villes
  const WORLD_URL =
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

  // ---- Pays présents dans le CSV (verrouillé à 13) ----
  const CSV_COUNTRIES = [
    "Australia",
    "Brazil",
    "Canada",
    "China",
    "France",
    "Germany",
    "India",
    "Japan",
    "Singapore",
    "South Africa",
    "UAE",
    "UK",
    "USA",
  ];

  // Mapping dataset -> noms Natural Earth (world-atlas)
  const COUNTRY_MAP = new Map([
    ["Australia", "Australia"],
    ["Brazil", "Brazil"],
    ["Canada", "Canada"],
    ["China", "China"],
    ["France", "France"],
    ["Germany", "Germany"],
    ["India", "India"],
    ["Japan", "Japan"],
    ["Singapore", "Singapore"],
    ["South Africa", "South Africa"],
    ["UAE", "United Arab Emirates"],
    ["UK", "United Kingdom"],
    ["USA", "United States of America"],
  ]);

  // ---- Styles / couleurs ----
  const OUT_OF_RANGE_FILL = "#f2f2f2"; // pour les 0
  const HOVER_GLOW_COLOR = "#222"; // glow sombre
  const CITY_FILL = "#333"; // couleur des cercles de ville (sera surlignée via opacity/size)
  const CITY_OPACITY = 0.8;

  // ---- Conteneur ----
  const host = d3.select("#viz-container");
  host.html("");
  const root = host.append("div").attr("id", "vis");

  const width = 980,
    height = 600;
  const svg = root.append("svg").attr("width", width).attr("height", height);

  // Calques (ordre = fond -> pays -> villes -> UI)
  const gSphere = svg.append("g");
  const gCountries = svg.append("g");
  const gCities = svg.append("g");
  const gUI = svg.append("g");

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

  // Projection & path
  const projection = d3
    .geoNaturalEarth1()
    .fitSize([width, height], { type: "Sphere" });
  const path = d3.geoPath(projection);

  // Defs: filtre "glow" pour hover
  const defs = svg.append("defs");
  const glow = defs.append("filter").attr("id", "hover-glow");
  glow
    .append("feGaussianBlur")
    .attr("stdDeviation", 2)
    .attr("result", "coloredBlur");
  const feMerge = glow.append("feMerge");
  feMerge.append("feMergeNode").attr("in", "coloredBlur");
  feMerge.append("feMergeNode").attr("in", "SourceGraphic");

  // Légende (couleurs + pastille hors tranche)
  function drawLegendLog(minPos, maxVal) {
    const legendW = 160,
      legendH = 12,
      gradId = "legendGrad";
    const lgDefs = svg.append("defs");
    const lg = lgDefs
      .append("linearGradient")
      .attr("id", gradId)
      .attr("x1", "0%")
      .attr("x2", "100%")
      .attr("y1", "0%")
      .attr("y2", "0%");
    for (let i = 0; i <= 10; i++) {
      lg.append("stop")
        .attr("offset", `${i * 10}%`)
        .attr("stop-color", d3.interpolateYlOrRd(i / 10));
    }
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

    // Graduation min/max
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

    // Pastille hors tranche (0)
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

  // Bouton reset (affiché en zoom)
  const resetBtn = gUI
    .append("g")
    .attr("transform", `translate(20,20)`)
    .style("cursor", "pointer")
    .style("display", "none")
    .on("click", () => resetZoom());

  resetBtn
    .append("rect")
    .attr("width", 80)
    .attr("height", 28)
    .attr("rx", 6)
    .attr("fill", "#ffffff")
    .attr("stroke", "#ddd");
  resetBtn
    .append("text")
    .text("← Retour")
    .attr("x", 12)
    .attr("y", 18)
    .attr("font-size", 12)
    .attr("fill", "#333");

  // Fond (océan + graticule)
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

  // --- MAIN ---
  async function run() {
    const [rows, world, cityCoordsMaybe] = await Promise.allSettled([
      d3.csv(CSV_PATH, d3.autoType),
      d3.json(WORLD_URL),
      d3.csv(CITIES_COORDS, d3.autoType),
    ]);

    if (rows.status !== "fulfilled" || world.status !== "fulfilled") {
      throw new Error("Chargement des données/carte impossible.");
    }

    const dataRows = rows.value;
    const countries = topojson.feature(
      world.value,
      world.value.objects.countries
    ).features;

    // Comptage par pays (seulement nos 13 pays)
    const countsCsv = new Map();
    const countsCity = new Map(); // clé `${country}|${city}` -> count

    for (const row of dataRows) {
      const c = (row.country || row.Country || "").toString().trim();
      if (!CSV_COUNTRIES.includes(c)) continue;

      // pays
      countsCsv.set(c, (countsCsv.get(c) || 0) + 1);

      // ville (si dispo)
      const city = (row.city || row.City || "").toString().trim();
      if (city) {
        const key = `${c}|${city}`;
        countsCity.set(key, (countsCity.get(key) || 0) + 1);
      }
    }

    // Associer pays -> feature
    const byFeature = new Map();
    for (const [csvName, count] of countsCsv.entries()) {
      const worldName = COUNTRY_MAP.get(csvName);
      const feat = countries.find((f) => f.properties?.name === worldName);
      if (feat) byFeature.set(feat, count);
      else
        console.warn("Pays non trouvé dans la carte:", csvName, "→", worldName);
    }

    // Domaine LOG
    const valuesPos = [...byFeature.values()].filter((v) => v > 0);
    const minPos = d3.min(valuesPos) || 1; // évite log(0)
    let maxVal = d3.max(valuesPos) || minPos;
    if (maxVal < minPos) maxVal = minPos;

    const color = d3
      .scaleLog()
      .domain([minPos, maxVal])
      .range([d3.interpolateYlOrRd(0.05), d3.interpolateYlOrRd(1.0)]) // même palette
      .clamp(true);

    drawLegendLog(minPos, maxVal);

    // Dessin pays
    const countryPaths = gCountries
      .selectAll("path.country")
      .data(countries, (d) => d.id)
      .join("path")
      .attr("class", "country")
      .attr("d", path)
      .attr("fill", (d) => {
        const val = byFeature.get(d) || 0;
        return val === 0 ? OUT_OF_RANGE_FILL : color(val);
      })
      .attr("stroke", "#fff")
      .attr("stroke-width", 0.6)
      .style("filter", null)
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
        if (val === 0) return; // rien à zoomer si 0
        zoomToCountry(
          d,
          color,
          countsCity,
          cityCoordsMaybe.status === "fulfilled" ? cityCoordsMaybe.value : null
        );
      });

    // Double-clic global pour reset
    svg.on("dblclick", () => resetZoom());
  }

  // ---- Zoom & villes ----
  function zoomToCountry(feature, color, countsCity, citiesCoords) {
    // Fit le pays dans la vue via transform sur le groupe parent (countries + cities)
    const b = path.bounds(feature);
    const dx = b[1][0] - b[0][0];
    const dy = b[1][1] - b[0][1];
    const x = (b[0][0] + b[1][0]) / 2;
    const y = (b[0][1] + b[1][1]) / 2;
    const scale = Math.min(8, 0.9 / Math.max(dx / width, dy / height)); // limite le zoom
    const translate = [width / 2 - scale * x, height / 2 - scale * y];

    // Transition zoom
    const zoomG = d3.selectAll([gCountries.node(), gCities.node()]);
    zoomG
      .transition()
      .duration(900)
      .attr("transform", `translate(${translate}) scale(${scale})`);

    // Bouton reset visible
    resetBtn.style("display", null);

    // Villes
    gCities.selectAll("*").remove();

    const worldName = feature.properties.name;
    const datasetName = [...COUNTRY_MAP.entries()].find(
      ([, w]) => w === worldName
    )?.[0];

    if (!datasetName) {
      note(
        "Avertissement: mapping pays introuvable pour l’affichage des villes."
      );
      return;
    }

    // Construire la liste villes+count pour ce pays
    const citiesForCountry = [];
    if (countsCity && countsCity.size) {
      for (const [key, cnt] of countsCity.entries()) {
        const [cCountry, cCity] = key.split("|");
        if (cCountry === datasetName) {
          citiesForCountry.push({ city: cCity, count: cnt });
        }
      }
    }

    if (citiesForCountry.length === 0) {
      note(`Aucune ville trouvée dans le CSV pour ${datasetName}.`);
      return;
    }

    // Besoin des coords (lat/lon)
    if (!citiesCoords) {
      note(
        `Géocodage manquant: ajoute ../data/cities_latlon.csv (country,city,lat,lon).`
      );
      return;
    }

    // Index coords par (country|city) normalisés
    const norm = (s) => s.toString().trim().toLowerCase();
    const cityIndex = new Map();
    citiesCoords.forEach((r) => {
      cityIndex.set(`${norm(r.country)}|${norm(r.city)}`, {
        lat: +r.lat,
        lon: +r.lon,
      });
    });

    // Projeter et dessiner cercles
    const maxCity = d3.max(citiesForCountry, (d) => d.count) || 1;
    const rScale = d3.scaleSqrt().domain([1, maxCity]).range([2, 14]);

    const missing = [];
    const withXY = citiesForCountry
      .map((d) => {
        const key = `${norm(datasetName)}|${norm(d.city)}`;
        const coord = cityIndex.get(key);
        if (!coord || isNaN(coord.lat) || isNaN(coord.lon)) {
          missing.push(d.city);
          return null;
        }
        const [x, y] = projection([coord.lon, coord.lat]);
        return { ...d, x, y };
      })
      .filter(Boolean);

    if (missing.length) {
      note(
        `Villes sans coordonnées ignorées: ${missing.slice(0, 8).join(", ")}${
          missing.length > 8 ? "…" : ""
        }`
      );
    }

    const cityNodes = gCities
      .selectAll("circle.city")
      .data(withXY, (d) => d.city)
      .join("circle")
      .attr("class", "city")
      .attr("cx", (d) => d.x)
      .attr("cy", (d) => d.y)
      .attr("r", (d) => rScale(d.count))
      .attr("fill", (d) => color(d.count))
      .attr("stroke", "#222")
      .attr("stroke-width", 0.6)
      .attr("opacity", CITY_OPACITY)
      .on("mousemove", (event, d) => {
        tooltip
          .style("opacity", 1)
          .html(`<strong>${d.city}</strong><br/>Biens: ${d.count}`)
          .style("left", event.clientX + 12 + "px")
          .style("top", event.clientY + 12 + "px");
      })
      .on("mouseleave", () => tooltip.style("opacity", 0));

    // Petit tri pour que les plus gros cercles soient derrière (meilleure lisibilité au survol)
    cityNodes.sort((a, b) => d3.ascending(a.count, b.count));
  }

  function resetZoom() {
    d3.selectAll([gCountries.node(), gCities.node()])
      .transition()
      .duration(700)
      .attr("transform", null);
    resetBtn.style("display", "none");
    // On garde les cercles de villes (ils sont hors champ) ou on les nettoie:
    gCities.selectAll("*").remove();
  }

  function note(msg) {
    // Message discret en bas-gauche
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
    // Efface au bout de 4 secondes
    setTimeout(() => {
      gUI.selectAll("text.note").remove();
    }, 4000);
  }

  // Lancer
  run().catch((err) => {
    console.error(err);
    d3.select("#viz-container")
      .append("p")
      .style("color", "crimson")
      .text(
        "Erreur de chargement ou de mapping. Vérifie les chemins et, pour le zoom, fournis cities_latlon.csv."
      );
  });
})();
