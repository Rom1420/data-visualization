function loadViz(name) {
    const container = d3.select("#viz-container");
    container.html(""); // reset contenu

    // enlever les classes précédentes et ajouter la nouvelle
    container.attr("class", name);

    const script = document.createElement("script");
    script.src = `js/${name}.js`;
    script.onload = () => {
        console.log(`${name}.js chargé !`);
        // appeler la fonction de rendu si elle existe
        const renderFnName = `render${name[0].toUpperCase()}${name.slice(1)}`;
        if (window[renderFnName]) {
            window[renderFnName](document.getElementById("viz-container"));
        }
    };
    document.body.appendChild(script);

    // gestion visuel boutons
    const buttons = document.querySelectorAll('nav button');
    buttons.forEach(btn => btn.classList.remove('selected')); 
    const clickedBtn = document.querySelector(`nav button[onclick="loadViz('${name}')"]`); 
    if (clickedBtn) clickedBtn.classList.add('selected');
}