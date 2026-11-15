# Extras

An extra is a piece of presentation in one file: it watches the chamber and draws. Put a file in this folder whose default export is an `ExtraFactory` (see `index.ts`) and the game runs it. Nothing else has to be edited, so an extra never collides with anybody else's work.

`floorRipples.ts` is the example to copy:

```ts
const myExtra: ExtraFactory = ({ stage, camera, textures, localSlot }) => {
  // make your sprites once and add them to a layer of the stage
  return {
    room(room, theme) {},          // a chamber came on screen: clear what you drew
    handle(ev, world) {},          // something happened: a bounce, a hit, a death
    update(dt, world, alpha, t) {},// once a frame, after the camera moved
    destroy() {},                  // give back what you made
  };
};
export default myExtra;
```

Rules that keep the game fast and in step:

- **Read, never write.** An extra is handed the world to look at. It must not change it, and it must not import the parts of `src/sim` that do (a test checks).
- **Make things once.** Create sprites in the factory and reuse them from a pool; nothing is created per frame.
- **Layers, not filters.** Add to the layers of `Stage` (`decals` for the floor, `fxGlow` for glows, `overlay` and `ui` for the screen). Filters belong to the stage alone (a test checks).
- **Colours come from the palette**: `src/render/palette.ts`, or a file of your own in `src/render/palette/`.
