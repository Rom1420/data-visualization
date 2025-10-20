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

  // ---------- MODALE AVEC PLOTS (Graphiques / Texte) + Curseurs communs ----------
M.openTileModal = function openTileModal(dataAll, { city, type, colorHex }) {
  const rows = dataAll.filter(d => d.city === city && d.type === type);

  // KPIs (inchangés, sur l’ensemble)
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

  // --- Barre d'outils : affichage + curseurs (NOUVEAU: curseurs communs aux 2 vues) ---
  const toolbar = modal.append("div").attr("class","modal-toolbar");

  // Sélecteur d'affichage (existant)
  const select = toolbar.append("label")
    .style("display","inline-flex").style("gap","8px").style("align-items","center")
    .html(`<span>Affichage&nbsp;:</span>`)
    .append("select")
      .attr("aria-label","Mode d'affichage")
      .on("change", () => render());
  select.selectAll("option")
    .data([{value:"charts",label:"Graphiques"},{value:"text",label:"Texte"}])
    .enter().append("option")
      .attr("value", d=>d.value).text(d=>d.label);
  select.property("value","charts");

  // --------- Helpers bornes & steps pour curseurs ---------
  const extentNum = (arr) => {
    const v = arr.filter(Number.isFinite);
    if (!v.length) return [null,null];
    return [d3.min(v), d3.max(v)];
  };
  const makeStep = (min, max) => {
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return 1;
    const rough = (max - min) / 100;
    const pow10 = Math.pow(10, Math.floor(Math.log10(rough)));
    const candidates = [1, 2, 5, 10].map(k => k * pow10);
    return candidates.find(s => s >= rough) || rough;
  };

  // Bornes globales (par ville/type)
  const [pMin0, pMax0] = extentNum(rows.map(d => +d.price));
  const [sMin0, sMax0] = extentNum(rows.map(d => +d.size_m2));
  const [mMin0, mMax0] = extentNum(rows.map(d => +d.price_per_m2));

  // État des filtres partagé
  const filters = {
    price: { min: pMin0, max: pMax0 },
    size:  { min: sMin0, max: sMax0 },
    ppm2:  { min: mMin0, max: mMax0 }
  };

  // Curseurs réutilisables
  function addRange(labelText, extent, fmt) {
    const [mn, mx] = extent;
    if (mn == null || mx == null) return null;

    const wrap = toolbar.append("div")
      .style("display","inline-flex").style("gap","8px").style("align-items","center")
      .style("margin-left","12px");

    wrap.append("span").text(labelText);
    const step = makeStep(mn, mx);

    const minLbl = wrap.append("span").style("font-variant-numeric","tabular-nums");
    const minI = wrap.append("input").attr("type","range")
      .attr("min", mn).attr("max", mx).attr("step", step)
      .style("width","120px")
      .on("input", () => {
        if (+minI.property("value") > +maxI.property("value")) {
          maxI.property("value", minI.property("value"));
        }
        updateLabels(); render(); // <= re-render la vue active
      });

    const maxI = wrap.append("input").attr("type","range")
      .attr("min", mn).attr("max", mx).attr("step", step)
      .style("width","120px")
      .on("input", () => {
        if (+maxI.property("value") < +minI.property("value")) {
          minI.property("value", maxI.property("value"));
        }
        updateLabels(); render();
      });

    const maxLbl = wrap.append("span").style("font-variant-numeric","tabular-nums");

    // init
    minI.property("value", mn);
    maxI.property("value", mx);
    function updateLabels(){
      minLbl.text(fmt(+minI.property("value")));
      maxLbl.text(fmt(+maxI.property("value")));
    }
    updateLabels();

    return {
      getMin: () => +minI.property("value"),
      getMax: () => +maxI.property("value"),
      reset: () => { minI.property("value", mn); maxI.property("value", mx); updateLabels(); }
    };
  }

  // Curseurs visibles tout le temps (communs aux 2 vues)
  const fPrice = addRange("Prix € :",    [pMin0, pMax0], v => money(v));
  const fSize  = addRange("Taille m² :", [sMin0, sMax0], v => nf1(v));
  const fPpm2  = addRange("Prix/m² € :", [mMin0, mMax0], v => moneyPer(v));

  // Boutons de droite (réinitialiser)
  toolbar.append("div")
    .style("margin-left","auto")
    .append("button")
      .attr("type","button").text("Réinitialiser filtres")
      .on("click", () => {
        [fPrice,fSize,fPpm2].forEach(f => f && f.reset());
        render();
      });

  // Mise à jour de l'état filters à chaque render()
  function filteredRows() {
    if (fPrice) { filters.price.min = fPrice.getMin(); filters.price.max = fPrice.getMax(); }
    if (fSize)  { filters.size.min  = fSize.getMin();  filters.size.max  = fSize.getMax();  }
    if (fPpm2)  { filters.ppm2.min  = fPpm2.getMin();  filters.ppm2.max  = fPpm2.getMax();  }

    const inRange = (v, mn, mx) => {
      if (!Number.isFinite(v)) return false;
      if (mn != null && v < mn) return false;
      if (mx != null && v > mx) return false;
      return true;
    };

    return rows.filter(d =>
      inRange(+d.price,        filters.price.min, filters.price.max) &&
      inRange(+d.size_m2,      filters.size.min,  filters.size.max)  &&
      inRange(+d.price_per_m2, filters.ppm2.min,  filters.ppm2.max)
    );
  }

  // KPIs (toujours affichés)
  const stats = modal.append("div").attr("class","modal-kpis");
  const add = (k,v)=>{ const c=stats.append("div").attr("class","kpi"); c.append("div").attr("class","k").text(k); c.append("div").attr("class","v").text(v); };
  add("Observations", nf0(rows.length));
  add("Prix/m² moyen", moneyPer(avgPpm2));
  add("Prix/m² médian", moneyPer(medPpm2));
  add("Prix moyen", money(avgPrice));
  add("Taille moyenne", `${nf1(avgSize)} m²`);

  // Contenu qui bascule
  const container = modal.append("div").attr("class","modal-content");

  // ---------------- RENDU TEXTE (utilise filteredRows) ----------------
  function renderText() {
    container.html("");

    const tableWrap = container.append("div").attr("class","modal-table");
    const table = tableWrap.append("table").attr("class","table");

    const columns = [
      { k:"price",        label:"Prix",        get: d => d.price,        fmt: d => money(d.price),           sortNum:true },
      { k:"size_m2",      label:"Taille (m²)", get: d => d.size_m2,      fmt: d => nf1(d.size_m2),           sortNum:true },
      { k:"price_per_m2", label:"Prix/m²",     get: d => d.price_per_m2, fmt: d => moneyPer(d.price_per_m2), sortNum:true },
    ];

    const thead = table.append("thead").append("tr");
    let sortState = { k: "price", asc: false };
    thead.selectAll("th").data(columns).enter()
      .append("th").attr("data-k", d=>d.k).style("cursor","pointer")
      .text(d=>d.label)
      .on("click", (_, col) => {
        if (sortState.k === col.k) sortState.asc = !sortState.asc;
        else { sortState.k = col.k; sortState.asc = !(col.sortNum === true); }
        draw();
      });

    const tbody = table.append("tbody");

    function sorted(arr){
      const col = columns.find(c => c.k === sortState.k) || columns[0];
      const acc = (d)=> col.get(d);
      const data = arr.slice().sort((a,b)=> d3.ascending(+acc(a), +acc(b)));
      return sortState.asc ? data : data.reverse();
    }

    function draw(){
      const data = sorted(filteredRows());
      const tr = tbody.selectAll("tr").data(data, (d,i)=> i);
      tr.exit().remove();
      const trEnter = tr.enter().append("tr");

      trEnter.selectAll("td").data(d => columns).enter()
        .append("td")
        .text((c, i, nodes) => {
          const d = d3.select(nodes[i].parentNode).datum();
          return (c.fmt ? c.fmt(d) : c.get(d));
        });

      tr.selectAll("td").data(d => columns)
        .text((c, i, nodes) => {
          const d = d3.select(nodes[i].parentNode).datum();
          return (c.fmt ? c.fmt(d) : c.get(d));
        });
    }

    draw();
  }

  // ---------------- RENDU GRAPHIQUES (maintenant filtré) ----------------
  function renderCharts() {
    container.html("");

    const fr = filteredRows();
    const charts = container.append("div").attr("class","modal-charts");

    if (!fr.length) {
      charts.append("div").style("padding","8px 12px").style("color","#6b7280")
        .text("Aucune donnée ne correspond aux filtres.");
      return;
    }

    // -------- Scatter --------
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
        .domain(d3.extent(fr, d => d.size_m2)).nice()
        .range([0, innerW]);

      const y = d3.scaleLinear()
        .domain(d3.extent(fr, d => d.price)).nice()
        .range([innerH, 0]);

      g.append("g")
        .attr("transform", `translate(0,${innerH})`)
        .call(d3.axisBottom(x).ticks(6).tickFormat(d => nf1(d) + " m²"));

      g.append("g")
        .call(d3.axisLeft(y).ticks(6).tickFormat(v => money(v)));

      g.append("text")
        .attr("x", innerW/2).attr("y", innerH + 38)
        .attr("text-anchor","middle").attr("font-weight","600")
        .text("Taille (m²)");

      g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -innerH/2).attr("y", -60)
        .attr("text-anchor","middle").attr("font-weight","600")
        .text("Prix (€)");

      g.append("g")
        .attr("fill", colorHex || "#3b82f6")
        .attr("fill-opacity", 0.65)
        .selectAll("circle")
        .data(fr)
        .enter().append("circle")
          .attr("cx", d => x(d.size_m2))
          .attr("cy", d => y(d.price))
          .attr("r", 3.5);

      // régression sur données filtrées
      const n = fr.length;
      if (n > 1) {
        const xbar = d3.mean(fr, d => d.size_m2);
        const ybar = d3.mean(fr, d => d.price);
        const sxy = d3.sum(fr, d => (d.size_m2 - xbar)*(d.price - ybar));
        const sxx = d3.sum(fr, d => (d.size_m2 - xbar)*(d.size_m2 - xbar));
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

      svg.append("text")
        .attr("x", m.left).attr("y", 18)
        .attr("font-weight","700")
        .text("Prix en fonction de la taille (filtré)");
    })();

    // -------- Boxplot --------
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

      const vals = fr.map(d => d.price_per_m2).filter(Number.isFinite).sort(d3.ascending);
      if (!vals.length) {
        svg.append("text").attr("x", m.left).attr("y", 18).attr("font-weight","700")
           .text("Distribution du prix au m² (aucune donnée)");
        return;
      }

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

      g.append("g")
        .attr("transform", `translate(0,${innerH})`)
        .call(d3.axisBottom(x).ticks(6).tickFormat(v => moneyPer(v)));

      const yC = innerH/2;

      g.append("rect")
        .attr("x", x(q1))
        .attr("y", yC - 22)
        .attr("width", Math.max(1, x(q3) - x(q1)))
        .attr("height", 44)
        .attr("fill", (colorHex || "#3b82f6"))
        .attr("fill-opacity", 0.25)
        .attr("stroke", colorHex || "#3b82f6");

      g.append("line")
        .attr("x1", x(med)).attr("x2", x(med))
        .attr("y1", yC - 22).attr("y2", yC + 22)
        .attr("stroke", colorHex || "#3b82f6")
        .attr("stroke-width", 2);

      g.append("line")
        .attr("x1", x(whiskerMin)).attr("x2", x(q1))
        .attr("y1", yC).attr("y2", yC)
        .attr("stroke", "#555");

      g.append("line")
        .attr("x1", x(q3)).attr("x2", x(whiskerMax))
        .attr("y1", yC).attr("y2", yC)
        .attr("stroke", "#555");

      g.append("line")
        .attr("x1", x(whiskerMin)).attr("x2", x(whiskerMin))
        .attr("y1", yC - 12).attr("y2", yC + 12)
        .attr("stroke", "#555");

      g.append("line")
        .attr("x1", x(whiskerMax)).attr("x2", x(whiskerMax))
        .attr("y1", yC - 12).attr("y2", yC + 12)
        .attr("stroke", "#555");

      g.append("g")
        .attr("fill", "#777")
        .selectAll("circle")
        .data(outliers)
        .enter().append("circle")
          .attr("cx", d => x(d))
          .attr("cy", yC)
          .attr("r", 2.5)
          .attr("opacity", 0.8);

      svg.append("text")
        .attr("x", m.left).attr("y", 18)
        .attr("font-weight","700")
        .text("Distribution du prix au m² (filtré)");
    })();
  }

  // Router d'affichage
  function render() {
    const mode = select.property("value");
    if (mode === "text") renderText();
    else renderCharts();
  }

  // 1er rendu
  render();

  d3.select("body").classed("modal-open", true);
  d3.select(window).on("keydown.ghpd-modal", (e)=>{ if (e.key === "Escape") M.closeModal(); });
};


})();
