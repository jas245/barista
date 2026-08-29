'use strict';

/**
 * High-End Screen-Space Liquid Renderer for LiquidFun.js
 * Combines particle physics with a WebGL surface reconstruction & lighting pipeline.
 */



//create another image thats framed the way this one is, but make that person look uncanny and creepy. their look must be completely random. they should have a neutral expression. 
//make this person frown/look angry
//make this person smile creepily
//make this person look like they're drinking from an empty glass, dont change the orientation of their body, make their expression neutral, the glass should be tilted upwards

// Canvas & Physics Configuration
const canvas = document.getElementById('glCanvas');
const particleCountEl = document.getElementById('particle-count');

const SCALE = 100; // 100 pixels per meter in physics space
const PARTICLE_RADIUS = 0.02; 

let particleTypes = [];

let world;
let particleSystem;
let animationFrameId;

let particleMix = []; // 0.0 = Espresso, 1.0 = Milk
let selectedIngredient = 'espresso'; // Currently active selected drink
let isPointerDown = false;
let pointerX = 0;
let pointerY = 0;
let frameCounter = 0;

let cupProgram, cupVertexBuffer;
let cupBody;

const bottomKillShape = new b2PolygonShape();
bottomKillShape.SetAsBoxXYCenterAngle(10.0, 0.5, new b2Vec2(0.0, 5.0), 0);

const identityTransform = new b2Transform();
identityTransform.SetIdentity();


const FEMALE_VOICES = [
    "jSc0fl7ySVBKbBreRrYP", // Daye filipina
    "ZTLBC2emTrxYTdCF99Kb", // Rozie filipina
    "6ZZR4JY6rOriLSDtV54M",  // Sreeja indian
	"vClXJXA8GI2rtwhNsOja", //Simran indian
	"USEQXnsXRJlw2k9LUzG4", //Tessa british
	"WKWX31A0Kkv2Y4CQRsll", //Chazza british
	"FUu5jJAN31dt6KeE1fk2", //Ann chinese
	"rCuVrCHOUMY3OwyJBJym", //Mia american
	"ogwqBH5bbF03DSbNiRNN", //Savvy american
];

const MALE_VOICES = [
    "yRswJrfr4gJ1N9YNt8C7", // Marcus filipino
    "M9umV91aYFeyuewSREwA", // James filipino
    "dtb2DcRUiZX01F9bvBi0",  // Rian indian
	"WtIqwF5CWCkaZSGmvsm1", //Rahul indian
	"GrVxA7Ub86nJH91Viyiv", //James (English storyteller) british
	"fATgBRI8wg5KkDFg8vBd", //James (smooth) british
	"dhwafD61uVd8h85wAZSE", //Denzel jamaican
	"HKFOb9iktHA85uKXydRT", //Russ american
	"s3TPKV1kjDlVtZbl4Ksh", //Adam american
];

// Map each person ID (1 to 4) to 'male' or 'female'
const CUSTOMER_GENDERS = {
    1: 'female',
    2: 'female',
    3: 'male',
    4: 'male'
};

function getRandomVoiceForPerson(personId) {
    const gender = CUSTOMER_GENDERS[personId] || 'female';
    const voiceList = (gender === 'male') ? MALE_VOICES : FEMALE_VOICES;
    return voiceList[Math.floor(Math.random() * voiceList.length)];
}

let currentKeyIndex = 0;
let currentCustomerVoiceId = null;

function getActiveKey() {
    const key = ELEVEN_KEYS[currentKeyIndex];
    // Alternate to the next key for the next request
    currentKeyIndex = (currentKeyIndex + 1) % ELEVEN_KEYS.length;
    return key;
}

async function playCustomerVoice(text, voiceId = "WtIqwF5CWCkaZSGmvsm1") {
    const targetUrl = `https://api.us.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?`;
    
    // Use your deployed Cloudflare Worker URL here:
    const proxyUrl = `https://eleven-proxy.dsouzajason68.workers.dev/?url=${encodeURIComponent(targetUrl)}`;

    const token = "eyJhbGciOiJSUzI1NiIsImtpZCI6ImFhMmNiOTcyNTIzMzc3ZWRlMjE2MzQwYmNkNTg4MTA0MTQxZTYxY2MiLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoiTXIgQiIsInBpY3R1cmUiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NMRnV2N2RTeHlRTnU5b1A1RWhYZ2pVdWtvckFBM2RFOHZ2aUg0Qkp0aF9ldzJiNXktXz1zOTYtYyIsIndvcmtzcGFjZV9pZCI6ImIyZmY4YjIyYjIwNjQxZmZhMGYxNThhZjIxZWM3ZWQxIiwid29ya3NwYWNlX3VzZXJfaWQiOiJ1c2VyXzM2MDFreGR4eHpubWVuNHM1ZXp5OHRqZHhkdzAiLCJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20veGktbGFicyIsImF1ZCI6InhpLWxhYnMiLCJhdXRoX3RpbWUiOjE3ODM5NTI3NzAsInVzZXJfaWQiOiJpaU9velN3d1dHZVdzOW1MVWlRU2tsUlR6V1cyIiwic3ViIjoiaWlPb3pTd3dXR2VXczltTFVpUVNrbFJUeldXMiIsImlhdCI6MTc4Nzk3ODk3NywiZXhwIjoxNzg3OTgyNTc3LCJlbWFpbCI6ImRzb3V6YWphc29uNjhAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImZpcmViYXNlIjp7ImlkZW50aXRpZXMiOnsiZ29vZ2xlLmNvbSI6WyIxMDQzNTIwODYzMjE2NjU1NTk0NDgiXSwiZW1haWwiOlsiZHNvdXphamFzb242OEBnbWFpbC5jb20iXX0sInNpZ25faW5fcHJvdmlkZXIiOiJnb29nbGUuY29tIn19.Pyfass8whW_hNSHtmpObTHeubgl1eR0vqp7eSX_nQyAMKvvFNC2EAB8-YSYT8nvn6ZrzKwt7cJkAu6ikKgkBvC151l0BPWQ89AkkHfSvlCZ2ia9obcLB2jr42EoX1UoNnFBhd5l2QZJd4gkFDtfb_t9iSOEEs5M8AAGLWnuipHGg5qjzoHzVT0ZYlwj_26uxvEkA83bNBfARFZxiyWl5gRaXxL88MeR3neIYJ52k73B3WryAM5Kxz62jOOR_soKtxMX102NwZlPxDXX2Z95KD29577YZlXFaH3YdYHC9yOVvVNCnlzhoHNniKoJB9EON_Ko81762tKX9SY74Ow5GcA";

    try {
        const response = await fetch(proxyUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                text: text,
                model_id: "eleven_flash_v2"
            })
        });

        if (!response.ok) {
			const errorText = await response.text();
			console.error("ElevenLabs Error Details:", response.status, errorText);
			return;
		}

        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audio.play().catch(() => {
			// If blocked on initial load, play as soon as the user clicks anywhere on the screen
			const unlockAudio = () => {
				audio.play().catch(() => {});
				window.removeEventListener('pointerdown', unlockAudio);
			};
			window.addEventListener('pointerdown', unlockAudio);
		});

    } catch (err) {
        console.error("Fetch error:", err);
    }
}

let hasLime = false;
let limeTexture;
let limeProgram, limeQuadBuffer;

const limeVS = `
    attribute vec2 aPosition;
    uniform vec2 uResolution;
    uniform vec2 uCenter;
    uniform float uAngle;
    uniform vec2 uHalfSize;
    varying vec2 vUv;

    void main() {
        mat2 rot = mat2(cos(uAngle), -sin(uAngle), sin(uAngle), cos(uAngle));
        vec2 worldPos = uCenter + rot * (aPosition * uHalfSize);
        vec2 zeroToOne = (worldPos * 100.0) / uResolution;
        vec2 clipSpace = (zeroToOne * 2.0) - 1.0;
        gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
        vUv = aPosition * 0.5 + 0.5;
    }
`;

const limeFS = `
    precision mediump float;
    uniform sampler2D uTexture;
    varying vec2 vUv;

    void main() {
        vec4 texColor = texture2D(uTexture, vUv);
        if (texColor.a < 0.05) discard;
        gl_FragColor = texColor;
    }
`;

function initLimeTexture() {
    limeTexture = gl.createTexture();
    const img = new Image();
    img.src = 'lime.png';
    img.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, limeTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    };
}

function renderLime() {
    if (!hasLime) return;

    gl.useProgram(limeProgram);
    gl.uniform2f(gl.getUniformLocation(limeProgram, 'uResolution'), canvas.width, canvas.height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, limeTexture);
    gl.uniform1i(gl.getUniformLocation(limeProgram, 'uTexture'), 0);

    const pos = cupBody ? cupBody.GetPosition() : { x: 0, y: 0 };
    // Positioned at the top-right lip of the glass
    gl.uniform2f(gl.getUniformLocation(limeProgram, 'uCenter'), 2.50 + pos.x, 2.75 + pos.y);
    gl.uniform1f(gl.getUniformLocation(limeProgram, 'uAngle'), 0.7); // Slight tilt to wedge onto the rim
    gl.uniform2f(gl.getUniformLocation(limeProgram, 'uHalfSize'), 0.4, 0.3); // Width & height scale

    gl.bindBuffer(gl.ARRAY_BUFFER, limeQuadBuffer);
    const posAttr = gl.getAttribLocation(limeProgram, 'aPosition');
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

// --- Sloshing Sound Controller ---
const sloshAudio = new Audio('slosh.mp3');
sloshAudio.loop = true;
let isSloshingPlaying = false;

function updateSloshAudio(velocity) {
    if (!isMixingMode || !isDraggingCup) {
        if (isSloshingPlaying) {
            sloshAudio.pause();
            isSloshingPlaying = false;
        }
        return;
    }

    const speed = Math.abs(velocity);
    if (speed > 1.2) {
        sloshAudio.volume = Math.min(1.0, (speed - 1.0) / 10.0);
        if (!isSloshingPlaying) {
            sloshAudio.play().catch(() => {});
            isSloshingPlaying = true;
        }
    } else if (isSloshingPlaying) {
        sloshAudio.pause();
        isSloshingPlaying = false;
    }
}


let bgTexture;

function initBgTexture() {
    bgTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, bgTexture);
    // Temporary 1x1 placeholder pixel while image loads
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([30, 18, 12, 255]));

    const img = new Image();
    img.src = 'background1.jpg'; // Path to the bar background image
    img.onload = () => {
        gl.bindTexture(gl.TEXTURE_2D, bgTexture);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    };
}

// Carbonation strength per ingredient (0.0 = still, 1.0 = highly carbonated)
const CARBONATION_MAP = {
    'champagne': 1.0,
    'ginger-beer': 0.85,
    'lemonade': 0.60
};

function calculateMixtureCarbonation() {
    const count = particleSystem.GetParticleCount();
    if (count === 0) return 0.0;
    let totalFizz = 0.0;
    for (let i = 0; i < count; i++) {
        totalFizz += CARBONATION_MAP[particleTypes[i]] || 0.0;
    }
    return totalFizz / count; // Returns exact proportional fizz of the blend
}

const glassVS = `
    attribute vec2 aPosition;
    varying vec2 vUv;
    void main() {
        vUv = aPosition * 0.5 + 0.5;
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`;

const glassFS = `
    precision mediump float;
    uniform sampler2D uFluidTexture;
    uniform vec2 uResolution;
    uniform vec2 uTexelSize;
    uniform vec2 uCupOffset;
    uniform bool uIsFrontPass;
    uniform bool uIsMixing;
    varying vec2 vUv;

    void main() {
        float worldX = (vUv.x / (uTexelSize.x * 100.0)) - uCupOffset.x;
        float worldY = ((1.0 - vUv.y) / (uTexelSize.y * 100.0)) - uCupOffset.y;

        // Bottom Cup Geometry
        float yBottomLip = 2.72;
        float yBottomFloor = 4.45;
        float yBaseBottom = 4.60;

        float leftOuter  = 1.07 + (worldY - 3.60) * 0.0913;
        float rightOuter = 2.53 - (worldY - 3.60) * 0.0913;
        float leftInner  = 1.15 + (worldY - 3.60) * 0.0913;
        float rightInner = 2.45 - (worldY - 3.60) * 0.0913;

        float baseLeft  = 1.04;
        float baseRight = 2.56;

        // Top Inverted Shaker Geometry
        float yTopRoof = 1.04;
        float topLeftOuter  = 1.07 - (worldY - 1.92) * 0.0913;
        float topRightOuter = 2.53 + (worldY - 1.92) * 0.0913;
        float topLeftInner  = 1.15 - (worldY - 1.92) * 0.0913;
        float topRightInner = 2.45 + (worldY - 1.92) * 0.0913;

        float minY = (uIsMixing) ? yTopRoof : yBottomLip;

        if (worldY < minY || worldY > yBaseBottom) discard;

        // Regions
        bool isBottomWall = (worldY >= yBottomLip && worldY <= yBottomFloor) && 
                            ((worldX >= leftOuter && worldX <= leftInner) || (worldX >= rightInner && worldX <= rightOuter));
        bool isHeavyBase  = (worldY >= yBottomFloor && worldY <= yBaseBottom && worldX >= baseLeft && worldX <= baseRight);
        bool isBottomBack = (worldY >= yBottomLip && worldY <= yBottomFloor && worldX > leftInner && worldX < rightInner);
        bool isBottomRim  = (worldY >= yBottomLip && worldY <= yBottomLip + 0.06 && worldX >= leftOuter && worldX <= rightOuter);

        bool isTopWall = uIsMixing && (worldY >= yTopRoof + 0.06 && worldY < yBottomLip) &&
                         ((worldX >= topLeftOuter && worldX <= topLeftInner) || (worldX >= topRightInner && worldX <= topRightOuter));
        bool isTopRoof = uIsMixing && (worldY >= yTopRoof && worldY <= yTopRoof + 0.08 && worldX >= 1.08 && worldX <= 2.52);
        bool isTopBack = uIsMixing && (worldY >= yTopRoof + 0.08 && worldY < yBottomLip && worldX > topLeftInner && worldX < topRightInner);

        vec3 crystalTint = vec3(1.0, 0.94, 0.86);
        vec3 lightDir = normalize(vec3(-0.35, 0.75, 0.55));
		vec3 warmGlintColor = vec3(1.0, 0.92, 0.75); // Amber/gold specular gleams

        if (!uIsFrontPass) {
            // ==================== PASS 1: BACK GLASS & BASE ====================
            if (isBottomBack || isTopBack) {
                float bowlDist = abs((worldX - 1.80) / 0.65);
                float backRefraction = pow(bowlDist, 2.0) * 0.08;
                gl_FragColor = vec4(crystalTint * 1.05, backRefraction);
            } else if (isHeavyBase || isTopRoof) {
                float baseUvX = abs(worldX - 1.80) / 0.72;
                float bevel = smoothstep(0.95, 0.70, baseUvX);
                gl_FragColor = vec4(crystalTint * 0.95, 0.25 + 0.20 * (1.0 - bevel));
            } else {
                discard;
            }
        } else {
            // ==================== PASS 2: FRONT OPTICAL REFRACTION & SPECULAR ====================
            if (isBottomWall || isBottomRim || isHeavyBase || isTopWall || isTopRoof) {
                float lOuter = (worldY < yBottomLip && uIsMixing) ? topLeftOuter : leftOuter;
                float lInner = (worldY < yBottomLip && uIsMixing) ? topLeftInner : leftInner;
                float rInner = (worldY < yBottomLip && uIsMixing) ? topRightInner : rightInner;
                float rOuter = (worldY < yBottomLip && uIsMixing) ? topRightOuter : rightOuter;

                // Surface normal across the curved glass thickness
                float nx = (worldX < 1.80) ? (lOuter - worldX) / (lInner - lOuter) 
                                           : (worldX - rInner) / (rOuter - rInner);
                nx = clamp(nx, -1.0, 1.0);
                vec3 normal = normalize(vec3(nx * 1.8, 0.0, 1.0));

                // 1. Refraction through Glass Wall Thickness (Snell's Law distortion)
                vec2 refractedUv = vUv + vec2(normal.x * 0.022, 0.0);
                vec4 fluidSample = texture2D(uFluidTexture, refractedUv);
                float fluidDensity = fluidSample.a;
                vec3 fluidColor = (fluidDensity > 0.01) ? (fluidSample.rgb / max(fluidDensity, 0.0001)) : vec3(1.0);
                float hasFluid = smoothstep(0.01, 0.15, fluidDensity);

                vec3 transmitted = mix(crystalTint, fluidColor * 0.95 + crystalTint * 0.10, hasFluid * 0.75);

                // 2. Studio Specular Strips & Fresnel
                float studioStripL = pow(max(dot(normal, lightDir), 0.0), 28.0) * 0.75;
                float studioStripR = pow(max(dot(normal, vec3(0.5, 0.4, 0.7)), 0.0), 20.0) * 0.45;
                float edgeFresnel  = pow(clamp(1.0 - normal.z, 0.0, 1.0), 2.8) * 0.70;
                float lipHighlight = isBottomRim ? pow(smoothstep(yBottomLip + 0.05, yBottomLip, worldY), 2.0) * 0.85 : 0.0;

                vec3 specularGlints = warmGlintColor * (studioStripL * 1.1 + studioStripR * 0.6 + edgeFresnel + lipHighlight);
                vec3 frontShaded = transmitted * 0.28 + specularGlints;
                float frontAlpha = clamp(studioStripL + studioStripR + edgeFresnel * 0.80 + lipHighlight + (hasFluid * 0.35) + 0.10, 0.0, 0.95);

                gl_FragColor = vec4(frontShaded, frontAlpha);
            } else {
                discard;
            }
        }
    }
`;

function renderGlassware(isFrontPass) {
    gl.useProgram(glassProgram);
    gl.uniform2f(gl.getUniformLocation(glassProgram, 'uResolution'), canvas.width, canvas.height);
    gl.uniform2f(gl.getUniformLocation(glassProgram, 'uTexelSize'), 1.0 / canvas.width, 1.0 / canvas.height);
    
    const pos = cupBody ? cupBody.GetPosition() : { x: 0, y: 0 };
    gl.uniform2f(gl.getUniformLocation(glassProgram, 'uCupOffset'), pos.x, pos.y);
    gl.uniform1i(gl.getUniformLocation(glassProgram, 'uIsFrontPass'), isFrontPass ? 1 : 0);
	gl.uniform1i(gl.getUniformLocation(glassProgram, 'uIsMixing'), isMixingMode ? 1 : 0);
	
	// Pass fluid texture so front glass wall refracts the drink and table behind it
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboA.texture);
    gl.uniform1i(gl.getUniformLocation(glassProgram, 'uFluidTexture'), 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    const posAttr = gl.getAttribLocation(glassProgram, 'aPosition');
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

let glassProgram;

const bgVS = `
    attribute vec2 aPosition;
    varying vec2 vUv;
    void main() {
        vUv = aPosition * 0.5 + 0.5;
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`;

const bgFS = `
    precision mediump float;
    uniform sampler2D uFluidTexture;
    uniform sampler2D uBgTexture;
    uniform vec2 uResolution;
    uniform vec2 uCupOffset;
    varying vec2 vUv;

    void main() {
        // Sample the background bar image with matching aspect ratio crop
        // 1. Center-crop the wide (16:9) image horizontally to fit the portrait canvas without squishing:
        float imgAspect = 625.0 / 350.0;
        float canvasAspect = uResolution.x / uResolution.y; // 360/480 = 0.75
        
        vec2 bgUv = vUv;
        bgUv.x = (bgUv.x - 0.5) * (canvasAspect / imgAspect) * 1.0 + 0.5; // Horizontal center-crop & zoom
        bgUv.y = bgUv.y * 0.70 + 0.18; // Adjust vertical crop: pushes wooden table right under the cup

        vec3 sceneBg = texture2D(uBgTexture, bgUv).rgb;

        float tableY = 0.085; // Countertop horizon line

        // Sample cup base fluid color & density
        vec4 fluidSample = texture2D(uFluidTexture, vec2(0.5 + uCupOffset.x * 0.1, 0.14 - uCupOffset.y * 0.1));
        float liquidAmount = clamp(fluidSample.a * 6.0, 0.0, 1.0);
        vec3 liquidColor = (fluidSample.a > 0.01) ? (fluidSample.rgb / fluidSample.a) : vec3(1.0);

        // Warm ambient bar lighting adjustments & contact shadow on wooden bar
        if (vUv.y <= tableY) {
            float cupLift = max(0.0, -uCupOffset.y);
            float dx = (vUv.x - (0.5 + uCupOffset.x * 0.1)) / (0.20 + cupLift * 0.15);
            float dy = (tableY - vUv.y) * (20.0 / (1.0 + cupLift * 3.0));

            // Deep, warm contact shadow
            float contactShadow = exp(-dx * dx * 1.8 - dy * dy * 5.5) * 0.65 * exp(-cupLift * 12.0);
            sceneBg *= (1.0 - contactShadow);

            // Warm golden & liquid caustic pool under the glass
            float causticPattern = exp(-dx * dx * 4.0 - dy * dy * 14.0) * exp(-cupLift * 7.0);
            vec3 warmCaustic = mix(vec3(1.0, 0.65, 0.25), liquidColor * 1.4, liquidAmount * 0.85);
            sceneBg += warmCaustic * causticPattern * 0.45;
        }

        gl_FragColor = vec4(sceneBg, 1.0);
    }
`;

let bgProgram;

function renderBackground() {
    gl.useProgram(bgProgram);
    gl.uniform2f(gl.getUniformLocation(bgProgram, 'uResolution'), canvas.width, canvas.height);
    
    const pos = cupBody ? cupBody.GetPosition() : { x: 0, y: 0 };
    gl.uniform2f(gl.getUniformLocation(bgProgram, 'uCupOffset'), pos.x, pos.y);
	
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboA.texture);
    gl.uniform1i(gl.getUniformLocation(bgProgram, 'uFluidTexture'), 0);

    // Bind bar background texture to Unit 1
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bgTexture);
    gl.uniform1i(gl.getUniformLocation(bgProgram, 'uBgTexture'), 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    const posAttr = gl.getAttribLocation(bgProgram, 'aPosition');
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
}

//ICE Shaders
const iceVS = `
    attribute vec2 aPosition;
    uniform vec2 uResolution;
    uniform vec2 uCenter;
    uniform float uAngle;
    uniform vec2 uHalfSize;
    varying vec2 vLocalPos;
    varying vec2 vScreenUv;

    void main() {
        mat2 rot = mat2(cos(uAngle), -sin(uAngle), sin(uAngle), cos(uAngle));
        vec2 worldPos = uCenter + rot * (aPosition * uHalfSize);
        vec2 zeroToOne = (worldPos * 100.0) / uResolution;
        vec2 clipSpace = (zeroToOne * 2.0) - 1.0;
        gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
        vLocalPos = aPosition;
        vScreenUv = vec2(zeroToOne.x, 1.0 - zeroToOne.y);
    }
`;

const iceFS = `
    precision mediump float;
    uniform sampler2D uFluidTexture;
    uniform vec2 uTexelSize;
    varying vec2 vLocalPos;
    varying vec2 vScreenUv;

    vec2 hash2(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return fract(sin(p) * 43758.5453123);
    }

    float voronoi(vec2 p) {
        vec2 n = floor(p);
        vec2 f = fract(p);
        float md = 8.0;
        for (int j = -1; j <= 1; j++) {
            for (int i = -1; i <= 1; i++) {
                vec2 g = vec2(float(i), float(j));
                vec2 o = hash2(n + g);
                vec2 r = g + o - f;
                float d = dot(r, r);
                if (d < md) md = d;
            }
        }
        return sqrt(md);
    }

    void main() {
        // Domain-warping for natural melting / organic ice surface
        vec2 warp = vec2(sin(vLocalPos.y * 6.0 + 1.2), cos(vLocalPos.x * 6.0 + 0.8)) * 0.05;
        vec2 p = vLocalPos + warp;

        // Rounded wobbly box SDF
        vec2 d = abs(p) - vec2(0.82);
        float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 0.12;
        if (dist > 0.0) discard;

        // Multi-octave internal caustics, bubbles, and stress fractures
        float v1 = voronoi(p * 3.2);
        float v2 = voronoi(p * 7.5 + vec2(1.7, 3.2));
        float v3 = voronoi(p * 14.0);

        // Sharp caustic ribbons & fracture facets (as seen in the reference)
        float caustics = pow(1.0 - abs(sin(v1 * 4.5)), 4.0) * 0.65;
        float cracks   = smoothstep(0.06, 0.0, v2) * 0.45;
        float bubbles  = smoothstep(0.04, 0.0, v3) * 0.35;
        float internalGlints = caustics + cracks + bubbles;

        // Faceted normal perturbation for glassy refraction
        vec2 normal2D = normalize(vLocalPos) * smoothstep(-0.3, 0.0, dist);
        normal2D += vec2(v1 - 0.5, v2 - 0.5) * 0.42;
        normal2D += vec2(cos(v3 * 6.28), sin(v3 * 6.28)) * 0.15;

        // Refraction offset sampling fluid behind the ice
        vec2 refractedUv = vScreenUv + normal2D * 0.035;
        vec4 sampleDirect = texture2D(uFluidTexture, refractedUv);
        vec4 sampleSideL  = texture2D(uFluidTexture, vec2(vScreenUv.x - 0.08, vScreenUv.y));
        vec4 sampleSideR  = texture2D(uFluidTexture, vec2(vScreenUv.x + 0.08, vScreenUv.y));

        float fluidDensity = max(sampleDirect.a, max(sampleSideL.a, sampleSideR.a));
        vec3 fluidColor = (sampleDirect.a > 0.01) ? (sampleDirect.rgb / max(sampleDirect.a, 0.0001)) :
                          (sampleSideL.a > 0.01)  ? (sampleSideL.rgb / max(sampleSideL.a, 0.0001)) :
                          (sampleSideR.rgb / max(sampleSideR.a, 0.0001));

        float isSubmerged = smoothstep(0.006, 0.035, fluidDensity);

        // Crystal base & caustic light transmission
        vec3 crystalClear = vec3(0.88, 0.95, 1.0);
        vec3 submergedBase = fluidColor * 1.05 + vec3(0.04);
        vec3 transmitted = mix(crystalClear, submergedBase, isSubmerged);

        // 3D normals for multi-angle specular gleams
        vec3 n3D = normalize(vec3(normal2D * 2.2, 1.0));
        vec3 light1 = normalize(vec3(-0.4, 0.7, 0.65));
        vec3 light2 = normalize(vec3(0.6, 0.5, 0.60));

        // High-gloss specular reflections on wet melting facets
        float spec1 = pow(max(dot(n3D, light1), 0.0), 36.0);
        float spec2 = pow(max(dot(n3D, light2), 0.0), 24.0) * 0.5;
        float rim   = pow(1.0 - max(dot(n3D, vec3(0.0, 0.0, 1.0)), 0.0), 2.8);

        // Caustic highlight tint
        vec3 highlightColor = mix(vec3(0.95, 0.98, 1.0), fluidColor * 1.4 + vec3(0.3), isSubmerged * 0.5);
        vec3 highlights = internalGlints * highlightColor;

        // Final optical composite
        vec3 finalColor = transmitted * 0.78 + highlights * 0.75 + vec3(1.0) * (spec1 * 0.85 + spec2 + rim * 0.65);
        float alpha = smoothstep(0.0, -0.03, dist) * mix(0.85, 0.98, clamp(internalGlints + rim, 0.0, 1.0));

        gl_FragColor = vec4(finalColor, alpha);
    }
`;

let iceProgram, iceQuadBuffer;
let iceCubes = [];
let lastIceSpawnTime = 0;

function spawnIce(worldX, worldY) {
    const bodyDef = new b2BodyDef();
    bodyDef.type = b2_dynamicBody;
    bodyDef.position.Set(worldX, worldY);

    const body = world.CreateBody(bodyDef);
    const shape = new b2PolygonShape();
    shape.SetAsBoxXY(0.16, 0.16); // Ice cube half-dimensions

    const fixtureDef = new b2FixtureDef();
    fixtureDef.shape = shape;
    fixtureDef.density = 0.92; // Lower density than liquid so it floats
    fixtureDef.friction = 0.0;
    fixtureDef.restitution = 0.1;
    body.CreateFixtureFromDef(fixtureDef);

    iceCubes.push(body);
}

function applyIceBuoyancy() {
    const positions = particleSystem.GetPositionBuffer();
    const pCount = particleSystem.GetParticleCount();
    if (!positions || pCount === 0) return;

    const sampleRadiusSq = 0.22 * 0.22;

    // Apply buoyancy for cherries in the same loop
	const allSolids = iceCubes.concat(cherries);
	for (let k = 0; k < allSolids.length; k++) {
		const solid = allSolids[k];
		const pos = solid.GetPosition();
		const vel = solid.GetLinearVelocity();
		let submergedCount = 0;

		for (let i = 0; i < pCount; i += 3) {
			const dx = positions[i * 2] - pos.x;
			const dy = positions[i * 2 + 1] - pos.y;
			if (dx * dx + dy * dy < sampleRadiusSq) {
				submergedCount++;
			}
		}

		if (submergedCount > 2) {
			const buoyancy = Math.min(submergedCount / 28.0, 1.15);
			solid.ApplyForce(new b2Vec2(0, -12.2 * buoyancy * solid.GetMass()), solid.GetWorldCenter());
			vel.x *= 0.94;
			vel.y *= 0.94;
			solid.SetAngularVelocity(solid.GetAngularVelocity() * 0.92);
		}
	}
}


function renderIceCubes() {
    if (iceCubes.length === 0) return;

    gl.useProgram(iceProgram);
    gl.uniform2f(gl.getUniformLocation(iceProgram, 'uResolution'), canvas.width, canvas.height);
    gl.uniform2f(gl.getUniformLocation(iceProgram, 'uTexelSize'), 1.0 / canvas.width, 1.0 / canvas.height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboA.texture);
    gl.uniform1i(gl.getUniformLocation(iceProgram, 'uFluidTexture'), 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, iceQuadBuffer);
    const posAttr = gl.getAttribLocation(iceProgram, 'aPosition');
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    for (let i = 0; i < iceCubes.length; i++) {
        const body = iceCubes[i];
        const pos = body.GetPosition();
        const angle = body.GetAngle();

        gl.uniform2f(gl.getUniformLocation(iceProgram, 'uCenter'), pos.x, pos.y);
        gl.uniform1f(gl.getUniformLocation(iceProgram, 'uAngle'), angle);
        gl.uniform2f(gl.getUniformLocation(iceProgram, 'uHalfSize'), 0.16, 0.16);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}

const cherryVS = `
    attribute vec2 aPosition;
    uniform vec2 uResolution;
    uniform vec2 uCenter;
    uniform float uAngle;
    uniform vec2 uHalfSize;
    varying vec2 vLocalPos;
    varying vec2 vScreenUv;

    void main() {
        mat2 rot = mat2(cos(uAngle), -sin(uAngle), sin(uAngle), cos(uAngle));
        vec2 worldPos = uCenter + rot * (aPosition * uHalfSize);
        vec2 zeroToOne = (worldPos * 100.0) / uResolution;
        vec2 clipSpace = (zeroToOne * 2.0) - 1.0;
        gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
        vLocalPos = aPosition;
        vScreenUv = vec2(zeroToOne.x, 1.0 - zeroToOne.y);
    }
`;

const cherryFS = `
    precision mediump float;
    uniform sampler2D uFluidTexture;
    uniform vec2 uTexelSize;
    varying vec2 vLocalPos;
    varying vec2 vScreenUv;

    void main() {
        // --- 1. Plump Cherry Body (Cleft at top, round at bottom) ---
        vec2 bp = vec2(abs(vLocalPos.x), vLocalPos.y);
        float cleft = smoothstep(0.0, 0.35, bp.x) * 0.08;
        float bodyDist = length(vec2(bp.x - 0.20, bp.y - cleft + 0.05)) - 0.42;

        // --- 2. Upward Stem (Arches towards top of screen) ---
        vec2 sp = vec2(vLocalPos.x, -vLocalPos.y); // Negative Y points upwards
        sp.y -= 0.22; // Emerges from top cleft
        float stemProgress = clamp(sp.y / 0.55, 0.0, 1.0);
        float stemCurveX = 0.16 * pow(stemProgress, 1.3);
        float stemSegY = clamp(sp.y, 0.0, 0.55);
        float stemDist = length(vec2(sp.x - stemCurveX, sp.y - stemSegY)) - 0.024;

        if (bodyDist > 0.0 && stemDist > 0.0) discard;

        // Surface normals
        vec2 normal2D = (bodyDist <= 0.0) 
            ? normalize(vec2(vLocalPos.x * 1.3, vLocalPos.y)) 
            : vec2(0.8, -0.2);

        // Fluid submersion sampling
        vec2 refractedUv = vScreenUv + normal2D * 0.02;
        vec4 sampleDirect = texture2D(uFluidTexture, refractedUv);
        vec4 sampleSideL  = texture2D(uFluidTexture, vec2(vScreenUv.x - 0.08, vScreenUv.y));
        vec4 sampleSideR  = texture2D(uFluidTexture, vec2(vScreenUv.x + 0.08, vScreenUv.y));

        float fluidDensity = max(sampleDirect.a, max(sampleSideL.a, sampleSideR.a));
        vec3 fluidColor = (sampleDirect.a > 0.01) ? (sampleDirect.rgb / max(sampleDirect.a, 0.0001)) :
                          (sampleSideL.a > 0.01)  ? (sampleSideL.rgb / max(sampleSideL.a, 0.0001)) :
                          (sampleSideR.rgb / max(sampleSideR.a, 0.0001));

        float isSubmerged = smoothstep(0.008, 0.035, fluidDensity);

        // Top-left illumination
        vec3 lightDir = normalize(vec3(-0.4, -0.65, 0.75));
        vec3 n3D = normalize(vec3(normal2D * 1.8, 1.0));
        float diff = clamp(dot(n3D, lightDir) * 0.6 + 0.4, 0.0, 1.0);
        float spec = pow(max(dot(n3D, lightDir), 0.0), 36.0);
        float rim  = pow(1.0 - max(dot(n3D, vec3(0.0, 0.0, 1.0)), 0.0), 2.5);

        vec3 finalColor = vec3(0.0);
        float alpha = 1.0;

        if (bodyDist <= 0.0) {
            // Ruby red gradient with glossy depth
            vec3 deepRed = mix(vec3(0.92, 0.04, 0.12), vec3(0.35, 0.005, 0.03), clamp(length(vLocalPos + vec2(0.12, 0.1)), 0.0, 1.0));
            vec3 submergedTone = mix(deepRed, deepRed * 0.4 + fluidColor * 0.7, isSubmerged);

            finalColor = submergedTone * (0.75 + 0.35 * diff) + vec3(1.0) * (spec * 0.85 + rim * 0.30);
            alpha = smoothstep(0.0, -0.025, bodyDist);
        } else {
            // Olive green to brown curved stem
            vec3 stemColor = mix(vec3(0.48, 0.64, 0.20), vec3(0.42, 0.30, 0.12), stemProgress);
            vec3 submergedStem = mix(stemColor, stemColor * 0.5 + fluidColor * 0.5, isSubmerged);
            finalColor = submergedStem * diff + vec3(1.0) * (spec * 0.35);
            alpha = smoothstep(0.0, -0.015, stemDist);
        }

        gl_FragColor = vec4(finalColor, alpha);
    }
`;

let cherryProgram, cherryQuadBuffer;
let cherries = [];
let lastCherrySpawnTime = 0;

function spawnCherry(worldX, worldY) {
    const bodyDef = new b2BodyDef();
    bodyDef.type = b2_dynamicBody;
    bodyDef.position.Set(worldX, worldY);

    const body = world.CreateBody(bodyDef);
    const shape = new b2PolygonShape();
    shape.SetAsBoxXY(0.08, 0.08);

    const fixtureDef = new b2FixtureDef();
    fixtureDef.shape = shape;
    fixtureDef.density = 0.90; // Same buoyancy density as ice
    fixtureDef.friction = 0.0;
    fixtureDef.restitution = 0.08;
    body.CreateFixtureFromDef(fixtureDef);

    cherries.push(body);
}

function renderCherries() {
    if (cherries.length === 0) return;

    gl.useProgram(cherryProgram);
    gl.uniform2f(gl.getUniformLocation(cherryProgram, 'uResolution'), canvas.width, canvas.height);
    gl.uniform2f(gl.getUniformLocation(cherryProgram, 'uTexelSize'), 1.0 / canvas.width, 1.0 / canvas.height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboA.texture);
    gl.uniform1i(gl.getUniformLocation(cherryProgram, 'uFluidTexture'), 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, cherryQuadBuffer);
    const posAttr = gl.getAttribLocation(cherryProgram, 'aPosition');
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    for (let i = 0; i < cherries.length; i++) {
        const body = cherries[i];
        const pos = body.GetPosition();
        const angle = body.GetAngle();

        gl.uniform2f(gl.getUniformLocation(cherryProgram, 'uCenter'), pos.x, pos.y);
        gl.uniform1f(gl.getUniformLocation(cherryProgram, 'uAngle'), angle);
        gl.uniform2f(gl.getUniformLocation(cherryProgram, 'uHalfSize'), 0.20, 0.24); // Quad bounding size

        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
}


let isMixingMode = false;
let isDraggingCup = false;
let dragStartY = 0;
let cupBaseY = 0;
let topCupFixtures = [];

function toggleShakerMode() {
    isMixingMode = !isMixingMode;
    const mixBtn = document.getElementById('btn-mix');
    mixBtn.classList.toggle('active', isMixingMode);

    if (isMixingMode) {
        // Allow the cup to move and push the liquid
        cupBody.SetType(b2_kinematicBody);

        // Spawn airtight inverted top cup fixtures directly on cupBody
        const topRoof = new b2PolygonShape();
        topRoof.SetAsBoxXYCenterAngle(0.65, 0.05, new b2Vec2(1.80, 1.08), 0.0);
        topCupFixtures.push(cupBody.CreateFixtureFromShape(topRoof, 0.0));

        const topLeftWall = new b2PolygonShape();
        topLeftWall.SetAsBoxXYCenterAngle(0.05, 0.84, new b2Vec2(1.11, 1.92), 0.091);
        topCupFixtures.push(cupBody.CreateFixtureFromShape(topLeftWall, 0.0));

        const topRightWall = new b2PolygonShape();
        topRightWall.SetAsBoxXYCenterAngle(0.05, 0.84, new b2Vec2(2.49, 1.92), -0.091);
        topCupFixtures.push(cupBody.CreateFixtureFromShape(topRightWall, 0.0));
    } else {
        // Remove top cup fixtures
        for (let i = 0; i < topCupFixtures.length; i++) {
            cupBody.DestroyFixture(topCupFixtures[i]);
        }
        topCupFixtures = [];

        // Return cup to original base position
        cupBody.SetLinearVelocity(new b2Vec2(0, 0));
        cupBody.SetTransform(new b2Vec2(0, 0), 0);
        cupBody.SetType(b2_staticBody);
    }
	updateSloshAudio(0);
}

document.getElementById('btn-mix').addEventListener('click', () => {
    isPointerDown = false;
    isDraggingCup = false;
    toggleShakerMode();
});

const cupVS = `
    attribute vec2 aPosition;
    uniform vec2 uResolution;
    void main() {
        vec2 zeroToOne = aPosition / uResolution;
        vec2 clipSpace = (zeroToOne * 2.0) - 1.0;
        gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
    }
`;

const cupFS = `
    precision mediump float;
    uniform vec4 uColor;
    void main() {
        gl_FragColor = uColor;
    }
`;

const RECIPES = {
    // ☕ Coffee Drinks
    "Macchiato": {
        'espresso': 0.80,
        'milk': 0.20
    },
    "Cortado": {
        'espresso': 0.50,
        'milk': 0.50
    },
    "Flat White": {
        'milk': 0.65,
        'espresso': 0.35
    },

    // 🍋 Highballs & Sparklers
    "Vodka Lemonade": {
        'lemonade': 0.75,
        'vodka': 0.25
    },
    "Rum Lemonade": {
        'lemonade': 0.75,
        'rum': 0.25
    },
    "Moscow Mule": {
        'ginger-beer': 0.60,
        'vodka': 0.30,
        'lime-juice': 0.10
    },
    "Mimosa": {
        'champagne': 0.50,
        'orange-juice': 0.50
    },
    "French 75": {
        'champagne': 0.50,
        'vodka': 0.25,
        'lime-juice': 0.15,
        'simple-syrup': 0.10
    },

    // 🍷 Cocktails & Mixed Drinks
    "Red Sangria": {
        'wine': 0.55,
        'orange-juice': 0.20,
        'brandy': 0.15,
        'orange-liqueur': 0.10
    },
    "Bloody Mary": {
        'tomato-juice': 0.65,
        'vodka': 0.25,
        'lime-juice': 0.10
    },
    "Fresh Lime Margaritas": {
        'tequila': 0.50,
        'lime-juice': 0.25,
        'triple-sec': 0.15,
        'simple-syrup': 0.10
    },
    "White Russian": {
        'vodka': 0.40,
        'coffee-liqueur': 0.30,
        'milk': 0.30
    },
    "Espresso Martini": {
        'vodka': 0.40,
        'espresso': 0.30,
        'coffee-liqueur': 0.20,
        'simple-syrup': 0.10
    }
};

// Cup boundary vertices for rendering
const cupGeometry = {
    left:  { center: [2.35, 3.8], half: [0.07, 1.4], angle:  0.075 },
    right: { center: [4.65, 3.8], half: [0.07, 1.4], angle: -0.075 },
    bottom:{ center: [3.50, 5.2], half: [1.15, 0.07], angle: 0.0 }
};

// -------------------------------------------------------------
// WebGL Shaders
// -------------------------------------------------------------

// Particle Splat Vertex Shader
const splatVS = `
    attribute vec2 aPosition;
    attribute vec4 aColor;
    varying vec4 vColor;
    uniform vec2 uResolution;
    uniform float uPointSize;

    void main() {
        vColor = aColor;
        vec2 zeroToOne = aPosition / uResolution;
        vec2 clipSpace = (zeroToOne * 2.0) - 1.0;
        gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
        gl_PointSize = uPointSize;
    }
`;

const splatFS = `
    precision mediump float;
    varying vec4 vColor;

    void main() {
        vec2 coord = gl_PointCoord * 2.0 - 1.0;
        float rSq = dot(coord, coord);
        if (rSq > 1.0) discard;

        float density = (1.0 - rSq) * (1.0 - rSq) * 0.055;
        
        // Weight both color and density by particle optical opacity
        float weight = vColor.a * density;
        gl_FragColor = vec4(vColor.rgb * weight, weight);
    }
`;

const renderFS = `
    precision mediump float;
    uniform sampler2D uFluidTexture;
    uniform vec2 uTexelSize;
    uniform float uThreshold;
    uniform vec2 uCupOffset;
    uniform bool uIsMixing;
    uniform float uTime;
    varying vec2 vUv;
    uniform float uCarbonation;

    // Fast 2D hash for sparkling bubble seeds
    float hash21(vec2 p) {
        p = fract(p * vec2(234.34, 435.345));
        p += dot(p, p + 34.23);
        return fract(p.x * p.y);
    }

    void main() {
        float worldX = (vUv.x / (uTexelSize.x * 100.0)) - uCupOffset.x;
        float worldY = ((1.0 - vUv.y) / (uTexelSize.y * 100.0)) - uCupOffset.y;

        float minX = 1.15 + (worldY - 3.60) * 0.0913;
        float maxX = 2.45 - (worldY - 3.60) * 0.0913;
        if (uIsMixing && worldY < 2.76) {
            minX = 1.15 - (worldY - 1.92) * 0.0913;
            maxX = 2.45 + (worldY - 1.92) * 0.0913;
        }

        float minY = uIsMixing ? 1.05 : 0.0;
        if (worldY > 4.40 || worldY < minY || worldX < minX || worldX > maxX) {
            discard;
        }

        vec4 sampleCenter = texture2D(uFluidTexture, vUv);
        float density = sampleCenter.a;

        // Crisp 1-pixel surface boundary (eliminates the top blurry rim)
        float boundaryAlpha = smoothstep(uThreshold, uThreshold + 0.001, density);
        if (boundaryAlpha < 0.01) discard;

        // Extract true liquid color & its inherent opacity
        vec3 liquidBase = clamp(sampleCenter.rgb / max(density, 0.0001), 0.0, 1.0);
        float bulkDensity = max(density, texture2D(uFluidTexture, vUv - vec2(0.0, uTexelSize.y * 10.0)).a);
        
        // Inherent drink opacity: Espresso/Milk = 1.0 (opaque), Lemonade = ~0.65, Vodka = ~0.30
        float liquidOpacity = clamp(bulkDensity * 4.2, 0.28, 1.0);

        float left   = texture2D(uFluidTexture, vUv - vec2(uTexelSize.x * 4.0, 0.0)).a;
        float right  = texture2D(uFluidTexture, vUv + vec2(uTexelSize.x * 4.0, 0.0)).a;
        float top    = texture2D(uFluidTexture, vUv + vec2(0.0, uTexelSize.y * 4.0)).a;
        float bottom = texture2D(uFluidTexture, vUv - vec2(0.0, uTexelSize.y * 4.0)).a;

        vec2 gradient = vec2(right - left, bottom - top);
        vec3 normal = normalize(vec3(gradient * 5.0, 1.0));

        // 1. Direct Front Key Light & Specular Sheen
        vec3 lightDir = normalize(vec3(-0.35, 0.65, 0.75));
        float diff = clamp(dot(normal, lightDir) * 0.35 + 0.65, 0.0, 1.0);

        vec3 viewDir = vec3(0.0, 0.0, 1.0);
        vec3 halfDir = normalize(lightDir + viewDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), 32.0);

        // 2. Back-Lit Subsurface Scattering
        vec3 backLightDir = normalize(vec3(0.20, 0.45, -0.88));
        float forwardScatter = pow(clamp(dot(-viewDir, backLightDir - normal * 0.35), 0.0, 1.0), 3.0);
        vec3 warmScatter = vec3(1.05, 0.85, 0.65) * (forwardScatter * 0.30 + smoothstep(0.02, 0.18, density) * 0.15);
        float sssIntensity = forwardScatter * 0.35 + smoothstep(0.02, 0.18, density) * 0.15;

        // 3. Enlarged Rising Spherical Carbonation Bubbles
        vec2 bUv1 = vec2(worldX * 12.0 + sin(worldY * 6.0 + uTime * 1.5) * 0.15, worldY * 16.0 + uTime * 2.2);
        vec2 bUv2 = vec2(worldX * 24.0 + cos(worldY * 9.0 + uTime * 2.0) * 0.15, worldY * 30.0 + uTime * 3.6);

        // Layer 1: Prominent primary bubbles
        vec2 cell1 = floor(bUv1);
        vec2 f1 = fract(bUv1) - 0.5;
        float rnd1 = hash21(cell1);
        vec2 offset1 = (vec2(hash21(cell1 + 0.3), hash21(cell1 + 0.7)) - 0.5) * 0.45;
        float dist1 = length(f1 + offset1);
        float b1 = smoothstep(0.22, 0.02, dist1) * step(0.55, rnd1);
        float b1_glint = smoothstep(0.08, 0.0, length(f1 + offset1 + vec2(-0.04, 0.04))) * step(0.55, rnd1);

        // Layer 2: Medium secondary bubbles
        vec2 cell2 = floor(bUv2);
        vec2 f2 = fract(bUv2) - 0.5;
        float rnd2 = hash21(cell2);
        vec2 offset2 = (vec2(hash21(cell2 + 0.4), hash21(cell2 + 0.8)) - 0.5) * 0.45;
        float dist2 = length(f2 + offset2);
        float b2 = smoothstep(0.18, 0.02, dist2) * step(0.62, rnd2);
        float b2_glint = smoothstep(0.06, 0.0, length(f2 + offset2 + vec2(-0.03, 0.03))) * step(0.62, rnd2);

        float bubbleBody = (b1 * 0.50 + b2 * 0.38) * smoothstep(0.03, 0.25, density) * uCarbonation;
        float bubbleGlint = (b1_glint * 0.75 + b2_glint * 0.55) * smoothstep(0.03, 0.25, density) * uCarbonation;

        vec3 bubbleColor = mix(liquidBase * 1.5 + vec3(0.30), vec3(1.0, 0.98, 0.92), 0.75);

        // Volumetric depth gradient (rich core, translucent glowing edges)
        float depthGrad = smoothstep(0.02, 0.25, density);
        vec3 volumeColor = mix(liquidBase * 1.15, liquidBase * 0.90, depthGrad * 0.35);

        // 4. Final Composite
        vec3 shaded = volumeColor * (0.75 * diff + warmScatter) + (bubbleBody * bubbleColor) + vec3(1.0) * (spec * 0.35 + bubbleGlint);

        // 5. Solid edge for opaque drinks (espresso/milk = 1.0 solid to the edge, vodka/lemonade = translucent)
        float drinkBulkOpacity = smoothstep(0.02, 0.26, density);
        float finalAlpha = boundaryAlpha * liquidOpacity;

        gl_FragColor = vec4(shaded, finalAlpha);
    }
`;

// Fullscreen Quad Vertex Shader
const quadVS = `
    attribute vec2 aPosition;
    varying vec2 vUv;
    void main() {
        vUv = aPosition * 0.5 + 0.5;
        gl_Position = vec4(aPosition, 0.0, 1.0);
    }
`;

// Separable Blur Filter Fragment Shader
const blurFS = `
    precision mediump float;
    uniform sampler2D uTexture;
    uniform vec2 uTexelOffset;
    varying vec2 vUv;

    void main() {
        vec4 sum = vec4(0.0);
        sum += texture2D(uTexture, vUv - uTexelOffset * 3.0) * 0.05;
        sum += texture2D(uTexture, vUv - uTexelOffset * 2.0) * 0.12;
        sum += texture2D(uTexture, vUv - uTexelOffset * 1.0) * 0.23;
        sum += texture2D(uTexture, vUv)                      * 0.40;
        sum += texture2D(uTexture, vUv + uTexelOffset * 1.0) * 0.23;
        sum += texture2D(uTexture, vUv + uTexelOffset * 2.0) * 0.12;
        sum += texture2D(uTexture, vUv + uTexelOffset * 3.0) * 0.05;
        gl_FragColor = sum;
    }
`;



// -------------------------------------------------------------
// WebGL Context & Resource Setup
// -------------------------------------------------------------

let gl;
let splatProgram, blurProgram, renderProgram;
let quadBuffer, particlePosBuffer, particleMixBuffer;
let fboA, fboB;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createProgram(gl, vsSource, fsSource) {
    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        return null;
    }
    return program;
}

function createFramebuffer(gl, width, height) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    return { fbo, texture, width, height };
}

function initWebGL() {
    gl = canvas.getContext('webgl', { alpha: true, antialias: true });
    if (!gl) {
        alert('WebGL not supported on this browser.');
        return;
    }

    splatProgram = createProgram(gl, splatVS, splatFS);
    blurProgram  = createProgram(gl, quadVS, blurFS);
    renderProgram= createProgram(gl, quadVS, renderFS);
	bgProgram = createProgram(gl, bgVS, bgFS);
	glassProgram = createProgram(gl, glassVS, glassFS);
	initBgTexture();
	
	cupProgram = createProgram(gl, cupVS, cupFS);

	cupVertexBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, cupVertexBuffer);
	// Allocate dynamic vertex buffer space for the physics fixtures
	gl.bufferData(gl.ARRAY_BUFFER, 1024 * 4, gl.DYNAMIC_DRAW);
	
	iceProgram = createProgram(gl, iceVS, iceFS);
	iceQuadBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, iceQuadBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
		-1, -1,  1, -1, -1,  1,
		-1,  1,  1, -1,  1,  1
	]), gl.STATIC_DRAW);
	
	cherryProgram = createProgram(gl, cherryVS, cherryFS);
	cherryQuadBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, cherryQuadBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
		-1, -1,  1, -1, -1,  1,
		-1,  1,  1, -1,  1,  1
	]), gl.STATIC_DRAW);
	
	limeProgram = createProgram(gl, limeVS, limeFS);
	initLimeTexture();

	limeQuadBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, limeQuadBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
		-1, -1,  1, -1, -1,  1,
		-1,  1,  1, -1,  1,  1
	]), gl.STATIC_DRAW);

    // Fullscreen quad buffer
    quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,  1, -1, -1,  1,
        -1,  1,  1, -1,  1,  1
    ]), gl.STATIC_DRAW);

    particlePosBuffer = gl.createBuffer();
    particleMixBuffer = gl.createBuffer();

    fboA = createFramebuffer(gl, canvas.width, canvas.height);
    fboB = createFramebuffer(gl, canvas.width, canvas.height);
	
}

// -------------------------------------------------------------
// Physics Setup (LiquidFun)
// -------------------------------------------------------------

function initPhysics() {
    particleMix = [];
	particleTypes = [];
	iceCubes = [];
	cherries = [];
	hasLime = false;

    const gravity = new b2Vec2(0, 9.8);
    world = new b2World(gravity);

    createCupBodies();

    const psd = new b2ParticleSystemDef();
    psd.radius = PARTICLE_RADIUS;
    psd.dampingStrength = 0.10;
    psd.viscosityStrength = 0.05;
    psd.surfaceTensionStrength = 0.02;
    psd.colorMixingStrength = 0.01;

    particleSystem = world.CreateParticleSystem(psd);

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    loop();
}

function createCupBodies() {
    const cupBodyDef = new b2BodyDef();
    cupBody = world.CreateBody(cupBodyDef);

    // Half-sized cup walls centered at X=1.80m, Y=3.60m
    const leftWall = new b2PolygonShape();
    leftWall.SetAsBoxXYCenterAngle(0.05, 0.84, new b2Vec2(1.11, 3.60), -0.091);
    cupBody.CreateFixtureFromShape(leftWall, 0.0);

    const rightWall = new b2PolygonShape();
    rightWall.SetAsBoxXYCenterAngle(0.05, 0.84, new b2Vec2(2.49, 3.60), 0.091);
    cupBody.CreateFixtureFromShape(rightWall, 0.0);

    const bottom = new b2PolygonShape();
    bottom.SetAsBoxXYCenterAngle(0.65, 0.05, new b2Vec2(1.80, 4.45), 0.0);
    cupBody.CreateFixtureFromShape(bottom, 0.0);

    // Ground fixture
    const groundBodyDef = new b2BodyDef();
    const groundBody = world.CreateBody(groundBodyDef);
    const ground = new b2PolygonShape();
    ground.SetAsBoxXYCenterAngle(2.5, 0.1, new b2Vec2(1.80, 4.75), 0.0);
    groundBody.CreateFixtureFromShape(ground, 0.0);
}



function spawnLiquid(type, worldX, worldY) {
    const pgd = new b2ParticleGroupDef();
    
    const waterFlag   = typeof b2_waterParticle !== 'undefined' ? b2_waterParticle : 0;
    const viscousFlag = typeof b2_viscousParticle !== 'undefined' ? b2_viscousParticle : 0;
    const tensileFlag = typeof b2_tensileParticle !== 'undefined' ? b2_tensileParticle : 0;
    const mixingFlag  = typeof b2_colorMixingParticle !== 'undefined' ? b2_colorMixingParticle : 0;

    const shape = new b2PolygonShape();
    const halfSize = (type === 'milk') ? 0.035 : 0.03;

    shape.SetAsBoxXYCenterAngle(
        halfSize, halfSize,
        new b2Vec2(worldX + (Math.random() - 0.5) * 0.02, worldY + (Math.random() - 0.5) * 0.02),
        0
    );

    let r = 42, g = 18, b = 8, a = 250;

    if (type === 'espresso') {
        pgd.flags = waterFlag | mixingFlag;
        r = 72; g = 34; b = 14; a = 255; // Opaque espresso
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.1, 4.6);
    } else if (type === 'milk') {
        pgd.flags = waterFlag | mixingFlag;
        r = 255; g = 244; b = 218; a = 255; // Opaque milk
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.1, 4.6);
    } else if (type === 'syrup') {
        pgd.flags = waterFlag | viscousFlag | tensileFlag | mixingFlag;
        r = 235; g = 150; b = 15; a = 220; // Amber syrup
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.05, 3.2);
    } else if (type === 'vodka') {
        pgd.flags = waterFlag | mixingFlag;
        r = 245; g = 250; b = 255; a = 28; // Clear / crystalline transparent
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.1, 4.4);
    } else if (type === 'rum') {
        pgd.flags = waterFlag | mixingFlag;
        r = 245; g = 250; b = 255; a = 28; // Clear / warm light rum
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.1, 4.2);
    } else if (type === 'lemonade') {
        pgd.flags = waterFlag | mixingFlag;
        r = 235; g = 215; b = 100; a = 65; // Vibrant translucent yellow
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.1, 4.5);
    } else if (type === 'wine') {
        pgd.flags = waterFlag | mixingFlag;
        r = 145; g = 15; b = 50; a = 90; // Deep ruby violet (~80% transparency)
		//r = 232; g = 22; b = 58; a = 78;
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.1, 4.4);
    } else if (type === 'orange-liqueur') {
        pgd.flags = waterFlag | mixingFlag;
        r = 245; g = 130; b = 20; a = 76; // Glowing amber-orange (~70% transparency)
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.1, 4.3);
    } else if (type === 'brandy') {
        pgd.flags = waterFlag | mixingFlag;
        r = 185; g = 85; b = 22; a = 85; // Warm caramel cognac/amber (~67% transparency)
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.1, 4.3);
    } else if (type === 'lime-juice') {
        pgd.flags = waterFlag | mixingFlag;
        r = 185; g = 230; b = 55; a = 60; // Translucent vibrant citrus green-yellow
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.1, 4.4);
    } else if (type === 'ginger-beer') {
        pgd.flags = waterFlag | mixingFlag;
        r = 235; g = 210; b = 150; a = 120; // Cloudy straw golden haze
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.1, 4.3);
    } else if (type === 'champagne') {
        pgd.flags = waterFlag | tensileFlag | mixingFlag;
        r = 248; g = 230; b = 160; a = 75; // Effervescent pale golden sparkle
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.1, 4.5);
    } else if (type === 'orange-juice') {
        pgd.flags = waterFlag | mixingFlag;
        r = 250; g = 135; b = 15; a = 235; // Rich opaque citrus pulp orange
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.1, 4.4);
    } else if (type === 'triple-sec') {
        pgd.flags = waterFlag | mixingFlag;
        r = 245; g = 250; b = 255; a = 28; // Crisp transparent citrus liqueur
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.1, 4.3);
    } else if (type === 'tomato-juice') {
        pgd.flags = waterFlag | viscousFlag | mixingFlag;
        r = 195; g = 30; b = 22; a = 245; // Thick, dense savory crimson
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.08, 4.0);
    } else if (type === 'tequila') {
        pgd.flags = waterFlag | mixingFlag;
        r = 245; g = 250; b = 255; a = 28; // Clean platinum crystal clarity
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.1, 4.4);
    } else if (type === 'coffee-liqueur') {
        pgd.flags = waterFlag | viscousFlag | tensileFlag | mixingFlag;
        r = 105; g = 50; b = 20; a = 255; // Glossy deep roasted espresso liqueur
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.08, 3.8);
    } else if (type === 'simple-syrup') {
        pgd.flags = waterFlag | viscousFlag | tensileFlag | mixingFlag;
        r = 245; g = 245; b = 235; a = 115; // Thick, glossy translucent sweet syrup
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.06, 3.4);}

    if (pgd.color && pgd.color.Set) {
        pgd.color.Set(r, g, b, a);
    }
    if (pgd.color) {
        pgd.color.r = r;
        pgd.color.g = g;
        pgd.color.b = b;
        pgd.color.a = a;
    }

    pgd.shape = shape;
	
	const prevCount = particleSystem.GetParticleCount();
    particleSystem.CreateParticleGroup(pgd);
    const newCount = particleSystem.GetParticleCount();
	
	

    for (let i = prevCount; i < newCount; i++) {
        particleTypes[i] = type;
    }
}

// --- High-Performance Zero-Allocation Particle Diffusion ---

const DIFFUSION_CELL_SIZE = 0.14;
const GRID_COLS = 26;
const GRID_ROWS = 38;
const TOTAL_CELLS = GRID_COLS * GRID_ROWS;
const gridHead = new Int32Array(TOTAL_CELLS);

let maxAllocatedParticles = 0;
let particleNext = new Int32Array(0);
let scratchColorBuf = new Uint8Array(0);

function mixParticles() {
    const count = particleSystem.GetParticleCount();
    if (count < 2) return;

    const positions = particleSystem.GetPositionBuffer();
    const colorBuffer = particleSystem.GetColorBuffer();
    if (!positions || !colorBuffer) return;

    // Safely clamp to the exact allocated buffer size to avoid RangeError
    const safeCount = Math.min(count, positions.length >> 1, colorBuffer.length >> 2);
    if (safeCount < 2) return;

    // Resize scratch buffers only when needed
    if (safeCount > maxAllocatedParticles) {
        maxAllocatedParticles = safeCount + 400;
        particleNext = new Int32Array(maxAllocatedParticles);
        scratchColorBuf = new Uint8Array(maxAllocatedParticles * 4);
    }

    gridHead.fill(-1);
    const invCell = 1.0 / DIFFUSION_CELL_SIZE;

    // 1. Build spatial linked-list
    for (let i = 0; i < safeCount; i++) {
        const cx = (positions[i * 2] * invCell) | 0;
        const cy = (positions[i * 2 + 1] * invCell) | 0;
        if (cx >= 0 && cx < GRID_COLS && cy >= 0 && cy < GRID_ROWS) {
            const cell = cx + cy * GRID_COLS;
            particleNext[i] = gridHead[cell];
            gridHead[cell] = i;
        } else {
            particleNext[i] = -1;
        }
    }

    const radiusSq = DIFFUSION_CELL_SIZE * DIFFUSION_CELL_SIZE;
    const SELF_WEIGHT = 7.0;

    // 2. Neighbor diffusion
    for (let i = 0; i < safeCount; i++) {
        const xi = positions[i * 2];
        const yi = positions[i * 2 + 1];
        const cx = (xi * invCell) | 0;
        const cy = (yi * invCell) | 0;

        const i4 = i * 4;
        let sumR = colorBuffer[i4]     * SELF_WEIGHT;
        let sumG = colorBuffer[i4 + 1] * SELF_WEIGHT;
        let sumB = colorBuffer[i4 + 2] * SELF_WEIGHT;
        let sumA = colorBuffer[i4 + 3] * SELF_WEIGHT;
        let totalW = SELF_WEIGHT;

        const minX = Math.max(0, cx - 1);
        const maxX = Math.min(GRID_COLS - 1, cx + 1);
        const minY = Math.max(0, cy - 1);
        const maxY = Math.min(GRID_ROWS - 1, cy + 1);

        for (let gx = minX; gx <= maxX; gx++) {
            for (let gy = minY; gy <= maxY; gy++) {
                let j = gridHead[gx + gy * GRID_COLS];
                while (j !== -1) {
                    if (j !== i) {
                        const dx = positions[j * 2] - xi;
                        const dy = positions[j * 2 + 1] - yi;
                        const dSq = dx * dx + dy * dy;

                        if (dSq < radiusSq) {
                            const w = 1.0 - Math.sqrt(dSq) * invCell;
                            const j4 = j * 4;
                            sumR += colorBuffer[j4]     * w;
                            sumG += colorBuffer[j4 + 1] * w;
                            sumB += colorBuffer[j4 + 2] * w;
                            sumA += colorBuffer[j4 + 3] * w;
                            totalW += w;
                        }
                    }
                    j = particleNext[j];
                }
            }
        }

        const invW = 1.0 / totalW;
        scratchColorBuf[i4]     = (sumR * invW + 0.5) | 0;
        scratchColorBuf[i4 + 1] = (sumG * invW + 0.5) | 0;
        scratchColorBuf[i4 + 2] = (sumB * invW + 0.5) | 0;
        scratchColorBuf[i4 + 3] = (sumA * invW + 0.5) | 0;
    }

    // 3. Safe copy matching exact buffer bounds
    const copyLength = safeCount * 4;
    colorBuffer.set(scratchColorBuf.subarray(0, copyLength));
}

// Updated render() to send 4-component RGBA data to the splat shader
function render() {
    const count = particleSystem.GetParticleCount();
   // particleCountEl.textContent = count;

    const positions   = particleSystem.GetPositionBuffer();
    const colorBuffer = particleSystem.GetColorBuffer();
    const pixelCoords = new Float32Array(count * 2);
    const rgbaValues  = new Float32Array(count * 4);

    for (let i = 0; i < count; i++) {
        pixelCoords[i * 2]     = positions[i * 2] * SCALE;
        pixelCoords[i * 2 + 1] = positions[i * 2 + 1] * SCALE;
        
        if (colorBuffer) {
            rgbaValues[i * 4]     = colorBuffer[i * 4]     / 255.0;
            rgbaValues[i * 4 + 1] = colorBuffer[i * 4 + 1] / 255.0;
            rgbaValues[i * 4 + 2] = colorBuffer[i * 4 + 2] / 255.0;
            rgbaValues[i * 4 + 3] = (colorBuffer[i * 4 + 3] || 255) / 255.0;
        }
    }

    // 1. Splat particles to Density FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboA.fbo);
    gl.viewport(0, 0, fboA.width, fboA.height);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    gl.useProgram(splatProgram);
    gl.uniform2f(gl.getUniformLocation(splatProgram, 'uResolution'), canvas.width, canvas.height);
    gl.uniform1f(gl.getUniformLocation(splatProgram, 'uPointSize'), PARTICLE_RADIUS * SCALE * 6.5);

    gl.bindBuffer(gl.ARRAY_BUFFER, particlePosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, pixelCoords, gl.DYNAMIC_DRAW);
    const posAttr = gl.getAttribLocation(splatProgram, 'aPosition');
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    // Upload 4-component RGBA colors
    gl.bindBuffer(gl.ARRAY_BUFFER, particleMixBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, rgbaValues, gl.DYNAMIC_DRAW);
    const colAttr = gl.getAttribLocation(splatProgram, 'aColor');
    gl.enableVertexAttribArray(colAttr);
    gl.vertexAttribPointer(colAttr, 4, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.POINTS, 0, count);

    // 2. Horizontal Blur pass -> FBO B
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboB.fbo);
    gl.useProgram(blurProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fboA.texture);
    gl.uniform1i(gl.getUniformLocation(blurProgram, 'uTexture'), 0);
    gl.uniform2f(gl.getUniformLocation(blurProgram, 'uTexelOffset'), 3.5 / canvas.width, 0.0);

    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    const qPos1 = gl.getAttribLocation(blurProgram, 'aPosition');
    gl.enableVertexAttribArray(qPos1);
    gl.vertexAttribPointer(qPos1, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // 3. Vertical Blur pass -> FBO A
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboA.fbo);
    gl.uniform2f(gl.getUniformLocation(blurProgram, 'uTexelOffset'), 0.0, 3.5 / canvas.height);
    gl.bindTexture(gl.TEXTURE_2D, fboB.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // 4. Final Render & Shading Pass -> Screen Canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 0.0); 
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.disable(gl.BLEND);
	renderBackground(); // Draws the studio wall, marble table & contact shadow

	gl.enable(gl.BLEND);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	
    renderGlassware(false);
	
	// 3. Render Fluid
    gl.useProgram(renderProgram);
    gl.bindTexture(gl.TEXTURE_2D, fboA.texture);
    gl.uniform1i(gl.getUniformLocation(renderProgram, 'uFluidTexture'), 0);
    gl.uniform2f(gl.getUniformLocation(renderProgram, 'uTexelSize'), 1.0 / canvas.width, 1.0 / canvas.height);
    gl.uniform1f(gl.getUniformLocation(renderProgram, 'uThreshold'), 0.008);
	
	// Pass elapsed time in seconds to animate the rising bubbles
	gl.uniform1f(gl.getUniformLocation(renderProgram, 'uTime'), performance.now() * 0.001);
	gl.uniform1f(gl.getUniformLocation(renderProgram, 'uCarbonation'), calculateMixtureCarbonation());
	
	// Pass shaker position and mode
    const pos = cupBody.GetPosition();
    gl.uniform2f(gl.getUniformLocation(renderProgram, 'uCupOffset'), pos.x, pos.y);
    gl.uniform1i(gl.getUniformLocation(renderProgram, 'uIsMixing'), isMixingMode ? 1 : 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    const qPos2 = gl.getAttribLocation(renderProgram, 'aPosition');
    gl.enableVertexAttribArray(qPos2);
    gl.vertexAttribPointer(qPos2, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
	
	renderIceCubes();
	renderCherries();
	renderLime();
    //renderGlassCup(true);
	renderGlassware(true);
	//renderMeasurementBounds();
}

// -------------------------------------------------------------
// Render Pipeline
// -------------------------------------------------------------

function renderGlassCup(isOverlay) {
    if (!cupBody || !cupBody.fixtures) return;

    gl.useProgram(cupProgram);
    gl.uniform2f(gl.getUniformLocation(cupProgram, 'uResolution'), canvas.width, canvas.height);

    const vertArray = [];
    const fixtures = cupBody.fixtures;

    for (let f = 0; f < fixtures.length; f++) {
        const fixture = fixtures[f];
        if (!fixture || !fixture.shape) continue;

        const shape = fixture.shape;
        const vertices = shape.vertices;
        if (!vertices || vertices.length === 0) continue;

        const pts = [];
        for (let i = 0; i < vertices.length; i++) {
            const localPt = vertices[i];
            const worldPt = cupBody.GetWorldPoint(localPt);
            pts.push(worldPt.x * SCALE, worldPt.y * SCALE);
        }

        // Triangulate 4-vertex Box2D polygons into 2 triangles: (v0, v1, v2) and (v0, v2, v3)
        if (pts.length >= 8) {
            vertArray.push(
                pts[0], pts[1],  pts[2], pts[3],  pts[4], pts[5],
                pts[0], pts[1],  pts[4], pts[5],  pts[6], pts[7]
            );
        }
    }

    if (vertArray.length === 0) return;

    // Upload dynamic physics-derived vertices to GPU
    gl.bindBuffer(gl.ARRAY_BUFFER, cupVertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(vertArray));

    const posAttr = gl.getAttribLocation(cupProgram, 'aPosition');
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    const colorLoc = gl.getUniformLocation(cupProgram, 'uColor');
    const triangleCount = vertArray.length / 2;

    if (!isOverlay) {
        // Solid dark container interior
        gl.uniform4f(colorLoc, 0.90, 0.95, 1.0, 0.06);
        gl.drawArrays(gl.TRIANGLES, 0, triangleCount);
    } else {
        // Solid opaque cup walls & base (blocks all liquid bleed behind walls)
        gl.uniform4f(colorLoc, 0.26, 0.30, 0.38, 0.6);
        gl.drawArrays(gl.TRIANGLES, 0, triangleCount);
    }
}



// -------------------------------------------------------------
// Main Loop & Interactions
// -------------------------------------------------------------

function loop() {
    frameCounter++;

    // Step Physics
    world.Step(1 / 60, 6, 2);
	if (!isMixingMode) {
        particleSystem.DestroyParticlesInShape(bottomKillShape, identityTransform);
    }
    //mixParticles();
	
	applyIceBuoyancy();

	if (isPointerDown && selectedIngredient === 'ice' && !isMixingMode) {
		const now = Date.now();
		if (now - lastIceSpawnTime > 350 && iceCubes.length < 6) {
			spawnIce(pointerX / SCALE, pointerY / SCALE);
			lastIceSpawnTime = now;
		}
	} 
	else if (isPointerDown && selectedIngredient === 'cherry' && !isMixingMode) {
		const now = Date.now();
		if (now - lastCherrySpawnTime > 350 && cherries.length < 5) {
			spawnCherry(pointerX / SCALE, pointerY / SCALE);
			lastCherrySpawnTime = now;
		}
	}
	else if (isPointerDown && selectedIngredient === 'lime' && !isMixingMode) {
		hasLime = true;
	}
	else if (isPointerDown && selectedIngredient && selectedIngredient !== 'ice' && selectedIngredient !== 'cherry' && !isMixingMode) {
		spawnLiquid(selectedIngredient, pointerX / SCALE, pointerY / SCALE);
	}
	


    render();
    animationFrameId = requestAnimationFrame(loop);
}

// Input Handlers
// Sidebar Ingredient Selector Buttons
const ingredientBtns = document.querySelectorAll('.ingredient-btn');
ingredientBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
        ingredientBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        selectedIngredient = btn.dataset.type;
    });
});

// Canvas Mouse / Touch Pointer Tracking
function updatePointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    pointerX = (clientX - rect.left) * (canvas.width / rect.width);
    pointerY = (clientY - rect.top) * (canvas.height / rect.height);
}

// --- Pointer / Touch Input Handlers ---

function handlePointerStart(e) {
    updatePointerPos(e);
    const worldX = pointerX / SCALE;

    if (isMixingMode) {
        // Touch on or near the shaker initiates dragging
        if (worldX >= 0.8 && worldX <= 2.8) {
            isDraggingCup = true;
            dragStartY = pointerY;
            cupBaseY = cupBody.GetPosition().y;
        }
        isPointerDown = false; // Never spawn liquids in mix mode
    } else {
        isPointerDown = true;
    }
}

function handlePointerMove(e) {
    if (isDraggingCup && isMixingMode) {
        updatePointerPos(e);
        const deltaY = (pointerY - dragStartY) / SCALE;

        // 10px boundary limits
        const topLimit = (20 / SCALE) - 1.03;                      // Top of shaker >= 10px from top
        const bottomLimit = ((canvas.height - 30) / SCALE) - 4.50; // Bottom of base <= 10px from bottom

        const targetY = Math.max(topLimit, Math.min(bottomLimit, cupBaseY + deltaY));
        const currentY = cupBody.GetPosition().y;

        // Calculate smooth velocity towards target, capped at ±14 m/s to prevent physics solver explosions
        let vy = (targetY - currentY) * 25;
        vy = Math.max(-14, Math.min(14, vy));

        cupBody.SetLinearVelocity(new b2Vec2(0, vy));
		updateSloshAudio(vy);
    } else if (isPointerDown && !isMixingMode) {
        updatePointerPos(e);
    }
}

function handlePointerEnd() {
    isPointerDown = false;
    if (isDraggingCup) {
        isDraggingCup = false;
        cupBody.SetLinearVelocity(new b2Vec2(0, 0));
    }
	updateSloshAudio(0);
}

// Mouse Listeners
canvas.addEventListener('mousedown', handlePointerStart);
window.addEventListener('mousemove', handlePointerMove);
window.addEventListener('mouseup', handlePointerEnd);

// Touch Listeners for Mobile / Tablets
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    handlePointerStart(e);
}, { passive: false });

window.addEventListener('touchmove', (e) => {
    handlePointerMove(e);
}, { passive: false });

window.addEventListener('touchend', handlePointerEnd);



window.addEventListener('load', () => {
    initWebGL();
    initPhysics();
	initGame();
});


function logCupContents() {
    const count = particleSystem.GetParticleCount();
    if (count === 0) {
        console.log({});
        return;
    }


    const positions = particleSystem.GetPositionBuffer();
    const counts = {};
    let totalInside = 0;

    for (let i = 0; i < count; i++) {
		
		
        const x = positions[i * 2];
        const y = positions[i * 2 + 1];
		
		const type = particleTypes[i] || 'unknown';
			
        counts[type] = (counts[type] || 0) + 1;
		
		totalInside++;

        // Cup bounds matching fixture geometry (slanted walls and base)
        const leftX = 2.12 + (y - 3.35) * 0.0913;
        const rightX = 4.88 - (y - 3.35) * 0.0913;
/*
        if (y >= 1.67 && y <= 5.08 && x >= leftX && x <= rightX) {
            const type = particleTypes[i] || 'unknown';
			
            counts[type] = (counts[type] || 0) + 1;
            totalInside++;
        }*/
    }
	
    if (totalInside === 0) {
        console.log({});
        return;
    }

    const result = {};
    for (const type in counts) {
        result[type] = parseFloat((counts[type] / totalInside).toFixed(2));
    }
    console.log(result);
	return result;
}

window.addEventListener('keydown', async  (e) => {
    if (e.key === 'c' || e.key === 'C') {
        logCupContents();
    };
	
	const data = await response.json();
	console.log(data.choices[0].message.content);
    })
});


function renderMeasurementBounds() {
    const yTop = 2.76, yBottom = 4.45, slope = 0.0913;
    const tlX = (1.11 + (yTop - 3.60) * slope) * SCALE;
    const tlY = yTop * SCALE;
    const trX = (2.49 - (yTop - 3.60) * slope) * SCALE;
    const trY = yTop * SCALE;
    const brX = (2.49 - (yBottom - 3.60) * slope) * SCALE;
    const brY = yBottom * SCALE;
    const blX = (1.11 + (yBottom - 3.60) * slope) * SCALE;
    const blY = yBottom * SCALE;

    const vertices = new Float32Array([
        tlX, tlY,
        trX, trY,
        brX, brY,
        blX, blY
    ]);

    gl.useProgram(cupProgram);
    gl.uniform2f(gl.getUniformLocation(cupProgram, 'uResolution'), canvas.width, canvas.height);
    gl.uniform4f(gl.getUniformLocation(cupProgram, 'uColor'), 0.0, 1.0, 0.4, 0.9);

    gl.bindBuffer(gl.ARRAY_BUFFER, cupVertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);

    const posAttr = gl.getAttribLocation(cupProgram, 'aPosition');
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.LINE_LOOP, 0, 4);
}

document.getElementById('btn-empty').addEventListener('click', () => {
    isPointerDown = false;
    initPhysics();
});


const faceImg = document.getElementById('face-image');
const facePlaceholder = document.getElementById('face-placeholder');
const speechBubble = document.getElementById('speech-bubble');

const TOTAL_CUSTOMERS = 4;
const STATES = ['angry', 'drink', 'happy', 'normal'];
const PRELOADED_IMAGES = {};

let customerQueue = [];
let currentCustomerIndex = 0;
let currentTargetDrink = null;
let isServingLocked = false;

const drinkingAudio = new Audio('drink.mp3');

function playDrinkingSound() {
    drinkingAudio.currentTime = 0; // Rewind to start if clicked rapidly
    drinkingAudio.play().catch(err => {
        console.warn("Audio playback error:", err);
    });
}

const recipeHint = document.getElementById('recipe-hint');
let isHintActive = false;
let hintTimeout = null;

// Format ingredient keys (e.g. 'orange-liqueur' -> 'Orange Liqueur')
function formatIngredientLabel(key) {
    return key
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// Click listener to toggle recipe breakdown
speechBubble.addEventListener('click', () => {
    // Only allow when active order exists, not locked, and not already showing
    if (isHintActive || isServingLocked || !currentTargetDrink) return;

    const recipe = RECIPES[currentTargetDrink];
    if (!recipe) return;

    isHintActive = true;

    // Build the recipe breakdown list
    const breakdown = Object.entries(recipe)
        .map(([ing, ratio]) => `<div>${formatIngredientLabel(ing)}: ${Math.round(ratio * 100)}%</div>`)
        .join('');

    recipeHint.innerHTML = breakdown;
    recipeHint.classList.remove('hidden');

    // Auto-hide after 3 seconds and unlock clicking
    hintTimeout = setTimeout(() => {
        recipeHint.classList.add('hidden');
        isHintActive = false;
    }, 3000);
});

const POSITIVE_FEEDBACK = [
    "This was nice!",
    "Yummy! Absolutely delicious.",
    "Perfection! Exactly what I needed.",
    "Mmm, bartender of the year!",
    "Outstanding drink, thank you!"
];

const NEGATIVE_FEEDBACK = [
    "Disgusting! What did you put in this?",
    "This tastes terrible!",
    "Are you trying to poison me?",
    "This isn't what I ordered at all!",
    "Awful! You ruined my drink."
];

// Preload all customer images
function preloadCustomerImages() {
    for (let i = 1; i <= TOTAL_CUSTOMERS; i++) {
        PRELOADED_IMAGES[i] = {};
        STATES.forEach(state => {
            const img = new Image();
            const src = `people/person${i}_${state}.png`;
            img.src = src;
            PRELOADED_IMAGES[i][state] = src;
        });
    }
}

// Fisher-Yates Shuffle
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function setCustomerFace(personId, state) {
    if (!personId || !state) {
        faceImg.style.display = 'none';
        if (facePlaceholder) facePlaceholder.style.display = 'block';
        return;
    }
    faceImg.src = `people/person${personId}_${state}.png`;
    faceImg.style.display = 'block';
    if (facePlaceholder) facePlaceholder.style.display = 'none';
}

function setSpeechText(htmlContent) {
    if (!htmlContent) {
        speechBubble.classList.add('hidden');
    } else {
        speechBubble.classList.remove('hidden');
        speechBubble.innerHTML = `<span>${htmlContent}</span><div class="speech-tail"></div>`;
    }
}


// Highlight drink name in orange inside dialogue
function highlightDrinkName(text, drinkName) {
    const escaped = drinkName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    if (regex.test(text)) {
        return text.replace(regex, `<strong style="color: #f97316;">$1</strong>`);
    }
    return `${text} (<strong style="color: #f97316;">${drinkName}</strong>)`;
}

// Generate customer dialogue via Groq
async function requestCustomerOrder(drinkName, personId) {
    const isNice = Math.random() < 0.5;
    const tone = isNice ? "polite and nice" : "rude";
    
    setSpeechText("<em>Ordering...</em>");

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer __GROQ_API_KEY__`,
				
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                messages: [
                    {
                        role: "system",
                        content: "Return only the customer's spoken dialogue as one short sentence. Keep responses short and do not use quotation marks."
                    },
                    {
                        role: "user",
                        content: `Make a bar order where you request a(n) ${drinkName}, in a ${tone} way. Address the bartender as Aisha.`
                    }
                ],
                max_completion_tokens: 150
            })
        });

        const data = await response.json();
        let speech = data?.choices?.[0]?.message?.content?.trim();
        if (speech) {
            speech = speech.replace(/^["']|["']$/g, '');
            setSpeechText(highlightDrinkName(speech, drinkName));

            // Select random voice matching gender and play audio
            currentCustomerVoiceId = getRandomVoiceForPerson(personId);
            playCustomerVoice(speech, currentCustomerVoiceId );
            return;
        }
    } catch (err) {
        console.error("Groq API error:", err);
    }

    // Fallback if API fails
    const fallbackText = isNice
        ? `Could I please get a ${drinkName}?`
        : `Hurry up and give me a ${drinkName}!`;
    setSpeechText(highlightDrinkName(fallbackText, drinkName));

    currentCustomerVoiceId = getRandomVoiceForPerson(personId);
    playCustomerVoice(fallbackText, currentCustomerVoiceId);
}

// ±10% Recipe Checker
function checkRecipeAccuracy(served, targetDrinkName) {
    const recipe = RECIPES[targetDrinkName];
    if (!recipe || !served || Object.keys(served).length === 0) return false;

    // Check each required ingredient
    for (const ingredient in recipe) {
        const targetRatio = recipe[ingredient];
        const servedRatio = served[ingredient] || 0;
        
        // Automatic fail if ingredient is missing
        if (servedRatio === 0) return false;
        
        // Check ±10% (0.10) threshold
        if (Math.abs(servedRatio - targetRatio) > 0.10) {
            return false;
        }
    }

    // Check unrequested liquids don't exceed 10%
    for (const ingredient in served) {
        if (!recipe[ingredient] && served[ingredient] > 0.10) {
            return false;
        }
    }

    return true;
}

// Advance to the next customer
async function startNextCustomer() {
	
	if (hintTimeout) clearTimeout(hintTimeout);
	recipeHint.classList.add('hidden');
	isHintActive = false;

    isServingLocked = false;

    const personId = customerQueue[currentCustomerIndex];
    setCustomerFace(personId, 'normal');

    // Pick random drink from RECIPES
    const recipeKeys = Object.keys(RECIPES);
    currentTargetDrink = recipeKeys[Math.floor(Math.random() * recipeKeys.length)];

    await requestCustomerOrder(currentTargetDrink, personId);
}

// Initialize Game loop
function initGame() {
    preloadCustomerImages();
    customerQueue = shuffle([1, 2, 3, 4]);
    currentCustomerIndex = 0;
    startNextCustomer();
}

// Serve Button Handler
document.getElementById('btn-serve').addEventListener('click', () => {
    if (isServingLocked || !currentTargetDrink) return;
    isServingLocked = true;

    const currentDrink = logCupContents();
    const isPassed = checkRecipeAccuracy(currentDrink, currentTargetDrink);
    const personId = customerQueue[currentCustomerIndex];

    // Empty cup
    isPointerDown = false;
    initPhysics();

    // Show drinking state & play sound
    setCustomerFace(personId, 'drink');
    playDrinkingSound();
    setSpeechText("");

    // After 1 second: display feedback
    setTimeout(() => {
		let feedbackText = "";

		if (isPassed) {
			setCustomerFace(personId, 'happy');
			feedbackText = POSITIVE_FEEDBACK[Math.floor(Math.random() * POSITIVE_FEEDBACK.length)];
		} else {
			setCustomerFace(personId, 'angry');
			feedbackText = NEGATIVE_FEEDBACK[Math.floor(Math.random() * NEGATIVE_FEEDBACK.length)];
		}

		setSpeechText(feedbackText);
		
		// Play speech using the same voice ID:
		if (currentCustomerVoiceId) {
			playCustomerVoice(feedbackText, currentCustomerVoiceId);
		}

		// After 3.5 seconds: hide face and load next customer
		setTimeout(() => {
			setCustomerFace(null, null);
			setSpeechText("");

			// Loop to next customer in shuffled order
			currentCustomerIndex = (currentCustomerIndex + 1) % customerQueue.length;
			startNextCustomer();
		}, 3500);

	}, 2000);
});