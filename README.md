# blitzio. staging

Staging copy of [blitzio.com](https://blitzio.com), used to check changes before they go live. It is published at [blitzio.github.io/blitzio-staging](https://blitzio.github.io/blitzio-staging/) and asks search engines not to index it.

The page, build and credits are the same as the production repository, [blitzio/blitzio-site](https://github.com/blitzio/blitzio-site), apart from its own address and search settings.

## Build

Requires Node 24 and pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm preview
```

The site is published to GitHub Pages by a manually triggered workflow, which takes its address from this repository's name.

## Credits

- Earth imagery: NASA Earth Observatory, Blue Marble: Next Generation and Black Marble 2016. Details are in `public/image-sources.txt`. No NASA endorsement is implied.
- Typeface: DM Sans, SIL Open Font License.
- 3D rendering: Three.js, MIT License.

Full notices are in `public/third-party-licenses.txt` and `public/fonts/DM-Sans-OFL.txt`. The site's own code and artwork are not licensed for reuse.
