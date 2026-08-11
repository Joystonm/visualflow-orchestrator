# VisualFlow

> AI images shouldn't be the end result. They're the beginning.

VisualFlow is a conversational, multi-agent AI creative workspace. Instead of generating one
flattened AI image, it treats a scene as a structured stack of meaningful visual layers —
Background, Environment, Subject, Lighting, Atmosphere, Effects — each owned by a specialized
agent and coordinated by an AO orchestrator.

**One prompt. An entire creative team.**

```
Prompt → AO Orchestrator → Scene Director → Specialized Agents
       → Layer Generation → Composition → Refinement
       → Versions → Branches → Compare → Export
```

## Why it matters

Ask a normal generator to "make the neon signs blue" and it re-rolls the whole image.
VisualFlow routes the request through AO to just the affected agents:

```
AO ORCHESTRATOR — request analyzed
  Affected:   💡 Lighting   ✨ Effects
  Unchanged:  Background ✓  Environment ✓  Subject ✓
→ VERSION 4 CREATED (changed: Lighting, Effects)
```

Your subject, your composition, your background — untouched.

## Features

- **Visible orchestration** — live agent status cards, an AO activity log, and per-layer
  progress make the coordination the product, not a hidden detail.
- **Real layered compositing** — the background paints the base plate; every other layer is
  generated on pure black and blended in (lighten/screen) on a canvas. Toggling or
  regenerating one layer recomposites instantly without touching the rest.
- **Layer-targeted chat** — a deterministic intent router maps requests to layers
  ("add fog" → Atmosphere; select a layer to pin edits to it).
- **Versions & branching** — every meaningful generation is a version with
  `parentVersionId`; jump to any version and refine to branch a new direction.
- **Compare** — slider and side-by-side modes with changed-layer chips.
- **Export** — flattened PNG/JPG at full resolution, or copy the image URL.
- **Failure recovery** — a failed agent offers Retry / Regenerate / Continue without layer.

## Stack

- React + TypeScript + Vite + Tailwind CSS 4
- Image generation, primary: **Cloudinary Image Generation add-on** via a minimal
  server-side adapter (`server/cloudinaryGenerate.ts`, mounted at `/api/generate`).
  The API key/secret live in non-`VITE_` env vars and never reach the browser.
  Generated images are stored straight into your Cloudinary media library.
- Image generation, fallback: Pollinations (keyless) through a single-slot queue with
  retry/backoff, proxied by the dev server. Any Cloudinary failure (unconfigured, out of
  credits, transient error) falls back automatically so a demo never stalls.
- Orchestration: an `AOAdapter` interface with a local in-browser engine
  (`src/lib/ao/`) — swap in a remote AO daemon endpoint without touching UI code
- Assets: Cloudinary (direct from generation, or unsigned uploads for fallback assets)
- Persistence: localStorage (projects, versions, chat); generated assets are
  URL-addressed and re-fetchable

## Run it

```bash
npm install
cp .env.example .env   # fill in Cloudinary values (see below)
npm run dev
# open http://localhost:5173
```

`.env` values (all optional — the app runs with zero config using the fallback generator):

| Variable | Side | Purpose |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | server | Image Generation add-on |
| `CLOUDINARY_API_KEY` | server | Image Generation add-on (Basic auth) |
| `CLOUDINARY_API_SECRET` | server | **Secret — never `VITE_`-prefixed, never committed** |
| `CLOUDINARY_GEN_MODEL_FAMILY` / `_TIER` | server | Model choice (default `flux` / `standard`) |
| `VITE_CLOUDINARY_CLOUD_NAME` | client | Unsigned uploads of fallback assets |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | client | Unsigned preset name |

Register for the add-on in the Cloudinary Console marketplace first:
<https://cloudinary.com/documentation/image_generation_addon>

**Deploying to Vercel/Netlify:** set the same env vars in the platform dashboard and port
`createGenerateHandler` from `server/cloudinaryGenerate.ts` into a serverless function
(the dev-server middleware only exists locally). The Pollinations proxy entries in
`vite.config.ts` need equivalent rewrites if you keep the fallback.

## Demo script (~90 seconds)

1. Prompt: *"A futuristic Tokyo street during a rainy neon night, cinematic photography"*
2. Watch the Scene Director plan and six agents build the layers.
3. Chat: *"Make the neon signs blue and add heavier rain"* — only the affected agents work.
4. Select the Lighting layer → chat edits pin to it. Or hit ↻ Regenerate on any layer.
5. Click V1 in the timeline, refine again — the timeline shows a branch (⑂ from V1).
6. Compare V1 vs V4 with the slider. Export as PNG.
