/**
 * OpenRocket UI & Playback Controller
 * Handles HUD telemetry, timeline scrubber, event navigation,
 * playback speed, camera modes, and drag-and-drop CSV import.
 */

export class UIController {
    constructor(visualizer, parser, onFileLoad, audioManager = null) {
        this.vis = visualizer;
        this.parser = parser;
        this.onFileLoad = onFileLoad;
        this.audio = audioManager;

        // Playback state
        this.currentTime = 0;
        this.isPlaying = false;
        this.speed = 1.0;
        this.isLooping = false;
        this.lastFrameTimestamp = performance.now();

        // Cached DOM elements
        this.dom = {
            title: document.getElementById("sim-title"),
            simDurationText: document.getElementById("sim-duration-text"),
            phaseBadge: document.getElementById("phase-badge"),
            eventToast: document.getElementById("event-toast"),
            
            // Simulation Data Indicators
            altVal: document.getElementById("tel-alt"),
            maxAltVal: document.getElementById("tel-max-alt"),
            vertVelVal: document.getElementById("tel-vert-vel"),
            totalVelVal: document.getElementById("tel-total-vel"),
            vertAccVal: document.getElementById("tel-vert-acc"),
            gForceVal: document.getElementById("tel-gforce"),
            thrustVal: document.getElementById("tel-thrust"),
            dragVal: document.getElementById("tel-drag"),
            timeVal: document.getElementById("tel-time"),
            driftVal: document.getElementById("tel-drift"),
            machVal: document.getElementById("tel-mach"),

            // Playback & Timeline
            playBtn: document.getElementById("btn-play"),
            playIcon: document.getElementById("play-icon"),
            pauseIcon: document.getElementById("pause-icon"),
            stepPrevBtn: document.getElementById("btn-step-prev"),
            stepNextBtn: document.getElementById("btn-step-next"),
            resetBtn: document.getElementById("btn-reset"),
            scrubber: document.getElementById("timeline-scrubber"),
            progressBar: document.getElementById("timeline-progress"),
            milestonesContainer: document.getElementById("timeline-milestones"),
            markerDotsContainer: document.getElementById("timeline-marker-dots"),
            timeDisplay: document.getElementById("playback-time-display"),
            timelinePhaseText: document.getElementById("timeline-phase-text"),
            phaseDot: document.getElementById("phase-dot"),
            speedSelect: document.getElementById("speed-select"),
            loopBtn: document.getElementById("btn-loop"),

            // Audio Controls
            soundBtn: document.getElementById("btn-sound"),
            soundVolumeSlider: document.getElementById("sound-volume-slider"),
            soundIconOn: document.getElementById("sound-icon-on"),
            soundIconOff: document.getElementById("sound-icon-off"),

            // Camera buttons
            camBtns: document.querySelectorAll("[data-cam]"),

            // Import & Notifications
            fileInput: document.getElementById("csv-file-input"),
            importBtn: document.getElementById("btn-import-csv"),
            dropOverlay: document.getElementById("drop-overlay"),
            eventJumpList: document.getElementById("event-jump-list"),
            eventCountBadge: document.getElementById("event-count-badge"),
            notification: document.getElementById("import-notification"),
            notificationText: document.getElementById("notification-text"),
            presetSelect: document.getElementById("preset-select"),

            // Environment & Ground Controls
            toggleMapBtn: document.getElementById("btn-toggle-map"),
            toggleFieldBtn: document.getElementById("btn-toggle-field"),
            toggleGridBtn: document.getElementById("btn-toggle-grid"),

            // Panel controls
            togglePanelBtn: document.getElementById("btn-toggle-panel"),
            simPanel: document.getElementById("simulation-panel")
        };

        this.notificationTimeout = null;

        if (this.audio) {
            this.audio.initUI(
                this.dom.soundBtn,
                this.dom.soundVolumeSlider,
                this.dom.soundIconOn,
                this.dom.soundIconOff
            );
            this.audio.setFlightData(this.parser);
        }

        this.initEvents();
    }

    initEvents() {
        // Satellite Map & Environment Controls
        if (this.dom.toggleMapBtn) {
            this.dom.toggleMapBtn.addEventListener("click", () => {
                const isSat = !this.vis.isSatelliteMap;
                this.vis.setSatelliteMap(isSat);
                this.dom.toggleMapBtn.innerHTML = (isSat ? "Map: Satellite" : "Map: Dark Floor") + ' <span class="arrow-down">▾</span>';
                this.dom.toggleMapBtn.classList.toggle("active", isSat);
                const viewLabel = document.getElementById("view-mode-label");
                if (viewLabel) viewLabel.textContent = isSat ? "Satellite View" : "Floor View";
                this.showNotification(isSat ? "Freestone Park Aerial Imagery Enabled" : "Dark Telemetry Floor Enabled");
            });
        }

        if (this.dom.toggleFieldBtn) {
            this.dom.toggleFieldBtn.addEventListener("click", () => {
                const nextField = (this.vis.activeLaunchField === 'parallel') ? 'west' : 'parallel';
                this.vis.setLaunchField(nextField);
                this.dom.toggleFieldBtn.innerHTML = ((nextField === 'parallel') ? "Field: Parallel" : "Field: West") + ' <span class="arrow-down">▾</span>';
                this.showNotification((nextField === 'parallel')
                    ? "Launch Site: Soccer Field (Parallel to Parking Lot)"
                    : "Launch Site: Soccer Field (West / Perpendicular)");
            });
        }

        if (this.dom.toggleGridBtn) {
            let gridVisible = true;
            this.dom.toggleGridBtn.addEventListener("click", () => {
                gridVisible = !gridVisible;
                this.vis.setGridVisible(gridVisible);
                this.dom.toggleGridBtn.innerHTML = (gridVisible ? "Grid: On" : "Grid: Off") + ' <span class="arrow-down">▾</span>';
                this.dom.toggleGridBtn.classList.toggle("active", gridVisible);
            });
        }

        // Play / Pause
        if (this.dom.playBtn) {
            this.dom.playBtn.addEventListener("click", () => this.togglePlay());
        }
        if (this.dom.resetBtn) {
            this.dom.resetBtn.addEventListener("click", () => this.resetPlayback());
        }

        // Step Previous & Next Buttons
        if (this.dom.stepPrevBtn) {
            this.dom.stepPrevBtn.addEventListener("click", () => this.stepEvent(-1));
        }
        if (this.dom.stepNextBtn) {
            this.dom.stepNextBtn.addEventListener("click", () => this.stepEvent(1));
        }

        // Simulation Panel Collapse / Expand
        if (this.dom.togglePanelBtn && this.dom.simPanel) {
            let isCollapsed = false;
            this.dom.togglePanelBtn.addEventListener("click", () => {
                isCollapsed = !isCollapsed;
                this.dom.simPanel.style.display = isCollapsed ? "none" : "flex";
                this.dom.togglePanelBtn.textContent = isCollapsed ? "›" : "‹";
            });
        }

        // Keyboard shortcuts: Space for Play/Pause, Left/Right arrows to step, +/- to zoom
        window.addEventListener("keydown", (e) => {
            if (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON" || e.target.tagName === "SELECT") return;
            if (e.code === "Space") {
                e.preventDefault();
                this.togglePlay();
            } else if (e.code === "ArrowLeft") {
                e.preventDefault();
                this.stepEvent(-1);
            } else if (e.code === "ArrowRight") {
                e.preventDefault();
                this.stepEvent(1);
            } else if (e.key === "+" || e.key === "=") {
                e.preventDefault();
                this.vis.zoomCamera(-0.15); // Zoom in
            } else if (e.key === "-" || e.key === "_") {
                e.preventDefault();
                this.vis.zoomCamera(0.20);  // Zoom out
            }
        });

        // Timeline Scrubber
        if (this.dom.scrubber) {
            this.dom.scrubber.addEventListener("input", (e) => {
                const t = parseFloat(e.target.value);
                this.seek(t);
            });
        }

        // Playback speed
        if (this.dom.speedSelect) {
            this.dom.speedSelect.addEventListener("change", (e) => {
                this.speed = parseFloat(e.target.value);
            });
        }

        // Loop toggle
        if (this.dom.loopBtn) {
            this.dom.loopBtn.addEventListener("click", () => {
                this.isLooping = !this.isLooping;
                this.dom.loopBtn.classList.toggle("active", this.isLooping);
            });
        }

        // Camera mode buttons
        this.dom.camBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                this.dom.camBtns.forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
                this.vis.setCameraMode(btn.dataset.cam);
            });
        });

        // File Import button & input handling
        if (this.dom.fileInput) {
            this.dom.fileInput.addEventListener("click", () => {
                this.dom.fileInput.value = "";
            });
            this.dom.fileInput.addEventListener("change", (e) => {
                const file = e.target.files && e.target.files[0];
                if (file) {
                    this.loadFile(file);
                }
            });
        }

        if (this.dom.importBtn) {
            this.dom.importBtn.addEventListener("click", () => {
                if (this.dom.fileInput) {
                    this.dom.fileInput.value = "";
                    if (this.dom.importBtn.tagName !== "LABEL") {
                        this.dom.fileInput.click();
                    }
                }
            });
        }

        // Drag and Drop
        window.addEventListener("dragover", (e) => {
            e.preventDefault();
            if (this.dom.dropOverlay) this.dom.dropOverlay.classList.add("visible");
        });

        window.addEventListener("dragleave", (e) => {
            if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
                if (this.dom.dropOverlay) this.dom.dropOverlay.classList.remove("visible");
            }
        });

        window.addEventListener("drop", (e) => {
            e.preventDefault();
            if (this.dom.dropOverlay) this.dom.dropOverlay.classList.remove("visible");
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                this.loadFile(e.dataTransfer.files[0]);
            }
        });
    }

    stepEvent(direction) {
        if (!this.parser || !this.parser.events || this.parser.events.length === 0) {
            this.seek(this.currentTime + direction * 0.25);
            return;
        }

        if (direction > 0) {
            const nextEv = this.parser.events.find(e => e.time > this.currentTime + 0.08);
            if (nextEv) {
                this.seek(nextEv.time);
            } else {
                this.seek(Math.min(this.parser.meta.duration, this.currentTime + 0.25));
            }
        } else {
            const prevEvents = this.parser.events.filter(e => e.time < this.currentTime - 0.08);
            if (prevEvents.length > 0) {
                const prevEv = prevEvents[prevEvents.length - 1];
                this.seek(prevEv.time);
            } else {
                this.seek(Math.max(0, this.currentTime - 0.25));
            }
        }
    }

    loadFile(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target.result;
            if (this.onFileLoad) {
                this.onFileLoad(text, file.name);
            }
        };
        reader.onerror = (err) => {
            alert("Error reading file: " + err);
        };
        reader.readAsText(file);
    }

    showNotification(msg) {
        if (!this.dom.notification || !this.dom.notificationText) return;
        this.dom.notificationText.textContent = msg;
        this.dom.notification.classList.add("show");
        if (this.notificationTimeout) clearTimeout(this.notificationTimeout);
        this.notificationTimeout = setTimeout(() => {
            this.dom.notification.classList.remove("show");
        }, 4000);
    }

    onDataLoaded(fileName) {
        this.currentTime = 0;
        this.lastFrameTimestamp = performance.now();
        this.isPlaying = true;
        this.updatePlayState();

        // Update clean engineering title & secondary metadata
        if (this.dom.title) {
            this.dom.title.textContent = this.parser.getCleanTitle ? this.parser.getCleanTitle(fileName) : (this.parser.meta.title || "OpenRocket Flight Simulation");
        }
        if (this.dom.simDurationText) {
            const durStr = this.parser.meta.duration ? this.parser.meta.duration.toFixed(2) : "0.00";
            this.dom.simDurationText.textContent = `${durStr} s simulated flight`;
        }

        if (this.dom.scrubber) {
            this.dom.scrubber.max = this.parser.meta.duration || 1;
            this.dom.scrubber.value = 0;
        }

        // Build Milestone labels along timeline track
        this.renderMilestones();

        // Build Vertical Event List
        this.renderEventJumpList();

        // Pre-render state at t=0
        this.updateTelemetry(0);
        this.vis.update(0);

        if (this.audio) {
            this.audio.setFlightData(this.parser);
            this.audio.onReset();
            if (this.isPlaying) this.audio.onPlay(0);
        }

        // Show prominent toast notification
        const apogee = this.parser.meta.maxAltitude ? this.parser.meta.maxAltitude.toFixed(1) + "m" : "--";
        const dur = this.parser.meta.duration ? this.parser.meta.duration.toFixed(1) + "s" : "--";
        this.showNotification(`Loaded ${fileName || "flight"}: ${this.parser.records.length} data points (Apogee: ${apogee}, Time: ${dur})`);
    }

    renderMilestones() {
        if (!this.dom.milestonesContainer) return;
        this.dom.milestonesContainer.innerHTML = "";
        if (this.dom.markerDotsContainer) this.dom.markerDotsContainer.innerHTML = "";

        const duration = this.parser.meta.duration || 1;
        const keyEvents = [];

        // Select major milestone flight phases, prioritizing APOGEE
        const desired = ["IGNITION", "LIFTOFF", "BURNOUT", "APOGEE", "EJECTION_CHARGE", "GROUND_HIT"];
        desired.forEach(p => {
            const ev = this.parser.events.find(e => {
                if (p === "IGNITION") return e.name === "IGNITION" || e.name === "LAUNCH";
                if (p === "GROUND_HIT") return e.name === "GROUND_HIT" || e.name === "SIMULATION_END";
                return e.name === p;
            });
            if (ev) {
                // If EJECTION is too close to APOGEE, skip EJECTION so APOGEE always displays
                if (p === "EJECTION_CHARGE" && keyEvents.some(k => k.name === "APOGEE" && Math.abs(k.time - ev.time) < 1.0)) {
                    return;
                }
                if (!keyEvents.some(k => Math.abs(k.time - ev.time) < 0.25)) {
                    keyEvents.push(ev);
                }
            }
        });

        // Always ensure APOGEE is present
        if (!keyEvents.some(k => k.name === "APOGEE") && this.parser.meta.apogeeTime) {
            keyEvents.push({
                name: "APOGEE",
                time: this.parser.meta.apogeeTime,
                label: "Apogee Peak"
            });
        }

        // Ensure milestones are sorted chronologically
        keyEvents.sort((a, b) => a.time - b.time);

        let lastRenderedPct = -100;
        keyEvents.forEach(ev => {
            const pct = Math.min(98, Math.max(2, (ev.time / duration) * 100));

            // Small dot along the progress track for all milestones
            if (this.dom.markerDotsContainer) {
                const dot = document.createElement("div");
                dot.className = "track-milestone-dot";
                dot.style.left = `${pct}%`;
                this.dom.markerDotsContainer.appendChild(dot);
            }

            // Milestone header item above track with spacing collision avoidance
            if (pct - lastRenderedPct >= 5.5 || ev.name === "APOGEE" || ev.name.includes("GROUND")) {
                lastRenderedPct = pct;

                const item = document.createElement("div");
                item.className = "milestone-item";
                item.style.left = `${pct}%`;
                item.title = `Jump to ${ev.label} (${ev.time.toFixed(1)}s)`;

                let shortName = ev.label;
                if (ev.name.includes("IGNITION")) shortName = "Ignition";
                else if (ev.name.includes("LIFTOFF")) shortName = "Liftoff";
                else if (ev.name.includes("BURNOUT")) shortName = "Burnout";
                else if (ev.name.includes("EJECTION")) shortName = "Ejection";
                else if (ev.name.includes("APOGEE")) shortName = "Apogee";
                else if (ev.name.includes("GROUND") || ev.name.includes("END")) shortName = "Touchdown";

                item.innerHTML = `
                    <span class="milestone-name">${shortName}</span>
                    <span class="milestone-time">${ev.time.toFixed(1)}s</span>
                `;

                item.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this.seek(ev.time);
                });

                this.dom.milestonesContainer.appendChild(item);
            }
        });
    }

    renderEventJumpList() {
        if (!this.dom.eventJumpList) return;
        this.dom.eventJumpList.innerHTML = "";
        if (this.dom.eventCountBadge) {
            this.dom.eventCountBadge.textContent = "SIMULATED";
        }

        this.parser.events.forEach((ev, idx) => {
            const item = document.createElement("div");
            item.className = "event-item";
            item.setAttribute("data-time", ev.time.toFixed(3));
            item.setAttribute("data-index", idx);
            item.title = `Jump to ${ev.label} (t = ${ev.time.toFixed(2)}s)`;

            item.innerHTML = `
                <span class="event-time-tag">${ev.time.toFixed(1)}s</span>
                <span class="event-marker-dot"></span>
                <span class="event-name-tag">${ev.label}</span>
            `;

            item.addEventListener("click", () => {
                this.seek(ev.time);
            });
            this.dom.eventJumpList.appendChild(item);
        });
    }

    togglePlay() {
        // If simulation reached the end and user clicks Play, restart from beginning
        if (!this.isPlaying && this.currentTime >= (this.parser.meta.duration - 0.05)) {
            this.currentTime = 0;
            this.seek(0);
            if (this.audio) this.audio.onReset();
        }
        this.isPlaying = !this.isPlaying;
        this.updatePlayState();

        if (this.audio) {
            if (this.isPlaying) {
                this.audio.onPlay(this.currentTime);
            } else {
                this.audio.onPause();
            }
        }
    }

    updatePlayState() {
        if (this.isPlaying) {
            if (this.dom.playIcon) this.dom.playIcon.style.display = "none";
            if (this.dom.pauseIcon) this.dom.pauseIcon.style.display = "block";
        } else {
            if (this.dom.playIcon) this.dom.playIcon.style.display = "block";
            if (this.dom.pauseIcon) this.dom.pauseIcon.style.display = "none";
        }
    }

    resetPlayback() {
        this.currentTime = 0;
        this.seek(0);
        this.isPlaying = true;
        this.updatePlayState();
        if (this.audio) {
            this.audio.onReset();
            this.audio.onPlay(0);
        }
    }

    seek(time) {
        this.currentTime = Math.max(0, Math.min(time, this.parser.meta.duration));
        if (this.dom.scrubber) this.dom.scrubber.value = this.currentTime;
        this.updateTelemetry(this.currentTime);
        this.vis.update(this.currentTime);
        if (this.audio) {
            this.audio.onSeek(this.currentTime, this.isPlaying);
        }
    }

    /**
     * Main animation tick
     */
    tick(now) {
        const rawDelta = (now - this.lastFrameTimestamp) / 1000;
        this.lastFrameTimestamp = now;
        // Clamp delta to prevent huge jumps when browser window was unfocused or file dialog was open
        const delta = Math.min(Math.max(0, rawDelta), 0.1);

        if (this.isPlaying && this.parser.records.length > 0) {
            this.currentTime += delta * this.speed;

            if (this.currentTime >= this.parser.meta.duration) {
                if (this.isLooping) {
                    this.currentTime = 0;
                    if (this.audio) this.audio.onReset();
                } else {
                    this.currentTime = this.parser.meta.duration;
                    this.isPlaying = false;
                    this.updatePlayState();
                    if (this.audio) this.audio.onPlaybackEnd();
                }
            }

            if (this.dom.scrubber) this.dom.scrubber.value = this.currentTime;
            this.updateTelemetry(this.currentTime);
            this.vis.update(this.currentTime);
        }

        // Synchronize flight sound effects
        if (this.audio) {
            this.audio.update(this.currentTime, this.isPlaying, this.speed);
        }

        // Render 3D scene
        this.vis.render();

        requestAnimationFrame((t) => this.tick(t));
    }

    updateTelemetry(t) {
        const state = this.parser.sample(t);
        if (!state) return;

        // Scrubber progress bar visual
        const duration = this.parser.meta.duration || 1;
        const pct = (t / duration) * 100;
        if (this.dom.progressBar) this.dom.progressBar.style.width = `${pct}%`;
        const handle = document.getElementById("timeline-handle");
        if (handle) handle.style.left = `${pct}%`;

        // Time display
        if (this.dom.timeDisplay) this.dom.timeDisplay.textContent = `${t.toFixed(2)} s / ${duration.toFixed(2)} s`;

        // Telemetry numbers
        if (this.dom.altVal) this.dom.altVal.textContent = state.alt.toFixed(1);
        if (this.dom.maxAltVal) this.dom.maxAltVal.textContent = this.parser.meta.maxAltitude.toFixed(1);
        if (this.dom.vertVelVal) this.dom.vertVelVal.textContent = (state.vertVel >= 0 ? "+" : "") + state.vertVel.toFixed(1);
        if (this.dom.totalVelVal) this.dom.totalVelVal.textContent = state.totalVel.toFixed(1);
        if (this.dom.vertAccVal) this.dom.vertAccVal.textContent = state.vertAcc.toFixed(1);
        if (this.dom.gForceVal) this.dom.gForceVal.textContent = (state.totalAcc / 9.80665).toFixed(1);
        if (this.dom.thrustVal) this.dom.thrustVal.textContent = state.thrust.toFixed(1);
        if (this.dom.dragVal) this.dom.dragVal.textContent = state.drag.toFixed(2);
        if (this.dom.timeVal) this.dom.timeVal.textContent = t.toFixed(2);
        if (this.dom.driftVal) this.dom.driftVal.textContent = state.lateralDist.toFixed(1);
        if (this.dom.machVal) this.dom.machVal.textContent = state.mach.toFixed(2);

        // Flight Phase Badge & Timeline Phase Display
        const phase = this.parser.getFlightPhase(t);
        if (this.dom.timelinePhaseText) {
            this.dom.timelinePhaseText.textContent = phase.name;
            this.dom.timelinePhaseText.style.color = phase.color;
        }
        if (this.dom.phaseDot) {
            this.dom.phaseDot.style.color = phase.color;
        }

        // Highlight active / past / upcoming events in the flight event list
        if (this.dom.eventJumpList) {
            const items = this.dom.eventJumpList.querySelectorAll(".event-item");
            let activeIdx = -1;
            this.parser.events.forEach((ev, idx) => {
                if (ev.time <= t + 0.15) {
                    activeIdx = idx;
                }
            });

            items.forEach((el, idx) => {
                const evTime = parseFloat(el.getAttribute("data-time"));
                el.classList.remove("active", "passed", "upcoming");
                if (idx === activeIdx) {
                    el.classList.add("active");
                } else if (evTime < t) {
                    el.classList.add("passed");
                } else {
                    el.classList.add("upcoming");
                }
            });
        }
    }
}
