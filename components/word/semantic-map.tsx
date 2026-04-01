"use client";

import Link from "next/link";
import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { ZoomIn, ZoomOut, Minimize2 } from "lucide-react";

import { useAppState } from "@/components/providers/app-providers";
import { cn } from "@/lib/utils";
import { RELATION_TYPE_LABELS } from "@/lib/constants";
import type { RelatedWordModel, WordCardModel } from "@/types/view-models";
import type { RelationTypeValue } from "@/types";

type SemanticMapProps = {
  centerWord: WordCardModel;
  relatedWords: RelatedWordModel[];
  framed?: boolean;
};

/* ------------------------------------------------------------------ */
/*  Relation type colour palette                                      */
/* ------------------------------------------------------------------ */

const RELATION_COLORS: Record<
  RelationTypeValue,
  { line: string; dot: string; text: string }
> = {
  synonym:        { line: "#4f7b5b", dot: "bg-moss-500",    text: "text-moss-700" },
  antonym:        { line: "#c4702e", dot: "bg-clay-500",    text: "text-clay-500" },
  broader:        { line: "#4e88a2", dot: "bg-lake-500",    text: "text-lake-500" },
  narrower:       { line: "#7c6fb0", dot: "bg-purple-400",  text: "text-purple-600" },
  associated:     { line: "#6b8e7b", dot: "bg-moss-500/60", text: "text-moss-700" },
  categoryMember: { line: "#8a9ea8", dot: "bg-slate-400",   text: "text-slate-600" },
  variant:        { line: "#d58d4f", dot: "bg-clay-400",    text: "text-clay-500" },
  similar:        { line: "#5a9aaf", dot: "bg-lake-500/70", text: "text-lake-500" },
};

/* ------------------------------------------------------------------ */
/*  Physics layout — all values in 0-100 coordinate space             */
/* ------------------------------------------------------------------ */

/*
 * Sizing reference (percentage of container width):
 *   Peripheral node: ~20% wide  → radius ≈ 10
 *   Centre node:     ~26% wide  → radius ≈ 13
 *   Peripheral nodes are ~8% tall → vertical radius ≈ 5
 *   Use the larger (horizontal) for collision detection.
 */
const NODE_R = 11;
const CENTER_R = 14;

type Vec = { x: number; y: number };

function initialPositions(count: number): Vec[] {
  // Single ring, evenly spaced, with radius chosen to keep nodes
  // well outside the centre and inside the boundary.
  const r = 36;
  return Array.from({ length: count }, (_, i) => {
    const angle = ((Math.PI * 2) / Math.max(count, 1)) * i - Math.PI / 2;
    return { x: 50 + r * Math.cos(angle), y: 50 + r * Math.sin(angle) };
  });
}

function resolveCollisions(start: Vec[], iterations = 80): Vec[] {
  const pts = start.map((p) => ({ ...p }));
  const minNode = NODE_R * 2.1; // slight extra gap
  const minCenter = CENTER_R + NODE_R + 2;
  const pad = NODE_R + 1;

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;

    // Node ↔ node
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[j].x - pts[i].x;
        const dy = pts[j].y - pts[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        if (dist < minNode) {
          const push = (minNode - dist) / 2;
          const nx = dx / dist;
          const ny = dy / dist;
          pts[i].x -= nx * push;
          pts[i].y -= ny * push;
          pts[j].x += nx * push;
          pts[j].y += ny * push;
          moved = true;
        }
      }
    }

    // Centre repulsion
    for (const p of pts) {
      const dx = p.x - 50;
      const dy = p.y - 50;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
      if (dist < minCenter) {
        const push = minCenter - dist;
        p.x += (dx / dist) * push;
        p.y += (dy / dist) * push;
        moved = true;
      }
    }

    // Boundary
    for (const p of pts) {
      p.x = Math.max(pad, Math.min(100 - pad, p.x));
      p.y = Math.max(pad, Math.min(100 - pad, p.y));
    }

    if (!moved) break; // converged early
  }
  return pts;
}

/* ------------------------------------------------------------------ */
/*  SVG helpers                                                       */
/* ------------------------------------------------------------------ */

function curvedPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const off = 2.5;
  return `M ${x1} ${y1} Q ${mx + (dy / len) * off} ${my - (dx / len) * off} ${x2} ${y2}`;
}

/* Animated SVG path that draws itself in */
function AnimatedPath({
  d,
  stroke,
  dashed,
  delay,
}: {
  d: string;
  stroke: string;
  dashed: boolean;
  delay: number;
}) {
  const ref = useRef<SVGPathElement>(null);
  const [len, setLen] = useState(200);

  useEffect(() => {
    if (ref.current) setLen(ref.current.getTotalLength());
  }, [d]);

  return (
    <motion.path
      ref={ref}
      d={d}
      stroke={stroke}
      strokeWidth="0.4"
      strokeOpacity="0.5"
      fill="none"
      strokeDasharray={dashed ? "1.5 1" : `${len}`}
      strokeDashoffset={dashed ? 0 : len}
      initial={dashed ? { opacity: 0 } : { strokeDashoffset: len }}
      animate={dashed ? { opacity: 1 } : { strokeDashoffset: 0 }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Zoom / pan hook                                                   */
/* ------------------------------------------------------------------ */

function useZoomPan(minScale = 1, maxScale = 3) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState<Vec>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef({ active: false, startDist: 0, startScale: 1 });
  const panRef = useRef({ active: false, startX: 0, startY: 0, origTx: 0, origTy: 0 });

  const clamp = useCallback(
    (tx: number, ty: number, s: number) => {
      const lim = ((s - 1) / s) * 50;
      return { x: Math.max(-lim, Math.min(lim, tx)), y: Math.max(-lim, Math.min(lim, ty)) };
    },
    []
  );

  const zoomIn = useCallback(() => {
    setScale((s) => {
      const n = Math.min(s + 0.5, maxScale);
      setTranslate((t) => clamp(t.x, t.y, n));
      return n;
    });
  }, [maxScale, clamp]);

  const zoomOut = useCallback(() => {
    setScale((s) => {
      const n = Math.max(s - 0.5, minScale);
      if (n <= 1) setTranslate({ x: 0, y: 0 });
      else setTranslate((t) => clamp(t.x, t.y, n));
      return n;
    });
  }, [minScale, clamp]);

  const reset = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        pinchRef.current = { active: true, startDist: Math.sqrt(dx * dx + dy * dy), startScale: scale };
      } else if (e.touches.length === 1 && scale > 1) {
        panRef.current = { active: true, startX: e.touches[0].clientX, startY: e.touches[0].clientY, origTx: translate.x, origTy: translate.y };
      }
    },
    [scale, translate]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (pinchRef.current.active && e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const n = Math.max(minScale, Math.min(maxScale, pinchRef.current.startScale * (Math.sqrt(dx * dx + dy * dy) / (pinchRef.current.startDist || 1))));
        setScale(n);
        setTranslate((t) => clamp(t.x, t.y, n));
      } else if (panRef.current.active && e.touches.length === 1) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const pctX = ((e.touches[0].clientX - panRef.current.startX) / rect.width) * 100;
        const pctY = ((e.touches[0].clientY - panRef.current.startY) / rect.height) * 100;
        setTranslate(clamp(panRef.current.origTx + pctX, panRef.current.origTy + pctY, scale));
      }
    },
    [minScale, maxScale, scale, clamp]
  );

  const onTouchEnd = useCallback(() => {
    pinchRef.current.active = false;
    panRef.current.active = false;
  }, []);

  return { scale, translate, containerRef, zoomIn, zoomOut, reset, onTouchStart, onTouchMove, onTouchEnd, isZoomed: scale > 1 };
}

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

export function SemanticMap({
  centerWord,
  relatedWords,
  framed = true,
}: SemanticMapProps) {
  const { preferences } = useAppState();
  const nodes = relatedWords.slice(0, 8);

  const positions = useMemo(
    () => resolveCollisions(initialPositions(nodes.length)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes.length]
  );

  const usedTypes = Array.from(new Set(nodes.map((n) => n.relationType)));
  const zoom = useZoomPan(1, 3);

  return (
    <div className={cn(framed ? "surface-card p-4" : "space-y-4")}>
      {/* Map */}
      <div
        ref={zoom.containerRef}
        className="relative aspect-square overflow-hidden rounded-4xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50"
        style={{ touchAction: zoom.isZoomed ? "none" : "auto" }}
        onTouchStart={zoom.onTouchStart}
        onTouchMove={zoom.onTouchMove}
        onTouchEnd={zoom.onTouchEnd}
      >
        <div
          className="absolute inset-0 origin-center transition-transform duration-200 ease-out"
          style={{ transform: `scale(${zoom.scale}) translate(${zoom.translate.x / zoom.scale}%, ${zoom.translate.y / zoom.scale}%)` }}
        >
          {/* Lines — z-10 keeps them behind node cards */}
          <svg className="absolute inset-0 z-10 h-full w-full" viewBox="0 0 100 100" aria-hidden="true">
            {nodes.map((node, i) => {
              const pos = positions[i];
              const color = RELATION_COLORS[node.relationType];
              const dashed = node.relationType === "similar" || node.relationType === "variant";
              return <AnimatedPath key={node.id} d={curvedPath(50, 50, pos.x, pos.y)} stroke={color.line} dashed={dashed} delay={0.12 + i * 0.07} />;
            })}
          </svg>

          {/* Centre node */}
          <motion.div
            className="absolute z-20"
            style={{ left: "50%", top: "50%", width: "26%", transform: "translate(-50%, -50%)" }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring" as const, stiffness: 300, damping: 22, delay: 0.05 }}
          >
            <div className="rounded-2xl bg-moss-700 px-2 py-2.5 text-center text-white shadow-card">
              <p className="truncate text-sm font-semibold leading-tight">{centerWord.lemma}</p>
              {preferences.showSyllabics && centerWord.syllabics ? (
                <p className="mt-0.5 truncate text-[0.6rem] text-white/70">{centerWord.syllabics}</p>
              ) : null}
              <p className="mt-0.5 line-clamp-2 text-[0.6rem] leading-snug text-white/80">{centerWord.plainEnglish}</p>
            </div>
          </motion.div>

          {/* Peripheral nodes — sized in % so collision math matches */}
          {nodes.map((node, i) => {
            const pos = positions[i];
            const color = RELATION_COLORS[node.relationType];
            return (
              <motion.div
                key={node.id}
                className="absolute z-30"
                style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: "22%", transform: "translate(-50%, -50%)" }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring" as const, stiffness: 260, damping: 20, delay: 0.18 + i * 0.08 }}
              >
                <Link
                  href={`/word/${node.word.slug}`}
                  className="block rounded-xl border border-slate-200/90 bg-white px-2 py-1.5 text-center shadow-sm transition-transform active:scale-95"
                >
                  <div className="mb-0.5 flex items-center justify-center gap-1">
                    <span className={cn("inline-block h-1.5 w-1.5 rounded-full shrink-0", color.dot)} />
                    <span className={cn("truncate text-[0.5rem] font-medium uppercase tracking-wider leading-none", color.text)}>
                      {node.relationType === "categoryMember" ? "category" : node.relationType}
                    </span>
                  </div>
                  <p className="truncate text-[0.65rem] font-semibold leading-tight text-slate-900">{node.word.lemma}</p>
                  <p className="mt-0.5 truncate text-[0.5rem] leading-tight text-slate-500">{node.word.plainEnglish}</p>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Zoom controls */}
      <div className="mt-2 flex items-center justify-center gap-1.5">
        <button type="button" onClick={zoom.zoomOut} disabled={!zoom.isZoomed} className="tap-button-secondary h-8 w-8 !rounded-full !p-0 text-slate-500 disabled:opacity-30" aria-label="Zoom out">
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={zoom.zoomIn} disabled={zoom.scale >= 3} className="tap-button-secondary h-8 w-8 !rounded-full !p-0 text-slate-500 disabled:opacity-30" aria-label="Zoom in">
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        {zoom.isZoomed ? (
          <button type="button" onClick={zoom.reset} className="tap-button-secondary h-8 !rounded-full !px-2.5 !py-0 text-xs text-slate-500" aria-label="Reset zoom">
            <Minimize2 className="mr-1 h-3 w-3" />
            Reset
          </button>
        ) : null}
      </div>

      {!zoom.isZoomed ? (
        <p className="mt-1 text-center text-[0.65rem] text-slate-400">Pinch to zoom · tap a word to explore</p>
      ) : null}

      {/* Legend */}
      {usedTypes.length > 0 ? (
        <div className={cn(framed ? "mt-3" : "mt-4")}>
          <p className="section-label mb-2">Connection types</p>
          <div className="flex flex-wrap gap-2">
            {usedTypes.map((type) => {
              const color = RELATION_COLORS[type];
              const count = nodes.filter((n) => n.relationType === type).length;
              return (
                <span key={type} className="inline-flex items-center gap-1.5 rounded-full border border-slate-100 bg-white px-2.5 py-1">
                  <span className={cn("inline-block h-2 w-2 rounded-full", color.dot)} />
                  <span className="text-xs font-medium text-slate-700">{RELATION_TYPE_LABELS[type]}</span>
                  {count > 1 ? <span className="text-[0.65rem] text-slate-400">{count}</span> : null}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
