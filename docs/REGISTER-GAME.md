# REGISTER: changes the game wants outside its own files

The game needs **nothing** outside its files to work. Sound comes from `import('./audio.js')` inside `lumi-play.js`
(the same module instance app.js loads, so the same prefs and mute), so `editor.js` does not need to pass anything.

## 1. Optional: a `wow` mood in `engine/form/js/lumi-art.js`

The game already asks for `lumiArt({ mood: 'wow' })` for 1.4 s at every tenth point. Until this lands, an unknown
mood falls through to the happy face, so nothing breaks. If you want the fourth face, in `lumiArt()` replace the
`mouth` ternary's first branch so it reads:

```js
  const mouth = mood === 'sad' ? '<path d="M41 58q9-6 18 0" fill="none" stroke="var(--orange)" stroke-width="4.2" stroke-linecap="round"/>'
    : mood === 'hmm' ? '<path d="M42 57.5h15" fill="none" stroke="var(--orange)" stroke-width="4.2" stroke-linecap="round"/>'
    : mood === 'wow' ? '<ellipse cx="50" cy="57" rx="5" ry="6" fill="var(--orange)"/>'
    : '<path d="M42 54.5q8 7 16 0" fill="none" stroke="var(--orange)" stroke-width="4.2" stroke-linecap="round"/>';
```

and update the header comment's mood list to `'happy'|'sad'|'hmm'|'wow'`. No other caller is affected.
