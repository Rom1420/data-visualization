// romain.js
d3.csv("data/house_data.csv").then(data => {
  // Convertir les valeurs numériques
  data.forEach(d => {
    d.constructed_year = +d.constructed_year;
    d.price = +d.price;
    d.property_size_sqft = +d.property_size_sqft;
  });

  // Agréger par année
  const avgData = d3.rollups(
    data,
    v => ({
      avgPrice: d3.mean(v, d => d.price),
      avgPricePerSqft: d3.mean(v, d => d.price / d.property_size_sqft)
    }),
    d => d.constructed_year
  ).map(([year, values]) => ({ year, ...values }))
   .sort((a,b) => a.year - b.year); // Tri par année

  // Dimensions
  const width = 700;
  const height = 400;
  const margin = { top: 40, right: 100, bottom: 50, left: 70 };

  const svg = d3.select("#viz-container")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // Échelles
  const x = d3.scaleLinear()
    .domain(d3.extent(avgData, d => d.year))
    .range([margin.left, width - margin.right]);

  const y = d3.scaleLinear()
    .domain([0, d3.max(avgData, d => Math.max(d.avgPrice, d.avgPricePerSqft)) * 1.1])
    .range([height - margin.bottom, margin.top]);

  // Axes
  svg.append("g")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")));

  svg.append("g")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y));

  // Ligne prix moyen
  const linePrice = d3.line()
    .x(d => x(d.year))
    .y(d => y(d.avgPrice));

  svg.append("path")
    .datum(avgData)
    .attr("fill", "none")
    .attr("stroke", "steelblue")
    .attr("stroke-width", 2)
    .attr("d", linePrice);

  // Ligne prix moyen au m²
  const linePricePerSqft = d3.line()
    .x(d => x(d.year))
    .y(d => y(d.avgPricePerSqft));

  svg.append("path")
    .datum(avgData)
    .attr("fill", "none")
    .attr("stroke", "orange")
    .attr("stroke-width", 2)
    .attr("d", linePricePerSqft);

  // Légende
  svg.append("text")
    .attr("x", width - margin.right + 10)
    .attr("y", margin.top)
    .attr("fill", "steelblue")
    .text("Prix moyen (€)");

  svg.append("text")
    .attr("x", width - margin.right + 10)
    .attr("y", margin.top + 20)
    .attr("fill", "orange")
    .text("Prix moyen / sqft (€)");

  // Titres
  svg.append("text")
    .attr("x", width / 2)
    .attr("y", margin.top / 2)
    .attr("text-anchor", "middle")
    .attr("font-size", "16px")
    .text("Évolution du prix moyen et prix moyen au m² selon l'année de construction");
});
