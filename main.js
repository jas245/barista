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
const PARTICLE_RADIUS = 0.065; 

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

        // Full geometric density kernel (consistent physical droplet radius)
        float density = (1.0 - rSq) * (1.0 - rSq) * 0.055;
        
        // RGB carries density-weighted color; Alpha carries true geometric thickness
        gl_FragColor = vec4(vColor.rgb * density, density);
    }
`;

const renderFS = `
    precision mediump float;
    uniform sampler2D uFluidTexture;
    uniform vec2 uTexelSize;
    uniform float uThreshold;
    varying vec2 vUv;

    void main() {
        vec4 sampleCenter = texture2D(uFluidTexture, vUv);
        float density = sampleCenter.a;

        float boundaryAlpha = smoothstep(uThreshold - 0.005, uThreshold + 0.005, density);
        if (boundaryAlpha < 0.01) {
            discard;
        }

        // True optical blended color
        vec3 liquidBase = clamp(sampleCenter.rgb / max(density, 0.0001), 0.0, 1.0);

        // Surface normal reconstruction
        float left   = texture2D(uFluidTexture, vUv - vec2(uTexelSize.x * 2.0, 0.0)).a;
        float right  = texture2D(uFluidTexture, vUv + vec2(uTexelSize.x * 2.0, 0.0)).a;
        float top    = texture2D(uFluidTexture, vUv + vec2(0.0, uTexelSize.y * 2.0)).a;
        float bottom = texture2D(uFluidTexture, vUv - vec2(0.0, uTexelSize.y * 2.0)).a;

        vec2 gradient = vec2(right - left, top - bottom);
        vec3 normal = normalize(vec3(gradient * 20.0, 1.0));

        // Soft directional lighting
        vec3 lightDir = normalize(vec3(-0.3, 0.6, 0.75));
        float diff = clamp(dot(normal, lightDir), 0.0, 1.0);

        // Specular highlight (gives individual droplets a crisp, shiny surface)
        vec3 viewDir = vec3(0.0, 0.0, 1.0);
        vec3 halfDir = normalize(lightDir + viewDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), 36.0);

        vec3 specColor = mix(vec3(1.0), liquidBase, 0.35);
        vec3 shaded = liquidBase * (0.85 + 0.15 * diff) + specColor * (spec * 0.16);

        // Depth-based transparency: individual droplets remain clearly visible (alpha ~0.7),
        // while pooled liquids display their translucent depth
        float depthFactor = clamp(density * 12.0, 0.0, 1.0);
        float fluidAlpha = boundaryAlpha * mix(0.70, 0.95, depthFactor);

        gl_FragColor = vec4(shaded, fluidAlpha);
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
    gl = canvas.getContext('webgl', { alpha: false, antialias: true });
    if (!gl) {
        alert('WebGL not supported on this browser.');
        return;
    }

    splatProgram = createProgram(gl, splatVS, splatFS);
    blurProgram  = createProgram(gl, quadVS, blurFS);
    renderProgram= createProgram(gl, quadVS, renderFS);
	
	cupProgram = createProgram(gl, cupVS, cupFS);

	cupVertexBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, cupVertexBuffer);
	// Allocate dynamic vertex buffer space for the physics fixtures
	gl.bufferData(gl.ARRAY_BUFFER, 1024 * 4, gl.DYNAMIC_DRAW);

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

    const gravity = new b2Vec2(0, 9.8);
    world = new b2World(gravity);

    createCupBodies();

    const psd = new b2ParticleSystemDef();
    psd.radius = PARTICLE_RADIUS;
    psd.dampingStrength = 0.15;
    psd.viscosityStrength = 0.28;
    psd.surfaceTensionStrength = 0.20;
    psd.colorMixingStrength = 0.10;

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
    const halfSize = (type === 'milk') ? 0.065 : 0.055;

    shape.SetAsBoxXYCenterAngle(
        halfSize, halfSize,
        new b2Vec2(worldX + (Math.random() - 0.5) * 0.02, worldY + (Math.random() - 0.5) * 0.02),
        0
    );

    let r = 42, g = 18, b = 8, a = 250;

    if (type === 'espresso') {
        pgd.flags = waterFlag | mixingFlag;
        r = 42; g = 18; b = 8; a = 250; // Opaque espresso
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.1, 4.6);
    } else if (type === 'milk') {
        pgd.flags = waterFlag | mixingFlag;
        r = 250; g = 245; b = 235; a = 255; // Opaque milk
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.1, 4.6);
    } else if (type === 'syrup') {
        pgd.flags = waterFlag | viscousFlag | tensileFlag | mixingFlag;
        r = 235; g = 150; b = 15; a = 220; // Amber syrup
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.05, 3.2);
    } else if (type === 'vodka') {
        pgd.flags = waterFlag | mixingFlag;
        r = 215; g = 235; b = 250; a = 85; // Clear / crystalline transparent
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.1, 4.4);
    } else if (type === 'rum') {
        pgd.flags = waterFlag | mixingFlag;
        r = 245; g = 240; b = 228; a = 110; // Clear / warm light rum
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.1, 4.2);
    } else if (type === 'lemonade') {
        pgd.flags = waterFlag | mixingFlag;
        r = 250; g = 225; b = 38; a = 155; // Vibrant translucent yellow
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.1, 4.5);
    } else if (type === 'wine') {
        pgd.flags = waterFlag | mixingFlag;
        r = 145; g = 15; b = 50; a = 52; // Deep ruby violet (~80% transparency)
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
        r = 185; g = 230; b = 55; a = 140; // Translucent vibrant citrus green-yellow
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
        r = 230; g = 242; b = 250; a = 80; // Crisp transparent citrus liqueur
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.1, 4.3);
    } else if (type === 'tomato-juice') {
        pgd.flags = waterFlag | viscousFlag | mixingFlag;
        r = 195; g = 30; b = 22; a = 245; // Thick, dense savory crimson
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.08, 4.0);
    } else if (type === 'tequila') {
        pgd.flags = waterFlag | mixingFlag;
        r = 238; g = 244; b = 248; a = 90; // Clean platinum crystal clarity
        pgd.linearVelocity = new b2Vec2((Math.random() - 0.5) * 0.1, 4.4);
    } else if (type === 'coffee-liqueur') {
        pgd.flags = waterFlag | viscousFlag | tensileFlag | mixingFlag;
        r = 35; g = 15; b = 8; a = 210; // Glossy deep roasted espresso liqueur
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

// Particle mixture spatial diffusion
function mixParticles() {
    const count = particleSystem.GetParticleCount();
    if (count < 2) return;

    const positions = particleSystem.GetPositionBuffer();
    const colorBuffer = particleSystem.GetColorBuffer();
    if (!positions || !colorBuffer) return;

    const radius = 0.15;
    const radiusSq = radius * radius;
    const cellSize = radius;
    const grid = new Map();

    const nextR = new Uint8Array(count);
    const nextG = new Uint8Array(count);
    const nextB = new Uint8Array(count);
    const nextA = new Uint8Array(count);

    for (let i = 0; i < count; i++) {
        const cx = Math.floor(positions[i * 2] / cellSize);
        const cy = Math.floor(positions[i * 2 + 1] / cellSize);
        const key = cx + ',' + cy;
        let b = grid.get(key);
        if (!b) { b = []; grid.set(key, b); }
        b.push(i);
    }

    const SELF_WEIGHT = 8.0;

    for (let i = 0; i < count; i++) {
        const xi = positions[i * 2];
        const yi = positions[i * 2 + 1];
        const cx = Math.floor(xi / cellSize);
        const cy = Math.floor(yi / cellSize);

        let sumR = (colorBuffer[i * 4]     || 0) * SELF_WEIGHT;
        let sumG = (colorBuffer[i * 4 + 1] || 0) * SELF_WEIGHT;
        let sumB = (colorBuffer[i * 4 + 2] || 0) * SELF_WEIGHT;
        let sumA = (colorBuffer[i * 4 + 3] || 255) * SELF_WEIGHT;
        let totalW = SELF_WEIGHT;

        for (let gx = cx - 1; gx <= cx + 1; gx++) {
            for (let gy = cy - 1; gy <= cy + 1; gy++) {
                const bucket = grid.get(gx + ',' + gy);
                if (!bucket) continue;

                for (let k = 0; k < bucket.length; k++) {
                    const j = bucket[k];
                    if (j === i) continue;

                    const dx = positions[j * 2] - xi;
                    const dy = positions[j * 2 + 1] - yi;
                    const dSq = dx * dx + dy * dy;

                    if (dSq < radiusSq) {
                        const dist = Math.sqrt(dSq);
                        const w = 1.0 - (dist / radius);

                        sumR += (colorBuffer[j * 4]     || 0) * w;
                        sumG += (colorBuffer[j * 4 + 1] || 0) * w;
                        sumB += (colorBuffer[j * 4 + 2] || 0) * w;
                        sumA += (colorBuffer[j * 4 + 3] || 255) * w;
                        totalW += w;
                    }
                }
            }
        }

        const invW = 1.0 / totalW;
        nextR[i] = Math.round(sumR * invW);
        nextG[i] = Math.round(sumG * invW);
        nextB[i] = Math.round(sumB * invW);
        nextA[i] = Math.round(sumA * invW);
    }

    for (let i = 0; i < count; i++) {
        colorBuffer[i * 4]     = nextR[i];
        colorBuffer[i * 4 + 1] = nextG[i];
        colorBuffer[i * 4 + 2] = nextB[i];
        colorBuffer[i * 4 + 3] = nextA[i];
    }
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
    gl.uniform1f(gl.getUniformLocation(splatProgram, 'uPointSize'), PARTICLE_RADIUS * SCALE * 5.2);

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
    gl.uniform2f(gl.getUniformLocation(blurProgram, 'uTexelOffset'), 1.8 / canvas.width, 0.0);

    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    const qPos1 = gl.getAttribLocation(blurProgram, 'aPosition');
    gl.enableVertexAttribArray(qPos1);
    gl.vertexAttribPointer(qPos1, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // 3. Vertical Blur pass -> FBO A
    gl.bindFramebuffer(gl.FRAMEBUFFER, fboA.fbo);
    gl.uniform2f(gl.getUniformLocation(blurProgram, 'uTexelOffset'), 0.0, 1.8 / canvas.height);
    gl.bindTexture(gl.TEXTURE_2D, fboB.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // 4. Final Render & Shading Pass -> Screen Canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.08, 0.09, 0.11, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	
    renderGlassCup(false);

    gl.useProgram(renderProgram);
    gl.bindTexture(gl.TEXTURE_2D, fboA.texture);
    gl.uniform1i(gl.getUniformLocation(renderProgram, 'uFluidTexture'), 0);
    gl.uniform2f(gl.getUniformLocation(renderProgram, 'uTexelSize'), 1.0 / canvas.width, 1.0 / canvas.height);
    gl.uniform1f(gl.getUniformLocation(renderProgram, 'uThreshold'), 0.024);

    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    const qPos2 = gl.getAttribLocation(renderProgram, 'aPosition');
    gl.enableVertexAttribArray(qPos2);
    gl.vertexAttribPointer(qPos2, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
	
    renderGlassCup(true);
	renderMeasurementBounds();
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
        gl.uniform4f(colorLoc, 0.12, 0.14, 0.18, 1.0);
        gl.drawArrays(gl.TRIANGLES, 0, triangleCount);
    } else {
        // Solid opaque cup walls & base (blocks all liquid bleed behind walls)
        gl.uniform4f(colorLoc, 0.26, 0.30, 0.38, 1.0);
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
	particleSystem.DestroyParticlesInShape(bottomKillShape, identityTransform);
    //mixParticles();

    if (isPointerDown && selectedIngredient && frameCounter % 3 === 0) {
		const worldX = pointerX / SCALE;
		const worldY = pointerY / SCALE;
		spawnLiquid(selectedIngredient, worldX, worldY);
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

canvas.addEventListener('mousedown', (e) => {
    isPointerDown = true;
    updatePointerPos(e);
});

window.addEventListener('mousemove', (e) => {
    if (isPointerDown) {
        updatePointerPos(e);
    }
});

window.addEventListener('mouseup', () => {
    isPointerDown = false;
});

// Touch Support for Mobile
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isPointerDown = true;
    updatePointerPos(e);
}, { passive: false });

window.addEventListener('touchmove', (e) => {
    if (isPointerDown) {
        updatePointerPos(e);
    }
});

window.addEventListener('touchend', () => {
    isPointerDown = false;
});



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
	if (e.key === 'ppp' || e.key === 'PPP') {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
		method: "POST",
		headers: {
			"Authorization": `Bearer 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`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			model: "openai/gpt-oss-120b",
			messages: [
				{
					role: "system",
					content: "Return only the requested text. Keep responses short."
				},
				{
					role: "user",
					content: "Make a bar order where you request an espresso martini, in a rude way."
				}
			],
			max_completion_tokens: 400
		})
	});

	const data = await response.json();
	console.log(data.choices[0].message.content);
    }
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
async function requestCustomerOrder(drinkName) {
    const isNice = Math.random() < 0.5;
    const tone = isNice ? "polite and nice" : "rude";
    
    setSpeechText("<em>Ordering...</em>");

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": "Bearer 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",
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
            return;
        }
    } catch (err) {
        console.error("Groq API error:", err);
    }

    // Fallback if API is unreachable
    const fallbackText = isNice
        ? `Could I please get a ${drinkName}?`
        : `Hurry up and give me a ${drinkName}!`;
    setSpeechText(highlightDrinkName(fallbackText, drinkName));
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

    await requestCustomerOrder(currentTargetDrink);
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
        if (isPassed) {
            setCustomerFace(personId, 'happy');
            const randomText = POSITIVE_FEEDBACK[Math.floor(Math.random() * POSITIVE_FEEDBACK.length)];
            setSpeechText(randomText);
        } else {
            setCustomerFace(personId, 'angry');
            const randomText = NEGATIVE_FEEDBACK[Math.floor(Math.random() * NEGATIVE_FEEDBACK.length)];
            setSpeechText(randomText);
        }

        // After 3 seconds: hide face and load next customer
        setTimeout(() => {
            setCustomerFace(null, null);
            setSpeechText("");

            // Loop to next customer in shuffled order
            currentCustomerIndex = (currentCustomerIndex + 1) % customerQueue.length;
            startNextCustomer();
        }, 3000);

    }, 2000);
});
