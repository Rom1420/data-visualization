function loadViz(name) {
    d3.select("#viz-container").html("");

    const script = document.createElement("script");
    script.src = `js/${name}.js`;
    script.onload = () => console.log(`${name}.js chargé !`);
    document.body.appendChild(script);

    const buttons = document.querySelectorAll('nav button');
    buttons.forEach(btn => btn.classList.remove('selected')); 
    const clickedBtn = document.querySelector(`nav button[onclick="loadViz('${name}')"]`); 
    if (clickedBtn) clickedBtn.classList.add('selected');
}
