// countCountries.js
// Compte le nombre de pays uniques dans la 2e colonne du CSV (sans dépendance externe)

import fs from "fs";
import path from "path";
import readline from "readline";

const FILE_PATH = path.resolve("../data/global_house_purchase_dataset.csv");

async function countCountries() {
  const fileStream = fs.createReadStream(FILE_PATH, { encoding: "utf8" });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const countries = new Set();
  let lineIndex = 0;

  for await (const line of rl) {
    // Ignore lignes vides
    if (!line.trim()) continue;
    lineIndex++;

    // Sépare par virgule (CSV simple)
    const cols = line.split(",");

    // Ignore l’en-tête (1ʳᵉ ligne)
    if (lineIndex === 1) continue;

    // Si la ligne a au moins 2 colonnes, on prend la 2ᵉ
    if (cols.length >= 2) {
      const country = cols[1].replace(/^"|"$/g, "").trim();
      if (country) countries.add(country);
    }
  }

  console.log("🌍 Nombre de pays distincts :", countries.size);
  console.log("--------------------------------------------");
  console.log([...countries].sort().join(", "));
}

countCountries().catch((err) => {
  console.error("Erreur :", err.message);
});
