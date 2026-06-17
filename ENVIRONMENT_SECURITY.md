# Environment Security Runbook

## Current Policy

- Keep local secrets in `.env.local`.
- Never commit `.env`, `.env.*.local`, or provider credentials.
- Only browser-safe values may use `VITE_` or `NEXT_PUBLIC_`.
- Database URLs, Neo4j passwords, provider API keys, service-role keys, OIDC tokens, and AI API keys must be server-only.

## Rotated Locally

The local secret file has been moved from `.env` to `.env.local`.

Deprecated browser-exposed private aliases should not be recreated:

- `VITE_NEON_DATABASE_URL` -> `NEON_DATABASE_URL`
- `VITE_NEO4J_URI` -> `NEO4J_URI`
- `VITE_NEO4J_USER` -> `NEO4J_USER`
- `VITE_NEO4J_PASSWORD` -> `NEO4J_PASSWORD`
- `DTM_BASE_URL` -> `IOM_DTM_BASE_URL`
- `DTM_API_KEY` -> `IOM_DTM_API_KEY`

## Rotate Provider Secrets

Create new values in each provider dashboard first, then update Vercel, then revoke the old values.

Rotate these as compromised because they were present in local env or source:

- `VITE_MAPBOX_TOKEN`: create a new public Mapbox token restricted to this app's domains, then revoke the source-embedded token.
- `NEON_DATABASE_URL`: rotate the Neon database password or create a new role/connection string.
- `NEO4J_PASSWORD`: rotate the Neo4j user password.
- `ACLED_API_KEY`
- `IOM_DTM_API_KEY`
- `DHIS2_PASSWORD`
- `AFRO_SENTINEL_SERVICE_KEY`
- `AFRO_SENTINEL_OIDC_TOKEN`
- `GEMINI_API_KEY`
- Optional enrichment keys: `POSITIONSTACK_ACCESS_KEY`, `OIKOLAB_API_KEY`, `ACTINIA_API_KEY`, `ADSB_EXCHANGE_API_KEY`, `AFTERSHIP_API_KEY`

## Vercel Rotation

Link the project first:

```bash
vercel link
```

For each new secret, remove the old value from all environments and add the replacement:

```bash
vercel env rm NEON_DATABASE_URL production
vercel env rm NEON_DATABASE_URL preview
vercel env rm NEON_DATABASE_URL development

printf '%s' '<new-value>' | vercel env add NEON_DATABASE_URL production --sensitive
printf '%s' '<new-value>' | vercel env add NEON_DATABASE_URL preview --sensitive
printf '%s' '<new-value>' | vercel env add NEON_DATABASE_URL development --sensitive
```

Repeat for each server-only key. For public map tokens, add without `--sensitive` if Vercel rejects sensitive public envs:

```bash
printf '%s' '<new-public-mapbox-token>' | vercel env add VITE_MAPBOX_TOKEN production
printf '%s' '<new-public-mapbox-token>' | vercel env add VITE_MAPBOX_TOKEN preview
printf '%s' '<new-public-mapbox-token>' | vercel env add VITE_MAPBOX_TOKEN development
```

After rotation, pull fresh local envs:

```bash
vercel env pull .env.local --yes --environment=development
```

## Verification

```bash
npm run build
npm run test
```

Then confirm no private names are browser exposed:

```bash
rg "VITE_(NEON_DATABASE_URL|NEO4J_URI|NEO4J_USER|NEO4J_PASSWORD)" . --glob '!node_modules/**'
```
