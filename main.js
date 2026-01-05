import kaboom from "https://unpkg.com/kaboom@3000.1.17/dist/kaboom.mjs";

// Device detection - more robust detection
const userAgentMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const touchCapable = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
const smallScreen = window.innerWidth <= 768 || window.innerHeight <= 768;
const isMobile = userAgentMobile || (touchCapable && smallScreen);
const isPortrait = window.innerHeight > window.innerWidth;

// Game dimensions based on device and orientation
// Mobile portrait: Use full portrait dimensions to fill phone screen
// Desktop/Mobile landscape: Standard landscape dimensions
let GAME_WIDTH, GAME_HEIGHT;

if (isMobile && isPortrait) {
    // Portrait phone - use dimensions that fill the screen better
    // Match typical phone aspect ratio (roughly 9:19 or similar)
    GAME_WIDTH = 400;
    GAME_HEIGHT = 700;
} else {
    // Desktop or landscape mobile
    GAME_WIDTH = 800;
    GAME_HEIGHT = 600;
}

// Calculate responsive canvas size
function getGameDimensions() {
    const baseWidth = GAME_WIDTH;
    const baseHeight = GAME_HEIGHT;
    const aspectRatio = baseWidth / baseHeight;

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const windowAspect = windowWidth / windowHeight;

    let scale;

    // Calculate scale to fit screen
    if (windowAspect > aspectRatio) {
        // Window is wider - fit to height
        scale = windowHeight / baseHeight;
    } else {
        // Window is taller - fit to width
        scale = windowWidth / baseWidth;
    }

    // Device-specific scale adjustments
    if (isMobile) {
        // Mobile: fill almost all of the screen (98%)
        scale = scale * 0.98;
    } else {
        // Desktop: small border (90% of available space)
        scale = scale * 0.90;
    }

    return {
        width: baseWidth,
        height: baseHeight,
        scale: Math.max(0.5, Math.min(scale, 2.5))
    };
}

const dims = getGameDimensions();

// Initialize Kaboom
const k = kaboom({
    width: dims.width,
    height: dims.height,
    background: [135, 206, 235], // Sky blue
    scale: dims.scale,
    crisp: true,
    canvas: document.getElementById("game-container")?.querySelector("canvas") || undefined,
    stretch: true,
    letterbox: true,
});

// Touch/Mouse position tracker for mobile
let currentPointerPos = vec2(GAME_WIDTH / 2, GAME_HEIGHT / 2);
let isTouchDevice = false;

// Detect touch device
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    isTouchDevice = true;
}

// Shake detection for releasing monsters
let lastShakeTime = 0;
let shakeThreshold = 15; // Acceleration threshold for shake detection
let shakeCooldown = 500; // Minimum ms between shake triggers

// Function to release all following monsters (will be set in game scene)
let releaseFollowingMonsters = null;

// Mobile shake detection using DeviceMotion
if (isTouchDevice && window.DeviceMotionEvent) {
    window.addEventListener('devicemotion', (event) => {
        const acc = event.accelerationIncludingGravity;
        if (!acc) return;

        const totalAcceleration = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
        const now = Date.now();

        // Detect shake (acceleration above threshold, respecting cooldown)
        if (totalAcceleration > shakeThreshold && now - lastShakeTime > shakeCooldown) {
            lastShakeTime = now;
            if (releaseFollowingMonsters) releaseFollowingMonsters();
        }
    });
}

// Game constants
const PLAYER_SPEED = 300;
const MONSTER_SPEED = 60;
const MONSTER_CHASE_SPEED = 280;
const ZONE_CHECK_DELAY = 1.0; // seconds to wait before checking sum
const MAX_FOLLOWING = 2; // Maximum monsters that can follow at once

// Monster design configurations
const MONSTER_DESIGNS = [
    {
        name: "Blobby",
        bodyColor: [255, 150, 180], // Pink
        bodyShape: "circle",
        eyeStyle: "big",
        feature: "antennae",
        expression: "happy"
    },
    {
        name: "Ziggy",
        bodyColor: [150, 255, 170], // Green
        bodyShape: "square",
        eyeStyle: "sleepy",
        feature: "horns",
        expression: "silly"
    },
    {
        name: "Puff",
        bodyColor: [150, 180, 255], // Blue
        bodyShape: "circle",
        eyeStyle: "wide",
        feature: "spots",
        expression: "surprised"
    },
    {
        name: "Sunny",
        bodyColor: [255, 230, 130], // Yellow
        bodyShape: "square",
        eyeStyle: "big",
        feature: "spikes",
        expression: "happy"
    },
    {
        name: "Tangy",
        bodyColor: [255, 180, 130], // Orange
        bodyShape: "circle",
        eyeStyle: "small",
        feature: "ears",
        expression: "wink"
    },
    {
        name: "Grape",
        bodyColor: [200, 160, 255], // Purple
        bodyShape: "square",
        eyeStyle: "big",
        feature: "bow",
        expression: "happy"
    },
    {
        name: "Minty",
        bodyColor: [160, 255, 220], // Mint
        bodyShape: "circle",
        eyeStyle: "wide",
        feature: "antennae",
        expression: "silly"
    },
    {
        name: "Coral",
        bodyColor: [255, 160, 160], // Coral
        bodyShape: "square",
        eyeStyle: "sleepy",
        feature: "freckles",
        expression: "content"
    }
];

// Game state
let score = 0;
let monstersInZones = new Map(); // zone -> [monsters]
let usedDesigns = []; // Track which designs are currently on screen
let targetSums = []; // Store target sums for validation
let paradeTriggered = false; // Track if 50-point parade has happened
let paradeInProgress = false; // Track if parade is currently happening

// Draw simple grass background
function drawBackground() {
    // Grass (covers 90% of screen - small sky strip at top)
    add([
        rect(GAME_WIDTH, GAME_HEIGHT * 0.90),
        pos(0, GAME_HEIGHT * 0.10),
        color(120, 200, 80),
        z(-10),
    ]);

    // Some decorative elements (darker grass patches)
    for (let i = 0; i < 12; i++) {
        add([
            circle(rand(5, 15)),
            pos(rand(50, GAME_WIDTH - 50), rand(GAME_HEIGHT * 0.15, GAME_HEIGHT - 50)),
            color(100, 180, 60),
            z(-5),
        ]);
    }
}

// Create the player (kid character)
function createPlayer() {
    const player = add([
        circle(20),
        pos(GAME_WIDTH / 2, GAME_HEIGHT / 2),
        color(255, 220, 180), // Skin tone
        area({ width: 40, height: 40, offset: vec2(-20, -20) }),
        "player",
        {
            direction: vec2(0, 0),
            animTime: 0,
            isMoving: false,
            bobOffset: 0,
            isCelebrating: false,
        }
    ]);

    // Add legs
    const leftLeg = add([
        rect(6, 14, { radius: 2 }),
        pos(0, 0),
        color(100, 100, 200), // Blue pants
        z(-1),
        anchor("top"),
        "playerPart",
        { baseOffset: vec2(-8, 18), currentOffset: vec2(-8, 18) }
    ]);

    const rightLeg = add([
        rect(6, 14, { radius: 2 }),
        pos(0, 0),
        color(100, 100, 200), // Blue pants
        z(-1),
        anchor("top"),
        "playerPart",
        { baseOffset: vec2(8, 18), currentOffset: vec2(8, 18) }
    ]);

    // Add arms
    const leftArm = add([
        rect(5, 12, { radius: 2 }),
        pos(0, 0),
        color(255, 220, 180), // Skin tone
        z(-1),
        anchor("top"),
        "playerPart",
        { baseOffset: vec2(-22, -5), currentOffset: vec2(-22, -5) }
    ]);

    const rightArm = add([
        rect(5, 12, { radius: 2 }),
        pos(0, 0),
        color(255, 220, 180), // Skin tone
        z(-1),
        anchor("top"),
        "playerPart",
        { baseOffset: vec2(22, -5), currentOffset: vec2(22, -5) }
    ]);

    // Store limb references
    player.leftLeg = leftLeg;
    player.rightLeg = rightLeg;
    player.leftArm = leftArm;
    player.rightArm = rightArm;

    // Add a face to the player
    add([
        text("^_^", { size: 16 }),
        pos(0, 0),
        color(50, 50, 50),
        z(1),
        follow(player, vec2(-12, -8)),
    ]);

    // Add a hat/hair
    add([
        circle(12),
        pos(0, 0),
        color(139, 69, 19), // Brown hair
        z(0),
        follow(player, vec2(0, -18)),
    ]);

    return player;
}

// Get an unused monster design
function getAvailableDesign() {
    const available = MONSTER_DESIGNS.filter((d, i) => !usedDesigns.includes(i));
    if (available.length === 0) {
        // All designs used, pick any
        return randi(0, MONSTER_DESIGNS.length);
    }
    const design = choose(available);
    return MONSTER_DESIGNS.indexOf(design);
}

// Create a monster with a number and unique design
function createMonster(number, startPos, designIndex = null) {
    // Get a unique design
    if (designIndex === null) {
        designIndex = getAvailableDesign();
    }
    usedDesigns.push(designIndex);
    const design = MONSTER_DESIGNS[designIndex];

    // Create body based on shape
    const bodySize = 25;
    let bodyComponent;
    if (design.bodyShape === "circle") {
        bodyComponent = circle(bodySize);
    } else {
        bodyComponent = rect(bodySize * 2, bodySize * 2, { radius: 8 });
    }

    const monster = add([
        bodyComponent,
        pos(startPos || vec2(rand(GAME_WIDTH * 0.15, GAME_WIDTH * 0.85), rand(GAME_HEIGHT * 0.15, GAME_HEIGHT * 0.85))),
        color(...design.bodyColor),
        area({ width: 50, height: 50, offset: vec2(-25, -25) }),
        anchor("center"),
        "monster",
        {
            number: number,
            designIndex: designIndex,
            wanderTarget: null,
            wanderTimer: 0,
            isFollowing: false,
            heldHand: null, // "left" or "right" when held by player
            inZone: null,
            isDancing: false,
            isBumping: false,
            isParading: false,
            attachments: [], // Track attached elements for cleanup
            // Animation state
            animTime: rand(0, 10), // Randomize start time so monsters aren't synchronized
            blinkTimer: rand(2, 4),
            isBlinking: false,
            blinkDuration: 0,
            // Animated parts (populated by addMonster* functions)
            antennae: [],
            pupils: [],
            eyeLids: [],
            mouth: null,
        }
    ]);

    // Add features based on design
    addMonsterFeatures(monster, design);
    addMonsterEyes(monster, design);
    addMonsterExpression(monster, design);

    // Add the number display (in a bubble)
    const numBubble = add([
        circle(18),
        pos(0, 0),
        color(255, 255, 255),
        opacity(0.9),
        z(3),
        anchor("center"),
        follow(monster, vec2(0, 40)),
        "monsterPart",
        { parentMonster: monster }
    ]);
    monster.attachments.push(numBubble);

    const numText = add([
        text(String(number), { size: 24 }),
        pos(0, 0),
        color(50, 50, 50),
        anchor("center"),
        z(4),
        follow(monster, vec2(0, 40)),
        "monsterNumber",
        { parentMonster: monster }
    ]);
    monster.attachments.push(numText);

    return monster;
}

// Add unique features (antennae, horns, etc.)
function addMonsterFeatures(monster, design) {
    const darkColor = design.bodyColor.map(c => Math.max(0, c - 60));

    switch (design.feature) {
        case "antennae":
            // Two bouncy antennae (no follow - animated manually)
            const ant1 = add([
                circle(6),
                pos(0, 0),
                color(...darkColor),
                z(0),
                "monsterPart",
                { parentMonster: monster, baseOffset: vec2(-12, -30) }
            ]);
            monster.attachments.push(ant1);
            monster.antennae.push(ant1);
            const ant2 = add([
                circle(6),
                pos(0, 0),
                color(...darkColor),
                z(0),
                "monsterPart",
                { parentMonster: monster, baseOffset: vec2(12, -30) }
            ]);
            monster.attachments.push(ant2);
            monster.antennae.push(ant2);
            // Antenna stalks
            const stalk1 = add([
                rect(3, 15),
                pos(0, 0),
                color(...darkColor),
                z(-1),
                anchor("bot"),
                follow(monster, vec2(-12, -22)),
                "monsterPart",
                { parentMonster: monster }
            ]);
            monster.attachments.push(stalk1);
            const stalk2 = add([
                rect(3, 15),
                pos(0, 0),
                color(...darkColor),
                z(-1),
                anchor("bot"),
                follow(monster, vec2(12, -22)),
                "monsterPart",
                { parentMonster: monster }
            ]);
            monster.attachments.push(stalk2);
            break;

        case "horns":
            // Two small horns
            const horn1 = add([
                polygon([vec2(0, 0), vec2(-8, -18), vec2(8, 0)]),
                pos(0, 0),
                color(255, 220, 180),
                z(0),
                follow(monster, vec2(-15, -18)),
                "monsterPart",
                { parentMonster: monster }
            ]);
            monster.attachments.push(horn1);
            const horn2 = add([
                polygon([vec2(0, 0), vec2(8, -18), vec2(16, 0)]),
                pos(0, 0),
                color(255, 220, 180),
                z(0),
                follow(monster, vec2(7, -18)),
                "monsterPart",
                { parentMonster: monster }
            ]);
            monster.attachments.push(horn2);
            break;

        case "spots":
            // Decorative spots on body
            const spotPositions = [[-10, -5], [8, 3], [-5, 10], [12, -8]];
            spotPositions.forEach(([sx, sy]) => {
                const spot = add([
                    circle(4),
                    pos(0, 0),
                    color(...darkColor),
                    opacity(0.5),
                    z(1),
                    follow(monster, vec2(sx, sy)),
                    "monsterPart",
                    { parentMonster: monster }
                ]);
                monster.attachments.push(spot);
            });
            break;

        case "spikes":
            // Crown of small spikes
            for (let i = 0; i < 5; i++) {
                const angle = (i - 2) * 25;
                const rad = angle * Math.PI / 180;
                const spike = add([
                    polygon([vec2(0, 0), vec2(-4, -12), vec2(4, 0)]),
                    pos(0, 0),
                    color(255, 200, 100),
                    z(0),
                    follow(monster, vec2(Math.sin(rad) * 20, -22 - Math.abs(i - 2) * 2)),
                    "monsterPart",
                    { parentMonster: monster }
                ]);
                monster.attachments.push(spike);
            }
            break;

        case "ears":
            // Cute round ears
            const ear1 = add([
                circle(10),
                pos(0, 0),
                color(...design.bodyColor),
                z(-1),
                follow(monster, vec2(-22, -15)),
                "monsterPart",
                { parentMonster: monster }
            ]);
            monster.attachments.push(ear1);
            const ear2 = add([
                circle(10),
                pos(0, 0),
                color(...design.bodyColor),
                z(-1),
                follow(monster, vec2(22, -15)),
                "monsterPart",
                { parentMonster: monster }
            ]);
            monster.attachments.push(ear2);
            // Inner ears
            const inner1 = add([
                circle(5),
                pos(0, 0),
                color(255, 200, 200),
                z(0),
                follow(monster, vec2(-22, -15)),
                "monsterPart",
                { parentMonster: monster }
            ]);
            monster.attachments.push(inner1);
            const inner2 = add([
                circle(5),
                pos(0, 0),
                color(255, 200, 200),
                z(0),
                follow(monster, vec2(22, -15)),
                "monsterPart",
                { parentMonster: monster }
            ]);
            monster.attachments.push(inner2);
            break;

        case "bow":
            // Cute bow on top
            const bow1 = add([
                circle(8),
                pos(0, 0),
                color(255, 100, 150),
                z(1),
                follow(monster, vec2(-10, -28)),
                "monsterPart",
                { parentMonster: monster }
            ]);
            monster.attachments.push(bow1);
            const bow2 = add([
                circle(8),
                pos(0, 0),
                color(255, 100, 150),
                z(1),
                follow(monster, vec2(10, -28)),
                "monsterPart",
                { parentMonster: monster }
            ]);
            monster.attachments.push(bow2);
            const bowCenter = add([
                circle(5),
                pos(0, 0),
                color(255, 50, 100),
                z(2),
                follow(monster, vec2(0, -28)),
                "monsterPart",
                { parentMonster: monster }
            ]);
            monster.attachments.push(bowCenter);
            break;

        case "freckles":
            // Cute freckles on cheeks
            const frecklePositions = [[-15, 5], [-12, 8], [-18, 8], [15, 5], [12, 8], [18, 8]];
            frecklePositions.forEach(([fx, fy]) => {
                const freckle = add([
                    circle(2),
                    pos(0, 0),
                    color(...darkColor),
                    z(2),
                    follow(monster, vec2(fx, fy)),
                    "monsterPart",
                    { parentMonster: monster }
                ]);
                monster.attachments.push(freckle);
            });
            break;
    }
}

// Add eyes based on style
function addMonsterEyes(monster, design) {
    let eyeSize, pupilSize, eyeOffset;

    switch (design.eyeStyle) {
        case "big":
            eyeSize = 10;
            pupilSize = 5;
            eyeOffset = 10;
            break;
        case "small":
            eyeSize = 6;
            pupilSize = 3;
            eyeOffset = 8;
            break;
        case "wide":
            eyeSize = 8;
            pupilSize = 4;
            eyeOffset = 14;
            break;
        case "sleepy":
            eyeSize = 7;
            pupilSize = 4;
            eyeOffset = 10;
            break;
        default:
            eyeSize = 8;
            pupilSize = 4;
            eyeOffset = 10;
    }

    // White of eyes
    const eye1 = add([
        circle(eyeSize),
        pos(0, 0),
        color(255, 255, 255),
        z(1),
        follow(monster, vec2(-eyeOffset, -5)),
        "monsterPart",
        { parentMonster: monster }
    ]);
    monster.attachments.push(eye1);

    const eye2 = add([
        circle(eyeSize),
        pos(0, 0),
        color(255, 255, 255),
        z(1),
        follow(monster, vec2(eyeOffset, -5)),
        "monsterPart",
        { parentMonster: monster }
    ]);
    monster.attachments.push(eye2);

    // Pupils
    const pupil1 = add([
        circle(pupilSize),
        pos(0, 0),
        color(30, 30, 30),
        z(2),
        follow(monster, vec2(-eyeOffset + 2, -5)),
        "monsterPart",
        { parentMonster: monster }
    ]);
    monster.attachments.push(pupil1);
    monster.pupils.push(pupil1);

    const pupil2 = add([
        circle(pupilSize),
        pos(0, 0),
        color(30, 30, 30),
        z(2),
        follow(monster, vec2(eyeOffset + 2, -5)),
        "monsterPart",
        { parentMonster: monster }
    ]);
    monster.attachments.push(pupil2);
    monster.pupils.push(pupil2);

    // Blink lids (hidden normally, shown when blinking)
    const blinkLid1 = add([
        rect(eyeSize * 2.2, eyeSize * 2.2, { radius: eyeSize }),
        pos(0, 0),
        color(...design.bodyColor),
        opacity(0),
        z(4),
        anchor("center"),
        follow(monster, vec2(-eyeOffset, -5)),
        "monsterPart",
        { parentMonster: monster }
    ]);
    monster.attachments.push(blinkLid1);
    monster.eyeLids.push(blinkLid1);

    const blinkLid2 = add([
        rect(eyeSize * 2.2, eyeSize * 2.2, { radius: eyeSize }),
        pos(0, 0),
        color(...design.bodyColor),
        opacity(0),
        z(4),
        anchor("center"),
        follow(monster, vec2(eyeOffset, -5)),
        "monsterPart",
        { parentMonster: monster }
    ]);
    monster.attachments.push(blinkLid2);
    monster.eyeLids.push(blinkLid2);

    // Sleepy eyes get half-closed lids
    if (design.eyeStyle === "sleepy") {
        const lid1 = add([
            rect(eyeSize * 2, eyeSize),
            pos(0, 0),
            color(...design.bodyColor),
            z(3),
            anchor("center"),
            follow(monster, vec2(-eyeOffset, -8)),
            "monsterPart",
            { parentMonster: monster }
        ]);
        monster.attachments.push(lid1);

        const lid2 = add([
            rect(eyeSize * 2, eyeSize),
            pos(0, 0),
            color(...design.bodyColor),
            z(3),
            anchor("center"),
            follow(monster, vec2(eyeOffset, -8)),
            "monsterPart",
            { parentMonster: monster }
        ]);
        monster.attachments.push(lid2);
    }

    // Eye shine
    const shine1 = add([
        circle(2),
        pos(0, 0),
        color(255, 255, 255),
        z(3),
        follow(monster, vec2(-eyeOffset - 1, -7)),
        "monsterPart",
        { parentMonster: monster }
    ]);
    monster.attachments.push(shine1);

    const shine2 = add([
        circle(2),
        pos(0, 0),
        color(255, 255, 255),
        z(3),
        follow(monster, vec2(eyeOffset - 1, -7)),
        "monsterPart",
        { parentMonster: monster }
    ]);
    monster.attachments.push(shine2);
}

// Add expression (mouth)
function addMonsterExpression(monster, design) {
    let mouthText, mouthSize, mouthOffset;

    switch (design.expression) {
        case "happy":
            mouthText = "ᴗ";
            mouthSize = 16;
            mouthOffset = vec2(0, 10);
            break;
        case "silly":
            mouthText = "ᗜ";
            mouthSize = 18;
            mouthOffset = vec2(0, 10);
            break;
        case "surprised":
            mouthText = "○";
            mouthSize = 14;
            mouthOffset = vec2(0, 12);
            break;
        case "wink":
            mouthText = "ᴗ";
            mouthSize = 14;
            mouthOffset = vec2(0, 10);
            break;
        case "content":
            mouthText = "‿";
            mouthSize = 16;
            mouthOffset = vec2(0, 12);
            break;
        default:
            mouthText = "ᴗ";
            mouthSize = 14;
            mouthOffset = vec2(0, 10);
    }

    const mouth = add([
        text(mouthText, { size: mouthSize }),
        pos(0, 0),
        color(80, 50, 50),
        anchor("center"),
        z(2),
        follow(monster, mouthOffset),
        "monsterPart",
        { parentMonster: monster, baseSize: mouthSize }
    ]);
    monster.attachments.push(mouth);
    monster.mouth = mouth;

    // Wink expression - add closed eye
    if (design.expression === "wink") {
        const winkEye = add([
            text("−", { size: 14 }),
            pos(0, 0),
            color(30, 30, 30),
            anchor("center"),
            z(4),
            follow(monster, vec2(-10, -5)),
            "monsterPart",
            { parentMonster: monster }
        ]);
        monster.attachments.push(winkEye);
    }
}

// Clean up monster attachments when destroyed
function cleanupMonster(monster) {
    // Remove design from used list
    const idx = usedDesigns.indexOf(monster.designIndex);
    if (idx > -1) {
        usedDesigns.splice(idx, 1);
    }

    // Destroy all attached parts
    if (monster.attachments) {
        monster.attachments.forEach(part => {
            if (part.exists()) destroy(part);
        });
    }

    // Also clean up by tag (backup)
    get("monsterPart").forEach(part => {
        if (part.parentMonster === monster) {
            destroy(part);
        }
    });
    get("monsterNumber").forEach(part => {
        if (part.parentMonster === monster) {
            destroy(part);
        }
    });
}

// Get current monster numbers on the field
function getCurrentNumbers() {
    return get("monster")
        .filter(m => !m.isDancing && !m.isBumping)
        .map(m => m.number);
}

// Check if any valid pair exists for the target sums
function hasValidPair(numbers, targets) {
    for (let i = 0; i < numbers.length; i++) {
        for (let j = i + 1; j < numbers.length; j++) {
            if (targets.includes(numbers[i] + numbers[j])) {
                return true;
            }
        }
    }
    return false;
}

// Find a number that creates a valid pair with existing numbers
function findValidNumber(existingNumbers, targets) {
    const possibleNumbers = [];
    for (const target of targets) {
        for (const existing of existingNumbers) {
            const needed = target - existing;
            if (needed >= 1 && needed <= 5) {
                possibleNumbers.push(needed);
            }
        }
    }
    if (possibleNumbers.length > 0) {
        return choose(possibleNumbers);
    }
    return randi(1, 6);
}

// Spawn a monster ensuring at least one valid pair exists
function spawnMonsterSmart() {
    const currentNumbers = getCurrentNumbers();
    let newNumber;

    // If we have few monsters or no valid pairs, create a valid pair
    if (currentNumbers.length < 2 || !hasValidPair(currentNumbers, targetSums)) {
        newNumber = findValidNumber(currentNumbers, targetSums);
    } else {
        // Random chance to either create another valid option or random
        if (rand() < 0.6) {
            newNumber = findValidNumber(currentNumbers, targetSums);
        } else {
            newNumber = randi(1, 6);
        }
    }

    return createMonster(newNumber);
}

// Create a target zone (star shape)
function createTargetZone(targetSum, position) {
    // Glow ring (shows when monsters are inside)
    const glowRing = add([
        circle(70),
        pos(position),
        color(255, 255, 255),
        opacity(0),
        z(-2),
        anchor("center"),
        "zoneGlow",
    ]);

    // Main zone background
    const zone = add([
        circle(60),
        pos(position),
        color(255, 255, 100),
        opacity(0.6),
        area({ width: 120, height: 120, offset: vec2(-60, -60) }),
        "targetZone",
        {
            targetSum: targetSum,
            checkTimer: 0,
            isChecking: false,
            glowRing: glowRing,
            monstersInside: 0,
            baseColor: { r: 255, g: 255, b: 100 },
            pulseTime: 0,
        }
    ]);

    // Star decoration points
    for (let i = 0; i < 5; i++) {
        const angle = (i * 72 - 90) * Math.PI / 180;
        const pointX = Math.cos(angle) * 50;
        const pointY = Math.sin(angle) * 50;
        add([
            polygon([vec2(0, 0), vec2(-10, 25), vec2(10, 25)]),
            pos(position.x + pointX, position.y + pointY),
            color(255, 220, 50),
            rotate(i * 72),
            z(-1),
        ]);
    }

    // Target number display
    const numberText = add([
        text(String(targetSum), { size: 36 }),
        pos(position),
        color(100, 50, 0),
        anchor("center"),
        z(5),
    ]);

    zone.numberText = numberText;

    monstersInZones.set(zone, []);

    return zone;
}

// Update a zone's target sum to a new random value
function updateZoneTarget(zone) {
    const oldSum = zone.targetSum;
    // Generate a new target between 3 and 10, different from current
    let newSum;
    do {
        newSum = randi(3, 11); // randi is exclusive on upper bound
    } while (newSum === oldSum);

    // Update zone data
    zone.targetSum = newSum;

    // Update visual display
    zone.numberText.text = String(newSum);

    // Update targetSums array for smart spawning
    const idx = targetSums.indexOf(oldSum);
    if (idx > -1) {
        targetSums[idx] = newSum;
    }
}

// Spawn sparkle particles for celebration
function spawnSparkles(position) {
    for (let i = 0; i < 12; i++) {
        const angle = (i * 30) * Math.PI / 180;
        const sparkle = add([
            circle(rand(4, 8)),
            pos(position),
            color(255, 255, rand(100, 255)),
            opacity(1),
            z(10),
            {
                vel: vec2(Math.cos(angle) * rand(100, 200), Math.sin(angle) * rand(100, 200)),
                life: 1,
            }
        ]);

        sparkle.onUpdate(() => {
            sparkle.pos = sparkle.pos.add(sparkle.vel.scale(dt()));
            sparkle.life -= dt();
            sparkle.opacity = sparkle.life;
            if (sparkle.life <= 0) {
                destroy(sparkle);
            }
        });
    }
}

// Spawn confetti for big celebrations
function spawnConfetti(position, count = 20) {
    const confettiColors = [
        [255, 100, 100], // Red
        [100, 255, 100], // Green
        [100, 100, 255], // Blue
        [255, 255, 100], // Yellow
        [255, 100, 255], // Pink
        [100, 255, 255], // Cyan
        [255, 180, 100], // Orange
    ];

    for (let i = 0; i < count; i++) {
        const confettiColor = choose(confettiColors);
        const confetti = add([
            rect(rand(6, 12), rand(4, 8)),
            pos(position),
            color(...confettiColor),
            opacity(1),
            rotate(rand(0, 360)),
            anchor("center"),
            z(15),
            {
                vel: vec2(rand(-120, 120), rand(-250, -150)),
                rotSpeed: rand(-400, 400),
                life: rand(1.5, 2.5),
                gravity: 300,
            }
        ]);

        confetti.onUpdate(() => {
            confetti.vel.y += confetti.gravity * dt();
            confetti.pos = confetti.pos.add(confetti.vel.scale(dt()));
            confetti.angle += confetti.rotSpeed * dt();
            confetti.life -= dt();
            if (confetti.life < 0.5) {
                confetti.opacity = confetti.life * 2;
            }
            if (confetti.life <= 0) {
                destroy(confetti);
            }
        });
    }
}

// Celebration animation types
const CELEBRATION_TYPES = ["circle_dance", "jump_wave", "spin_jump", "wiggle_hop"];

// Varied celebration animation
function doCelebration(monster, zone, onComplete) {
    monster.isDancing = true;
    const startPos = monster.pos.clone();
    const celebrationType = choose(CELEBRATION_TYPES);
    let celebTime = 0;
    const duration = 1.5; // seconds

    // Spawn some confetti from this monster
    spawnConfetti(monster.pos, 8);

    const celebUpdate = monster.onUpdate(() => {
        celebTime += dt();
        const progress = celebTime / duration;

        switch (celebrationType) {
            case "circle_dance":
                // Run in a circle
                const circleAngle = progress * Math.PI * 4;
                const radius = 25;
                monster.pos.x = startPos.x + Math.cos(circleAngle) * radius;
                monster.pos.y = startPos.y + Math.sin(circleAngle) * radius * 0.6 - Math.abs(Math.sin(circleAngle * 2)) * 10;
                break;

            case "jump_wave":
                // Jump up and down while swaying
                monster.pos.x = startPos.x + Math.sin(progress * Math.PI * 6) * 20;
                monster.pos.y = startPos.y - Math.abs(Math.sin(progress * Math.PI * 8)) * 30;
                break;

            case "spin_jump":
                // Spin in place with hops
                const spinAngle = progress * Math.PI * 3;
                monster.pos.x = startPos.x + Math.sin(spinAngle) * 15;
                monster.pos.y = startPos.y - Math.abs(Math.sin(progress * Math.PI * 6)) * 25;
                break;

            case "wiggle_hop":
                // Quick side-to-side wiggles with small hops
                monster.pos.x = startPos.x + Math.sin(progress * Math.PI * 12) * 12;
                monster.pos.y = startPos.y - Math.abs(Math.sin(progress * Math.PI * 10)) * 15;
                break;
        }

        if (celebTime >= duration) {
            celebUpdate.cancel();
            onComplete();
        }
    });
}

// Kid celebration (player joins in!)
function doKidCelebration(player, duration = 1.5) {
    const startPos = player.pos.clone();
    let celebTime = 0;
    player.isCelebrating = true;

    const celebUpdate = onUpdate(() => {
        celebTime += dt();
        const progress = celebTime / duration;

        // Kid does a happy jump dance
        player.pos.x = startPos.x + Math.sin(progress * Math.PI * 6) * 15;
        player.pos.y = startPos.y - Math.abs(Math.sin(progress * Math.PI * 8)) * 20;

        // Extra arm animation during celebration
        const armWave = Math.sin(progress * Math.PI * 12) * 12;
        player.leftArm.pos = player.pos.add(vec2(-22 - armWave, -10));
        player.rightArm.pos = player.pos.add(vec2(22 + armWave, -10));

        if (celebTime >= duration) {
            celebUpdate.cancel();
            player.isCelebrating = false;
        }
    });
}

// Bump animation (failure)
function doBumpAnimation(monster1, monster2, onComplete) {
    monster1.isBumping = true;
    monster2.isBumping = true;

    const center = monster1.pos.add(monster2.pos).scale(0.5);
    const dir1 = monster1.pos.sub(center).unit();
    const dir2 = monster2.pos.sub(center).unit();

    // Move them together first
    let bumpPhase = 0;
    const bumpUpdate = onUpdate(() => {
        bumpPhase += dt() * 6;

        if (bumpPhase < Math.PI) {
            // Move together
            monster1.pos = monster1.pos.add(dir2.scale(80 * dt()));
            monster2.pos = monster2.pos.add(dir1.scale(80 * dt()));
        } else if (bumpPhase < Math.PI * 3) {
            // Bounce apart
            monster1.pos = monster1.pos.add(dir1.scale(120 * dt()));
            monster2.pos = monster2.pos.add(dir2.scale(120 * dt()));
        } else {
            bumpUpdate.cancel();
            monster1.isBumping = false;
            monster2.isBumping = false;
            monster1.inZone = null;
            monster2.inZone = null;
            monster1.isFollowing = false;
            monster2.isFollowing = false;
            onComplete();
        }
    });
}

// Exit path types for variety
const EXIT_PATHS = ["straight", "zigzag", "spiral", "bouncy", "loop"];

// Monster runs off screen with varied paths
function runOffScreen(monster) {
    const exitPath = choose(EXIT_PATHS);
    const edge = choose([
        vec2(-50, monster.pos.y),
        vec2(GAME_WIDTH + 50, monster.pos.y),
        vec2(monster.pos.x, -50),
        vec2(monster.pos.x, GAME_HEIGHT + 50),
    ]);

    const baseDir = edge.sub(monster.pos).unit();
    const startPos = monster.pos.clone();
    let runTime = 0;
    const speed = MONSTER_CHASE_SPEED * 1.5;

    // Drop confetti trail for some exit paths
    let lastConfettiTime = 0;

    const runUpdate = monster.onUpdate(() => {
        runTime += dt();

        let moveDir = baseDir.clone();
        let currentSpeed = speed;

        switch (exitPath) {
            case "straight":
                // Simple straight exit
                break;

            case "zigzag":
                // Zigzag pattern
                const zigzagOffset = Math.sin(runTime * 10) * 0.5;
                moveDir = vec2(
                    baseDir.x + baseDir.y * zigzagOffset,
                    baseDir.y - baseDir.x * zigzagOffset
                ).unit();
                break;

            case "spiral":
                // Spiral outward
                const spiralAngle = runTime * 5;
                const spiralOffset = Math.sin(spiralAngle) * 0.4;
                moveDir = vec2(
                    baseDir.x + spiralOffset * Math.cos(spiralAngle),
                    baseDir.y + spiralOffset * Math.sin(spiralAngle)
                ).unit();
                currentSpeed = speed * (1 + Math.sin(runTime * 8) * 0.3);
                break;

            case "bouncy":
                // Bouncing motion while moving
                monster.pos.y -= Math.abs(Math.sin(runTime * 12)) * 8;
                break;

            case "loop":
                // Do a little loop before exiting
                if (runTime < 0.5) {
                    const loopAngle = runTime * Math.PI * 4;
                    monster.pos.x = startPos.x + Math.cos(loopAngle) * 30;
                    monster.pos.y = startPos.y + Math.sin(loopAngle) * 30;
                    return; // Don't apply normal movement during loop
                }
                break;
        }

        monster.pos = monster.pos.add(moveDir.scale(currentSpeed * dt()));

        // Occasionally drop confetti
        if (runTime - lastConfettiTime > 0.2 && rand() < 0.3) {
            lastConfettiTime = runTime;
            spawnConfetti(monster.pos, 2);
        }

        if (monster.pos.x < -60 || monster.pos.x > GAME_WIDTH + 60 ||
            monster.pos.y < -60 || monster.pos.y > GAME_HEIGHT + 60) {
            // Clean up all attached elements
            cleanupMonster(monster);
            destroy(monster);
            runUpdate.cancel();

            // Spawn a new monster after a delay using smart spawning
            wait(1, () => {
                spawnMonsterSmart();
            });
        }
    });
}

// Spawn a floating balloon
function spawnBalloon(position) {
    const balloonColors = [
        [255, 100, 100], // Red
        [100, 200, 255], // Light blue
        [255, 255, 100], // Yellow
        [255, 150, 200], // Pink
        [150, 255, 150], // Light green
        [200, 150, 255], // Purple
    ];
    const balloonColor = choose(balloonColors);

    // Balloon body (oval)
    const balloon = add([
        circle(15),
        pos(position),
        color(...balloonColor),
        opacity(0.9),
        anchor("center"),
        z(20),
        "balloon",
        {
            vel: vec2(rand(-30, 30), rand(-80, -120)),
            wobble: rand(0, Math.PI * 2),
            wobbleSpeed: rand(3, 5),
        }
    ]);

    // Balloon string
    const balloonString = add([
        rect(1, 20),
        pos(position.x, position.y + 15),
        color(100, 100, 100),
        anchor("top"),
        z(19),
        "balloonString",
    ]);

    // Balloon highlight
    const highlight = add([
        circle(4),
        pos(position.x - 5, position.y - 5),
        color(255, 255, 255),
        opacity(0.6),
        z(21),
        "balloonHighlight",
    ]);

    balloon.onUpdate(() => {
        balloon.wobble += balloon.wobbleSpeed * dt();
        balloon.pos.x += Math.sin(balloon.wobble) * 20 * dt();
        balloon.pos.y += balloon.vel.y * dt();

        // Update string position
        balloonString.pos = vec2(balloon.pos.x, balloon.pos.y + 15);
        highlight.pos = vec2(balloon.pos.x - 5, balloon.pos.y - 5);

        // Fade out as it rises
        if (balloon.pos.y < GAME_HEIGHT * 0.2) {
            balloon.opacity -= dt() * 0.5;
            balloonString.opacity = balloon.opacity;
            highlight.opacity = balloon.opacity * 0.6;
        }

        // Destroy when off screen or faded
        if (balloon.pos.y < -30 || balloon.opacity <= 0) {
            destroy(balloonString);
            destroy(highlight);
            destroy(balloon);
        }
    });

    return balloon;
}

// Spawn candy that arcs and falls
function spawnCandy(position, direction) {
    const candyColors = [
        [255, 50, 50],   // Red candy
        [50, 200, 50],   // Green candy
        [255, 200, 50],  // Gold wrapper
        [200, 50, 200],  // Purple candy
        [255, 150, 50],  // Orange candy
    ];
    const candyColor = choose(candyColors);
    const isRound = rand() > 0.5;

    const candy = add([
        isRound ? circle(6) : rect(12, 8, { radius: 2 }),
        pos(position),
        color(...candyColor),
        rotate(rand(0, 360)),
        anchor("center"),
        z(18),
        "candy",
        {
            vel: vec2(direction.x * rand(60, 120), direction.y * rand(60, 120) - 100),
            rotSpeed: rand(-300, 300),
            gravity: 250,
            bounces: 2,
        }
    ]);

    // Add wrapper detail for rectangular candy
    let wrapper = null;
    if (!isRound) {
        wrapper = add([
            rect(3, 10),
            pos(position),
            color(Math.min(255, candyColor[0] + 50), Math.min(255, candyColor[1] + 50), Math.min(255, candyColor[2] + 50)),
            rotate(candy.angle),
            anchor("center"),
            z(19),
            "candyWrapper",
        ]);
    }

    candy.onUpdate(() => {
        candy.vel.y += candy.gravity * dt();
        candy.pos = candy.pos.add(candy.vel.scale(dt()));
        candy.angle += candy.rotSpeed * dt();

        // Update wrapper position and rotation
        if (wrapper) {
            wrapper.pos = candy.pos;
            wrapper.angle = candy.angle;
        }

        // Bounce off ground
        if (candy.pos.y > GAME_HEIGHT - 20 && candy.vel.y > 0) {
            if (candy.bounces > 0) {
                candy.vel.y = -candy.vel.y * 0.5;
                candy.vel.x *= 0.7;
                candy.bounces--;
            } else {
                candy.vel = vec2(0, 0);
                candy.rotSpeed = 0;
            }
        }

        // Destroy after settling
        if (candy.bounces <= 0 && Math.abs(candy.vel.y) < 5) {
            wait(2, () => {
                if (candy.exists()) {
                    if (wrapper && wrapper.exists()) destroy(wrapper);
                    destroy(candy);
                }
            });
        }
    });
}

// The big 50-point parade celebration!
function startParade(player) {
    paradeInProgress = true;

    // Get all monsters on screen
    const monsters = get("monster");
    if (monsters.length === 0) {
        paradeInProgress = false;
        return;
    }

    // Stop all monsters from their normal behavior
    monsters.forEach(m => {
        m.isFollowing = false;
        m.inZone = null;
        m.isParading = true;
    });

    // Clear hand references
    if (typeof leftHandMonster !== 'undefined') leftHandMonster = null;
    if (typeof rightHandMonster !== 'undefined') rightHandMonster = null;

    // Big announcement
    const announcement = add([
        text("PARADE TIME!", { size: 48 }),
        pos(GAME_WIDTH / 2, GAME_HEIGHT / 3),
        anchor("center"),
        color(255, 220, 50),
        z(100),
        opacity(1),
    ]);

    // Flash and fade the announcement
    let announceTime = 0;
    const announceUpdate = onUpdate(() => {
        announceTime += dt();
        announcement.opacity = Math.abs(Math.sin(announceTime * 5));
        if (announceTime > 2) {
            destroy(announcement);
            announceUpdate.cancel();
        }
    });

    // Parade path: rectangle around the screen
    const margin = 60;
    const paradePoints = [
        vec2(margin, GAME_HEIGHT - margin),                    // Bottom left
        vec2(margin, margin + 50),                              // Top left
        vec2(GAME_WIDTH - margin, margin + 50),                // Top right
        vec2(GAME_WIDTH - margin, GAME_HEIGHT - margin),       // Bottom right
        vec2(margin, GAME_HEIGHT - margin),                    // Back to start
    ];

    // Form parade line - monsters follow a leader path with spacing
    const paradeSpeed = 80;
    const spacing = 50;
    let paradeTime = 0;
    let currentPointIndex = 0;
    let distanceAlongPath = 0;

    // Calculate total path length
    let totalPathLength = 0;
    for (let i = 0; i < paradePoints.length - 1; i++) {
        totalPathLength += paradePoints[i].dist(paradePoints[i + 1]);
    }

    // Helper to get position along parade path
    function getParadePosition(distance) {
        let remainingDist = distance % totalPathLength;
        for (let i = 0; i < paradePoints.length - 1; i++) {
            const segmentLength = paradePoints[i].dist(paradePoints[i + 1]);
            if (remainingDist <= segmentLength) {
                const t = remainingDist / segmentLength;
                return paradePoints[i].lerp(paradePoints[i + 1], t);
            }
            remainingDist -= segmentLength;
        }
        return paradePoints[0];
    }

    // Balloon and candy timers
    let lastBalloonTime = 0;
    let lastCandyTime = 0;
    const balloonInterval = 0.4;
    const candyInterval = 0.25;

    // Main parade update
    const paradeUpdate = onUpdate(() => {
        paradeTime += dt();
        distanceAlongPath += paradeSpeed * dt();

        // Position each monster along the parade path with spacing
        monsters.forEach((monster, index) => {
            if (!monster.exists()) return;

            const monsterDist = distanceAlongPath - (index * spacing);
            if (monsterDist > 0) {
                const targetPos = getParadePosition(monsterDist);
                monster.pos = monster.pos.lerp(targetPos, 0.1);

                // Add a little bounce to their step
                monster.pos.y += Math.sin(paradeTime * 8 + index) * 3;
            }
        });

        // Release balloons periodically
        if (paradeTime - lastBalloonTime > balloonInterval) {
            lastBalloonTime = paradeTime;
            const randomMonster = choose(monsters.filter(m => m.exists()));
            if (randomMonster) {
                spawnBalloon(randomMonster.pos.add(vec2(0, -20)));
            }
        }

        // Throw candy periodically
        if (paradeTime - lastCandyTime > candyInterval) {
            lastCandyTime = paradeTime;
            const randomMonster = choose(monsters.filter(m => m.exists()));
            if (randomMonster) {
                const throwDir = vec2(rand(-1, 1), rand(-0.5, 0.5)).unit();
                spawnCandy(randomMonster.pos, throwDir);
            }
        }

        // Kid follows behind the parade
        if (monsters.length > 0 && monsters[monsters.length - 1].exists()) {
            const lastMonsterPos = getParadePosition(distanceAlongPath - (monsters.length * spacing));
            player.pos = player.pos.lerp(lastMonsterPos, 0.08);
            player.pos.y += Math.sin(paradeTime * 8) * 3;
        }

        // End parade after one full loop
        if (distanceAlongPath > totalPathLength + (monsters.length * spacing) + 100) {
            paradeUpdate.cancel();

            // Final celebration burst
            for (let i = 0; i < 10; i++) {
                wait(i * 0.1, () => {
                    spawnBalloon(vec2(rand(50, GAME_WIDTH - 50), GAME_HEIGHT - 50));
                    spawnConfetti(vec2(rand(50, GAME_WIDTH - 50), rand(100, 300)), 15);
                });
            }

            // Return monsters to normal after a moment
            wait(1.5, () => {
                monsters.forEach(m => {
                    if (m.exists()) {
                        m.isParading = false;
                        m.wanderTarget = vec2(rand(GAME_WIDTH * 0.15, GAME_WIDTH * 0.85), rand(GAME_HEIGHT * 0.15, GAME_HEIGHT * 0.85));
                    }
                });
                paradeInProgress = false;
            });
        }
    });
}

// Main game scene
scene("game", () => {
    // Reset game state
    usedDesigns = [];
    targetSums = [4, 5, 7]; // Store our target sums
    paradeTriggered = false;
    paradeInProgress = false;

    drawBackground();

    // Create player
    const player = createPlayer();

    // Create target zones (all on the grassy area - grass starts at 0.10)
    // Layout differs for portrait vs landscape to use space better
    if (isMobile && isPortrait) {
        // Portrait mode: spread zones vertically
        createTargetZone(5, vec2(GAME_WIDTH * 0.25, GAME_HEIGHT * 0.25));
        createTargetZone(7, vec2(GAME_WIDTH * 0.75, GAME_HEIGHT * 0.50));
        createTargetZone(4, vec2(GAME_WIDTH * 0.25, GAME_HEIGHT * 0.75));
    } else {
        // Landscape mode: zones spread horizontally
        createTargetZone(5, vec2(GAME_WIDTH * 0.15, GAME_HEIGHT * 0.50));
        createTargetZone(7, vec2(GAME_WIDTH * 0.85, GAME_HEIGHT * 0.50));
        createTargetZone(4, vec2(GAME_WIDTH / 2, GAME_HEIGHT * 0.80));
    }

    // Create initial monsters with guaranteed valid pairs
    // First, create a pair that adds up to one of the targets
    const firstTarget = choose(targetSums);
    const firstNum = randi(1, Math.min(5, firstTarget - 1));
    const secondNum = firstTarget - firstNum;
    createMonster(firstNum);
    createMonster(secondNum);

    // Then add more monsters using smart spawning
    for (let i = 0; i < 3; i++) {
        spawnMonsterSmart();
    }

    // Touch event handlers for mobile
    if (isTouchDevice) {
        const canvas = k.canvas;

        const updateTouchPos = (e) => {
            e.preventDefault();
            const touch = e.touches[0] || e.changedTouches[0];
            const rect = canvas.getBoundingClientRect();
            const scaleX = GAME_WIDTH / rect.width;
            const scaleY = GAME_HEIGHT / rect.height;
            currentPointerPos = vec2(
                (touch.clientX - rect.left) * scaleX,
                (touch.clientY - rect.top) * scaleY
            );
        };

        canvas.addEventListener('touchstart', updateTouchPos, { passive: false });
        canvas.addEventListener('touchmove', updateTouchPos, { passive: false });
        canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
        }, { passive: false });
    }

    // Player follows mouse or touch
    onUpdate(() => {
        // Skip player control during parade (parade controls player movement)
        if (paradeInProgress) return;

        const mpos = isTouchDevice ? currentPointerPos : mousePos();
        const dir = mpos.sub(player.pos);

        // Only move if mouse is far enough from player
        if (dir.len() > 10) {
            const moveDir = dir.unit();
            const speed = Math.min(dir.len() * 3, PLAYER_SPEED);
            player.pos = player.pos.add(moveDir.scale(speed * dt()));
            player.direction = moveDir;
            player.isMoving = true;
        } else {
            player.isMoving = false;
        }

        // Keep player in bounds
        player.pos.x = clamp(player.pos.x, 30, GAME_WIDTH - 30);
        player.pos.y = clamp(player.pos.y, 30, GAME_HEIGHT - 30);

        // Animate player (skip if celebrating - celebration handles its own animation)
        if (!player.isCelebrating) {
            player.animTime += dt() * 10;

            if (player.isMoving) {
                // Running animation - legs alternate, arms swing
                const legSwing = Math.sin(player.animTime) * 8;
                const armSwing = Math.sin(player.animTime) * 6;

                player.leftLeg.pos = player.pos.add(vec2(-8, 18 + legSwing));
                player.rightLeg.pos = player.pos.add(vec2(8, 18 - legSwing));
                player.leftArm.pos = player.pos.add(vec2(-22, -5 - armSwing));
                player.rightArm.pos = player.pos.add(vec2(22, -5 + armSwing));
                player.bobOffset = 0;
            } else {
                // Idle bobbing animation
                player.bobOffset = Math.sin(player.animTime * 0.3) * 3;

                // Gentle arm wave when idle
                const idleWave = Math.sin(player.animTime * 0.5) * 3;

                player.leftLeg.pos = player.pos.add(vec2(-8, 18));
                player.rightLeg.pos = player.pos.add(vec2(8, 18));
                player.leftArm.pos = player.pos.add(vec2(-22, -5 + idleWave));
                player.rightArm.pos = player.pos.add(vec2(22, -5 - idleWave));
            }
        } else {
            // During celebration, just update leg positions to follow player
            player.leftLeg.pos = player.pos.add(vec2(-8, 18));
            player.rightLeg.pos = player.pos.add(vec2(8, 18));
        }
    });

    // Track which monsters are held in each hand
    let leftHandMonster = null;
    let rightHandMonster = null;

    // Count how many monsters are currently following
    function countFollowing() {
        return (leftHandMonster ? 1 : 0) + (rightHandMonster ? 1 : 0);
    }

    // Release and scatter all following monsters
    function scatterFollowingMonsters() {
        let released = false;

        // Release left hand monster
        if (leftHandMonster && !leftHandMonster.isDancing && !leftHandMonster.isBumping) {
            leftHandMonster.isFollowing = false;
            leftHandMonster.heldHand = null;
            const angle = rand(Math.PI * 0.5, Math.PI * 1.5); // Scatter to the left
            const distance = rand(150, 250);
            leftHandMonster.wanderTarget = vec2(
                clamp(player.pos.x + Math.cos(angle) * distance, 50, GAME_WIDTH - 50),
                clamp(player.pos.y + Math.sin(angle) * distance, GAME_HEIGHT * 0.35, GAME_HEIGHT - 50)
            );
            leftHandMonster.wanderTimer = rand(2, 4);
            leftHandMonster = null;
            released = true;
        }

        // Release right hand monster
        if (rightHandMonster && !rightHandMonster.isDancing && !rightHandMonster.isBumping) {
            rightHandMonster.isFollowing = false;
            rightHandMonster.heldHand = null;
            const angle = rand(-Math.PI * 0.5, Math.PI * 0.5); // Scatter to the right
            const distance = rand(150, 250);
            rightHandMonster.wanderTarget = vec2(
                clamp(player.pos.x + Math.cos(angle) * distance, 50, GAME_WIDTH - 50),
                clamp(player.pos.y + Math.sin(angle) * distance, GAME_HEIGHT * 0.35, GAME_HEIGHT - 50)
            );
            rightHandMonster.wanderTimer = rand(2, 4);
            rightHandMonster = null;
            released = true;
        }

        // Visual feedback if monsters were released
        if (released) {
            // Spawn release particles around player
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const particle = add([
                    circle(5),
                    pos(player.pos),
                    color(255, 200, 100),
                    opacity(1),
                    z(10),
                    { vel: vec2(Math.cos(angle) * 150, Math.sin(angle) * 150), life: 0.5 }
                ]);
                particle.onUpdate(() => {
                    particle.pos = particle.pos.add(particle.vel.scale(dt()));
                    particle.life -= dt();
                    particle.opacity = particle.life * 2;
                    if (particle.life <= 0) destroy(particle);
                });
            }
        }
    }

    // Set the global release function so shake detection can call it
    releaseFollowingMonsters = scatterFollowingMonsters;

    // Desktop: Press 'R' or 'Escape' to release monsters
    onKeyPress("r", scatterFollowingMonsters);
    onKeyPress("escape", scatterFollowingMonsters);

    // Player bumps into monster - make it follow (hold hands)
    player.onCollide("monster", (monster) => {
        if (!monster.isFollowing && !monster.isDancing && !monster.isBumping) {
            // Assign to an empty hand
            if (!leftHandMonster) {
                monster.isFollowing = true;
                monster.heldHand = "left";
                leftHandMonster = monster;
            } else if (!rightHandMonster) {
                monster.isFollowing = true;
                monster.heldHand = "right";
                rightHandMonster = monster;
            }
        }
    });

    // Visual indicator for holding hands
    onDraw(() => {
        // Draw hand-holding lines
        if (leftHandMonster && leftHandMonster.isFollowing && !leftHandMonster.isDancing) {
            const handPos = player.pos.add(vec2(-25, 5));
            drawLine({
                p1: handPos,
                p2: leftHandMonster.pos,
                width: 3,
                color: rgb(255, 220, 180), // Skin tone
            });
            // Draw a little hand circle
            drawCircle({
                pos: handPos,
                radius: 4,
                color: rgb(255, 220, 180),
            });
        }
        if (rightHandMonster && rightHandMonster.isFollowing && !rightHandMonster.isDancing) {
            const handPos = player.pos.add(vec2(25, 5));
            drawLine({
                p1: handPos,
                p2: rightHandMonster.pos,
                width: 3,
                color: rgb(255, 220, 180), // Skin tone
            });
            // Draw a little hand circle
            drawCircle({
                pos: handPos,
                radius: 4,
                color: rgb(255, 220, 180),
            });
        }
    });

    // Monster behavior
    onUpdate("monster", (monster) => {
        // Movement logic - skip if dancing, bumping, or in parade
        if (!monster.isDancing && !monster.isBumping && !monster.isParading) {
            if (monster.isFollowing) {
                // Position at player's side (holding hands)
                const handOffset = monster.heldHand === "left" ? -50 : 50;
                const targetPos = player.pos.add(vec2(handOffset, 10));

                // Smoothly move to hand position
                const dir = targetPos.sub(monster.pos);
                if (dir.len() > 5) {
                    monster.pos = monster.pos.add(dir.unit().scale(MONSTER_CHASE_SPEED * 1.5 * dt()));
                } else {
                    monster.pos = targetPos;
                }
            } else {
                // Wander randomly - spread out across the play area
                monster.wanderTimer -= dt();

                if (monster.wanderTimer <= 0 || !monster.wanderTarget) {
                    // Pick a random spot, but avoid the center to spread out
                    // Divide screen into regions and pick randomly (relative to screen size)
                    const regions = [
                        { x: [GAME_WIDTH * 0.1, GAME_WIDTH * 0.35], y: [GAME_HEIGHT * 0.35, GAME_HEIGHT * 0.65] },   // Left
                        { x: [GAME_WIDTH * 0.65, GAME_WIDTH * 0.9], y: [GAME_HEIGHT * 0.35, GAME_HEIGHT * 0.65] },  // Right
                        { x: [GAME_WIDTH * 0.3, GAME_WIDTH * 0.7], y: [GAME_HEIGHT * 0.55, GAME_HEIGHT * 0.85] },   // Bottom middle
                        { x: [GAME_WIDTH * 0.3, GAME_WIDTH * 0.7], y: [GAME_HEIGHT * 0.35, GAME_HEIGHT * 0.5] },    // Top middle
                    ];
                    const region = choose(regions);
                    monster.wanderTarget = vec2(
                        rand(region.x[0], region.x[1]),
                        rand(region.y[0], region.y[1])
                    );
                    monster.wanderTimer = rand(3, 6);
                }

                const dir = monster.wanderTarget.sub(monster.pos);
                if (dir.len() > 10) {
                    monster.pos = monster.pos.add(dir.unit().scale(MONSTER_SPEED * dt()));
                }
            }

            // Keep monster in bounds
            monster.pos.x = clamp(monster.pos.x, 30, GAME_WIDTH - 30);
            monster.pos.y = clamp(monster.pos.y, 30, GAME_HEIGHT - 30);
        }

        // Monster animations (always run)
        monster.animTime += dt();

        // Animate antennae (wiggle)
        if (monster.antennae.length > 0) {
            const wiggle = Math.sin(monster.animTime * 5) * 4;
            monster.antennae.forEach((ant, i) => {
                const dir = i === 0 ? -1 : 1;
                ant.pos = monster.pos.add(vec2(dir * 12 + wiggle * dir, -30 + Math.abs(wiggle) * 0.5));
            });
        }

        // Blink animation
        monster.blinkTimer -= dt();
        if (monster.blinkTimer <= 0 && !monster.isBlinking) {
            monster.isBlinking = true;
            monster.blinkDuration = 0.15;
            // Show blink lids
            monster.eyeLids.forEach(lid => lid.opacity = 1);
        }
        if (monster.isBlinking) {
            monster.blinkDuration -= dt();
            if (monster.blinkDuration <= 0) {
                monster.isBlinking = false;
                monster.blinkTimer = rand(2, 5);
                // Hide blink lids
                monster.eyeLids.forEach(lid => lid.opacity = 0);
            }
        }

        // Mouth animation (subtle open/close)
        if (monster.mouth && monster.mouth.exists()) {
            const mouthScale = 1 + Math.sin(monster.animTime * 2) * 0.1;
            monster.mouth.scale = vec2(1, mouthScale);
        }
    });

    // Zone collision detection
    onUpdate("targetZone", (zone) => {
        // Skip zone logic during parade
        if (paradeInProgress) return;

        const monstersNearby = [];

        get("monster").forEach((monster) => {
            if (monster.isDancing || monster.isBumping || monster.isParading) return;

            const dist = monster.pos.dist(zone.pos);
            if (dist < 70) {
                monstersNearby.push(monster);
                monster.inZone = zone;
            } else if (monster.inZone === zone) {
                monster.inZone = null;
            }
        });

        monstersInZones.set(zone, monstersNearby);
        zone.monstersInside = monstersNearby.length;

        // Visual feedback based on monsters inside
        zone.pulseTime += dt();

        if (monstersNearby.length === 0) {
            // No monsters - normal state
            zone.color = rgb(255, 255, 100);
            zone.opacity = 0.6;
            zone.glowRing.opacity = 0;
        } else if (monstersNearby.length === 1) {
            // One monster - gentle pulse, slightly brighter
            const pulse = Math.sin(zone.pulseTime * 4) * 0.15 + 0.75;
            zone.color = rgb(255, 240, 150);
            zone.opacity = pulse;
            zone.glowRing.opacity = 0.3;
            zone.glowRing.color = rgb(255, 255, 200);
        } else {
            // Two or more monsters - strong pulse, color shift to green/ready
            const pulse = Math.sin(zone.pulseTime * 6) * 0.2 + 0.8;
            zone.color = rgb(200, 255, 150); // Greenish - ready!
            zone.opacity = pulse;
            zone.glowRing.opacity = 0.5 + Math.sin(zone.pulseTime * 8) * 0.2;
            zone.glowRing.color = rgb(150, 255, 150);
        }

        // Check for two monsters in zone
        if (monstersNearby.length >= 2 && !zone.isChecking) {
            zone.isChecking = true;
            zone.checkTimer = ZONE_CHECK_DELAY;
        }

        if (zone.isChecking) {
            zone.checkTimer -= dt();

            if (zone.checkTimer <= 0) {
                zone.isChecking = false;

                // Get the first two monsters
                const m1 = monstersNearby[0];
                const m2 = monstersNearby[1];

                if (m1 && m2 && !m1.isDancing && !m2.isDancing) {
                    const sum = m1.number + m2.number;

                    if (sum === zone.targetSum) {
                        // Success!
                        score += 10;

                        // Check for 50-point parade!
                        const shouldParade = score >= 50 && !paradeTriggered && !paradeInProgress;

                        // Clear hand references since these monsters are celebrating
                        if (leftHandMonster === m1 || leftHandMonster === m2) leftHandMonster = null;
                        if (rightHandMonster === m1 || rightHandMonster === m2) rightHandMonster = null;

                        // Big celebration effects!
                        spawnSparkles(zone.pos);
                        spawnConfetti(zone.pos, 30); // Big confetti burst

                        // Kid celebrates too!
                        doKidCelebration(player, 1.5);

                        // Monsters do varied celebrations then run off
                        let celebsDone = 0;
                        const checkCelebsDone = () => {
                            celebsDone++;
                            if (celebsDone === 2) {
                                // Change target zone number for next challenge
                                updateZoneTarget(zone);
                                runOffScreen(m1);
                                runOffScreen(m2);

                                // Trigger parade if we hit 50 points!
                                if (shouldParade) {
                                    paradeTriggered = true;
                                    wait(2, () => {
                                        startParade(player);
                                    });
                                }
                            }
                        };

                        doCelebration(m1, zone, checkCelebsDone);
                        doCelebration(m2, zone, checkCelebsDone);
                    } else {
                        // Failure - bump and scatter
                        // Clear hand references
                        if (leftHandMonster === m1 || leftHandMonster === m2) leftHandMonster = null;
                        if (rightHandMonster === m1 || rightHandMonster === m2) rightHandMonster = null;

                        doBumpAnimation(m1, m2, () => {
                            // Give them new wander targets away from zone
                            m1.wanderTarget = vec2(rand(GAME_WIDTH * 0.15, GAME_WIDTH * 0.85), rand(GAME_HEIGHT * 0.5, GAME_HEIGHT * 0.85));
                            m2.wanderTarget = vec2(rand(GAME_WIDTH * 0.15, GAME_WIDTH * 0.85), rand(GAME_HEIGHT * 0.5, GAME_HEIGHT * 0.85));
                        });
                    }
                }
            }
        }
    });

    // Score display
    add([
        text("Score: 0", { size: 24 }),
        pos(20, 20),
        color(255, 255, 255),
        z(100),
        { update() { this.text = `Score: ${score}`; } }
    ]);

    // Instructions
    const instructionText = isTouchDevice
        ? "Touch to move. Bump monsters to collect. Shake to release!"
        : "Mouse to move. Bump monsters to collect. Press R to release!";
    const instructionSize = isTouchDevice ? 11 : 14;

    add([
        text(instructionText, { size: instructionSize }),
        pos(GAME_WIDTH / 2, GAME_HEIGHT - 20),
        anchor("center"),
        color(50, 50, 50),
        z(100),
    ]);
});

// Title screen
scene("title", () => {
    add([
        rect(GAME_WIDTH, GAME_HEIGHT),
        color(135, 206, 235),
    ]);

    // Title text - adjust size for mobile
    const titleSize = isMobile ? 48 : 64;
    const subtitleSize = isMobile ? 18 : 24;

    add([
        text("MONSTER MATH", { size: titleSize }),
        pos(GAME_WIDTH / 2, GAME_HEIGHT * 0.25),
        anchor("center"),
        color(255, 100, 100),
    ]);

    add([
        text("Help friendly monsters learn addition!", { size: subtitleSize }),
        pos(GAME_WIDTH / 2, GAME_HEIGHT * 0.35),
        anchor("center"),
        color(80, 80, 80),
    ]);

    // Animated monster on title screen
    const monsterY = GAME_HEIGHT * 0.55;
    const titleMonster = add([
        circle(40),
        pos(GAME_WIDTH / 2, monsterY),
        color(150, 255, 150),
    ]);

    add([
        circle(12),
        pos(0, 0),
        color(255, 255, 255),
        follow(titleMonster, vec2(-12, -8)),
    ]);
    add([
        circle(12),
        pos(0, 0),
        color(255, 255, 255),
        follow(titleMonster, vec2(12, -8)),
    ]);
    add([
        circle(6),
        pos(0, 0),
        color(0, 0, 0),
        follow(titleMonster, vec2(-10, -8)),
    ]);
    add([
        circle(6),
        pos(0, 0),
        color(0, 0, 0),
        follow(titleMonster, vec2(14, -8)),
    ]);
    add([
        text("3", { size: 32 }),
        pos(0, 0),
        anchor("center"),
        color(50, 50, 50),
        follow(titleMonster, vec2(0, 45)),
    ]);

    // Bounce animation
    let t = 0;
    titleMonster.onUpdate(() => {
        t += dt() * 3;
        titleMonster.pos.y = monsterY + Math.sin(t) * 15;
    });

    const startText = isTouchDevice
        ? "Tap to Start"
        : "Press SPACE or Click to Start";

    add([
        text(startText, { size: 28 }),
        pos(GAME_WIDTH / 2, GAME_HEIGHT * 0.8),
        anchor("center"),
        color(100, 100, 100),
    ]);

    onKeyPress("space", () => go("game"));
    onClick(() => go("game"));

    // Touch support for title screen
    if (isTouchDevice) {
        const canvas = k.canvas;
        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            go("game");
        }, { once: true, passive: false });
    }
});

// Start with title screen
go("title");
