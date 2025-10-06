const width = 800, height = 500;

// Créer le conteneur principal si nécessaire
let container = document.getElementById("viz-container");
if (!container) {
  container = document.createElement("div");
  container.id = "viz-container";
  document.body.appendChild(container);
}

// Charger les données CSV
d3.csv("../data/global_house_purchase_dataset.csv").then(data => {
  // Calculer l'indice d'attractivité
  data.forEach(d => {
    d.indice = (+d.neighbourhood_rating + +d.connectivity_score + +d.satisfaction_score) / 3;
  });

  // Récupérer la liste unique des pays
  const countries = Array.from(new Set(data.map(d => d.country))).sort();

  // Créer le menu déroulant
  const selectContainer = document.createElement("div");
  selectContainer.style.textAlign = "center";
  selectContainer.style.margin = "20px";
  const label = document.createElement("label");
  label.innerText = "Sélectionnez un pays : ";
  label.htmlFor = "country-select";
  const select = document.createElement("select");
  select.id = "country-select";

  // Ajouter une option vide par défaut
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.text = "-- Choisissez un pays --";
  select.appendChild(defaultOption);

  // Ajouter l'option "Tous les pays"
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.text = "Tous les pays";
  select.appendChild(allOption);

  // Ajouter les options pour chaque pays
  countries.forEach(country => {
    const option = document.createElement("option");
    option.value = country;
    option.text = country;
    select.appendChild(option);
  });

  // Ajouter le menu déroulant au conteneur
  selectContainer.appendChild(label);
  selectContainer.appendChild(select);
  container.appendChild(selectContainer);

  // Ajouter l'écouteur pour le changement de sélection
  select.addEventListener("change", function() {
    const selectedCountry = this.value;
    if (selectedCountry) {
      const filtered = selectedCountry === "all" ? data : data.filter(d => d.country === selectedCountry);

      // Calculer la moyenne pour chaque ville
      const cityMap = {};
      filtered.forEach(d => {
        const city = d.city;
        if (!cityMap[city]) {
          cityMap[city] = { count: 0, neighbourhood_rating: 0, connectivity_score: 0, satisfaction_score: 0, country: d.country };
        }
        cityMap[city].count += 1;
        cityMap[city].neighbourhood_rating += +d.neighbourhood_rating;
        cityMap[city].connectivity_score += +d.connectivity_score;
        cityMap[city].satisfaction_score += +d.satisfaction_score;
      });

      // Préparer les données moyennes par ville
      const cityData = Object.keys(cityMap).map(city => {
        const c = cityMap[city];
        return {
          city: city,
          neighbourhood_rating: c.neighbourhood_rating / c.count,
          connectivity_score: c.connectivity_score / c.count,
          satisfaction_score: c.satisfaction_score / c.count,
          indice: (c.neighbourhood_rating / c.count + c.connectivity_score / c.count + c.satisfaction_score / c.count) / 3,
          country: c.country
        };
      });

      // Nettoyer l'ancien graphique
      d3.select("#viz-container").selectAll("svg").remove();

      // Créer le SVG
      const svg = d3.select("#viz-container")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

      // Échelles automatiques en fonction des données
      const x = d3.scaleLinear()
        .domain([d3.min(cityData, d => d.connectivity_score) - 0.1, d3.max(cityData, d => d.connectivity_score) + 0.1])
        .range([60, width - 60]);

      const y = d3.scaleLinear()
        .domain([d3.min(cityData, d => d.neighbourhood_rating) - 0.1, d3.max(cityData, d => d.neighbourhood_rating) + 0.1])
        .range([height - 60, 60]);

      // Axes
      svg.append("g")
        .attr("transform", `translate(0,${height - 60})`)
        .call(d3.axisBottom(x));
      svg.append("g")
        .attr("transform", `translate(60,0)`)
        .call(d3.axisLeft(y));

      // Labels
      svg.append("text")
        .attr("x", width / 2)
        .attr("y", 30)
        .attr("text-anchor", "middle")
        .style("font-weight", "bold")
        .text(`Scatter plot des villes de ${selectedCountry === "all" ? "tous les pays" : selectedCountry}`);
      svg.append("text")
        .attr("x", width / 2)
        .attr("y", height - 20)
        .attr("text-anchor", "middle")
        .text("Connectivity Score");
      svg.append("text")
        .attr("x", -height / 2)
        .attr("y", 20)
        .attr("transform", "rotate(-90)")
        .attr("text-anchor", "middle")
        .text("Neighbourhood Rating");

      // Échelle pour la taille des points
      const rScale = d3.scaleLinear()
        .domain([0, d3.max(cityData, d => d.satisfaction_score)])
        .range([5, 20]);

      // Échelle de couleurs pour les pays
      const colorScale = d3.scaleOrdinal()
        .domain(selectedCountry === "all" ? countries : [selectedCountry])
        .range(d3.schemeCategory10);

      // Points
      svg.selectAll("circle")
        .data(cityData)
        .join("circle")
        .attr("cx", d => x(d.connectivity_score))
        .attr("cy", d => y(d.neighbourhood_rating))
        .attr("r", d => rScale(d.satisfaction_score))
        .attr("fill", d => colorScale(d3.select("#country-select").property("value") === "all" ? d.country : d.country))
        .attr("opacity", 0.7)
        .attr("stroke", "#333")
        .on("mouseover", function(event, d) {
          const tooltip = d3.select("#viz-container").append("div")
            .attr("id", "tooltip")
            .style("position", "absolute")
            .style("background", "#fff")
            .style("border", "1px solid #333")
            .style("padding", "5px")
            .style("pointer-events", "none")
            .style("opacity", 0.9)
            .html(`<strong>${d.city}</strong><br/>Qualité moyenne : ${d.neighbourhood_rating.toFixed(2)}<br/>Accessibilité moyenne: ${d.connectivity_score.toFixed(2)}<br/>Satisfaction moyenne des habitants : ${d.satisfaction_score.toFixed(2)}`);
        })
        .on("mousemove", function(event) {
          d3.select("#tooltip")
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY + 10) + "px");
        })
        .on("mouseout", function() {
          d3.select("#tooltip").remove();
        })
        .on("click", function(event, d) {
          const cityName = d.city;
          const cityEntries = filtered.filter(item => item.city === cityName);

          // Supprimer l'ancien graphique si existe
          d3.select("#city-details").remove();

          // Créer un conteneur pour l'histogramme
          const details = d3.select("#viz-container")
            .append("div")
            .attr("id", "city-details")
            .style("margin-top", "20px")
            .style("padding", "10px")
            .style("border", "1px solid #333")
            .style("background", "#f9f9f9");

          details.append("h3")
            .text(`Histogramme des quartiers pour ${cityName}`);

          const histWidth = 700;
          const histHeight = 300;
          const margin = {top: 20, right: 20, bottom: 50, left: 50};

          const svg = details.append("svg")
            .attr("width", histWidth)
            .attr("height", histHeight);

          // Échelles
          const x = d3.scaleBand()
            .domain(cityEntries.map((_, i) => i + 1))
            .range([margin.left, histWidth - margin.right])
            .padding(0.1);

          const y = d3.scaleLinear()
            .domain([0, d3.max(cityEntries, d => +d.satisfaction_score)])
            .range([histHeight - margin.bottom, margin.top]);

          const colorScale = d3.scaleLinear()
            .domain([0, d3.max(cityEntries, d => +d.connectivity_score)])
            .range(["lightblue", "darkblue"]);

          // Barres
          svg.selectAll("rect")
            .data(cityEntries)
            .join("rect")
            .attr("x", (_, i) => x(i + 1))
            .attr("y", d => y(+d.satisfaction_score))
            .attr("width", x.bandwidth())
            .attr("height", d => histHeight - margin.bottom - y(+d.satisfaction_score))
            .attr("fill", d => colorScale(+d.connectivity_score))
            .attr("stroke", "#333")
            .append("title")
            .text((d, i) => `ID: ${i+1}\nQualité : ${( +d.neighbourhood_rating ).toFixed(2)}\nSatisfaction des habitants : ${( +d.satisfaction_score ).toFixed(2)}\nAcessibilité : ${( +d.connectivity_score ).toFixed(2)}`);

          // Axes
          svg.append("g")
            .attr("transform", `translate(0,${histHeight - margin.bottom})`)
            .call(d3.axisBottom(x).tickFormat(i => `Q${i}`));

          svg.append("g")
            .attr("transform", `translate(${margin.left},0)`)
            .call(d3.axisLeft(y));

          // Labels
          svg.append("text")
            .attr("x", histWidth / 2)
            .attr("y", histHeight - 10)
            .attr("text-anchor", "middle")
            .text("Quartiers");

          svg.append("text")
            .attr("x", -histHeight / 2)
            .attr("y", 15)
            .attr("transform", "rotate(-90)")
            .attr("text-anchor", "middle")
            .text("Satisfaction Score");

          // Ajouter un brush pour sélectionner des quartiers
          const brush = d3.brushX()
            .extent([[margin.left, margin.top], [histWidth - margin.right, histHeight - margin.bottom]])
            .on("end", (event) => {
              if (!event.selection) return; // Pas de sélection
              const [x0, x1] = event.selection;
              const selectedData = cityEntries
                .map((d, i) => ({d, i}))
                .filter(({i}) => {
                  const xPos = x(i + 1) + x.bandwidth() / 2;
                  return x0 <= xPos && xPos <= x1;
                });

              if (selectedData.length === 0) return;

              const newDomain = selectedData.map(({i}) => i + 1);
              x.domain(newDomain);

              // Mettre à jour les barres
              svg.selectAll("rect")
                .transition()
                .duration(750)
                .attr("x", (_, i) => x(i + 1))
                .attr("width", x.bandwidth());

              // Mettre à jour l'axe X
              svg.select("g")
                .transition()
                .duration(750)
                .call(d3.axisBottom(x).tickFormat(i => `Q${i}`));
            });

          svg.append("g")
            .call(brush);
        });

      // Ajouter une légende sur le côté droit du SVG
      const legend = svg.append("g")
        .attr("transform", `translate(${width - 100},50)`);

      const legendCountries = selectedCountry === "all" ? countries : [selectedCountry];

      legendCountries.forEach((country, i) => {
        const g = legend.append("g")
          .attr("transform", `translate(0,${i * 20})`);
        g.append("rect")
          .attr("width", 15)
          .attr("height", 15)
          .attr("fill", colorScale(country));
        g.append("text")
          .attr("x", 20)
          .attr("y", 12)
          .text(country);
      });
    } else {
      console.log("Aucun pays sélectionné");
    }
  });
});