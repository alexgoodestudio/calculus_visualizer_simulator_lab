# Calculus Lab — Interactive Derivative & Integral Visualizer

**Live:** https://alexgoodestudio.github.io/calculus_visualizer_simulator_lab/

A free, interactive visualization tool for understanding derivatives and integrals in real time —
built for Calculus 1 students. Watch the tangent line and its slope graph move, see Riemann sums
fill the area under a curve, and follow every problem worked out step by step with the rule named
at each step. Built with React, because sometimes you need to *see* math to understand it.

## Why This Exists

I spent years building software, and I'm back in school learning calculus. Here's the thing: textbooks show you static graphs. But calculus is about *change*—tangent lines moving along curves, areas accumulating under them. That's inherently dynamic. So instead of just reading about it, I built something interactive.

This app takes the concepts from Calculus 1 and turns them into animations you can control. Play, pause, scrub through the animation. Watch how the derivative changes as the tangent line slides along the original function. See how rectangles approximate the area under a curve as they get thinner and thinner.

## Features

- **Derivative Visualizer**: Watch a tangent line dance along your curve in real time. See the slope at each point plotted below, which *is* your derivative.
- **Integral Visualizer**: Fill the area under a curve with rectangles. Watch them multiply and shrink, getting closer to the true area (Riemann sums in motion).
- **10 Presets**: Quick access to common functions (polynomials, trig, exponentials, logarithms).
- **Custom Functions**: Type any mathjs-compatible expression and see it work instantly.
- **Playback Controls**: Play, pause, reset, or scrub to any point. Adjustable speed (0.5x to 2x).
- **Live Stats**: Numbers update without reflowing—useful when you're trying to pay attention to the animation, not the layout shift.
- **Concept Callouts**: Each function type triggers hints about which calculus rule applies (chain rule, product rule, etc.).

## Setup

```bash
npm install
npm run dev
```

Then open `http://localhost:5173` in your browser.

### Building for Production

```bash
npm run build
npm run preview
```

## Stack

- **React 18** with hooks (useMemo for heavy computations, useCallback for stable references)
- **Vite** for fast dev server and optimized builds
- **mathjs** for symbolic differentiation and expression parsing
- **CSS-in-JS** with object styles (no build step needed, easy to tweak colors)

## Technical Notes

- Derivatives are computed symbolically via mathjs.derivative() when possible, falling back to numerical approximation if the symbolic version fails.
- Integrals use Riemann sums (midpoint rule) with 2000+ sample points for accuracy.
- SVG rendering with coordinate transforms to handle zooming into different domains.
- Grid lines auto-scale to nice round numbers (inspired by standard graphing conventions).
- Animation uses requestAnimationFrame for 60fps playback with smooth scrubbing.

## The Design Philosophy

I wanted this to *feel* like a study desk, not a dark-mode hacker tool. Soft lavender background, white cards, rounded corners, a mix of accent colors. The math should feel approachable. Typography matters: Poppins for headings (personality), Inter for body text (readability), IBM Plex Mono for numbers (because digits should never drift).

## What I've Learned Building This

1. SVG transforms are powerful but require careful thinking about coordinate spaces.
2. useMemo is a lifesaver when you have thousands of points being sampled per frame.
3. Explaining math clearly is *hard*. The concept callouts changed five times.
4. Calculus really does make sense when you can see it move.

## Known Limitations

- Very steep functions can cause numerical instability in the sample points.
- The integral visualization only works well for functions that don't oscillate wildly (though it's honest about this in the Riemann sum visualizations).
- Mobile view is compressed—this is designed for a decent-sized screen.

## Future Ideas

- Animation presets (e.g., "zoom into the definition of the derivative" as h → 0)
- Critical points detection and highlighting
- Tangent line equation displayed on screen
- Saving and sharing animations
- 3D surface plots for multivariable calculus (eventually)

---

**Note**: This is a learning project, not a tutoring substitute. Use it alongside your textbook. If something doesn't match what your professor said, trust your professor (and let me know what I got wrong).
