// Which build of the game this is. The page and the host program are built as a pair and stamped
// with the same id (scripts/host.mjs); a laptop whose page carries a different id is told to
// reload rather than play a game that could not stay in step. Alone, the id is just "dev".
declare const __BUILD_ID__: string | undefined;

export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
