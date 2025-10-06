/* global d3 */

// ------------------------- CONFIG / UTILS -------------------------
const DATA_URL = "./data/global_house_purchase_dataset.csv";

const nf0 = d3.format(",.0f");
const nf1 = d3.format(",.1f");
const money = v => `${nf0(v)} €`;
const moneyPer = v => `${nf0(v)} €/m²`;
const toSqm = sqft => +sqft * 0.092903;

const firstKey = (obj, candidates) => candidates.find(k => k in obj);

// ------------------------- DATA LOADER -------------------------
async function loadData() {
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Chargement CSV: HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();

  const sep = (text.match(/;/g)?.length || 0) > (text.match(/,/g)?.length || 0) ? ";" : ",";
  const rows = d3.dsvFormat(sep).parse(text, d3.autoType);
  if (!rows.length) return [];

  const s = rows[0];
  const priceKey = firstKey(s, ["price","Price","amount","Amount"]) || "price";
  const sizeSqftKey = firstKey(s, ["property_size_sqft","size_sqft","Size_sqft","sqft"]);
  const sizeM2Key   = firstKey(s, ["property_size_m2","size_m2","m2"]);
  const cityKey     = firstKey(s, ["city","City"]) || "city";
  const countryKey  = firstKey(s, ["country","Country"]) || "country";
  const typeKey     = firstKey(s, ["property_type","type","Type"]) || "property_type";
  const idKey       = firstKey(s, ["property_id","id","Id"]) || "property_id";
  const decisionKey = firstKey(s, ["decision","Decision"]) || "decision";

  const prepared = rows.map(r => {
    const price = +r[priceKey];
    let size_m2 = null;
    if (sizeM2Key && r[sizeM2Key] != null) size_m2 = +r[sizeM2Key];
    else if (sizeSqftKey && r[sizeSqftKey] != null) size_m2 = toSqm(+r[sizeSqftKey]);

    return {
      id: r[idKey],
      city: String(r[cityKey] ?? "").trim(),
      country: String(r[countryKey] ?? "").trim(),
      type: String(r[typeKey] ?? "").trim(),
      price,
      size_m2,
      decision: r[decisionKey],
      price_per_m2: price && size_m2 ? price / Math.max(1, size_m2) : NaN
    };
  }).filter(d =>
    d.city && d.country && d.type &&
    Number.isFinite(d.price) &&
    Number.isFinite(d.size_m2) && d.size_m2 > 0 &&
    Number.isFinite(d.price_per_m2)
  );

  return prepared;
}

// ------------------------- AGGREGATIONS -------------------------
function aggByCity(data) {
  const rolled = d3.rollups(
    data,
    v => ({
      country: d3.mode(v.map(d => d.country)),
      n: v.length,
      avg_price_per_m2: d3.mean(v, d => d.price_per_m2),
      avg_price: d3.mean(v, d => d.price),
      avg_size_m2: d3.mean(v, d => d.size_m2)
    }),
    d => d.city
  );
  return rolled.map(([city, s]) => ({ city, ...s }));
}

// (si tu n’utilises plus le chart “par type”, tu peux supprimer cette agg)
function aggByTypeInCity(data, city) {
  const rows = data.filter(d => d.city === city);
  const rolled = d3.rollups(
    rows,
    v => ({
      n: v.length,
      avg_price_per_m2: d3.mean(v, d => d.price_per_m2),
      avg_price: d3.mean(v, d => d.price),
      avg_size_m2: d3.mean(v, d => d.size_m2)
    }),
    d => d.type
  );
  return rolled.map(([type, s]) => ({ type, city, ...s }));
}

// ------------------------- LAYOUT -------------------------
function mountSplitLayout() {
  const host = d3.select("#viz-container").html("");

  const wrap = host.append("div").attr("class", "viz-card ghpd");
  const split = wrap.append("div").attr("class", "split");

  const leftCol = split.append("div").attr("class", "col-left");
  const leftTop = leftCol.append("section").attr("class", "panel");
  leftTop.append("h2").text("Prix moyen au m² par ville (pays indiqué)");

  // colonne droite : détails
  const rightDetail = split.append("section").attr("class", "detail");
  rightDetail.append("h3").text("Détails");
  rightDetail.append("div").attr("class", "kpis");
  rightDetail.append("div").attr("class", "detail-table");

  return { leftTop, detail: rightDetail };
}

// ------------------------- MODAL -------------------------
function closeModal() {
  d3.select(".ghpd-modal-overlay").remove();
  d3.select("body").classed("modal-open", false);
}
function openTileModal(dataAll, { city, type, colorHex }) {
  const rows = dataAll.filter(d => d.city === city && d.type === type);
  const avgPpm2 = d3.mean(rows, d => d.price_per_m2);
  const medPpm2 = d3.median(rows, d => d.price_per_m2);
  const avgPrice = d3.mean(rows, d => d.price);
  const avgSize  = d3.mean(rows, d => d.size_m2);

  const overlay = d3.select("body").append("div")
    .attr("class","ghpd-modal-overlay")
    .on("click", (e) => { if (e.target === overlay.node()) closeModal(); });

  const modal = overlay.append("div").attr("class","ghpd-modal");
  const header = modal.append("div").attr("class","modal-header")
    .style("--accent", colorHex || "#3b82f6");

  header.append("h3").text(`${city} — ${type}`);
  header.append("button").attr("class","modal-close").text("×").on("click", closeModal);

  const stats = modal.append("div").attr("class","modal-kpis");
  const add = (k,v)=>{ const c=stats.append("div").attr("class","kpi"); c.append("div").attr("class","k").text(k); c.append("div").attr("class","v").text(v); };
  add("Observations", nf0(rows.length));
  add("Prix/m² moyen", moneyPer(avgPpm2));
  add("Prix/m² médian", moneyPer(medPpm2));
  add("Prix moyen", money(avgPrice));
  add("Taille moyenne", `${nf1(avgSize)} m²`);

  const top = rows.slice().sort((a,b)=>d3.descending(a.price_per_m2,b.price_per_m2)).slice(0,20);
  const tbl = modal.append("div").attr("class","modal-table").append("table").attr("class","table");
  const thead = tbl.append("thead").append("tr");
  ["ID","Ville","Type","Taille (m²)","Prix","Prix/m²","Decision"].forEach(h=>thead.append("th").text(h));
  const tbody = tbl.append("tbody");
  top.forEach(r=>{
    const tr = tbody.append("tr");
    tr.append("td").text(r.id);
    tr.append("td").text(r.city);
    tr.append("td").text(r.type);
    tr.append("td").text(nf1(r.size_m2));
    tr.append("td").text(money(r.price));
    tr.append("td").text(moneyPer(r.price_per_m2));
    tr.append("td").text(r.decision);
  });

  d3.select("body").classed("modal-open", true);
  d3.select(window).on("keydown.ghpd-modal", (e)=>{ if (e.key === "Escape") closeModal(); });
}

// ------------------------- CHART A (MARIMEKKO Overview) -------------------------
function chartMekko(container, dataAll, { onSelect, onZoom } = {}) {
  // Agrégations
  const byCity = d3.rollups(
    dataAll,
    v => ({ country: d3.mode(v.map(d => d.country)), n: v.length, avg_ppm2: d3.mean(v, d => d.price_per_m2) }),
    d => d.city
  ).map(([city, s]) => ({ city, ...s }));

  const byCityType = d3.rollups(
    dataAll,
    v => ({ n: v.length, avg_ppm2: d3.mean(v, d => d.price_per_m2), avg_price: d3.mean(v, d => d.price), avg_size: d3.mean(v, d => d.size_m2) }),
    d => d.city,
    d => d.type
  ).flatMap(([city, arr]) => {
    const total = d3.sum(arr, ([, o]) => o.n) || 1;
    return arr.map(([type, o]) => ({ city, type, n: o.n, share: o.n / total, avg_ppm2: o.avg_ppm2, avg_price: o.avg_price, avg_size: o.avg_size }));
  });

  const cityCountry = new Map(byCity.map(d => [d.city, d.country]));

  // UI
  const controls = container.append("div").attr("class", "controls");
  const countrySel = controls.append("label").html("<span>Pays</span>").append("select");
  const countries = ["ALL", ...Array.from(new Set(byCity.map(d => d.country))).sort()];
  countries.forEach(c => countrySel.append("option").attr("value", c).text(c));

  const searchWrap = controls.append("label");
  searchWrap.append("span").text("Ville");
  const searchInput = searchWrap.append("input").attr("type","search").attr("placeholder","Paris, Madrid…");

  const sortSel = controls.append("label").html("<span>Tri</span>").append("select");
  [["vol_desc","Volume ↓"],["ppm2_desc","Prix/m² ↓"],["az","Ville A→Z"]]
    .forEach(([v,t]) => sortSel.append("option").attr("value", v).text(t));

  controls.append("button")
    .attr("type","button")
    .text("Reset zoom")
    .on("click", () => { zoomDomain = [0,1]; activeTile = null; onZoom?.(null); update(); });

  // Légende dégradé (prix/m²)
  const legend = container.append("div").style("margin","6px 0 8px");
  const legendSvg = legend.append("svg").attr("width","100%").attr("height",36);

  const margin = { top: 50, right: 12, bottom: 32, left: 12 };
  const svg = container.append("svg").attr("width","100%").attr("height",460);
  const g = svg.append("g");
  const gx = g.append("g").attr("class","axis x");
  const brushG = g.append("g").attr("class","brush");      // brush DERRIÈRE
  const tilesG = g.append("g").attr("class","tiles");       // tuiles
  const labelsG = g.append("g").attr("class","labels");     // labels villes

  const tooltip = d3.select("body").append("div").attr("class","tooltip");

  // Color scales
  const allP = byCityType.map(d => d.avg_ppm2).filter(Number.isFinite);
  const cmin = d3.quantile(allP, 0.05) ?? d3.min(allP) ?? 0;
  const cmax = d3.quantile(allP, 0.95) ?? d3.max(allP) ?? 1;
  const color = d3.scaleSequential(d3.interpolateTurbo).domain([cmin, cmax]);

  const countriesDomain = Array.from(new Set(byCity.map(d => d.country))).sort();
  const countryColor = d3.scaleOrdinal().domain(countriesDomain).range(d3.schemeTableau10);

  function renderLegend() {
    const { width } = legendSvg.node().getBoundingClientRect();
    const w = Math.max(240, width - 10), h = 16;
    legendSvg.selectAll("*").remove();
    const defs = legendSvg.append("defs");
    const gradId = "ppm2-grad";
    const lg = defs.append("linearGradient").attr("id",gradId).attr("x1","0%").attr("x2","100%");
    for (let i=0;i<=10;i++){
      const t=i/10;
      lg.append("stop").attr("offset",(t*100)+"%").attr("stop-color", color(cmin + t*(cmax-cmin)));
    }
    const gL = legendSvg.append("g").attr("transform","translate(0,8)");
    gL.append("rect").attr("x",5).attr("y",0).attr("width",w).attr("height",h).attr("rx",4).attr("fill",`url(#${gradId})`);
    const scale = d3.scaleLinear().domain([cmin,cmax]).range([5,w+5]);
    gL.append("g").attr("transform",`translate(0,${h})`)
      .call(d3.axisBottom(scale).ticks(6).tickFormat(moneyPer))
      .select(".domain").remove();
  }
  renderLegend(); window.addEventListener("resize", renderLegend);

  // Légende des pays (pastilles)
  const countryLegend = container.append("div")
    .attr("class","country-legend")
    .style("display","flex").style("flex-wrap","wrap").style("gap","8px").style("margin","4px 0 8px");
  countriesDomain.forEach(c => {
    const item = countryLegend.append("div")
      .style("display","inline-flex").style("align-items","center").style("gap","6px").style("font-size","12px");
    item.append("span")
      .style("display","inline-block").style("width","10px").style("height","10px")
      .style("border-radius","999px").style("background", countryColor(c));
    item.append("span").text(c);
  });

  // State
  let zoomDomain = [0,1];            // zoom horizontal (part cumulée)
  let activeTile = null;             // {city, type} pour highlight + label

  function filteredCities() {
    const c = countrySel.node().value;
    const q = searchInput.node().value.trim().toLowerCase();
    let rows = byCity.filter(d => (c==="ALL" || d.country===c) && (!q || d.city.toLowerCase().includes(q)));
    const mode = sortSel.node().value;
    if (mode==="vol_desc") rows = d3.sort(rows, d => -d.n);
    else if (mode==="ppm2_desc") rows = d3.sort(rows, d => -(d.avg_ppm2 ?? 0));
    else rows = d3.sort(rows, d => d.city);
    return rows;
  }

  function update() {
    const cities = filteredCities();
    const totalN = d3.sum(cities, d => d.n) || 1;

    const { width, height } = svg.node().getBoundingClientRect();
    const W = Math.max(360, width);
    const H = Math.max(360, height);
    const innerW = W - margin.left - margin.right;
    const innerH = H - margin.top - margin.bottom;
    svg.attr("height", H);
    g.attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear().domain(zoomDomain).range([0, innerW]);

    // bandes cumulées par ville
    let acc = 0;
    const cityBands = cities.map(d => {
      const x0 = acc / totalN, x1 = (acc + d.n) / totalN; acc += d.n;
      return { city: d.city, country: d.country, n: d.n, x0, x1 };
    });

    // Axe %
    gx.attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(d3.scaleLinear().domain(zoomDomain).range([0, innerW]))
        .ticks(6).tickFormat(d3.format(".0%")))
      .select(".domain").remove();

    // Colonnes
    const col = tilesG.selectAll(".mekko-col").data(cityBands, d => d.city);
    col.exit().remove();
    const colEnter = col.enter().append("g").attr("class","mekko-col");
    const columns = colEnter.merge(col).attr("transform", d => `translate(${x(d.x0)},0)`);

    // Données par ville
    const dataByCity = d3.group(byCityType.filter(r => cityBands.some(cb => cb.city===r.city)), d => d.city);

    columns.each(function(cb) {
      const gCity = d3.select(this);
      const rows = (dataByCity.get(cb.city) || []).sort((a,b) => d3.descending(a.share,b.share));
      let cum = 0;
      const stacked = rows.map(r => { const y0 = cum; cum += r.share; const y1 = cum; return { ...r, y0, y1 }; });

      const y = d3.scaleLinear().domain([0,1]).range([innerH, 0]);

      // group "tile" -> rect + label (text)
      const tiles = gCity.selectAll("g.mekko-tile").data(stacked, d => d.type);
      tiles.exit().remove();

      const widthPx = Math.max(1, x(cb.x1) - x(cb.x0));

      const tEnter = tiles.enter().append("g").attr("class","mekko-tile")
        .on("mouseenter", (_, d) => {
          activeTile = { city: cb.city, type: d.type };
          // zoom directement sur la colonne de la ville
          zoomDomain = [cb.x0, cb.x1];
          update();
        })
        .on("mousemove", (event, d) => {
          const share = d3.format(".0%")(d.share);
          tooltip.html(
            `<div><strong>${cb.city}</strong> — ${cityCountry.get(cb.city)}</div>
             <div><em>${d.type}</em> • part: ${share}</div>
             <div>Prix/m² moyen: ${moneyPer(d.avg_ppm2)}</div>
             <div>Prix moyen: ${money(d.avg_price)} • Taille: ${nf1(d.avg_size)} m²</div>
             <div>Volume ville: ${nf0(cb.n)}</div>`
          )
          .style("left", (event.clientX+14)+"px")
          .style("top", (event.clientY+14)+"px")
          .style("opacity", 1);
        })
        .on("mouseleave", () => tooltip.style("opacity",0))
        .on("click", (_, d) => {
          onSelect?.({ city: cb.city, type: d.type });
          openTileModal(dataAll, { city: cb.city, type: d.type, colorHex: color(d.avg_ppm2) });
        });

      tEnter.append("rect");
      tEnter.append("text").attr("class","tile-label")
        .attr("text-anchor","middle")
        .style("font-weight","600")
        .style("paint-order","stroke")
        .style("stroke","#fff").style("stroke-width","3px").style("stroke-linejoin","round");

      const tilesAll = tEnter.merge(tiles);

      tilesAll.select("rect")
        .attr("x", 0)
        .attr("width", widthPx)
        .attr("y", d => y(d.y1))
        .attr("height", d => Math.max(1, y(d.y0) - y(d.y1)))
        .attr("fill", d => color(d.avg_ppm2))
        .attr("stroke", d =>
          activeTile && activeTile.city===cb.city && activeTile.type===d.type ? "#111" : "#1f2937"
        )
        .attr("stroke-width", d =>
          activeTile && activeTile.city===cb.city && activeTile.type===d.type ? 2.5 : 1
        )
        .attr("filter", d =>
          activeTile && activeTile.city===cb.city && activeTile.type===d.type ? "drop-shadow(0 1px 4px rgba(0,0,0,.35))" : null
        );

      // Libellé interne (ville + type) – visible si tuile assez grande OU si active
      tilesAll.select("text.tile-label")
        .attr("x", widthPx / 2)
        .attr("y", d => y((d.y0 + d.y1)/2) + 4)
        .text(d => {
          const isActive = activeTile && activeTile.city===cb.city && activeTile.type===d.type;
          const h = Math.max(1, y(d.y0) - y(d.y1));
          const show = isActive || (widthPx > 90 && h > 28);
          return show ? `${cb.city} • ${d.type}` : "";
        });
    });

    // Labels ville en haut (avec pastille pays)
    const labels = labelsG.selectAll(".mekko-label").data(cityBands, d => d.city);
    labels.exit().remove();

    const labelsEnter = labels.enter().append("g").attr("class","mekko-label");
    labelsEnter.append("circle").attr("r",4);
    labelsEnter.append("text");

    const allLabels = labelsEnter.merge(labels)
      .attr("transform", d => `translate(${(x(d.x0) + x(d.x1)) / 2},0)`);

    allLabels.each(function(d){
      const gg = d3.select(this);
      gg.select("circle").attr("cx",0).attr("cy",-26).attr("fill", countryColor(d.country));
      const w = x(d.x1) - x(d.x0);
      gg.select("text")
        .attr("text-anchor","middle").attr("y",-26)
        .style("font-size","12px").style("font-weight","600")
        .style("paint-order","stroke").style("stroke","#fff").style("stroke-width","3px").style("stroke-linejoin","round")
        .text(() => (w > 100 ? `${d.city} • ${d.country}` : (w > 60 ? d.city : "")));
    });

    // Brush (zoom manuel) derrière les tuiles
    const brush = d3.brushX()
      .extent([[0,0],[innerW,innerH]])
      .on("end", ({selection}) => {
        if (!selection) { zoomDomain = [0,1]; activeTile = null; onZoom?.(null); update(); return; }
        const [px0, px1] = selection;
        const s = d3.scaleLinear().domain([0,innerW]).range(zoomDomain);
        zoomDomain = [s(px0), s(px1)];
        activeTile = null;
        onZoom?.(zoomDomain);
        update();
      });
    brushG.call(brush);
    brushG.lower();
  }

  // events
  countrySel.on("change", () => { zoomDomain=[0,1]; activeTile=null; update(); });
  searchInput.on("input", () => { zoomDomain=[0,1]; activeTile=null; update(); });
  sortSel.on("change", () => { zoomDomain=[0,1]; activeTile=null; update(); });
  window.addEventListener("resize", update);

  update();

  return { resetZoom: () => { zoomDomain = [0,1]; activeTile = null; update(); } };
}

// ------------------------- DETAIL PANEL (réutilisé par le modal aussi) -------------------------
function renderDetail(detailEl, dataAll, { city, type=null }) {
  const where = d => d.city === city && (type ? d.type === type : true);
  const rows = dataAll.filter(where);
  if (!rows.length) {
    detailEl.select(".kpis").html("");
    detailEl.select(".detail-table").html("<p class='badge'>Aucune donnée pour la sélection</p>");
    return;
  }
  const avgPpm2 = d3.mean(rows, d => d.price_per_m2);
  const medPpm2 = d3.median(rows, d => d.price_per_m2);
  const avgPrice = d3.mean(rows, d => d.price);
  const avgSize = d3.mean(rows, d => d.size_m2);
  const minPpm2 = d3.min(rows, d => d.price_per_m2);
  const maxPpm2 = d3.max(rows, d => d.price_per_m2);

  detailEl.select("h3").text(type ? `Détails — ${city} • ${type}` : `Détails — ${city}`);

  const k = detailEl.select(".kpis").html("");
  const add = (kname, val) => {
    const card = k.append("div").attr("class","kpi");
    card.append("div").attr("class","k").text(kname);
    card.append("div").attr("class","v").text(val);
  };
  add("Observations", nf0(rows.length));
  add("Prix/m² moyen", moneyPer(avgPpm2));
  add("Prix/m² médian", moneyPer(medPpm2));
  add("Prix moyen", money(avgPrice));
  add("Taille moyenne", `${nf1(avgSize)} m²`);
  add("Min–Max prix/m²", `${moneyPer(minPpm2)} → ${moneyPer(maxPpm2)}`);

  const top = rows.slice().sort((a,b)=>d3.descending(a.price_per_m2,b.price_per_m2)).slice(0,10);
  const tbl = detailEl.select(".detail-table").html("")
    .append("table").attr("class","table");
  const thead = tbl.append("thead").append("tr");
  ["ID","Ville","Type","Taille (m²)","Prix","Prix/m²","Decision"].forEach(h=>thead.append("th").text(h));
  const tbody = tbl.append("tbody");
  top.forEach(r=>{
    const tr = tbody.append("tr");
    tr.append("td").text(r.id);
    tr.append("td").text(r.city);
    tr.append("td").text(r.type);
    tr.append("td").text(nf1(r.size_m2));
    tr.append("td").text(money(r.price));
    tr.append("td").text(moneyPer(r.price_per_m2));
    tr.append("td").text(r.decision);
  });
}

// ------------------------- MAIN -------------------------
async function dashboard() {
  const data = await loadData();
  const { leftTop, detail } = mountSplitLayout();

  // Mekko (overview + interactions)
  chartMekko(leftTop, data, {
    onSelect: ({ city, type }) => { renderDetail(detail, data, { city, type }); },
    onZoom: () => {}
  });

  // Détail initial (ville la plus volumineuse)
  const byCity = aggByCity(data);
  const defaultCity = byCity.slice().sort((a,b)=>d3.descending(a.n, b.n))[0]?.city || byCity[0]?.city;
  renderDetail(detail, data, { city: defaultCity });
}

// ------------------------- Hook pour index.html -------------------------
window.loadViz = function (who) {
  d3.selectAll(".tooltip").remove();
  if (who === "maxime") {
    dashboard().catch(err => {
      d3.select("#viz-container").html("")
        .append("div").attr("class","viz-card")
        .append("pre").text("Erreur : " + err.message);
    });
  } else {
    d3.select("#viz-container").html("")
      .append("div").attr("class","viz-card")
      .append("p").text("Sélectionnez « Prix moyen au m² » (Maxime).");
  }
};
