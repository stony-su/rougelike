// The animation states every character must have. Tests check each rig against these lists.

/** A hero: idle, movement, dash, attack, hit and going down. */
export const PLAYER_STATES = ['idle', 'run', 'dash', 'swing', 'hurt', 'dead'] as const;

/** Every enemy: appearing, idle, movement, attack with wind-up and recovery, hit, stunned and death. */
export const ENEMY_STATES = ['spawn', 'idle', 'move', 'windup', 'attack', 'recover', 'hurt', 'stun', 'dead'] as const;
