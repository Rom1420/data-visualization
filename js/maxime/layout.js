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

  M.openTileModal = function openTileModal(dataAll, { city, type, colorHex }) {
    const rows = dataAll.filter(d => d.city === city && d.type === type);
    const avgPpm2 = d3.mean(rows, d => d.price_per_m2);
    const medPpm2 = d3.median(rows, d => d.price_per_m2);
    const avgPrice = d3.mean(rows, d => d.price);
    const avgSize  = d3.mean(rows, d => d.size_m2);

    const overlay = d3.select("body").append("div")
      .attr("class","ghpd-modal-overlay")
      .on("click", (e) => { if (e.target === overlay.node()) M.closeModal(); });

    const modal = overlay.append("div").attr("class","ghpd-modal");
    modal.append("div").attr("class","modal-header")
      .style("--accent", colorHex || "#3b82f6")
      .html(`<h3>${city} — ${type}</h3>`)
      .append("button").attr("class","modal-close").text("×").on("click", M.closeModal);

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
    d3.select(window).on("keydown.ghpd-modal", (e)=>{ if (e.key === "Escape") M.closeModal(); });
  };
})();
