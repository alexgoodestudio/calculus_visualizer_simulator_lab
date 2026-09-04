import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import * as math from "mathjs";

/* ---------------------------------------------------------------
   Design: "Study Desk" — a bright, friendly pastel workspace.
   Soft lavender ground, white cards with a gentle shadow, rounded
   corners throughout, a cheerful mixed accent palette (violet /
   coral / mint) instead of a single dark-mode tone. Poppins carries
   the personality in headings, Inter is the reading voice, and a
   monospace face keeps every number lined up so digits never make
   the layout jump.
   ----------------------------------------------------------------*/

const COLORS = {
  ground: "#EDF1F5",
  card: "#FFFFFF",
  cardShadow: "0 6px 20px rgba(18, 58, 94, 0.08)",
  grid: "#E7ECF1",
  gridStrong: "#CBD6E0",
  curve: "#123A5E",
  ink: "#1F2A37",
  inkDim: "#5B6B7B",
  violet: "#1863B0",     // primary academic blue (name kept for reach)
  navy: "#123A5E",       // top nav bar
  navyDeep: "#0E2E49",
  coral: "#E8683C",
  mint: "#1EA085",
  gold: "#E0952A",
  blue: "#2E6FC7",
  rose: "#D64550",
  border: "#DCE3EA",
  chipBg: "#F1F5F9",
};

const PRESETS = [
  { label: "3", expr: "3", domain: [-4, 4] },
  { label: "x", expr: "x", domain: [-4, 4] },
  { label: "x²", expr: "x^2", domain: [-4, 4] },
  { label: "x³ − 3x", expr: "x^3 - 3*x", domain: [-3, 3] },
  { label: "3x² + 2x − 5", expr: "3*x^2 + 2*x - 5", domain: [-4, 3] },
  { label: "√x", expr: "sqrt(x)", domain: [0, 8] },
  { label: "1/x", expr: "1/x", domain: [-4, 4] },
  { label: "(x+1)/(x²+1)", expr: "(x + 1)/(x^2 + 1)", domain: [-5, 5] },
  { label: "x/(x²+1)", expr: "x/(x^2 + 1)", domain: [-5, 5] },
  { label: "(2x+1)²", expr: "(2*x + 1)^2", domain: [-3, 2] },
  { label: "(x²+1)³", expr: "(x^2 + 1)^3", domain: [-1.6, 1.6] },
  { label: "sin(x)", expr: "sin(x)", domain: [-6.3, 6.3] },
  { label: "cos(x)", expr: "cos(x)", domain: [-6.3, 6.3] },
  { label: "eˣ", expr: "exp(x)", domain: [-2, 2.5] },
  { label: "ln(x)", expr: "log(x)", domain: [0.15, 6] },
  { label: "x·sin(x)", expr: "x*sin(x)", domain: [-8, 8] },
  { label: "sin(x²)", expr: "sin(x^2)", domain: [-2.6, 2.6] },
  { label: "|x|", expr: "abs(x)", domain: [-3, 3] },
];

const W = 640, H = 232;      // upper panel
const H2 = 140;              // lower panel
const PAD = { l: 44, r: 18, t: 16, b: 26 };

function sample(fn, xMin, xMax, n = 480) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const x = xMin + ((xMax - xMin) * i) / n;
    let y;
    try {
      y = fn(x);
      if (typeof y !== "number" || !Number.isFinite(y)) y = NaN;
    } catch {
      y = NaN;
    }
    pts.push([x, y]);
  }
  return pts;
}

function yExtent(pts, capMultiplier = 6) {
  const finite = pts.map((p) => p[1]).filter((y) => Number.isFinite(y));
  if (!finite.length) return [-1, 1];
  let lo = Math.min(...finite), hi = Math.max(...finite);
  const median = finite.slice().sort((a, b) => a - b)[Math.floor(finite.length / 2)];
  const spread = Math.max(Math.abs(median) * capMultiplier, 4);
  lo = Math.max(lo, median - spread);
  hi = Math.min(hi, median + spread);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12;
  return [lo - pad, hi + pad];
}

function pathFromPoints(pts, xToPx, yToPx) {
  let d = "";
  let drawing = false;
  for (const [x, y] of pts) {
    if (!Number.isFinite(y)) { drawing = false; continue; }
    const px = xToPx(x), py = yToPx(y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) { drawing = false; continue; }
    d += (drawing ? " L " : " M ") + px.toFixed(2) + " " + py.toFixed(2);
    drawing = true;
  }
  return d;
}

function fmt(n, digits = 3) {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) < 1e-9) return "0";
  return Number(n.toPrecision(digits)).toString();
}

/* Snap a streaming value to a readable step (~1/15 of its scale) so the live
   readouts tick through ~15 legible checkpoints instead of blurring past. */
function quantize(v, scale) {
  if (!Number.isFinite(v)) return v;
  const target = Math.max(Math.abs(scale) || 0, 1e-6) / 15;
  const mag = Math.pow(10, Math.floor(Math.log10(target)));
  const step = Math.max(1, Math.round(target / mag)) * mag;
  return Math.round(v / step) * step;
}

/* ============================================================
   GLOSSARY — plain-language definitions for brand-new students.
   Keys are matched (case-insensitively, whole word) inside the
   prose and worked-solution copy and turned into hover chips.
   ============================================================ */
const GLOSSARY = {
  "derivative": "How fast a function is changing at a single point. Zoom way in on the curve until it looks straight — the derivative is that little line's steepness.",
  "tangent line": "A straight line that just grazes the curve at one point, pointing the same way the curve does there. Its slope is the derivative at that point.",
  "secant line": "A straight line drawn through two points on the curve. Slide those two points together and the secant line becomes the tangent line.",
  "slope": "How steep a line is — how far it rises (or drops) for every one step to the right. A slope of 2 means 'up 2 for every 1 across.'",
  "rate of change": "How much one quantity changes when another changes. Slope and derivative are both rates of change.",
  "instantaneous rate of change": "The rate of change at one exact instant, not averaged over a stretch — the speedometer reading, not the whole-trip average.",
  "limit": "The value a function heads toward as its input creeps up on some number, even if it never lands exactly there.",
  "continuous": "A curve you can draw without lifting your pen — no gaps, jumps, or holes.",
  "difference quotient": "[f(x+h) − f(x)] / h — the slope of the secant line between two points h apart. Let h shrink to 0 and it becomes the derivative. This is the definition of f′(x).",
  "differentiability": "A function is differentiable at a point if it has one clear slope there. Sharp corners, cusps, and vertical tangents break it — a function can be continuous at a point and still not differentiable there.",
  "dy/dx": "Another way to write the derivative f′(x). Also seen as y′ or d/dx[y]. It's read 'the derivative of y with respect to x,' not a fraction.",
  "power rule": "To differentiate x to a power: bring the power down in front as a multiplier, then lower the power by 1. So x⁴ becomes 4x³.",
  "sum rule": "The derivative of terms added together is just the derivative of each term, added together. Work one term at a time.",
  "constant rule": "The derivative of a plain number is 0 — a constant never changes, so its rate of change is nothing.",
  "constant multiple rule": "A number multiplying a function comes along for the ride: differentiate the function and keep the number out front.",
  "product rule": "For two functions multiplied together: (derivative of the first × the second) + (the first × derivative of the second).",
  "quotient rule": "For one function divided by another: (bottom × derivative of top − top × derivative of bottom) ÷ bottom².",
  "chain rule": "For a function nested inside another: differentiate the outside function (leaving the inside alone), then multiply by the derivative of the inside.",
  "antiderivative": "A function whose derivative gives you back the one you started with. Integrating means running differentiation backwards to find it.",
  "integral": "Adding up infinitely many infinitely thin pieces. A definite integral adds up thin slices of area under a curve.",
  "definite integral": "The total signed area between a curve and the x-axis, measured between two x-values. Above the axis counts positive, below counts negative.",
  "indefinite integral": "The whole family of antiderivatives of a function, written with '+ C' because adding any constant doesn't change the derivative.",
  "Riemann sum": "An estimate of the area under a curve: slice it into thin rectangles, find each rectangle's area, and add them all up. Thinner slices, better estimate.",
  "signed area": "Area that counts as positive above the x-axis and negative below it. The definite integral combines the pieces with their signs.",
  "integrand": "The function being integrated — the f(x) sitting between the ∫ sign and the dx.",
  "limits of integration": "The start and end x-values of a definite integral (the little numbers on the ∫ sign). They pick which slice of the curve you measure.",
  "Fundamental Theorem of Calculus": "The bridge between the two halves of calculus: to get an exact definite integral, find an antiderivative F and compute F(end) − F(start).",
  "reverse power rule": "The power rule run backwards: to integrate xⁿ, raise the power by 1 and divide by the new power. So x² integrates to x³/3.",
  "trig integral": "The antiderivatives of the wave functions: ∫sin(x)dx = −cos(x), and ∫cos(x)dx = sin(x).",
  "integral of eˣ": "eˣ is its own antiderivative: ∫eˣ dx = eˣ. It's the one function that never changes under calculus.",
  "integral of 1/x": "∫(1/x)dx = ln|x|. This is the single exception to the reverse power rule (which would divide by zero here).",
  "derivative of eˣ": "eˣ is its own derivative — its slope at every point equals its own height.",
  "derivative of ln(x)": "The slope of ln(x) is 1/x, so the curve keeps flattening as x grows.",
  "derivative of sin": "The slope of sin(x) at any point is cos(x).",
  "derivative of cos": "The slope of cos(x) at any point is −sin(x).",
  "derivative of tan": "The slope of tan(x) is sec(x)² = 1 / cos(x)².",
};
const GLOSSARY_KEYS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
const GLOSSARY_RE = new RegExp("\\b(" + GLOSSARY_KEYS.map(escapeRegExp).join("|") + ")\\b", "gi");
function canonicalKey(s) {
  const low = s.toLowerCase();
  return GLOSSARY_KEYS.find((k) => k.toLowerCase() === low) || null;
}

/* ============================================================
   RULE TOOLBOX — an expandable reference. `key` is matched
   (lowercased) against the rule names the worked solution emits,
   so the rule in play gets flagged "used here".
   ============================================================ */
const DERIV_RULES = [
  { key: "power rule", name: "Power Rule", formula: "d/dx[ xⁿ ] = n·xⁿ⁻¹", when: "f is x raised to a fixed power (includes √x = x^½).", example: "d/dx[ x³ ] = 3x²" },
  { key: "constant multiple rule", name: "Constant Multiple", formula: "d/dx[ c·f ] = c·f′", when: "A plain number multiplies the function.", example: "d/dx[ 5x² ] = 10x" },
  { key: "constant rule", name: "Constant Rule", formula: "d/dx[ c ] = 0", when: "The term is just a number — it never changes.", example: "d/dx[ 7 ] = 0" },
  { key: "sum rule", name: "Sum Rule", formula: "d/dx[ f ± g ] = f′ ± g′", when: "Terms are added or subtracted — do each on its own.", example: "d/dx[ x² + x ] = 2x + 1" },
  { key: "product rule", name: "Product Rule", formula: "d/dx[ f·g ] = f′·g + f·g′", when: "Two functions of x are multiplied together.", example: "d/dx[ x·sin x ] = sin x + x·cos x" },
  { key: "quotient rule", name: "Quotient Rule", formula: "d/dx[ f/g ] = (f′·g − f·g′) / g²", when: "One function of x divided by another.", example: "d/dx[ x/(x+1) ] = 1/(x+1)²" },
  { key: "chain rule", name: "Chain Rule", formula: "d/dx[ f(g(x)) ] = f′(g(x))·g′(x)", when: "A function sits inside another function.", example: "d/dx[ sin(x²) ] = cos(x²)·2x" },
  { key: "derivative of sin", name: "sin & cos", formula: "d/dx[ sin x ] = cos x   ·   d/dx[ cos x ] = −sin x", when: "Differentiating the basic wave functions.", example: "d/dx[ cos x ] = −sin x" },
  { key: "derivative of eˣ", name: "Exponential eˣ", formula: "d/dx[ eˣ ] = eˣ", when: "The natural exponential — slope equals height.", example: "d/dx[ eˣ ] = eˣ" },
  { key: "derivative of ln(x)", name: "Logarithm ln x", formula: "d/dx[ ln x ] = 1/x", when: "The natural logarithm.", example: "d/dx[ ln x ] = 1/x" },
];
const INT_RULES = [
  { key: "reverse power rule", name: "Reverse Power Rule", formula: "∫ xⁿ dx = xⁿ⁺¹/(n+1) + C   (n ≠ −1)", when: "Integrating x to a fixed power: raise the power, divide by it.", example: "∫ x² dx = x³/3 + C" },
  { key: "constant multiple", name: "Constant Multiple", formula: "∫ c·f dx = c · ∫ f dx", when: "A plain number multiplies the integrand — pull it out front.", example: "∫ 6x² dx = 2x³ + C" },
  { key: "sum rule", name: "Sum Rule", formula: "∫ (f ± g) dx = ∫ f dx ± ∫ g dx", when: "The integrand is a sum of terms — integrate each one.", example: "∫ (x² + 1) dx = x³/3 + x + C" },
  { key: "integral of 1/x", name: "1/x", formula: "∫ (1/x) dx = ln|x| + C", when: "The one power the reverse power rule can't handle (n = −1).", example: "∫ (1/x) dx = ln|x| + C" },
  { key: "trig integral", name: "sin & cos", formula: "∫ sin x dx = −cos x + C   ·   ∫ cos x dx = sin x + C", when: "Integrating the basic wave functions.", example: "∫ sin x dx = −cos x + C" },
  { key: "integral of eˣ", name: "Exponential eˣ", formula: "∫ eˣ dx = eˣ + C", when: "The natural exponential is its own integral.", example: "∫ eˣ dx = eˣ + C" },
  { key: "fundamental theorem of calculus", name: "Fundamental Theorem", formula: "∫ₐᵇ f dx = F(b) − F(a)", when: "Turning an antiderivative F into a definite (numeric) answer.", example: "∫₀¹ x² dx = ⅓ − 0 = ⅓" },
  { key: "riemann sum", name: "Riemann Sum", formula: "∫ₐᵇ f dx ≈ Σ f(xᵢ)·Δx", when: "No elementary antiderivative — approximate with thin columns.", example: "more, thinner columns → closer to the exact area" },
];

const CALCULUS_I_BIG_IDEAS = [
  { name: "Derivative definition", formula: "f′(x) = lim h→0 [f(x+h) − f(x)] / h", text: "A derivative is the slope of the tangent line, found by bringing a secant line's two points together." },
  { name: "Continuity", formula: "lim x→a f(x) = f(a)", text: "A function is continuous at a when its nearby values settle on the value at a: no hole, jump, or break." },
  { name: "Mean Value Theorem", formula: "f′(c) = [f(b) − f(a)] / (b − a)", text: "For a smooth curve, some point has the same instantaneous slope as the average slope across the whole interval." },
  { name: "Fundamental Theorem", formula: "∫ₐᵇ f(x) dx = F(b) − F(a)", text: "Differentiation and integration undo each other: an antiderivative turns accumulated area into a subtraction." },
];

const LIMIT_PRESETS = [
  { label: "hole", kind: "hole", name: "A removable hole", expr: "(x^2 - 1)/(x - 1)", at: 1, domain: [0, 2], limit: "2", value: "undefined", note: "The nearby values approach 2, even though the function is not defined at x = 1." },
  { label: "jump", kind: "jump", name: "A jump", expr: "x < 0 ? -1 : 1", at: 0, domain: [-2, 2], limit: "does not exist", value: "1", note: "The left and right sides approach different heights, so there is no two-sided limit." },
  { label: "infinite", kind: "infinite", name: "An infinite limit", expr: "1/x^2", at: 0, domain: [-2, 2], limit: "+∞", value: "undefined", note: "The values grow without bound as x approaches 0 from either side." },
  { label: "trig", kind: "trig", name: "A classic trig limit", expr: "sin(x)/x", at: 0, domain: [-6, 6], limit: "1", value: "undefined", note: "The curve approaches 1 from both sides, even though the expression is undefined at x = 0." },
  { label: "squeeze", kind: "squeeze", name: "Squeeze theorem", expr: "x²·sin(1/x)", at: 0, domain: [-0.32, 0.32], limit: "0", value: "undefined", note: "Zoom in near x = 0: the oscillating function stays trapped between −x² and x², and both bounds approach 0." },
  { label: "direct", kind: "direct", name: "Direct substitution", expr: "x^2 + 3*x - 1", at: 2, domain: [0, 4], limit: "9", value: "9", note: "Substitution gives an ordinary number, so the limit is found immediately." },
  { label: "rationalize", kind: "rationalize", name: "Rationalize a root", expr: "(sqrt(x + 4) - 2)/x", at: 0, domain: [-1, 3], limit: "1/4", value: "undefined", note: "Substitution gives 0/0. Multiplying by the conjugate reveals the nearby value 1/4." },
  { label: "infinity", kind: "infinity", name: "A limit at infinity", expr: "(2*x^2 + 1)/(x^2 - 3)", at: 10, domain: [1, 10], limit: "2", value: "undefined", note: "As x travels far right, the graph settles toward the horizontal asymptote y = 2." },
];

function LimitNotation({ target = "a" }) {
  return (
    <span
      aria-label={`the limit as x approaches ${target} of f of x`}
      style={{ display: "inline-flex", alignItems: "center", verticalAlign: "middle", gap: 4 }}
    >
      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", lineHeight: 0.85 }}>
        <span>lim</span>
        <span style={{ fontSize: "0.48em", fontFamily: "'IBM Plex Mono', monospace" }}>x→{target}</span>
      </span>
      <span>f(x)</span>
    </span>
  );
}

const FLASHCARDS = [
  { category: "Limits", prompt: <>How should you interpret <LimitNotation /> in words?</>, answer: "As x approaches a, f(x) approaches the number L. The notation describes the behavior of f(x) near a; it does not require x to equal a.", formula: "lim x→a f(x) = L" },
  { category: "Limits", prompt: "How does f(a) differ from the limit of f(x) as x approaches a?", answer: "f(a) is the value of the function at a. The limit describes the values of f(x) near a, so the limit may exist even when f(a) is undefined or differs from it.", formula: "function value ≠ limiting value" },
  { category: "Limits", prompt: "What condition is required for a two-sided limit to exist?", answer: "The left-hand and right-hand limits must both exist and be equal. If they differ, the two-sided limit does not exist.", formula: "lim x→a− f(x) = lim x→a+ f(x)" },
  { category: "Limits", prompt: "What does the indeterminate form 0/0 indicate after direct substitution?", answer: "It does not determine the limit. Use algebraic techniques, such as factoring, canceling common factors, or rationalizing, to analyze the limiting behavior.", formula: "0/0 → further analysis" },
  { category: "Limits", prompt: <>How should you interpret <LimitNotation target="0" /> when f(x) = 1/x²?</>, answer: "As x approaches 0 from either side, 1/x² increases without bound. Thus the function has an infinite limit and a vertical asymptote at x = 0.", formula: "lim x→0 1/x² = +∞" },
  { category: "Limits", prompt: "What conditions must hold for f to be continuous at x = a?", answer: "f(a) must be defined, the limit of f(x) as x approaches a must exist, and that limit must equal f(a).", formula: "f(a) exists; lim f exists; lim f = f(a)" },
  { category: "Limits", prompt: "State the Squeeze Theorem.", answer: "If g(x) ≤ f(x) ≤ h(x) near a, and g(x) and h(x) approach the same limit L as x approaches a, then f(x) also approaches L.", formula: "g(x) ≤ f(x) ≤ h(x)" },
  { category: "Derivatives", prompt: "What does the derivative represent?", answer: "The derivative represents the instantaneous rate of change of a function. Geometrically, it is the slope of the tangent line at a point.", formula: "f′(a) = tangent slope at x = a" },
  { category: "Derivatives", prompt: "How is the derivative defined as a limit?", answer: "The derivative is the limit of the secant slope as the second point approaches the first. This limiting difference quotient gives the slope of the tangent line.", formula: "f′(x) = lim h→0 [f(x+h) − f(x)]/h" },
  { category: "Derivatives", prompt: "State the Power Rule.", answer: "For a constant exponent n, multiply by n and decrease the exponent by 1.", formula: "d/dx[xⁿ] = n·xⁿ⁻¹" },
  { category: "Derivatives", prompt: "When is the Chain Rule used?", answer: "Use the Chain Rule to differentiate a composite function. Differentiate the outer function, evaluated at the inner function, and multiply by the derivative of the inner function.", formula: "d/dx[f(g(x))] = f′(g(x))g′(x)" },
  { category: "Derivatives", prompt: "What is a critical number?", answer: "A critical number c is a number in the domain of f for which f′(c) = 0 or f′(c) does not exist. Critical numbers are candidates for local extrema.", formula: "f′(c) = 0 or undefined" },
  { category: "Derivatives", prompt: "What does the Mean Value Theorem guarantee?", answer: "If f is continuous on [a,b] and differentiable on (a,b), at least one c in (a,b) has an instantaneous slope equal to the average slope on [a,b].", formula: "f′(c) = [f(b) − f(a)]/(b − a)" },
  { category: "Integrals", prompt: "What does a definite integral represent?", answer: "A definite integral represents accumulated signed area: contributions above the x-axis are positive and contributions below the x-axis are negative.", formula: "∫ₐᵇ f(x) dx" },
  { category: "Integrals", prompt: "What is an antiderivative?", answer: "An antiderivative of f is a function F whose derivative is f. Thus integration reverses differentiation.", formula: "F′(x) = f(x)" },
  { category: "Integrals", prompt: "State the Fundamental Theorem of Calculus for evaluating a definite integral.", answer: "If F is an antiderivative of f on [a,b], then the definite integral equals F(b) − F(a).", formula: "∫ₐᵇ f(x) dx = F(b) − F(a)" },
  { category: "Integrals", prompt: "What is a Riemann sum?", answer: "A Riemann sum approximates a definite integral by adding the areas of rectangles. As the subinterval widths approach zero, the approximation approaches the integral.", formula: "Σ f(xᵢ)Δx → ∫ₐᵇ f(x) dx" },
  { category: "Integrals", prompt: "State the Reverse Power Rule.", answer: "For n ≠ −1, increase the exponent by 1 and divide by the new exponent. Add the constant of integration C.", formula: "∫xⁿ dx = xⁿ⁺¹/(n+1) + C" },
  { category: "Limits", prompt: "What do ε and δ measure in the formal limit definition?", answer: "Epsilon controls the allowed output error, while delta controls how close the input must be to the target to guarantee it.", formula: "|f(x)−L| < ε when 0 < |x−c| < δ" },
  { category: "Limits", prompt: "How should you analyze a composite limit such as sin(1/x) as x→0?", answer: "Start with the inside: 1/x grows without bound. Then ask whether the outside function settles down; sine keeps oscillating, so the limit does not exist.", formula: "inside behavior → outside behavior" },
  { category: "Limits", prompt: "For a rational function, how do you distinguish a hole from a vertical asymptote?", answer: "Factor first. If a common factor cancels, the original function has a hole at that input. If a denominator factor remains while the numerator is nonzero, the function has a vertical asymptote there.", formula: "common factor cancels → hole; factor remains → asymptote" },
  { category: "Algebra", prompt: "What is a conjugate, and why does it help with limits?", answer: "It flips the sign between two terms, such as √(x+4)−2 to √(x+4)+2. Multiplying by it creates a difference of squares and removes the radical difference.", formula: "(a−b)(a+b)=a²−b²" },
  { category: "Algebra", prompt: "How does the difference of cubes factor?", answer: "A³−B³ has one linear factor and a separate quadratic factor. It is not three copies of A−B.", formula: "A³−B³=(A−B)(A²+AB+B²)" },
  { category: "Algebra", prompt: "Why can you not cancel terms in (x+1)/x?", answer: "Cancellation applies only to common factors of the entire numerator and denominator. The numerator x+1 is a sum, not a product containing x as a factor.", formula: "(x+1)/x ≠ 1" },
  { category: "Algebra", prompt: "How should you expand the square of a binomial?", answer: "Use the distributive property or the binomial identity. The middle term cannot be omitted.", formula: "(a+b)² = a² + 2ab + b²" },
  { category: "Algebra", prompt: "How do you add rational expressions with unlike denominators?", answer: "Rewrite each expression using a common denominator, combine the numerators, and then simplify. Do not add the denominators.", formula: "a/b + c/d = (ad+bc)/bd" },
  { category: "Algebra", prompt: "What does a negative exponent mean?", answer: "A negative exponent indicates a reciprocal. Move the corresponding factor across the fraction bar and change the sign of its exponent.", formula: "x⁻ⁿ = 1/xⁿ" },
  { category: "Algebra", prompt: "How does the difference of squares factor?", answer: "It factors into the product of the sum and difference of the two square roots. This pattern is often used to simplify a limit.", formula: "a²−b² = (a−b)(a+b)" },
  { category: "Applications", prompt: "Where is the hole in (x³−1)/(x−1)?", answer: "Factor x³−1 as (x−1)(x²+x+1), cancel only for nearby behavior, then evaluate the simplified function at x=1. The hole is at (1,3).", formula: "x³−1=(x−1)(x²+x+1)" },
  { category: "Applications", prompt: "What is the secant slope between (9, f(9)) and (x, f(x))?", answer: "Subtract the two output values and divide by the change in input. It is an average rate of change, not yet the instantaneous derivative.", formula: "m=[f(x)−f(9)]/(x−9)" },
];

/* ---- superscripts + friendlier symbols for rendered math ---- */
const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
function toSup(d) { return String(d).split("").map((c) => SUP[c] ?? c).join(""); }
function prettyMath(s) {
  return String(s)
    .replace(/\s*\*\s*/g, "·")
    .replace(/\s*\^\s*/g, "^")
    .replace(/log\(abs\(([^()]+)\)\)/g, "ln|$1|")
    .replace(/\babs\(([^()]+)\)/g, "|$1|")
    .replace(/\blog\(/g, "ln(")
    .replace(/\bexp\(/g, "e^(")
    .replace(/\bsqrt\(/g, "√(")
    .replace(/\bpi\b/g, "π")
    .replace(/\^\((-?\d+)\)/g, (_, d) => toSup(d))
    .replace(/\^(-?\d+)(?![\d./])/g, (_, d) => toSup(d))
    .replace(/1 \/ 2 \/ √\(([^()]+)\)/g, "1 / (2√$1)")
    .replace(/·\s*-\s*/g, "·−")
    .replace(/(^|[\s(=/])-(?=[\d.a-zπ√(])/g, "$1−")
    .replace(/ - /g, " − ")
    // move a bare numeric coefficient in front of its variable: x²·3 / 2 → 3 / 2·x²
    .replace(/([a-zπ√)\]²³¹⁰⁴⁵⁶⁷⁸⁹⁻]+)·(−?\d+(?:\s*\/\s*\d+)?)(?![\w(])/g, "$2·$1")
    .replace(/\+ −/g, "− ")
    .replace(/−\(([^()]+)\)/g, "−$1");
}

/* ---- tiny symbolic engine for the worked-solution panel ---- */
function topLevelTerms(node) {
  const terms = [];
  const walk = (n, sign) => {
    if (n.isParenthesisNode) return walk(n.content, sign);
    if (n.isOperatorNode && (n.op === "+" || n.op === "-") && n.args.length === 2) {
      walk(n.args[0], sign);
      walk(n.args[1], n.op === "-" ? -sign : sign);
      return;
    }
    if (n.isOperatorNode && n.op === "-" && n.args.length === 1) return walk(n.args[0], -sign);
    terms.push({ sign, node: n });
  };
  walk(node, 1);
  return terms;
}
function hasX(node) { return node.filter((n) => n.isSymbolNode && n.name === "x").length > 0; }
function constVal(node) {
  try {
    if (hasX(node)) return null;
    const v = node.compile().evaluate({});
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  } catch { return null; }
}
function linearInner(node) {
  try {
    if (!hasX(node)) return null;
    const k = constVal(math.derivative(node, "x"));
    return k && Number.isFinite(k) ? { k } : null;
  } catch { return null; }
}
function ruleForTerm(s) {
  const e = s.replace(/\s+/g, "");
  if (/(sin|cos|tan)\([^)]*[+\-*/^][^)]*\)/.test(e)) return "chain rule";
  if (/\bexp\(/.test(e)) return "derivative of eˣ";
  if (/\blog\(/.test(e)) return "derivative of ln(x)";
  if (/\bsin\(/.test(e)) return "derivative of sin";
  if (/\bcos\(/.test(e)) return "derivative of cos";
  if (/\btan\(/.test(e)) return "derivative of tan";
  if (/\bsqrt\(/.test(e)) return "power rule";
  if ((e.match(/x/g) || []).length >= 2 && /\*/.test(e) && /\(/.test(e)) return "product rule";
  if (/\//.test(e) && /x/.test(e.split("/")[1] || "")) return "quotient rule";
  if (/\^/.test(e) || /x\*x/.test(e)) return "power rule";
  if (/^[-+]?[0-9.]*\*?x$/.test(e)) return "constant multiple rule";
  if (/^[-+]?[0-9.]+$/.test(e)) return "constant rule";
  return "power rule";
}
function integralRuleName(node) {
  const s = node.toString().replace(/\s+/g, "");
  if (/\b(sin|cos|tan)\(/.test(s)) return "trig integral";
  if (/\bexp\(/.test(s)) return "integral of eˣ";
  if (/(^|[^\w])1\/x($|[^\w])/.test(s) || /x\^-1/.test(s)) return "integral of 1/x";
  return "reverse power rule";
}
function antideriv(node) {
  const c = constVal(node);
  if (c !== null) return `(${c})*x`;
  if (node.isParenthesisNode) return antideriv(node.content);
  if (node.isSymbolNode && node.name === "x") return "x^2/2";
  if (node.isOperatorNode) {
    const { op, args } = node;
    if ((op === "+" || op === "-") && args.length === 2)
      return `(${antideriv(args[0])}) ${op} (${antideriv(args[1])})`;
    if (op === "-" && args.length === 1) return `-(${antideriv(args[0])})`;
    if (op === "*" && args.length === 2) {
      const c0 = constVal(args[0]), c1 = constVal(args[1]);
      if (c0 !== null) return `(${c0})*(${antideriv(args[1])})`;
      if (c1 !== null) return `(${c1})*(${antideriv(args[0])})`;
    }
    if (op === "/" && args.length === 2) {
      const c1 = constVal(args[1]);
      if (c1 !== null) return `(${antideriv(args[0])})/(${c1})`;
      const c0 = constVal(args[0]);
      if (c0 !== null && args[1].isSymbolNode && args[1].name === "x") return `(${c0})*log(abs(x))`;
    }
    if (op === "^" && args.length === 2) {
      const base = args[0], p = constVal(args[1]);
      if (p !== null && base.isSymbolNode && base.name === "x") {
        if (Math.abs(p + 1) < 1e-12) return "log(abs(x))";
        return `x^(${p + 1})/(${p + 1})`;
      }
      const lin = linearInner(base);
      if (p !== null && lin && Math.abs(p + 1) > 1e-12)
        return `(${base})^(${p + 1})/((${p + 1})*(${lin.k}))`;
    }
  }
  if (node.isFunctionNode) {
    const fname = node.fn.name;
    const u = node.args[0];
    if (fname === "log" && u.isSymbolNode && u.name === "x") return "x*log(x) - x";
    const lin = linearInner(u);
    if (!lin) throw new Error("nonlinear inner");
    const k = lin.k, uStr = u.toString();
    if (fname === "sin") return `-cos(${uStr})/(${k})`;
    if (fname === "cos") return `sin(${uStr})/(${k})`;
    if (fname === "exp") return `exp(${uStr})/(${k})`;
    if (fname === "sqrt") return `(2/3)*(${uStr})^(3/2)/(${k})`;
    throw new Error("no rule for " + fname);
  }
  throw new Error("no antiderivative rule");
}
function numIntegral(node, lo, hi) {
  try {
    const f = node.compile();
    const N = 2000, dx = (hi - lo) / N;
    let acc = 0;
    for (let i = 0; i < N; i++) {
      const y = f.evaluate({ x: lo + dx * (i + 0.5) });
      if (Number.isFinite(y)) acc += y * dx;
    }
    return acc;
  } catch { return NaN; }
}
function simpStr(node) {
  try { return math.simplify(node).toString({ parenthesis: "auto" }); }
  catch { return node.toString({ parenthesis: "auto" }); }
}
function stripParen(n) { return n && n.isParenthesisNode ? stripParen(n.content) : n; }
function dOf(node) {
  try { return prettyMath(simpStr(math.derivative(node, "x"))); } catch { return "—"; }
}

const OUTER_LABEL = { sin: "sin( )", cos: "cos( )", tan: "tan( )", exp: "e^( )", log: "ln( )", sqrt: "√( )" };
const OUTER_DERIV = {
  sin: (u) => `cos(${u})`, cos: (u) => `−sin(${u})`, tan: (u) => `sec(${u})²`,
  exp: (u) => `e^(${u})`, log: (u) => `1/(${u})`, sqrt: (u) => `1 / (2·√(${u}))`,
};
const BASIC_DERIV = {
  "sin(x)": { text: "The derivative of sin(x) is cos(x). This is a memorized fact, not something you derive.", rule: "derivative of sin" },
  "cos(x)": { text: "The derivative of cos(x) is −sin(x) — mind the minus sign. Another memorized fact.", rule: "derivative of cos" },
  "tan(x)": { text: "The derivative of tan(x) is sec(x)², which is 1 ÷ cos(x)².", rule: "derivative of tan" },
  "exp(x)": { text: "eˣ is its own derivative — the one function differentiation leaves unchanged.", rule: "derivative of eˣ" },
  "e^x": { text: "eˣ is its own derivative — the one function differentiation leaves unchanged.", rule: "derivative of eˣ" },
  "log(x)": { text: "The derivative of ln(x) is 1/x.", rule: "derivative of ln(x)" },
};

/* Ordered {text, math?, rule?} list that actually walks the work for a single
   (non-additive) term, picked by the term's shape. */
function derivativeSteps(t) {
  t = stripParen(t);
  const whole = () => { try { return prettyMath(simpStr(math.derivative(t, "x"))); } catch { return "—"; } };
  const key = t.toString().replace(/\s+/g, "");

  if (!hasX(t)) return [
    { text: `This term is just the number ${prettyMath(t.toString())}. A constant never changes, so its rate of change — its derivative — is 0.`, rule: "constant rule" },
  ];

  if (key === "abs(x)") return [
    { text: "|x| is V-shaped: it falls with slope −1 to the left of 0 and rises with slope +1 to the right." },
    { text: "So f′(x) = −1 for x < 0 and f′(x) = +1 for x > 0 — but at x = 0 the left and right slopes disagree, so f′(0) does not exist. |x| is the classic reminder that a continuous function isn't always differentiable.", rule: "differentiability" },
  ];

  if (BASIC_DERIV[key]) return [
    { text: BASIC_DERIV[key].text, rule: BASIC_DERIV[key].rule },
    { text: "So the slope formula is:", math: whole() },
  ];

  if (key === "1/x") return [
    { text: "First rewrite 1/x as x⁻¹ (x to the −1 power) so the power rule applies." },
    { text: "Power Rule — a rule for derivatives: drop the exponent to the front, then lower it by 1.", math: "x⁻¹  →  −1·x⁻²  =  −1/x²", rule: "power rule" },
  ];

  if (t.isFunctionNode && t.fn.name === "sqrt" && stripParen(t.args[0]).isSymbolNode) return [
    { text: "First rewrite √x as x^(1/2) — x to the one-half power." },
    { text: "Power Rule: bring the 1/2 to the front, then lower the power by 1.", math: "½·x^(−½)  =  1 / (2√x)", rule: "power rule" },
  ];

  if ((t.isSymbolNode && t.name === "x") ||
      (t.isOperatorNode && t.op === "^" && stripParen(t.args[0]).isSymbolNode && stripParen(t.args[0]).name === "x" && constVal(t.args[1]) !== null)) {
    const n = t.isSymbolNode ? 1 : constVal(t.args[1]);
    return [
      { text: `${prettyMath(t.toString())} is x raised to a fixed power (n = ${n}).` },
      { text: "Power Rule — a rule for derivatives: drop the exponent to the front as a multiplier, then subtract 1 from the exponent.", math: `${prettyMath(t.toString())}  →  ${whole()}`, rule: "power rule" },
    ];
  }

  // (inner)^n  — power rule on the outside, chain rule for the inside
  if (t.isOperatorNode && t.op === "^" && constVal(t.args[1]) !== null && hasX(t.args[0])) {
    const u = stripParen(t.args[0]);
    if (!(u.isSymbolNode && u.name === "x")) {
      const nn = constVal(t.args[1]);
      const us = prettyMath(u.toString());
      return [
        { text: `${prettyMath(t.toString())} is a whole expression raised to a power: the inside is ${us}, raised to ${nn}.` },
        { text: "Use the Chain Rule with the power rule on the outside:", math: "d/dx[ uⁿ ]  =  n·uⁿ⁻¹ · u′", rule: "chain rule" },
        { text: `Here u = ${us} (so u′ = ${dOf(u)}):`, math: `${nn}·(${us})^${nn - 1} · ${dOf(u)}` },
        { text: "Multiplied out:", math: whole() },
      ];
    }
  }

  if (t.isOperatorNode && t.op === "*" && t.args.length === 2 &&
      ((constVal(t.args[0]) !== null) !== (constVal(t.args[1]) !== null))) {
    const cNode = constVal(t.args[0]) !== null ? t.args[0] : t.args[1];
    const rest = constVal(t.args[0]) !== null ? t.args[1] : t.args[0];
    return [
      { text: `The number ${prettyMath(cNode.toString())} only scales the function — leave it out front (Constant Multiple Rule) and differentiate ${prettyMath(rest.toString())}.`, rule: "constant multiple rule" },
      { text: `The derivative of ${prettyMath(rest.toString())} is ${dOf(rest)}, so altogether:`, math: whole() },
    ];
  }

  if (t.isOperatorNode && t.op === "*" && t.args.length === 2 && hasX(t.args[0]) && hasX(t.args[1])) {
    const A = t.args[0], B = t.args[1];
    const As = prettyMath(A.toString()), Bs = prettyMath(B.toString());
    return [
      { text: `${prettyMath(t.toString())} is a product — two functions of x multiplied together: ${As} and ${Bs}.` },
      { text: "A product is handled by the Product Rule, one of the rules for derivatives:", math: "(A · B)′  =  A′·B  +  A·B′", rule: "product rule" },
      { text: "Differentiate each piece on its own:", math: `A = ${As}    A′ = ${dOf(A)}\nB = ${Bs}    B′ = ${dOf(B)}` },
      { text: "Put those into the rule:", math: `(${dOf(A)})·${Bs}  +  ${As}·(${dOf(B)})` },
      { text: "Clean it up:", math: whole() },
    ];
  }

  if (t.isOperatorNode && t.op === "/" && t.args.length === 2 && hasX(t.args[1])) {
    const A = t.args[0], B = t.args[1];
    const As = prettyMath(A.toString()), Bs = prettyMath(B.toString());
    return [
      { text: `${prettyMath(t.toString())} is a quotient — ${As} divided by ${Bs}.` },
      { text: "A quotient is handled by the Quotient Rule, one of the rules for derivatives:", math: "(A / B)′  =  (A′·B − A·B′) / B²", rule: "quotient rule" },
      { text: "Differentiate top and bottom:", math: `A = ${As}    A′ = ${dOf(A)}\nB = ${Bs}    B′ = ${dOf(B)}` },
      { text: "Put those into the rule:", math: `((${dOf(A)})·${Bs} − ${As}·(${dOf(B)})) / (${Bs})²` },
      { text: "Clean it up:", math: whole() },
    ];
  }

  if (t.isFunctionNode && t.args.length === 1) {
    const inner = stripParen(t.args[0]);
    if (!(inner.isSymbolNode && inner.name === "x")) {
      const fn = t.fn.name;
      const us = prettyMath(inner.toString());
      const od = (OUTER_DERIV[fn] || ((u) => `${fn}′(${u})`))(us);
      return [
        { text: `${prettyMath(t.toString())} is a function inside a function — the outer function is ${OUTER_LABEL[fn] || fn + "( )"}, the inner function is ${us}.` },
        { text: "Nested functions are handled by the Chain Rule, one of the rules for derivatives:", math: "( f(g(x)) )′  =  f′(g(x)) · g′(x)", rule: "chain rule" },
        { text: "Differentiate the outer function (leave the inside as it is), then multiply by the derivative of the inside:", math: `${od}  ·  ${dOf(inner)}` },
        { text: "Which multiplies out to:", math: whole() },
      ];
    }
  }

  return [{ text: "Differentiate directly:", math: whole() }];
}

function derivativeWork(exprInput) {
  let node;
  try { node = math.parse(exprInput); } catch { return null; }
  let ans;
  try { ans = prettyMath(simpStr(math.derivative(node, "x"))); } catch { return null; }
  const terms = topLevelTerms(node);
  let steps;
  if (terms.length > 1) {
    steps = [{ text: "f(x) is several pieces added or subtracted. The Sum Rule says: differentiate each piece on its own, then combine.", rule: "sum rule" }];
    terms.forEach(({ sign, node: t }) => {
      const label = (sign < 0 ? "− " : "") + prettyMath(t.toString());
      let d;
      try { d = prettyMath(simpStr(math.derivative(math.parse(`${sign < 0 ? "-" : ""}(${t.toString()})`), "x"))); }
      catch { d = "—"; }
      steps.push({ text: label, math: `d/dx[ ${label} ]  =  ${d}`, rule: ruleForTerm(t.toString()) });
    });
  } else {
    steps = derivativeSteps(terms[0].node);
  }
  return {
    mode: "derivative",
    problem: `d/dx [ ${prettyMath(exprInput)} ]`,
    goal: `You're finding f′(x) — also written dy/dx or y′ — a formula for the slope of f(x) = ${prettyMath(exprInput)}. Feed it any x and it returns how steep the curve is at that point.`,
    steps,
    answer: `f′(x)  =  ${ans}`,
    graphLead: "Take the marker's x, drop it into the formula:",
    ruleKeys: steps.filter((s) => s.rule).map((s) => s.rule),
  };
}

function integralWork(exprInput, iA, iB) {
  let node;
  try { node = math.parse(exprInput); } catch { return null; }
  const fpretty = prettyMath(exprInput);
  const problem = `∫ ( ${fpretty} ) dx     from ${fmt(iA).replace(/-/g, "−")} to ${fmt(iB).replace(/-/g, "−")}`;

  // Does the curve sit above the axis, below it, or cross? Drives the green/red wording.
  let sawPos = false, sawNeg = false, unsigned = 0;
  try {
    const f = node.compile();
    const N = 400, dx = (iB - iA) / N;
    for (let i = 0; i < N; i++) {
      const y = f.evaluate({ x: iA + dx * (i + 0.5) });
      if (Number.isFinite(y)) {
        if (y > 1e-9) sawPos = true;
        if (y < -1e-9) sawNeg = true;
        unsigned += Math.abs(y) * dx;
      }
    }
  } catch { /* leave flags false */ }
  const crosses = sawPos && sawNeg;

  const goal = `You're finding the definite integral: the exact signed area between f(x) = ${fpretty} and the x-axis, from x = ${fmt(iA)} to x = ${fmt(iB)}.`;
  const signNote = crosses
    ? "The graph shades it two colors: green where the curve is above the axis (that area counts +) and red where it's below (counts −). The integral is the green area minus the red area — both get measured."
    : sawNeg
      ? "Here the curve stays below the axis the whole interval, so every shaded piece is red and the integral comes out negative."
      : "Here the curve stays above the axis the whole way, so it's all green and every piece counts +.";
  const graphNote = crosses
    ? "The running total climbs through the green stretches and falls back through the red ones — where it lands is the integral."
    : sawNeg
      ? "The running total only ever falls, since every slice of area is negative."
      : "The running total only ever climbs, since every slice of area is positive.";
  const convergeLead = "The running total on the lower graph converges to:";

  const integrableBy = (nd) => topLevelTerms(nd).every(({ node: t }) => { try { antideriv(t); return true; } catch { return false; } });
  // If it's a polynomial hiding behind powers/products — (x²+1)³, (2x+1)² — expand it first.
  let intNode = node, expandStep = null;
  if (!integrableBy(node)) {
    try {
      const r = math.rationalize(node);
      if (!/\//.test(r.toString()) && integrableBy(r)) {
        intNode = r;
        expandStep = { text: `First expand it into a polynomial: ${fpretty} = ${prettyMath(r.toString())}. Now integrate term by term.` };
      }
    } catch { /* not expandable */ }
  }

  const terms = topLevelTerms(intNode);
  const parts = [];
  const antiSteps = [];
  let ok = true;
  for (const { sign, node: t } of terms) {
    try {
      const F = antideriv(t);
      const Fs = prettyMath(simpStr(math.parse(F)));
      const term = (sign < 0 ? "− " : "") + prettyMath(t.toString());
      antiSteps.push({ text: term, math: `∫ ${term} dx  =  ${sign < 0 ? "−(" + Fs + ")" : Fs}`, rule: integralRuleName(t) });
      parts.push({ sign, F });
    } catch { ok = false; break; }
  }

  if (!ok || !parts.length) {
    return {
      mode: "integral", problem, goal, signNote, graphNote,
      steps: [
        { text: `${fpretty} has no antiderivative you can write with the basic rules.` },
        { text: "So the area is found by approximation: slice it into thin columns and add them up — exactly what the animation does (a Riemann sum).", rule: "riemann sum" },
        ...(crosses ? [{ text: `Columns above the axis add area, columns below subtract it. Green total ≈ ${fmt((unsigned + numIntegral(node, iA, iB)) / 2, 3)}, red total ≈ ${fmt((unsigned - numIntegral(node, iA, iB)) / 2, 3)}.` }] : []),
      ],
      answer: `area ≈ ${fmt(numIntegral(node, iA, iB), 5)}`,
      graphLead: convergeLead,
      ruleKeys: ["riemann sum"],
    };
  }

  const Fexpr = parts.map((p, i) => `${i === 0 ? (p.sign < 0 ? "-" : "") : (p.sign < 0 ? "- " : "+ ")}(${p.F})`).join(" ");
  let Fpretty, Fa, Fb, val;
  try {
    const Fnode = math.simplify(math.parse(Fexpr));
    Fpretty = prettyMath(Fnode.toString({ parenthesis: "auto" }));
    const Fc = Fnode.compile();
    Fa = Fc.evaluate({ x: iA });
    Fb = Fc.evaluate({ x: iB });
    val = Fb - Fa;
    if (![Fa, Fb, val].every(Number.isFinite)) throw new Error("nonfinite");
  } catch {
    return {
      mode: "integral", problem, goal, signNote, graphNote,
      steps: [{ text: "The antiderivative blows up somewhere on this interval, so fall back to the column approximation.", rule: "riemann sum" }],
      answer: `area ≈ ${fmt(numIntegral(node, iA, iB), 5)}`,
      graphLead: convergeLead,
      ruleKeys: ["riemann sum"],
    };
  }

  const multi = terms.length > 1;
  const steps = [
    { text: "To get an exact area, first find an antiderivative F(x) — a function whose derivative is f(x). Reversing differentiation like this is the Fundamental Theorem of Calculus.", rule: "fundamental theorem of calculus" },
  ];
  if (expandStep) steps.push(expandStep);
  if (multi) steps.push({ text: "Integrate each term separately (Sum Rule):", rule: "sum rule" });
  antiSteps.forEach((s) => steps.push(s));
  steps.push({ text: multi ? "Add the pieces:" : "So:", math: `F(x)  =  ${Fpretty}` });
  const par = (v) => { const s = fmt(v, 4).replace(/-/g, "−"); return s.startsWith("−") ? `(${s})` : s; };
  const mm = (v) => fmt(v).replace(/-/g, "−");
  steps.push({ text: "Plug the two ends into F and subtract:", math: `F(${mm(iB)}) − F(${mm(iA)})  =  ${par(Fb)} − ${par(Fa)}` });
  if (crosses) {
    const green = (unsigned + val) / 2, red = (unsigned - val) / 2;
    steps.push({
      text: `The curve crosses the axis, so this answer is a difference: green area ≈ ${fmt(green, 3)} above, red area ≈ ${fmt(red, 3)} below. green − red = ${fmt(val, 4)}.`,
    });
  }

  return {
    mode: "integral",
    problem, goal, signNote, graphNote,
    steps,
    answer: `∫  =  ${fmt(val, 4)}`,
    graphLead: "The columns' running total on the lower graph lands on:",
    ruleKeys: ["fundamental theorem of calculus", ...(multi ? ["sum rule"] : []), ...antiSteps.map((s) => s.rule).filter(Boolean)],
  };
}

/* Wrap known calculus terms in the first place they appear with a hover chip. */
function Glossed({ children }) {
  if (typeof children !== "string") return <>{children}</>;
  const out = [];
  const seen = new Set();
  let last = 0, m;
  GLOSSARY_RE.lastIndex = 0;
  while ((m = GLOSSARY_RE.exec(children)) !== null) {
    const key = canonicalKey(m[1]);
    if (m.index > last) out.push(children.slice(last, m.index));
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(<Term key={m.index} name={key}>{m[0]}</Term>);
    } else {
      out.push(m[0]);
    }
    last = m.index + m[0].length;
  }
  if (last < children.length) out.push(children.slice(last));
  return <>{out}</>;
}
function Term({ name, children }) {
  const def = GLOSSARY[name] || GLOSSARY[canonicalKey(name) || ""];
  if (!def) return <>{children || name}</>;
  return (
    <span className="cl-term" tabIndex={0} role="button" aria-label={`${name}: ${def}`}>
      {children || name}
      <span className="cl-tip" role="tooltip">
        <span className="cl-tip-term">{name}</span>
        {def}
      </span>
    </span>
  );
}
function RuleChip({ name }) {
  const label = name.charAt(0).toUpperCase() + name.slice(1);
  return (
    <span style={styles.ruleChip}>
      <span style={styles.ruleChipMark}>▸</span>
      <Term name={name}>{label}</Term>
    </span>
  );
}

function WorkSteps({ steps }) {
  return (
    <ol style={styles.wSteps}>
      {steps.map((s, i) => (
        <li key={i} style={styles.wStep}>
          <span style={styles.wStepNum}>{i + 1}</span>
          <div style={styles.wStepText}><Glossed>{s.text}</Glossed></div>
          {s.math && <div style={styles.wStepMath}>{s.math}</div>}
          {s.rule && <RuleChip name={s.rule} />}
        </li>
      ))}
    </ol>
  );
}

function RulesToolbox({ mode, activeKeys }) {
  const [open, setOpen] = useState(false);
  const rules = mode === "derivative" ? DERIV_RULES : INT_RULES;
  const used = rules.filter((r) => activeKeys.has(r.key));
  return (
    <div style={styles.toolbox}>
      <button
        className="cl-btn"
        style={styles.toolboxHead}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span style={styles.toolboxChevron}>{open ? "▾" : "▸"}</span>
        <span style={styles.toolboxTitle}>
          {mode === "derivative" ? "Derivative rules" : "Integration rules"}
        </span>
        <span style={styles.toolboxUsing}>
          {used.length ? `this problem uses: ${used.map((r) => r.name).join(", ")}` : "tap to open the reference"}
        </span>
      </button>
      {open && (
        <div style={styles.toolboxGrid}>
          {rules.map((r) => {
            const on = activeKeys.has(r.key);
            return (
              <div key={r.key} style={{ ...styles.ruleCard, ...(on ? styles.ruleCardOn : {}) }}>
                <div style={styles.ruleCardTop}>
                  <span style={styles.ruleName}>{r.name}</span>
                  {on && <span style={styles.ruleBadge}>used here</span>}
                </div>
                <div style={styles.ruleFormula}>{r.formula}</div>
                <div style={styles.ruleWhen}><b>When:</b> {r.when}</div>
                <div style={styles.ruleEg}>{r.example}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CalculusLab() {
  const [activeTab, setActiveTab] = useState("home");
  const [exprInput, setExprInput] = useState("x^2");
  const [domain, setDomain] = useState([-4, 4]);
  const [activePreset, setActivePreset] = useState("x²");
  const [mode, setMode] = useState("derivative"); // 'derivative' | 'integral'
  const [derivAnim, setDerivAnim] = useState("slide"); // 'slide' | 'hZero'
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [parseError, setParseError] = useState(null);

  const rafRef = useRef(null);
  const startRef = useRef(null);
  const baseProgressRef = useRef(0);

  const { fn, derivFn, derivStr } = useMemo(() => {
    try {
      const n = math.parse(exprInput);
      const compiled = n.compile();
      const f = (x) => compiled.evaluate({ x });
      let dStr = "";
      let dFn = null;
      try {
        const dNode = math.derivative(n, "x");
        dStr = dNode.toString({ parenthesis: "auto" }).replace(/\*/g, "·");
        const dCompiled = dNode.compile();
        dFn = (x) => dCompiled.evaluate({ x });
      } catch {
        dFn = (x) => {
          const h = 1e-4;
          try { return (f(x + h) - f(x - h)) / (2 * h); } catch { return NaN; }
        };
        dStr = "estimated numerically";
      }
      setParseError(null);
      return { fn: f, derivFn: dFn, derivStr: dStr };
    } catch {
      setParseError("Hmm, that doesn't look like a valid function — check your parentheses and operators.");
      return { fn: null, derivFn: null, derivStr: "" };
    }
  }, [exprInput]);


  const [a, b] = domain;
  // Integration runs across the full visible domain so the columns fill the graph.
  const iA = a;
  const iB = b;

  useEffect(() => {
    if (!playing) return;
    const DURATION = (mode === "integral" ? 4200 : 7000) / speed;
    startRef.current = null;
    const tick = (t) => {
      if (startRef.current === null) startRef.current = t;
      const elapsed = t - startRef.current;
      const p = Math.min(1, baseProgressRef.current + elapsed / DURATION);
      setProgress(p);
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setPlaying(false);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, mode]);

  const handlePlay = () => {
    if (progress >= 1) { setProgress(0); baseProgressRef.current = 0; }
    else baseProgressRef.current = progress;
    setPlaying(true);
  };
  const handlePause = () => setPlaying(false);
  const handleReset = () => { setPlaying(false); setProgress(0); baseProgressRef.current = 0; };
  const handleScrub = (v) => { setPlaying(false); setProgress(v); baseProgressRef.current = v; };

  const selectPreset = (p) => {
    setExprInput(p.expr);
    setDomain(p.domain);
    setActivePreset(p.label);
    handleReset();
  };

  const setModeAndReset = (m) => { setMode(m); handleReset(); };
  const setDerivAnimAndReset = (m) => { setDerivAnim(m); handleReset(); };
  const openLab = (m) => { setModeAndReset(m); setActiveTab(m); };
  const openLimits = () => setActiveTab("limit");
  const openFlashcards = () => setActiveTab("flashcards");
  const selectHomePreset = (preset, m) => { selectPreset(preset); openLab(m); };

  const curvePts = useMemo(() => (fn ? sample(fn, a, b) : []), [fn, a, b]);
  const [yLo, yHi] = useMemo(() => yExtent(curvePts), [curvePts]);

  const derivPts = useMemo(() => (derivFn ? sample(derivFn, a, b) : []), [derivFn, a, b]);
  const [dyLo, dyHi] = useMemo(() => yExtent(derivPts), [derivPts]);

  /* In integrate mode, always keep the x-axis (y = 0) inside the frame so
     every column visibly sits on the axis and negative columns have room
     to hang below it. */
  const [vLo, vHi] = useMemo(() => {
    if (mode !== "integral") return [yLo, yHi];
    const span = yHi - yLo;
    return [Math.min(yLo, 0) - (yLo > 0 ? span * 0.08 : 0), Math.max(yHi, 0) + (yHi < 0 ? span * 0.08 : 0)];
  }, [mode, yLo, yHi]);

  const xToPx = useCallback((x) => PAD.l + ((x - a) / (b - a)) * (W - PAD.l - PAD.r), [a, b]);
  const yToPx = useCallback((y) => H - PAD.b - ((y - vLo) / (vHi - vLo)) * (H - PAD.t - PAD.b), [vLo, vHi]);
  const yToPx2 = useCallback((y) => H2 - PAD.b - ((y - dyLo) / (dyHi - dyLo)) * (H2 - PAD.t - PAD.b), [dyLo, dyHi]);

  const mainPath = useMemo(() => pathFromPoints(curvePts, xToPx, yToPx), [curvePts, xToPx, yToPx]);
  const derivPath = useMemo(() => pathFromPoints(derivPts, xToPx, yToPx2), [derivPts, xToPx, yToPx2]);

  /* ---------------- DERIVATIVE MODE geometry ---------------- */
  // "slide" sweeps the point along x; "hZero" holds x and shrinks h so the
  // secant line collapses onto the tangent (the limit definition, Larson 2.1).
  const hZero = mode === "derivative" && derivAnim === "hZero";
  const cursorX = hZero ? a + (b - a) * 0.6 : a + progress * (b - a);
  const cursorY = fn ? safe(fn, cursorX) : NaN;
  const slope = derivFn ? safe(derivFn, cursorX) : NaN;

  const hCur = hZero
    ? Math.max((b - a) * 0.004, (b - a) * 0.34 * (1 - Math.pow(progress, 0.7)))
    : null;
  const secX = hZero ? cursorX + hCur : NaN;
  const secY = hZero && fn ? safe(fn, secX) : NaN;
  const secSlope = hZero && Number.isFinite(secY) && Number.isFinite(cursorY)
    ? (secY - cursorY) / hCur
    : NaN;
  const secantPath = useMemo(() => {
    if (!hZero || !Number.isFinite(cursorY) || !Number.isFinite(secSlope)) return "";
    const half = (b - a) * 0.34;
    const x1 = cursorX - half, x2 = secX + half * 0.25;
    return `M ${xToPx(x1)} ${yToPx(cursorY - secSlope * (cursorX - x1))} L ${xToPx(x2)} ${yToPx(cursorY + secSlope * (x2 - cursorX))}`;
  }, [hZero, cursorX, cursorY, secX, secSlope, a, b, xToPx, yToPx]);

  const tangentPath = useMemo(() => {
    if (!Number.isFinite(cursorY) || !Number.isFinite(slope)) return "";
    const halfSpan = (b - a) * 0.2;
    const x1 = cursorX - halfSpan, x2 = cursorX + halfSpan;
    const y1 = cursorY - slope * halfSpan, y2 = cursorY + slope * halfSpan;
    return `M ${xToPx(x1)} ${yToPx(y1)} L ${xToPx(x2)} ${yToPx(y2)}`;
  }, [cursorX, cursorY, slope, a, b, xToPx, yToPx]);

  /* rise-over-run wedge on the tangent — makes "slope" concrete */
  const slopeRun = useMemo(() => {
    if (!Number.isFinite(cursorY) || !Number.isFinite(slope)) return null;
    const base = (b - a) * 0.1;
    const dir = cursorX + base <= b ? 1 : -1;
    const run = base * dir;
    return { x0: cursorX, y0: cursorY, xr: cursorX + run, rise: slope * run, dir };
  }, [cursorX, cursorY, slope, a, b]);

  /* is the curve continuous but non-differentiable right at the marker?
     (a corner: the slope coming in from the left ≠ the slope going out right) */
  const kink = useMemo(() => {
    if (!fn) return null;
    const e = Math.max((b - a) * 5e-4, 1e-4);
    const y0 = safe(fn, cursorX), yL = safe(fn, cursorX - e), yR = safe(fn, cursorX + e);
    if (![y0, yL, yR].every(Number.isFinite)) return null;
    const sL = (y0 - yL) / e, sR = (yR - y0) / e;
    const scale = Math.max(1, Math.abs(sL), Math.abs(sR));
    return Math.abs(sL - sR) > 0.6 * scale ? { sL, sR } : null;
  }, [fn, cursorX, a, b]);

  /* one-line story of what the tangent's tilt means right now */
  const flatBand = (Math.abs(dyHi - dyLo) || 2) * 0.04;
  const slopeStory = kink
    ? `✕  no derivative here — the slope jumps from ${fmt(kink.sL)} on the left to ${fmt(kink.sR)} on the right. f is continuous but not differentiable at this point.`
    : !Number.isFinite(slope)
      ? null
      : Math.abs(slope) <= flatBand
        ? "▬  tangent is flat — f has leveled off, so f′(x) = 0"
        : slope > 0
          ? "▲  tangent tilts up — f is increasing, so f′(x) > 0"
          : "▼  tangent tilts down — f is decreasing, so f′(x) < 0";

  const derivTracePts = useMemo(() => derivPts.filter((p) => p[0] <= cursorX), [derivPts, cursorX]);
  const derivTracePath = useMemo(() => pathFromPoints(derivTracePts, xToPx, yToPx2), [derivTracePts, xToPx, yToPx2]);

  /* ---------------- INTEGRAL MODE geometry ---------------- */
  // Refinement is stepped: each n just holds for its slice of the timeline
  // (a short pause), then snaps to the next. No slide, no grow.
  const stageBounds = [0.18, 0.36, 0.54, 0.72, 0.9, 1.0];
  const stageN = [6, 12, 24, 48, 96, 160];
  let stageIdx = stageBounds.findIndex((s) => progress <= s);
  if (stageIdx === -1) stageIdx = stageBounds.length - 1;
  const n = stageN[stageIdx];
  const smooth = progress >= 1;
  // Only the very end dissolves the staircase into the exact shaded area.
  const smoothMix = progress <= 0.92 ? 0 : Math.min(1, (progress - 0.92) / 0.08);

  const rectangles = useMemo(() => {
    if (!fn) return [];
    const rects = [];
    const w = (iB - iA) / n;
    for (let i = 0; i < n; i++) {
      const xm = iA + w * (i + 0.5);
      const h = safe(fn, xm);
      if (!Number.isFinite(h)) continue;
      rects.push({ x0: iA + w * i, x1: iA + w * (i + 1), h });
    }
    return rects;
  }, [fn, iA, iB, n]);

  const riemannSum = useMemo(
    () => rectangles.reduce((s, r) => s + r.h * (r.x1 - r.x0), 0),
    [rectangles]
  );

  const accumPts = useMemo(() => {
    if (!fn) return [];
    const steps = 240;
    const pts = [];
    let acc = 0;
    const dx = (b - a) / steps;
    for (let i = 0; i <= steps; i++) {
      const x = a + i * dx;
      if (i > 0) {
        const fh = safe(fn, x - dx / 2);
        if (Number.isFinite(fh)) acc += fh * dx;
      }
      pts.push([x, acc]);
    }
    return pts;
  }, [fn, a, b]);
  const [afLo, afHi] = useMemo(() => yExtent(accumPts), [accumPts]);
  const yToPxAccum = useCallback(
    (y) => H2 - PAD.b - ((y - afLo) / (afHi - afLo)) * (H2 - PAD.t - PAD.b),
    [afLo, afHi]
  );
  const sweepX = a + progress * (b - a);
  const accumTrace = useMemo(() => accumPts.filter((p) => p[0] <= sweepX), [accumPts, sweepX]);
  const accumPath = useMemo(() => pathFromPoints(accumTrace, xToPx, yToPxAccum), [accumTrace, xToPx, yToPxAccum]);
  const accumNow = accumTrace.length ? accumTrace[accumTrace.length - 1][1] : 0;

  const exactIntegral = useMemo(() => {
    if (!fn) return NaN;
    const steps = 2000;
    let acc = 0;
    const dx = (iB - iA) / steps;
    for (let i = 0; i < steps; i++) {
      const xm = iA + dx * (i + 0.5);
      const h = safe(fn, xm);
      if (Number.isFinite(h)) acc += h * dx;
    }
    return acc;
  }, [fn, iA, iB]);

  /* Symbolic worked solution — keyed only on the problem, not the animation
     frame, so the steps are computed once and never churn while playing. */
  const work = useMemo(() => {
    try {
      return mode === "derivative" ? derivativeWork(exprInput) : integralWork(exprInput, iA, iB);
    } catch { return null; }
  }, [mode, exprInput, iA, iB]);


  /* Which toolbox rules the current worked solution actually leans on. */
  const activeRuleKeys = useMemo(
    () => new Set((work?.ruleKeys ?? []).map((k) => k.toLowerCase())),
    [work]
  );

  const stats = useMemo(() => {
    // While playing, snap the streaming readouts to coarse checkpoints so they
    // stay legible; show full precision the moment the animation is stopped.
    const q = (v, scale) => fmt(playing ? quantize(v, scale) : v, 4);
    if (mode === "derivative") {
      return [
        { label: "x", value: q(cursorX, b - a) },
        { label: "f(x)", value: q(cursorY, yHi - yLo) },
        { label: "slope f′(x)", value: q(slope, dyHi - dyLo) },
      ];
    }
    return [
      { label: "columns", value: smooth ? "smooth" : String(n) },
      { label: "area estimate", value: smooth ? fmt(exactIntegral, 4) : q(riemannSum, afHi - afLo) },
      { label: "area so far", value: q(accumNow, afHi - afLo) },
    ];
  }, [mode, playing, cursorX, cursorY, slope, n, smooth, riemannSum, exactIntegral, accumNow, a, b, yLo, yHi, dyLo, dyHi, afLo, afHi]);

  return (
    <div className="calculusApp" style={styles.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        .cl-btn:focus-visible, .cl-input:focus-visible, .cl-chip:focus-visible, .cl-tab:focus-visible {
          outline: 2px solid ${COLORS.violet}; outline-offset: 2px;
        }
        .cl-chip { transition: background .15s ease, border-color .15s ease, color .15s ease, transform .1s ease; }
        .cl-btn { transition: background .15s ease, transform .1s ease, box-shadow .15s ease; }
        .cl-btn:active { transform: translateY(1px); }
        .cl-chip:hover { transform: translateY(-1px); }
        .homeStarter { transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease; }
        .homeStarter:hover { transform: translateY(-3px); border-color: ${COLORS.violet} !important; box-shadow: 0 12px 26px rgba(18,58,94,0.13) !important; }
        .limitTable th, .limitTable td { border-bottom: 1px solid ${COLORS.border}; padding: 10px 8px; text-align: right; }
        .limitTable th { color: ${COLORS.inkDim}; font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600; }
        .limitTable td:first-child, .limitTable th:first-child { text-align: left; color: ${COLORS.violet}; }
        input[type=range] { -webkit-appearance: none; appearance: none; height: 5px; border-radius: 3px; background: ${COLORS.border}; }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%;
          background: ${COLORS.violet}; cursor: pointer; border: 3px solid #fff;
          box-shadow: 0 2px 6px rgba(124,92,252,0.5);
        }
        .cl-stat-value { font-variant-numeric: tabular-nums; }

        .cl-term {
          position: relative;
          color: ${COLORS.violet};
          font-weight: 600;
          border-bottom: 1.5px dotted ${COLORS.violet};
          cursor: help;
          outline: none;
        }
        .cl-tip {
          position: absolute;
          left: 50%;
          top: calc(100% + 9px);
          transform: translateX(-50%);
          width: max-content;
          max-width: 250px;
          background: ${COLORS.ink};
          color: #fff;
          font-family: 'Inter', system-ui, sans-serif;
          font-weight: 400;
          font-size: 12px;
          line-height: 1.5;
          letter-spacing: 0;
          text-align: left;
          padding: 10px 12px;
          border-radius: 10px;
          box-shadow: 0 12px 30px rgba(43, 37, 64, 0.32);
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          z-index: 60;
        }
        .cl-tip::after {
          content: "";
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          border: 6px solid transparent;
          border-bottom-color: ${COLORS.ink};
        }
        .cl-tip-term {
          display: block;
          font-family: 'Poppins', sans-serif;
          font-weight: 700;
          font-size: 11.5px;
          color: ${COLORS.mint};
          text-transform: capitalize;
          margin-bottom: 3px;
        }
        .cl-term:hover .cl-tip,
        .cl-term:focus .cl-tip,
        .cl-term:focus-visible .cl-tip {
          opacity: 1;
          visibility: visible;
          animation: fadeIn .16s ease;
        }
        .cl-term:focus-visible { border-bottom-style: solid; }

        @media (prefers-reduced-motion: reduce) {
          .cl-btn, .cl-chip { transition: none; }
          .cl-term:hover .cl-tip, .cl-term:focus .cl-tip, .cl-term:focus-visible .cl-tip { animation: none; }
        }
        @media (max-width: 880px) {
          .calculusApp { overflow-x: hidden; }
          .bar { min-width: 0; }
          .topbar .bar { padding-inline: 14px; }
          .brandDiv, .brandSub { display: none; }
          .navbar .bar { overflow-x: auto; padding-inline: 8px; }
          .navLink { flex: 0 0 auto; padding-inline: 12px !important; }
          .page { padding-inline: 12px !important; }
          .cl-layout { grid-template-columns: 1fr !important; }
          .cl-notes { order: 3; position: static !important; }
          .homeIntro { flex-direction: column; align-items: flex-start !important; }
          .homeTitle { font-size: 34px !important; }
          .homeFormula { align-self: flex-start; max-width: 100%; font-size: 18px !important; white-space: normal; flex-wrap: wrap; overflow-wrap: anywhere; }
          .starterGrid, .homeLowerGrid { grid-template-columns: 1fr !important; }
          .limitIntro, .limitLayout { grid-template-columns: 1fr !important; flex-direction: column !important; }
          .limitNotation { align-self: flex-start !important; }
          .limitPresetRow { overflow-x: auto; flex-wrap: nowrap !important; padding-bottom: 4px; }
          .limitPresetRow .cl-chip { white-space: nowrap; }
          .limitTableWrap { overflow-x: auto; }
          .limitTable { min-width: 420px; }
          .flashIntro { flex-direction: column; align-items: flex-start !important; }
          .flashTitle { font-size: 28px !important; }
          .flashQuestion { font-size: 20px !important; }
          .flashCardButton { min-height: 310px; padding: 20px 16px !important; }
          .flashAnswer { font-size: 16px !important; }
          .flashFormula { font-size: 12px !important; overflow-wrap: anywhere; }
          .flashControls { display: grid !important; grid-template-columns: 1fr auto 1fr; gap: 6px; }
          .flashNav:first-child { justify-self: start; }
          .flashNav:last-child { justify-self: end; }
          .flashReveal { white-space: nowrap; padding-inline: 12px !important; }
          .flashTip { flex-direction: column; align-items: flex-start; gap: 3px; }
          .tabs { width: 100%; }
          .tab { flex: 1; padding-inline: 8px !important; }
          .statRow { flex-wrap: wrap !important; }
          .statPill { flex: 1 1 calc(50% - 8px); min-width: 0; }
        }
        @media (max-width: 420px) {
          .navLink { font-size: 12px !important; padding-inline: 10px !important; }
          .flashCardTop { align-items: flex-start; }
          .flashFlip { font-size: 9px !important; }
          .flashControls { grid-template-columns: 1fr 1fr; }
          .flashReveal { grid-column: 1 / -1; grid-row: 1; justify-self: center; }
          .flashNav { grid-row: 2; }
          .flashNav:last-child { grid-column: 2; }
        }
      `}</style>

      {/* bar 1 — wordmark */}
      <div className="topbar" style={styles.topbar}>
        <div className="bar" style={styles.bar}>
          <span style={styles.brandMark}>∫ƒ′</span>
          <span style={styles.brand}>Calculus Lab</span>
          <span className="brandDiv" style={styles.brandDiv}>|</span>
          <span className="brandSub" style={styles.brandSub}>Derivatives &amp; Integrals, visualized</span>
        </div>
      </div>

      {/* bar 2 — section nav */}
      <nav className="navbar" style={styles.navbar}>
        <div className="bar" style={styles.bar}>
          {["home", "limit", "flashcards", "derivative", "integral"].map((m) => (
            <button
              key={m}
              className="cl-tab"
              onClick={() => m === "home" ? setActiveTab("home") : m === "limit" ? setActiveTab("limit") : m === "flashcards" ? setActiveTab("flashcards") : openLab(m)}
              style={{ ...styles.navLink, ...(activeTab === m ? styles.navLinkActive : {}) }}
            >
              {m === "home" ? "Home" : m === "limit" ? "Limits" : m === "flashcards" ? "Flashcards" : m === "derivative" ? "Derivatives" : "Integrals"}
            </button>
          ))}
        </div>
      </nav>

      <main className="page" style={styles.page}>
        {activeTab === "home" ? (
          <HomeScreen onOpenLab={openLab} onOpenLimits={openLimits} onOpenFlashcards={openFlashcards} onSelectPreset={selectHomePreset} />
        ) : activeTab === "limit" ? (
          <LimitScreen />
        ) : activeTab === "flashcards" ? (
          <FlashcardsScreen />
        ) : <>
        <h1 style={styles.pageTitle}>
          {mode === "derivative"
            ? "Derivatives — the slope of a curve, point by point"
            : "Integrals — the area between a curve and the axis"}
        </h1>

      <div className="cl-layout" style={styles.layout}>
        {/* ---------------- LEFT: instrument ---------------- */}
        <div style={styles.leftCol}>
          <div style={styles.controlRow}>
            <div style={styles.fxWrap}>
              <span style={styles.fxLabel}>f(x) =</span>
              <input
                className="cl-input"
                value={exprInput}
                onChange={(e) => { setExprInput(e.target.value); setActivePreset(null); }}
                style={styles.fxInput}
                spellCheck={false}
              />
            </div>
          </div>

          <div style={styles.presetRow}>
            <span style={styles.presetLabel}>Try a function:</span>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                className="cl-chip"
                onClick={() => selectPreset(p)}
                style={{ ...styles.chip, ...(activePreset === p.label ? styles.chipActive : {}) }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {parseError && <div style={styles.errorBanner}>{parseError}</div>}

          {/* upper plot */}
          <div style={styles.plotFrame}>
            <div style={styles.plotTitle}>
              {mode === "derivative"
                ? (hZero
                    ? <>The <b style={styles.plotTitleWord}>definition</b>: as h → 0 the secant line becomes the tangent, at <span style={styles.plotTitleFn}>x = {fmt(cursorX)}</span></>
                    : <>Finding the <b style={styles.plotTitleWord}>derivative</b> of <span style={styles.plotTitleFn}>f(x) = {exprInput}</span></>)
                : <>Finding the <b style={styles.plotTitleWord}>integral</b> of <span style={styles.plotTitleFn}>f(x) = {exprInput}</span> from {fmt(iA)} to {fmt(iB)}</>}
            </div>
            {mode === "derivative" && (
              <div style={styles.subToggle}>
                {[["slide", "slide the point"], ["hZero", "shrink h  →  0"]].map(([k, lbl]) => (
                  <button
                    key={k}
                    className="cl-tab"
                    onClick={() => setDerivAnimAndReset(k)}
                    style={{ ...styles.subToggleBtn, ...(derivAnim === k ? styles.subToggleOn : {}) }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            )}
            <svg viewBox={`0 0 ${W} ${H}`} style={styles.svg} role="img" aria-label="Function plot">
              <Grid a={a} b={b} yLo={vLo} yHi={vHi} xToPx={xToPx} yToPx={yToPx} w={W} h={H} />
              <path d={mainPath} stroke={COLORS.curve} strokeWidth={2.5} fill="none" strokeLinecap="round" />

              {mode === "derivative" && fn && (
                <>
                  {/* shared x-guide: same x as the lower graph */}
                  <line x1={xToPx(cursorX)} x2={xToPx(cursorX)} y1={PAD.t} y2={H - PAD.b}
                    stroke={COLORS.violet} strokeWidth={1} strokeDasharray="2 4" opacity={0.32} />

                  {/* the target tangent — solid in slide mode, faint as the h→0 goal */}
                  <path d={tangentPath} stroke={COLORS.coral} strokeWidth={hZero ? 1.75 : 2.25}
                    strokeLinecap="round" opacity={hZero ? 0.4 : 1} strokeDasharray={hZero ? "5 4" : undefined} />

                  {hZero && Number.isFinite(secY) && Number.isFinite(secSlope) && (
                    <>
                      <path d={secantPath} stroke={COLORS.gold} strokeWidth={2.25} strokeLinecap="round" />
                      {/* run/rise legs of the difference quotient */}
                      <line x1={xToPx(cursorX)} y1={yToPx(cursorY)} x2={xToPx(secX)} y2={yToPx(cursorY)}
                        stroke={COLORS.gold} strokeWidth={1.4} strokeDasharray="4 3" />
                      <line x1={xToPx(secX)} y1={yToPx(cursorY)} x2={xToPx(secX)} y2={yToPx(secY)}
                        stroke={COLORS.gold} strokeWidth={1.4} strokeDasharray="4 3" />
                      <text x={(xToPx(cursorX) + xToPx(secX)) / 2} y={yToPx(cursorY) + 12}
                        fill={COLORS.gold} fontSize="8.5" textAnchor="middle" fontFamily="IBM Plex Mono, monospace">h</text>
                      <circle cx={xToPx(secX)} cy={yToPx(secY)} r={4.5} fill={COLORS.gold} stroke="#fff" strokeWidth={2} />
                    </>
                  )}

                  {!hZero && slopeRun && (
                    <g>
                      <line x1={xToPx(slopeRun.x0)} y1={yToPx(slopeRun.y0)} x2={xToPx(slopeRun.xr)} y2={yToPx(slopeRun.y0)}
                        stroke={COLORS.coral} strokeWidth={1.5} strokeDasharray="4 3" />
                      <line x1={xToPx(slopeRun.xr)} y1={yToPx(slopeRun.y0)} x2={xToPx(slopeRun.xr)} y2={yToPx(slopeRun.y0 + slopeRun.rise)}
                        stroke={COLORS.coral} strokeWidth={1.5} strokeDasharray="4 3" />
                      <text x={xToPx((slopeRun.x0 + slopeRun.xr) / 2)} y={yToPx(slopeRun.y0) + 11}
                        fill={COLORS.coral} fontSize="8.5" textAnchor="middle" fontFamily="IBM Plex Mono, monospace">run</text>
                      <text x={xToPx(slopeRun.xr) + slopeRun.dir * 4} y={yToPx(slopeRun.y0 + slopeRun.rise / 2)}
                        fill={COLORS.coral} fontSize="8.5" textAnchor={slopeRun.dir > 0 ? "start" : "end"} fontFamily="IBM Plex Mono, monospace">rise</text>
                    </g>
                  )}

                  {Number.isFinite(cursorY) && (
                    <>
                      <circle cx={xToPx(cursorX)} cy={yToPx(cursorY)} r={5.5} fill={COLORS.coral} stroke="#fff" strokeWidth={2} />
                      {!hZero && (
                        <text
                          x={xToPx(cursorX) + (cursorX > a + (b - a) * 0.72 ? -9 : 9)}
                          y={yToPx(cursorY) - 9}
                          fill={COLORS.coral} fontSize="11" fontWeight="700" fontFamily="IBM Plex Mono, monospace"
                          textAnchor={cursorX > a + (b - a) * 0.72 ? "end" : "start"}>
                          slope = {fmt(slope)}
                        </text>
                      )}
                    </>
                  )}
                </>
              )}

              {mode === "integral" && fn && (
                <>
                  {smoothMix < 1 && rectangles.map((r, i) => {
                    const xL = xToPx(r.x0), xR = xToPx(r.x1);
                    const yZero = yToPx(0), yTop = yToPx(r.h);
                    const negative = r.h < 0;
                    return (
                      <rect
                        key={i}
                        x={Math.min(xL, xR)}
                        width={Math.max(0.5, Math.abs(xR - xL) - 0.6)}
                        y={Math.min(yZero, yTop)}
                        height={Math.max(0.5, Math.abs(yTop - yZero))}
                        fill={negative ? COLORS.rose : COLORS.mint}
                        opacity={0.42 * (1 - smoothMix)}
                        stroke={negative ? COLORS.rose : COLORS.mint}
                        strokeWidth={0.9}
                      />
                    );
                  })}
                  {smoothMix > 0 && areaSegments(sample(fn, iA, iB)).map((seg, i) => (
                    <path
                      key={i}
                      d={areaPath(seg.pts, xToPx, yToPx, yToPx(0))}
                      fill={seg.sign < 0 ? COLORS.rose : COLORS.mint}
                      opacity={0.42 * smoothMix}
                      stroke="none"
                    />
                  ))}
                  {/* baseline the columns rest on — makes signed area legible */}
                  <line x1={xToPx(iA)} x2={xToPx(iB)} y1={yToPx(0)} y2={yToPx(0)} stroke={COLORS.ink} strokeWidth={1.5} opacity={0.55} />
                  <text x={W - PAD.r} y={PAD.t + 4} textAnchor="end"
                    fill={COLORS.inkDim} fontSize="12" fontWeight="700" fontFamily="IBM Plex Mono, monospace">
                    {smooth ? "exact area" : `${n} columns`}
                  </text>
                </>
              )}
            </svg>
            <div style={styles.legend}>
              {mode === "derivative" ? (
                hZero ? (
                  <>
                    <Dot c={COLORS.gold} /> secant line (slope = the difference quotient)
                    <Dot c={COLORS.coral} /> tangent — the limit as h → 0
                  </>
                ) : (
                  <>
                    <Dot c={COLORS.curve} /> f(x)
                    <Dot c={COLORS.coral} /> tangent line — its tilt is the slope
                  </>
                )
              ) : (
                <>
                  <Dot c={COLORS.mint} /> area above axis (counts +)
                  <Dot c={COLORS.rose} /> area below axis (counts −)
                </>
              )}
            </div>
            {mode === "derivative" && hZero && Number.isFinite(secSlope) && (
              <div style={styles.diffQuot}>
                <span style={styles.dqExpr}>[f(x+h) − f(x)] / h</span>
                {"  =  "}
                <b>{fmt(secY - cursorY)}</b>{" / "}<b>{fmt(hCur)}</b>
                {"  =  "}
                <b style={{ color: COLORS.gold }}>{playing ? fmt(quantize(secSlope, dyHi - dyLo)) : fmt(secSlope)}</b>
                {"   →   f′(x) = "}
                <b style={{ color: COLORS.mint }}>{fmt(slope)}</b>
              </div>
            )}
            {mode === "derivative" && !hZero && slopeStory && (
              <div style={{ ...styles.slopeStory, ...(kink ? styles.slopeStoryWarn : {}) }}>{slopeStory}</div>
            )}
          </div>

          {/* lower plot */}
          <div style={styles.plotFrame}>
            <svg viewBox={`0 0 ${W} ${H2}`} style={styles.svg} role="img" aria-label="Result plot">
              {mode === "derivative" ? (
                <>
                  <Grid a={a} b={b} yLo={dyLo} yHi={dyHi} xToPx={xToPx} yToPx={yToPx2} w={W} h={H2} />
                  <line x1={xToPx(cursorX)} x2={xToPx(cursorX)} y1={PAD.t} y2={H2 - PAD.b}
                    stroke={COLORS.violet} strokeWidth={1} strokeDasharray="2 4" opacity={0.32} />
                  <path d={derivPath} stroke={COLORS.border} strokeWidth={1.5} fill="none" opacity={0.7} />
                  {!hZero && <path d={derivTracePath} stroke={COLORS.mint} strokeWidth={2.5} fill="none" strokeLinecap="round" />}
                  {hZero && Number.isFinite(secSlope) && (
                    <circle cx={xToPx(cursorX)} cy={yToPx2(secSlope)} r={4.5} fill={COLORS.gold} stroke="#fff" strokeWidth={2} />
                  )}
                  {Number.isFinite(slope) && (
                    <>
                      <line x1={PAD.l} x2={xToPx(cursorX)} y1={yToPx2(slope)} y2={yToPx2(slope)}
                        stroke={COLORS.mint} strokeWidth={1} strokeDasharray="3 3" opacity={0.6} />
                      <circle cx={xToPx(cursorX)} cy={yToPx2(slope)} r={5} fill={COLORS.mint} stroke="#fff" strokeWidth={2} />
                      <text x={PAD.l + 4} y={yToPx2(slope) - 4}
                        fill={COLORS.mint} fontSize="9" fontWeight="700" fontFamily="IBM Plex Mono, monospace">
                        {fmt(slope)}
                      </text>
                    </>
                  )}
                </>
              ) : (
                <>
                  <Grid a={a} b={b} yLo={afLo} yHi={afHi} xToPx={xToPx} yToPx={yToPxAccum} w={W} h={H2} />
                  <path d={accumPath} stroke={COLORS.mint} strokeWidth={2.5} fill="none" strokeLinecap="round" />
                  {accumTrace.length > 0 && (
                    <circle cx={xToPx(sweepX)} cy={yToPxAccum(accumNow)} r={5} fill={COLORS.mint} stroke="#fff" strokeWidth={2} />
                  )}
                </>
              )}
            </svg>
            <div style={styles.legend}>
              <Dot c={COLORS.mint} />
              {mode === "derivative"
                ? "f′(x) — height here = the slope up top, at each x"
                : "F(x) — height here = the area filled in so far, up to each x"}
            </div>
          </div>

          {/* transport controls */}
          <div style={styles.transport}>
            <button className="cl-btn" style={styles.playBtn} onClick={playing ? handlePause : handlePlay}>
              {playing ? "❚❚ Pause" : progress >= 1 ? "↻ Replay" : "▶ Play"}
            </button>
            <button className="cl-btn" style={styles.iconBtn} onClick={handleReset}>Reset</button>
            <input
              type="range" min={0} max={1} step={0.001} value={progress}
              onChange={(e) => handleScrub(parseFloat(e.target.value))}
              style={styles.slider}
              aria-label="Scrub animation"
            />
            <div style={styles.speedGroup}>
              {[0.5, 1, 2].map((s) => (
                <button
                  key={s}
                  className="cl-chip"
                  onClick={() => setSpeed(s)}
                  style={{ ...styles.speedChip, ...(speed === s ? styles.chipActive : {}) }}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* ---------------- RIGHT: the walk-through ---------------- */}
        <aside className="cl-notes" style={styles.notes}>
          {!work ? (
            <div style={styles.workEmpty}>Type a valid function above to see it worked out.</div>
          ) : (
            <>
              <section style={styles.sec}>
                <h3 style={styles.secHead}>1 · What you're finding</h3>
                <p style={styles.secBody}><Glossed>{work.goal}</Glossed></p>
                {work.signNote && (
                  <p style={styles.signNote}>
                    <Dot c={COLORS.mint} /><Dot c={COLORS.rose} />
                    <span><Glossed>{work.signNote}</Glossed></span>
                  </p>
                )}
              </section>

              <section style={styles.sec}>
                <h3 style={styles.secHead}>2 · How to do it by hand</h3>
                {work.problem && <div style={styles.problem}>{work.problem}</div>}
                <WorkSteps steps={work.steps} />
                <div style={styles.answer}>
                  <span style={styles.answerTag}>answer</span>
                  <span style={styles.answerMath}>{work.answer}</span>
                </div>
                <div style={styles.bigIdeas}>
                  <div style={styles.bigIdeasHead}>
                    <span style={styles.bigIdeasTag}>CALCULUS I BIG IDEAS</span>
                    <span style={styles.bigIdeasHint}>keep these connections handy</span>
                  </div>
                  <div style={styles.bigIdeasGrid}>
                    {CALCULUS_I_BIG_IDEAS.map((idea) => (
                      <div key={idea.name} style={styles.bigIdea}>
                        <strong>{idea.name}</strong>
                        <span style={styles.bigIdeaFormula}>{idea.formula}</span>
                        <span>{idea.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section style={{ ...styles.sec, ...styles.sec3 }}>
                <h3 style={styles.secHead}>3 · On the graph right now</h3>
                <StatRow stats={stats} />
                <p style={styles.secNote}>
                  {mode === "derivative"
                    ? "These read the marker: x, the height f(x), and the slope f′(x) — which is the height of the dot on the lower graph and the tilt of the tangent line up top."
                    : (work.graphNote || "That's where the running-total trace on the lower graph ends up.")}
                </p>
              </section>

              <RulesToolbox mode={mode} activeKeys={activeRuleKeys} />
            </>
          )}
        </aside>
      </div>

      <footer style={styles.footer}>
        <span>Built by Alex Goode</span>
        <span style={styles.footerDot}>·</span>
        <a
          href="https://github.com/alexgoodestudio/calculus_visualizer_simulator_lab"
          target="_blank"
          rel="noopener noreferrer"
          style={styles.footerLink}
        >
          GitHub
        </a>
        <span style={styles.footerDot}>·</span>
        <span>{new Date().getFullYear()}</span>
      </footer>
      </>}
      </main>
    </div>
  );
}

function safe(fn, x) {
  try {
    const y = fn(x);
    return typeof y === "number" && Number.isFinite(y) ? y : NaN;
  } catch { return NaN; }
}

function areaPath(pts, xToPx, yToPx, zeroPx) {
  const valid = pts.filter((p) => Number.isFinite(p[1]));
  if (!valid.length) return "";
  let d = `M ${xToPx(valid[0][0]).toFixed(2)} ${zeroPx.toFixed(2)}`;
  for (const [x, y] of valid) d += ` L ${xToPx(x).toFixed(2)} ${yToPx(y).toFixed(2)}`;
  d += ` L ${xToPx(valid[valid.length - 1][0]).toFixed(2)} ${zeroPx.toFixed(2)} Z`;
  return d;
}

/* Split a sampled curve into runs of constant sign, so the filled area under
   the curve can be drawn mint above the axis and rose below it. */
function areaSegments(pts) {
  const segs = [];
  let cur = null;
  for (const [x, y] of pts) {
    if (!Number.isFinite(y)) { cur = null; continue; }
    const sign = y >= 0 ? 1 : -1;
    if (!cur || cur.sign !== sign) {
      cur = { sign, pts: [] };
      segs.push(cur);
    }
    cur.pts.push([x, y]);
  }
  return segs;
}

function Grid({ a, b, yLo, yHi, xToPx, yToPx, w, h }) {
  const xTicks = niceTicks(a, b, 6);
  const yTicks = niceTicks(yLo, yHi, 5);
  return (
    <g>
      {xTicks.map((x) => (
        <g key={"x" + x}>
          <line x1={xToPx(x)} x2={xToPx(x)} y1={PAD.t} y2={h - PAD.b} stroke={x === 0 ? COLORS.gridStrong : COLORS.grid} strokeWidth={x === 0 ? 1.25 : 1} />
          <text x={xToPx(x)} y={h - 8} fill={COLORS.inkDim} fontSize="9" textAnchor="middle" fontFamily="IBM Plex Mono, monospace">{fmt(x, 2)}</text>
        </g>
      ))}
      {yTicks.map((y) => (
        <g key={"y" + y}>
          <line x1={PAD.l} x2={w - PAD.r} y1={yToPx(y)} y2={yToPx(y)} stroke={y === 0 ? COLORS.gridStrong : COLORS.grid} strokeWidth={y === 0 ? 1.25 : 1} />
          <text x={8} y={yToPx(y) + 3} fill={COLORS.inkDim} fontSize="9" fontFamily="IBM Plex Mono, monospace">{fmt(y, 2)}</text>
        </g>
      ))}
    </g>
  );
}

function niceTicks(lo, hi, count) {
  const range = hi - lo;
  if (!Number.isFinite(range) || range <= 0) return [0];
  const step0 = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm > 5 ? 10 : norm > 2 ? 5 : norm > 1 ? 2 : 1) * mag;
  const start = Math.ceil(lo / step) * step;
  const ticks = [];
  for (let v = start; v <= hi; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

function Dot({ c }) {
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: c, marginRight: 5, marginLeft: 2, flex: "0 0 auto" }} />;
}

/* Fixed-slot readout: labels never change, only the number in each slot does,
   so the surrounding paragraph never reflows while the animation runs. */
function StatRow({ stats }) {
  return (
    <div className="statRow" style={styles.statRow}>
      {stats.map((s) => (
        <div className="statPill" key={s.label} style={styles.statPill}>
          <div style={styles.statLabel}>{s.label}</div>
          <div className="cl-stat-value" style={styles.statValue}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

function FlashcardsScreen() {
  const [category, setCategory] = useState("All");
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const categories = ["All", "Foundations", "Limits", "Derivatives", "Integrals", "Algebra", "Applications"];
  const cards = category === "All" ? FLASHCARDS : FLASHCARDS.filter((card) => card.category === category);
  const card = cards[cardIndex % cards.length];
  const move = (step) => { setCardIndex((index) => (index + step + cards.length) % cards.length); setFlipped(false); };
  const changeCategory = (next) => { setCategory(next); setCardIndex(0); setFlipped(false); };

  return (
    <section style={styles.flashcards} aria-labelledby="flashcards-title">
      <div className="flashIntro" style={styles.flashIntro}>
        <div>
          <div style={styles.homeKicker}>CALCULUS I · QUICK REVIEW</div>
          <h1 id="flashcards-title" style={styles.flashTitle}>Build the connections.</h1>
          <p style={styles.homeLead}>Recall the idea first. Flip the card when you are ready, then explain it in your own words.</p>
        </div>
        <div style={styles.flashCount}>{String(cardIndex + 1).padStart(2, "0")} <span style={styles.flashCountSub}>/ {cards.length}</span></div>
      </div>
      <div style={styles.flashToolbar}>
        <div style={styles.flashFilters} aria-label="Flashcard topics">
          {categories.map((item) => <button key={item} className="cl-chip" onClick={() => changeCategory(item)} style={{ ...styles.chip, ...(category === item ? styles.chipActive : {}) }}>{item}</button>)}
        </div>
        <span style={styles.flashHint}>Tap the card to reveal the answer</span>
      </div>
      <button className="cl-btn flashCardButton" onClick={() => setFlipped((value) => !value)} style={styles.flashCard} aria-label={flipped ? "Show question" : "Show answer"}>
        <span style={styles.flashCardTop}><span style={styles.flashCategory}>{card.category}</span><span style={styles.flashFlip}>{flipped ? "QUESTION" : "ANSWER"}</span></span>
        <span style={styles.flashCardLabel}>{flipped ? "Answer" : "Question"}</span>
        <span style={flipped ? styles.flashAnswer : styles.flashQuestion}>{flipped ? card.answer : card.prompt}</span>
        <span style={styles.flashFormula}>{card.formula}</span>
      </button>
      <div className="flashControls" style={styles.flashControls}>
        <button className="cl-btn" onClick={() => move(-1)} style={styles.flashNav}>← Previous</button>
        <button className="cl-btn" onClick={() => setFlipped((value) => !value)} style={styles.flashReveal}>{flipped ? "Show question" : "Reveal answer"}</button>
        <button className="cl-btn" onClick={() => move(1)} style={styles.flashNav}>Next →</button>
      </div>
      <div className="flashTip" style={styles.flashTip}><strong>Study move</strong><span>Before flipping, say the definition, sketch the idea, or name the rule you would use.</span></div>
    </section>
  );
}

function LimitScreen() {
  const [selected, setSelected] = useState(0);
  const [approach, setApproach] = useState(0.62);
  const [direction, setDirection] = useState("both");
  const [limitView, setLimitView] = useState("graph");
  const preset = LIMIT_PRESETS[selected];
  const [xMin, xMax] = preset.domain;
  const isInfinity = preset.kind === "infinity";
  const distance = Math.max(0.01, (xMax - xMin) * (0.18 - approach * 0.175));
  const leftX = preset.at - distance;
  const rightX = preset.at + distance;
  const x = isInfinity ? xMin + (xMax - xMin) * (0.12 + approach * 0.84) : direction === "right" ? rightX : leftX;
  const evaluate = (value) => {
    try {
      if (preset.kind === "jump") return value < 0 ? -1 : 1;
      if (preset.kind === "hole") return value === 1 ? NaN : value + 1;
      if (preset.kind === "infinite") return 1 / (value * value);
      if (preset.kind === "squeeze") return value === 0 ? NaN : value * value * Math.sin(1 / value);
      if (preset.kind === "direct") return value * value + 3 * value - 1;
      if (preset.kind === "rationalize") return value === 0 ? NaN : (Math.sqrt(value + 4) - 2) / value;
      if (preset.kind === "infinity") return (2 * value * value + 1) / (value * value - 3);
      return Math.sin(value) / value;
    } catch { return NaN; }
  };

  const yAtX = evaluate(x);
  const yAtLeft = evaluate(leftX);
  const yAtRight = evaluate(rightX);
  const W = 720, H = 330, pad = { l: 52, r: 24, t: 24, b: 42 };
  const isSqueeze = preset.kind === "squeeze";
  const yMin = preset.kind === "infinite" ? -1 : preset.kind === "jump" ? -2 : isSqueeze ? -0.12 : preset.kind === "infinity" ? 0.5 : -1.5;
  const yMax = preset.kind === "infinite" ? 14 : preset.kind === "jump" ? 2 : isSqueeze ? 0.12 : preset.kind === "infinity" ? 3.5 : 2.5;
  const xToPx = (value) => pad.l + ((value - xMin) / (xMax - xMin)) * (W - pad.l - pad.r);
  const yToPx = (value) => H - pad.b - ((value - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);
  const points = [];
  const pointCount = isSqueeze ? 1600 : 360;
  for (let i = 0; i <= pointCount; i += 1) {
    const value = xMin + (i / pointCount) * (xMax - xMin);
    const y = evaluate(value);
    const nearTarget = Math.abs(value - preset.at) < (xMax - xMin) / pointCount * 1.5;
    points.push(Number.isFinite(y) && Math.abs(y) < yMax * 0.9 && !nearTarget ? [xToPx(value), yToPx(y)] : null);
  }
  const path = points.map((point, i) => point ? `${i && points[i - 1] ? "L" : "M"} ${point[0].toFixed(2)} ${point[1].toFixed(2)}` : "").join(" ");
  const boundPoints = (bound, reverse = false) => {
    const boundPoints = [];
    for (let i = reverse ? pointCount : 0; reverse ? i >= 0 : i <= pointCount; i += reverse ? -1 : 1) {
      const value = xMin + (i / pointCount) * (xMax - xMin);
      boundPoints.push([xToPx(value), yToPx(bound(value))]);
    }
    return boundPoints;
  };
  const lowerBoundPoints = isSqueeze ? boundPoints((value) => -value * value) : [];
  const upperBoundPoints = isSqueeze ? boundPoints((value) => value * value) : [];
  const toPath = (pathPoints) => pathPoints.map(([px, py], i) => `${i ? "L" : "M"} ${px.toFixed(2)} ${py.toFixed(2)}`).join(" ");
  const lowerBoundPath = toPath(lowerBoundPoints);
  const upperBoundPath = toPath(upperBoundPoints);
  const axisForward = upperBoundPoints.map(([px]) => [px, yToPx(0)]);
  const upperSqueezeFill = toPath([...upperBoundPoints, ...axisForward.slice().reverse()]) + " Z";
  const lowerSqueezeFill = toPath([...axisForward, ...lowerBoundPoints.slice().reverse()]) + " Z";
  const leftRight = direction === "both" ? "both sides" : `${direction}-hand side`;
  const distances = [0.5, 0.1, 0.01, 0.001];
  const tableRows = distances.map((delta) => ({ delta, left: evaluate(preset.at - delta), right: evaluate(preset.at + delta) }));
  const algebra = preset.kind === "hole" ? "Factor: (x² − 1)/(x − 1) = (x − 1)(x + 1)/(x − 1), so the nearby behavior is x + 1 → 2." : preset.kind === "jump" ? "The left side approaches −1, while the right side approaches 1. Because they disagree, the two-sided limit does not exist." : preset.kind === "infinite" ? "As x gets close to 0, x² gets close to 0, so 1/x² grows without bound. The line x = 0 is a vertical asymptote." : isSqueeze ? "Since −x² ≤ x²·sin(1/x) ≤ x² and both outer functions approach 0, the Squeeze Theorem gives a limit of 0." : preset.kind === "direct" ? "Substitute x = 2: 2² + 3(2) − 1 = 9. Because the result is an ordinary number, the limit is 9." : preset.kind === "rationalize" ? "Multiply by the conjugate to turn the 0/0 form into 1/(√(x+4)+2), which approaches 1/4." : preset.kind === "infinity" ? "Divide numerator and denominator by x². The lower-degree terms fade away, leaving 2/1 = 2." : "This is a special trig limit: the graph and table show sin(x)/x approaching 1 from both sides.";
  return (
    <section style={styles.limitScreen} aria-labelledby="limit-title">
      <div className="limitIntro" style={styles.limitIntro}>
        <div>
          <div style={styles.homeKicker}>CALCULUS I · LIMITS</div>
          <h1 id="limit-title" style={styles.limitTitle}>What does f(x) approach?</h1>
          <p style={styles.homeLead}>Move x close to a and watch the function's output settle, jump, or grow without bound.</p>
        </div>
        <div style={styles.limitNotation}>x → a<br /><span style={styles.limitNotationSub}>means “near, not equal”</span></div>
      </div>
      <div style={styles.limitPresetRow}>
        {LIMIT_PRESETS.map((item, index) => (
          <button key={item.label} className="cl-chip" onClick={() => { setSelected(index); setApproach(0.62); }} style={{ ...styles.chip, ...(selected === index ? styles.chipActive : {}) }}>
            {item.name}
          </button>
        ))}
      </div>
      <div style={styles.limitToolbar}>
        <div style={styles.limitViews}>
          {[['graph', 'Graph'], ['table', 'Table'], ['algebra', 'Algebra']].map(([key, label]) => (
            <button key={key} className="cl-tab" onClick={() => setLimitView(key)} style={{ ...styles.limitViewButton, ...(limitView === key ? styles.limitViewActive : {}) }}>{label}</button>
          ))}
        </div>
        <div style={styles.directionGroup}>
          <span style={styles.directionLabel}>Approach from</span>
          {[['left', 'left'], ['both', 'both'], ['right', 'right']].map(([key, label]) => (
            <button key={key} className="cl-chip" onClick={() => setDirection(key)} style={{ ...styles.directionButton, ...(direction === key ? styles.chipActive : {}) }}>{label}</button>
          ))}
        </div>
      </div>
      <div className="limitLayout" style={styles.limitLayout}>
        <div style={styles.limitPlotFrame}>
          <div style={styles.plotTitle}><b style={styles.plotTitleWord}>{preset.name}</b> · {preset.expr}{isSqueeze && <div style={styles.squeezeLegend}><span style={{ color: COLORS.mint }}>— x² upper bound</span><span style={{ color: COLORS.coral }}>— middle function</span><span style={{ color: COLORS.rose }}>— −x² lower bound</span></div>}</div>
          {limitView === "graph" && <svg viewBox={`0 0 ${W} ${H}`} style={styles.svg} role="img" aria-label={`Graph of ${preset.expr} as x approaches ${preset.at}`}>
            <line x1={pad.l} x2={W - pad.r} y1={yToPx(0)} y2={yToPx(0)} stroke={COLORS.gridStrong} />
            <line x1={xToPx(0)} x2={xToPx(0)} y1={pad.t} y2={H - pad.b} stroke={COLORS.gridStrong} />
            {isSqueeze && <>
              <path d={upperSqueezeFill} fill="#FFF4D9" opacity="0.62" stroke="none" />
              <path d={lowerSqueezeFill} fill="#FFF4D9" opacity="0.62" stroke="none" />
              <path d={lowerBoundPath} stroke={COLORS.rose} strokeWidth="2" fill="none" strokeDasharray="5 4" />
              <path d={upperBoundPath} stroke={COLORS.mint} strokeWidth="2" fill="none" strokeDasharray="5 4" />
              <text x={xToPx(-0.27)} y={yToPx(-0.27 * 0.27) + 15} fill={COLORS.rose} fontSize="11" fontFamily="IBM Plex Mono, monospace">−x²</text>
              <text x={xToPx(-0.27)} y={yToPx(0.27 * 0.27) - 6} fill={COLORS.mint} fontSize="11" fontFamily="IBM Plex Mono, monospace">x²</text>
            </>}
            <path d={path} stroke={isSqueeze ? COLORS.coral : COLORS.curve} strokeWidth={isSqueeze ? "3" : "2.5"} fill="none" strokeLinecap="round" />
            {!isInfinity && <line x1={xToPx(preset.at)} x2={xToPx(preset.at)} y1={pad.t} y2={H - pad.b} stroke={COLORS.violet} strokeDasharray="4 5" opacity="0.4" />}
            {isInfinity ? (
              <><line x1={pad.l} x2={W - pad.r} y1={yToPx(2)} y2={yToPx(2)} stroke={COLORS.violet} strokeDasharray="5 4" opacity="0.7" /><text x={W - pad.r - 6} y={yToPx(2) - 8} textAnchor="end" fill={COLORS.violet} fontSize="11" fontWeight="700" fontFamily="IBM Plex Mono, monospace">horizontal asymptote y = 2</text></>
            ) : preset.kind === "infinite" ? (
              <text x={xToPx(preset.at) + 8} y={pad.t + 14} fill={COLORS.violet} fontSize="11" fontWeight="700" fontFamily="IBM Plex Mono, monospace">vertical asymptote</text>
            ) : (
              <circle cx={xToPx(preset.at)} cy={yToPx(Number(preset.limit) || 0)} r="6" fill={COLORS.card} stroke={COLORS.coral} strokeWidth="2.5" />
            )}
            {direction === "both" ? (
              <>
                {Number.isFinite(yAtLeft) && <><line x1={xToPx(leftX)} x2={xToPx(leftX)} y1={yToPx(0)} y2={yToPx(yAtLeft)} stroke={COLORS.coral} strokeDasharray="3 3" /><circle cx={xToPx(leftX)} cy={yToPx(yAtLeft)} r="6" fill={COLORS.coral} stroke="#fff" strokeWidth="2" /></>}
                {Number.isFinite(yAtRight) && <><line x1={xToPx(rightX)} x2={xToPx(rightX)} y1={yToPx(0)} y2={yToPx(yAtRight)} stroke={COLORS.gold} strokeDasharray="3 3" /><circle cx={xToPx(rightX)} cy={yToPx(yAtRight)} r="6" fill={COLORS.gold} stroke="#fff" strokeWidth="2" /></>}
              </>
            ) : Number.isFinite(yAtX) && <><line x1={xToPx(x)} x2={xToPx(x)} y1={yToPx(0)} y2={yToPx(yAtX)} stroke={COLORS.gold} strokeDasharray="3 3" /><circle cx={xToPx(x)} cy={yToPx(yAtX)} r="6" fill={COLORS.gold} stroke="#fff" strokeWidth="2" /></>}
            <text x={isInfinity ? W - pad.r : xToPx(preset.at)} y={H - 12} textAnchor={isInfinity ? "end" : "middle"} fill={COLORS.violet} fontSize="11" fontFamily="IBM Plex Mono, monospace">{isInfinity ? "x → ∞" : `a = ${preset.at}`}</text>
          </svg>}
          {limitView === "table" && (
            <div className="limitTableWrap" style={styles.limitTableWrap}>
              <p style={styles.tableIntro}>Read down the columns: as the distance from <b>a</b> shrinks, do the left and right values settle on the same number?</p>
              <table className="limitTable" style={styles.limitTable}><thead><tr><th>|x − a|</th><th>x from left</th><th>x from right</th></tr></thead><tbody>{tableRows.map((row) => <tr key={row.delta}><td>{row.delta}</td><td>{Number.isFinite(row.left) ? row.left.toFixed(4) : "undefined"}</td><td>{Number.isFinite(row.right) ? row.right.toFixed(4) : "undefined"}</td></tr>)}</tbody></table>
            </div>
          )}
          {limitView === "algebra" && <div style={styles.algebraView}><span style={styles.answerTag}>why this works</span><p>{algebra}</p><div style={styles.algebraRule}>{preset.kind === "hole" ? "0/0 after substitution → factor and cancel" : preset.kind === "jump" ? "left limit ≠ right limit → DNE" : isSqueeze ? "bounded between two limits → squeeze" : preset.kind === "infinite" ? "denominator → 0 → vertical asymptote" : preset.kind === "direct" ? "ordinary number after substitution → done" : preset.kind === "rationalize" ? "0/0 → multiply by the conjugate" : preset.kind === "infinity" ? "divide by the highest power of x" : "special trig limit → 1"}</div></div>}
          <div style={styles.limitSliderLabel}><span>{direction === "both" ? `x = ${leftX.toFixed(3)} and ${rightX.toFixed(3)}` : `x = ${x.toFixed(3)}`}</span><span>approaching from the {leftRight}</span></div>
          <input type="range" min="0" max="1" step="0.001" value={approach} onChange={(event) => setApproach(Number(event.target.value))} style={styles.slider} aria-label="Move x toward a" />
        </div>
        <aside style={styles.limitAnswer}>
          <span style={styles.answerTag}>{isSqueeze ? "the theorem" : "read the graph"}</span>
          <div style={styles.limitEquation}>lim <i>x→{preset.at}</i> f(x) = <strong>{preset.limit}</strong></div>
          <p style={styles.limitNote}>{preset.note}</p>
          {isSqueeze ? (
            <div style={styles.squeezeProof}><strong>Follow the trap</strong><span style={styles.squeezeProofSpan}>−x² ≤ x²·sin(1/x) ≤ x²</span><span>Both outside curves approach 0.</span><b>So the middle curve must approach 0.</b></div>
          ) : (
            <div style={styles.limitCheck}><strong>Continuity check</strong><span>For continuity at a, the limit and the function value must agree.</span><span style={{ color: preset.value === preset.limit ? COLORS.mint : COLORS.coral, fontWeight: 700 }}>{preset.value === preset.limit ? "continuous here" : "not continuous here"}</span></div>
          )}
        </aside>
      </div>
      <div style={styles.limitBridge}><span style={styles.bridgeArrow}>→</span><span><strong>Next idea:</strong> when this same approach happens to a secant slope, it becomes the derivative. Open <b>Derivatives</b> to see that motion.</span></div>
    </section>
  );
}

function HomeScreen({ onOpenLab, onOpenLimits, onOpenFlashcards, onSelectPreset }) {
  const starters = [
    { title: "Read a limit", text: "Compare the graph and table as x approaches a.", mode: "limit", accent: COLORS.blue },
    { title: "See a tangent line", text: "Watch the slope change as a point travels along x².", mode: "derivative", preset: PRESETS.find((p) => p.label === "x²") },
    { title: "Build an area", text: "Turn rectangles into an exact integral for x².", mode: "integral", preset: PRESETS.find((p) => p.label === "x²") },
    { title: "Review a key idea", text: "Practice the definitions, rules, and formulas that connect the topics.", mode: "flashcards" },
  ];

  return (
    <section style={styles.home} aria-labelledby="home-title">
      <div style={styles.homeIntro}>
        <div>
          <div style={styles.homeKicker}>YOUR VISUAL CALCULUS DESK</div>
          <h1 id="home-title" style={styles.homeTitle}>Make calculus move.</h1>
          <p style={styles.homeLead}>See derivatives as changing slope and integrals as accumulated area, one small step at a time.</p>
        </div>
        <div style={styles.homeFormula} aria-hidden="true"><span>f′(x)</span><b>↔</b><span>∫ f(x) dx</span></div>
      </div>
      <div style={styles.homeSectionHead}>
        <h2 style={styles.homeHeading}>Start with a guided experiment</h2>
        <span style={styles.homeHint}>Pick a path, then press play</span>
      </div>
      <div style={styles.starterGrid}>
        {starters.map((starter, index) => (
          <button key={starter.title} className="cl-btn homeStarter" onClick={() => starter.mode === "limit" ? onOpenLimits() : starter.mode === "flashcards" ? onOpenFlashcards() : onSelectPreset(starter.preset, starter.mode)} style={styles.starterCard}>
            <span style={styles.starterNumber}>{String(index + 1).padStart(2, "0")}</span>
            <span style={styles.starterTitle}>{starter.title}</span>
            <span style={styles.starterText}>{starter.text}</span>
            <span style={styles.starterAction}>Open {starter.mode === "limit" ? "limits" : starter.mode === "flashcards" ? "flashcards" : starter.mode} <span aria-hidden="true">→</span></span>
          </button>
        ))}
      </div>
      <div style={styles.homeLowerGrid}>
        <div style={styles.homeBand}>
          <div style={styles.bandNumber}>01</div>
          <div><h2 style={styles.homeHeading}>Limits</h2><p style={styles.homeBody}>Read what a function approaches, then connect that motion to the derivative.</p></div>
          <button className="cl-btn" onClick={onOpenLimits} style={{ ...styles.textButton, color: COLORS.blue }}>Explore limits →</button>
        </div>
        <div style={styles.homeBand}>
          <div style={styles.bandNumber}>02</div>
          <div><h2 style={styles.homeHeading}>Derivatives</h2><p style={styles.homeBody}>Follow the tangent, secant, and difference quotient until the idea clicks.</p></div>
          <button className="cl-btn" onClick={() => onOpenLab("derivative")} style={styles.textButton}>Explore slopes →</button>
        </div>
        <div style={styles.homeBand}>
          <div style={{ ...styles.bandNumber, color: COLORS.mint }}>03</div>
          <div><h2 style={styles.homeHeading}>Integrals</h2><p style={styles.homeBody}>Refine the rectangles and watch an estimate become accumulated area.</p></div>
          <button className="cl-btn" onClick={() => onOpenLab("integral")} style={{ ...styles.textButton, color: COLORS.mint }}>Explore area →</button>
        </div>
      </div>
      <div style={styles.homeRoadmap}>
        <div style={styles.homeSectionHead}>
          <h2 style={styles.homeHeading}>The Calculus I path</h2>
          <span style={styles.homeHint}>Concept first, computation second</span>
        </div>
        <div style={styles.roadmapGrid}>
          {["Limits & continuity", "Derivatives", "Applications", "Integrals & FTC"].map((step, index) => (
            <div key={step} style={styles.roadmapStep}>
              <span style={styles.roadmapNumber}>{String(index + 1).padStart(2, "0")}</span>
              <span style={styles.roadmapLabel}>{step}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const styles = {
  app: {
    fontFamily: "'Inter', system-ui, sans-serif",
    background: COLORS.ground,
    color: COLORS.ink,
    minHeight: "100vh",
    textAlign: "left",
  },
  home: { paddingTop: 18 },
  homeIntro: { display: "flex", justifyContent: "space-between", gap: 32, alignItems: "flex-end", padding: "38px 0 42px", borderBottom: `1px solid ${COLORS.border}` },
  homeKicker: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: "0.12em", color: COLORS.coral, fontWeight: 600, marginBottom: 10 },
  homeTitle: { fontFamily: "'Poppins', sans-serif", fontSize: 42, lineHeight: 1.1, margin: 0, color: COLORS.ink },
  homeLead: { maxWidth: 560, marginTop: 12, fontSize: 16, lineHeight: 1.6, color: COLORS.inkDim },
  homeFormula: { display: "flex", gap: 16, alignItems: "center", color: COLORS.violet, fontFamily: "'IBM Plex Mono', monospace", fontSize: 21, whiteSpace: "nowrap" },
  homeSectionHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, margin: "28px 0 12px" },
  homeHeading: { fontFamily: "'Poppins', sans-serif", fontSize: 16, fontWeight: 700, margin: 0, color: COLORS.ink },
  homeHint: { fontSize: 12, color: COLORS.inkDim },
  starterGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 },
  starterCard: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 9, minHeight: 166, textAlign: "left", background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 18, boxShadow: COLORS.cardShadow, cursor: "pointer" },
  starterNumber: { color: COLORS.blue, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em" },
  starterTitle: { fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 15, color: COLORS.ink },
  starterText: { fontSize: 13, lineHeight: 1.5, color: COLORS.inkDim },
  starterAction: { marginTop: "auto", color: COLORS.violet, fontSize: 12, fontWeight: 700 },
  homeLowerGrid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 30 },
  homeBand: { display: "grid", gridTemplateColumns: "38px 1fr", gap: 12, alignItems: "start", padding: "18px 0", borderTop: `2px solid ${COLORS.ink}` },
  bandNumber: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700, color: COLORS.coral },
  homeBody: { fontSize: 13, lineHeight: 1.5, color: COLORS.inkDim, margin: "6px 0 12px" },
  textButton: { gridColumn: "2", justifySelf: "start", border: "none", padding: 0, background: "transparent", color: COLORS.coral, fontWeight: 700, fontSize: 12, cursor: "pointer" },
  limitScreen: { paddingTop: 18 },
  flashcards: { paddingTop: 18, maxWidth: 900, margin: "0 auto" },
  flashIntro: { display: "flex", justifyContent: "space-between", gap: 24, alignItems: "flex-end", padding: "32px 0 28px", borderBottom: `1px solid ${COLORS.border}` },
  flashTitle: { fontFamily: "'Poppins', sans-serif", fontSize: 32, lineHeight: 1.15, margin: 0, color: COLORS.ink },
  flashCount: { color: COLORS.violet, fontFamily: "'IBM Plex Mono', monospace", fontSize: 28, fontWeight: 600, whiteSpace: "nowrap" },
  flashCountSub: { color: COLORS.inkDim, fontSize: 14, fontWeight: 400 },
  flashToolbar: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", margin: "20px 0 14px" },
  flashFilters: { display: "flex", gap: 6, flexWrap: "wrap" },
  flashHint: { color: COLORS.inkDim, fontSize: 12 },
  flashCard: { display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "space-between", width: "100%", minHeight: 350, padding: "24px clamp(20px, 5vw, 52px)", background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, boxShadow: "0 10px 28px rgba(18,58,94,0.1)", cursor: "pointer", textAlign: "left" },
  flashCardTop: { display: "flex", justifyContent: "space-between", width: "100%", gap: 12, alignItems: "center" },
  flashCategory: { color: COLORS.coral, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" },
  flashFlip: { color: COLORS.inkDim, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: "0.08em" },
  flashCardLabel: { color: COLORS.violet, fontFamily: "'Poppins', sans-serif", fontSize: 13, fontWeight: 700 },
  flashQuestion: { color: COLORS.ink, fontFamily: "'Poppins', sans-serif", fontSize: 25, lineHeight: 1.35, maxWidth: 720 },
  flashAnswer: { color: COLORS.ink, fontSize: 17, lineHeight: 1.65, maxWidth: 720 },
  flashFormula: { color: COLORS.curve, fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600, paddingTop: 16, borderTop: `1px solid ${COLORS.border}`, width: "100%" },
  flashControls: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 14, width: "100%" },
  flashNav: { background: "transparent", border: "none", color: COLORS.violet, padding: "8px 0", fontFamily: "'Poppins', sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  flashReveal: { background: COLORS.violet, color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontFamily: "'Poppins', sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(24,99,176,0.25)" },
  flashTip: { display: "flex", gap: 10, alignItems: "baseline", marginTop: 22, paddingTop: 14, borderTop: `1px solid ${COLORS.border}`, color: COLORS.inkDim, fontSize: 12, lineHeight: 1.5 },
  limitIntro: { display: "flex", justifyContent: "space-between", gap: 32, alignItems: "flex-end", padding: "32px 0 28px", borderBottom: `1px solid ${COLORS.border}` },
  limitTitle: { fontFamily: "'Poppins', sans-serif", fontSize: 30, lineHeight: 1.15, margin: 0, color: COLORS.ink },
  squeezeLegend: { display: "flex", flexWrap: "wrap", gap: "4px 14px", color: COLORS.inkDim, fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600, marginTop: 6 },
  limitNotation: { color: COLORS.violet, fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, textAlign: "right", lineHeight: 1.4, whiteSpace: "nowrap" },
  limitNotationSub: { color: COLORS.inkDim, fontFamily: "'Inter', sans-serif", fontSize: 11 },
  limitPresetRow: { display: "flex", gap: 7, flexWrap: "wrap", margin: "18px 0 14px" },
  limitToolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 },
  limitViews: { display: "flex", gap: 3, padding: 3, background: COLORS.chipBg, border: `1px solid ${COLORS.border}`, borderRadius: 9 },
  limitViewButton: { border: "none", background: "transparent", color: COLORS.inkDim, fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 11.5, padding: "6px 12px", borderRadius: 7, cursor: "pointer" },
  limitViewActive: { background: COLORS.card, color: COLORS.violet, boxShadow: "0 1px 3px rgba(18,58,94,0.12)" },
  directionGroup: { display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" },
  directionLabel: { color: COLORS.inkDim, fontSize: 11.5, marginRight: 2 },
  directionButton: { padding: "5px 9px", fontSize: 11, borderRadius: 7 },
  limitLayout: { display: "grid", gridTemplateColumns: "minmax(0, 1.65fr) minmax(260px, 0.75fr)", gap: 14, alignItems: "stretch" },
  limitPlotFrame: { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: "12px 12px 14px", boxShadow: COLORS.cardShadow, overflow: "hidden" },
  limitSliderLabel: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, color: COLORS.inkDim, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, margin: "6px 2px 8px", flexWrap: "wrap" },
  limitTableWrap: { minHeight: 330, padding: "18px 8px" },
  tableIntro: { color: COLORS.inkDim, fontSize: 13, lineHeight: 1.5, margin: "0 0 18px" },
  limitTable: { width: "100%", borderCollapse: "collapse", color: COLORS.ink, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 },
  algebraView: { minHeight: 330, padding: "28px 18px", color: COLORS.ink, fontSize: 14, lineHeight: 1.65 },
  algebraRule: { marginTop: 20, padding: "10px 12px", background: COLORS.chipBg, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.violet, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 },
  limitAnswer: { background: "#EEF3FF", border: `1px solid ${COLORS.blue}`, borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 13 },
  limitEquation: { color: COLORS.ink, fontFamily: "'IBM Plex Mono', monospace", fontSize: 19, lineHeight: 1.5 },
  limitNote: { color: COLORS.ink, fontSize: 13, lineHeight: 1.55, margin: 0 },
  limitCheck: { borderTop: `1px solid ${COLORS.blue}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 5, color: COLORS.inkDim, fontSize: 12, lineHeight: 1.45 },
  squeezeProof: { borderTop: `1px solid ${COLORS.blue}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 7, color: COLORS.inkDim, fontSize: 12, lineHeight: 1.45 },
  squeezeProofSpan: { fontFamily: "'IBM Plex Mono', monospace", color: COLORS.curve },
  limitBridge: { display: "flex", gap: 9, alignItems: "flex-start", marginTop: 14, background: "#FFF8EC", border: `1px solid ${COLORS.gold}`, borderRadius: 12, padding: "11px 13px", color: COLORS.ink, fontSize: 12.5, lineHeight: 1.5 },
  homeRoadmap: { marginTop: 22, paddingTop: 4 },
  roadmapGrid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 },
  roadmapStep: { display: "flex", flexDirection: "column", gap: 8, borderTop: `1px solid ${COLORS.border}`, paddingTop: 10 },
  roadmapNumber: { color: COLORS.violet, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700 },
  roadmapLabel: { color: COLORS.ink, fontFamily: "'Poppins', sans-serif", fontSize: 12, fontWeight: 600 },
  bigIdeas: { marginTop: 12, padding: "11px 12px 12px", background: "#EEF3FF", border: `1px solid ${COLORS.blue}`, borderRadius: 12 },
  bigIdeasHead: { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", marginBottom: 9 },
  bigIdeasTag: { color: COLORS.blue, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em" },
  bigIdeasHint: { color: COLORS.inkDim, fontSize: 10 },
  bigIdeasGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  bigIdea: { display: "flex", flexDirection: "column", gap: 3, color: COLORS.ink, fontSize: 10.5, lineHeight: 1.4 },
  bigIdeaFormula: { color: COLORS.curve, fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, fontWeight: 600 },
  topbar: {
    background: COLORS.card,
    borderBottom: `1px solid ${COLORS.border}`,
  },
  navbar: {
    background: COLORS.navy,
  },
  bar: {
    maxWidth: 1220,
    margin: "0 auto",
    padding: "0 clamp(16px, 4vw, 48px)",
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  brandMark: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 18, fontWeight: 600, color: COLORS.violet,
    padding: "12px 0",
  },
  brand: {
    fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 18,
    color: COLORS.ink, letterSpacing: "-0.01em", padding: "12px 0",
  },
  brandDiv: { color: COLORS.border, fontSize: 18 },
  brandSub: {
    fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: COLORS.inkDim,
  },
  navLink: {
    background: "transparent", border: "none", cursor: "pointer",
    fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 13.5,
    color: "rgba(255,255,255,0.72)", padding: "13px 16px",
    borderBottom: "3px solid transparent",
  },
  navLinkActive: {
    color: "#fff", background: COLORS.navyDeep,
    borderBottomColor: "#fff",
  },
  page: {
    maxWidth: 1220, margin: "0 auto",
    padding: "18px clamp(16px, 4vw, 48px) 56px",
  },
  pageTitle: {
    fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 24,
    margin: "6px 0 20px", color: COLORS.ink, letterSpacing: "-0.01em",
    lineHeight: 1.25,
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 720px) minmax(320px, 460px)",
    gap: 24,
    alignItems: "start",
    maxWidth: 1220,
  },
  leftCol: { display: "flex", flexDirection: "column", gap: 12, minWidth: 0 },
  controlRow: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" },
  fxWrap: {
    display: "flex", alignItems: "center", gap: 8,
    background: COLORS.card, border: `1px solid ${COLORS.border}`,
    borderRadius: 12, padding: "8px 12px", flex: "1 1 220px",
    boxShadow: COLORS.cardShadow,
  },
  fxLabel: { fontFamily: "'IBM Plex Mono', monospace", color: COLORS.inkDim, fontSize: 14 },
  fxInput: {
    background: "transparent", border: "none", outline: "none",
    color: COLORS.violet, fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 15, flex: 1, minWidth: 0, fontWeight: 600,
  },
  tabs: { display: "flex", gap: 6, background: COLORS.card, borderRadius: 12, padding: 4, border: `1px solid ${COLORS.border}`, boxShadow: COLORS.cardShadow },
  tab: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 1,
    background: "transparent", border: "none", color: COLORS.inkDim,
    fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 13,
    padding: "6px 16px", borderRadius: 8, cursor: "pointer", lineHeight: 1.15,
  },
  tabSub: { fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: 9.5, opacity: 0.75, textTransform: "lowercase" },
  tabActive: { background: COLORS.violet, color: "#fff" },
  presetRow: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
  presetLabel: { fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.inkDim, marginRight: 2 },
  chip: {
    background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.inkDim,
    borderRadius: 8, padding: "6px 11px", fontSize: 12.5,
    fontFamily: "'IBM Plex Mono', monospace", cursor: "pointer",
  },
  chipActive: { background: "#EFE9FF", color: COLORS.violet, borderColor: COLORS.violet, fontWeight: 600 },
  errorBanner: {
    background: "#FDECEA", border: `1px solid ${COLORS.rose}`,
    color: "#B3423E", borderRadius: 10, padding: "9px 13px", fontSize: 13,
  },
  plotFrame: {
    background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 16,
    padding: "12px 12px 8px", boxShadow: COLORS.cardShadow,
  },
  svg: { width: "100%", height: "auto", display: "block" },
  plotTitle: {
    fontFamily: "'Poppins', sans-serif", fontSize: 13, color: COLORS.inkDim,
    marginBottom: 8, paddingLeft: 2, fontWeight: 500,
  },
  plotTitleWord: { color: COLORS.violet, fontWeight: 700 },
  plotTitleFn: { fontFamily: "'IBM Plex Mono', monospace", color: COLORS.ink, fontWeight: 600 },
  plotCaption: {
    fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.inkDim,
    marginTop: 6, paddingLeft: 4,
  },
  legend: {
    display: "flex", alignItems: "center", flexWrap: "wrap", gap: "2px 10px",
    fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: COLORS.inkDim,
    marginTop: 7, paddingLeft: 2, lineHeight: 1.4,
  },
  slopeStory: {
    marginTop: 6, marginLeft: 2, padding: "5px 9px", borderRadius: 8,
    background: "#FFF1EC", color: "#B4502F", fontFamily: "'Inter', sans-serif",
    fontSize: 12, fontWeight: 600, minHeight: 22, lineHeight: 1.45,
  },
  slopeStoryWarn: { background: "#FDECEC", color: "#B3423E", border: `1px solid ${COLORS.rose}` },
  subToggle: {
    display: "flex", gap: 4, marginBottom: 8, background: COLORS.chipBg,
    border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 3, width: "fit-content",
  },
  subToggleBtn: {
    background: "transparent", border: "none", cursor: "pointer",
    fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 11.5,
    color: COLORS.inkDim, padding: "5px 11px", borderRadius: 7,
  },
  subToggleOn: { background: COLORS.card, color: COLORS.violet, boxShadow: "0 1px 3px rgba(18,58,94,0.12)" },
  diffQuot: {
    marginTop: 7, marginLeft: 2, padding: "7px 10px", borderRadius: 8,
    background: "#FFF8EC", border: `1px solid ${COLORS.gold}`,
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: COLORS.ink,
    lineHeight: 1.6, wordBreak: "break-word",
  },
  dqExpr: { color: COLORS.inkDim },
  bridge: {
    display: "flex", alignItems: "flex-start", gap: 8,
    background: "#EEF3FF", border: `1px solid ${COLORS.blue}`, borderRadius: 12,
    padding: "10px 12px", fontFamily: "'Inter', sans-serif", fontSize: 12.5,
    lineHeight: 1.45, color: COLORS.ink, fontWeight: 500,
  },
  bridgeArrow: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, color: COLORS.blue,
    fontWeight: 700, lineHeight: 1,
  },
  transport: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 4 },
  playBtn: {
    background: COLORS.violet, color: "#fff", border: "none", fontWeight: 700,
    fontFamily: "'Poppins', sans-serif", borderRadius: 10, padding: "9px 18px",
    fontSize: 13.5, cursor: "pointer", boxShadow: "0 4px 12px rgba(124,92,252,0.35)",
  },
  iconBtn: {
    background: COLORS.card, color: COLORS.ink, border: `1px solid ${COLORS.border}`,
    borderRadius: 10, padding: "9px 15px", fontSize: 13, cursor: "pointer",
    fontFamily: "'Poppins', sans-serif", fontWeight: 500,
  },
  slider: { flex: 1, minWidth: 100 },
  speedGroup: { display: "flex", gap: 4 },
  speedChip: {
    background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.inkDim,
    borderRadius: 8, padding: "7px 10px", fontSize: 12, cursor: "pointer",
    fontFamily: "'IBM Plex Mono', monospace",
  },
  toolbox: {
    background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14,
    boxShadow: COLORS.cardShadow, overflow: "hidden",
  },
  toolboxHead: {
    display: "flex", alignItems: "baseline", gap: 8, width: "100%",
    background: "transparent", border: "none", cursor: "pointer",
    padding: "11px 14px", textAlign: "left", flexWrap: "wrap",
  },
  toolboxChevron: { color: COLORS.violet, fontSize: 11, fontWeight: 700 },
  toolboxTitle: { fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13, color: COLORS.ink },
  toolboxUsing: { fontFamily: "'Inter', sans-serif", fontSize: 11.5, color: COLORS.inkDim },
  toolboxGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
    gap: 8, padding: "2px 12px 12px",
  },
  ruleCard: {
    border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "9px 11px",
    background: COLORS.chipBg,
  },
  ruleCardOn: { borderColor: COLORS.violet, background: "#F3EEFF", boxShadow: `0 0 0 1px ${COLORS.violet}` },
  ruleCardTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 4 },
  ruleName: { fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 12.5, color: COLORS.ink },
  ruleBadge: {
    fontFamily: "'Inter', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
    textTransform: "uppercase", color: "#fff", background: COLORS.violet,
    borderRadius: 5, padding: "2px 5px", whiteSpace: "nowrap",
  },
  ruleFormula: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: COLORS.curve,
    lineHeight: 1.5, wordBreak: "break-word", marginBottom: 4,
  },
  ruleWhen: { fontFamily: "'Inter', sans-serif", fontSize: 11, color: COLORS.ink, lineHeight: 1.45, marginBottom: 3 },
  ruleEg: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: COLORS.inkDim, lineHeight: 1.4, wordBreak: "break-word" },
  notes: {
    background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 18,
    padding: 18, display: "flex", flexDirection: "column", gap: 16,
    position: "sticky", top: 12, boxShadow: COLORS.cardShadow,
  },
  notesEyebrow: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, letterSpacing: "0.1em",
    color: COLORS.inkDim, fontWeight: 600,
  },
  noteBlock: { borderLeft: "3px solid", paddingLeft: 13 },
  noteLabel: {
    fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 11.5,
    textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6,
  },
  noteBody: { fontSize: 13.5, lineHeight: 1.6, color: COLORS.ink },
  conceptTitle: { fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 14.5, marginBottom: 4, color: COLORS.violet },
  mono: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: "#B8791A", wordBreak: "break-word" },
  statRow: { display: "flex", gap: 8, marginTop: 4, flexWrap: "nowrap" },
  statPill: {
    background: COLORS.chipBg, borderRadius: 10, padding: "6px 6px",
    flex: "1 1 0", minWidth: 0, textAlign: "center", border: `1px solid ${COLORS.border}`,
    overflow: "hidden",
  },
  statLabel: { fontSize: 9.5, color: COLORS.inkDim, fontFamily: "'Inter', sans-serif", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  statValue: {
    fontSize: 14, color: COLORS.ink, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600,
    fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
  },

  sec: { display: "flex", flexDirection: "column", gap: 9 },
  sec3: { minHeight: 132 },
  problem: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 14, fontWeight: 600,
    color: COLORS.ink, background: COLORS.chipBg, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: "9px 12px", wordBreak: "break-word", letterSpacing: "0.01em",
  },
  secHead: {
    fontFamily: "'Poppins', sans-serif", fontWeight: 700, fontSize: 13.5,
    color: COLORS.violet, margin: 0, letterSpacing: "-0.01em",
  },
  secBody: { fontSize: 13.5, lineHeight: 1.55, color: COLORS.ink, margin: 0 },
  secNote: { fontSize: 12, lineHeight: 1.5, color: COLORS.inkDim, margin: 0 },
  signNote: {
    display: "flex", alignItems: "flex-start", gap: 2, flexWrap: "wrap",
    fontSize: 12.5, lineHeight: 1.5, color: COLORS.ink, margin: 0,
    background: COLORS.chipBg, border: `1px solid ${COLORS.border}`,
    borderRadius: 8, padding: "8px 10px",
  },
  liveVal: { fontFamily: "'IBM Plex Mono', monospace", color: COLORS.coral, fontWeight: 700 },

  wSteps: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 13 },
  wStep: { position: "relative", paddingLeft: 26, fontSize: 13, lineHeight: 1.5 },
  wStepNum: {
    position: "absolute", left: 0, top: 1, width: 17, height: 17, borderRadius: "50%",
    background: COLORS.violet, color: "#fff", fontSize: 10, fontWeight: 700,
    fontFamily: "'Inter', sans-serif", display: "flex", alignItems: "center", justifyContent: "center",
  },
  wStepText: { color: COLORS.ink },
  wStepMath: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: COLORS.curve,
    background: COLORS.chipBg, border: `1px solid ${COLORS.border}`, borderRadius: 8,
    padding: "6px 9px", marginTop: 5, whiteSpace: "pre-line", overflowX: "auto",
  },
  answer: {
    display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
    marginTop: 12, padding: "9px 12px", borderRadius: 10,
    background: "#EEF3FF", border: `1px solid ${COLORS.blue}`,
  },
  answerTag: {
    fontFamily: "'Inter', sans-serif", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em",
    textTransform: "uppercase", color: "#fff", background: COLORS.blue,
    borderRadius: 5, padding: "2px 6px",
  },
  answerMath: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 13.5, fontWeight: 700, color: COLORS.ink, wordBreak: "break-word" },
  ruleChip: {
    display: "inline-flex", alignItems: "center", gap: 3, marginTop: 6,
    fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 600,
  },
  ruleChipMark: { color: COLORS.violet, fontSize: 9 },

  work: { display: "flex", flexDirection: "column", gap: 8 },
  workEmpty: { fontSize: 13, color: COLORS.inkDim, lineHeight: 1.55 },
  workProblem: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600,
    color: COLORS.ink, wordBreak: "break-word",
  },
  workApproach: { fontSize: 12.5, lineHeight: 1.55, color: COLORS.inkDim },
  workSteps: {
    listStyle: "decimal", paddingLeft: 18, margin: "2px 0",
    display: "flex", flexDirection: "column", gap: 8,
  },
  workStep: { fontSize: 12.5, lineHeight: 1.5 },
  workStepMath: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: COLORS.ink, wordBreak: "break-word" },
  workArrow: { color: COLORS.inkDim, margin: "0 5px" },
  workStepRule: { fontSize: 10.5, color: COLORS.inkDim, marginTop: 2 },
  workCombine: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, fontWeight: 600,
    color: COLORS.blue, marginTop: 2, paddingTop: 7, borderTop: `1px solid ${COLORS.border}`,
    wordBreak: "break-word",
  },
  workEval: { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, color: COLORS.ink, wordBreak: "break-word" },
  workFallback: { fontSize: 12.5, lineHeight: 1.55, color: COLORS.inkDim },
  workLive: {
    fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: COLORS.mint,
    background: COLORS.chipBg, borderRadius: 8, padding: "6px 9px", marginTop: 2,
    wordBreak: "break-word",
  },

  footer: {
    marginTop: 40, paddingTop: 20, borderTop: `1px solid ${COLORS.border}`,
    display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
    fontFamily: "'Inter', sans-serif", fontSize: 12.5, color: COLORS.inkDim,
  },
  footerDot: { color: COLORS.border },
  footerLink: { color: COLORS.violet, fontWeight: 600, textDecoration: "none" },
};
