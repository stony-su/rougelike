// The read-only questions presentation may ask about how things will move. Presentation never
// imports the modules that change a world; what it needs to predict, it asks here, and gets the
// answer from the very code that will do the moving.
export { previewArrow } from './projectiles';
// What a camp would let a player do, without doing it.
export { BUY_RATION, BUY_RESTOCK, CAMP, REST_HEAL, atCamp, priceOf, raisable, restockPrice } from './camp';
