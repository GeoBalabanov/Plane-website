# Concorde: A Transatlantic Journey

A scroll-driven storytelling website (Human Centered Design project). A virtual Concorde flight from London Heathrow to New York JFK in seven pinned scenes and a closing section; the scroll position scrubs every animation.

Open `index.html` through any static server, for example `python3 -m http.server`, then visit http://localhost:8000.

- Structure: `index.html` (markup), `css/site.css` (styles), `js/site.js` (scroll engine). Design rules: `design-system/concorde/MASTER.md`.
- 3D: Three.js r149 (CDN). `js/concorde3d.js` builds a procedural Concorde from its real proportions (61.66 m long, 25.6 m span) for the cabin walk-through and the Mach 2 top view. `js/globe3d.js` draws the closing globe and its two flight arcs.
- Droop nose scene: `js/droop3d.js` (an ES module) shows a real model in a studio, with the nose and camera scrubbed by GSAP ScrollTrigger (CDN). The model is "Concorde" by manilov.ap on Sketchfab, CC BY 4.0 (`assets/raw/`). `tools/build-concorde.mjs` splits the nose off the fuselage and compresses it into `assets/models/concorde.glb`; rebuild with `cd tools && npm install && npm run build`.
- Smooth scrolling: Lenis (CDN). Fonts: Archivo (expanded) and IBM Plex Mono (Google Fonts).
- `assets/`: window, clouds and Earth images are AI-generated illustrations, not photographs. `land.json` holds the globe's land outlines, from Natural Earth (public domain) via world-atlas.
- Design research and frames: Figma file "Concorde Design Frames".
