const width = 800, height = 500;

// Créer le conteneur principal si nécessaire
let container = document.getElementById("viz-container");
if (!container) {
  container = document.createElement("div");
  container.id = "viz-container";
  document.body.appendChild(container);
}

// Déclaration de la variable globale pour stocker les filtres courants
let currentFilters = {
  minSatisfaction: 0,
  minQuality: 0,
  minAccessibility: 0
};

// Charger les données CSV
d3.csv("../data/global_house_purchase_dataset.csv").then(data => {
  // Calculer l'indice d'attractivité
  data.forEach(d => {
    d.indice = (+d.neighbourhood_rating + +d.connectivity_score + +d.satisfaction_score) / 3;
  });

  // Récupérer la liste unique des pays
  const countries = Array.from(new Set(data.map(d => d.country))).sort();

  // Bouton pour revenir à tous les pays
  const allCountriesBtn = document.createElement("button");
  allCountriesBtn.innerText = "Tous les pays";
  allCountriesBtn.style.margin = "10px";
  allCountriesBtn.onclick = () => renderScatter();
  document.body.insertBefore(allCountriesBtn, container);

  // Fonction réutilisable pour générer le scatter plot
  // Ajout d'un paramètre optionnel filteredData
  function renderScatter(selectedCountry, filteredData) {
    // Supprimer l'histogramme et les infos si présents
    d3.select("#city-details").remove();
    // Supprimer l'ancien panneau de filtres s'il existe
    d3.select("#filters-panel").remove();

    // Ajout du panneau de filtres au-dessus du scatter plot (sans panneau à gauche)
    const filtersPanel = d3.select("body")
      .insert("div", "#viz-container")
      .attr("id", "filters-panel")
      .style("margin-bottom", "12px")
      .style("padding", "10px")
      .style("border", "1px solid #ccc")
      .style("background", "#fafafa")
      .style("display", "inline-block");

    // Valeurs courantes ou par défaut pour les filtres
    let minSat = (document.getElementById("min-satisfaction") && document.getElementById("min-satisfaction").value) || 0;
    let minQual = (document.getElementById("min-quality") && document.getElementById("min-quality").value) || 0;
    let minAcc = (document.getElementById("min-accessibility") && document.getElementById("min-accessibility").value) || 0;

    filtersPanel.html(`
      <label for="min-satisfaction">Satisfaction min. :</label>
      <input type="number" id="min-satisfaction" value="${minSat}" min="0" max="10" step="0.1" style="width:60px;margin-right:10px;">
      <label for="min-quality">Qualité min. :</label>
      <input type="number" id="min-quality" value="${minQual}" min="0" max="10" step="0.1" style="width:60px;margin-right:10px;">
      <label for="min-accessibility">Accessibilité min. :</label>
      <input type="number" id="min-accessibility" value="${minAcc}" min="0" max="10" step="0.1" style="width:60px;margin-right:10px;">
      <button id="apply-filters-btn">Appliquer filtres</button>
    `);

    // Nouvelle gestion du bouton "Appliquer filtres"
    filtersPanel.select("#apply-filters-btn").on("click", function() {
      // Mettre à jour la variable globale currentFilters avec les valeurs des inputs
      currentFilters.minSatisfaction = parseFloat(document.getElementById("min-satisfaction").value) || 0;
      currentFilters.minQuality = parseFloat(document.getElementById("min-quality").value) || 0;
      currentFilters.minAccessibility = parseFloat(document.getElementById("min-accessibility").value) || 0;
      console.log("Filtres appliqués :", currentFilters);

      // Base de données selon pays sélectionné
      const base = selectedCountry ? data.filter(d => d.country === selectedCountry) : data;

      // Calcul des moyennes par ville AVANT filtrage
      const cityMap = {};
      base.forEach(d => {
        const city = d.city;
        if (!cityMap[city]) {
          cityMap[city] = { count: 0, neighbourhood_rating: 0, connectivity_score: 0, satisfaction_score: 0, country: d.country };
        }
        cityMap[city].count += 1;
        cityMap[city].neighbourhood_rating += +d.neighbourhood_rating;
        cityMap[city].connectivity_score += +d.connectivity_score;
        cityMap[city].satisfaction_score += +d.satisfaction_score;
      });
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

      // Filtrage sur les villes selon currentFilters
      const filteredCityNames = cityData
        .filter(c =>
          c.satisfaction_score >= currentFilters.minSatisfaction &&
          c.neighbourhood_rating >= currentFilters.minQuality &&
          c.connectivity_score >= currentFilters.minAccessibility
        )
        .map(c => c.city);

      const filteredCitiesData = cityData.filter(c => filteredCityNames.includes(c.city));

      // Rafraîchir le scatter plot avec ces villes filtrées
      renderScatter(selectedCountry, filteredCitiesData);
    });

    // filtered = filteredData si fourni, sinon filtrage par pays ou tout
    const filtered = filteredData !== undefined ? filteredData : (selectedCountry ? data.filter(d => d.country === selectedCountry) : data);

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
      .text(`Notation des villes de tous les pays`);
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height - 20)
      .attr("text-anchor", "middle")
      .text("Accessibilité");
    svg.append("text")
      .attr("x", -height / 2)
      .attr("y", 20)
      .attr("transform", "rotate(-90)")
      .attr("text-anchor", "middle")
      .text("Qualité");

    // Échelle pour la taille des points
    const rScale = d3.scaleLinear()
      .domain([0, d3.max(cityData, d => d.satisfaction_score)])
      .range([5, 20]);

    // Échelle de couleurs pour les pays
    const colorScale = d3.scaleOrdinal()
      .domain(countries)
      .range(d3.schemeCategory10);

    // Points
    svg.selectAll("circle")
      .data(cityData)
      .join("circle")
      .attr("cx", d => x(d.connectivity_score))
      .attr("cy", d => y(d.neighbourhood_rating))
      .attr("r", d => rScale(d.satisfaction_score))
      .attr("fill", d => colorScale(d.country))
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
        
        svg.selectAll("circle")
          .transition()
          .duration(200)
          .attr("opacity", p => p.country === d.country ? 1 : 0.1)
          .attr("r", p => p.country === d.country ? rScale(p.satisfaction_score) * 1.4 : rScale(p.satisfaction_score) * 0.8);
      })
      .on("mousemove", function(event) {
        d3.select("#tooltip")
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY + 10) + "px");
      })
      .on("mouseout", function() {
        svg.selectAll("circle")
          .transition()
          .duration(200)
          .attr("opacity", 0.7)
          .attr("r", d => rScale(d.satisfaction_score));
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

        const infoPanel = details.append("div")
          .attr("id", "city-info")
          .style("display", "inline-block")
          .style("vertical-align", "top")
          .style("width", "200px")
          .style("margin-right", "20px");

        const updateInfoPanel = (entries) => {
          const avgSatisfaction = d3.mean(entries, d => +d.satisfaction_score).toFixed(2);
          const avgQuality = d3.mean(entries, d => +d.neighbourhood_rating).toFixed(2);
          const avgConnectivity = d3.mean(entries, d => +d.connectivity_score).toFixed(2);
          infoPanel.html(`
            <h4>Infos</h4>
            <p><strong>Quartiers :</strong> ${entries.length}</p>
            <p><strong>Satisfaction moy. :</strong> ${avgSatisfaction}</p>
            <p><strong>Qualité moy. :</strong> ${avgQuality}</p>
            <p><strong>Accessibilité moy. :</strong> ${avgConnectivity}</p>
          `);
        };

        updateInfoPanel(cityEntries);

        const histWidth = 700;
        const histHeight = 300;
        const margin = {top: 20, right: 20, bottom: 50, left: 50};

        // Ajouter un bouton pour réafficher tous les quartiers
        const resetButton = details.append("button")
          .attr("id", "reset-quartiers")
          .text("Réafficher tous les quartiers")
          .style("margin-bottom", "10px")
          .style("margin-right", "10px")
          .on("click", () => {
            // Réinitialiser l'affichage complet des quartiers
            x.domain(cityEntries.map((_, i) => i + 1));
            svg.selectAll("rect")
              .transition()
              .duration(750)
              .attr("x", (_, i) => x(i + 1))
              .attr("width", x.bandwidth());
            svg.select("g")
              .transition()
              .duration(750)
              .call(d3.axisBottom(x).tickFormat(() => ""));
            updateInfoPanel(cityEntries);

            // Réappliquer le brush après réinitialisation
            svg.selectAll(".brush").remove();
            svg.append("g")
              .attr("class", "brush")
              .call(brush);
          });

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
          // Suppression du hover/tooltip sur les barres, ajout du clic pour afficher le panel quartier
          .on("click", function(event, d) {
            d3.select("#quartier-info-panel").remove();
            const panel = d3.select("#city-details")
              .append("div")
              .attr("id", "quartier-info-panel")
              .style("margin-top", "10px")
              .style("background", "#f0f0f0")
              .style("border", "1px solid #ccc")
              .style("border-radius", "6px")
              .style("padding", "8px")
              .style("width", "fit-content")
              .style("margin-left", "auto")
              .style("margin-right", "auto")
              .style("text-align", "left")
              .html(`
                <h4 style="margin-bottom:5px;">Quartier sélectionné</h4>
                <p><strong>Qualité :</strong> ${(+d.neighbourhood_rating).toFixed(2)}</p>
                <p><strong>Satisfaction :</strong> ${(+d.satisfaction_score).toFixed(2)}</p>
                <p><strong>Accessibilité :</strong> ${(+d.connectivity_score).toFixed(2)}</p>
              `);
          });

        // Axes
        svg.append("g")
          .attr("transform", `translate(0,${histHeight - margin.bottom})`)
          .call(d3.axisBottom(x).tickFormat(() => ""));

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

            updateInfoPanel(selectedData.map(({d}) => d));

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
              .call(d3.axisBottom(x).tickFormat(i => ""));
          });

        svg.append("g")
          .attr("class", "brush")
          .call(brush);
      });

    // Ajouter une légende sur le côté droit du SVG
    const legend = svg.append("g")
      .attr("transform", `translate(${width - 100},50)`);

    const legendCountries = selectedCountry ? [selectedCountry] : countries;

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

    legend.selectAll("g")
      .on("click", function(event, d) {
        const clickedCountry = d3.select(this).select("text").text();
        renderScatter(clickedCountry);
      })
      .on("mouseover", function(event, d) {
        const hoveredCountry = d3.select(this).select("text").text();
        svg.selectAll("circle")
          .transition()
          .duration(200)
          .attr("opacity", p => p.country === hoveredCountry ? 1 : 0.1)
          .attr("r", p => p.country === hoveredCountry ? rScale(p.satisfaction_score) * 1.4 : rScale(p.satisfaction_score) * 0.8);
      })
      .on("mouseout", function() {
        svg.selectAll("circle")
          .transition()
          .duration(200)
          .attr("opacity", 0.7)
          .attr("r", d => rScale(d.satisfaction_score));
      });
  }

  // Initialisation automatique sans paramètre
  renderScatter();
});