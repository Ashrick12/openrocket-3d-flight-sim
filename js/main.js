/**
 * Application Entry Point
 * Orchestrates Parser, 3D Visualizer, and UI Controller.
 */

import { OpenRocketParser } from "./parser.js";
import { RocketVisualizer } from "./visualizer.js";
import { FlightAudioManager } from "./audio.js";
import { UIController } from "./ui.js";
import { DEFAULT_FLIGHT_CSV } from "../data/default_flight.js";
import { SIM1_CSV } from "../data/sim1.js";
import { F32T_CSV } from "../data/f32t.js";

document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById("canvas-container");
    const visualizer = new RocketVisualizer(container);
    const audioManager = new FlightAudioManager();
    const parser = new OpenRocketParser();

    // Callback when user drags or imports a new CSV
    const handleNewFlightData = (csvText, fileName) => {
        try {
            parser.parse(csvText);
            if (!parser.records || parser.records.length === 0) {
                throw new Error("No flight data points could be found in the file. Please ensure it is an OpenRocket export containing Time and Altitude.");
            }
            visualizer.loadTrajectory(parser);
            ui.onDataLoaded(fileName);

            // Update preset selector to show the active file
            const presetSelect = document.getElementById("preset-select");
            if (presetSelect) {
                if (fileName === "sim1.csv" || fileName === "D12-3 Default") {
                    presetSelect.value = "default";
                } else if (fileName === "sim1 (F32T 87s)") {
                    presetSelect.value = "sim1";
                } else if (fileName === "f32t no angle.csv") {
                    presetSelect.value = "f32t";
                } else {
                    let customOpt = presetSelect.querySelector("option[data-custom='true']");
                    if (!customOpt) {
                        customOpt = document.createElement("option");
                        customOpt.setAttribute("data-custom", "true");
                        presetSelect.appendChild(customOpt);
                    }
                    customOpt.value = "custom";
                    customOpt.textContent = fileName;
                    presetSelect.value = "custom";
                }
            }

            console.log(`Loaded flight: ${fileName || parser.meta.title} (${parser.records.length} data points)`);
        } catch (err) {
            console.error("Failed to parse OpenRocket CSV:", err);
            alert("Error importing flight data:\n" + err.message);
        }
    };

    const ui = new UIController(visualizer, parser, handleNewFlightData, audioManager);
    window.visualizer = visualizer;
    window.audioManager = audioManager;
    window.ui = ui;
    window.parser = parser;

    // Preset dropdown handler
    const presetSelect = document.getElementById("preset-select");
    if (presetSelect) {
        presetSelect.addEventListener("change", (e) => {
            if (e.target.value === "default") {
                handleNewFlightData(DEFAULT_FLIGHT_CSV, "sim1.csv");
            } else if (e.target.value === "sim1") {
                handleNewFlightData(SIM1_CSV, "sim1 (F32T 87s)");
            } else if (e.target.value === "f32t") {
                handleNewFlightData(F32T_CSV, "f32t no angle.csv");
            }
        });
    }

    // Default load D12-3 flight simulation as sim1.csv (matching reference UI)
    handleNewFlightData(DEFAULT_FLIGHT_CSV, "sim1.csv");

    // Start 60fps render loop
    requestAnimationFrame((t) => ui.tick(t));
});
