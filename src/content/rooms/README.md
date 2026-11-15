# Hand-built chambers

Room templates. A room is an ASCII tile map: row index is world y, column index is world x. World (0, 0) is the far (top) corner on screen; x runs down-right, y runs down-left.

One file per chamber, each with the template as its default export. A file put in this folder is picked up by itself (see `../index.ts`); its `id` must be the file name. Most chambers of a run are not built by hand: they come from the generator in `src/sim/roomgen.ts`, which writes the same kind of map.

## Legend

```
#        wall: shots and launched bodies bounce off it
7 9 1 3  a wall cut at 45 degrees. The digit says which corner of the tile is solid, as on a
         numeric keypad (7 top-left, 9 top-right, 1 bottom-left, 3 bottom-right)
~        pit: nobody walks in, shots fly over, a launched body falls in
.        floor
o        round post (stands in the middle of the tile)
B        bumper: a post that kicks back harder
b        a flat mark on the floor, decoration only
s        spawn mark: enemies may appear here
P        where the party starts (near the bottom corner)
D        door slot, in a far wall: row 0 or column 0
r        the focus of the room: where a reward or a boss stands
(space)  nothing
```

The validator (src/sim/room.ts, checked by tests) requires a closed arena, exactly one P and one r, every floor tile reachable from P on foot, and at least four spawn marks well away from P and not tucked behind a post.
