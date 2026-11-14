// The animation states every character must have. Tests check each rig against these lists.

/**
 * A hero: standing, running, the dash, the attack (three swings, loosing an arrow, or three
 * jabs, told apart by variant), the special, being hurt and going down.
 */
export const HERO_STATES = ['idle', 'run', 'dash', 'attack', 'special', 'hurt', 'down'] as const;
/** The Sword also holds a guard. */
export const SWORD_STATES = [...HERO_STATES, 'guard'] as const;
/** The Fist also draws the hand back and lets it go. */
export const FIST_STATES = [...HERO_STATES, 'charge', 'release'] as const;

/** Every enemy: appearing, idle, movement, attack with wind-up and recovery, hit, stunned, sent flying, and death. */
export const ENEMY_STATES = ['spawn', 'idle', 'move', 'windup', 'attack', 'recover', 'hurt', 'stun', 'launched', 'dead'] as const;
