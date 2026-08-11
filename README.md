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
- Image generation: Pollinations (keyless — no secrets can leak client-side); calls funnel
  through a single-slot queue with retry/backoff, proxied by the dev server because the
  API rejects cross-origin browser requests
- Orchestration: an `AOAdapter` interface with a local in-browser engine
  (`src/lib/ao/`) — swap in a remote AO daemon endpoint without touching UI code
- Assets: Cloudinary unsigned uploads when configured (see `.env.example`),
  graceful local fallback otherwise
- Persistence: localStorage (projects, versions, chat); generated assets are
  URL-addressed and re-fetchable

## Run it

```bash
npm install
npm run dev
# open http://localhost:5173
```

Optional Cloudinary (client-safe values only — never commit secrets):

```bash
cp .env.example .env
# set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET (unsigned preset)
```

## Demo script (~90 seconds)

1. Prompt: *"A futuristic Tokyo street during a rainy neon night, cinematic photography"*
2. Watch the Scene Director plan and six agents build the layers.
3. Chat: *"Make the neon signs blue and add heavier rain"* — only the affected agents work.
4. Select the Lighting layer → chat edits pin to it. Or hit ↻ Regenerate on any layer.
5. Click V1 in the timeline, refine again — the timeline shows a branch (⑂ from V1).
6. Compare V1 vs V4 with the slider. Export as PNG.
