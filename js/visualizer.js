/**
 * OpenRocket 3D Visualizer
 * Three.js WebGL rendering engine with procedural rocket, launch pad,
 * dynamic parachute, particle exhaust, trajectory ribbon, and multiple camera modes.
 */

export class RocketVisualizer {
    constructor(containerElement) {
        this.container = containerElement;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        // Visual elements
        this.rocketGroup = null;
        this.rocketBeacon = null;
        this.parachuteGroup = null;
        this.exhaustLight = null;
        this.flameMesh = null;
        this.launchPadGroup = null;
        this.trajectoryGroup = null;
        this.landingMarker = null;

        // Ground projection & Altitude shadow
        this.groundProjectionGroup = null;
        this.groundShadowMesh = null;
        this.groundReticle = null;
        this.altitudePlumbLine = null;

        // Satellite ground & environment
        this.satelliteGroundMesh = null;
        this.peripheralGroundMesh = null;
        this.darkGroundMesh = null;
        this.telemetryGridGroup = null;
        this.isSatelliteMap = true;
        this.activeLaunchField = 'parallel'; // Default: Soccer field parallel with parking lot

        // Particle systems
        this.particles = [];
        this.particlePool = [];

        // Camera settings
        this.cameraMode = "chase"; // 'chase', 'pad', 'free', 'apogee'
        this.chaseDistance = 6.5;
        this.lastRocketPos = null;
        this.chaseOffset = new THREE.Vector3(-3.5, 2.2, 5.5);
        this.cameraLerpSpeed = 0.08;
        this.billboardBadges = [];

        // Flight data
        this.flightData = null;
        this.isLoaded = false;

        this.init();
    }

    init() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        // Scene with subtle atmospheric depth gradient (near terrain -> distant terrain -> horizon -> sky)
        this.scene = new THREE.Scene();
        const skyAtmosphereColor = new THREE.Color(0x0c1322);
        this.scene.background = skyAtmosphereColor;
        this.scene.fog = new THREE.Fog(0x0c1322, 160, 950);

        // Camera
        this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 2000);
        this.camera.position.set(15, 10, 20);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;
        this.container.appendChild(this.renderer.domElement);

        // OrbitControls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2 + 0.05; // Don't go below ground
        this.controls.minDistance = 1.0;
        this.controls.maxDistance = 1500;

        // Lighting
        this.setupLighting();

        // Environment & Ground
        this.setupEnvironment();

        // Rocket Model
        this.setupRocketModel();

        // Real-Time Ground Projection & Altitude Shadow
        this.setupGroundProjection();

        // Trajectory Group
        this.trajectoryGroup = new THREE.Group();
        this.scene.add(this.trajectoryGroup);

        // Initial Chase Cam position behind pad framing the rocket and launch field
        const initOffset = new THREE.Vector3(-4.5, 1.8, 5.0);
        this.camera.position.set(initOffset.x, 0.6 + initOffset.y, initOffset.z);
        this.controls.target.set(0, 0.6, 0);
        this.lastRocketPos = new THREE.Vector3(0, 0.6, 0);
        this.controls.update();

        // Handle resize
        window.addEventListener("resize", () => this.onWindowResize());
    }

    setupLighting() {
        // Ambient sky light - natural Arizona daylight with subtle ground bounce
        const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e2e1e, 0.7);
        hemiLight.position.set(0, 200, 0);
        this.scene.add(hemiLight);

        // Directional Sun with refined shadow frustum covering flight volume
        const sunLight = new THREE.DirectionalLight(0xfff8ee, 1.4);
        sunLight.position.set(120, 250, 100);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.near = 0.5;
        sunLight.shadow.camera.far = 700;
        const d = 100;
        sunLight.shadow.camera.left = -d;
        sunLight.shadow.camera.right = d;
        sunLight.shadow.camera.top = d;
        sunLight.shadow.camera.bottom = -d;
        sunLight.shadow.bias = -0.0003;
        this.scene.add(sunLight);

        // Secondary sky fill light
        const fillLight = new THREE.DirectionalLight(0x7dd3fc, 0.35);
        fillLight.position.set(-80, 100, -80);
        this.scene.add(fillLight);

        // Subtle edge / rim light for realistic rocket silhouette separation
        const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.45);
        rimLight.position.set(-60, 45, -120);
        this.scene.add(rimLight);
    }

    setupEnvironment() {
        // Telemetry Grid & Range Rings Group
        this.telemetryGridGroup = new THREE.Group();

        // Coordinate Grid
        const gridHelper = new THREE.GridHelper(300, 60, 0x475569, 0x1e293b);
        gridHelper.position.y = 0.04;
        if (gridHelper.material) {
            gridHelper.material.depthWrite = false;
            gridHelper.material.transparent = true;
            gridHelper.material.opacity = 0.28;
        }
        this.telemetryGridGroup.add(gridHelper);

        // Distance range rings (10m, 25m, 50m, 100m, 150m)
        const rings = [10, 25, 50, 100, 150];
        rings.forEach(radius => {
            const ringGeo = new THREE.RingGeometry(radius - 0.15, radius + 0.15, 64);
            const ringMat = new THREE.MeshBasicMaterial({
                color: 0x64748b,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.28,
                depthWrite: false
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.05;
            this.telemetryGridGroup.add(ring);
        });

        // Cardinal direction markers
        this.createCardinalLabels(this.telemetryGridGroup);
        this.scene.add(this.telemetryGridGroup);

        // 1. Extended peripheral ground skirt (natural Arizona park lawn/desert tone blending with horizon)
        const periGeo = new THREE.PlaneGeometry(2500, 2500);
        const periMat = new THREE.MeshStandardMaterial({
            color: 0x141f17,
            roughness: 0.95,
            metalness: 0.05
        });
        this.peripheralGroundMesh = new THREE.Mesh(periGeo, periMat);
        this.peripheralGroundMesh.rotation.x = -Math.PI / 2;
        this.peripheralGroundMesh.position.y = -0.15;
        this.peripheralGroundMesh.receiveShadow = true;
        this.scene.add(this.peripheralGroundMesh);

        // 2. High-Resolution Freestone Park Satellite Ground Mesh
        // 4095 x 4095 composite @ 0.12471 m/px = 510.69m x 510.69m
        const satGeo = new THREE.PlaneGeometry(510.69, 510.69);
        const satMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.85,
            metalness: 0.05
        });
        this.satelliteGroundMesh = new THREE.Mesh(satGeo, satMat);
        this.satelliteGroundMesh.rotation.x = -Math.PI / 2;
        this.satelliteGroundMesh.position.y = 0.0;
        this.satelliteGroundMesh.receiveShadow = true;

        // Default: Soccer Field parallel with parking lot (centered on kickoff spot at mosaic origin)
        this.setLaunchField('parallel');
        this.scene.add(this.satelliteGroundMesh);

        // 3. Fallback Dark Sci-Fi Ground Plane
        const darkGeo = new THREE.PlaneGeometry(2500, 2500);
        const darkMat = new THREE.MeshStandardMaterial({
            color: 0x0f172a,
            roughness: 0.9,
            metalness: 0.1
        });
        this.darkGroundMesh = new THREE.Mesh(darkGeo, darkMat);
        this.darkGroundMesh.rotation.x = -Math.PI / 2;
        this.darkGroundMesh.position.y = -0.04;
        this.darkGroundMesh.receiveShadow = true;
        this.darkGroundMesh.visible = false;
        this.scene.add(this.darkGroundMesh);

        // Load Satellite Texture
        this.loadSatelliteTexture();

        // Launch Pad Base & Rod
        this.setupLaunchPad();
    }

    loadSatelliteTexture() {
        const loader = new THREE.TextureLoader();
        const textureSrc = (typeof window !== 'undefined' && window.FREESTONE_SATELLITE_DATA)
            ? window.FREESTONE_SATELLITE_DATA
            : 'data/freestone_stitched_2k.jpg';

        const applyTex = (texture) => {
            if (this.renderer && this.renderer.capabilities) {
                texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy() || 1);
            }
            texture.generateMipmaps = true;
            if ('sRGBEncoding' in THREE) {
                texture.encoding = THREE.sRGBEncoding;
            }
            if (this.satelliteGroundMesh) {
                this.satelliteGroundMesh.material.map = texture;
                this.satelliteGroundMesh.material.needsUpdate = true;
            }
        };

        loader.load(textureSrc, applyTex, undefined, () => {
            loader.load('data/freestone_stitched_2k.jpg', applyTex, undefined, (e) => {
                console.warn('Satellite texture load fallback:', e);
            });
        });
    }

    setLaunchField(fieldId) {
        this.activeLaunchField = fieldId;
        if (!this.satelliteGroundMesh) return;

        if (fieldId === 'west' || fieldId === 'perp' || fieldId === 'field1') {
            // Perpendicular West soccer field (X=1165, Y=1836 in 4K composite)
            // Offset from image center: dx = -110.06m (West), dy = -26.38m (North)
            this.satelliteGroundMesh.position.x = 110.06;
            this.satelliteGroundMesh.position.z = 26.38;
        } else {
            // Default: Soccer field parallel with the curved parking lot
            // Kickoff spot is at (2048, 2048) - the exact junction of the 4 satellite quadrants!
            // Ground mesh (510.69m x 510.69m) centered at (0, 0) places pad directly on the kickoff spot
            this.satelliteGroundMesh.position.x = 0.0;
            this.satelliteGroundMesh.position.z = 0.0;
        }
    }

    setSatelliteMap(enabled) {
        this.isSatelliteMap = enabled;
        if (this.satelliteGroundMesh) this.satelliteGroundMesh.visible = enabled;
        if (this.peripheralGroundMesh) this.peripheralGroundMesh.visible = enabled;
        if (this.darkGroundMesh) this.darkGroundMesh.visible = !enabled;
    }

    setGridVisible(enabled) {
        if (this.telemetryGridGroup) this.telemetryGridGroup.visible = enabled;
    }

    createCardinalLabels(targetGroup) {
        const group = targetGroup || this.scene;
        const createLabel = (text, pos) => {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#38bdf8';
            ctx.font = 'Bold 48px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, 64, 64);

            const texture = new THREE.CanvasTexture(canvas);
            const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.75 });
            const sprite = new THREE.Sprite(spriteMat);
            sprite.position.copy(pos);
            sprite.scale.set(6, 6, 1);
            group.add(sprite);
        };

        createLabel("N", new THREE.Vector3(0, 1.5, -45));
        createLabel("S", new THREE.Vector3(0, 1.5, 45));
        createLabel("E", new THREE.Vector3(45, 1.5, 0));
        createLabel("W", new THREE.Vector3(-45, 1.5, 0));
    }

    setupLaunchPad() {
        this.launchPadGroup = new THREE.Group();

        // Triangular Pad Legs
        const legMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.3 });
        for (let i = 0; i < 3; i++) {
            const angle = (i * Math.PI * 2) / 3;
            const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8);
            const leg = new THREE.Mesh(legGeo, legMat);
            leg.position.set(Math.cos(angle) * 0.45, 0.3, Math.sin(angle) * 0.45);
            leg.rotation.z = Math.sin(angle) * 0.4;
            leg.rotation.x = -Math.cos(angle) * 0.4;
            leg.castShadow = true;
            this.launchPadGroup.add(leg);
        }

        // Pad Hub plate
        const hubGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.1, 16);
        const hubMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.7, roughness: 0.2 });
        const hub = new THREE.Mesh(hubGeo, hubMat);
        hub.position.y = 0.55;
        hub.castShadow = true;
        this.launchPadGroup.add(hub);

        // Blast Deflector
        const deflectorGeo = new THREE.ConeGeometry(0.3, 0.25, 16);
        const deflectorMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9, roughness: 0.4 });
        const deflector = new THREE.Mesh(deflectorGeo, deflectorMat);
        deflector.position.y = 0.65;
        this.launchPadGroup.add(deflector);

        // Launch Rod (1.2m rod, tilted matching launch zenith/azimuth)
        const rodGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.3, 8);
        const rodMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.95, roughness: 0.1 });
        const rod = new THREE.Mesh(rodGeo, rodMat);
        rod.position.y = 1.2;
        rod.castShadow = true;
        this.launchPadGroup.add(rod);

        this.scene.add(this.launchPadGroup);
    }

    setupRocketModel() {
        this.rocketGroup = new THREE.Group();

        // Body tube (scale normalized: height ~1.2m, diameter ~0.08m for high visibility)
        const bodyLength = 0.8;
        const bodyRadius = 0.045;
        const bodyGeo = new THREE.CylinderGeometry(bodyRadius, bodyRadius, bodyLength, 32);
        const BodyMatClass = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;

        // White semi-gloss aerospace body
        const bodyMat = new BodyMatClass({
            color: 0xf8fafc,
            roughness: 0.22,
            metalness: 0.1,
            clearcoat: 0.35,
            clearcoatRoughness: 0.22
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = bodyLength / 2;
        body.castShadow = true;
        this.rocketGroup.add(body);

        // Colored stripe decal
        const stripeGeo = new THREE.CylinderGeometry(bodyRadius + 0.001, bodyRadius + 0.001, 0.1, 32);
        const stripeMat = new BodyMatClass({
            color: 0xef4444,
            roughness: 0.25,
            metalness: 0.1,
            clearcoat: 0.3,
            clearcoatRoughness: 0.25
        });
        const stripe = new THREE.Mesh(stripeGeo, stripeMat);
        stripe.position.y = bodyLength * 0.75;
        this.rocketGroup.add(stripe);

        // Nosecone (Ogive tangent curve with clean specular highlight)
        const noseLength = 0.3;
        const noseGeo = new THREE.ConeGeometry(bodyRadius, noseLength, 32);
        const noseMat = new BodyMatClass({
            color: 0xdc2626, // Bright rocket red
            roughness: 0.18,
            metalness: 0.15,
            clearcoat: 0.45,
            clearcoatRoughness: 0.18
        });
        const nose = new THREE.Mesh(noseGeo, noseMat);
        nose.position.y = bodyLength + (noseLength / 2);
        nose.castShadow = true;
        this.rocketGroup.add(nose);

        // Engine Nozzle
        const nozzleGeo = new THREE.CylinderGeometry(bodyRadius * 0.6, bodyRadius * 0.75, 0.08, 16);
        const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.45 });
        const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
        nozzle.position.y = -0.04;
        this.rocketGroup.add(nozzle);

        // 4 Swept Fins (carbon-graphite matte finish)
        const finShape = new THREE.Shape();
        finShape.moveTo(0, 0);
        finShape.lineTo(0.14, -0.08);
        finShape.lineTo(0.12, 0.08);
        finShape.lineTo(0, 0.18);
        finShape.closePath();

        const extrudeSettings = { depth: 0.006, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.002, bevelThickness: 0.002 };
        const finGeo = new THREE.ExtrudeGeometry(finShape, extrudeSettings);
        const finMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.4 });

        for (let i = 0; i < 4; i++) {
            const fin = new THREE.Mesh(finGeo, finMat);
            fin.rotation.y = (i * Math.PI) / 2;
            fin.position.y = 0.05;
            fin.castShadow = true;
            this.rocketGroup.add(fin);
        }

        // High-Contrast Rocket Tracking Reticle / Beacon (distance-faded)
        this.rocketBeacon = new THREE.Group();
        const beaconGeo = new THREE.RingGeometry(0.68, 0.76, 36);
        this.rocketBeaconMat = new THREE.MeshBasicMaterial({
            color: 0xfbbf24,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.0,
            depthWrite: false
        });
        const beaconRing = new THREE.Mesh(beaconGeo, this.rocketBeaconMat);
        this.rocketBeacon.add(beaconRing);

        // 4 crosshair ticks
        const bTickPts = [
            new THREE.Vector3(0, 0.76, 0), new THREE.Vector3(0, 0.95, 0),
            new THREE.Vector3(0, -0.76, 0), new THREE.Vector3(0, -0.95, 0),
            new THREE.Vector3(0.76, 0, 0), new THREE.Vector3(0.95, 0, 0),
            new THREE.Vector3(-0.76, 0, 0), new THREE.Vector3(-0.95, 0, 0)
        ];
        const bTickGeo = new THREE.BufferGeometry().setFromPoints(bTickPts);
        this.rocketBeaconTickMat = new THREE.LineBasicMaterial({
            color: 0xfbbf24,
            transparent: true,
            opacity: 0.0,
            depthWrite: false
        });
        const bTicks = new THREE.LineSegments(bTickGeo, this.rocketBeaconTickMat);
        this.rocketBeacon.add(bTicks);

        this.rocketBeacon.material = this.rocketBeaconMat;
        this.rocketBeacon.position.y = bodyLength * 0.5;
        this.rocketGroup.add(this.rocketBeacon);

        // Exhaust flame mesh (animated when thrusting)
        const flameGeo = new THREE.ConeGeometry(bodyRadius * 0.7, 0.5, 16);
        flameGeo.rotateX(Math.PI); // point downwards
        flameGeo.translate(0, -0.3, 0);
        const flameMat = new THREE.MeshBasicMaterial({
            color: 0xff6600,
            transparent: true,
            opacity: 0.85
        });
        this.flameMesh = new THREE.Mesh(flameGeo, flameMat);
        this.flameMesh.visible = false;
        this.rocketGroup.add(this.flameMesh);

        // Exhaust PointLight
        this.exhaustLight = new THREE.PointLight(0xff7700, 0, 8);
        this.exhaustLight.position.set(0, -0.2, 0);
        this.rocketGroup.add(this.exhaustLight);

        // Parachute Group (attached above rocket)
        this.setupParachute();

        // Initial position resting on pad
        this.rocketGroup.position.set(0, 0.6, 0);
        this.scene.add(this.rocketGroup);
    }

    setupParachute() {
        this.parachuteGroup = new THREE.Group();

        // Rocket nose tip anchor: bodyLength (0.8) + noseLength (0.3) = 1.1m
        const noseTipY = 1.1;
        this.parachuteGroup.position.set(0, noseTipY, 0);

        // 1. Recovery Line (Shock Cord from nosecone tip to suspension line confluence point)
        const swivelY = 0.35; // 0.35m above nose tip
        const shockLineGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, swivelY, 0)
        ]);
        const shockLineMat = new THREE.LineBasicMaterial({ color: 0xf1f5f9 });
        const shockLine = new THREE.Line(shockLineGeo, shockLineMat);
        this.parachuteGroup.add(shockLine);

        // Swivel eyelet ring at line confluence point
        const swivelGeo = new THREE.TorusGeometry(0.016, 0.004, 8, 16);
        const swivelMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.8, roughness: 0.3 });
        const swivel = new THREE.Mesh(swivelGeo, swivelMat);
        swivel.position.set(0, swivelY, 0);
        swivel.rotation.x = Math.PI / 2;
        this.parachuteGroup.add(swivel);

        // 2. Parachute Canopy (Hemisphere: apex UP, open skirt rim facing DOWN)
        const canopyRadius = 0.5;
        const canopySkirtY = 1.1; // Skirt rim 1.1m above nose tip
        const canopyGeo = new THREE.SphereGeometry(canopyRadius, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2);

        // Striped two-tone texture (12 vertical gores mapping to sphere UVs)
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        const numGores = 12;
        const goreWidth = 512 / numGores;
        for (let i = 0; i < numGores; i++) {
            ctx.fillStyle = (i % 2 === 0) ? '#ff5500' : '#ffffff';
            ctx.fillRect(i * goreWidth, 0, goreWidth, 256);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
            ctx.fillRect(i * goreWidth, 0, 2, 256);
            ctx.fillRect((i + 1) * goreWidth - 2, 0, 2, 256);
        }
        const canopyTexture = new THREE.CanvasTexture(canvas);

        const canopyMat = new THREE.MeshStandardMaterial({
            map: canopyTexture,
            side: THREE.DoubleSide,
            roughness: 0.6,
            metalness: 0.05
        });

        const canopy = new THREE.Mesh(canopyGeo, canopyMat);
        // Default SphereGeometry: apex is at +Y, open rim is at Y=0.
        // No rotation around X: opening already faces downwards toward the rocket.
        canopy.position.set(0, canopySkirtY, 0);
        this.parachuteGroup.add(canopy);

        // 3. 12 Suspension Lines connecting canopy skirt rim down to swivel eyelet
        const lineMat = new THREE.LineBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.75 });
        for (let i = 0; i < numGores; i++) {
            const angle = (i * Math.PI * 2) / numGores;
            const rimX = Math.cos(angle) * canopyRadius;
            const rimZ = Math.sin(angle) * canopyRadius;
            const lineGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(rimX, canopySkirtY, rimZ),
                new THREE.Vector3(0, swivelY, 0)
            ]);
            const line = new THREE.Line(lineGeo, lineMat);
            this.parachuteGroup.add(line);
        }

        this.parachuteGroup.visible = false;
        this.rocketGroup.add(this.parachuteGroup);
    }

    createRadialShadowTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gradient.addColorStop(0, 'rgba(10, 16, 26, 0.7)');
        gradient.addColorStop(0.35, 'rgba(10, 16, 26, 0.4)');
        gradient.addColorStop(0.7, 'rgba(10, 16, 26, 0.12)');
        gradient.addColorStop(1, 'rgba(10, 16, 26, 0.0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 128, 128);
        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    setupGroundProjection() {
        this.groundProjectionGroup = new THREE.Group();
        this.groundProjectionGroup.frustumCulled = false;

        // 1. Dynamic Soft Altitude Shadow Disk (communicates ROCKET -> AIR -> GROUND)
        const shadowGeo = new THREE.PlaneGeometry(1.6, 1.6);
        const shadowMat = new THREE.MeshBasicMaterial({
            map: this.createRadialShadowTexture(),
            transparent: true,
            opacity: 0.45,
            depthWrite: false
        });
        this.groundShadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
        this.groundShadowMesh.rotation.x = -Math.PI / 2;
        this.groundShadowMesh.position.y = 0.035;
        this.groundShadowMesh.frustumCulled = false;
        this.groundProjectionGroup.add(this.groundShadowMesh);

        // 2. High-Contrast Ground Reticle & Crosshairs
        this.groundReticle = new THREE.Group();
        this.groundReticle.frustumCulled = false;
        const ringGeo = new THREE.RingGeometry(0.35, 0.48, 36);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xfbbf24,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85,
            depthWrite: false
        });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = -Math.PI / 2;
        ringMesh.frustumCulled = false;
        this.groundReticle.add(ringMesh);

        // 4 crisp crosshair ticks
        const tickPoints = [
            new THREE.Vector3(0, 0, -0.48), new THREE.Vector3(0, 0, -0.85),
            new THREE.Vector3(0, 0, 0.48), new THREE.Vector3(0, 0, 0.85),
            new THREE.Vector3(0.48, 0, 0), new THREE.Vector3(0.85, 0, 0),
            new THREE.Vector3(-0.48, 0, 0), new THREE.Vector3(-0.85, 0, 0)
        ];
        const tickGeo = new THREE.BufferGeometry().setFromPoints(tickPoints);
        const tickMat = new THREE.LineBasicMaterial({
            color: 0xfbbf24,
            transparent: true,
            opacity: 0.75,
            depthWrite: false
        });
        const tickLines = new THREE.LineSegments(tickGeo, tickMat);
        tickLines.frustumCulled = false;
        this.groundReticle.add(tickLines);
        this.groundReticle.position.y = 0.038;
        this.groundProjectionGroup.add(this.groundReticle);

        // 3. Vertical Altitude Plumb Line (connecting rocket base down to ground)
        const plumbPoints = [
            new THREE.Vector3(0, 0.04, 0),
            new THREE.Vector3(0, 1.0, 0)
        ];
        const plumbGeo = new THREE.BufferGeometry().setFromPoints(plumbPoints);
        const plumbMat = new THREE.LineDashedMaterial({
            color: 0xfacc15,
            dashSize: 1.4,
            gapSize: 0.9,
            transparent: true,
            opacity: 0.90,
            depthWrite: false
        });
        this.altitudePlumbLine = new THREE.Line(plumbGeo, plumbMat);
        this.altitudePlumbLine.frustumCulled = false;
        this.groundProjectionGroup.add(this.altitudePlumbLine);

        this.scene.add(this.groundProjectionGroup);
    }

    createBillboardBadge(lines, options = {}) {
        const width = options.width || 280;
        const height = options.height || 110;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Dark navy translucent background
        ctx.fillStyle = options.bg || 'rgba(9, 16, 32, 0.90)';
        if (ctx.roundRect) {
            ctx.roundRect(4, 4, width - 8, height - 8, options.radius || 10);
        } else {
            ctx.rect(4, 4, width - 8, height - 8);
        }
        ctx.fill();

        // Telemetry amber/gold border
        ctx.strokeStyle = options.borderColor || 'rgba(251, 191, 36, 0.55)';
        ctx.lineWidth = options.borderWidth || 2;
        if (ctx.roundRect) {
            ctx.roundRect(4, 4, width - 8, height - 8, options.radius || 10);
        } else {
            ctx.rect(4, 4, width - 8, height - 8);
        }
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let y = options.startY || 30;
        lines.forEach(line => {
            ctx.fillStyle = line.color || '#ffffff';
            ctx.font = line.font || 'Bold 18px sans-serif';
            ctx.fillText(line.text, width / 2, y);
            y += (line.spacing || 26);
        });

        const texture = new THREE.CanvasTexture(canvas);
        texture.minFilter = THREE.LinearFilter;
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
        const sprite = new THREE.Sprite(spriteMat);
        const scale = options.scale || 1.0;
        sprite.scale.set((width / 100) * scale, (height / 100) * scale, 1);
        if (!this.billboardBadges) this.billboardBadges = [];
        this.billboardBadges.push({ sprite, width, height, scale });
        return sprite;
    }

    /**
     * Builds full 3D trajectory path ribbons and event markers
     */
    loadTrajectory(parser) {
        this.flightData = parser;
        this.isLoaded = true;
        this.billboardBadges = [];

        // Clear existing trajectory
        while (this.trajectoryGroup.children.length > 0) {
            const obj = this.trajectoryGroup.children[0];
            this.trajectoryGroup.remove(obj);
        }

        if (!parser.records || parser.records.length < 2) return;

        const records = parser.records;
        const apogeeT = parser.meta.apogeeTime || 4.8;

        // Helper to convert OpenRocket to Three.js coordinates
        // OpenRocket: posX = East (+X), alt = Up (+Y), posZ = North (-Z in Three.js)
        const toVec3 = (r) => new THREE.Vector3(r.posX, r.alt + 0.6, -r.posZ);
        
        // Filter points to ensure monotonic spatial progress (avoiding zero-distance Frenet frame collapse)
        const filteredPoints = [];
        for (let i = 0; i < records.length; i++) {
            const pt = toVec3(records[i]);
            if (filteredPoints.length === 0 || pt.distanceTo(filteredPoints[filteredPoints.length - 1]) >= 0.25) {
                filteredPoints.push(pt);
            }
        }
        if (records.length > 0) {
            filteredPoints.push(toVec3(records[records.length - 1]));
        }

        // Create main trajectory tube with super-thin black outline and high-contrast telemetry amber core
        if (filteredPoints.length >= 2) {
            const curve = new THREE.CatmullRomCurve3(filteredPoints);

            // 1. Super-thin black outline tube (inverted hull / back-side mesh for silhouette contrast against any background)
            const outlineGeo = new THREE.TubeGeometry(curve, 320, 0.029, 8, false);
            const outlineMat = new THREE.MeshBasicMaterial({
                color: 0x020617, // deep black outline
                side: THREE.BackSide,
                depthWrite: true
            });
            const outlineTube = new THREE.Mesh(outlineGeo, outlineMat);
            outlineTube.renderOrder = 1;
            this.trajectoryGroup.add(outlineTube);

            // 2. Core luminous trajectory tube (slender precision flight path matching airframe scale)
            const coreGeo = new THREE.TubeGeometry(curve, 320, 0.022, 8, false);
            const coreMat = new THREE.MeshBasicMaterial({
                color: 0xf59e0b,
                side: THREE.FrontSide,
                depthWrite: true
            });
            const coreTube = new THREE.Mesh(coreGeo, coreMat);
            coreTube.renderOrder = 2;
            this.trajectoryGroup.add(coreTube);

            // 3. High-altitude crisp line backup for distant visibility
            const lineGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(filteredPoints.length * 3));
            const lineMat = new THREE.LineBasicMaterial({
                color: 0xfbbf24,
                transparent: true,
                opacity: 0.85
            });
            const trajLine = new THREE.Line(lineGeo, lineMat);
            this.trajectoryGroup.add(trajLine);
        }

        // Sub-rocket Ground Track Projection (dashed telemetry amber track on terrain)
        const groundPoints = records.map(r => new THREE.Vector3(r.posX, 0.04, -r.posZ));
        if (groundPoints.length >= 2) {
            const groundCurve = new THREE.CatmullRomCurve3(groundPoints);
            const groundGeo = new THREE.BufferGeometry().setFromPoints(groundCurve.getPoints(records.length * 2));
            const groundMat = new THREE.LineDashedMaterial({
                color: 0xf59e0b,
                dashSize: 2.0,
                gapSize: 1.2,
                transparent: true,
                opacity: 0.75,
                depthWrite: false
            });
            const groundLine = new THREE.Line(groundGeo, groundMat);
            groundLine.computeLineDistances();
            this.trajectoryGroup.add(groundLine);
        }

        // 1. Launch Badge and Target Ring at Pad (0, 0, 0)
        const launchRingGeo = new THREE.RingGeometry(1.2, 1.45, 36);
        const launchRingMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false });
        const launchRing = new THREE.Mesh(launchRingGeo, launchRingMat);
        launchRing.rotation.x = -Math.PI / 2;
        launchRing.position.set(0, 0.04, 0);
        this.trajectoryGroup.add(launchRing);

        const launchBadge = this.createBillboardBadge([
            { text: 'Launch', font: 'Bold 28px sans-serif', color: '#ffffff', spacing: 32 },
            { text: 't = 0.0s', font: '22px monospace', color: '#fbbf24' }
        ], { width: 220, height: 90, startY: 34, scale: 0.9, radius: 10, borderColor: 'rgba(251, 191, 36, 0.55)' });
        launchBadge.position.set(-2.2, 1.0, 0);
        this.trajectoryGroup.add(launchBadge);

        // 2. Apogee Badge, Glowing Point, and Plumb Line at Trajectory Peak
        const apogeeState = parser.sample(apogeeT) || records[Math.floor(records.length / 2)];
        if (apogeeState) {
            const apogeePt = new THREE.Vector3(apogeeState.posX, apogeeState.alt + 0.6, -apogeeState.posZ);
            const apogeeGround = new THREE.Vector3(apogeeState.posX, 0.04, -apogeeState.posZ);

            // Glowing amber/gold node at peak
            const apogeeNodeGeo = new THREE.SphereGeometry(0.38, 16, 16);
            const apogeeNodeMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });
            const apogeeNode = new THREE.Mesh(apogeeNodeGeo, apogeeNodeMat);
            apogeeNode.position.copy(apogeePt);
            this.trajectoryGroup.add(apogeeNode);

            // High-contrast vertical plumb line from peak to ground
            const plumbGeo = new THREE.BufferGeometry().setFromPoints([apogeePt, apogeeGround]);
            const plumbMat = new THREE.LineDashedMaterial({
                color: 0xfacc15,
                dashSize: 1.8,
                gapSize: 1.2,
                transparent: true,
                opacity: 0.85,
                depthWrite: false
            });
            const plumbLine = new THREE.Line(plumbGeo, plumbMat);
            plumbLine.computeLineDistances();
            this.trajectoryGroup.add(plumbLine);

            // Apogee Callout Badge
            const apogeeBadge = this.createBillboardBadge([
                { text: 'Apogee', font: 'Bold 30px sans-serif', color: '#ffffff', spacing: 34 },
                { text: `t = ${apogeeT.toFixed(1)}s`, font: '22px monospace', color: '#fbbf24', spacing: 32 },
                { text: `${parser.meta.maxAltitude ? parser.meta.maxAltitude.toFixed(1) : apogeeState.alt.toFixed(1)} m`, font: 'Bold 32px monospace', color: '#ffffff' }
            ], { width: 240, height: 130, startY: 34, scale: 2.2, radius: 12, borderColor: 'rgba(251, 191, 36, 0.65)' });
            apogeeBadge.position.set(apogeePt.x, apogeePt.y + 4.2, apogeePt.z);
            this.trajectoryGroup.add(apogeeBadge);
        }

        // 3. Touchdown Badge and Target Ring at Landing Spot
        const lastRecord = records[records.length - 1];
        const landingPos = new THREE.Vector3(lastRecord.posX, 0.04, -lastRecord.posZ);

        const landingRingGeo = new THREE.RingGeometry(1.2, 1.45, 36);
        const landingRingMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false });
        const landingRing = new THREE.Mesh(landingRingGeo, landingRingMat);
        landingRing.rotation.x = -Math.PI / 2;
        landingRing.position.copy(landingPos);
        this.trajectoryGroup.add(landingRing);

        const touchdownBadge = this.createBillboardBadge([
            { text: 'Touchdown', font: 'Bold 28px sans-serif', color: '#ffffff', spacing: 32 },
            { text: `t = ${lastRecord.time.toFixed(1)}s`, font: '22px monospace', color: '#f59e0b' }
        ], { width: 240, height: 90, startY: 34, scale: 1.6, radius: 10, borderColor: 'rgba(245, 158, 11, 0.65)' });
        touchdownBadge.position.set(landingPos.x + 2.0, 2.5, landingPos.z);
        this.trajectoryGroup.add(touchdownBadge);

        // 4. Downrange Drift Ground Line and Badge
        const driftDist = lastRecord.lateralDist || landingPos.distanceTo(new THREE.Vector3(0, 0, 0));
        const driftLineGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0.05, 0),
            landingPos
        ]);
        const driftLineMat = new THREE.LineDashedMaterial({
            color: 0xfbbf24,
            dashSize: 1.5,
            gapSize: 1.0,
            transparent: true,
            opacity: 0.85,
            depthWrite: false
        });
        const driftLine = new THREE.Line(driftLineGeo, driftLineMat);
        driftLine.computeLineDistances();
        this.trajectoryGroup.add(driftLine);

        const midPoint = new THREE.Vector3(landingPos.x * 0.5, 0.05, landingPos.z * 0.5);
        const driftBadge = this.createBillboardBadge([
            { text: 'Downrange Drift', font: '22px sans-serif', color: '#cbd5e1', spacing: 30 },
            { text: `${driftDist.toFixed(1)} m`, font: 'Bold 28px monospace', color: '#fbbf24' }
        ], { width: 260, height: 90, startY: 34, scale: 1.4, radius: 10, borderColor: 'rgba(251, 191, 36, 0.55)', bg: 'rgba(9, 16, 32, 0.88)' });
        driftBadge.position.set(midPoint.x, 1.2, midPoint.z);
        this.trajectoryGroup.add(driftBadge);
    }

    /**
     * Updates rocket state to current playback timestamp t
     * @param {number} t Current simulation time in seconds
     */
    update(t) {
        if (!this.flightData || !this.isLoaded) return;

        const state = this.flightData.sample(t);
        if (!state) return;

        // Position update
        const posX = state.posX;
        const posY = Math.max(0.6, state.alt + 0.6);
        const posZ = -state.posZ; // North is -Z
        this.rocketGroup.position.set(posX, posY, posZ);

        // Ground projection & Altitude shadow update (ROCKET -> AIR -> GROUND)
        if (this.groundProjectionGroup) {
            const alt = Math.max(0, state.alt);
            if (alt > 0.08) {
                this.groundProjectionGroup.visible = true;

                // Position shadow & reticle directly below rocket on terrain
                this.groundShadowMesh.position.set(posX, 0.035, posZ);
                this.groundReticle.position.set(posX, 0.038, posZ);

                // Scale and soften ground shadow with altitude
                const shadowScale = Math.min(3.8, 1.0 + alt * 0.02);
                this.groundShadowMesh.scale.set(shadowScale, shadowScale, 1);
                this.groundShadowMesh.material.opacity = Math.max(0.12, 0.45 - alt * 0.0018);

                // Dynamic vertical plumb line from terrain up to rocket base
                const posAttr = this.altitudePlumbLine.geometry.attributes.position;
                posAttr.setXYZ(0, posX, 0.04, posZ);
                posAttr.setXYZ(1, posX, posY, posZ);
                posAttr.needsUpdate = true;
                this.altitudePlumbLine.computeLineDistances();
                if (this.altitudePlumbLine.geometry.attributes.lineDistance) {
                    this.altitudePlumbLine.geometry.attributes.lineDistance.needsUpdate = true;
                }
                this.altitudePlumbLine.visible = true;
            } else {
                // Resting on pad: keep contact shadow under rocket, hide vertical line
                this.groundShadowMesh.position.set(posX, 0.035, posZ);
                this.groundShadowMesh.scale.set(1.0, 1.0, 1);
                this.groundShadowMesh.material.opacity = 0.45;
                this.groundReticle.position.set(posX, 0.038, posZ);
                this.altitudePlumbLine.visible = false;
            }
        }

        // High-altitude rocket tracking beacon visibility (fades in as camera pulls back)
        if (this.rocketBeacon && this.camera) {
            const camDist = this.camera.position.distanceTo(this.rocketGroup.position);
            this.rocketBeacon.quaternion.copy(this.camera.quaternion);

            if (camDist < 16) {
                this.rocketBeacon.visible = false;
            } else if (camDist < 60) {
                this.rocketBeacon.visible = true;
                const factor = (camDist - 16) / 44;
                const op = factor * 0.80;
                if (this.rocketBeaconMat) this.rocketBeaconMat.opacity = op;
                if (this.rocketBeaconTickMat) this.rocketBeaconTickMat.opacity = op * 0.85;
                const scale = 1.0 + factor * 0.45;
                this.rocketBeacon.scale.set(scale, scale, scale);
            } else {
                this.rocketBeacon.visible = true;
                if (this.rocketBeaconMat) this.rocketBeaconMat.opacity = 0.85;
                if (this.rocketBeaconTickMat) this.rocketBeaconTickMat.opacity = 0.75;
                const scale = Math.min(2.5, 1.45 + (camDist - 60) * 0.008);
                this.rocketBeacon.scale.set(scale, scale, scale);
            }
        }

        // Rotation update (Zenith & Azimuth from OpenRocket)
        // Zenith is angle with horizontal ground (90° = vertical up)
        // Azimuth is compass heading (0° = North = -Z, 90° = East = +X, 180° = South = +Z, 270° = West = -X)
        const deployT = (this.flightData && this.flightData.meta && this.flightData.meta.deployTime) || 
                        (this.flightData && this.flightData.meta && this.flightData.meta.apogeeTime) || 4.65;
        const flightT = (this.flightData && this.flightData.meta && (this.flightData.meta.flightTime || this.flightData.meta.landingTime || this.flightData.meta.duration)) || 26.89;
        const isUnderChute = t >= deployT;

        if (isUnderChute) {
            // Under parachute: rocket hangs slightly tilted and oscillates gently during descent
            // Once touched down on ground (or t >= flightT), rocket rests upright and stable
            const isLanded = t >= flightT || state.alt <= 0.05;
            const sway = isLanded ? 0 : Math.sin(t * 2.5) * 0.04;
            this.rocketGroup.rotation.set(sway, 0, sway * 0.5);
            this.parachuteGroup.visible = true;
            // Smooth canopy scale-in animation outward from nose tip at deployment
            const chuteProgress = Math.min(1.0, (t - deployT) / 0.4);
            this.parachuteGroup.scale.set(chuteProgress, chuteProgress, chuteProgress);
        } else {
            this.parachuteGroup.visible = false;

            // Rocket flight orientation: tip leads along the 3D trajectory
            const liftoffEvent = this.flightData.events ? this.flightData.events.find(e => e.name === "LIFTOFF" || e.name === "LAUNCH") : null;
            const liftoffT = liftoffEvent ? liftoffEvent.time : 0.1;

            // Pad launch rail orientation from zenith / azimuth
            const padZenith = (state.zenith !== undefined && !isNaN(state.zenith)) ? state.zenith : 90;
            const padAzimuth = (state.azimuth !== undefined && !isNaN(state.azimuth)) ? state.azimuth : 90;
            const theta = padZenith * (Math.PI / 180);
            const psi = padAzimuth * (Math.PI / 180);
            const padDir = new THREE.Vector3(
                Math.cos(theta) * Math.sin(psi),
                Math.sin(theta),
                -Math.cos(theta) * Math.cos(psi)
            ).normalize();

            let targetDir = padDir.clone();

            if (t > liftoffT) {
                // Compute instantaneous trajectory tangent vector
                const dt = 0.04;
                const t1 = Math.max(0, t - dt);
                const t2 = Math.min(deployT, t + dt);
                const s1 = this.flightData.sample(t1);
                const s2 = this.flightData.sample(t2);

                if (s1 && s2) {
                    const tan = new THREE.Vector3(
                        s2.posX - s1.posX,
                        s2.alt - s1.alt,
                        -(s2.posZ - s1.posZ)
                    );
                    if (tan.lengthSq() > 1e-6) {
                        tan.normalize();
                        // Smooth blend off the launch rail during first 0.15s after liftoff
                        const blend = Math.min(1.0, (t - liftoffT) / 0.15);
                        targetDir.lerpVectors(padDir, tan, blend).normalize();
                    }
                }
            }

            // Rocket model is constructed with tip along +Y: rotate from +Y to targetDir
            this.rocketGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), targetDir);
        }

        // Thrust / Flame effect
        const isThrusting = state.thrust > 0.05 && t <= (this.flightData.meta.burnoutTime || 1.65);
        if (isThrusting) {
            this.flameMesh.visible = true;
            const flicker = 0.8 + Math.random() * 0.4;
            this.flameMesh.scale.set(flicker, flicker * (0.8 + (state.thrust / 25)), flicker);
            this.exhaustLight.intensity = 2.5 + Math.random() * 1.5;

            // Spawn exhaust smoke particle
            this.spawnExhaustParticle(this.rocketGroup.position);
        } else {
            this.flameMesh.visible = false;
            this.exhaustLight.intensity = 0;
        }

        // Update active particles
        this.updateParticles();

        // Update Camera based on active mode
        this.updateCamera(posX, posY, posZ, state);
    }

    spawnExhaustParticle(rocketPos) {
        if (this.particles.length > 80) return; // limit count

        const pGeo = new THREE.DodecahedronGeometry(0.08 + Math.random() * 0.06);
        const pMat = new THREE.MeshBasicMaterial({
            color: Math.random() > 0.4 ? 0xffffff : 0x94a3b8,
            transparent: true,
            opacity: 0.6
        });
        const mesh = new THREE.Mesh(pGeo, pMat);
        
        // Spawn along the rocket tail direction opposite to flight
        const tailDir = new THREE.Vector3(0, -1, 0).applyQuaternion(this.rocketGroup.quaternion);
        const spawnPos = rocketPos.clone().addScaledVector(tailDir, 0.25);
        mesh.position.copy(spawnPos);
        mesh.position.x += (Math.random() - 0.5) * 0.08;
        mesh.position.y += (Math.random() - 0.5) * 0.08;
        mesh.position.z += (Math.random() - 0.5) * 0.08;

        this.scene.add(mesh);
        this.particles.push({
            mesh,
            vel: tailDir.clone().multiplyScalar(0.4 + Math.random() * 0.3).add(
                new THREE.Vector3((Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15)
            ),
            life: 0.8
        });
    }

    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= 0.03;
            p.mesh.position.addScaledVector(p.vel, 0.04);
            p.mesh.scale.multiplyScalar(1.04);
            p.mesh.material.opacity = p.life * 0.6;

            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                p.mesh.geometry.dispose();
                p.mesh.material.dispose();
                this.particles.splice(i, 1);
            }
        }
    }

    updateCamera(rx, ry, rz, state) {
        const rocketPos = new THREE.Vector3(rx, ry, rz);

        if (this.cameraMode === "chase") {
            if (!this.lastRocketPos) {
                this.lastRocketPos = rocketPos.clone();
                this.controls.target.copy(rocketPos);
                const offset = new THREE.Vector3(-4.5, 1.8, 5.0).normalize().multiplyScalar(this.chaseDistance || 6.5);
                this.camera.position.copy(rocketPos).add(offset);
            } else {
                // Move camera and target by the exact flight displacement of the rocket
                const rocketShift = new THREE.Vector3().subVectors(rocketPos, this.lastRocketPos);
                this.camera.position.add(rocketShift);
                this.controls.target.copy(rocketPos);
                this.lastRocketPos.copy(rocketPos);
            }

            // Dynamically track user's active zoom distance from OrbitControls
            this.chaseDistance = this.camera.position.distanceTo(rocketPos);

            // Ground clamp so zoomed-out camera doesn't dip under ground
            if (this.camera.position.y < 0.35) {
                this.camera.position.y = 0.35;
            }

            // Update OrbitControls so mouse wheel zoom, pinch, and orbit are processed smoothly
            this.controls.update();
        } else if (this.cameraMode === "pad") {
            // Launch site ground tracker beside pad looking smoothly up into the sky
            this.camera.position.set(9.0, 1.5, 12.0);
            this.controls.target.lerp(rocketPos, 0.08);
            this.controls.update();
        } else if (this.cameraMode === "apogee") {
            // High altitude vantage view framed around trajectory apex and arch
            const maxAlt = (this.flightData && this.flightData.meta && this.flightData.meta.maxAltitude) || 95;
            const targetCamPos = new THREE.Vector3(10, Math.max(70, maxAlt * 0.85), Math.max(130, maxAlt * 1.7));
            const targetLook = new THREE.Vector3(14, maxAlt * 0.45, 0);
            this.camera.position.lerp(targetCamPos, 0.05);
            this.controls.target.lerp(targetLook, 0.05);
            this.controls.update();
        } else if (this.cameraMode === "free") {
            // User free orbit controls
            this.controls.update();
        }
    }

    setCameraMode(mode) {
        this.cameraMode = mode;
        const rx = this.rocketGroup ? this.rocketGroup.position.x : 0;
        const ry = this.rocketGroup ? this.rocketGroup.position.y : 0.6;
        const rz = this.rocketGroup ? this.rocketGroup.position.z : 0;
        const rocketPos = new THREE.Vector3(rx, ry, rz);

        if (mode === "chase") {
            const dist = this.chaseDistance || 6.5;
            const offsetDir = new THREE.Vector3(-4.5, 1.8, 5.0).normalize();
            this.chaseDistance = dist;
            this.controls.target.copy(rocketPos);
            this.camera.position.copy(rocketPos).addScaledVector(offsetDir, dist);
            this.lastRocketPos = rocketPos.clone();
            this.controls.update();
        } else if (mode === "pad") {
            this.camera.position.set(9.0, 1.5, 12.0);
            this.controls.target.copy(rocketPos);
            this.controls.update();
        } else if (mode === "apogee") {
            const maxAlt = (this.flightData && this.flightData.meta && this.flightData.meta.maxAltitude) || 95;
            const targetCamPos = new THREE.Vector3(10, Math.max(70, maxAlt * 0.85), Math.max(130, maxAlt * 1.7));
            const targetLook = new THREE.Vector3(14, maxAlt * 0.45, 0);
            this.camera.position.copy(targetCamPos);
            this.controls.target.copy(targetLook);
            this.controls.update();
        } else if (mode === "free") {
            this.controls.update();
        }
    }

    zoomCamera(deltaFactor) {
        if (!this.controls || !this.camera) return;
        const target = this.controls.target;
        const camPos = this.camera.position;
        const offset = new THREE.Vector3().subVectors(camPos, target);
        const curDist = offset.length();
        const newDist = Math.max(1.5, Math.min(1500, curDist * (1 + deltaFactor)));
        offset.normalize().multiplyScalar(newDist);
        this.camera.position.copy(target).add(offset);
        if (this.cameraMode === "chase") {
            this.chaseDistance = newDist;
        }
        this.controls.update();
    }

    render() {
        if (this.controls && this.camera) {
            const dx = this.camera.position.x - this.controls.target.x;
            const dz = this.camera.position.z - this.controls.target.z;
            const angleRad = Math.atan2(dx, dz);
            const angleDeg = angleRad * (180 / Math.PI);
            const compassDial = document.getElementById("compass-dial");
            if (compassDial) {
                compassDial.style.transform = `rotate(${-angleDeg}deg)`;
            }

            // Screen-space constant scale attenuation for technical callout badges
            if (this.billboardBadges && this.billboardBadges.length > 0) {
                this.billboardBadges.forEach(item => {
                    if (item.sprite && item.sprite.parent) {
                        const dist = this.camera.position.distanceTo(item.sprite.position);
                        const s = Math.max(0.35, Math.min(3.8, dist * 0.024)) * item.scale;
                        item.sprite.scale.set((item.width / 100) * s, (item.height / 100) * s, 1);
                    }
                });
            }
        }
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        if (!this.container) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
}
