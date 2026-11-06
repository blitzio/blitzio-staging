# blitzio staging

Approved personal homepage for Mike F. Static Astro output, local DM Sans, stationary astronaut and a progressively enhanced Three.js horizon. No runtime API or analytics service.

Use Node 24 and pnpm 11.25.0. Run `pnpm install --frozen-lockfile`, `pnpm build`, and `pnpm preview`. Only `dist/` is a publication artifact.

## GitHub Pages

No push trigger is configured. In Settings > Pages choose GitHub Actions. The manual Pages staging workflow derives the HTTPS origin and repository base path from its own repository name. A manual run with publish=false builds and stores an artifact without publishing a site. Only after explicit publication approval, run with publish=true. No custom domain is configured. No personal access token is needed.

Staging retains noindex,nofollow. This is an indexing request, not access control: repository source and a published staging site are public.

## Rights and attribution

The full DM Sans SIL OFL and Three.js MIT notices are in public/. NASA image provenance and media usage terms are recorded in public/image-sources.txt. Retain these notices in builds. Avatar artwork was supplied for this site; its publication rights must be confirmed by the site owner. No project-wide license for the original site code or artwork is granted by this README.

## Later custom domain

After separate approval, set the Astro site to the final HTTPS origin and base to /. Remove staging noindex only when public indexing is intended. Replace the repository-derived workflow URL step with explicitly approved production values, configure the Pages custom domain and CNAME, and only then perform separately approved DNS changes. Rebuild and test all assets.
For a later approved production-domain transition, also revise scripts/check-static-output.cjs: allow the approved CNAME, update the expected file count, and replace the staging noindex assertion with the intended production indexing check.
