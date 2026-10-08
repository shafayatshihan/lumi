// Lumi, the character, wherever the app shows it small: the loading screen's runner, the sign-in card and the
// waiting game's flyer.
//
// This used to be a hand-drawn SVG cartoon OF the character - a bell body with two little feet that ran along the
// progress bar. The owner cut it (2026-10-08): the app's hero is the knitted plush in assets/character.mp4, the
// drawing did not look like it, and the two side by side read as two different mascots. So this serves a CROP of
// the real thing (assets/lumi-mascot.png, cut from the same frame as the app icon). Nothing here is drawn by
// hand, and it has no legs, on purpose.
//
// lumiArt({ mood, size }) -> html string. `mood` is accepted and IGNORED: a photograph has one expression. It
// stays in the signature because the loading screen and the game both pass it, and wanting a mood is reasonable -
// if the character is ever shot again with other faces, map them here and no caller has to change.
export function lumiArt({ mood = 'happy', size = 64 } = {}) {
  const px = Math.max(1, Math.round(Number(size) || 64));
  const m = String(mood || '').replace(/[^a-z]/gi, '');
  return `<img class="lumi-art" src="/assets/lumi-mascot.png" alt="" aria-hidden="true" draggable="false"`
    + ` width="${px}" height="${px}" data-mood="${m}">`;
}
