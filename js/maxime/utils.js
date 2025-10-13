/* global d3 */
(function () {
  const M = (window.Maxime = window.Maxime || {});

  M.DATA_URL = "./data/global_house_purchase_dataset.csv";

  M.nf0 = d3.format(",.0f");
  M.nf1 = d3.format(",.1f");
  M.money = v => `${M.nf0(v)} €`;
  M.moneyPer = v => `${M.nf0(v)} €/m²`;
  M.toSqm = sqft => +sqft * 0.092903;

  M.el = (name, attrs = {}, html = "") => {
    const n = document.createElement(name);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    if (html) n.innerHTML = html;
    return n;
  };

  M.firstKey = (obj, candidates) => candidates.find(k => k in obj);

  M.textColorFor = (bg) => {
    const c = d3.color(bg);
    if (!c) return "#fff";
    const L = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
    return L < 0.6 ? "#fff" : "#111";
  };
})();
