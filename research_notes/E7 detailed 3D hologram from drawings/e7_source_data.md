# Public data sources for a detailed 3D model of UWaterloo Engineering 7 (E7, now "Pearl Sullivan Engineering", PSE)

Research date: 2026-09-19. All pixel sizes below were measured with `sips` on files fetched during this session. Local copies of every ArchDaily image at `original` and `large_jpg` size are in the session scratchpad: `/private/tmp/claude-501/-Users-michaelmazilu-Projects-hack-the-north/57646abe-64b8-418b-86bb-a85f4370ce8f/scratchpad/adsttc/` (`o_*.jpg` is original, `l_*.jpg` is large_jpg). The lidar crops and previews described below are in the parent `scratchpad/` folder (`Ontario_DSM_LidarDerived.tif`, `Ontario_DTM_LidarDerived.tif`, `ndsm.npy`, `ndsm_preview.png`, `ndsm_shade.png`).

**Heads-up on the name:** E7 was renamed the **Pearl Sullivan Engineering Building (PSE)** in November 2025. New searches, OSM and UW pages now use "PSE", and some older UW news URLs have been retitled — [Academica](https://academica.ca/top-ten/uwaterloo-engineering-receives-20m-renames-engineering-building/); [UW News](https://uwaterloo.ca/news/eweal-honouring-legacy-pearl-sullivan-future-education); [OSM way 382735686](https://www.openstreetmap.org/way/382735686)

## Q1. Are higher-resolution versions of the ArchDaily drawings available?

### Takeaway
Yes. Replacing `large_jpg` with **`original`** in the adsttc.com URL returns the full upload. The Level 1–8 plans are **3438–3439 px square instead of 2000 px**, which is 1.72× linear. At the team's measured 13.75 px/m for large_jpg, that is about **23.6 px/m (about 4.2 cm/px)**, so a 0.9 m door is about 21 px wide. The site plan jumps from 2000 to **8394 × 6941 px**. The E7 section does **not** improve: it is only 1500 × 526 px even at `original`.

### Cited Findings
- URL pattern: `https://images.adsttc.com/media/images/<id>/<SIZE>/<file>.jpg`. Variants that returned HTTP 200 for LEVEL_01: `original` 3439×3439 (2.74 MB), `large_jpg` 2000×2000, `slideshow` 1000×1000, `newsletter` 750×750, `medium_jpg` 528×528, `thumb_jpg` 125×125. These returned **HTTP 403** (they don't exist): `gallery`, `full`, `large_png`, `original_jpg`, and the bare URL with no size folder — tested directly on [LEVEL_01 original](https://images.adsttc.com/media/images/5fc0/5c12/63c0/17d6/2c00/10b6/original/LEVEL_01_PLAN_1-500-01.jpg)
- Every image in the ArchDaily article (published 30 Nov 2020, article 952235), measured at `original` vs `large_jpg` — [ArchDaily project page](https://www.archdaily.com/952235/university-of-waterloo-engineering-5-and-7-perkins-and-will):

| File (id path) | original px | large_jpg px | Notes |
|---|---|---|---|
| LEVEL_01_PLAN_1-500-01.jpg (5fc0/5c12/63c0/17d6/2c00/10b6) | 3439×3439 | 2000×2000 | E7 plan with scale bar and north arrow |
| LEVEL_02_PLAN (5fc0/5c47/63c0/17dd/6300/0d93) | 3438×3438 | 2000 | |
| LEVEL_03_PLAN (5fc0/5caa/63c0/17dd/6300/0d98) | 3438×3438 | 2000 | |
| LEVEL_04_PLAN (5fc0/5cd5/63c0/17d6/2c00/10bd) | 3438×3439 | 2000×2001 | |
| LEVEL_05_PLAN (5fc0/5d0d/63c0/17d6/2c00/10c0) | 3439×3439 | 2000 | |
| LEVEL_06_PLAN (5fc0/5d5c/63c0/17dd/6300/0d9f) | 3439×3439 | 2000 | |
| LEVEL_07_PLAN (5fc0/5dbd/63c0/17dd/6300/0da3) | 3439×3439 | 2000 | |
| LEVEL_08_PLAN (5fc0/5e41/63c0/17dd/6300/0da4) | 3438×3438 | 2000 | Roof/mechanical level: penthouse room with equipment, and the atrium sawtooth roof drawn as about 9 bays between the E5 outline and E7. Scale bar 5/10/20 m |
| Site_Plan_1-500-01.jpg (5fc0/5e9d/63c0/17dd/6300/0da6) | **8394×6941** (10.7 MB) | 2000×1654 | Labels Engineering V/VI/VII, East Campus Hall, Ring Rd, "Future LRT", Phillip St, service court, scale bar |
| Context_Plan.jpg (5fc0/5bfb/63c0/17dd/6300/0d90) | 1800×1710 | 1800×1710 | Campus figure-ground from the E5 era ("ENG V" highlighted); low value |
| UWaterloo_Engineering7_Section.jpg (5fc0/5f64/63c0/17d6/2c00/10d3) | **1500×526** | 1500×526 | Rendered perspective section through the atrium: 8-tooth sawtooth roof, red feature stair, bridges. No higher-res copy exists |
| UWaterloo_Engineering5_Sections.jpg (5fc0/5eec/63c0/17d6/2c00/10cf) | 2550×1650 | 2000×1294 | E5 long section/elevation with sawtooth clerestories |
| UWaterloo_Engineering5_Sections2.jpg (5fc0/5ef9/63c0/17dd/6300/0da9) | 2550×1650 | 2000×1294 | E5 cross-section with central atrium |
| UWaterloo_Engineering5_WestElevation.jpg (5fc0/5f31/63c0/17d6/2c00/10d0) | 5100×2086 | 2000×818 | E5 west elevation with a **pyramidal frit-pattern swatch** at the right edge (good facade/texture reference) |
| WaterlooEng7_A_MichaelMuraz_H02.jpg (5fc0/5c94/...0d96) | **5464×3640** | 2000×1332 | E7 aerial/exterior photo (the file name has "A") |
| WaterlooEng7_I_LisaLogan_H01.jpg (5fc0/5d47/...10c1) | **6726×4082** | 2000×1214 | E7 interior |
| WaterlooEng7_I_LisaLogan_H11.jpg (5fc0/5e0b/...10c8) | **6005×6108** | 2000×2034 | E7 interior |
| WaterlooEng7_E_Doublespace_H04 / H07 | 2158×2880 / 2880×1921 | 2000 wide | E7 exteriors |
| WaterlooEng7_I_Doublespace_H05 / H07 / H13 / H14 | 2880×1921 / 2160×2880 / 2880×1921 / 2880×1744 | 2000 wide | E7 interiors |
| WaterlooEng5_E_LisaLogan_H04, WaterlooEng5_I_LisaLogan_H04/H08/H17, FI.jpg | 3000×1997; 1280×694; 1280×878; 4284×2791; 3000×1807 | ≤2000 | E5 photos |

- Licence/terms: photos are credited "© Lisa Logan Photography", "© Michael Muraz" and "© Doublespace" on the page. The page's embedded code carries "Copyright (c) 2020 ArchDaily; Licensed Private". **No open licence is given for any image or drawing** — [ArchDaily project page](https://www.archdaily.com/952235/university-of-waterloo-engineering-5-and-7-perkins-and-will)
- Project data from ArchDaily: Area 425,000 ft² (E5 + E7 combined); Year 2018; lead architect Andrew Frontini; engineering RJC Consulting Engineers, Smith + Andersen, Crossey Engineering, MTE Consultants; landscape GSP Group; manufacturers include Alumicor, Guardian Glass, Vicwest, Skyfold, Decoustics, Casalgrande Padana; "Trimble SketchUp" and AutoDesk are listed as tools — [ArchDaily](https://www.archdaily.com/952235/university-of-waterloo-engineering-5-and-7-perkins-and-will)

### Inferences
- Tracing from the `original` plans should resolve door swings, mullion/column grids and stair runs that are mush at 2000 px. Calibrate each plan from its own 5/10/20 m scale bar rather than trusting a nominal 1:500.
- The 8394 px site plan is the best published source for the E7 / E5 / E6 / bridge / LRT relationship and for registering plans to OSM or lidar.
- The only E7 section is a small rendered perspective and can't be measured reliably. Vertical dimensions should come from lidar (Q4) or on-site measurement.
- **Do not commit these JPGs to a public GitHub repo, and don't show them full-frame in a public video** without Perkins&Will's or ArchDaily's permission. Geometry re-modelled from them is a different matter, but that is a judgement call for the team, not legal advice.

### Gaps
- No vector (PDF/DWG) or higher-than-`original` version was found anywhere public.
- I did not check whether ArchDaily's older E5 article ([archdaily.com/118949](https://www.archdaily.com/118949/engineering-5-building-perkinswill)) has additional E5 plans. They would help model the atrium's west wall (the E5 east facade).

## Q2. What other published E7 drawings, diagrams and specs exist?

### Takeaway
Beyond ArchDaily, **no other public architectural drawings of E7 were found**: no elevations, wall sections, details or axonometrics. The Perkins&Will page has photos only. Useful text specs come from the consultants' pages (Ennova, Smith+Andersen, MTE, LRI) and UW news. None of the E5/E7 awards listed on the Perkins&Will page is E7-specific; they are 2011 E5 lighting/interior awards.

### Cited Findings
- **Perkins&Will project page** "University of Waterloo Engineering 5 and 7": 10 photos, the largest 2560×1396 (`project_Eng5_7_01-scaled.jpg`), others 750–2265 px (`Project_Eng5_7_04..11`). No drawings. Text: "fritted glass skin that emulates the pyramidal volumetrics of the building's anechoic chamber"; public spaces in "highly transparent low iron glass"; atrium "provid[es] orientation to four cardinal directions"; "dramatic curvilinear bridge … over the regional LRT tracks". Size 425,000 ft² (E5 + E7). Awards: WAN Lighting 2011, IES Toronto 2011, Educational Interiors Showcase 2011, IIDA Global Excellence 2011 (all E5-era). No licence stated; images are © Perkins&Will or the photographers — [Perkins&Will](https://perkinswill.com/project/engineering-5-and-7/)
- **Ennova Facades** (curtain-wall contractor): "unitized curtain wall" using **ENNWALL-70**. Scope: "design, engineering, and fabrication for the unitized curtain wall, doors, custom glass, and canopy glazing for the bus shelter"; 7-storey, 242,000 ft²; CM EllisDon. No module sizes published — [Ennova](https://ennovafacades.com/project/university-of-waterloo-engineering-7/)
- **Smith + Andersen** (mechanical) project sheet (PDF): E7 "connects to the Engineering 5 (E5) building through a seven-storey atrium with a series of bridges at each level"; "a two-storey robot lab enclosed in structural glazing" next to the atrium; size "240,000 sq. ft. (22,297 sq. m.)"; solar wall for outside-air pre-heat — [Smith+Andersen PDF](https://smithandandersen.com/sites/default/files/project_profiles/2022-05/Waterloo_Engineering7_07067.pdf)
- **MTE** (civil): E5 connection via "a 12-metre-wide atrium"; E6 connection "by an enclosed pedestrian bridge at the third storey"; LEED Silver pursued — [MTE](https://mte85.com/case-studies/university-of-waterloo-engineering-7/)
- **LRI** (code/fire): "seven-storey, 22,483 m2"; an Alternative Solution was submitted to the City of Waterloo for bridge egress — [LRI](https://lrifire.com/projects/university-of-waterloo-engineering-7/)
- **Canadian Architect** has only the 2014 approval news, no drawings — [Canadian Architect](https://canadianarchitect.com/university-of-waterloo-approves-88-million-engineering-7-building/)
- **Canadian Consulting Engineer** article returned HTTP 504 (possibly transient) — [CCE](https://www.canadianconsultingengineer.com/university-of-waterloo-expands-with-engineering-7/)
- **UW / Board of Governors**: the Board approved the $88M project on 29 Oct 2014, for a building "connected to and integrated with the east façade of the existing Engineering 5" — [UW Engineering news](https://uwaterloo.ca/engineering/news/university-approves-88-million-engineering-7-building); [Daily Bulletin 28 Oct 2014](https://bulletin.uwaterloo.ca/2014/oct/28tu.html)
- **Iron Warrior** (student paper, 2014): programme list with 7 lecture halls, 135–140-seat tiered classrooms, a two-storey "flight center", admin on the 7th floor, a third-floor enclosed walkway to E6, and a glass atrium with elevated walkways to E5. No drawings — [Iron Warrior](https://iwarrior.uwaterloo.ca/2014/11/09/29642/engineering-7-creates-space-for-students-students-vote-yes/)
- **UW IDEAs Clinic** page has one "E7 artist rendering" and no floor maps — [IDEAs Clinic](https://uwaterloo.ca/engineering-ideas-clinic/about/engineering-7)

### Inferences
- The E5 elevation/sections and the frit-pattern swatch on ArchDaily are the closest published "elevation" material. E7 shares the design language (fritted pyramidal pattern, low-iron glass at public zones).
- For E7's own elevations, the practical source is photographs taken on site (the team is in the building), plus the ArchDaily photos as private reference.

### Gaps
- City of Waterloo site-plan application documents for E7 (circa 2014–15) were not found online.
- The UW Board of Governors agenda PDF for 28 Oct 2014 was not located or read. It might include a site plan or massing figures.
- No OAA, RAIC or Canadian Architect Awards entry for E7 was found. Architizer and World Architecture were not checked (budget).

## Q3. Photos usable for facade reference or textures, and their licences

### Takeaway
Openly licensed photos of **E7 itself are almost non-existent**. Wikimedia Commons has one 2020 photo taken outside E7 (CC BY-SA 4.0). Everything else CC-licensed is E5, E6 or pre-2018. High-resolution professional E7 photos exist on ArchDaily (up to 6726 px), but they are all-rights-reserved. **Best option: shoot your own photos on site for textures.**

### Cited Findings
- Commons: "File:Waterloo Engineering Sign.jpg", 4608×3456, **CC BY-SA 4.0**, by Maplefirst, 2020-02-02, described as "Waterloo Engineering display outside Engineering 7" — [Commons](https://commons.wikimedia.org/w/index.php?curid=86543830)
- Commons "Category:Engineering 5 Building (University of Waterloo)": 14 files from 2010–2015. Examples: "E5 at sunset.JPG" 5184×3456 CC BY-SA 4.0; "E5 Building University of Waterloo (19673237343).jpg" 5312×2988 CC BY-SA 2.0; "UW Engineering 5.jpg" 3488×2616 CC BY 2.0 (Ben Babcock); "University of Waterloo E5 & E6 (20317885245).jpg" 5312×2976 CC BY-SA 2.0 (Aug 2015, E7 site pre-construction). None show the finished E7 — [Commons category](https://commons.wikimedia.org/wiki/Category:Engineering_5_Building_(University_of_Waterloo))
- Openverse (aggregates CC images from Flickr and others): the only related hit is Flickr "Day 7 - University of Waterloo", 1024×683, **CC BY-ND 2.0** (no derivatives, so unusable as a texture; probably pre-E7). Searches for "uwaterloo e7", "waterloo E7 building" and "pearl sullivan engineering" returned 0 results — [Flickr photo](https://www.flickr.com/photos/61191928@N06/8754626223)
- OSM has a CC0 photo of the AED "E7 first floor next to elevators" (openaedmap) — [OSM node 12149946004](https://www.openstreetmap.org/node/12149946004)
- ArchDaily E7 photos by Michael Muraz, Lisa Logan and Doublespace: up to 6726×4082 (interior) and 5464×3640 (exterior/aerial), © the photographers — [ArchDaily](https://www.archdaily.com/952235/university-of-waterloo-engineering-5-and-7-perkins-and-will)

### Inferences
- CC BY-SA images can go in a public repo or video with attribution, but derivatives must also be CC BY-SA (share-alike), which matters if they become baked textures.
- The team's own photos have no licensing friction and can match current signage (the PSE rename may have changed the facade lettering, which is unverified).

### Gaps
- Flickr's own search (all CC licences) wasn't run directly because it needs an API key. Openverse coverage of Flickr is partial.

## Q4. Geospatial data: OSM, municipal, provincial lidar, Google 3D Tiles, footprint datasets

### Takeaway
The biggest find: **Ontario's lidar-derived DSM/DTM (0.5 m, Upper Thames–Grand River 2025 acquisition, Open Government Licence – Ontario) covers E7**. It can be queried per point or clipped as a tiny crop through a public ArcGIS ImageServer. A 118 × 140 m crop (395 KB) puts **E7 roofs at about 31.0 m and about 36.5 m above grade (max 38.35 m)** and clearly shows the **sawtooth atrium roof**. OSM has a good footprint (way **382735686**, 8 levels, now named PSE). The City of Waterloo has an open rooftop outline. Google Photorealistic 3D Tiles **prohibit tracing or deriving models and prohibit caching**.

### Cited Findings
**OpenStreetMap (ODbL, attribute "© OpenStreetMap contributors")**
- **Way 382735686**: `building=university`, `building:levels=8`, `layer=1`, `name=Pearl Sullivan Engineering Building`, `ref=PSE`, `old_name=Engineering 7`, `old_ref=E7`. 22 nodes, version 10 (last edit 2025-11-18). Computed area about **3,873 m²**; axis-aligned bbox 85.8 × 94.9 m (the building is rotated about 21°, so this is not its true length × width). No `height` tag. Centre is 43.47295, −80.53950 — [OSM way](https://www.openstreetmap.org/way/382735686) (queried via Overpass API)
- E6 link: footway way **626283189** "E6 Bridge" (`bridge=yes, covered=yes, indoor=yes, layer=1`), plus `building:part` way **1029165527** (`building:min_level=2`, `building:levels=3`, i.e. at the 3rd storey) — [OSM way 626283189](https://www.openstreetmap.org/way/626283189); [OSM way 1029165527](https://www.openstreetmap.org/way/1029165527)
- Named entrances: "PSE Front Entrance" (node 5912631994, `entrance=main`), "E7 East Entrance" (5912631995), "E7 South Exit" (5912631993), "PSE South Enterence" (11198291531, level 1, wheelchair) — [OSM node 5912631994](https://www.openstreetmap.org/node/5912631994)
- Neighbours: E5 way 51125806 (`building:levels=6`), E6 way 158807251 (`building:levels=6`). No `building:part`/indoor mapping of E7 or the atrium was found — Overpass query, [OSM](https://www.openstreetmap.org/way/51125806)

**Ontario lidar (Open Government Licence – Ontario; attribution "Contains information licensed under the Open Government Licence – Ontario")**
- Ontario DSM (Lidar-Derived) and DTM (Lidar-Derived): 1 km × 1 km tiles in packages, 0.5 m pixels (ImageServer `pixelSizeX = 0.5`). The catalogue lists 452 package resources including "Upper Thames-Grand River 2025 DSM" packages 1–19. Package 1 is 2.52 GB, so **don't bulk-download**. Licence: Open Government Licence – Ontario — [open.canada.ca DSM record](https://open.canada.ca/data/en/dataset/7e677376-9d3a-4835-bb6a-1239ff47d196); [GeoHub DSM](https://geohub.lio.gov.on.ca/maps/mnrf::ontario-digital-surface-model-lidar-derived/about); [GeoHub DTM](https://geohub.lio.gov.on.ca/maps/mnrf::ontario-digital-terrain-model-lidar-derived/about)
- Public ImageServers (support `identify` and `exportImage`, no key): `https://ws.geoservices.lrc.gov.on.ca/arcgis5/rest/services/Elevation/Ontario_DSM_LidarDerived/ImageServer` and `.../Ontario_DTM_LidarDerived/ImageServer`. At E7 centre (−80.5395, 43.47295): DSM **372.35 m**, DTM **335.83 m**. The source catalog item is "DEDSFM Upper Thames-Grand River 2025" (StartYear/EndYear 2025) — [LIO Elevation services](https://ws.geoservices.lrc.gov.on.ca/arcgis5/rest/services/Elevation)
- Crop analysis. `exportImage`, bbox −80.54024,43.47233 to −80.53877,43.47358, imageSR 26917, F32 TIFF, 236×279 px at 0.5 m, 395 KB each. Heights are DSM − DTM inside the OSM E7 polygon (~3,929 m²):
  - ~1,981 m² at 34–40 m (median **36.51 m**)
  - ~1,550 m² at 30–34 m (median **31.04 m**)
  - 99th percentile 37.22 m; max **38.35 m**
  - Lidar ground under and around E7 is about 335.8–337.3 m ASL (grade rises about 1.5 m toward University Ave)

  The shaded-relief render shows a strip of about 7–8 repeating ridges between the E7 block and the E5 block, which is the sawtooth atrium roof, with heights around 22–30.5 m. An automated ridge-spacing estimate (~5.9 m) was noisy and should not be trusted — (derived from the [LIO Elevation ImageServer](https://ws.geoservices.lrc.gov.on.ca/arcgis5/rest/services/Elevation/Ontario_DSM_LidarDerived/ImageServer))
- Ontario DSM (Imagery-Derived), **SWOOP 2020**, 0.5 m, horizontal accuracy 0.45 m: E7 centre 372.18 m, which agrees with the lidar — `.../Elevation/Ontario_DSM_ImageryDerived/ImageServer` ([LIO Elevation services](https://ws.geoservices.lrc.gov.on.ca/arcgis5/rest/services/Elevation))

**City / Region of Waterloo**
- City of Waterloo "Buildings" (rooftop outlines, 37,970 polygons, fields AREA_M only, **no heights**). Feature at E7: OBJECTID 31731, **AREA_M 3,579.31 m²**, 11 vertices. The description notes the "roofline may not match the footprint on the ground", 1:250 digitising and use of "building cad drawings … where available". The Hub metadata licence field is blank; the portal says data may be used and republished under the City's Open Data Licence — [Buildings dataset](https://data.waterloo.ca/datasets/f32d5f6f5fb54ced93ee47eb468bcc59); [FeatureServer](https://services.arcgis.com/ZpeBVw5o1kjit7LT/arcgis/rest/services/Buildings/FeatureServer/0); [City open data page](https://www.waterloo.ca/council-and-city-administration/open-data-and-maps/)
- City of Waterloo LiDAR (2014, 2019) and orthoimagery (2003–2021) are held by the UW Geospatial Centre but **restricted to current UW students, faculty and staff**, with a signed data release agreement and "personal use for academic, research, and/or teaching purposes". **Not redistributable** — [UW Geospatial Centre – City of Waterloo](https://uwaterloo.ca/lib-geospatial/collections/canadian-geospatial-data-resources/regional-municipality-waterloo/city-waterloo-municipal-data)
- Region of Waterloo imagery: WMS at 10–30 cm, 2000–2024 (licence not confirmed in this session) — [UW Geospatial Centre – Region orthoimagery](https://uwaterloo.ca/lib-geospatial/collections/aerial-photographs-satellite-and-orthoimagery/region-waterloo-orthoimagery); [Region open data portal](https://rowopendata-rmw.opendata.arcgis.com/)

**Google Photorealistic 3D Tiles and Google Earth**
- Map Tiles API policies: "you must not pre-fetch, index, store, or cache any Content"; you may overlay your own 3D objects "as long as the 3D objects aren't extracted, traced, or otherwise derived by hand or machine from Photorealistic 3D Tiles"; programmatic measurements from 3D imagery count as derivative and are prohibited; offline use is prohibited; Google attribution/logo is required (Cesium for Unity has a "Show Credits On Screen" option) — [Map Tiles API Policies](https://developers.google.com/maps/documentation/tile/policies)
- Google geo guidelines for video: Google Earth and Earth Studio content may be used without permission for "news broadcasts, television shows, films, documentaries … and any educational purposes" with on-screen attribution kept near the content. It is **prohibited** "for promotional films, advertisements or commercials" — [Google Geo Guidelines](https://about.google/brand-resource-center/products-and-services/geo-guidelines/)

**Other footprint datasets**
- Microsoft Canadian Building Footprints: 11,842,186 footprints, **ODbL**, released March 2019 — [GitHub](https://github.com/microsoft/CanadianBuildingFootprints); [Bing blog](https://blogs.bing.com/maps/2019-03/microsoft-releases-12-million-canadian-building-footprints-as-open-data)
- Statistics Canada Open Database of Buildings (Open Government Licence – Canada) — [StatCan Daily](https://www150.statcan.gc.ca/n1/daily-quotidien/190301/dq190301g-eng.htm)

### Inferences
- Lidar gives what the drawings lack: **absolute roof heights**. A plausible reading (not confirmed by any document) is about 31 m for the main E7 roof/parapet over 7 storeys (about 4.4 m per floor on average) and about 36.5 m for the Level 8 mechanical penthouse. That matches the ArchDaily Level 8 plan, which shows an equipment penthouse set back from the perimeter.
- Suggested pipeline: register the `original` plans to OSM way 382735686 (or the City outline), then set heights from the lidar crop. The crop is small enough to commit or regenerate, and OGL-Ontario allows redistribution with attribution.
- Google 3D Tiles are fine as a *live, attributed backdrop* (Cesium for Unity on Quest) but **cannot be traced, measured, cached or used to build the E7 model**. A "vision" video built from Google Earth is allowed only if it's non-promotional and attributed on screen. A hackathon pitch video is borderline, so flag it for the team.
- The Microsoft footprints (2019 release) probably predate E7's 2018 completion in the source imagery (unverified), and OSM is better anyway.

### Gaps
- **Google 3D Tiles coverage of the UW campus was not verified**; it needs an API key or a Google Earth check.
- The City of Waterloo Open Data Licence wording and the Region of Waterloo imagery licence text weren't retrieved.
- Lidar point density and classification for the 2025 project weren't retrieved (only the 0.5 m derived rasters were examined).
- No `height`/`roof:shape` tags exist in OSM for E7.

## Q5. Existing 3D models of E7 or the UW campus

### Takeaway
**No existing 3D model of E7 was found** on Sketchfab, SketchUp 3D Warehouse or GitHub. Campus models that do exist are other buildings, mostly from 2014, and are not reusable for E7.

### Cited Findings
- Sketchfab API searches ("university of waterloo", "uwaterloo", "waterloo engineering", "E7 waterloo"): only "Tower at uWaterloo" (CC BY-NC-SA, 38k faces), "Porcellino UW Modern Languages building" (CC BY-SA) and unrelated items; nothing for E7 — [Sketchfab: Tower at uWaterloo](https://sketchfab.com/3d-models/none-3ae7d643b80a41faa37b7ddd002faf4d)
- 3D Warehouse API searches: "Engineering 2" (2020, Joyceline N.), "Davis Centre Library" (2014), "Dana Porter Library" (2014, several), "University Of Waterloo School Of Architecture" (2014), "School of Pharmacy" (2014). **No E5, E6 or E7.** Models fall under 3D Warehouse's own terms, not an open licence — [3D Warehouse: UW School of Architecture](https://3dwarehouse.sketchup.com/model/356d912c5f276d2b136b034968016798/University-Of-Waterloo-School-Of-Architecture)
- GitHub search found campus-3D projects for other universities (e.g. Auckland, Tulane) but none for UW — [UoA 3d_campus_unity](https://github.com/UoA-eResearch/3d_campus_unity); [tulane-campus-3d](https://github.com/WeildTheSword/tulane-campus-3d)

### Inferences
- The team's model would plausibly be the first public detailed E7 model, which is a small differentiator for the demo.

### Gaps
- Google Earth's own photogrammetric mesh of campus wasn't inspected, and it can't be reused anyway (Q4).
- UW's internal campus map or GIS layers (behind WatIAM) were not examined, per the brief.

## Q6. Facts that pin down geometry

### Takeaway
Seven occupied storeys plus a Level 8 roof/mechanical level. Gross area about 22,300–22,500 m² (sources vary from 230k to 242k ft²). Footprint about 3,580–3,870 m². A **12 m-wide, seven-storey atrium** joins E7 to E5, with bridges at each level and a **sawtooth roof** over it. An enclosed bridge to **E6 at the 3rd storey**. Unitized **ENNWALL-70 curtain wall** with fritted pyramidal-pattern glass. Lidar roof heights about **31 m / 36.5 m** (max 38.35 m). No source gives floor-to-floor heights, the structural grid or the curtain-wall module.

### Cited Findings
- Storeys: "seven-storey" — [UW Engineering news](https://uwaterloo.ca/engineering/news/university-approves-88-million-engineering-7-building); [Ennova](https://ennovafacades.com/project/university-of-waterloo-engineering-7/); [LRI](https://lrifire.com/projects/university-of-waterloo-engineering-7/); [MTE](https://mte85.com/case-studies/university-of-waterloo-engineering-7/). This conflicts with OSM `building:levels=8` ([OSM](https://www.openstreetmap.org/way/382735686)) and with ArchDaily plans labelled Level 1–8, where Level 8 is a roof/mechanical plan ([ArchDaily](https://www.archdaily.com/952235/university-of-waterloo-engineering-5-and-7-perkins-and-will))
- Gross floor area (the sources disagree):
  - 230,000 ft² (2014 approval) — [UW](https://uwaterloo.ca/engineering/news/university-approves-88-million-engineering-7-building)
  - 240,000 ft² / 22,297 m² — [Smith+Andersen](https://smithandandersen.com/sites/default/files/project_profiles/2022-05/Waterloo_Engineering7_07067.pdf)
  - 242,000 ft² — [Ennova](https://ennovafacades.com/project/university-of-waterloo-engineering-7/); [UW opening article](https://uwaterloo.ca/engineering/news/pse-opens-bang-reveal-and-special-delivery)
  - 22,483 m² — [LRI](https://lrifire.com/projects/university-of-waterloo-engineering-7/)
  - ArchDaily's 425,000 ft² is E5 + E7 combined — [ArchDaily](https://www.archdaily.com/952235/university-of-waterloo-engineering-5-and-7-perkins-and-will)
- Footprint: OSM polygon about 3,873 m² (computed) — [OSM](https://www.openstreetmap.org/way/382735686); City rooftop outline 3,579.31 m² — [City of Waterloo Buildings](https://services.arcgis.com/ZpeBVw5o1kjit7LT/arcgis/rest/services/Buildings/FeatureServer/0)
- Atrium: "12-metre-wide atrium" — [MTE](https://mte85.com/case-studies/university-of-waterloo-engineering-7/); "seven-storey atrium with a series of bridges at each level" — [Smith+Andersen](https://smithandandersen.com/sites/default/files/project_profiles/2022-05/Waterloo_Engineering7_07067.pdf); "one of the largest enclosed spaces on campus" — [Perkins&Will](https://perkinswill.com/project/engineering-5-and-7/). The ArchDaily section render shows an 8-tooth sawtooth roof over the atrium and a red zig-zag feature stair — [ArchDaily E7 section](https://images.adsttc.com/media/images/5fc0/5f64/63c0/17d6/2c00/10d3/original/UWaterloo_Engineering7_Section.jpg)
- Bridges: E6 via "an enclosed pedestrian bridge at the third storey" — [MTE](https://mte85.com/case-studies/university-of-waterloo-engineering-7/); [Iron Warrior](https://iwarrior.uwaterloo.ca/2014/11/09/29642/engineering-7-creates-space-for-students-students-vote-yes/). A "curvilinear bridge" links E5/E7 back to main campus over the LRT — [Perkins&Will](https://perkinswill.com/project/engineering-5-and-7/)
- Facade: unitized curtain wall, ENNWALL-70 — [Ennova](https://ennovafacades.com/project/university-of-waterloo-engineering-7/). Fritted pyramidal-pattern skin on labs and offices, low-iron clear glass on public spaces — [Perkins&Will](https://perkinswill.com/project/engineering-5-and-7/)
- Special spaces: two-storey robot lab (RoboHub) in structural glazing beside the atrium — [Smith+Andersen](https://smithandandersen.com/sites/default/files/project_profiles/2022-05/Waterloo_Engineering7_07067.pdf); two-storey "flight center", 7th-floor admin, 7 lecture halls — [Iron Warrior](https://iwarrior.uwaterloo.ca/2014/11/09/29642/engineering-7-creates-space-for-students-students-vote-yes/); Student Machine Shop next to the Ideas Clinic — [IDEAs Clinic](https://uwaterloo.ca/engineering-ideas-clinic/about/engineering-7)
- Heights (derived): lidar DSM − DTM inside the E7 outline gives medians of 31.04 m and 36.51 m, max 38.35 m; ground about 335.8 m ASL — [LIO Elevation ImageServer](https://ws.geoservices.lrc.gov.on.ca/arcgis5/rest/services/Elevation/Ontario_DSM_LidarDerived/ImageServer)
- Budget and timeline: $88M approved 29 Oct 2014; groundbreaking Nov 2015; opened 2018; renamed PSE Nov 2025 — [UW](https://uwaterloo.ca/engineering/news/university-approves-88-million-engineering-7-building); [Academica](https://academica.ca/top-ten/uwaterloo-engineering-receives-20m-renames-engineering-building/)

### Inferences
- Average floor-to-floor is about 31 m / 7 ≈ 4.4 m, assuming the 31 m roof level is the Level 8 slab plus parapet and the ground floor is at lidar grade. That is only a starting guess, and the team should tape-measure one stair flight on site. The ground floor is likely taller (lecture halls, two-storey robot lab).
- A GFA check: 7 floors × about 3,580 m² ≈ 25,000 m² minus atrium voids and setbacks is in the right range of the stated 22,300–22,500 m², which supports a 7-storey reading.
- The 12 m atrium width can be used to calibrate or check the plan scale, measured between the E5 east face and the E7 west face on the plans.

### Gaps
- No published structural grid, column spacing, curtain-wall module width, sawtooth pitch or angle, or floor-to-floor heights. These need on-site measurement (count mullions and multiply by a measured module) or tracing from the `original` plans.
- The ~31 m vs ~36.5 m roof interpretation is my inference from lidar plus the Level 8 plan, not stated by any source.
- Whether the Nov 2025 rename added new facade signage that should appear in the model is unverified.
