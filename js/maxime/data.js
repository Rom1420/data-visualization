/* global d3 */
(function () {
  const M = (window.Maxime = window.Maxime || {});
  const { DATA_URL, firstKey, toSqm } = M;

  M.loadData = async function loadData() {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Chargement CSV: HTTP ${res.status} ${res.statusText}`);
    const text = await res.text();
    const sep = (text.match(/;/g)?.length || 0) > (text.match(/,/g)?.length || 0) ? ";" : ",";
    const rows = d3.dsvFormat(sep).parse(text, d3.autoType);
    if (!rows.length) return [];

    const s = rows[0];
    const priceKey   = firstKey(s, ["price","Price","amount","Amount"]) || "price";
    const sizeSqftKey= firstKey(s, ["property_size_sqft","size_sqft","Size_sqft","sqft"]);
    const sizeM2Key  = firstKey(s, ["property_size_m2","size_m2","m2"]);
    const cityKey    = firstKey(s, ["city","City"]) || "city";
    const countryKey = firstKey(s, ["country","Country"]) || "country";
    const typeKey    = firstKey(s, ["property_type","type","Type"]) || "property_type";
    const idKey      = firstKey(s, ["property_id","id","Id"]) || "property_id";
    const decisionKey= firstKey(s, ["decision","Decision"]) || "decision";

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
  };

  M.aggByCity = function aggByCity(data) {
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
  };
})();
