function loadViz(name) {
  d3.select("#viz-container").html("");

  const script = document.createElement("script");
  script.src = `js/${name}.js`;
  script.onload = () => console.log(`${name}.js chargé !`);
  document.body.appendChild(script);
}
