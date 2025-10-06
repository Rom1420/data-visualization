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
  const margin = { top: 60, right: 120, bottom: 100, left: 70 };

  const svg = d3.select("#viz-container")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // Conteneur pour les axes
  const gX = svg.append("g").attr("transform", `translate(0,${height - margin.bottom})`);
  const gY = svg.append("g").attr("transform", `translate(${margin.left},0)`);

  // Titre
  svg.append("text")
    .attr("x", width / 2)
    .attr("y", margin.top / 2)
    .attr("text-anchor", "middle")
    .attr("font-size", "16px")
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
    console.log('update')
    let filtered = data;
    if (selectedCountry !== "All") filtered = filtered.filter(d => d.country === selectedCountry);
    if (selectedType !== "All") filtered = filtered.filter(d => d.property_type === selectedType);

    // Agrégation par année
    const avgData = d3.rollups(
      filtered,
      v => ({
        avgPrice: d3.mean(v, d => d.price),                         // prix moyen total
        avgPricePerSqft: d3.mean(v, d => d.price / (d.property_size_sqft * 0.092903)) // prix moyen au m²
      }),
      d => d.constructed_year
    ).map(([year, values]) => ({ year, ...values }))
      .sort((a,b) => a.year - b.year);

    // Log dans la console
    console.log("Prix moyen et prix moyen au m² par année :");
    avgData.forEach(d => {
      console.log(`Année ${d.year}: Prix moyen €${d.avgPrice.toFixed(2)}, Prix moyen/m² €${d.avgPricePerSqft.toFixed(2)}`);
    });

    // Échelles
    const x = d3.scaleLinear()
      .domain(d3.extent(avgData, d => d.year))
      .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
      .domain([0, d3.max(avgData, d => normalizeBySize ? d.avgPricePerSqft : d.avgPrice) * 1.1])
      .range([height - margin.bottom, margin.top]);

    gX.transition().duration(500).call(d3.axisBottom(x).tickFormat(d3.format("d")));
    gY.transition().duration(500).call(d3.axisLeft(y));

    // Ligne lissée
    const line = d3.line()
      .x(d => x(d.year))
      .y(d => y(normalizeBySize ? d.avgPricePerSqft : d.avgPrice))
      .curve(d3.curveMonotoneX);

    // DATA JOIN ligne
    let path = svg.selectAll(".line").data([avgData]);

    path.enter()
      .append("path")
      .attr("class", "line")
      .merge(path)
      .transition().duration(500)
      .attr("fill", "none")
      .attr("stroke", "steelblue")
      .attr("stroke-width", 2)
      .attr("d", line);

    path.exit().remove();

    // DATA JOIN cercles
    let circles = svg.selectAll(".dot").data(avgData, d => d.year);

    circles.enter()
      .append("circle")
      .attr("class", "dot")
      .attr("r", 4)
      .attr("fill", "orange")
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
    .style("margin-top", "15px")
    .style("display", "flex")
    .style("gap", "20px");

  // Dropdown pays
  const countries = ["All", ...Array.from(new Set(data.map(d => d.country)))];
  const countryLabel = controls.append("label")
    .text("Pays: ");

  const countrySelect = countryLabel.append("select")
    .on("change", function() {
      selectedCountry = this.value;
      updateChart();
      countPropertiesByPrice(selectedCountry, data);
    });

  countrySelect.selectAll("option")
    .data(countries)
    .enter()
    .append("option")
    .text(d => d)
    .attr("value", d => d);

  // Dropdown type de bien
  const types = ["All", ...Array.from(new Set(data.map(d => d.property_type)))];
  const typeLabel = controls.append("label")
    .text("Type: ");

  const typeSelect = typeLabel.append("select")
    .on("change", function() {
      selectedType = this.value;
      updateChart();
    });

  typeSelect.selectAll("option")
    .data(types)
    .enter()
    .append("option")
    .text(d => d)
    .attr("value", d => d);


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

  // Définir les intervalles de prix
  const ranges = [
    { min: 0, max: 500000 },
    { min: 500000, max: 1000000 },
    { min: 1000000, max: 1500000 },
    { min: 1500000, max: 2000000 },
    { min: 2000000, max: Infinity } // tout ce qui est > 2M
  ];

  const counts = ranges.map(r => ({
    range: `${r.min.toLocaleString()} - ${r.max === Infinity ? "∞" : r.max.toLocaleString()}`,
    count: filtered.filter(d => d.price >= r.min && d.price < r.max).length
  }));

  console.log(`Nombre de biens par intervalle de prix pour le pays ${country}:`);
  counts.forEach(c => console.log(`${c.range} : ${c.count}`));

  return counts;
}
