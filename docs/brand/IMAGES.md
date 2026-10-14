# Images for hark (img-gen)

Generated with img-gen (`~/cloudflare/img-gen/scripts/genimg.mjs` or the img-gen MCP). No text, letters, logos, UI, or people in any image. hark composites the words itself.

| File | Size | Prompt |
| --- | --- | --- |
| `public/brand/hark-field.jpg` | 2400×1500, JPEG q82, under 450 KB | Sound made visible at night. A single small glowing ember-orange point of light rests low and slightly left of center on perfectly still black water, and slow concentric ripples of warm light spread outward from it across the whole frame, fading into deep charcoal darkness. Faint amber mist near the horizon. Cinematic, minimal, enormous negative space, long exposure photograph, 35mm, shallow depth of field, palette of near-black (#09090b), ember orange (#f38020), amber (#fbad41). |
| `docs/brand/hark-hero-art.jpg` | 1600×900 | The same world closer in: a glowing orange-white sphere of light hovering just above dark still water, with three thin concentric rings of light expanding from it like sound waves, one ring reflected in the water. Dark, quiet, premium, photographic, cinematic rim light, generous empty space on the left third. Palette near-black, ember orange, amber. |
| `docs/brand/hark-social-art.jpg` | 1200×630 | Wide composition of the glowing sphere and its expanding rings placed in the right third of the frame over still black water, the left two thirds nearly empty dark gradient for text. Photographic, cinematic, ember orange and amber on near-black. |

Then run `node scripts/build-social.mjs`. It writes `public/brand/hark-social.png` (the og:image) from `hark-social-art.jpg`, with the wordmark and tagline set as real text.

Handoff prompt for a Pi on the Mac:

> In ~/cloudflare/hark (git clone https://github.com/acoyfellow/hark), read docs/brand/IMAGES.md and make the three images with img-gen exactly as specified, at the given paths and sizes. Look at each one; regenerate any with text, letters, people, or a busy composition. Then run `node scripts/build-social.mjs`, `bun run check`, and commit "img-gen brand images" and push.
