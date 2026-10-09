# bc-local-sync

A small Node/Express service that talks NTLM to your on-prem Business
Central instance and writes results into Supabase. It exists because
Supabase Edge Functions (and browsers) can't perform an NTLM handshake —
this has to run somewhere on your own network that can.

## How it fits together

```
React UI (browser)
   │  fetch POST /sync-asset/:id
   ▼
bc-local-sync (this service, run on your LAN)
   │  NTLM-authenticated OData calls
   ▼
Business Central (bc2026:7048/BC190)
   │
   └─▶ writes result back into Supabase tables (assets_bc, workorders_bc)
          via the Supabase JS client — UI picks it up through realtime
```

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:
- `BC_BASE_URL` — your confirmed working URL, e.g.
  `http://bc2026:7048/BC190/ODataV4/Company('CRONUS International Ltd.')`
- `BC_USERNAME` / `BC_PASSWORD` — the same ones that worked in Postman
  with NTLM Authentication
- `BC_DOMAIN` — leave blank unless your Postman NTLM setup needed one
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — from your Supabase
  project settings (Service Role key, **not** the anon key — this
  service is trusted, unlike the browser)

Run the schema (`schema.sql` from the bc-integration folder) against
your Supabase project first if you haven't already.

## Run it

```bash
npm start
```

Should log `bc-local-sync listening on http://localhost:3001`.

## Test it directly before wiring the UI

```bash
curl -X POST http://localhost:3001/sync-asset/<some-assets_bc-row-id>
```

Insert a test row into `assets_bc` via the Supabase Table Editor first
to get an id to test with. Watch this service's console — any BC
error comes through there with the real OData error message.

## Publishing the Service module pages

`FixedAsset` was already published in BC as an OData web service. For
work orders, `ServiceItem` and `ServiceOrder` need the same treatment:

1. In BC, search "Web Services"
2. New → Object Type: Page → find the Service Item / Service Order
   page → give it a Service Name (e.g. `ServiceItem`, `ServiceOrder`)
3. Check "Published"
4. If you name them something other than `ServiceItem`/`ServiceOrder`,
   update the paths in `src/server.js` to match

You'll also want one internal customer in BC (e.g. "Internal
Maintenance") since Service Orders require a `Service_Item_No` linked
to a customer — same reasoning as the cloud-API version, just via
different field names here.

## Connecting the UI

In the `bc-integration` React app's `.env`, add:
```
VITE_LOCAL_SYNC_URL=http://localhost:3001
```
If the UI and this service run on different machines, use this
machine's LAN IP instead of `localhost`.

## Note on field names

The exact field names for creating records (mandatory fields, number
series behavior) depend on your BC setup — `src/server.js` sends a
minimal set based on the `FixedAsset` response you already confirmed.
If a POST fails, the error message from BC will usually say which
field it's unhappy about — adjust the body in `server.js` accordingly.
