// js/antoine.js
// D3 v7 doit déjà être chargé par la page (index.html)

(function () {
  function injectScopedStyles(rootEl) {
    const css = `
    .vmi * { box-sizing: border-box; }
    .vmi { --bg:#0b1020; --panel:#121a33; --ink:#e7ecff; --muted:#9bb0ffcc; --grid:#2a355f; }
    .vmi .wrap { display:grid; grid-template-columns: 300px 1fr 300px; gap:16px; align-items:start; }
    .vmi .panel{background: rgba(255, 255, 255, 0.2);
    border-radius: 10px;
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    border: 1px solid rgba(255, 255, 255, 0.3);
    padding:12px 14px; }
    .vmi .panel h2{ margin:0 0 10px; font-size:14px; color:var(--white); }
    .vmi .row.firstrow{ display:grid; grid-template-columns: 60% 30%; gap:10px; }
    .vmi .row{ display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
    .vmi .panel label{ font-size:12px; color:var(--muted); display:block; margin-bottom:6px; }
    .vmi .btn{ cursor:pointer; }
    /* Colonne centrale = un seul "cell" de grille contenant viz + légende compacte */
    .vmi .center-col{ display:flex; flex-direction:column; gap:10px; }
    .vmi .viz{ position:relative; height:66vh; background: rgba(255, 255, 255, 0.2);
    border-radius: 10px;
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
    backdrop-filter: blur(5px);
    -webkit-backdrop-filter: blur(5px);
    border: 1px solid rgba(255, 255, 255, 0.3); border-radius:14px; overflow:hidden; padding:20px;}
    .vmi .tooltip{ position:absolute; pointer-events:none; background:#0b1020; border:1px solid var(--grid); padding:10px 12px; font-size:12px; color:var(--ink); border-radius:10px; white-space:nowrap; box-shadow:0 10px 24px #0008; }
    .vmi table{ width:100%; border-collapse:collapse; font-size:12px; }
    .vmi th, .vmi td{ padding:6px 8px; border-bottom:1px solid var(--grid); text-align:left; color:var(--ink); }
    .vmi .btn[disabled]{ opacity:.5; cursor:not-allowed; }

    /* Légende COMPACTE sous la treemap (pas un gros bloc) */
    .vmi .legend-inline{ display:flex; align-items:center; gap:10px; }
    .vmi .legend-inline .label{ min-width:86px; color:#cbd5ff; font-size:12px; }
    .vmi .legend-inline .bar-wrap{ flex:1; }
    .vmi .legend-inline .bar{ height:8px; border-radius:6px; border:1px solid var(--grid); overflow:hidden; }
    .vmi .legend-inline .ticks{ display:flex; justify-content:space-between; font-size:11px; color:var(--muted); margin-top:4px; }
    .vmi .legend-inline .size-key{ display:flex; align-items:center; gap:6px; font-size:12px; color:var(--muted); }
    .vmi .legend-inline .size-swatch{ width:14px; height:10px; border-radius:4px; background:#6b82ff44; border:1px solid #6b82ff88; }

    /* Contenu "tous les biens" dans la tuile ville (mode zoom ville) */
    .vmi .city-fo-wrap{ width:100%; height:100%; padding:10px; }
    .vmi .city-card{
      width:100%; height:100%;
      background:rgba(0,0,0,.25); border:1px solid var(--grid); border-radius:12px;
      overflow:auto; color:var(--ink);
    }
    .vmi .city-card h3{ margin:10px; font-size:14px; }
    .vmi .city-card thead th{ position:sticky; top:0; background:#0b1020; z-index:1; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    rootEl.appendChild(style);
  }

  // Public API
  window.renderAntoine = async function renderAntoine(container, options = {}) {
    const dataUrl = 'data/global_house_purchase_dataset.csv'; // toujours charger ce dataset

    // Reset container
    container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'vmi';
    container.appendChild(root);
    injectScopedStyles(root);

    // Header
    const header = document.createElement('div');
    header.className = 'panel';
    header.style.marginBottom = '12px';
    header.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;justify-content:space-between">
        <div><strong>Value-for-Money Index (VMI) — Global House Purchase</strong></div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn" id="vmiBack" disabled>Retour</button>
          <button class="btn" id="vmiReset">Réinitialiser</button>
        </div>
      </div>`;
    root.appendChild(header);

    // Layout principal
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    root.appendChild(wrap);

    // PANNEAU GAUCHE — contrôles
    const left = document.createElement('section');
    left.className = 'panel';
    left.innerHTML = `
      <h2>Contrôles & Filtres</h2>
      <div class="row firstrow" style="margin-bottom:10px;">
        <div>
          <label>Recherche (ville/pays)</label>
          <input type="text" id="vmiQ" placeholder="ex. Marseille, France"/>
        </div>
        <div style="display:flex; align-items:flex-end; gap:8px;">
          <button class="btn" id="vmiResetFilters" title="Réinitialiser les filtres">Reset</button>
        </div>
      </div>

      <div class="row" style="margin-bottom:10px;">
        <div>
          <label>Plafond prix (quantile)</label>
          <input type="range" id="vmiPriceQ" min="0.5" max="1" step="0.01" value="1"/>
          <div style="font-size:12px;color:var(--muted)">Quantile: <span id="vmiPriceQVal">1.00</span></div>
        </div>
        <div>
          <label>Année min. de constr.</label>
          <input type="range" id="vmiYearMin" min="1900" max="2025" step="1" value="1900"/>
          <div style="font-size:12px;color:var(--muted)"><span id="vmiYearMinVal">1900</span> → 2025</div>
        </div>
      </div>

      <h2>Poids de l'indice (VMI)</h2>
      <div class="row">
        <div>
          <label>Neighbourhood (w₁)</label>
          <input type="range" id="vmiWn" min="0" max="1" step="0.05" value="0.34"/>
          <div style="font-size:12px;color:var(--muted)">w₁=<span id="vmiWnVal">0.34</span></div>
        </div>
        <div>
          <label>Connectivity (w₂)</label>
          <input type="range" id="vmiWc" min="0" max="1" step="0.05" value="0.33"/>
          <div style="font-size:12px;color:var(--muted)">w₂=<span id="vmiWcVal">0.33</span></div>
        </div>
      </div>
      <div class="row" style="margin-top:10px;">
        <div>
          <label>Satisfaction (w₃)</label>
          <input type="range" id="vmiWs" min="0" max="1" step="0.05" value="0.33"/>
          <div style="font-size:12px;color:var(--muted)">w₃=<span id="vmiWsVal">0.33</span></div>
        </div>
        <div>
          <label>Normalisation VMI</label>
          <div class="select-wrap">
            <select id="vmiNorm">
              <option value="ppsqm">prix/m² (ville)</option>
              <option value="ppsqm_global">prix/m² (global)</option>
              <option value="price">prix moyen (ville)</option>
            </select>
            <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
          </div>
        </div>
      </div>
      <div style="font-size:12px;color:var(--muted);margin-top:8px;">
        VMI = (w₁·neighbourhood + w₂·connectivity + w₃·satisfaction) / normalisation. Taille des tuiles = nombre de biens.
      </div>
    `;
    wrap.appendChild(left);

    // CENTRE — une seule cellule de grille: treemap + légende compacte dessous
    const centerCol = document.createElement('section');
    centerCol.className = 'center-col';
    centerCol.innerHTML = `
      <div class="viz">
        <svg id="vmiTreemap" width="100%" height="100%"></svg>
        <div class="tooltip" id="vmiTip" style="opacity:0;"></div>
      </div>
      <div class="legend-inline" id="vmiLegend">
        <div class="label">Couleur VMI</div>
        <div class="bar-wrap">
          <div class="bar" id="vmiLegendBar"></div>
          <div class="ticks"><span id="vmiLegMin">min</span><span id="vmiLegMid">mid</span><span id="vmiLegMax">max</span></div>
        </div>
        <div class="size-key"><span class="size-swatch"></span> Surface = # biens</div>
      </div>
    `;
    wrap.appendChild(centerCol);

    // DROITE — détails (sidebar alignée en haut)
    const right = document.createElement('aside');
    right.className = 'panel';
    right.style.alignSelf = 'start';
    right.innerHTML = `
      <h2>Détails (ville) <span style="font-size:12px;color:var(--muted)" id="vmiHint">— survol</span></h2>
      <div id="vmiCity" style="display:none; margin-bottom:8px; padding:8px 10px; border:1px solid var(--grid); border-radius:10px;">&nbsp;</div>
      <div id="vmiKV" style="display:grid; grid-template-columns:auto 1fr; gap:6px 10px; font-size:13px;"></div>
      <h2 style="margin-top:14px;">Top 5 annonces (VMI unitaire)</h2>
      <div id="vmiTop"></div>
    `;
    wrap.appendChild(right);

    // ---- D3 state
    const vizEl = centerCol.querySelector('.viz');
    const svg = d3.select(centerCol).select('#vmiTreemap');
    const tip = d3.select(centerCol).select('#vmiTip');
    const color = d3.scaleSequential(d3.interpolateTurbo);

    const controls = {
      q: left.querySelector('#vmiQ'),
      priceQ: left.querySelector('#vmiPriceQ'),
      priceQVal: left.querySelector('#vmiPriceQVal'),
      yearMin: left.querySelector('#vmiYearMin'),
      yearMinVal: left.querySelector('#vmiYearMinVal'),
      wn: left.querySelector('#vmiWn'), wnVal: left.querySelector('#vmiWnVal'),
      wc: left.querySelector('#vmiWc'), wcVal: left.querySelector('#vmiWcVal'),
      ws: left.querySelector('#vmiWs'), wsVal: left.querySelector('#vmiWsVal'),
      norm: left.querySelector('#vmiNorm'),
      reset: header.querySelector('#vmiReset'),
      resetFilters: left.querySelector('#vmiResetFilters'),
      back: header.querySelector('#vmiBack'),
    };

    const det = {
      title: right.querySelector('#vmiCity'),
      hint: right.querySelector('#vmiHint'),
      kv: right.querySelector('#vmiKV'),
      top: right.querySelector('#vmiTop'),
    };

    const legendEls = {
      bar: centerCol.querySelector('#vmiLegendBar'),
      min: centerCol.querySelector('#vmiLegMin'),
      mid: centerCol.querySelector('#vmiLegMid'),
      max: centerCol.querySelector('#vmiLegMax'),
    };

    // Data holders
    let raw = [];
    let filtered = [];
    let byCity = new Map();
    let byCountry = new Map();

    // Navigation/zoom état
    let zoomCountry = null;    // string | null
    let zoomCityKey = null;    // "country::city" | null

    function parseRow(d){
      return {
        property_id:+d.property_id, country:(d.country||'').trim(), city:(d.city||'').trim(),
        property_type:d.property_type, furnishing_status:d.furnishing_status,
        property_size_sqft:+d.property_size_sqft, price:+d.price,
        constructed_year:+d.constructed_year, previous_owners:+d.previous_owners,
        rooms:+d.rooms, bathrooms:+d.bathrooms, garage:+d.garage, garden:+d.garden,
        crime_cases_reported:+d.crime_cases_reported, legal_cases_on_property:+d.legal_cases_on_property,
        customer_salary:+d.customer_salary, loan_amount:+d.loan_amount, loan_tenure_years:+d.loan_tenure_years,
        monthly_expenses:+d.monthly_expenses, down_payment:+d.down_payment, emi_to_income_ratio:+d.emi_to_income_ratio,
        satisfaction_score:+d.satisfaction_score, neighbourhood_rating:+d.neighbourhood_rating, connectivity_score:+d.connectivity_score,
        decision: d.decision==null? null : +d.decision
      };
    }

    function quantile(arr, q){
      if(!arr.length) return 0;
      const a = arr.slice().sort((x,y)=>x-y);
      const pos = (a.length-1)*q, base = Math.floor(pos), rest = pos-base;
      return a[base+1]!==undefined ? a[base] + rest*(a[base+1]-a[base]) : a[base];
    }
    const fmt = d3.format(',.0f');

    function getWeights(){
      let wn=+controls.wn.value, wc=+controls.wc.value, ws=+controls.ws.value;
      let s = wn+wc+ws; if(!s){ wn=wc=ws=1; s=3; }
      wn/=s; wc/=s; ws/=s;
      controls.wnVal.textContent=wn.toFixed(2);
      controls.wcVal.textContent=wc.toFixed(2);
      controls.wsVal.textContent=ws.toFixed(2);
      return {wn,wc,ws};
    }

    function applyFilters(){
      const q = controls.q.value.trim().toLowerCase();
      const priceQ = +controls.priceQ.value;
      const yearMin = +controls.yearMin.value;
      controls.priceQVal.textContent = priceQ.toFixed(2);
      controls.yearMinVal.textContent = yearMin;

      let arr = raw.filter(d=>isFinite(d.price)&&isFinite(d.property_size_sqft)&&d.property_size_sqft>0);
      if(yearMin>1900) arr = arr.filter(d=>d.constructed_year>=yearMin);
      if(q){ arr = arr.filter(d=>(d.city+' '+d.country).toLowerCase().includes(q)); }

      const cap = quantile(arr.map(d=>d.price), priceQ);
      filtered = arr.filter(d=>d.price<=cap);
    }

    function computeAggregations(){
      byCity.clear(); byCountry.clear();
      filtered.forEach(r=>{
        r.price_per_sqm = (r.price && r.property_size_sqft) ? (r.price/Math.max(1,r.property_size_sqft)) : NaN;
        r.vmi_unit = 0;
      });
      const {wn,wc,ws} = getWeights();
      const globalPPS = d3.median(filtered.filter(d=>isFinite(d.price_per_sqm)), d=>d.price_per_sqm) || 1;

      filtered.forEach(r=>{
        const qual = wn*r.neighbourhood_rating + wc*r.connectivity_score + ws*r.satisfaction_score;
        let denom = 1;
        switch(controls.norm.value){
          case 'ppsqm': denom = r.price_per_sqm || globalPPS; break;
          case 'ppsqm_global': denom = globalPPS; break;
          case 'price': denom = r.price || 1; break;
        }
        r.vmi_unit = qual / Math.max(1e-6, denom);
      });

      const groupCity = d3.group(filtered, d=>d.country+'::'+d.city);
      for(const [key, rows] of groupCity){
        const [country, city] = key.split('::');
        const pps = d3.mean(rows.filter(d=>isFinite(d.price_per_sqm)), d=>d.price_per_sqm) || 0;
        const vmiAvg = d3.mean(rows, d=>d.vmi_unit) || 0;
        const means = {
          neighbourhood: d3.mean(rows,d=>d.neighbourhood_rating)||0,
          connectivity: d3.mean(rows,d=>d.connectivity_score)||0,
          satisfaction: d3.mean(rows,d=>d.satisfaction_score)||0,
          price: d3.mean(rows,d=>d.price)||0,
          size: d3.mean(rows,d=>d.property_size_sqft)||0
        };
        byCity.set(key, {key,country,city,rows,N:rows.length,price_per_sqm:pps,vmiAvg,means});
      }

      const vmis = Array.from(byCity.values()).map(d=>d.vmiAvg);
      const lo = d3.quantile(vmis,0.05) ?? d3.min(vmis);
      const hi = d3.quantile(vmis,0.95) ?? d3.max(vmis);
      const mid = (lo+hi)/2;
      color.domain([lo,mid,hi]);

      // Légende compacte
      legendEls.bar.style.background = `linear-gradient(90deg, ${d3.interpolateTurbo(0)} 0%, ${d3.interpolateTurbo(0.5)} 50%, ${d3.interpolateTurbo(1)} 100%)`;
      legendEls.min.textContent = d3.format('.3s')(lo);
      legendEls.mid.textContent = d3.format('.3s')(mid);
      legendEls.max.textContent = d3.format('.3s')(hi);

      const groupCountry = d3.group(byCity.values(), d=>d.country);
      for(const [c, arr] of groupCountry){
        byCountry.set(c, {country:c, cities:arr, total:d3.sum(arr,d=>d.N)});
      }
    }

    function renderTreemap(){
      const w = vizEl.clientWidth, h = vizEl.clientHeight;
      svg.attr('viewBox', `0 0 ${w} ${h}`);
      svg.selectAll('*').remove();

      // --- Mode ZOOM VILLE : une seule tuile + liste complète intégrée dans la tuile
      if (zoomCityKey) {
        const city = byCity.get(zoomCityKey);
        if (!city) { zoomCityKey = null; renderTreemap(); return; }

        // fond pour retour
        svg.append('rect').attr('x',0).attr('y',0).attr('width',w).attr('height',h)
          .attr('fill','transparent').on('click', ()=> goBack());

        // carte unique
        const pad = 10;
        const g = svg.append('g').attr('transform', `translate(${pad},${pad})`);
        const rw = Math.max(0, w - pad*2), rh = Math.max(0, h - pad*2);

        g.append('rect')
          .attr('rx',14).attr('ry',14)
          .attr('width', rw).attr('height', rh)
          .attr('fill', color(city.vmiAvg))
          .attr('stroke', '#0008');

        // foreignObject contenant TOUTES les annonces
        const fo = g.append('foreignObject')
          .attr('x', 8).attr('y', 8)
          .attr('width', Math.max(0, rw - 16))
          .attr('height', Math.max(0, rh - 16));

        const rows = [...city.rows].sort((a,b)=>b.vmi_unit-a.vmi_unit);
        const header = `<h3>${city.city} — ${city.country} • ${rows.length} annonces</h3>`;
        const tableHead = `<table><thead><tr>
          <th>ID</th><th>Type</th><th>Taille</th><th>Prix</th><th>Prix/m²</th><th>VMI</th>
        </tr></thead><tbody>`;
        const body = rows.map(r=>{
          const pps = r.price_per_sqm || 0;
          return `<tr>
            <td>${r.property_id}</td>
            <td>${r.property_type||'-'}</td>
            <td>${fmt(r.property_size_sqft)}</td>
            <td>${fmt(r.price)}</td>
            <td>${fmt(pps)}</td>
            <td>${d3.format('.3s')(r.vmi_unit)}</td>
          </tr>`;
        }).join('');
        const html = `<div xmlns="http://www.w3.org/1999/xhtml" class="city-fo-wrap">
            <div class="city-card">${header}${tableHead}${body}</tbody></table></div>
          </div>`;
        fo.html(html);

        // Détails (sidebar) épinglés pour cohérence
        updateDetails(city, true);
        det.hint.textContent = '— fixé (ville)';
        updateBackButton();
        return;
      }

      // --- Monde ou ZOOM PAYS
      const countries = zoomCountry ? [byCountry.get(zoomCountry)] : Array.from(byCountry.values());
      const data = {name:'World', children: countries.filter(Boolean).map(c=>({
        name:c.country,
        children: c.cities.map(city=>({ name:city.city, country:city.country, key:city.key, value:Math.max(1,city.N), data:city }))
      }))};

      const rootH = d3.hierarchy(data).sum(d=>d.value).sort((a,b)=>b.value-a.value);
      d3.treemap().size([w,h]).paddingInner(2).round(true)(rootH);

      // Contours de pays (uniquement si monde)
      const countriesNodes = (rootH.children || []);
      const outline = svg.append('g').attr('class','country-outlines');
      outline.selectAll('rect.country')
        .data(countriesNodes)
        .join('rect')
        .attr('class','country')
        .attr('x', d=>d.x0+1).attr('y', d=>d.y0+1)
        .attr('width', d=>Math.max(0, d.x1-d.x0-2))
        .attr('height', d=>Math.max(0, d.y1-d.y0-2))
        .attr('rx', 10).attr('ry', 10)
        .attr('fill','none')
        .attr('stroke','#4c5a94')
        .attr('stroke-width',1.2)
        .attr('pointer-events','none');

      // Feuilles = villes
      const leaves = rootH.leaves();
      const nodes = svg.selectAll('g.node').data(leaves).join('g')
        .attr('class','node')
        .attr('transform', d=>`translate(${d.x0},${d.y0})`);

      nodes.append('rect')
        .attr('class','hit')
        .attr('rx',8).attr('ry',8)
        .attr('width', d=>Math.max(0,d.x1-d.x0))
        .attr('height', d=>Math.max(0,d.y1-d.y0))
        .attr('fill', d=>color(d.data.data.vmiAvg))
        .attr('stroke','#0008');

      nodes.append('foreignObject')
        .attr('width', d=>Math.max(0,d.x1-d.x0))
        .attr('height', d=>Math.max(0,d.y1-d.y0))
        .append('xhtml:div')
        .style('padding','6px')
        .style('font-size','12px')
        .style('color','#fff')
        .style('opacity', d => ((d.x1-d.x0)>90 && (d.y1-d.y0)>38) ? 1 : 0.85)
        .style('pointer-events','none')
        .html(d=>`<div><b>${d.data.name}</b><br/><span style="color:#cbd5ff">${d.data.data.country}</span></div>`);

      // Interactions (tooltip anti-dépassement)
      nodes
        .on('mousemove', (ev,d)=>{
          const city = d.data.data;
          const [px, py] = d3.pointer(ev, vizEl);
          const html = `<b>${city.city}</b> — ${city.country}<br/>Biens : ${fmt(city.N)}<br/>Prix/m² : ${fmt(city.price_per_sqm)}<br/>VMI (moy.) : ${d3.format('.3s')(city.vmiAvg)}`;
          showTooltip(px, py, html);
          updateDetails(city, false);
          det.hint.textContent = zoomCountry ? '— cliquez pour la ville (vue dédiée)' : '— survol';
        })
        .on('mouseleave', ()=>{
          hideTooltip();
          det.hint.textContent = zoomCountry ? '— cliquez pour la ville' : '— survol';
        })
        .on('click', (ev,d)=>{
          const city = d.data.data;
          ev.stopPropagation();
          hideTooltip();
          if (!zoomCountry) {
            // 1er niveau : zoom sur le PAYS
            zoomCountry = city.country;
            zoomCityKey = null;
            draw();
          } else {
            // 2e niveau : zoom VILLE (tuile unique + toutes les annonces DANS la tuile)
            zoomCityKey = city.key;
            draw();
          }
        });

      // clic de fond = retour (pays -> monde)
      svg.on('click', ()=>{ goBack(); });

      updateBackButton();
    }

    function updateDetails(city, pinned){
      if(!city){ det.title.style.display='none'; return; }
      det.title.style.display='block';
      det.title.textContent = `${city.city} — ${city.country}`;
      det.hint.textContent = pinned ? '— fixé' : det.hint.textContent;

      const m = city.means;
      det.kv.innerHTML = `
        <div style="color:var(--muted)">Biens</div><div>${fmt(city.N)}</div>
        <div style="color:var(--muted)">Prix moyen</div><div>${fmt(m.price)}</div>
        <div style="color:var(--muted)">Taille moyenne (ft²)</div><div>${fmt(m.size)}</div>
        <div style="color:var(--muted)">Prix/m²</div><div>${fmt(city.price_per_sqm)}</div>
        <div style="color:var(--muted)">VMI (moy.)</div><div>${d3.format('.3s')(city.vmiAvg)}</div>
      `;

      // Top 5 (la liste complète s'affiche maintenant dans la tuile en mode "ville")
      const top5 = [...city.rows].sort((a,b)=>b.vmi_unit-a.vmi_unit).slice(0,5);
      const topHtml = [`<table><thead><tr><th>ID</th><th>Taille</th><th>Prix</th><th>Prix/m²</th><th>VMI</th></tr></thead><tbody>`];
      top5.forEach(r=>{
        const pps = r.price_per_sqm || 0;
        topHtml.push(`<tr><td>${r.property_id}</td><td>${fmt(r.property_size_sqft)}</td><td>${fmt(r.price)}</td><td>${fmt(pps)}</td><td>${d3.format('.3s')(r.vmi_unit)}</td></tr>`);
      });
      topHtml.push('</tbody></table>');
      det.top.innerHTML = topHtml.join('');
    }

    function goBack(){
      if (zoomCityKey) {
        // ville -> pays
        zoomCityKey = null;
        draw();
      } else if (zoomCountry) {
        // pays -> monde
        zoomCountry = null;
        draw();
      }
    }

    function updateBackButton(){
      controls.back.disabled = !(zoomCityKey || zoomCountry);
    }

    function draw(){
      applyFilters();
      computeAggregations();
      renderTreemap();
    }

    async function loadDefault(){
      const text = await fetch(dataUrl).then(r=>{ if(!r.ok) throw new Error('CSV introuvable'); return r.text(); });
      const rows = d3.csvParse(text, parseRow);
      onDataLoaded(rows);
    }

    function onDataLoaded(rows){
      raw = rows.filter(r=>isFinite(r.price) && isFinite(r.property_size_sqft) && r.property_size_sqft>0);
      zoomCountry = null;
      zoomCityKey = null;
      draw();
    }

    // Tooltip helpers — garde l’infobulle dans le cadre, même en haut
    function showTooltip(px, py, html){
      tip.html(html).style('opacity', 1);
      const tipEl = tip.node();
      const tw = tipEl.offsetWidth || 180;
      const th = tipEl.offsetHeight || 60;
      const pad = 10;
      const W = vizEl.clientWidth;
      const H = vizEl.clientHeight;

      // par défaut au-dessus; sinon dessous
      let left = px + 12;
      let top = py - th - 8;
      if (top < pad) top = py + 12; // bas si trop haut
      left = Math.max(pad, Math.min(W - tw - pad, left));
      top  = Math.max(pad, Math.min(H - th - pad, top));
      tip.style('left', left+'px').style('top', top+'px');
    }
    function hideTooltip(){ tip.style('opacity',0); }

    // Events
    [['input',controls.q],['change',controls.priceQ],['change',controls.yearMin],
     ['change',controls.wn],['change',controls.wc],['change',controls.ws],['change',controls.norm]]
     .forEach(([ev,el])=> el.addEventListener(ev, ()=>{
       if (zoomCityKey) zoomCityKey = null; // changement filtre => sortir de la vue ville
       draw();
     }));

    // Reset global (header)
    controls.reset.addEventListener('click', ()=>{
      controls.q.value = '';
      controls.priceQ.value = 1; controls.priceQVal.textContent = '1.00';
      controls.yearMin.value = 1900; controls.yearMinVal.textContent = '1900';
      controls.wn.value = 0.34; controls.wc.value = 0.33; controls.ws.value = 0.33;
      controls.norm.value = 'ppsqm';
      zoomCountry = null;
      zoomCityKey = null;
      draw();
    });

    // Reset uniquement filtres (panneau gauche)
    controls.resetFilters.addEventListener('click', ()=>{
      controls.q.value = '';
      controls.priceQ.value = 1; controls.priceQVal.textContent = '1.00';
      controls.yearMin.value = 1900; controls.yearMinVal.textContent = '1900';
      if (zoomCityKey) zoomCityKey = null;
      draw();
    });

    controls.back.addEventListener('click', ()=>{ goBack(); });

    window.addEventListener('resize', renderTreemap);

    // Boot — toujours charger le dataset par défaut
    try { await loadDefault(); } catch (e) { console.error(e); }
  };
})();
