# CLAUDE.md

I'm building an online Bible website in stages. Act as a senior front-end developer and UX designer. Build only the stage I ask for, but write the code so later stages can be added without rewrites.

## Project goals

- A clean, fast, distraction-free Bible reader for study and daily reading
- Multiple translations, side-by-side comparison, full-text search
- Personal study tools: highlights, notes, bookmarks, reading plans
- Research tools: cross-references, original-language word study (Strong's), topical lookups
- Works well on phone, tablet and desktop; usable offline later

## Tech constraints

- Static site I can host on GitHub Pages (HTML, CSS, vanilla JavaScript or a light framework; no paid backend at first)
- Bible text loaded from JSON files in a `/data` folder, one file per translation, structured as book > chapter > verse
- Start with public-domain translations only: KJV, ASV, WEB, YLT, Darby, BBE. Modern copyrighted translations (NIV, ESV, NASB, NLT) need a license or a licensed API key, so design a "translation provider" layer that can add an API source later
- User data (highlights, notes, settings) saved in localStorage/IndexedDB behind one storage module, so cloud sync can replace it later
- Accessible (WCAG AA contrast, keyboard navigation, screen-reader labels), with light, dark and sepia themes

## Code standards

- Modular file structure; explain the folder layout before writing code
- Comment non-obvious logic
- At the end of each stage: list the files created or changed, how to test them, and the known limitations
- Don't remove working features from earlier stages

## Design feel

Calm, readable typography (serif for scripture, sans-serif for UI), generous line spacing, adjustable font size, verse numbers that stay out of the way, no clutter.
