# Implementation plan

## Pilot editorial package

Proposed research question: How do inscriptions help us understand Tamil history?

This is a topic proposal, not an already researched script. Select a small number of documented examples after locating credible sources and usable visuals.

- Long video: explain how historians study inscriptions, introduce the selected examples, and explain what those examples do and do not establish.
- Short 1: What is an inscription, and why does it matter?
- Short 2: One verified detail from one selected inscription.
- Short 3: How researchers approach reading and dating an inscription.
- Short 4: One limitation of drawing conclusions from a single historical source.

Each Short stands alone. Avoid announcing conclusions until research is reviewed.

## Phase 1: One local Short

1. Define a research-brief schema and claim ledger with a manually populated pilot brief.
2. Generate an editable Tamil script from approved research.
3. Review the script and a pronunciation sample.
4. Generate narration and a scene manifest referencing claims and assets.
5. Assemble rights-cleared stills, diagrams, gentle motion, and captions into an MP4.
6. Inspect the complete export, including audio, Tamil glyphs, captions, and vertical framing.

Exit criterion: one reviewed, watchable 30–60-second video saved locally, with source references and recorded generation costs.

Current status: the sourced pilot script and Rajan narration are implemented. The narration is 48.72 seconds. The local renderer creates original explanatory diagrams, Tamil captions, and a vertical H.264/AAC MP4. Caption timings are approximate and scene-anchored by user choice; Forced Alignment access is unavailable on the current API key. Layout and full-decode checks run automatically; final listening/editorial review remains pending. Request usage is logged; actual billed costs remain unreconciled.

## Phase 2: Weekly package

Extend the pilot to approximately 600 seconds and four independently scripted Shorts. Split the long video into editable scenes. Determine scene timing from actual narration; regenerate only changed scenes and reuse approved assets.

Exit criterion: one long preview and four Short previews with reviewed narration, correct framing, complete sources, and a cost report.

## Phase 3: Dashboard and publishing

Add a queue, previews, script editing, stage-level retries, cost visibility, and approval actions. Integrate YouTube authorization, upload, scheduling, and metadata after local exports are reliable. Persist upload IDs and use idempotent job handling to avoid duplicate publication.

## Initial technical direction

The workflow uses Node.js 22. JSON files persist brief versions, approval, narration usage, and timings. FFmpeg media assembly and six reusable scene layouts are implemented for vertical and landscape outputs. SQLite job metadata and a dashboard are future milestones. ElevenLabs is the default narration provider using the user's subscription; Azure Speech remains an optional fallback. See episodes.md for the standalone CLI workflow.

Persist stages: draft, researched, script_ready, script_approved, assets_ready, rendered, render_approved, exported, uploaded, scheduled, published, failed. Failed jobs retain their last successful checkpoint. Provider results, costs, and asset provenance belong to the job record.

## Budget approach

The monthly budget is INR 2,000–5,000. Use INR 3,500 as a provisional planning target, including regeneration headroom; this is not a provider price estimate or a promise that every media style fits.

Design for five weekly packages in a calendar month: up to five long videos and twenty Shorts. Prioritize intelligible Tamil narration. Start with reusable visual templates and licensed or public-domain material, adding selective generated illustrations rather than generating every second of footage. Meter script, voice, visual, and retry costs separately. Measure the pilot cost before setting production limits or enabling paid calls.

## Decisions still open

- Permanent channel voice. Rajan is selected provisionally for the inscriptions pilot; ElevenLabs is the selected provider.
- Final channel name and visual identity.
- Whether the first series focuses on a specific dynasty, region, period, or evidence type.
- Source and media providers, based on coverage, rights, and current pricing.
- Publishing days and whether uploads remain manual during the pilot.
