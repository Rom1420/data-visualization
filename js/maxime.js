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

// ------------------------- LAYOUT -------------------------
function mountSplitLayout() {
  const host = d3.select("#viz-container").html("");

  const wrap = host.append("div").attr("class", "viz-card ghpd");
  const split = wrap.append("div").attr("class", "split");

  // Un seul panneau (pleine largeur)
  const leftTop = split.append("section").attr("class", "panel");
  leftTop.append("h2").text("Prix moyen au m² par ville (pays indiqué)");

  return { leftTop };
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

  // --- Pays disponibles & pagination ---
  const countriesAll = Array.from(new Set(byCity.map(d => d.country))).sort((a,b)=>d3.ascending(a,b));
  const COUNTRIES_PER_PAGE = 3;
  const totalPages = Math.max(1, Math.ceil(countriesAll.length / COUNTRIES_PER_PAGE));
  let page = 0; // state: index de page (0..totalPages-1)

  const countriesOfPage = p =>
    countriesAll.slice(p * COUNTRIES_PER_PAGE, p * COUNTRIES_PER_PAGE + COUNTRIES_PER_PAGE);

  // UI (controls haut)
  const controls = container.append("div").attr("class", "controls");

  const searchWrap = controls.append("label");
  searchWrap.append("span").text("Ville");
  const searchInput = searchWrap.append("input").attr("type","search").attr("placeholder","Paris, Madrid…");

  // bouton reset (annule le focus)
  controls.append("button")
    .attr("type","button")
    .text("Reset")
    .on("click", () => {
      activeTile = null;
      updateLegendCursor(null); // <<< ADDED
      update();
      onZoom?.(null);
    });

  // marges
  const margin = { top: 64, right: 12, bottom: 56, left: 12 }; // bottom ↑ pour le menu de pagination
  const svg = container.append("svg").attr("width","100%").attr("height",460);
  const g = svg.append("g");
  const gx = g.append("g").attr("class","axis x");
  const tilesG = g.append("g").attr("class","tiles");
  const countryBandsG = g.append("g").attr("class","country-bands");

  // Légende dégradé
  const legendBottom = container.append("div").style("margin","8px 0 0");
  const legendSvg = legendBottom.append("svg").attr("width","100%").attr("height",40);

  // <<< ADDED: état & helpers du curseur de légende
  const legendState = {
    scale: null,   // d3.scaleLinear cmin..cmax -> px
    gLane: null,   // groupe de la piste
    gCursor: null, // groupe curseur
    h: 16,
    last: null     // { val, city, fill } pour repositionner au resize
  };
  // >>> END ADDED

  // --- Menu de pagination (bas) ---
  const pager = container.append("div").attr("class","pager").style("display","flex").style("gap","8px").style("align-items","center").style("justify-content","center").style("margin","8px 0 0");
  const btnPrev = pager.append("button").attr("type","button").text("◀ Précédent");
  const pageInfo = pager.append("span").attr("class","page-info").style("min-width","140px").style("text-align","center");
  const dotsWrap = pager.append("div").style("display","flex").style("gap","6px").style("align-items","center");
  const btnNext = pager.append("button").attr("type","button").text("Suivant ▶");

  function renderDots() {
    const dots = dotsWrap.selectAll("button.pdot").data(d3.range(totalPages));
    dots.exit().remove();
    dots.enter().append("button")
      .attr("class","pdot")
      .style("width","10px").style("height","10px")
      .style("border-radius","50%")
      .style("border","1px solid #999")
      .style("background","#eee")
      .on("click", (_, i)=>{ page = i; activeTile = null; updateLegendCursor(null); update(); updatePager(); })
      .merge(dots)
      .style("background", d => d===page ? "#111" : "#eee")
      .style("border-color", d => d===page ? "#111" : "#999");
  }

  function updatePager() {
    const curCountries = countriesOfPage(page);
    pageInfo.text(`Page ${page+1} / ${totalPages} — ${curCountries.join(", ")}`);
    btnPrev.attr("disabled", page<=0 ? true : null);
    btnNext.attr("disabled", page>=totalPages-1 ? true : null);
    renderDots();
  }

  btnPrev.on("click", () => {
    if (page>0) { page--; activeTile = null; updateLegendCursor(null); update(); updatePager(); }
  });
  btnNext.on("click", () => {
    if (page<totalPages-1) { page++; activeTile = null; updateLegendCursor(null); update(); updatePager(); }
  });

  const tooltip = d3.select("body").append("div").attr("class","tooltip");

  // Color scales
  const allP = byCityType.map(d => d.avg_ppm2).filter(Number.isFinite);
  const cmin = d3.quantile(allP, 0.05) ?? d3.min(allP) ?? 0;
  const cmax = d3.quantile(allP, 0.95) ?? d3.max(allP) ?? 1;
  const color = d3.scaleSequential(d3.interpolateTurbo).domain([cmin, cmax]);

  // <<< UPDATED: Légende + curseur
  function renderLegend() {
    const { width } = legendSvg.node().getBoundingClientRect();
    const w = Math.max(240, width - 10), h = 16;
    legendState.h = h;

    legendSvg.selectAll("*").remove();
    const defs = legendSvg.append("defs");
    const gradId = "ppm2-grad";
    const lg = defs.append("linearGradient").attr("id",gradId).attr("x1","0%").attr("x2","100%");
    for (let i=0;i<=10;i++){
      const t=i/10;
      lg.append("stop").attr("offset",(t*100)+"%").attr("stop-color", color(cmin + t*(cmax-cmin)));
    }
    const gL = legendSvg.append("g").attr("transform","translate(0,8)");
    legendState.gLane = gL;

    gL.append("rect").attr("x",5).attr("y",0).attr("width",w).attr("height",h).attr("rx",4).attr("fill",`url(#${gradId})`);

    const scale = d3.scaleLinear().domain([cmin,cmax]).range([5,w+5]);
    legendState.scale = scale;

    gL.append("g").attr("transform",`translate(0,${h})`)
      .call(d3.axisBottom(scale).ticks(6).tickFormat(moneyPer))
      .select(".domain").remove();

    // curseur (créé à chaque renderLegend)
    const gCur = gL.append("g").attr("class","legend-cursor").style("display","none");
    legendState.gCursor = gCur;

    gCur.append("line").attr("class","cur-line").attr("y1",-6).attr("y2",h).attr("stroke","#111").attr("stroke-width",2);
    gCur.append("path").attr("class","cur-head").attr("d","M0,-10 l6,10 l-12,0 z").attr("fill","#111").attr("stroke","#111").attr("stroke-width",0.6);

    const gLab = gCur.append("g").attr("class","cur-label").attr("transform","translate(0,-14)");
    gLab.append("rect").attr("class","lab-bg").attr("rx",4).attr("ry",4).attr("fill","#111").attr("opacity",0.9);
    gLab.append("text").attr("class","lab-txt").attr("text-anchor","middle").style("font-weight","600").style("fill","#fff");

    // Repositionner si on connaît la dernière valeur (resize)
    if (legendState.last != null) {
      const { val, city, fill } = legendState.last;
      updateLegendCursor(val, city, fill);
    }
  }
  renderLegend();
  window.addEventListener("resize", renderLegend);
  // >>> END UPDATED

  // <<< ADDED: mise à jour du curseur
  function updateLegendCursor(val, city, fill) {
    const scale = legendState.scale;
    const gCur = legendState.gCursor;
    if (!scale || !gCur) return;

    if (val == null || !Number.isFinite(val)) {
      gCur.style("display","none");
      legendState.last = null;
      return;
    }
    const x = scale(val);
    gCur.style("display", null).attr("transform", `translate(${x},0)`);
    const stroke = d3.color(fill || "#111")?.darker(0.6) || "#000";
    gCur.select(".cur-line").attr("stroke", fill || "#111");
    gCur.select(".cur-head").attr("fill", fill || "#111").attr("stroke", stroke);

    const lab = gCur.select(".cur-label");
    const txt = lab.select(".lab-txt").text(`${city}: ${moneyPer(val)}`);
    const bb = txt.node().getBBox();
    const padX = 6, padY = 4;
    lab.select(".lab-bg")
      .attr("x", bb.x - padX)
      .attr("y", bb.y - padY)
      .attr("width", bb.width + 2*padX)
      .attr("height", bb.height + 2*padY)
      .attr("fill", d3.color(fill||"#111")?.darker(0.7).formatHex() || "#111");

    legendState.last = { val, city, fill };
  }
  // >>> END ADDED

  // ------------ State ------------
  let activeTile = null; // { city, type } ou null

  function filteredCities() {
    const q = searchInput.node().value.trim().toLowerCase();
    const visibleCountries = new Set(countriesOfPage(page));
    let rows = byCity.filter(d =>
      visibleCountries.has(d.country) &&
      (!q || d.city.toLowerCase().includes(q))
    );
    rows = rows.slice().sort((a,b) =>
      d3.ascending(a.country, b.country) ||
      d3.descending(a.n, b.n) ||
      d3.ascending(a.city, b.city)
    );
    return rows;
  }

  // util couleur texte selon luminance de fond
  function textColorFor(bg) {
    const c = d3.color(bg);
    if (!c) return "#fff";
    const L = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    return L < 0.6 ? "#fff" : "#111";
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

    // === Largeurs base par ville (en pixels) ===
    const baseCols = [];
    for (const d of cities) {
      baseCols.push({
        city: d.city,
        country: d.country,
        n: d.n,
        wBase: (d.n / totalN) * innerW
      });
    }

    // === Fish-eye horizontal : bonus de largeur pour la ville active ===
    const activeCity = activeTile?.city || null;
    let cols = baseCols.map(d => ({ ...d, w: d.wBase }));
    if (activeCity) {
      const idx = cols.findIndex(c => c.city === activeCity);
      if (idx >= 0) {
        const wBaseActive = cols[idx].wBase;
        const othersBaseSum = innerW - wBaseActive;
        const bonusW = Math.min(
          Math.max(24, innerW * 0.06),
          Math.max(120, innerW * 0.12)
        );
        const wActive = Math.min(innerW - 2, wBaseActive + bonusW);
        const remainW = innerW - wActive;

        cols = cols.map((c, i) => {
          if (i === idx) return { ...c, w: wActive };
          const p = othersBaseSum <= 0 ? 0 : c.wBase / othersBaseSum;
          return { ...c, w: Math.max(1, remainW * p) };
        });
      }
    }

    // === Positions cumulées X en pixels ===
    let xAcc = 0;
    const cityBandsPx = cols.map(c => {
      const x0px = xAcc;
      xAcc += c.w;
      return { city: c.city, country: c.country, n: c.n, x0px, wpx: c.w, x1px: xAcc };
    });

    // ---- Axe % (cosmétique, fixe 0..1) ----
    gx.attr("transform", `translate(0,${innerH})`)
      .call(d3.axisBottom(d3.scaleLinear().domain([0,1]).range([0, innerW]))
        .ticks(6).tickFormat(d3.format(".0%")))
      .select(".domain").remove();

    // ---- Colonnes (villes) ----
    const col = tilesG.selectAll(".mekko-col").data(cityBandsPx, d => d.city);
    col.exit().remove();
    const colEnter = col.enter().append("g").attr("class","mekko-col");
    colEnter.merge(col)
      .transition().duration(180)
      .attr("transform", d => `translate(${d.x0px},0)`);

    // Données par ville
    const dataByCity = d3.group(
      byCityType.filter(r => cityBandsPx.some(cb => cb.city===r.city)),
      d => d.city
    );

    // Pour chaque ville, layout vertical + dessin
    cityBandsPx.forEach(cb => {
      const gCity = tilesG.selectAll(".mekko-col").filter(d => d.city === cb.city);
      const rows = (dataByCity.get(cb.city) || []).sort((a,b) => d3.descending(a.share,b.share));

      // empilement de base (0..1)
      let cum = 0;
      const stacked = rows.map(r => { const y0 = cum; cum += r.share; const y1 = cum; return { ...r, y0, y1 }; });

      // Hauteurs en pixels (base)
      const baseHeights = stacked.map(d => ({
        type: d.type,
        h: (d.y1 - d.y0) * innerH,
        y0: d.y0
      }));
      const totalH = innerH;

      // Agrandissement vertical de la tuile active dans cette colonne
      const activeHere = activeTile && activeTile.city === cb.city ? activeTile.type : null;
      let adjHeights = baseHeights.map(d => ({ ...d }));
      if (activeHere) {
        const idx = adjHeights.findIndex(d => d.type === activeHere);
        if (idx >= 0) {
          const bonusH = Math.min(Math.max(24, innerH * 0.12), Math.max(60, innerH * 0.25));
          const hActiveBase = adjHeights[idx].h;
          const othersSum = totalH - hActiveBase;
          const hActive = Math.min(totalH - 2, hActiveBase + bonusH);
          const remain = totalH - hActive;

          adjHeights = adjHeights.map((d, i) => {
            if (i === idx) return { ...d, h: hActive };
            const p = othersSum <= 0 ? 0 : d.h / othersSum;
            return { ...d, h: Math.max(1, remain * p) };
          });
        }
      }

      // Positions Y cumulées recalculées en pixels
      let yAcc = 0;
      const layout = stacked.map((d, i) => {
        const h = adjHeights[i].h;
        const yTop = innerH - (yAcc + h);
        yAcc += h;
        return { ...d, yPx: yTop, hPx: h };
      });

      const tiles = gCity.selectAll("g.mekko-tile").data(layout, d => d.type);
      tiles.exit().remove();

      const tEnter = tiles.enter().append("g").attr("class","mekko-tile")
        .on("mouseenter", (_, d) => {
          activeTile = { city: cb.city, type: d.type };
          updateLegendCursor(d.avg_ppm2, cb.city, color(d.avg_ppm2)); // <<< ADDED
          update();
        })
        .on("mousemove", (event, d) => {
          const share = d3.format(".0%")(d.share);
          const countryForCity = cols.find(c => c.city===cb.city)?.country || "";
          tooltip.html(
            `<div><strong>${cb.city}</strong> — ${countryForCity}</div>
             <div><em>${d.type}</em> • part: ${share}</div>
             <div>Prix/m² moyen: ${moneyPer(d.avg_ppm2)}</div>
             <div>Prix moyen: ${money(d.avg_price)} • Taille: ${nf1(d.avg_size)} m²</div>
             <div>Volume ville: ${nf0(cb.n)}</div>`
          )
          .style("left", (event.clientX+14)+"px")
          .style("top", (event.clientY+14)+"px")
          .style("opacity", 1);
        })
        .on("mouseleave", () => {
          tooltip.style("opacity",0);
          activeTile = null;
          updateLegendCursor(null); // <<< ADDED
          update();
        })
        .on("click", (_, d) => {
          onSelect?.({ city: cb.city, type: d.type });
          openTileModal(dataAll, { city: cb.city, type: d.type, colorHex: color(d.avg_ppm2) });
        });

      // Rect de la tuile
      tEnter.append("rect");

      // ===== Label avec fond =====
      const labelG = tEnter.append("g")
        .attr("class","tile-label")
        .style("pointer-events","none");

      labelG.append("rect")
        .attr("class","label-bg")
        .attr("rx",6).attr("ry",6)
        .attr("opacity",1);

      const label = labelG.append("text")
        .attr("text-anchor","middle")
        .style("font-weight","600")
        .style("paint-order","stroke")
        .style("stroke","#000").style("stroke-width","2px").style("stroke-linejoin","round");

      label.append("tspan").attr("class","tl1").attr("x", 0).attr("dy", 0);
      label.append("tspan").attr("class","tl2").attr("x", 0).attr("dy", "1.2em").style("font-weight","500");

      const tilesAll = tEnter.merge(tiles);

      // transition taille/position
      tilesAll.select("rect")
        .transition().duration(180)
        .attr("x", 0)
        .attr("width", Math.max(1, cb.wpx))
        .attr("y", d => d.yPx)
        .attr("height", d => Math.max(1, d.hPx))
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

      // ===== Mise à jour du label + fond coloré =====
      tilesAll.select("g.tile-label")
        .attr("transform", d => `translate(${Math.max(1, cb.wpx)/2}, ${d.yPx + d.hPx/2 - 6})`)
        .each(function(d){
          const isActive = activeTile && activeTile.city===cb.city && activeTile.type===d.type;
          const show = isActive || (cb.wpx > 90 && d.hPx > 28);

          const g = d3.select(this);
          g.style("opacity", show ? 1 : 0);

          // Texte
          const txt = g.select("text");
          txt.select("tspan.tl1").text(`${cb.city} • ${d.type}`);
          txt.select("tspan.tl2").text(isActive ? `${moneyPer(d.avg_ppm2)}  •  ${nf1(d.avg_size)} m²` : "");

          // Mesure pour dimensionner le fond
          const bb = txt.node().getBBox();
          const padX = 8, padY = 6;

          // Couleur de fond basée sur la tuile, assombrie pour le contraste
          const base = d3.color(color(d.avg_ppm2));
          const fillHex = base ? base.darker(0.9).formatHex() : "#0f172a";
          const strokeHex = base ? base.darker(1.4).formatHex() : "rgba(0,0,0,.35)";
          const txtFill = textColorFor(fillHex);

          g.select("rect.label-bg")
            .attr("x", bb.x - padX)
            .attr("y", bb.y - padY)
            .attr("width", bb.width + 2*padX)
            .attr("height", bb.height + 2*padY)
            .attr("fill", fillHex)
            .attr("stroke", strokeHex)
            .attr("stroke-width", 1.2)
            .attr("filter", isActive ? "drop-shadow(0 2px 6px rgba(0,0,0,.35))" : null);

          txt.style("fill", txtFill);
        });
    });

    // ---- Bandeaux PAYS en haut (recalculés en pixels) ----
    const countryBandsPx = [];
    for (const cb of cityBandsPx) {
      const last = countryBandsPx[countryBandsPx.length - 1];
      if (last && last.country === cb.country) {
        last.x1px = cb.x1px;
        last.wpx += cb.wpx;
        last.n += cb.n;
      } else {
        countryBandsPx.push({ country: cb.country, x0px: cb.x0px, x1px: cb.x1px, wpx: cb.wpx, n: cb.n });
      }
    }

    const bands = countryBandsG.selectAll(".country-band").data(countryBandsPx, d => d.country + "-" + d.x0px + "-" + d.x1px);
    bands.exit().remove();
    const bandsEnter = bands.enter().append("g").attr("class", "country-band");
    bandsEnter.append("rect").attr("class","band-bg");
    bandsEnter.append("text").attr("class","band-label");

    bandsEnter.merge(bands)
      .attr("transform", d => `translate(${d.x0px},-34)`);

    bandsEnter.merge(bands).select("rect.band-bg")
      .transition().duration(180)
      .attr("x", 0)
      .attr("y", 0)
      .attr("rx", 8)
      .attr("width", d => Math.max(1, d.x1px - d.x0px))
      .attr("height", 24);

    bandsEnter.merge(bands).select("text.band-label")
      .attr("x", d => (d.x1px - d.x0px) / 2)
      .attr("y", 16)
      .attr("text-anchor","middle")
      .text(d => {
        const w = Math.max(1, d.x1px - d.x0px);
        return w > 70 ? d.country : "";
      });
  }

  function resetFocus() {
    activeTile = null;
    updateLegendCursor(null); // <<< ADDED
    update();
  }
  searchInput.on("input", () => { resetFocus(); });
  window.addEventListener("resize", () => { update(); });

  // init
  activeTile = null;
  update();
  updatePager();

  return { resetZoom: () => resetFocus() };
}

// ------------------------- MAIN -------------------------
async function dashboard() {
  const data = await loadData();
  const { leftTop } = mountSplitLayout();

  chartMekko(leftTop, data, {
    onSelect: null,
    onZoom: () => {}
  });
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
