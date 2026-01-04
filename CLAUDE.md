# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Monster Math is a browser-based educational game that teaches addition to children. Players guide a character to collect cute monsters with numbers, then bring pairs of monsters to target zones where their numbers must sum to the zone's target value.

## Tech Stack

- **Game Engine**: Kaboom.js v3000.1.17 (loaded via CDN from unpkg.com)
- **Language**: Vanilla JavaScript (ES modules)
- **No build process**: Open `index.html` directly in a browser or use any static file server

## Running the Game

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve

# Or simply open index.html in a browser
```

## Architecture

The entire game is contained in `main.js` as a single-file Kaboom.js application:

- **Scenes**: `title` (start screen) and `game` (main gameplay)
- **Game Objects**: Player character, monsters with unique visual designs, target zones (star shapes)
- **Core Mechanics**: Mouse-follow player movement, monster collision/following, zone-based sum validation with delay timer

### Key Game Constants (main.js:13-17)

- `PLAYER_SPEED`, `MONSTER_SPEED`, `MONSTER_CHASE_SPEED` - Movement speeds
- `ZONE_CHECK_DELAY` - Seconds before validating monster sum in a zone
- `MAX_FOLLOWING` - Maximum monsters that can follow player simultaneously

### Monster System

- 8 unique monster designs defined in `MONSTER_DESIGNS` array (main.js:20-85)
- Each monster has: body shape, color, eye style, feature (antennae/horns/spots/etc.), expression
- Smart spawning (`spawnMonsterSmart()`) ensures valid number pairs always exist for target sums
- Monsters have animated features: wiggling antennae, blinking eyes, mouth movement

### Animation System

- **Player**: Has arms and legs that animate when moving (running), gentle bobbing/waving when idle
- **Monsters**: Antennae wiggle (sine wave), periodic eye blinking (2-5 second intervals), subtle mouth scaling
- **Target Zones**: Change to a new random target sum (3-10) after each successful match

### State Management

- `score` - Player score
- `monstersInZones` - Map tracking which monsters are in each target zone
- `usedDesigns` - Tracks active monster designs to ensure visual uniqueness
- `targetSums` - Array of valid target sums (dynamically updated after matches)
