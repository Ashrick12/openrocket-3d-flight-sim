# OpenRocket 3D Flight Visualizer

An interactive 3D WebGL flight replay and trajectory visualizer for **OpenRocket** simulation CSV exports. The application places simulated model and high-power rocket flights into an interactive 3D geographic environment with calibrated aerial satellite imagery, simulation data readouts, camera tracking, and simulation-synchronized flight audio.

---

### Built With

- **3D Graphics & Rendering**: [Three.js](https://threejs.org/) (WebGL)
- **Audio Engine**: Web Audio API (procedural synthesis, zero audio file dependencies)
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Data & Tools**: OpenRocket CSV exports, Python (standalone bundling & local server)

---

## Quick Start

The visualizer runs entirely in the browser with no build step, package managers, or external downloads required:

- **Windows (Recommended)**: Double-click `run.bat` to launch the local server and open the application in your browser.
- **Python Local Server**: Run `python serve.py` from the project folder, then open `http://localhost:8000` in your browser.
- **Direct Browser Execution (Offline / Zero-CORS)**: Double-click `index.html` directly in File Explorer to open it in Chrome, Edge, Firefox, or Brave. All libraries, satellite map data, and default simulation datasets are embedded for offline execution over `file:///`.

---

## 1. Project Overview & Scope

OpenRocket is an open-source 6-DOF aerodynamic simulation tool used by rocketry enthusiasts and collegiate aerospace teams to model rocket flights. While OpenRocket outputs extensive numerical tables and 2D Cartesian plots (altitude vs. time, velocity vs. time), visualizing how those numbers translate into a three-dimensional flight path across physical terrain can be difficult to interpret from raw graphs alone.

The **OpenRocket 3D Flight Visualizer** bridges this gap:

- **Input**: CSV data exported directly from an OpenRocket flight simulation.
- **Processing**: The client-side parser cleans comments, extracts event declarations, maps variable column headers, computes key flight metrics, and performs temporal interpolation between data rows.
- **Output**: An interactive 3D replay displaying the rocket's flight path, attitude, motor plume, parachute recovery, and synchronized sound effects in context over calibrated aerial satellite terrain.

### Project Boundaries & Clarifications

To keep the scope of this software project clear:

- **Simulation Visualization Only**: This application visualizes **predicted OpenRocket simulation data**. OpenRocket performs the aerodynamic and trajectory calculations; this tool visualizes the exported results.
- **Not a Live Telemetry Receiver**: It is not a flight computer, ground control station, real-time receiver, or live GPS tracker.
- **Separate from Physical Hardware**: This repository documents the software visualizer only. Any physical rocket builds, airframe fabrication, onboard avionics hardware, or actual flight tests are separate projects and are not documented here.

---

## 2. OpenRocket Data Pipeline

The application processes simulation data through a clean client-side pipeline:

```
[ OpenRocket Simulation ]
          │
          ▼ (Export Data to CSV)
[ Simulation CSV Export ]
  - Columns: Time, Altitude, Velocity, Acceleration, Thrust, Drag, Orientation, Wind
  - Comments: # Event <NAME> occurred at t=<TIME> seconds
          │
          ▼ (Drag-and-Drop or File Import)
[ OpenRocketParser (js/parser.js) ]
  - Auto-detects delimiters (comma, semicolon, tab)
  - Extracts simulation title and flight events
  - Maps flexible header nomenclature
  - Computes summary metrics (Apogee, Burnout, Deploy, Duration)
          │
          ▼ (Binary Search & Linear Interpolation)
[ sample(t) Temporal Interpolator ]
          │
     ┌────┴────────────────────────┐
     ▼                             ▼
[ 3D Scene (Three.js) ]   [ Audio Engine (Web Audio API) ]
  - Rocket position & attitude  - Motor thrust gain modulation
  - Parachute deployment scale  - Event triggers (ejection, parachute snap)
  - Trajectory ribbon & HUD     - Descent airflow modulation
```

### Supported Data Columns

The parser inspects CSV headers using normalized keyword matching to support varying OpenRocket export layouts:

| Simulation Variable | Header Keywords Matched | Used For |
| :--- | :--- | :--- |
| **Time** | `time` | Playback synchronization, scrubber, event timing ($s$) |
| **Altitude** | `alt`, `altitude` | Vertical position $+Y$, simulation data HUD ($m$) |
| **Position East** | `position east`, `pos x` | Metric world coordinate $+X$ ($m$) |
| **Position North** | `position north`, `pos z` | Metric world coordinate $-Z$ ($m$) |
| **Vertical Velocity** | `vertical velocity` | HUD motion display, descent wind calculation ($m/s$) |
| **Total Velocity** | `total velocity` | HUD motion display, coast airflow volume ($m/s$) |
| **Vertical Acceleration** | `vertical acceleration` | HUD motion display ($m/s^2$) |
| **Total Acceleration** | `total acceleration` | HUD G-force calculation ($g$) |
| **Motor Thrust** | `thrust` | Particle plume scale, motor audio volume ($N$) |
| **Aerodynamic Drag** | `drag`, `drag force` | Aerodynamics HUD display ($N$) |
| **Vertical Orientation (Zenith)** | `zenith`, `vertical orientation` | Pad launch rail angle ($^\circ$) |
| **Lateral Orientation (Azimuth)** | `azimuth`, `lateral orientation` | Pad launch rail compass heading ($^\circ$) |
| **Lateral Distance** | `lateral distance` | Downrange drift readout ($m$) |
| **Mach Number** | `mach` | Aerodynamics HUD display |
| **Wind Velocity** | `wind velocity` | Descent airflow audio modulation ($m/s$) |

### Flight Event Parsing

OpenRocket records simulation events as comment lines formatted as `# Event <NAME> occurred at t=<TIME> seconds`. The parser captures these into structured event objects:

- `IGNITION` & `LAUNCH`: Motor ignition command and rail motion ($t = 0.0\text{ s}$).
- `LIFTOFF`: Rocket clears initial rail contact.
- `LAUNCHROD`: Launch rod clear.
- `BURNOUT`: Propellant exhaustion; ends powered boost.
- `APOGEE`: Peak altitude where vertical velocity crosses zero.
- `EJECTION_CHARGE`: Pyrotechnic ejection charge fires.
- `RECOVERY_DEVICE_DEPLOYMENT`: Parachute canopy deploys into the airstream.
- `GROUND_HIT` / `SIMULATION_END`: Touchdown on the terrain.

### Temporal Interpolation

Simulation exports typically record data at discrete intervals ($10\text{ ms}$ to $50\text{ ms}$). To render smooth $60\text{ fps}$ visual updates at any playback speed, `OpenRocketParser.prototype.sample(t)` uses binary search to locate surrounding timestamps and computes linear interpolation (`lerp`) across all state properties.

---

## 3. 3D Scene & Environment

The 3D environment is rendered with Three.js using directional key lighting, soft shadows, atmospheric depth, and geographic terrain anchoring.

```
       ▲ +Y (Altitude)
       │
       │       Simulated Flight Path
       │           ╭─────╮
       │          ╱       ╲ (Parachute Descent)
       │         ╱         ╲
       │        ╱ (Coast)   ╲
       │       ╱             ● Touchdown
       │      ▲ (Boost)
       │     ╱
       │    ● Launch Pad
───────┴────────────────────────► +X (East)
      ╱
     ▼ -Z (North)
```

### Geographic Launch Site (Freestone Park, Gilbert, AZ)

- **Calibrated Aerial Map**: High-resolution composite ($4095 \times 4095\text{ px}$) calibrated to a scale of $0.1247\text{ m/pixel}$, spanning a $510.7\text{ m} \times 510.7\text{ m}$ ground area.
- **Geographic Origin**: World coordinates $(0, 0, 0)$ align with the center circle of the park's soccer field.
- **Cardinal Alignment**: Scene coordinates map North to $-Z$ and East to $+X$, directly matching OpenRocket's coordinate system.
- **Environment Controls**:
  - **Map Toggle**: Switch between the aerial photographic terrain and a dark engineering grid floor.
  - **Grid Toggle**: Display $50\text{ m}$ concentric distance rings and coordinate axes.
  - **Field Switch**: Toggle origin between the parallel soccer field and the perpendicular western field.

### Rocket Model & Flight Dynamics

- **Procedural 3D Rocket**: Cylindrical airframe with gloss highlights, aerodynamic fin assembly with metallic edge highlights, and motor nozzle geometry.
- **Trajectory Tangent Tracking**: During ascent and coast ($t < \text{deployTime}$), the rocket's longitudinal axis aligns dynamically with the instantaneous velocity vector $\frac{d\vec{P}}{dt}$, showing the rocket leading nose-first along its trajectory arc and turning over at apogee.
- **Ground Drop Line & Altitude Shadow**: A vertical projection line drops from the rocket to the ground plane, paired with a ground shadow dot to provide visual altitude and spatial depth.
- **Exhaust Plume**: During powered motor burn ($t \le \text{burnoutTime}$ and $\text{thrust} > 0.05\text{ N}$), an animated particle emitter generates flame and smoke directed opposite to travel.

### Parachute Recovery Visualization

The recovery system models an open-skirt hemispherical parachute:
- **Geometry**: Hemispherical canopy with alternating white and orange gores, apex oriented upward, concave skirt rim facing downward toward the rocket.
- **Rigging Hierarchy**: Twelve suspension lines converge from the canopy perimeter to a central swivel ring, connected by an elastic shock cord to the rocket airframe forward bulkhead.
- **Deployment Behavior**: At `deployTime`, the parachute scales outward from the rocket nose. Under canopy, the rocket hangs slightly tilted and oscillates during descent until settling upright upon ground touchdown.

### Trajectory Ribbon & Milestones

- **Phase-Colored Ribbon**: A 3D ribbon traces the trajectory path, color-coded by flight phase:
  - **Flame Red**: Powered motor boost phase.
  - **Cyan**: Coasting ascent to apogee.
  - **Emerald Green**: Parachute descent.
  - Dark contrast outlines ensure the ribbon remains clearly visible against both dark backgrounds and bright satellite imagery.
- **Billboard Milestone Pins**: 3D pins placed at Liftoff, Burnout, Apogee, Deployment, and Touchdown with screen-facing billboard badges showing the milestone name and altitude.

### Camera Tracking Modes

1. **Chase Cam**: Smoothly follows behind and above the rocket relative to its travel direction, with mouse-wheel distance zooming.
2. **Pad Cam**: Simulates a ground-based camera near the launch rail, swiveling and tilting upward to track the ascending rocket.
3. **Apogee Cam**: High-altitude wide-angle overview framing the entire flight arc from pad to landing.
4. **Free Orbit**: Unlocks manual Three.js `OrbitControls` for unrestricted rotation, panning, and zoom.

---

## 4. Playback & Timeline Controls

The playback engine provides non-linear control over the simulation timeline:

- **Play / Pause / Resume**: Control replay via the on-screen button or `Spacebar`.
- **Scrubbing**: Click or drag the timeline scrubber to jump to any timestamp. Simulation values, camera positions, particle emitters, and audio parameters update synchronously.
- **Playback Rate**: Variable speeds ($0.25\times, 0.5\times, 1.0\times, 2.0\times, 5.0\times, 10.0\times$) for close event analysis or rapid replay of long descents.
- **Single-Frame Stepping**: Step forward or backward by $0.25\text{ s}$ increments using the UI buttons or `Arrow keys`.
- **Milestone Navigation**: Clickable milestone tags on the scrubber track and an interactive vertical event list on the right allow jumping directly to event timestamps (Liftoff, Burnout, Apogee, Ejection, Touchdown).
- **Completion Behavior**:
  - **Loop OFF (Default)**: Playback runs through once, stops at the final timestamp, and holds the final state. Simulation values and camera position remain unchanged without resetting.
  - **Loop ON**: When the simulation reaches the end, playback loops back to $t = 0.0\text{ s}$ and resumes automatically.

---

## 5. Synchronized Audio System

The visualizer includes a procedural audio engine (`FlightAudioManager`) built with the browser **Web Audio API**. Rather than playing a static background sound loop, audio responds dynamically to the simulation timeline, events, and numerical properties.

```
[ Simulation Clock t ]
          │
          ├─────────────────────────────────────────────────┐
          │                                                 │
          ▼ (Event Crossings)                               ▼ (Continuous State)
┌───────────────────────────────┐               ┌───────────────────────────────┐
│ Discrete One-Shot Triggers    │               │ Continuous Audio Layers       │
│ - t = 0.0s: Ignition Burst    │               │ - t < Burnout & Thrust > 0:   │
│ - t = Ejection: Charge Pop    │               │   Motor Rumble Gain = f(T)    │
│ - t = Deploy: Parachute Snap  │               │ - t > Deploy & Alt > 0:       │
│ - t = Landing: Impact Thud    │               │   Descent Wind = f(V_v, W)    │
└──────────────┬────────────────┘               └──────────────┬────────────────┘
               │                                               │
               ▼                                               ▼
     [ One-Shot Gain Node ]                         [ Submix Gain Nodes ]
               │                                               │
               └───────────────────────┬───────────────────────┘
                                       ▼
                              [ Master Gain Node ] (Volume & Mute)
                                       │
                                       ▼
                           [ AudioContext Destination ]
```

### Sound Sequence

1. **Ignition / Launch ($t = 0.0\text{ s}$)**: A short pyrotechnic burst fires at launch, blending into the motor thrust rumble.
2. **Powered Flight ($0.0\text{ s} < t \le \text{burnoutTime}$)**: A low-frequency motor rumble accompanies the powered ascent, with gain scaling proportionally with OpenRocket's simulated thrust curve ($N$).
3. **Motor Cutoff & Coast ($\text{burnoutTime} < t < \text{deployTime}$)**: Motor rumble stops at burnout. The simulation transitions into the quiet coast phase, accompanied by a faint airflow whisper scaling with airspeed.
4. **Ejection Charge ($t = \text{ejectionTime}$)**: A pyrotechnic pop fires at the simulated ejection charge event.
5. **Parachute Deployment ($t = \text{deployTime}$)**: Synchronized with the visual expansion of the 3D canopy, a fabric whip snap followed by a billow whoosh plays as the parachute opens.
6. **Descent & Airflow ($\text{deployTime} \le t < \text{landingTime}$)**: An ambient airflow layer plays during descent, modulating with simulated vertical descent rate and wind velocity.
7. **Ground Touchdown ($t = \text{landingTime}$)**: A low-frequency impact thud plays upon terrain contact.

### Procedural Synthesis & Zero External Assets

- **Zero Audio Files**: All sounds are synthesized in memory using Web Audio API buffer generators (filtered pink/brown noise, resonant bandpass filters, and exponential envelopes).
- **No Network / CORS Issues**: Because no external `.mp3` or `.wav` files are loaded, the audio works offline and runs over `file:///` without cross-origin blocking.
- **Smooth Automation**: Volume adjustments use `linearRampToValueAtTime` to eliminate audible clicks or pops during fast scrubbing.

### Non-Linear Scrubbing & State Synchronization

- **Forward Scrubbing**: When jumping forward past flight events, skipped one-shot sounds are flagged as fired without playing, preventing stacked historical audio bursts. Continuous layers immediately assume the target timestamp's gain.
- **Backward Scrubbing**: When scrubbing backward, future event flags are cleared so they can trigger again upon forward replay. Continuous gains immediately switch to the earlier flight phase (e.g., descent wind silences and motor rumble resumes if scrubbing back into powered ascent).
- **Pausing**: Continuous audio gains ramp to zero on pause and restore upon resume.
- **Audio Controls**: A mute/unmute button and volume slider ($0\%$ to $100\%$, default $70\%$) are integrated directly into the bottom playback bar.

---

## 6. Simulation Data Panel

The left floating panel displays live flight metrics parsed and interpolated from OpenRocket:

```
┌───────────────────────────────────────────────┐
│ SIMULATION DATA                               │
│ Predicted • OpenRocket                        │
├───────────────────────────────────────────────┤
│ POSITION                                      │
│ Altitude: 354.2 m        Max Apogee: 354.9 m  │
│                                               │
│ MOTION                                        │
│ Vert Velocity: -3.7 m/s  Total Vel: 3.7 m/s   │
│ Vert Accel: -9.0 m/s²    G-Force: 0.9 g       │
│                                               │
│ AERODYNAMICS                                  │
│ Motor Thrust: 0.0 N      Aero Drag: -0.00 N   │
│ Mach Number: 0.01                             │
│                                               │
│ FLIGHT                                        │
│ Flight Time: 7.93 s      Drift: 21.8 m        │
│                                               │
│ DATA SOURCE                                   │
│ [ OpenRocket Simulation ]                     │
└───────────────────────────────────────────────┘
```

---

## 7. Feature Summary

| Category | Implemented Features |
| :--- | :--- |
| **Simulation Data** | OpenRocket CSV ingestion; drag-and-drop import; automatic delimiter detection (`,` `;` `\t`); comment and metadata parsing; flexible column mapping; summary metric calculation; linear interpolation between discrete time records. |
| **3D Scene & Geography** | Three.js WebGL antialiased rendering; calibrated Freestone Park aerial satellite map ($510.7\text{ m} \times 510.7\text{ m}$); North ($-Z$) / East ($+X$) cardinal alignment; toggleable dark engineering floor; $50\text{ m}$ distance rings and coordinate grid; dual field launch origins. |
| **Rocket & Recovery** | Procedural 3D rocket model; gloss and edge highlights; dynamic trajectory tangent orientation; motor exhaust flame and smoke particles; 3D parachute canopy with orange/white gores, suspension lines, and shock cord; smooth deployment scaling; descent oscillation; upright landing settling. |
| **Trajectory & Events** | Phase-colored 3D trajectory ribbon (Red: Boost, Cyan: Coast, Green: Recovery); dark contrast outlines; 3D billboard milestone pins; right-side interactive event list with quick-jump navigation. |
| **Interactive Playback** | Play, pause, resume; smooth scrubber slider; single-step stepping ($0.25\text{ s}$); speed multipliers ($0.25\times$ to $10\times$); loop toggle; clean non-loop end-of-flight hold; milestone track markers. |
| **Synchronized Audio** | Procedural Web Audio API engine; zero external audio files; synchronized launch/ignition burst, motor thrust rumble, burnout cutoff, coast airflow whisper, ejection charge pop, parachute whip snap, descent wind ambience, and landing thud; non-linear scrub state synchronization; mute toggle and volume slider. |
| **Camera Tracking** | Chase Cam (rocket-following with distance zoom); Pad Cam (ground-based tracking); Apogee Cam (wide tactical overview); Free Orbit (manual Three.js orbit/pan/zoom). |
| **Offline Architecture** | Standalone zero-CORS bundling (`build_bundle.py` into `js/app.js`); runs directly via `file:///` without requiring a local web server or internet connection. |

---

## 8. Technical Architecture & File Structure

The project is structured as modular ES6 classes that are also compiled into a standalone bundle for offline execution:

```
OpenRocket 3D Visualizer/
├── index.html                 # Main interface, HUD panels, and WebGL canvas
├── css/
│   └── style.css              # Theme styling, translucent panels, and typography
├── js/
│   ├── parser.js              # OpenRocketParser: CSV ingestion, column mapping, interpolation
│   ├── visualizer.js          # RocketVisualizer: Three.js scene, rocket, parachute, cameras
│   ├── audio.js               # FlightAudioManager: Web Audio API procedural synthesis & sync
│   ├── ui.js                  # UIController: HUD updates, timeline scrubber, event handling
│   ├── main.js                # App entry point orchestrating parser, vis, audio, UI
│   ├── app.js                 # Standalone bundled script (zero-CORS offline execution)
│   └── lib/
│       ├── three.min.js       # Offline Three.js library
│       └── OrbitControls.js   # Offline Three.js OrbitControls
├── data/
│   ├── default_flight.csv     # Estes D12-3 simulation CSV (Freestone Park)
│   ├── default_flight.js      # Embedded D12-3 dataset for zero-CORS offline execution
│   ├── sim1.js                # Embedded F32T dataset (87s duration)
│   ├── f32t.js                # Embedded F32T dataset (vertical ascent)
│   ├── freestone_satellite.js # High-res Freestone Park aerial composite (base64 data URI)
│   └── freestone_stitched_2k.jpg # Fallback terrain texture
├── build_bundle.py            # Bundler script compiling modules into js/app.js
├── serve.py                   # Lightweight Python local HTTP server
├── run.bat                    # Windows one-click launcher
└── README.md                  # Project documentation
```

### Module Responsibilities

1. **`OpenRocketParser` (`js/parser.js`)**:
   Cleans CSV comments, extracts flight events, maps header variants, computes summary metadata, and handles linear state interpolation via `sample(t)`.
2. **`RocketVisualizer` (`js/visualizer.js`)**:
   Manages the Three.js scene, camera projection, ground plane, procedural rocket, exhaust particle emitter, parachute recovery group, trajectory ribbon, and milestone pins.
3. **`FlightAudioManager` (`js/audio.js`)**:
   Manages the Web Audio API context, procedural buffer synthesis, master and submix gains, event firing flags, and state-aware scrubbing.
4. **`UIController` (`js/ui.js`)**:
   Coordinates DOM bindings, HUD updates, timeline scrubber interaction, and the $60\text{ fps}$ `requestAnimationFrame` loop.

---

## 9. Importing Custom Simulations

The application includes three pre-loaded simulation presets:
- **`sim1.csv`**: Estes D12-3 motor simulation from Freestone Park ($93.3\text{ m}$ apogee, $26.89\text{ s}$ flight).
- **`sim1 (F32T 87s)`**: Aerotech F32T-6 composite motor flight with high apogee ($354.9\text{ m}$) and $87.6\text{ s}$ parachute descent.
- **`f32t no angle.csv`**: Aerotech F32T-6 vertical test flight with parachute deployment at $t = 8.065\text{ s}$.

To visualize your own OpenRocket flight:
1. In OpenRocket, open your rocket simulation and click **Export Data**.
2. Select **Time** and **Altitude** (exporting velocity, acceleration, thrust, drag, and orientation is recommended for complete simulation readouts).
3. Ensure **Include flight events as comments** is checked.
4. Drag and drop the `.csv` file onto the browser window, or click **Import CSV** in the top-right toolbar.

---

## 10. Engineering & Implementation Notes

Building the visualizer involved resolving several practical engineering challenges:

1. **Trajectory Tangent Tracking**:
   Aligning the rocket purely by fixed pad angles caused the airframe to point straight up while wind pushed it downrange sideways. By computing the instantaneous trajectory tangent ($\vec{v} = \frac{\Delta \vec{P}}{\Delta t}$), the rocket aligns nose-first along its curved trajectory and rotates through apogee turnover naturally.
2. **Parachute Rigging & Deployment Timing**:
   Correcting the recovery visualization required restructuring the Three.js group hierarchy: domed canopy convex side up, skirt rim down, suspension lines converging to a swivel ring, and an elastic shock cord connecting the swivel to the forward bulkhead. Resetting parser metadata cleanly between runs resolved an edge case where switching flights caused high-altitude flights (like the F32T) to deploy early using a previous flight's timestamp.
3. **Procedural Web Audio Engine**:
   Rather than loading external audio sample files (which introduce CORS blocking over `file:///`, licensing ambiguity, and network loading latency), audio buffers are synthesized procedurally via the Web Audio API. This produced a zero-dependency, self-contained audio layer that loads instantaneously and automates smoothly against OpenRocket's simulated thrust and velocity values.
4. **Zero-CORS Standalone Architecture**:
   To make the project run cleanly without requiring command-line tools or web server setup, `build_bundle.py` embeds the Three.js libraries, satellite imagery, presets, and code modules into a single bundle (`js/app.js`), allowing direct double-click execution from a local folder or flash drive.

---

## 11. AI-Assisted Development Disclosure

In accordance with academic and engineering transparency standards, this project utilized AI-assisted development tools (LLM-based coding assistants):
- **Role of AI Tools**: Assisted with code implementation, debugging numerical edge cases, refactoring modular components, generating procedural Web Audio buffer algorithms, and suggesting CSS layout refinements.
- **Role of the Developer**: Established all project requirements, architectural design decisions, OpenRocket data specifications, 3D visual composition, mathematical validation, debugging direction, and testing/acceptance across all flight phases.
- The project was neither generated autonomously nor built without tools; it represents an engineer-directed project using modern AI pair-programming workflows to accelerate development and solve specific technical challenges.

---

## 12. License

This project is licensed under the [MIT License](LICENSE) — see the [`LICENSE`](LICENSE) file for details.
