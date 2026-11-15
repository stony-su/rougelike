---
id: T21
title: Solo side-chambers: each player their own way, then together again
status: open
owner:
milestone: 4
weight: 3
needs: [T10]
files:
  - src/sim/session.ts
  - src/sim/fork.ts
  - src/ui/waiting.ts
  - tests/fork.test.ts
touches:
  - src/sim/run.ts
  - src/sim/types.ts
  - src/game/game.ts
  - src/ui/hud.ts
---

## What to build

Three times a run the party splits (DESIGN.md section 7): at a fork every player walks into a short chamber of their own, at the same moment, and they meet again in the next shared chamber.

- The session holds one world per player during a fork (`worlds` and `where` already allow it) and steps them all.
- Whoever finishes early waits at the threshold; a panel names who is still inside. Going down alone in co-op costs the prize, not the run: you rejoin at 30% health.
- Choices the party makes together (which door, the Wager) are settled by majority after a 10-second count shown on every screen; a tie is settled the same way everywhere.

## Done when

- With 1, 2 and 3 players, each gets a world of their own from a different seed, and everyone arrives in the same next chamber (tests).
- Three pretend laptops stay in step through the split and the meeting.
- A player who drops out inside their side-chamber does not hold up the others.
- A vote with a tie gives the same answer on every laptop.
