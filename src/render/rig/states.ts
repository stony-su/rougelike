// The animation states every character must have. Tests check each rig against these lists.

/** The player: idle, movement, dash, attack, special, the stake gestures, hit and death. */
export const PLAYER_STATES = ['idle', 'run', 'dash', 'swing', 'shot', 'plant', 'whip', 'hurt', 'dead'] as const;

/** Every enemy: appearing, idle, movement, attack with wind-up and recovery, hit, stunned and death. */
export const ENEMY_STATES = ['spawn', 'idle', 'move', 'windup', 'attack', 'recover', 'hurt', 'stun', 'dead'] as const;
