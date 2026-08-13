# VisualFlow

> AI images shouldn't be the end result. They're the beginning.

The idea came from something every one of us has faced with AI image generation.

You generate an image, and maybe 90% of it is exactly what you wanted. But there's one
thing that's wrong — the lighting, the background, or the subject.

And usually, you have two choices: **live with it, or generate the whole thing again.**

I didn't like that workflow. So we asked: what if the image didn't have to be a finished
output? What if you could actually keep working on it?

## What VisualFlow does

Start with a prompt like _"man on snowy mountain"_. Instead of treating the result as one
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

- _"Make the man taller"_ → only the **Man** layer regenerates. The mountain and snow
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

| Variable                                                       | Side   | Purpose                                                    |
| -------------------------------------------------------------- | ------ | ---------------------------------------------------------- |
| `CLOUDINARY_CLOUD_NAME`                                        | server | Image Generation add-on                                    |
| `CLOUDINARY_API_KEY`                                           | server | Image Generation add-on (Basic auth)                       |
| `CLOUDINARY_API_SECRET`                                        | server | **Secret — never `VITE_`-prefixed, never committed**       |
| `VITE_GEN_PROVIDER`                                            | client | Set to `pollinations` to iterate for free and save credits |
| `VITE_CLOUDINARY_CLOUD_NAME` / `VITE_CLOUDINARY_UPLOAD_PRESET` | client | Unsigned uploads of fallback assets                        |

The app runs with zero configuration using the free fallback generator.
