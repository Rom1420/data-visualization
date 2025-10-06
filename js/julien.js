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
      const filtered = data.filter(d => d.country === selectedCountry);

      // Calculer la moyenne pour chaque ville
      const cityMap = {};
      filtered.forEach(d => {
        const city = d.city;
        if (!cityMap[city]) {
          cityMap[city] = { count: 0, neighbourhood_rating: 0, connectivity_score: 0, satisfaction_score: 0 };
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
          indice: (c.neighbourhood_rating / c.count + c.connectivity_score / c.count + c.satisfaction_score / c.count) / 3
        };
      });

      // Nettoyer l'ancien graphique
      d3.select("#viz-container").selectAll("svg").remove();

      // Créer le SVG
      const svg = d3.select("#viz-container")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

      // Définir les échelles
      const x = d3.scaleLinear()
        .domain([0, d3.max(cityData, d => d.connectivity_score) + 1])
        .range([60, width - 60]);
      const y = d3.scaleLinear()
        .domain([0, d3.max(cityData, d => d.neighbourhood_rating) + 1])
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
        .text(`Scatter plot des villes de ${selectedCountry}`);
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

      // Points avec hover
      svg.selectAll("circle")
        .data(cityData)
        .join("circle")
        .attr("cx", d => x(d.connectivity_score))
        .attr("cy", d => y(d.neighbourhood_rating))
        .attr("r", d => d.indice * 2)
        .attr("fill", "steelblue")
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
            .html(`<strong>${d.city}</strong><br/>Neighbourhood: ${d.neighbourhood_rating}<br/>Connectivity: ${d.connectivity_score}`);
        })
        .on("mousemove", function(event) {
          d3.select("#tooltip")
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY + 10) + "px");
        })
        .on("mouseout", function() {
          d3.select("#tooltip").remove();
        });
    } else {
      console.log("Aucun pays sélectionné");
    }
  });

  // Afficher la liste des pays dans la console
  console.log("Liste des pays :", countries);
});