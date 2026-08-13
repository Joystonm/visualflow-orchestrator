# VisualFlow

> A conversational, multi-agent workspace for creating, refining and exploring AI-generated visuals.

AI image generation is good at producing a final image, but the workflow becomes difficult when you want to keep working on that image.

VisualFlow takes a different approach.

Instead of treating an AI generation as a single flattened result, VisualFlow turns the prompt into a **dynamic visual composition**. The AI determines which elements of the scene should become separate layers, generates them independently, and composes them into the final result.

This allows a generated image to remain editable throughout the creative process.

## The Problem

Most AI image workflows follow a simple pattern:

```text
Prompt → Generate → Image
````

If something is wrong with the result, the usual solution is to modify the prompt and generate again.

That creates several problems:

* A small change can require regenerating the entire scene.
* Previous generations are easy to lose.
* Exploring different creative directions becomes expensive.
* There is no structured representation of what makes up the image.
* Iteration becomes a sequence of disconnected generations.

VisualFlow is designed around a different workflow:

```text
Prompt
  ↓
Understand the Scene
  ↓
Plan the Visual Layers
  ↓
Generate
  ↓
Compose
  ↓
Refine
  ↓
Version
  ↓
Branch
  ↓
Compare
```


## How VisualFlow Works

VisualFlow does **not** use a fixed set of predefined layers.

The AI analyzes each prompt and determines what visual elements are needed for that particular scene.

For example, a prompt such as:

```text
A climber standing on a snowy mountain during a storm
```

could result in a completely different layer structure than:

```text
A futuristic car driving through a neon city at night
```

The layer structure is created dynamically from the scene rather than forcing every generation into predefined categories.

```text
                    User Prompt
                         │
                         ▼
                 ┌───────────────┐
                 │ Scene Analysis │
                 └───────┬───────┘
                         │
                         ▼
                 Dynamic Layer Plan
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
          Layer A     Layer B     Layer C
             │           │           │
             └───────────┼───────────┘
                         ▼
                    Composition
                         │
                         ▼
                  VisualFlow Canvas
```

The important part is that **the AI decides what should become a layer**.


## Conversational Refinement

Once a composition exists, the user can continue working with it through natural language.

For example:

```text
Make the lighting warmer and add heavier rain.
```

VisualFlow interprets the request and determines which parts of the scene need to change.

Instead of rebuilding the entire composition, the affected layers can be regenerated and the scene recomposed.

```text
User Request
     │
     ▼
Request Analysis
     │
     ▼
Affected Layers
     │
     ▼
Targeted Generation
     │
     ▼
Recomposition
```

This makes refinement much closer to editing a creative project than repeatedly starting a new generation.

---

## Multi-Agent Architecture

VisualFlow separates the reasoning, orchestration, generation, and visual processing responsibilities.

```text
                         User
                          │
                          ▼
                  ┌──────────────┐
                  │  VisualFlow  │
                  │      UI      │
                  └──────┬───────┘
                         │
                         ▼
                  ┌──────────────┐
                  │      AO      │
                  │ Orchestrator │
                  └──────┬───────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
           Analysis    Layer      Refinement
            Tasks      Tasks         Tasks
              │          │          │
              └──────────┼──────────┘
                         ▼
                ┌─────────────────┐
                │   GMI Cloud     │
                │ Analysis /      │
                │ Inference       │
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐
                │   Cloudinary    │
                │ Generation +    │
                │ Transformations │
                └────────┬────────┘
                         │
                         ▼
                  Layer Composition
                         │
                         ▼
                    Final Canvas
```

### AO — Orchestration

AO orchestrates the workflow and the different tasks involved in creating and refining a scene.

Rather than treating the entire process as one request, VisualFlow can break the work into smaller operations and coordinate them through the orchestration layer.

### GMI Cloud — Analysis & Inference

GMI Cloud provides the reasoning and inference layer used for understanding prompts, interpreting refinement requests, and determining how the visual workflow should proceed.

### Cloudinary — Visual Generation & Processing

Cloudinary handles the visual side of the pipeline, including:

* Image generation
* Image transformations
* Filters
* Aspect-ratio handling
* Layer processing
* Composition


## Dynamic Layer System

The layer system is intentionally flexible.

There is no requirement that every scene contain:

```text
Background
Subject
Lighting
Effects
```

Instead, the AI determines the appropriate structure for the prompt.

A simple scene may require only a few layers, while a more complex scene can result in many independent visual elements.

This allows VisualFlow to adapt the composition model to the content being generated.

## Layer Processing

VisualFlow currently works with different processing strategies depending on the role of a generated element.

### Base Layers

Large scene elements that provide the underlying visual foundation.

### Cutout Layers

Independent objects or subjects that need to be separated from their generated background.

These can be processed into transparent assets before being placed into the composition.

### Overlay Layers

Visual elements that sit above other layers, such as atmospheric or environmental effects.

These can be composited using appropriate blend operations.

The important distinction is that these are **processing strategies**, not fixed scene categories. The actual layers are determined dynamically by the AI.


## Client-Side Composition

VisualFlow performs composition on the client rather than generating a completely new flattened image after every change.

```text
Layer 1 ─────┐
Layer 2 ─────┤
Layer 3 ─────┼──→ Canvas
Layer 4 ─────┤
Layer N ─────┘
```

This enables operations such as:

* Toggle visibility
* Reorder layers
* Apply filters
* Transform individual elements
* Change composition
* Regenerate selected elements
* Recompose without regenerating unaffected layers

The result is a more interactive editing workflow with less unnecessary generation.

## Versioning

AI-assisted creative work is inherently iterative.

VisualFlow treats iterations as part of the workflow rather than overwriting the previous result.

Each meaningful generation can become a new version.

```text
                     Version 1
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
          Version 2             Version 3
              │                     │
              ▼                     ▼
          Version 4             Version 5
```

Users can:

* Return to an earlier version
* Create a branch
* Explore a different direction
* Compare iterations
* Continue refining from any previous state

This makes experimentation non-destructive.

## Branching

Branching allows a user to explore multiple creative directions from the same starting point.

For example:

```text
                 Initial Concept
                       │
              ┌────────┴────────┐
              ▼                 ▼
        Cinematic Branch   Cyberpunk Branch
              │                 │
              ▼                 ▼
          Iteration A       Iteration B
```

A branch does not destroy the original creative direction.

It creates another path that can be explored independently.

## Comparison

VisualFlow provides a way to compare different generations and branches before deciding which direction to continue.

This makes experimentation easier because users don't have to rely on memory or overwrite earlier results.

---

## Core Architecture

```text
┌─────────────────────────────────────────────────────┐
│                    VisualFlow UI                    │
│                                                     │
│  Chat │ Canvas │ Layers │ Versions │ Compare       │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                     AO Layer                        │
│                                                     │
│             Workflow Orchestration                  │
└────────────────────────┬────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
┌──────────────────────┐  ┌─────────────────────────┐
│      GMI Cloud       │  │       Cloudinary        │
│                      │  │                         │
│ • Scene analysis     │  │ • Image generation     │
│ • Text inference     │  │ • Transformations      │
│ • Refinement logic   │  │ • Filters               │
│                      │  │ • Aspect ratios         │
└──────────────────────┘  │ • Visual processing     │
                          └────────────┬────────────┘
                                       │
                                       ▼
                              Layered Composition
                                       │
                                       ▼
                                Versioned Scene
```


## Technology Stack

| Area                    | Technology                  |
| ----------------------- | --------------------------- |
| Frontend                | React                       |
| Language                | TypeScript                  |
| Build Tool              | Vite                        |
| Styling                 | Tailwind CSS                |
| Orchestration           | AO                          |
| AI Analysis / Inference | GMI Cloud                   |
| Image Generation        | Cloudinary Image Generation |
| Image Processing        | Cloudinary Transformations  |
| Composition             | Client-side Canvas          |
| Persistence             | localStorage                |


## Getting Started

### Requirements

* Node.js 18+
* Cloudinary account
* Cloudinary Image Generation access
* GMI Cloud API credentials

### Installation

```bash
git clone https://github.com/Joystonm/visualflow-orchestrator.git
cd visualflow-orchestrator
npm install
```

Create your environment file:

```bash
cp .env.example .env
```

Configure the required credentials.

```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

GMI_API_KEY=
```

Start the development server:

```bash
npm run dev
```

Then open:

```text
http://localhost:5173
```

## Environment Variables

| Variable                | Environment | Purpose                       |
| ----------------------- | ----------- | ----------------------------- |
| `CLOUDINARY_CLOUD_NAME` | Server      | Cloudinary account            |
| `CLOUDINARY_API_KEY`    | Server      | Cloudinary API authentication |
| `CLOUDINARY_API_SECRET` | Server      | Cloudinary secret             |
| `GMI_API_KEY`           | Server      | GMI Cloud authentication      |

> Never expose API secrets through `VITE_` variables or commit them to the repository.

## Creative Workflow

A typical VisualFlow session looks like:

```text
1. Enter a prompt
        ↓
2. AI analyzes the scene
        ↓
3. Dynamic layers are planned
        ↓
4. Layers are generated
        ↓
5. Composition is created
        ↓
6. User refines through conversation
        ↓
7. Relevant layers are regenerated
        ↓
8. New version is saved
        ↓
9. User branches / compares
        ↓
10. Final composition is exported
```

## Design Principle

VisualFlow is built around a simple idea:

> **AI generation should not end when the image is generated.**

The generated scene should remain something the creator can continue working with.


