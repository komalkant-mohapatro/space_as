import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---- GLOBAL STATE ----
let scene, camera, renderer, controls, sunLight;
let milkyWayGroup, majorStarsGroup;
let userLocation = { lat: 0, lon: 0, el: 0, city: "Loading..." };
let celestialBodies = {};
const RADIUS = 100; // Radius of the celestial dome
let animationFrameId;

// UI Elements
const timeUtcEl = document.getElementById('utc-time');
const timeIstEl = document.getElementById('ist-time');
const locationEl = document.getElementById('location-display');
const planetSelector = document.getElementById('planet-selector');
const dataAltEl = document.getElementById('data-alt');
const dataAzEl = document.getElementById('data-az');
const dataDistEl = document.getElementById('data-dist');
const dataVisEl = document.getElementById('data-vis');

// Colors
const COLOR_VIS = 0x4da6ff;
const COLOR_HID = 0xff4d4d;

// Main Init
async function init() {
    setupThreeJS();
    await fetchLocation();
    await fetchAndRenderData();

    // Start local clock
    setInterval(updateClocks, 1000);
    // Refresh data every 60 seconds
    setInterval(fetchAndRenderData, 60000);

    planetSelector.addEventListener('change', focusOnPlanet);
    window.addEventListener('resize', onWindowResize);

    animate();
}

// UI Update Clocks
function updateClocks() {
    const now = new Date();
    timeUtcEl.innerText = `UTC: ${now.toISOString().substr(11, 8)}`;

    // IST is UTC + 5:30
    const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    timeIstEl.innerText = `IST: ${istTime.toISOString().substr(11, 8)}`;
}

// Fetch Location
async function fetchLocation() {
    return new Promise((resolve) => {
        locationEl.innerText = "Requesting exact location...";

        // Step 1: Try HTML5 Browser Geolocation for exact coordinates
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    // Success! Got exact GPS coords.
                    userLocation.lat = position.coords.latitude;
                    userLocation.lon = position.coords.longitude;

                    try {
                        // Reverse geocode to get the exact city name for these coordinates
                        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLocation.lat}&lon=${userLocation.lon}`);
                        const data = await res.json();
                        const city = data.address.city || data.address.town || data.address.village || data.address.county || "Unknown Location";
                        const country = data.address.country || "";
                        userLocation.city = country ? `${city}, ${country}` : city;
                    } catch (e) {
                        userLocation.city = "Unknown City";
                    }

                    locationEl.innerText = `${userLocation.city} (${userLocation.lat.toFixed(4)}°, ${userLocation.lon.toFixed(4)}°)`;
                    resolve();
                },
                async (error) => {
                    console.warn("Geolocation denied/failed. Falling back to IP-based location.", error);
                    // Step 2: Fallback to IP location
                    await fetchLocationFallback(resolve);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            console.warn("Geolocation not supported by browser. Falling back to IP-based location.");
            // Step 2: Fallback to IP location
            fetchLocationFallback(resolve);
        }
    });
}

// Fallback to IP Location
async function fetchLocationFallback(resolve) {
    try {
        const res = await fetch('/api/location');
        const data = await res.json();
        userLocation.lat = data.latitude;
        userLocation.lon = data.longitude;
        userLocation.city = `${data.city}, ${data.country}`;
        locationEl.innerText = `[IP] ${userLocation.city} (${userLocation.lat.toFixed(4)}°, ${userLocation.lon.toFixed(4)}°)`;
    } catch (e) {
        console.error("Location fetch failed", e);
        locationEl.innerText = "Location Error";
    }
    resolve();
}

// Fetch Celestial Data
async function fetchAndRenderData() {
    try {
        const res = await fetch('/api/celestial_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                latitude: userLocation.lat,
                longitude: userLocation.lon,
                elevation: 0,
                time_iso: new Date().toISOString()
            })
        });
        const result = await res.json();
        if (result.status === "success") {
            updateScene(result.data.bodies, result.data.stars, result.data.milky_way);
            updateUI(planetSelector.value);
        }
    } catch (e) {
        console.error("Data fetch failed", e);
    }
}

// Three.js Setup
function setupThreeJS() {
    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    // No background color, let index CSS show through or set black
    scene.background = new THREE.Color(0x030508);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 10000);
    // Start camera looking more upwards so the user sees the sky
    camera.position.set(0, 10, 150);
    camera.lookAt(0, 50, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxDistance = 2000;
    // Removed restriction to let users pan below the ground
    // controls.maxPolarAngle = Math.PI / 2 + 0.1;
    controls.zoomSpeed = 2.0;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // Brighter ambient
    scene.add(ambientLight);

    sunLight = new THREE.PointLight(0xffffee, 3.5, 3000); // Stronger sun
    scene.add(sunLight);

    createStarsBackground();

    milkyWayGroup = createMilkyWay();
    scene.add(milkyWayGroup);

    majorStarsGroup = new THREE.Group();
    scene.add(majorStarsGroup);

    // Add Horizon Plane
    const gridHelper = new THREE.PolarGridHelper(RADIUS, 16, 8, 64, 0x333333, 0x222222);
    scene.add(gridHelper);

    const horizonGeo = new THREE.CircleGeometry(RADIUS, 64);
    const horizonMat = new THREE.MeshBasicMaterial({
        color: 0x0a101a,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide
    });
    const horizon = new THREE.Mesh(horizonGeo, horizonMat);
    horizon.rotation.x = -Math.PI / 2;
    horizon.position.y = -0.1; // Slightly below to prevent z-fighting
    scene.add(horizon);

    // Add Cardinal Directions
    addCardinalLabels();
}

function addCardinalLabels() {
    const dirs = [
        { name: 'N', az: 0 },
        { name: 'E', az: 90 },
        { name: 'S', az: 180 },
        { name: 'W', az: 270 }
    ];

    // Simple text sprite fallback
    dirs.forEach(d => {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#4da6ff';
        ctx.font = 'bold 32px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(d.name, 32, 32);

        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(10, 10, 1);

        const pos = azAltToXYZ(d.az, 0, RADIUS * 1.05);
        sprite.position.copy(pos);
        scene.add(sprite);
    });
}

function azAltToXYZ(azDeg, altDeg, radius) {
    // Convert degrees to radians
    const az = THREE.MathUtils.degToRad(azDeg);
    const alt = THREE.MathUtils.degToRad(altDeg);

    // X = West/East, Y = Up/Down, Z = North/South
    // By convention in our scene, North is -Z, East is +X
    // Azimuth 0 = North, 90 = East, 180 = South, 270 = West

    // x = r * cos(alt) * sin(az)
    // y = r * sin(alt)
    // z = -r * cos(alt) * cos(az)

    const x = radius * Math.cos(alt) * Math.sin(az);
    const y = radius * Math.sin(alt);
    const z = -radius * Math.cos(alt) * Math.cos(az);

    return new THREE.Vector3(x, y, z);
}

// Update Scene with Objects
const planetMeshes = {};
// Vibrant planet colors
const planetColors = {
    'Sun': 0xffffff, 'Moon': 0xcccccc, 'Mercury': 0xaaaabb, 'Venus': 0xffcc66,
    'Earth': 0x2266ff, 'Mars': 0xff3300, 'Jupiter': 0xff9933, 'Saturn': 0xffcc99,
    'Uranus': 0x33ccff, 'Neptune': 0x0033ff
};

function updateScene(bodies, stars, milky_way) {
    const sizeMap = {
        'Sun': 5.0, 'Moon': 1.5, 'Mercury': 1.2, 'Venus': 1.8,
        'Earth': 2.0, 'Mars': 1.5, 'Jupiter': 3.5, 'Saturn': 3.2,
        'Uranus': 2.5, 'Neptune': 2.4
    };

    // Draw Planets
    Object.keys(bodies).forEach(name => {
        const b = bodies[name];

        if (!planetMeshes[name]) {
            // Create mesh
            const geo = new THREE.SphereGeometry(sizeMap[name] || 2, 32, 32);
            let mat;
            if (name === 'Sun') {
                mat = new THREE.MeshBasicMaterial({ color: planetColors[name] });
            } else {
                mat = new THREE.MeshStandardMaterial({
                    color: planetColors[name],
                    roughness: 0.6,
                    metalness: 0.2
                });
            }
            const mesh = new THREE.Mesh(geo, mat);

            // Add label
            const labelCanv = document.createElement('canvas');
            labelCanv.width = 128; labelCanv.height = 32;
            const ctx = labelCanv.getContext('2d');
            ctx.fillStyle = b.visible ? '#4da6ff' : '#ff4d4d';
            ctx.font = '20px Outfit';
            ctx.fillText(name, 0, 24);
            const lTex = new THREE.CanvasTexture(labelCanv);
            const lMat = new THREE.SpriteMaterial({ map: lTex });
            const sprite = new THREE.Sprite(lMat);
            sprite.scale.set(12, 3, 1);
            sprite.position.y = (sizeMap[name] || 2) + 1.5;

            mesh.add(sprite); // Attach label to planet
            scene.add(mesh);

            planetMeshes[name] = { mesh, spriteMat: lMat, labelCtx: ctx, labelCanv, lTex };
        }

        // Update Position avoiding collisions
        let pRadius;
        if (name === 'Sun') pRadius = RADIUS * 1.5;
        else if (name === 'Moon') pRadius = RADIUS * 0.4;
        else pRadius = RADIUS * (0.8 + Math.log10(Math.max(0.1, b.distance_au)) * 0.6);
        pRadius = Math.max(50, Math.min(pRadius, 800)); // clamp between 50 and 800

        const pos = azAltToXYZ(b.azimuth, b.altitude, pRadius);
        planetMeshes[name].mesh.position.copy(pos);

        if (name === 'Sun') {
            sunLight.position.copy(pos);
        }

        // Update label color and object opacity
        planetMeshes[name].mesh.material.transparent = !b.visible;
        planetMeshes[name].mesh.material.opacity = b.visible ? 1.0 : 0.3;

        if (name !== 'Sun') {
            // Keep real star color if visible, else tint red
            if (!b.visible) {
                planetMeshes[name].mesh.material.color.setHex(COLOR_HID);
            } else {
                planetMeshes[name].mesh.material.color.setHex(planetColors[name]);
            }
        }

        // Update label color
        const pObj = planetMeshes[name];
        pObj.labelCtx.clearRect(0, 0, 128, 32);
        pObj.labelCtx.fillStyle = b.visible ? '#4da6ff' : '#ff4d4d';
        pObj.labelCtx.fillText(name, 0, 24);
        pObj.lTex.needsUpdate = true;
    });

    // Render Major Stars
    while (majorStarsGroup.children.length > 0) {
        majorStarsGroup.remove(majorStarsGroup.children[0]);
    }
    stars.forEach(s => {
        if (!s.visible) return;
        const pos = azAltToXYZ(s.azimuth, s.altitude, RADIUS * 1.5);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.0, 8, 8), mat);
        mesh.position.copy(pos);
        majorStarsGroup.add(mesh);
    });

    // Align Milky Way
    if (milkyWayGroup && milky_way) {
        const centerVec = azAltToXYZ(milky_way.center.azimuth, milky_way.center.altitude, 1);
        const poleVec = azAltToXYZ(milky_way.pole.azimuth, milky_way.pole.altitude, 1);

        const xA = centerVec.clone().normalize();
        const yA = poleVec.clone().normalize();
        const zA = new THREE.Vector3().crossVectors(xA, yA).normalize();

        // Ensure perfect orthogonality
        yA.crossVectors(zA, xA).normalize();

        const mat = new THREE.Matrix4();
        mat.makeBasis(xA, yA, zA);
        milkyWayGroup.setRotationFromMatrix(mat);
    }

    celestialBodies = bodies;
}

// UI Controls
function focusOnPlanet() {
    const sel = planetSelector.value;
    updateUI(sel);

    if (sel === "All") {
        // Reset Camera to look up at the entire sky dome
        gsapCameraTo(new THREE.Vector3(0, 10, 150), new THREE.Vector3(0, 50, 0));
        return;
    }

    if (planetMeshes[sel]) {
        const pos = planetMeshes[sel].mesh.position;
        // Move camera slightly away from planet
        const offset = pos.clone().normalize().multiplyScalar(Math.max(30, pos.length() - 80));

        // If planet is above horizon, look slightly down on it.
        // If planet is below horizon, look slightly up at it.
        offset.y += (pos.y > 0 ? 15 : -15);

        gsapCameraTo(offset, pos);
    }
}

function updateUI(sel) {
    if (sel === "All" || !celestialBodies[sel]) {
        dataAltEl.innerText = "--";
        dataAzEl.innerText = "--";
        dataDistEl.innerText = "--";
        dataVisEl.innerText = "--";
        dataVisEl.className = "";
        return;
    }

    const b = celestialBodies[sel];
    dataAltEl.innerText = b.altitude.toFixed(2);
    dataAzEl.innerText = b.azimuth.toFixed(2);
    dataDistEl.innerText = b.distance_au.toFixed(4);

    if (b.visible) {
        dataVisEl.innerText = "Above Horizon";
        dataVisEl.className = "visible-text";
    } else {
        dataVisEl.innerText = "Below Horizon";
        dataVisEl.className = "hidden-text";
    }
}

function createStarsBackground() {
    const starsGeo = new THREE.BufferGeometry();
    const starsCount = 3000;
    const posArr = new Float32Array(starsCount * 3);
    for (let i = 0; i < starsCount * 3; i++) {
        posArr[i] = (Math.random() - 0.5) * 2000;
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, transparent: true, opacity: 0.8 });
    const starPoints = new THREE.Points(starsGeo, starsMat);
    scene.add(starPoints);
}

function createMilkyWay() {
    const mwGeo = new THREE.BufferGeometry();
    const mwCount = 10000;
    const mwPos = new Float32Array(mwCount * 3);
    const mwColors = new Float32Array(mwCount * 3);
    const color = new THREE.Color();

    // Simulate galactic plane band
    for (let i = 0; i < mwCount; i++) {
        const r = 800 + Math.random() * 200;
        const theta = Math.random() * Math.PI * 2;
        const width = (Math.random() - 0.5) * 150;

        // Galactic plane is aligned to X-Z plane locally (Y is normal)
        const x = r * Math.cos(theta);
        const z = r * Math.sin(theta);
        const y = width + (Math.random() - 0.5) * 40;

        mwPos[i * 3] = x;
        mwPos[i * 3 + 1] = y;
        mwPos[i * 3 + 2] = z;

        color.setHSL(0.6 + Math.random() * 0.1, 0.4, Math.random() * 0.6 + 0.1);
        mwColors[i * 3] = color.r;
        mwColors[i * 3 + 1] = color.g;
        mwColors[i * 3 + 2] = color.b;
    }
    mwGeo.setAttribute('position', new THREE.BufferAttribute(mwPos, 3));
    mwGeo.setAttribute('color', new THREE.BufferAttribute(mwColors, 3));

    const mwMat = new THREE.PointsMaterial({
        size: 2.0,
        vertexColors: true,
        transparent: true,
        opacity: 0.5
    });

    return new THREE.Points(mwGeo, mwMat);
}

// Simple Camera Animation implementation
let targetLookAt = new THREE.Vector3(0, 0, 0);
let currentLookAt = new THREE.Vector3(0, 0, 0);

function gsapCameraTo(pos, lookAt) {
    // Jump for simplicity, but update controls nicely
    camera.position.set(pos.x, pos.y, pos.z);
    targetLookAt.copy(lookAt);
    controls.target.copy(lookAt);
    controls.update();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    animationFrameId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// Start
init();
