import { defineConfig } from 'astro/config';

const site = process.env.PAGES_SITE;
const base = process.env.PAGES_BASE;
if (Boolean(site) !== Boolean(base)) throw new Error('Set PAGES_SITE and PAGES_BASE together.');
if (site) {
  const url = new URL(site);
  if (url.protocol !== 'https:' || url.origin !== site || url.username || url.password) throw new Error('PAGES_SITE must be an HTTPS origin without a path.');
  if (!/^\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)?$/.test(base)) throw new Error('PAGES_BASE must be / or /repository-name/.');
}

export default defineConfig({
  site,
  base: base || '/',
  output: 'static',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
});
