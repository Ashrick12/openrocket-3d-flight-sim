/**
 * OpenRocket CSV Parser & Interpolator
 * Handles comments, metadata, flight events, and variable column layouts.
 */

export class OpenRocketParser {
    constructor() {
        this.rawText = "";
        this.headers = [];
        this.colMap = {};
        this.records = [];
        this.events = [];
        this.delimiter = ",";
        this.meta = {
            title: "OpenRocket Simulation",
            pointsCount: 0,
            variablesCount: 0,
            duration: 0,
            maxAltitude: 0,
            maxVelocity: 0,
            maxAcceleration: 0,
            burnoutTime: 0,
            apogeeTime: 0,
            deployTime: 0,
            landingTime: 0
        };
    }

    /**
     * Detects delimiter from sample lines
     */
    detectDelimiter(csvText) {
        const lines = csvText.split(/\r?\n/).slice(0, 20);
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.toLowerCase().includes("time") || (!trimmed.startsWith("#") && trimmed.length > 5)) {
                const commas = (trimmed.match(/,/g) || []).length;
                const semicolons = (trimmed.match(/;/g) || []).length;
                const tabs = (trimmed.match(/\t/g) || []).length;
                if (semicolons > commas && semicolons > tabs) return ';';
                if (tabs > commas && tabs > semicolons) return '\t';
                return ',';
            }
        }
        return ',';
    }

    /**
     * Parses OpenRocket CSV string
     * @param {string} csvText
     * @returns {OpenRocketParser}
     */
    parse(csvText) {
        this.rawText = csvText;
        this.records = [];
        this.events = [];
        this.headers = [];
        this.colMap = {};
        this.delimiter = this.detectDelimiter(csvText);
        this.meta = {
            title: "OpenRocket Simulation",
            pointsCount: 0,
            variablesCount: 0,
            duration: 0,
            flightTime: 0,
            maxAltitude: 0,
            maxVelocity: 0,
            maxAcceleration: 0,
            burnoutTime: 0,
            apogeeTime: 0,
            deployTime: 0,
            landingTime: 0
        };

        const lines = csvText.split(/\r?\n/);
        let headerLine = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const isComment = line.startsWith("#");
            const cleanLine = isComment ? line.substring(1).trim() : line;
            const lowerLine = cleanLine.toLowerCase();

            // Check for simulation title in initial comment
            if (isComment && i === 0 && !lowerLine.startsWith("time") && !lowerLine.startsWith("event")) {
                this.meta.title = cleanLine.replace(/[\(\[]?\s*up to date\s*[\)\]]?/gi, "").trim();
            }

            // Check for event comments: e.g. "# Event LIFTOFF occurred at t=0.126 seconds"
            if (isComment) {
                const eventMatch = cleanLine.match(/Event\s+([A-Za-z0-9_]+)\s+occurred\s+at\s+t\s*=\s*([0-9.]+)\s*seconds?/i);
                if (eventMatch) {
                    const eventName = eventMatch[1].toUpperCase();
                    const eventTime = parseFloat(eventMatch[2]);
                    this.events.push({
                        name: eventName,
                        time: eventTime,
                        label: this.formatEventLabel(eventName),
                        line: i
                    });
                }
            }

            // Check for header line: must contain the delimiter and "time" plus "alt" or "vel"
            if (!headerLine && cleanLine.includes(this.delimiter) && lowerLine.includes("time") && (lowerLine.includes("alt") || lowerLine.includes("vel") || lowerLine.includes("pos") || lowerLine.includes("speed"))) {
                headerLine = cleanLine;
                this.headers = this.splitCSVLine(cleanLine, this.delimiter).map(h => this.cleanHeader(h));
                this.buildColumnMap();
                continue;
            }

            // If header was not yet encountered, skip until header is found
            if (!headerLine) continue;

            // Skip any other comment lines
            if (isComment) continue;

            const values = this.splitCSVLine(line, this.delimiter);
            if (values.length < 2) continue;

            const record = this.extractRecord(values);
            if (record && !isNaN(record.time)) {
                this.records.push(record);
            }
        }

        // Sort records by time
        this.records.sort((a, b) => a.time - b.time);

        // Sort events by time
        this.events.sort((a, b) => a.time - b.time);

        // Calculate summary metrics
        this.calculateMetrics();

        return this;
    }

    /**
     * Splits CSV row respecting quotes and custom delimiter
     */
    splitCSVLine(line, delimiter = ",") {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === delimiter && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    }

    /**
     * Cleans up header string and removes non-standard characters
     */
    cleanHeader(header) {
        return header
            .replace(/[^\x20-\x7E]+/g, '') // remove non-ascii
            .trim()
            .toLowerCase();
    }

    /**
     * Maps known variables to column indices
     */
    buildColumnMap() {
        this.colMap = {};
        this.headers.forEach((h, idx) => {
            // Elapsed simulation time (MUST NOT match computation time or time step)
            if (this.colMap.time === undefined) {
                if (h === "time" || h === "time (s)" || h === "# time (s)" || h === "t" || 
                   (h.startsWith("time") && !h.includes("step") && !h.includes("computation") && !h.includes("cpu"))) {
                    this.colMap.time = idx;
                }
            }

            // Altitude (MUST NOT match altitude above sea level)
            if (this.colMap.alt === undefined) {
                if (h === "altitude" || h === "altitude (m)" || h === "alt" || 
                   (h.startsWith("altitude") && !h.includes("sea") && !h.includes("asl"))) {
                    this.colMap.alt = idx;
                }
            }

            if (h.includes("altitude above sea level") || h.includes("alt asl")) this.colMap.altASL = idx;
            else if (h.includes("vertical velocity") || h === "vert vel" || h === "vz") this.colMap.vertVel = idx;
            else if (h.includes("total velocity") || (h.includes("velocity") && !h.includes("vertical") && !h.includes("lateral") && !h.includes("wind")) || h === "speed") this.colMap.totalVel = idx;
            else if (h.includes("vertical acceleration") || h === "vert acc") this.colMap.vertAcc = idx;
            else if (h.includes("total acceleration") || (h.includes("acceleration") && !h.includes("vertical") && !h.includes("lateral") && !h.includes("coriolis") && !h.includes("gravitational"))) this.colMap.totalAcc = idx;
            else if (h.includes("position east") || h.includes("east of launch") || h.includes("pos x") || h === "x") this.colMap.posX = idx;
            else if (h.includes("position north") || h.includes("north of launch") || h.includes("pos z") || h.includes("pos y") || h === "y" || h === "z") this.colMap.posZ = idx;
            else if (h.includes("lateral distance")) this.colMap.lateralDist = idx;
            else if (h.includes("lateral direction")) this.colMap.lateralDir = idx;
            else if (h.includes("lateral velocity")) this.colMap.lateralVel = idx;
            else if (h.includes("lateral acceleration")) this.colMap.lateralAcc = idx;
            else if (this.colMap.aoa === undefined && (h.includes("angle of attack") || h.includes("aoa"))) this.colMap.aoa = idx;
            else if (this.colMap.zenith === undefined && (h.includes("vertical orientation") || h.includes("zenith") || h === "pitch" || (h.startsWith("pitch") && !h.includes("rate") && !h.includes("moment") && !h.includes("damping")))) this.colMap.zenith = idx;
            else if (this.colMap.azimuth === undefined && (h.includes("lateral orientation") || h.includes("azimuth") || h === "yaw" || h === "heading" || (h.startsWith("yaw") && !h.includes("rate") && !h.includes("moment") && !h.includes("damping")))) this.colMap.azimuth = idx;
            else if (h.includes("motor mass")) this.colMap.motorMass = idx;
            else if (h.startsWith("mass")) this.colMap.mass = idx;
            else if (h.startsWith("thrust") && !h.includes("ratio") && !h.includes("weight")) this.colMap.thrust = idx;
            else if (h.includes("thrust-to-weight") || h.includes("twr")) this.colMap.twr = idx;
            else if (h.startsWith("drag force") || h === "drag") this.colMap.drag = idx;
            else if (h.includes("mach")) this.colMap.mach = idx;
            else if (h.includes("wind velocity") || h.includes("wind speed")) this.colMap.windVel = idx;
            else if (h.includes("wind direction")) this.colMap.windDir = idx;
        });

        // Smart fallbacks
        if (this.colMap.time === undefined) this.colMap.time = 0;
        if (this.colMap.alt === undefined) {
            const altIdx = this.headers.findIndex(h => h.includes("alt") || h.includes("height"));
            this.colMap.alt = altIdx !== -1 ? altIdx : 1;
        }
    }

    /**
     * Extracts and normalizes record object from tokens
     */
    extractRecord(values) {
        const getNum = (key, defaultVal = 0) => {
            const idx = this.colMap[key];
            if (idx === undefined || idx >= values.length) return defaultVal;
            let raw = values[idx].trim();
            // Handle European decimal comma if delimiter is semicolon
            if (this.delimiter === ';' && raw.includes(',')) {
                raw = raw.replace(',', '.');
            }
            const val = parseFloat(raw);
            return isNaN(val) ? defaultVal : val;
        };

        const time = getNum("time");
        const alt = getNum("alt");
        const posX = getNum("posX", 0); // East
        const posZ = getNum("posZ", 0); // North
        const vertVel = getNum("vertVel");
        const totalVel = getNum("totalVel", Math.abs(vertVel));
        const vertAcc = getNum("vertAcc");
        const totalAcc = getNum("totalAcc", Math.abs(vertAcc));
        const thrust = getNum("thrust");
        const drag = getNum("drag");
        const zenith = getNum("zenith", 85);
        const azimuth = getNum("azimuth", 90);
        const lateralDist = getNum("lateralDist", Math.hypot(posX, posZ));
        const mass = getNum("mass");
        const mach = getNum("mach");
        const windVel = getNum("windVel");

        return {
            time,
            alt,
            posX,
            posZ,
            vertVel,
            totalVel,
            vertAcc,
            totalAcc,
            thrust,
            drag,
            zenith,
            azimuth,
            lateralDist,
            mass,
            mach,
            windVel
        };
    }

    /**
     * Computes high-level flight stats
     */
    calculateMetrics() {
        if (this.records.length === 0) return;

        let maxAlt = 0;
        let maxVel = 0;
        let maxAcc = 0;
        let apogeeTime = 0;

        for (const r of this.records) {
            if (r.alt > maxAlt) {
                maxAlt = r.alt;
                apogeeTime = r.time;
            }
            if (r.totalVel > maxVel) maxVel = r.totalVel;
            if (r.totalAcc > maxAcc) maxAcc = r.totalAcc;
        }

        this.meta.duration = this.records[this.records.length - 1].time;
        this.meta.flightTime = this.meta.duration;
        this.meta.pointsCount = this.records.length;
        this.meta.maxAltitude = maxAlt;
        this.meta.maxVelocity = maxVel;
        this.meta.maxAcceleration = maxAcc;
        this.meta.apogeeTime = apogeeTime;

        // Find standard event times
        for (const ev of this.events) {
            if (ev.name.includes("BURNOUT")) this.meta.burnoutTime = ev.time;
            if (ev.name.includes("APOGEE")) this.meta.apogeeTime = ev.time;
            if (ev.name.includes("GROUND") || ev.name.includes("LANDING") || ev.name.includes("HIT")) {
                this.meta.landingTime = ev.time;
            }
        }

        if (this.meta.landingTime) {
            this.meta.flightTime = this.meta.landingTime;
        }

        // Parachute deployment: prioritize physical deployment/recovery device event over ejection charge
        const deployEv = this.events.find(e => e.name.includes("RECOVERY") || e.name.includes("DEPLOYMENT") || e.name.includes("PARACHUTE"));
        const ejectionEv = this.events.find(e => e.name.includes("EJECTION"));
        if (deployEv) {
            this.meta.deployTime = deployEv.time;
        } else if (ejectionEv) {
            this.meta.deployTime = ejectionEv.time;
        } else {
            this.meta.deployTime = this.meta.apogeeTime;
        }

        // Fallbacks
        if (!this.meta.burnoutTime) {
            let lastThrustRecord = null;
            for (const r of this.records) {
                if (r.thrust > 0.1) lastThrustRecord = r;
            }
            if (lastThrustRecord) this.meta.burnoutTime = lastThrustRecord.time;
        }

        if (!this.meta.deployTime) {
            // Default deploy near apogee if not explicitly marked
            this.meta.deployTime = this.meta.apogeeTime || 4.65;
        }
    }

    /**
     * Interpolates flight state at any given timestamp t
     * @param {number} t Time in seconds
     */
    sample(t) {
        if (this.records.length === 0) return null;

        if (t <= this.records[0].time) return this.records[0];
        if (t >= this.records[this.records.length - 1].time) {
            return this.records[this.records.length - 1];
        }

        let low = 0;
        let high = this.records.length - 1;
        while (low <= high) {
            const mid = (low + high) >> 1;
            if (this.records[mid].time < t) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        const r0 = this.records[low - 1];
        const r1 = this.records[low];
        if (!r1) return r0;

        const factor = (t - r0.time) / (r1.time - r0.time);
        const lerp = (a, b) => a + (b - a) * factor;

        return {
            time: t,
            alt: lerp(r0.alt, r1.alt),
            posX: lerp(r0.posX, r1.posX),
            posZ: lerp(r0.posZ, r1.posZ),
            vertVel: lerp(r0.vertVel, r1.vertVel),
            totalVel: lerp(r0.totalVel, r1.totalVel),
            vertAcc: lerp(r0.vertAcc, r1.vertAcc),
            totalAcc: lerp(r0.totalAcc, r1.totalAcc),
            thrust: lerp(r0.thrust, r1.thrust),
            drag: lerp(r0.drag, r1.drag),
            zenith: lerp(r0.zenith, r1.zenith),
            azimuth: lerp(r0.azimuth, r1.azimuth),
            lateralDist: lerp(r0.lateralDist, r1.lateralDist),
            mass: lerp(r0.mass, r1.mass),
            mach: lerp(r0.mach, r1.mach),
            windVel: lerp(r0.windVel, r1.windVel)
        };
    }

    /**
     * Determines current flight phase at time t
     */
    getFlightPhase(t) {
        if (t <= 0) return { name: "Pad Ready", color: "#64748b" };
        
        const liftoffEvent = this.events.find(e => e.name === "LIFTOFF");
        const liftoffTime = liftoffEvent ? liftoffEvent.time : 0.1;
        
        if (t < liftoffTime) return { name: "Ignition", color: "#f59e0b" };
        if (t <= (this.meta.burnoutTime || 1.65)) return { name: "Boost", color: "#ef4444" };
        if (t < (this.meta.deployTime || this.meta.apogeeTime || 4.65)) return { name: "Coasting", color: "#38bdf8" };
        if (t < (this.meta.landingTime || this.meta.duration)) return { name: "Recovery", color: "#10b981" };
        return { name: "Touchdown", color: "#8b5cf6" };
    }

    /**
     * Formats event name into a readable title
     */
    formatEventLabel(name) {
        const map = {
            "IGNITION": "Ignition",
            "LAUNCH": "Launch Command",
            "LIFTOFF": "Liftoff",
            "LAUNCHROD": "Launch Rod Clear",
            "BURNOUT": "Motor Burnout",
            "EJECTION_CHARGE": "Ejection Charge",
            "RECOVERY_DEVICE_DEPLOYMENT": "Parachute Deployed",
            "APOGEE": "Apogee Peak",
            "GROUND_HIT": "Ground Touchdown",
            "SIMULATION_END": "Simulation End"
        };
        return map[name] || name.replace(/_/g, " ");
    }

    /**
     * Derives a clean engineering simulation title
     */
    getCleanTitle(fileName = "") {
        let raw = (this.meta.title || "").trim();
        // Remove "(Up to date)" or "[Up to date]" or loose "up to date"
        raw = raw.replace(/[\(\[]?\s*up to date\s*[\)\]]?/gi, "").trim();
        raw = raw.replace(/\s{2,}/g, " ").trim();

        if (raw && !raw.toLowerCase().includes("simulation")) {
            const motorMatch = raw.match(/^([A-Za-z0-9\-]+)(?:\s+Motor)?(?:\s+Altitude.*|\s+vs\s+Time.*)?$/i);
            if (motorMatch && motorMatch[1]) {
                return `${motorMatch[1]} Flight Simulation`;
            }
            raw = raw.replace(/\s+Altitude(?:\/Lateral)?\s+vs\s+Time/i, " Flight Simulation");
            if (!raw.toLowerCase().includes("simulation")) {
                raw += " Flight Simulation";
            }
            return raw;
        }

        if (raw) return raw;

        if (fileName) {
            const base = fileName.replace(/\.[^/.]+$/, "");
            return `${base} Flight Simulation`;
        }

        return "OpenRocket Flight Simulation";
    }
}
