// romain.js
d3.csv("../data/global_house_purchase_dataset.csv").then(data => {
  // Convertir les colonnes numériques
  data.forEach(d => {
    d.constructed_year = +d.constructed_year;
    d.price = +d.price;
    d.property_size_sqft = +d.property_size_sqft;
  });

  // Variables de filtre
  let selectedCountry = "All";
  let selectedType = "All";
  let normalizeBySize = false;

  const width = 800;
  const height = 450;
  const margin = { top: 60, right: 30, bottom: 60, left: 80 };

  const svg = d3.select("#viz-container")
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("class", "viz-content");

  // Conteneur pour les axes
  const gX = svg.append("g").attr("transform", `translate(0,${height - margin.bottom})`);
  const gY = svg.append("g").attr("transform", `translate(${margin.left},0)`);

  // Titre
  svg.append("text")
    .attr("x", width / 2)
    .attr("y", margin.top / 2)
    .attr("text-anchor", "middle")
    .attr("font-size", "16px")
    .attr("class", 'chart-text')
    .text("Évolution du prix moyen et prix moyen au m² selon l'année de construction");

  // Tooltip
  const tooltip = d3.select("#viz-container")
    .append("div")
    .attr("class", "tooltip")
    .style("cursor","pointer") 
    .style("position", "absolute")
    .style("background", "rgba(255, 255, 255, 0.15)") // effet glassmorphism cohérent avec le reste
    .style("backdrop-filter", "blur(8px)")
    .style("border-radius", "12px")
    .style("border", "1px solid rgba(255, 255, 255, 0.3)")
    .style("padding", "8px 12px")
    .style("color", "var(--white)") // texte lisible
    .style("font-size", "14px")
    .style("display", "none")
    .style("pointer-events", "none")
    .style("box-shadow", "0 4px 30px rgba(0, 0, 0, 0.1)");

  // Fonction pour filtrer et mettre à jour
  function updateChart() {
    let filtered = data;
    if (selectedCountry !== "All") filtered = filtered.filter(d => d.country === selectedCountry);
    if (selectedType !== "All") filtered = filtered.filter(d => d.property_type === selectedType);

    // Agrégation par année
    const avgData = d3.rollups(
      filtered,
      v => ({
        avgPrice: d3.mean(v, d => d.price),
        avgPricePerSqft: d3.mean(v, d => d.price / (d.property_size_sqft * 0.092903))
      }),
      d => d.constructed_year
    ).map(([year, values]) => ({ year, ...values }))
      .sort((a, b) => a.year - b.year);

    // Échelles
    const x = d3.scaleLinear()
      .domain(d3.extent(avgData, d => d.year))
      .range([margin.left, width - margin.right]);

    const yValues = avgData.map(d => normalizeBySize ? d.avgPricePerSqft : d.avgPrice);
    const yMin = d3.min(yValues);
    const yMax = d3.max(yValues);

    const y = d3.scaleLinear()
      .domain([yMin, yMax])
      .range([height - margin.bottom, margin.top]);

    gX.transition().duration(500).call(d3.axisBottom(x).tickFormat(d3.format("d")));
    gY.transition().duration(500).call(d3.axisLeft(y));

    // Ligne lissée
    const line = d3.line()
      .x(d => x(d.year))
      .y(d => y(normalizeBySize ? d.avgPricePerSqft : d.avgPrice))
      .curve(d3.curveMonotoneX);

    let path = svg.selectAll(".line").data([avgData]);

    path.enter()
      .append("path")
      .attr("class", "line")
      .merge(path)
      .transition().duration(500)
      .attr("fill", "none")
      .attr("stroke", "var(--dark-blue)")
      .attr("stroke-width", 2)
      .attr("d", line);

    path.exit().remove();

    // Cercles
    let circles = svg.selectAll(".dot").data(avgData, d => d.year);

    const allCircles = circles.enter()
      .append("circle")
      .attr("class", "dot")
      .attr("r", 4)
      .attr("fill", "var(--orange)")
      .merge(circles)
      .attr("cx", d => x(d.year))
      .attr("cy", d => y(normalizeBySize ? d.avgPricePerSqft : d.avgPrice));

    // Tooltip
    allCircles
      .on("mouseover", (event, d) => {
        tooltip
          .style("display", "block")
          .html(`Année: ${d.year}<br>${normalizeBySize ? "Prix moyen / m²" : "Prix moyen"}: €${(normalizeBySize ? d.avgPricePerSqft : d.avgPrice).toFixed(2)}`)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 30) + "px");
      })
      .on("mouseout", () => tooltip.style("display", "none"))
      .on("click", (event, d) => {
        zoomOnYear(d.year);
      });
  }

  // Initial
  updateChart();

  // Ajouter les controls
  const controls = d3.select("#viz-container")
    .append("div")
    .attr("class", "controls-container");

  // Dropdown pays avec icône
  const countryWrapper = controls.append("div").attr("class", "select-wrapper");
  countryWrapper.append("select")
    .on("change", function() {
      selectedCountry = this.value;
      updateChart();
      countPropertiesByPrice(selectedCountry, data);
    })
    .selectAll("option")
    .data(["All", ...Array.from(new Set(data.map(d => d.country)))])
    .enter()
    .append("option")
    .text(d => d)
    .attr("value", d => d);

  countryWrapper.append("i").attr("class", "fa-solid fa-chevron-down");

  // Dropdown type de bien avec icône
  const typeWrapper = controls.append("div").attr("class", "select-wrapper");
  typeWrapper.append("select")
    .on("change", function() {
      selectedType = this.value;
      updateChart();
    })
    .selectAll("option")
    .data(["All", ...Array.from(new Set(data.map(d => d.property_type)))])
    .enter()
    .append("option")
    .text(d => d)
    .attr("value", d => d);

  typeWrapper.append("i").attr("class", "fa-solid fa-chevron-down");

  // Toggle normalisation
  controls.append("label")
    .text(" Normaliser par surface")
    .append("input")
    .attr("type", "checkbox")
    .on("change", function() {
      normalizeBySize = this.checked;
      updateChart();
    });

  // Fonction pour compter le nombre de biens par intervalles de prix pour un pays donné
function countPropertiesByPrice(country, data) {
  const filtered = country === "All" ? data : data.filter(d => d.country === country);

  const ranges = [
    { min: 0, max: 500000 },
    { min: 500000, max: 1000000 },
    { min: 1000000, max: 1500000 },
    { min: 1500000, max: 2000000 },
    { min: 2000000, max: Infinity }
  ];

  const counts = ranges.map(r => ({
    range: `${r.min.toLocaleString()} - ${r.max === Infinity ? "∞" : r.max.toLocaleString()}`,
    count: filtered.filter(d => d.price >= r.min && d.price < r.max).length
  }));

  console.log(`Nombre de biens par intervalle de prix pour le pays ${country}:`);
  counts.forEach(c => console.log(`${c.range} : ${c.count}`));

  return counts;
}

function zoomOnYear(year) {
  const filteredYear = data.filter(d => d.constructed_year === year);

  // Nettoyer ancienne viz s’il y en a une
  d3.select("#year-details").remove();

  // Créer un conteneur sous le graphique principal
  const detailSvg = d3.select("#viz-container")
    .append("svg")
    .attr("id", "year-details")
    .attr("width", width)
    .attr("height", 300);

  // Créer un histogramme des prix
  const xHist = d3.scaleLinear()
    .domain([0, d3.max(filteredYear, d => d.price)])
    .range([margin.left, width - margin.right]);

  const bins = d3.histogram()
    .domain(xHist.domain())
    .thresholds(20)
    (filteredYear.map(d => d.price));

  const yHist = d3.scaleLinear()
    .domain([0, d3.max(bins, d => d.length)])
    .range([250, margin.top]);

  detailSvg.selectAll("rect")
  .data(bins)
  .enter()
  .append("rect")
  .attr("x", d => xHist(d.x0))
  .attr("y", d => yHist(d.length))
  .attr("width", d => xHist(d.x1) - xHist(d.x0) - 1)
  .attr("height", d => 250 - yHist(d.length))
  .attr("fill", "var(--orange)")
  .on("mouseover", (event, d) => {
    histTooltip
      .style("display", "block")
      .html(`Prix: €${Math.round(d.x0).toLocaleString()} - €${Math.round(d.x1).toLocaleString()}<br>Ventes: ${d.length}`)
      .style("left", (event.pageX + 10) + "px")
      .style("top", (event.pageY - 30) + "px");
  })
  .on("mouseout", () => histTooltip.style("display", "none"));


  detailSvg.append("text")
    .attr("x", width / 2)
    .attr("y", 20)
    .attr("text-anchor", "middle")
    .attr("fill", "var(--white)")
    .text(`Répartition des prix - Année ${year}`);

    detailSvg.selectAll(".label")
  .data(bins)
  .enter()
  .append("text")
  .attr("x", d => (xHist(d.x0) + xHist(d.x1)) / 2)
  .attr("y", d => yHist(d.length) - 5)
  .attr("text-anchor", "middle")
  .attr("fill", "var(--white)")
  .attr("font-size", "12px")
  .text(d => d.length > 0 ? d.length : "");


  
const histTooltip = d3.select("#viz-container")
    .append("div")
    .attr("class", "tooltip")
    .style("cursor","pointer") 
    .style("position", "absolute")
    .style("background", "rgba(255, 255, 255, 0.15)")
    .style("z-index", "100")
    .style("backdrop-filter", "blur(8px)")
    .style("border-radius", "12px")
    .style("border", "1px solid rgba(255, 255, 255, 0.3)")
    .style("padding", "8px 12px")
    .style("color", "var(--white)") // texte lisible
    .style("font-size", "14px")
    .style("display", "none")
    .style("pointer-events", "none")
    .style("box-shadow", "0 4px 30px rgba(0, 0, 0, 0.1)");

// Ajouter une légende pour les prix sous l'histogramme
const legendMargin = 10; // marge sous les bars
const legendY = 250 + legendMargin; // 250 = base de l’histogramme

const legend = detailSvg.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${margin.left -80}, ${legendY})`);

const xTicks = xHist.ticks(5);

legend.selectAll("line")
  .data(xTicks)
  .enter()
  .append("line")
  .attr("x1", d => xHist(d))
  .attr("x2", d => xHist(d))
  .attr("y1", 0)
  .attr("y2", 6)
  .attr("stroke", "var(--white)");

legend.selectAll("text")
  .data(xTicks)
  .enter()
  .append("text")
  .attr("x", d => xHist(d))
  .attr("y", 20) // texte sous la petite ligne
  .attr("text-anchor", "middle")
  .attr("fill", "var(--white)")
  .attr("font-size", "12px")
  .text(d => `€${(Math.round(d / 1000) * 1000).toLocaleString()}`);
} 
});


