# VisualFlow

> AI images shouldn't be the end result. They're the beginning.

The idea came from something every one of us has faced with AI image generation.

You generate an image, and maybe 90% of it is exactly what you wanted. But there's one
thing that's wrong — the lighting, the background, or the subject.

And usually, you have two choices: **live with it, or generate the whole thing again.**

We didn't like that workflow. So we asked: what if the image didn't have to be a finished
output? What if you could actually keep working on it?

## What VisualFlow does

Start with a prompt like *"man on snowy mountain"*. Instead of treating the result as one
flat image, VisualFlow's Scene Director breaks it into layers — each owned by its own AI
agent, coordinated by an AO orchestrator:

```
"man on snowy mountain"
        │
        ▼
  AO ORCHESTRATOR
        │
  Scene Director ── decides the layers this scene needs
        │
  ┌─────┴──────────┬─────────────┐
  ▼                ▼             ▼
Mountain Backdrop  Man          Snowfall
(base plate)       (cutout)     (overlay)
  └─────┬──────────┴─────────────┘
        ▼
  Cloudinary  →  Layered Composition
```

Now the image is a workspace, not a dead end:

- *"Make the man taller"* → only the **Man** layer regenerates. The mountain and snow
  are untouched.
- Don't like the snowfall? Toggle it off, regenerate it, or apply a filter to just
  that layer.
- Every change becomes a **version**. Jump back to any version and take the scene in a
  new direction — the timeline shows the branch.
- Compare any two versions side by side or with a slider, then export the flattened
  result as PNG/JPG.

## How the layering actually works

- **Base** — the backdrop plate, painted opaque.
- **Cutouts** — distinct things (a person, an object, a structure) are generated on a
  flat green screen and chroma-keyed to transparency in the browser, then pasted into
  the composition like real cut-paper layers.
- **Overlays** — light and weather passes (snow, rain, glow) generated on black and
  screen-blended.

Toggling, filtering, or regenerating one layer recomposites the canvas instantly on the
client — no full re-render, no wasted generation credits.

## The AO orchestration story

Orchestration isn't hidden plumbing here — it's the product:

- Live agent cards in the chat show each layer agent (Scene Director, "Man Agent",
  "Snowfall Agent"...) moving through queued → thinking → generating → complete.
- The **AO ACTIVITY** panel is a timestamped log of every orchestration event, including
  Cloudinary storage and remaining generation credits.
- When you ask for a change, the orchestrator shows its routing decision: which layers
  are affected, which are preserved.

## Stack

- **React + TypeScript + Vite + Tailwind CSS 4**
- **Image generation:** Cloudinary Image Generation add-on (flux / nano-banana, chosen
  per layer role to minimize credits) through a minimal server-side adapter — API
  secrets never reach the browser. Free keyless fallback (Pollinations) keeps the demo
  alive if credits run out.
- **Compositing:** client-side canvas — chroma keying, blend modes, non-destructive
  Cloudinary filters (real delivery-URL transformations like `e_grayscale`, `e_sepia`).
- **Orchestration:** an `AOAdapter` interface with a local in-browser engine
  (`src/lib/ao/`) — swappable for a remote AO daemon without touching UI code.
- **Persistence:** localStorage for projects, versions and chat; Cloudinary for assets.

## Run it locally

```bash
npm install
cp .env.example .env   # add Cloudinary credentials (see below)
npm run dev
# open http://localhost:5173
```

| Variable | Side | Purpose |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | server | Image Generation add-on |
| `CLOUDINARY_API_KEY` | server | Image Generation add-on (Basic auth) |
| `CLOUDINARY_API_SECRET` | server | **Secret — never `VITE_`-prefixed, never committed** |
| `VITE_GEN_PROVIDER` | client | Set to `pollinations` to iterate for free and save credits |
| `VITE_CLOUDINARY_CLOUD_NAME` / `VITE_CLOUDINARY_UPLOAD_PRESET` | client | Unsigned uploads of fallback assets |

The app runs with zero configuration using the free fallback generator.

## Judging access

The build is gated behind a simple sign-in (verified server-side, so the
credit-spending generation endpoint can't be called anonymously). Judges receive the
shared credentials with the submission.

## Deploy (Vercel)

No server to manage — the repo is deploy-ready:

- `api/generate.ts` / `api/login.ts` — serverless functions (generation runs 10-40s,
  so `maxDuration: 60` is set)
- `vercel.json` — rewrites `/api/image/*` and `/api/text/*` to the fallback generator

Steps: push to GitHub → import in Vercel (Vite preset) → add the `CLOUDINARY_*` env
vars in Project Settings → deploy.

Note: Netlify's free tier caps synchronous functions at 10s, which generation regularly
exceeds — prefer Vercel unless you're on a paid Netlify plan.

## Demo script (~90 seconds)

1. Sign in.
2. Prompt: *"man on snowy mountain"* — watch the Scene Director plan the layers and the
   agents build them.
3. Chat: *"make the man taller"* — only the Man Agent works; the orchestrator shows
   affected vs. preserved layers.
4. Select a layer → chat edits pin to it; try a per-layer filter (Noir on the backdrop,
   subject stays full-color).
5. Click V1 in the timeline, refine again — the timeline shows a branch (⑂ from V1).
6. Compare versions with the slider. Export as PNG.
