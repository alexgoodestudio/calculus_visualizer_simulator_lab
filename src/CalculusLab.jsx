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
  ground: "#F3F1FB",
  card: "#FFFFFF",
  cardShadow: "0 8px 24px rgba(91, 76, 173, 0.08)",
  grid: "#ECE9F9",
  gridStrong: "#D8D3F3",
  curve: "#4C3A8A",
  ink: "#2B2540",
  inkDim: "#7A7595",
  violet: "#7C5CFC",
  coral: "#FB8B6E",
  mint: "#2FC4A6",
  gold: "#F5A623",
  rose: "#EF6461",
  border: "#E7E3F6",
  chipBg: "#F7F5FD",
};

const PRESETS = [
  { label: "x²", expr: "x^2", domain: [-4, 4] },
  { label: "x³ − 3x", expr: "x^3 - 3*x", domain: [-3, 3] },
  { label: "sin(x)", expr: "sin(x)", domain: [-6.3, 6.3] },
  { label: "cos(x)", expr: "cos(x)", domain: [-6.3, 6.3] },
  { label: "eˣ", expr: "exp(x)", domain: [-2, 2.5] },
  { label: "ln(x)", expr: "log(x)", domain: [0.15, 6] },
  { label: "1/x", expr: "1/x", domain: [-4, 4] },
  { label: "x·sin(x)", expr: "x*sin(x)", domain: [-8, 8] },
  { label: "sin(x²)", expr: "sin(x^2)", domain: [-2.6, 2.6] },
  { label: "√x", expr: "sqrt(x)", domain: [0, 8] },
];

const W = 640, H = 300;      // upper panel
const H2 = 170;              // lower panel
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

/* ---- rule detection heuristic, for the "key concept" callout ---- */
function detectRule(expr) {
  const e = expr.replace(/\s+/g, "");
  const trig = /(sin|cos|tan)\(/;
  const hasInnerExpr = (fnMatch) => {
    const m = e.match(new RegExp(fnMatch.source + "\\(([^()]*x[^()]*)\\)"));
    return m && m[1] !== "x";
  };
  if (trig.test(e) && hasInnerExpr(trig)) {
    return {
      name: "Chain Rule",
      note: "There's a function tucked inside another function here. Work from the outside in: take the derivative of the outside piece, then multiply by the derivative of what's inside.",
    };
  }
  if (/x\)\*[a-z]+\(x|x\)\*x|x\*[a-z]+\(x\)/.test(e) || ((e.match(/x/g) || []).length >= 2 && /\*/.test(e) && /(sin|cos|tan|log|exp)\(/.test(e))) {
    return {
      name: "Product Rule",
      note: "Two functions are being multiplied. Differentiate the first and keep the second, then add the first times the derivative of the second.",
    };
  }
  if (/\//.test(e) && /x/.test(e.split("/")[1] || "")) {
    return {
      name: "Quotient Rule",
      note: "This is one function divided by another. There's a specific formula for this case — it looks messier than the product rule because the bottom function's own change has to be accounted for too.",
    };
  }
  if (/exp\(/.test(e)) return { name: "Derivative of eˣ", note: "eˣ is a special function — its slope at every single point is equal to its own height. That's the one and only function that does this." };
  if (/log\(/.test(e)) return { name: "Derivative of ln(x)", note: "The slope of ln(x) is always 1 divided by x. That means the curve gets flatter and flatter as x grows." };
  if (/sin\(x\)/.test(e)) return { name: "Derivative of sin(x)", note: "The slope of sin(x) at any point is cos(x). As sine rises and falls, cosine tracks exactly how fast it's doing so." };
  if (/cos\(x\)/.test(e)) return { name: "Derivative of cos(x)", note: "The slope of cos(x) at any point is −sin(x) — the negative sign flips the direction." };
  if (/\^/.test(e) || /x\*x/.test(e)) return { name: "Power Rule", note: "For x raised to a power, bring the exponent down in front as a multiplier, then subtract 1 from the exponent. Example: the derivative of x³ is 3x²." };
  if (/sqrt\(/.test(e)) return { name: "Power Rule", note: "√x is the same as x^(1/2), so the same rule applies: bring the 1/2 down, then subtract 1 from the exponent." };
  return { name: "Sum Rule", note: "When a function is built from terms added or subtracted together, just take the derivative of each term separately." };
}

export default function CalculusLab() {
  const [exprInput, setExprInput] = useState("x^2");
  const [domain, setDomain] = useState([-4, 4]);
  const [activePreset, setActivePreset] = useState("x²");
  const [mode, setMode] = useState("derivative"); // 'derivative' | 'integral'
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

  const rule = useMemo(() => detectRule(exprInput), [exprInput]);

  const [a, b] = domain;
  const iA = a + (b - a) * 0.18;
  const iB = b - (b - a) * 0.18;

  useEffect(() => {
    if (!playing) return;
    const DURATION = 7000 / speed;
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
  }, [playing, speed]);

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

  const curvePts = useMemo(() => (fn ? sample(fn, a, b) : []), [fn, a, b]);
  const [yLo, yHi] = useMemo(() => yExtent(curvePts), [curvePts]);

  const derivPts = useMemo(() => (derivFn ? sample(derivFn, a, b) : []), [derivFn, a, b]);
  const [dyLo, dyHi] = useMemo(() => yExtent(derivPts), [derivPts]);

  const xToPx = useCallback((x) => PAD.l + ((x - a) / (b - a)) * (W - PAD.l - PAD.r), [a, b]);
  const yToPx = useCallback((y) => H - PAD.b - ((y - yLo) / (yHi - yLo)) * (H - PAD.t - PAD.b), [yLo, yHi]);
  const yToPx2 = useCallback((y) => H2 - PAD.b - ((y - dyLo) / (dyHi - dyLo)) * (H2 - PAD.t - PAD.b), [dyLo, dyHi]);

  const mainPath = useMemo(() => pathFromPoints(curvePts, xToPx, yToPx), [curvePts, xToPx, yToPx]);
  const derivPath = useMemo(() => pathFromPoints(derivPts, xToPx, yToPx2), [derivPts, xToPx, yToPx2]);

  /* ---------------- DERIVATIVE MODE geometry ---------------- */
  const cursorX = a + progress * (b - a);
  const cursorY = fn ? safe(fn, cursorX) : NaN;
  const slope = derivFn ? safe(derivFn, cursorX) : NaN;

  const tangentPath = useMemo(() => {
    if (!Number.isFinite(cursorY) || !Number.isFinite(slope)) return "";
    const halfSpan = (b - a) * 0.16;
    const x1 = cursorX - halfSpan, x2 = cursorX + halfSpan;
    const y1 = cursorY - slope * halfSpan, y2 = cursorY + slope * halfSpan;
    return `M ${xToPx(x1)} ${yToPx(y1)} L ${xToPx(x2)} ${yToPx(y2)}`;
  }, [cursorX, cursorY, slope, a, b, xToPx, yToPx]);

  const derivTracePts = useMemo(() => derivPts.filter((p) => p[0] <= cursorX), [derivPts, cursorX]);
  const derivTracePath = useMemo(() => pathFromPoints(derivTracePts, xToPx, yToPx2), [derivTracePts, xToPx, yToPx2]);

  /* ---------------- INTEGRAL MODE geometry ---------------- */
  const stageBounds = [0.22, 0.44, 0.64, 0.82, 1.0];
  const stageN = [8, 16, 32, 64, 128];
  let stageIdx = stageBounds.findIndex((s) => progress <= s);
  if (stageIdx === -1) stageIdx = stageBounds.length - 1;
  const n = stageN[stageIdx];
  const smooth = progress >= 1;

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

  /* ---------------- Insight panel copy (static prose + a fixed-slot readout) ---------------- */
  const insight = useMemo(
    () => buildInsight({ mode, rule, exprInput, derivStr, iA, iB }),
    [mode, rule, exprInput, derivStr, iA, iB]
  );

  const stats = useMemo(() => {
    if (mode === "derivative") {
      return [
        { label: "x", value: fmt(cursorX) },
        { label: "f(x)", value: fmt(cursorY) },
        { label: "slope f′(x)", value: fmt(slope) },
      ];
    }
    return [
      { label: "rectangles (n)", value: smooth ? "smooth" : String(n) },
      { label: "estimate", value: smooth ? fmt(exactIntegral, 5) : fmt(riemannSum, 4) },
      { label: "F(x) so far", value: fmt(accumNow, 4) },
    ];
  }, [mode, cursorX, cursorY, slope, n, smooth, riemannSum, exactIntegral, accumNow]);

  return (
    <div style={styles.app}>
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
        input[type=range] { -webkit-appearance: none; appearance: none; height: 5px; border-radius: 3px; background: ${COLORS.border}; }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%;
          background: ${COLORS.violet}; cursor: pointer; border: 3px solid #fff;
          box-shadow: 0 2px 6px rgba(124,92,252,0.5);
        }
        .cl-stat-value { font-variant-numeric: tabular-nums; }
        @media (prefers-reduced-motion: reduce) {
          .cl-btn, .cl-chip { transition: none; }
        }
        @media (max-width: 880px) {
          .cl-layout { grid-template-columns: 1fr !important; }
          .cl-notes { order: 3; position: static !important; }
        }
      `}</style>

      <header style={styles.header}>
        <div style={styles.eyebrow}>LEARN DERIVATIVES &amp; INTEGRALS BY WATCHING THEM HAPPEN</div>
        <h1 style={styles.h1}>Calculus Lab</h1>
      </header>

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
            <div style={styles.tabs}>
              {["derivative", "integral"].map((m) => (
                <button
                  key={m}
                  className="cl-tab"
                  onClick={() => setModeAndReset(m)}
                  style={{ ...styles.tab, ...(mode === m ? styles.tabActive : {}) }}
                >
                  {m === "derivative" ? "Differentiate" : "Integrate"}
                </button>
              ))}
            </div>
          </div>

          <div style={styles.presetRow}>
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
            <svg viewBox={`0 0 ${W} ${H}`} style={styles.svg} role="img" aria-label="Function plot">
              <Grid a={a} b={b} yLo={yLo} yHi={yHi} xToPx={xToPx} yToPx={yToPx} w={W} h={H} />
              <path d={mainPath} stroke={COLORS.curve} strokeWidth={2.5} fill="none" strokeLinecap="round" />

              {mode === "derivative" && fn && (
                <>
                  <path d={tangentPath} stroke={COLORS.coral} strokeWidth={2.25} strokeLinecap="round" />
                  {Number.isFinite(cursorY) && (
                    <circle cx={xToPx(cursorX)} cy={yToPx(cursorY)} r={5.5} fill={COLORS.coral} stroke="#fff" strokeWidth={2} />
                  )}
                </>
              )}

              {mode === "integral" && fn && (
                <>
                  {!smooth ? (
                    rectangles.map((r, i) => {
                      const x0 = xToPx(r.x0), x1 = xToPx(r.x1);
                      const yZero = yToPx(0);
                      const top = r.h >= 0 ? yToPx(r.h) : yZero;
                      const height = Math.abs(yToPx(0) - yToPx(r.h));
                      return (
                        <rect
                          key={i}
                          x={Math.min(x0, x1)}
                          width={Math.max(1, Math.abs(x1 - x0) - 0.6)}
                          y={top}
                          height={Math.max(0.5, height)}
                          fill={COLORS.mint}
                          opacity={0.35}
                          stroke={COLORS.mint}
                          strokeWidth={0.75}
                        />
                      );
                    })
                  ) : (
                    <path
                      d={areaPath(sample(fn, iA, iB), xToPx, yToPx, yToPx(0))}
                      fill={COLORS.mint}
                      opacity={0.4}
                      stroke="none"
                    />
                  )}
                  <line x1={xToPx(iA)} x2={xToPx(iA)} y1={PAD.t} y2={H - PAD.b} stroke={COLORS.inkDim} strokeDasharray="3 3" opacity={0.5} />
                  <line x1={xToPx(iB)} x2={xToPx(iB)} y1={PAD.t} y2={H - PAD.b} stroke={COLORS.inkDim} strokeDasharray="3 3" opacity={0.5} />
                </>
              )}
            </svg>
            <div style={styles.plotCaption}>
              {mode === "derivative" ? "f(x) with the tangent line sliding along the curve" : `Rectangles filling the area under f(x) from ${fmt(iA)} to ${fmt(iB)}`}
            </div>
          </div>

          {/* lower plot */}
          <div style={styles.plotFrame}>
            <svg viewBox={`0 0 ${W} ${H2}`} style={styles.svg} role="img" aria-label="Result plot">
              {mode === "derivative" ? (
                <>
                  <Grid a={a} b={b} yLo={dyLo} yHi={dyHi} xToPx={xToPx} yToPx={yToPx2} w={W} h={H2} />
                  <path d={derivPath} stroke={COLORS.border} strokeWidth={1.5} fill="none" opacity={0.7} />
                  <path d={derivTracePath} stroke={COLORS.mint} strokeWidth={2.5} fill="none" strokeLinecap="round" />
                  {Number.isFinite(slope) && (
                    <circle cx={xToPx(cursorX)} cy={yToPx2(slope)} r={5} fill={COLORS.mint} stroke="#fff" strokeWidth={2} />
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
            <div style={styles.plotCaption}>
              {mode === "derivative" ? "f′(x) — each point here is a slope measured above" : "F(x) — the running total of area collected so far"}
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

        {/* ---------------- RIGHT: field notes ---------------- */}
        <aside className="cl-notes" style={styles.notes}>
          <div style={styles.notesEyebrow}>WHILE YOU WATCH</div>

          <NoteBlock label="What's happening" tone="live">
            <div>{insight.happening}</div>
            <StatRow stats={stats} />
          </NoteBlock>

          <NoteBlock label="Key concept" tone="concept">
            <div style={styles.conceptTitle}>{insight.conceptTitle}</div>
            <div>{insight.conceptBody}</div>
          </NoteBlock>

          <NoteBlock label="Definition" tone="def">
            {insight.definition}
          </NoteBlock>

          <NoteBlock label="Right now, in numbers" tone="formula">
            <div style={styles.mono}>{insight.formula}</div>
          </NoteBlock>
        </aside>
      </div>
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

/* Fixed-slot readout: labels never change, only the number in each slot does,
   so the surrounding paragraph never reflows while the animation runs. */
function StatRow({ stats }) {
  return (
    <div style={styles.statRow}>
      {stats.map((s) => (
        <div key={s.label} style={styles.statPill}>
          <div style={styles.statLabel}>{s.label}</div>
          <div className="cl-stat-value" style={styles.statValue}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

function NoteBlock({ label, tone, children }) {
  const accent = { live: COLORS.coral, concept: COLORS.violet, def: COLORS.inkDim, formula: COLORS.gold }[tone];
  return (
    <div style={{ ...styles.noteBlock, borderLeftColor: accent }}>
      <div style={{ ...styles.noteLabel, color: accent }}>{label}</div>
      <div style={styles.noteBody}>{children}</div>
    </div>
  );
}

/* Static prose only — no numbers baked in, so it never reflows mid-animation.
   All the changing values live in the StatRow readout instead. */
function buildInsight({ mode, rule, exprInput, derivStr, iA, iB }) {
  if (mode === "derivative") {
    return {
      happening:
        "Press play to slide a line along the curve that just barely touches it — that's the tangent line. As it moves, its steepness (the slope) becomes a new point on the graph below, which draws out the derivative.",
      conceptTitle: rule.name,
      conceptBody: rule.note,
      definition:
        "The derivative of a function at a point is the slope of the tangent line there. It tells you how fast f(x) is changing right at that instant — not on average, but at that exact spot.",
      formula: `f(x) = ${exprInput}  →  f′(x) = ${derivStr || "…"}`,
    };
  }

  return {
    happening:
      "Press play to fill the shaded region under the curve with thin rectangles. Watch the rectangle count grow — more, thinner rectangles hug the curve more closely, giving a better estimate of the true area.",
    conceptTitle: "Riemann Sums & the Definite Integral",
    conceptBody:
      "Each rectangle's height is f evaluated somewhere in that slice, so its area (height × width) approximates a small piece of the region. Add every rectangle up and you get an estimate of the total area — that's a Riemann sum.",
    definition:
      "The definite integral ∫ f(x)dx over an interval is the exact area between the curve and the x-axis. As the rectangles get thinner and more numerous, the Riemann sum gets closer and closer to this exact value.",
    formula: `∫ f(x) dx  over  [${fmt(iA)}, ${fmt(iB)}]`,
  };
}

const styles = {
  app: {
    fontFamily: "'Inter', system-ui, sans-serif",
    background: COLORS.ground,
    color: COLORS.ink,
    padding: "28px 28px 40px",
    minHeight: "100%",
    borderRadius: 20,
  },
  header: { marginBottom: 20 },
  eyebrow: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.1em",
    color: COLORS.violet,
    marginBottom: 6,
    fontWeight: 600,
  },
  h1: {
    fontFamily: "'Poppins', sans-serif",
    fontWeight: 700,
    fontSize: 30,
    margin: 0,
    letterSpacing: "-0.01em",
    color: COLORS.ink,
  },
  layout: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1.55fr) minmax(260px,1fr)",
    gap: 20,
    alignItems: "start",
  },
  leftCol: { display: "flex", flexDirection: "column", gap: 12 },
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
    background: "transparent", border: "none", color: COLORS.inkDim,
    fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 13,
    padding: "7px 14px", borderRadius: 8, cursor: "pointer",
  },
  tabActive: { background: COLORS.violet, color: "#fff" },
  presetRow: { display: "flex", gap: 6, flexWrap: "wrap" },
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
  plotCaption: {
    fontFamily: "'Inter', sans-serif", fontSize: 12, color: COLORS.inkDim,
    marginTop: 6, paddingLeft: 4,
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
  statRow: { display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" },
  statPill: {
    background: COLORS.chipBg, borderRadius: 10, padding: "6px 10px",
    minWidth: 74, textAlign: "center", border: `1px solid ${COLORS.border}`,
  },
  statLabel: { fontSize: 9.5, color: COLORS.inkDim, fontFamily: "'Inter', sans-serif", marginBottom: 2, whiteSpace: "nowrap" },
  statValue: { fontSize: 14, color: COLORS.ink, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 },
};
