/* global d3 */
(function () {
  const M = (window.Maxime = window.Maxime || {});
  const { nf0, nf1, money, moneyPer } = M;

  M.mountSplitLayout = function mountSplitLayout() {
    const host = d3.select("#viz-container").html("");

    const wrap = host.append("div").attr("class", "viz-card ghpd");
    const split = wrap.append("div").attr("class", "split");

    const leftTop = split.append("section").attr("class", "panel");
    leftTop.append("h2").text("Prix moyen au m² par ville (pays indiqué)");

    return { leftTop };
  };

  M.closeModal = function closeModal() {
    d3.select(".ghpd-modal-overlay").remove();
    d3.select("body").classed("modal-open", false);
  };

  // ---------- MODALE AVEC PLOTS ----------
  M.openTileModal = function openTileModal(dataAll, { city, type, colorHex }) {
    const rows = dataAll.filter(d => d.city === city && d.type === type);

    // KPIs
    const avgPpm2 = d3.mean(rows, d => d.price_per_m2);
    const medPpm2 = d3.median(rows, d => d.price_per_m2);
    const avgPrice = d3.mean(rows, d => d.price);
    const avgSize  = d3.mean(rows, d => d.size_m2);

    const overlay = d3.select("body").append("div")
      .attr("class","ghpd-modal-overlay")
      .on("click", (e) => { if (e.target === overlay.node()) M.closeModal(); });

    const modal = overlay.append("div").attr("class","ghpd-modal");

    // Header
    modal.append("div").attr("class","modal-header")
      .style("--accent", colorHex || "#3b82f6")
      .html(`<h3>${city} — ${type}</h3>`)
      .append("button").attr("class","modal-close").text("×").on("click", M.closeModal);

    // KPIs (toujours affichés)
    const stats = modal.append("div").attr("class","modal-kpis");
    const add = (k,v)=>{ const c=stats.append("div").attr("class","kpi"); c.append("div").attr("class","k").text(k); c.append("div").attr("class","v").text(v); };
    add("Observations", nf0(rows.length));
    add("Prix/m² moyen", moneyPer(avgPpm2));
    add("Prix/m² médian", moneyPer(medPpm2));
    add("Prix moyen", money(avgPrice));
    add("Taille moyenne", `${nf1(avgSize)} m²`);

    // Conteneur des plots
    const charts = modal.append("div").attr("class","modal-charts");

    // ---------------- Scatter: Prix (€) ~ Taille (m²) ----------------
    (function drawScatter() {
      const w = Math.max(620, Math.min(900, window.innerWidth - 160));
      const h = 320;
      const m = {top: 24, right: 24, bottom: 48, left: 84};
      const innerW = w - m.left - m.right;
      const innerH = h - m.top - m.bottom;

      const svg = charts.append("svg")
        .attr("class","chart scatter")
        .attr("width","100%")
        .attr("viewBox", `0 0 ${w} ${h}`);

      const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

      const x = d3.scaleLinear()
        .domain(d3.extent(rows, d => d.size_m2)).nice()
        .range([0, innerW]);

      const y = d3.scaleLinear()
        .domain(d3.extent(rows, d => d.price)).nice()
        .range([innerH, 0]);

      // Axes
      g.append("g")
        .attr("transform", `translate(0,${innerH})`)
        .call(d3.axisBottom(x).ticks(6).tickFormat(d => nf1(d) + " m²"));

      g.append("g")
        .call(d3.axisLeft(y).ticks(6).tickFormat(v => money(v)));

      // Labels axes
      g.append("text")
        .attr("x", innerW/2).attr("y", innerH + 38)
        .attr("text-anchor","middle").attr("font-weight","600")
        .text("Taille (m²)");

      g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -innerH/2).attr("y", -60)
        .attr("text-anchor","middle").attr("font-weight","600")
        .text("Prix (€)");

      // Points (ni ID ni Decision)
      g.append("g")
        .attr("fill", colorHex || "#3b82f6")
        .attr("fill-opacity", 0.65)
        .selectAll("circle")
        .data(rows)
        .enter().append("circle")
          .attr("cx", d => x(d.size_m2))
          .attr("cy", d => y(d.price))
          .attr("r", 3.5);

      // Ligne de tendance (régression linéaire simple)
      const n = rows.length;
      if (n > 1) {
        const xbar = d3.mean(rows, d => d.size_m2);
        const ybar = d3.mean(rows, d => d.price);
        const sxy = d3.sum(rows, d => (d.size_m2 - xbar)*(d.price - ybar));
        const sxx = d3.sum(rows, d => (d.size_m2 - xbar)*(d.size_m2 - xbar));
        if (sxx > 0) {
          const b1 = sxy / sxx;
          const b0 = ybar - b1 * xbar;
          const xLine = x.domain();
          const linePts = xLine.map(X => ({ X, Y: b0 + b1 * X }));
          g.append("path")
            .datum(linePts)
            .attr("fill","none")
            .attr("stroke", colorHex || "#3b82f6")
            .attr("stroke-width", 2)
            .attr("d", d3.line().x(d => x(d.X)).y(d => y(d.Y)));
        }
      }

      // Titre
      svg.append("text")
        .attr("x", m.left).attr("y", 18)
        .attr("font-weight","700")
        .text("Prix en fonction de la taille");
    })();

    // ---------------- Boxplot: Prix/m² (€/m²) ----------------
    (function drawBoxplot() {
      const w = Math.max(620, Math.min(900, window.innerWidth - 160));
      const h = 220;
      const m = {top: 24, right: 24, bottom: 28, left: 84};
      const innerW = w - m.left - m.right;
      const innerH = h - m.top - m.bottom;

      const svg = charts.append("svg")
        .attr("class","chart boxplot")
        .attr("width","100%")
        .attr("viewBox", `0 0 ${w} ${h}`);

      const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

      const vals = rows.map(d => d.price_per_m2).filter(Number.isFinite).sort(d3.ascending);
      if (!vals.length) return;

      const q1 = d3.quantileSorted(vals, 0.25);
      const med = d3.quantileSorted(vals, 0.50);
      const q3 = d3.quantileSorted(vals, 0.75);
      const iqr = q3 - q1;
      const loFence = q1 - 1.5 * iqr;
      const hiFence = q3 + 1.5 * iqr;

      const whiskerMin = d3.min(vals.filter(v => v >= loFence));
      const whiskerMax = d3.max(vals.filter(v => v <= hiFence));
      const outliers = vals.filter(v => v < loFence || v > hiFence);

      const x = d3.scaleLinear()
        .domain([d3.min([whiskerMin, d3.min(vals)]), d3.max([whiskerMax, d3.max(vals)])]).nice()
        .range([0, innerW]);

      // Axe
      g.append("g")
        .attr("transform", `translate(0,${innerH})`)
        .call(d3.axisBottom(x).ticks(6).tickFormat(v => moneyPer(v)));

      // Position verticale du boxplot
      const yC = innerH/2;

      // Box (q1 ~ q3)
      g.append("rect")
        .attr("x", x(q1))
        .attr("y", yC - 22)
        .attr("width", Math.max(1, x(q3) - x(q1)))
        .attr("height", 44)
        .attr("fill", (colorHex || "#3b82f6"))
        .attr("fill-opacity", 0.25)
        .attr("stroke", colorHex || "#3b82f6");

      // Médiane
      g.append("line")
        .attr("x1", x(med)).attr("x2", x(med))
        .attr("y1", yC - 22).attr("y2", yC + 22)
        .attr("stroke", colorHex || "#3b82f6")
        .attr("stroke-width", 2);

      // Whiskers
      g.append("line")
        .attr("x1", x(whiskerMin)).attr("x2", x(q1))
        .attr("y1", yC).attr("y2", yC)
        .attr("stroke", "#555");

      g.append("line")
        .attr("x1", x(q3)).attr("x2", x(whiskerMax))
        .attr("y1", yC).attr("y2", yC)
        .attr("stroke", "#555");

      // Caps
      g.append("line")
        .attr("x1", x(whiskerMin)).attr("x2", x(whiskerMin))
        .attr("y1", yC - 12).attr("y2", yC + 12)
        .attr("stroke", "#555");

      g.append("line")
        .attr("x1", x(whiskerMax)).attr("x2", x(whiskerMax))
        .attr("y1", yC - 12).attr("y2", yC + 12)
        .attr("stroke", "#555");

      // Outliers (petits points)
      g.append("g")
        .attr("fill", "#777")
        .selectAll("circle")
        .data(outliers)
        .enter().append("circle")
          .attr("cx", d => x(d))
          .attr("cy", yC)
          .attr("r", 2.5)
          .attr("opacity", 0.8);

      // Titre
      svg.append("text")
        .attr("x", m.left).attr("y", 18)
        .attr("font-weight","700")
        .text("Distribution du prix au m² (boxplot)");
    })();

    d3.select("body").classed("modal-open", true);
    d3.select(window).on("keydown.ghpd-modal", (e)=>{ if (e.key === "Escape") M.closeModal(); });
  };
})();
