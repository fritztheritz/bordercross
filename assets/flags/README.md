# Flag icons

SVG flags in this directory (one per ISO 3166-1 alpha-2 code used in
`js/data.js`) are from the [flag-icons](https://github.com/lipis/flag-icons)
project by Panayiotis Lipiridis, MIT licensed — see `LICENSE` in this folder.

Self-hosted here (rather than loaded from a CDN at runtime) so the game
works offline via the service worker and doesn't depend on a third party
staying up. Regenerate/update by re-fetching `flags/4x3/<code>.svg` for each
code in `COUNTRIES` from the flag-icons npm package or its CDN mirror.

Used instead of Unicode flag emoji (still used in `js/lookup.js`'s
`flagEmoji()`, kept for plain-text share results) because Windows' default
emoji font ships no flag glyphs at all — see the "Flags" note in the main
README.
