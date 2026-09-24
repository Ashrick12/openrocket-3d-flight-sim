/**
 * OpenRocket 3D Flight Visualizer - Synchronized Audio System
 * Uses Web Audio API with procedural acoustic synthesis.
 * Fully offline and zero-CORS ready (no external audio assets required).
 */

export class FlightAudioManager {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.compressor = null;
        this.motorGain = null;
        this.windGain = null;
        this.motorSource = null;
        this.windSource = null;

        // Preloaded synthesized AudioBuffers
        this.buffers = {};

        // Tracking active one-shot nodes for instant cancellation
        this.activeOneShots = new Set();

        // Audio state
        this.volume = 0.70;
        this.isMuted = false;
        this.isPlaying = false;
        this.lastTime = 0;
        this.firedEvents = new Set();
        this.flightData = null;

        // DOM elements
        this.soundBtn = null;
        this.volumeSlider = null;
        this.iconOn = null;
        this.iconOff = null;
    }

    /**
     * Attaches UI control elements
     */
    initUI(soundBtn, volumeSlider, iconOn, iconOff) {
        this.soundBtn = soundBtn;
        this.volumeSlider = volumeSlider;
        this.iconOn = iconOn;
        this.iconOff = iconOff;

        if (this.soundBtn) {
            this.soundBtn.addEventListener("click", () => {
                this.ensureAudioContext();
                this.toggleMute();
            });
        }

        if (this.volumeSlider) {
            this.volumeSlider.addEventListener("input", (e) => {
                this.ensureAudioContext();
                this.setVolume(parseFloat(e.target.value));
            });
        }

        this.updateUI();
    }

    /**
     * Initializes AudioContext upon user gesture
     */
    ensureAudioContext() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return null;
            this.ctx = new AudioCtx();
            this.buildAudioGraph();
            this.synthesizeBuffers();
            this.startContinuousLoops();
        }
        if (this.ctx && this.ctx.state === "suspended") {
            this.ctx.resume();
        }
        return this.ctx;
    }

    /**
     * Builds master routing graph with dynamics compressor/limiter
     */
    buildAudioGraph() {
        if (!this.ctx) return;

        // Dynamics compressor to guarantee clean headroom and prevent clipping
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.setValueAtTime(-4, this.ctx.currentTime);
        this.compressor.knee.setValueAtTime(8, this.ctx.currentTime);
        this.compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
        this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
        this.compressor.release.setValueAtTime(0.15, this.ctx.currentTime);
        this.compressor.connect(this.ctx.destination);

        // Master Gain Node
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
        this.masterGain.connect(this.compressor);

        // Motor Thrust Gain Node (routes to master)
        this.motorGain = this.ctx.createGain();
        this.motorGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.motorGain.connect(this.masterGain);

        // Wind / Airflow Gain Node (routes to master)
        this.windGain = this.ctx.createGain();
        this.windGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.windGain.connect(this.masterGain);
    }

    /**
     * Procedurally synthesizes realistic aerospace sound buffers
     */
    synthesizeBuffers() {
        if (!this.ctx) return;
        const sr = this.ctx.sampleRate;

        // 1. Ignition Sound Buffer (0.45s): spark crackle followed by rapid flame rush
        const ignLen = Math.floor(sr * 0.45);
        const ignBuf = this.ctx.createBuffer(1, ignLen, sr);
        const ignData = ignBuf.getChannelData(0);
        let b0 = 0, b1 = 0;
        for (let i = 0; i < ignLen; i++) {
            const t = i / sr;
            const white = Math.random() * 2 - 1;
            b0 = 0.95 * b0 + white * 0.05;
            b1 = 0.85 * b1 + white * 0.15;
            let env = 0;
            if (t < 0.08) {
                env = (t / 0.08) * 0.35 + (Math.random() > 0.93 ? 0.35 : 0);
            } else if (t < 0.22) {
                env = 0.35 + ((t - 0.08) / 0.14) * 0.65;
            } else {
                env = Math.max(0, 1.0 - ((t - 0.22) / 0.23));
            }
            ignData[i] = (b0 * 0.6 + (white - b1) * 0.4) * env * 0.7;
        }
        this.buffers.ignition = ignBuf;

        // 2. Motor Continuous Looping Buffer (2.0s): deep resonant acoustic combustion rumble & hiss
        const motLen = Math.floor(sr * 2.0);
        const motBuf = this.ctx.createBuffer(1, motLen, sr);
        const motData = motBuf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < motLen; i++) {
            const t = i / sr;
            const white = Math.random() * 2 - 1;
            last = (last + (0.045 * white)) / 1.045;
            const combustion = Math.sin(2 * Math.PI * 48 * t) * 0.14 + Math.sin(2 * Math.PI * 96 * t + 0.8) * 0.09;
            const hiss = (white - last) * 0.16;
            motData[i] = (last * 1.7 + combustion + hiss) * 0.55;
        }
        // Seamless crossfade boundary
        const xfadeM = Math.floor(sr * 0.06);
        for (let i = 0; i < xfadeM; i++) {
            const p = i / xfadeM;
            motData[i] = motData[i] * p + motData[motLen - xfadeM + i] * (1 - p);
        }
        this.buffers.motor = motBuf;

        // 3. Ejection Charge Sound Buffer (0.35s): sharp pyrotechnic pop & hollow body resonance
        const ejLen = Math.floor(sr * 0.35);
        const ejBuf = this.ctx.createBuffer(1, ejLen, sr);
        const ejData = ejBuf.getChannelData(0);
        for (let i = 0; i < ejLen; i++) {
            const t = i / sr;
            const env = Math.exp(-t * 24);
            const freq = 175 * Math.exp(-t * 22) + 55;
            const pop = Math.sin(2 * Math.PI * freq * t);
            const noise = (Math.random() * 2 - 1) * Math.exp(-t * 40);
            ejData[i] = (pop * 0.7 + noise * 0.35) * env * 0.85;
        }
        this.buffers.ejection = ejBuf;

        // 4. Parachute Deployment Buffer (0.50s): fabric whip snap followed by canopy billow whoosh
        const chLen = Math.floor(sr * 0.50);
        const chBuf = this.ctx.createBuffer(1, chLen, sr);
        const chData = chBuf.getChannelData(0);
        let lp = 0;
        for (let i = 0; i < chLen; i++) {
            const t = i / sr;
            const white = Math.random() * 2 - 1;
            lp = 0.88 * lp + white * 0.12;
            const snap = (t < 0.04) ? Math.sin((t / 0.04) * Math.PI) * (white * 0.75 + (white - lp) * 0.55) : 0;
            const billowEnv = (t >= 0.03 && t <= 0.45) ? Math.sin(((t - 0.03) / 0.42) * Math.PI) : 0;
            const billow = lp * billowEnv * 0.6;
            chData[i] = (snap * 0.65 + billow) * 0.75;
        }
        this.buffers.parachute = chBuf;

        // 5. Descent Airflow / Wind Looping Buffer (3.0s): soft, gentle ambient air rush
        const wLen = Math.floor(sr * 3.0);
        const wBuf = this.ctx.createBuffer(1, wLen, sr);
        const wData = wBuf.getChannelData(0);
        let wf0 = 0, wf1 = 0;
        for (let i = 0; i < wLen; i++) {
            const white = Math.random() * 2 - 1;
            wf0 = 0.96 * wf0 + white * 0.04;
            wf1 = 0.90 * wf1 + white * 0.10;
            wData[i] = (wf0 * 0.75 + (wf1 - wf0) * 0.25) * 0.4;
        }
        // Seamless crossfade boundary
        const xfadeW = Math.floor(sr * 0.06);
        for (let i = 0; i < xfadeW; i++) {
            const p = i / xfadeW;
            wData[i] = wData[i] * p + wData[wLen - xfadeW + i] * (1 - p);
        }
        this.buffers.wind = wBuf;

        // 6. Landing / Touchdown Buffer (0.30s): restrained, lightweight model rocket turf thud
        const lLen = Math.floor(sr * 0.30);
        const lBuf = this.ctx.createBuffer(1, lLen, sr);
        const lData = lBuf.getChannelData(0);
        for (let i = 0; i < lLen; i++) {
            const t = i / sr;
            const env = Math.exp(-t * 26);
            const freq = 85 * Math.exp(-t * 20) + 38;
            const thud = Math.sin(2 * Math.PI * freq * t);
            const grass = (Math.random() * 2 - 1) * Math.exp(-t * 18) * 0.3;
            lData[i] = (thud * 0.65 + grass) * env * 0.55;
        }
        this.buffers.landing = lBuf;
    }

    /**
     * Starts continuous looping sources for motor and wind
     */
    startContinuousLoops() {
        if (!this.ctx || !this.buffers.motor || !this.buffers.wind) return;

        // Stop existing if any
        this.stopContinuousLoops();

        // 1. Motor loop
        this.motorSource = this.ctx.createBufferSource();
        this.motorSource.buffer = this.buffers.motor;
        this.motorSource.loop = true;
        this.motorSource.connect(this.motorGain);
        this.motorSource.start(0);

        // 2. Wind loop
        this.windSource = this.ctx.createBufferSource();
        this.windSource.buffer = this.buffers.wind;
        this.windSource.loop = true;
        this.windSource.connect(this.windGain);
        this.windSource.start(0);
    }

    /**
     * Stops continuous looping sources
     */
    stopContinuousLoops() {
        if (this.motorSource) {
            try { this.motorSource.stop(); } catch (e) {}
            this.motorSource.disconnect();
            this.motorSource = null;
        }
        if (this.windSource) {
            try { this.windSource.stop(); } catch (e) {}
            this.windSource.disconnect();
            this.windSource = null;
        }
    }

    /**
     * Plays a one-shot sound buffer
     */
    playOneShot(name, gainScale = 1.0) {
        if (!this.ctx || this.isMuted || !this.buffers[name]) return;
        if (this.ctx.state === "suspended") this.ctx.resume();

        const src = this.ctx.createBufferSource();
        src.buffer = this.buffers[name];

        const gainNode = this.ctx.createGain();
        gainNode.gain.setValueAtTime(gainScale, this.ctx.currentTime);

        src.connect(gainNode);
        gainNode.connect(this.masterGain);

        this.activeOneShots.add(src);
        src.onended = () => {
            this.activeOneShots.delete(src);
            try {
                src.disconnect();
                gainNode.disconnect();
            } catch (e) {}
        };

        src.start(0);
    }

    /**
     * Immediately cancels all active one-shot sound effects
     */
    stopAllOneShots() {
        this.activeOneShots.forEach(src => {
            try { src.stop(); } catch (e) {}
            try { src.disconnect(); } catch (e) {}
        });
        this.activeOneShots.clear();
    }

    /**
     * Assigns active flight data parser
     */
    setFlightData(flightData) {
        this.flightData = flightData;
        this.firedEvents.clear();
        this.lastTime = 0;
    }

    /**
     * Helper to safely set gain value on AudioParam with fallback
     */
    setGain(gainNode, val, smooth = true) {
        if (!gainNode || !this.ctx) return;
        const target = Math.max(0, val);
        if (smooth && this.ctx.state === "running") {
            try {
                gainNode.gain.setTargetAtTime(target, this.ctx.currentTime, 0.04);
            } catch (e) {}
        } else {
            try {
                gainNode.gain.setValueAtTime(target, this.ctx.currentTime);
            } catch (e) {}
        }
        gainNode.gain.value = target;
    }

    /**
     * Master volume control (0.0 to 1.0)
     */
    setVolume(val) {
        this.volume = Math.max(0, Math.min(1, val));
        this.setGain(this.masterGain, this.isMuted ? 0 : this.volume, true);
        this.updateUI();
    }

    /**
     * Mute / Unmute toggle
     */
    toggleMute() {
        this.isMuted = !this.isMuted;
        this.setGain(this.masterGain, this.isMuted ? 0 : this.volume, true);
        this.updateUI();
    }

    updateUI() {
        if (this.volumeSlider) {
            this.volumeSlider.value = this.volume;
        }
        if (this.iconOn && this.iconOff) {
            if (this.isMuted || this.volume === 0) {
                this.iconOn.style.display = "none";
                this.iconOff.style.display = "block";
                if (this.soundBtn) this.soundBtn.classList.add("muted");
            } else {
                this.iconOn.style.display = "block";
                this.iconOff.style.display = "none";
                if (this.soundBtn) this.soundBtn.classList.remove("muted");
            }
        }
    }

    /**
     * Playback started / resumed
     */
    onPlay(t) {
        this.ensureAudioContext();
        this.isPlaying = true;
        this.lastTime = t || 0;
        if (!this.motorSource || !this.windSource) {
            this.startContinuousLoops();
        }
    }

    /**
     * Playback paused
     */
    onPause() {
        this.isPlaying = false;
        this.stopAllOneShots();
        this.setGain(this.motorGain, 0, false);
        this.setGain(this.windGain, 0, false);
    }

    /**
     * Scrubbed timeline to new time t
     */
    onSeek(t, isPlaying) {
        this.stopAllOneShots();
        this.lastTime = t;
        this.firedEvents.clear();

        // Mark past events as already fired so they don't replay
        if (this.flightData && this.flightData.events) {
            this.flightData.events.forEach(ev => {
                if (ev.time <= t) {
                    this.firedEvents.add(ev.name);
                }
            });
        }
        // Also mark key milestones if past
        if (this.flightData && this.flightData.meta) {
            if (t >= 0.05) this.firedEvents.add("IGNITION");
            if (t >= (this.flightData.meta.burnoutTime || 1.65)) this.firedEvents.add("BURNOUT");
            const deployT = this.flightData.meta.deployTime || this.flightData.meta.apogeeTime || 4.65;
            if (t >= deployT) {
                this.firedEvents.add("EJECTION_CHARGE");
                this.firedEvents.add("EJECTION");
                this.firedEvents.add("PARACHUTE_DEPLOYED");
                this.firedEvents.add("PARACHUTE");
            }
            if (t >= (this.flightData.meta.flightTime || this.flightData.meta.landingTime || this.flightData.meta.duration || 26.89)) {
                this.firedEvents.add("GROUND_HIT");
                this.firedEvents.add("LANDING");
            }
        }

        // Immediately update continuous sound gains to match new timestamp
        this.update(t, isPlaying, 1.0);
    }

    /**
     * Playback reset to 0 (restart or loop)
     */
    onReset() {
        this.stopAllOneShots();
        this.firedEvents.clear();
        this.lastTime = 0;
        this.setGain(this.motorGain, 0, false);
        this.setGain(this.windGain, 0, false);
        if (!this.motorSource || !this.windSource) {
            this.startContinuousLoops();
        }
    }

    /**
     * Simulation reached final timestamp (Loop OFF)
     */
    onPlaybackEnd() {
        this.isPlaying = false;
        this.stopAllOneShots();
        this.setGain(this.motorGain, 0, false);
        this.setGain(this.windGain, 0, false);
    }

    /**
     * Main animation frame audio update
     * Synchronizes events, motor thrust gain, and descent wind
     */
    update(t, isPlaying, speed = 1.0) {
        if (!this.ctx || !this.flightData) return;

        // If not playing, keep continuous gains muted
        if (!isPlaying) {
            this.setGain(this.motorGain, 0, false);
            this.setGain(this.windGain, 0, false);
            return;
        }

        const meta = this.flightData.meta;
        const deployT = meta.deployTime || meta.apogeeTime || 4.65;
        const burnoutT = meta.burnoutTime || 1.65;
        const durationT = meta.flightTime || meta.landingTime || meta.duration || 26.89;
        const state = this.flightData.sample(t);

        // Ensure loops are active if playing
        if (!this.motorSource || !this.windSource) {
            this.startContinuousLoops();
        }

        // --- 1. EVENT DETECTION (Forward playback crossing) ---
        if (t > this.lastTime) {
            // A. Ignition / Launch
            if (t >= 0.0 && this.lastTime <= 0.08 && !this.firedEvents.has("IGNITION")) {
                this.firedEvents.add("IGNITION");
                this.playOneShot("ignition", 0.85);
            }

            // B. Ejection Charge
            const ejectionEv = this.flightData.events ? this.flightData.events.find(e => e.name.includes("EJECTION")) : null;
            const ejectionT = ejectionEv ? ejectionEv.time : deployT;
            if (this.lastTime <= ejectionT && t >= ejectionT && !this.firedEvents.has("EJECTION")) {
                this.firedEvents.add("EJECTION");
                this.playOneShot("ejection", 0.90);
            }

            // C. Parachute Deployment
            const chuteEv = this.flightData.events ? this.flightData.events.find(e => e.name.includes("PARACHUTE") || e.name.includes("RECOVERY") || e.name.includes("DEPLOYMENT")) : null;
            const chuteT = chuteEv ? chuteEv.time : deployT;
            if (this.lastTime <= chuteT && t >= chuteT && !this.firedEvents.has("PARACHUTE")) {
                this.firedEvents.add("PARACHUTE");
                this.playOneShot("parachute", 0.80);
            }

            // D. Ground Touchdown / Landing
            const landingT = meta.landingTime || durationT;
            if (this.lastTime <= landingT && t >= landingT && !this.firedEvents.has("LANDING")) {
                this.firedEvents.add("LANDING");
                this.playOneShot("landing", 0.65);
            }
        }
        this.lastTime = t;

        // --- 2. CONTINUOUS SOUND LAYERS ---
        if (!state) return;

        // A. Motor Thrust (Powered Ascent: t < burnoutT)
        const isThrusting = t < burnoutT && state.thrust > 0.05;
        if (isThrusting) {
            const maxThrust = meta.maxThrust || 28.0;
            const normalizedThrust = Math.min(1.0, state.thrust / Math.max(8.0, maxThrust * 0.7));
            // Low/medium volume realistic motor thrust rumble
            const targetMotor = 0.22 + 0.68 * normalizedThrust;
            this.setGain(this.motorGain, targetMotor, true);
        } else {
            // Cutoff / Coast / Descent: Motor silent
            this.setGain(this.motorGain, 0, true);
        }

        // B. Airflow / Wind Ambience
        const isDescent = t >= deployT && t < durationT && state.alt > 0.05;
        const isCoast = t >= burnoutT && t < deployT;

        if (isDescent) {
            // Subtle descent airflow responding to descent rate and wind velocity
            const airSpeed = Math.abs(state.vertVel || 0) + (state.windVel || 0) * 0.35;
            // Weak wind = barely audible (0.04), stronger wind = slightly more pronounced (0.24 max)
            const targetWind = Math.min(0.24, 0.035 + (airSpeed / 12.0) * 0.16);
            this.setGain(this.windGain, targetWind, true);
        } else if (isCoast) {
            // Faint high-speed coast airflow whisper
            const coastSpeed = Math.min(0.10, (state.totalVel || 0) * 0.0015);
            this.setGain(this.windGain, coastSpeed, true);
        } else {
            // On pad or landed: silent
            this.setGain(this.windGain, 0, false);
        }
    }
}
