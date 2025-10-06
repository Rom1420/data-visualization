## Global House Purchase Decision Dataset

### Statistiques

Ce sont des agrégats calculés à partir d’un dataset figé (prix, surface, ville, pays).

### Ordonnées

Les données sont ordonnées car on peut classer les villes selon une mesure quantitative (prix moyen au m², du moins cher au plus cher).

### Utilisateur

**Investisseur (Achat/Vente)**

---

### Liste des tâches

#### **Maxime**

**Investisseur :** Prix moyen au m² par ville et par pays
**Colonnes utilisées :** `city`, `price`, `property_size_sqft`
**Intérêt :** Permet de voir où le budget de l’acheteur est le mieux valorisé.

#### **Matice**

**Investisseur :** Densité des biens immobiliers en vente par région
**Colonnes utilisées :** `property_id`, `country`, `city`
**Intérêt :** Savoir où il est le plus facile d’acheter.

#### **Julien**

**Investisseur :** Indice d’attractivité moyen par ville
**Colonnes utilisées :** `neighbourhood_rating`, `connectivity_score`, `satisfaction_score`, `city`
**Indice :** moyenne des trois scores.
**Intérêt :** Prioriser les villes offrant le meilleur potentiel.

#### **Romain**

**Investisseur :** Évolution historique du prix selon l’année de construction
**Colonnes utilisées :** `constructed_year` → année de construction du bien, `price` (et éventuellement `property_size_sqft` pour normaliser)
**Intérêt :**

* Permet de visualiser l’évolution de la valeur des biens au fil du temps.
* Utile pour comprendre l’impact de l’âge du bâtiment sur le prix actuel.
* Peut révéler des tendances historiques (ex. hausse constante, stagnation, effets de crise).
* Aide un investisseur à anticiper la valorisation ou dépréciation des biens selon leur année de construction.

#### **Antoine**

**Investisseur :** “Value-for-Money Index” (VMI) par ville
**Colonnes utilisées :** `city`, `country`, `price`, `property_size_sqft`, `neighbourhood_rating`, `connectivity_score`, `satisfaction_score`
**Intérêt :** Identifier les villes où la qualité de vie perçue est la plus élevée rapportée au coût de l’immobilier. C’est un indicateur actionnable pour prioriser où acheter/investir avec un budget donné.

---

### Propositions de visualisations

* **Maxime** → Bar chart horizontal comparatif affichant le prix moyen au m² par ville (regroupées par pays), avec filtres, tri et info-bulles interactives pour comparer rapidement les zones les plus accessibles.
* **Matice** → Heatmap pour visualiser la densité des biens en vente.
* **Julien** → Carte du monde puis sélection du pays sur la carte qui affiche un scatter plot des villes.
* **Antoine** → TreeMap (VMI vs. prix au m² relatif) avec taille = nb d’annonces par ville.
* **Romain** → Line chart illustrant l’évolution du prix moyen (et du prix moyen au m²) en fonction de l’année de construction.
