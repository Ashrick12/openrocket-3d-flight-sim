# OpenRocket 3D Flight Visualizer

An interactive 3D WebGL flight replay and trajectory visualizer for **OpenRocket** simulation CSV exports. 

The application places simulated model and high-power rocket flights into an interactive 3D geographic environment with calibrated aerial satellite imagery, real-time simulation data readouts, camera tracking, and simulation-synchronized flight audio.

---

### Built With

- **3D Graphics & Rendering**: [Three.js](https://threejs.org/) (WebGL)
- **Audio Engine**: Web Audio API (procedural synthesis, zero audio file dependencies)
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Data & Tools**: OpenRocket CSV exports, Python (standalone bundling & local server)

---

## Quick Start

The visualizer runs entirely in the browser with **no build steps, package managers, or external downloads required**:

- **Windows (Recommended)**: Double-click `run.bat` to launch the local server and automatically open the application in your browser.
- **Python Server**: Run `python serve.py` from the project directory, then open `http://localhost:8000` in your browser.
- **Direct Browser Execution (Offline / Zero-CORS)**: Double-click `index.html` directly in File Explorer. All libraries, satellite map data, and default simulation datasets are embedded for offline execution over `file:///`.

---

## Key Features

- **Geographic 3D Flight Replay**: Renders the flight trajectory over a metric-calibrated aerial satellite map of Freestone Park (Gilbert, AZ), with cardinal coordinate alignment and toggleable distance range rings.
- **Trajectory Tangent Tracking**: Procedural 3D rocket model dynamically aligns with the velocity vector along its curved flight path and turns over naturally at apogee.
- **Parachute Recovery System**: Domed canopy, suspension lines, and elastic shock cord scale outward and deploy at the simulated deployment timestamp, suspending the rocket through landing.
- **Simulation-Synchronized Audio**: Procedural sound engine driven by the simulation timeline—featuring ignition transient, thrust rumble scaling with motor thrust, burnout cutoff, coast airflow whisper, ejection charge pop, parachute snap, descent wind, and ground impact.
- **Non-Linear Timeline Playback**: Play, pause, scrub to any timestamp, single-step ($0.25\text{ s}$), variable speeds ($0.25\times$ to $10.0\times$), milestone jump points, and loop modes.
- **Simulation Data Panel**: Live HUD displaying position (altitude, apogee), motion (velocity, acceleration, G-force), aerodynamics (thrust, drag, Mach), and downrange drift.
- **Multiple Camera Tracking Modes**: Chase Cam (rocket-following with distance zoom), Pad Cam (ground-based tracking), Apogee Cam (tactical overview), and Free Orbit (manual Three.js pan/zoom).
- **Flexible CSV Import**: Drag-and-drop any OpenRocket simulation CSV export directly into the browser with automatic delimiter and column detection.
- **Offline / Zero-CORS Ready**: Self-contained client-side application requiring no server-side processing or internet connectivity.

---

## How It Works

```
OpenRocket Simulation ──► CSV Export ──► Parser & Interpolator ──► 3D Scene (Three.js)
                                                               └──► Audio Engine (Web Audio)
```

1. **Export**: Run a simulation in OpenRocket and export the flight data as a `.csv` with flight events included as comments.
2. **Ingest & Interpolate**: The client-side parser (`js/parser.js`) normalizes headers, extracts flight events, and calculates summary metrics. A binary-search interpolator samples continuous state vectors at 60 FPS at any playback speed.
3. **Visualize & Harmonize**: Three.js renders the 3D rocket, particle plume, trajectory ribbon, and terrain, while the Web Audio engine synchronizes sound effects to the active simulation timestamp.

> 📖 **Looking for deep architectural details?**  
> See [**`DOCUMENTATION.md`**](DOCUMENTATION.md) for the complete engineering documentation—including ASCII pipeline diagrams, coordinate transformations, CSV column keyword mapping, audio routing graphs, and recovery rigging hierarchies.

---

## Importing Your Own Flights

The application comes pre-loaded with sample flight presets (`sim1.csv`). To visualize your own rocket flight:

1. In OpenRocket, open your simulation and click **Export Data**.
2. Select **Time** and **Altitude** (including velocity, acceleration, thrust, drag, and orientation is recommended for full simulation fidelity).
3. Ensure **Include flight events as comments** is checked.
4. Drag and drop the `.csv` file onto the browser window, or click **Import CSV** in the top-right toolbar.

---

## Project Boundaries & Scope

To ensure clear technical boundaries:

- **Predicted Simulation Only**: This software visualizes predicted simulation data exported from OpenRocket. OpenRocket performs the aerodynamic calculations; this tool provides the spatial 3D visualization.
- **Not a Live Telemetry Receiver**: It is not a flight computer, ground control station, real-time receiver, or live tracking system.
- **Software Project Only**: This repository documents the software visualizer only. Physical rocket builds, avionics hardware, fabrication, and actual flight tests are separate efforts and are not documented here.

---

## Technical Documentation & Deep Dive

For an in-depth review of the engineering decisions and technical implementation, refer to:

- [**`DOCUMENTATION.md`**](DOCUMENTATION.md): Complete technical specification, including:
  - OpenRocket CSV parsing & keyword mapping table
  - Three.js WebGL scene architecture & georeferencing
  - Trajectory tangent tracking mathematics
  - Web Audio API procedural synthesis algorithms & routing graph
  - State-aware non-linear scrubbing mechanics
  - Class-by-class responsibilities & codebase structure
  - Engineering challenges solved during development

---

## AI-Assisted Development Disclosure

In accordance with academic and engineering transparency standards, this project utilized AI-assisted development tools (LLM-based coding assistants):
- **Role of AI Tools**: Assisted with code implementation, debugging numerical edge cases, refactoring modular components, generating procedural Web Audio buffer algorithms, and suggesting CSS layout refinements.
- **Role of the Developer**: Established all project requirements, architectural design decisions, OpenRocket data specifications, 3D visual composition, mathematical validation, debugging direction, and testing/acceptance across all flight phases.
- The project was neither generated autonomously nor built without tools; it represents an engineer-directed project using modern AI pair-programming workflows to accelerate development and solve specific technical challenges.

---

## License

This project is licensed under the [MIT License](LICENSE) — see the [`LICENSE`](LICENSE) file for details.
