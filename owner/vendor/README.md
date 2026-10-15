# Vendored: Three.js r169

`three-0.169.0.module.min.js` is `build/three.module.min.js` from the npm
package `three@0.169.0`, copied unmodified. It is self-hosted (no CDN at runtime,
nothing to add to the CSP) and loaded only by `/owner/`, never by the homepage.

    sha256  f7cee3c7533449a1505cc12cb5128b89e3d4fd3d7ea62b05f9f5464a217472ee

`tools/test.sh` checks that hash, so the file cannot change silently. To
upgrade: `npm pack three@<version>`, copy the same file under a new name with the
new version in it, update the import in `owner/lock.js`, this README and the
hash in `tools/test.sh`, all in one commit. r170 and later split the build into
`three.core.js` + `three.module.js`, so copy both if you go past r169.

MIT licence: `three-LICENSE.txt`.
