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
    .style("position", "absolute")
    .style("background", "#fff")
    .style("border", "1px solid #999")
    .style("padding", "6px")
    .style("display", "none")
    .style("pointer-events", "none");

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

    circles.enter()
      .append("circle")
      .attr("class", "dot")
      .attr("r", 4)
      .attr("fill", "var(--orange)")
      .merge(circles)
      .transition().duration(500)
      .attr("cx", d => x(d.year))
      .attr("cy", d => y(normalizeBySize ? d.avgPricePerSqft : d.avgPrice));

    circles.exit().remove();

    circles.on("mouseover", (event, d) => {
      tooltip.style("display", "block")
        .html(`Année: ${d.year}<br>${normalizeBySize ? "Prix moyen / m²" : "Prix moyen"}: €${(normalizeBySize ? d.avgPricePerSqft : d.avgPrice).toFixed(2)}`)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 30) + "px");
    }).on("mouseout", () => tooltip.style("display", "none"));
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
