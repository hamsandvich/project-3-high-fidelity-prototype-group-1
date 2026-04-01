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
/*  Physics-based layout with collision resolution                    */
/* ------------------------------------------------------------------ */

type Vec = { x: number; y: number };

/** Initial radial placement with staggered radii */
function initialPositions(count: number): Vec[] {
  const cx = 50;
  const cy = 50;
  const inner = 32;
  const outer = 41;

  return Array.from({ length: count }, (_, i) => {
    const angle = ((Math.PI * 2) / Math.max(count, 1)) * i - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

/**
 * Iteratively push overlapping nodes apart.
 * Works in the 0-100 SVG viewBox coordinate space.
 */
function resolveCollisions(
  start: Vec[],
  nodeR: number,
  centerR: number,
  iterations = 60
): Vec[] {
  const pts = start.map((p) => ({ x: p.x, y: p.y }));
  const minNodeDist = nodeR * 2;
  const minCenterDist = centerR + nodeR;
  const pad = nodeR + 2; // keep away from edges

  for (let iter = 0; iter < iterations; iter++) {
    // Node ↔ node repulsion
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[j].x - pts[i].x;
        const dy = pts[j].y - pts[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;

        if (dist < minNodeDist) {
          const push = ((minNodeDist - dist) / 2) * 0.6;
          const nx = dx / dist;
          const ny = dy / dist;
          pts[i].x -= nx * push;
          pts[i].y -= ny * push;
          pts[j].x += nx * push;
          pts[j].y += ny * push;
        }
      }
    }

    // Center repulsion — keep nodes out of the centre circle
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i].x - 50;
      const dy = pts[i].y - 50;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;

      if (dist < minCenterDist) {
        const push = (minCenterDist - dist) * 0.7;
        pts[i].x += (dx / dist) * push;
        pts[i].y += (dy / dist) * push;
      }
    }

    // Boundary clamping
    for (const p of pts) {
      p.x = Math.max(pad, Math.min(100 - pad, p.x));
      p.y = Math.max(pad, Math.min(100 - pad, p.y));
    }
  }

  return pts;
}

/* ------------------------------------------------------------------ */
/*  SVG curved path helper                                            */
/* ------------------------------------------------------------------ */

function curvedPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const off = 3;
  const cx = mx + (dy / len) * off;
  const cy = my - (dx / len) * off;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

/* ------------------------------------------------------------------ */
/*  Zoom / pan hook (pinch + buttons)                                 */
/* ------------------------------------------------------------------ */

function useZoomPan(minScale = 1, maxScale = 3) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState<Vec>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Pinch state refs (not in state to avoid re-renders mid-gesture)
  const pinchRef = useRef({ active: false, startDist: 0, startScale: 1 });
  const panRef = useRef({ active: false, startX: 0, startY: 0, origTx: 0, origTy: 0 });

  const clampTranslate = useCallback(
    (tx: number, ty: number, s: number) => {
      const limit = ((s - 1) / s) * 50;
      return {
        x: Math.max(-limit, Math.min(limit, tx)),
        y: Math.max(-limit, Math.min(limit, ty)),
      };
    },
    []
  );

  const zoomIn = useCallback(() => {
    setScale((s) => {
      const next = Math.min(s + 0.5, maxScale);
      setTranslate((t) => clampTranslate(t.x, t.y, next));
      return next;
    });
  }, [maxScale, clampTranslate]);

  const zoomOut = useCallback(() => {
    setScale((s) => {
      const next = Math.max(s - 0.5, minScale);
      if (next <= 1) setTranslate({ x: 0, y: 0 });
      else setTranslate((t) => clampTranslate(t.x, t.y, next));
      return next;
    });
  }, [minScale, clampTranslate]);

  const resetZoom = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  // Touch handlers for pinch-to-zoom & pan
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        pinchRef.current = {
          active: true,
          startDist: Math.sqrt(dx * dx + dy * dy),
          startScale: scale,
        };
      } else if (e.touches.length === 1 && scale > 1) {
        panRef.current = {
          active: true,
          startX: e.touches[0].clientX,
          startY: e.touches[0].clientY,
          origTx: translate.x,
          origTy: translate.y,
        };
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
        const dist = Math.sqrt(dx * dx + dy * dy);
        const ratio = dist / (pinchRef.current.startDist || 1);
        const next = Math.max(minScale, Math.min(maxScale, pinchRef.current.startScale * ratio));
        setScale(next);
        setTranslate((t) => clampTranslate(t.x, t.y, next));
      } else if (panRef.current.active && e.touches.length === 1) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const dx = e.touches[0].clientX - panRef.current.startX;
        const dy = e.touches[0].clientY - panRef.current.startY;
        // Convert pixel delta to percentage of container
        const pctX = (dx / rect.width) * 100;
        const pctY = (dy / rect.height) * 100;
        const next = clampTranslate(
          panRef.current.origTx + pctX,
          panRef.current.origTy + pctY,
          scale
        );
        setTranslate(next);
      }
    },
    [minScale, maxScale, scale, clampTranslate]
  );

  const onTouchEnd = useCallback(() => {
    pinchRef.current.active = false;
    panRef.current.active = false;
  }, []);

  return {
    scale,
    translate,
    containerRef,
    zoomIn,
    zoomOut,
    resetZoom,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    isZoomed: scale > 1,
  };
}

/* ------------------------------------------------------------------ */
/*  Line-draw animation helper                                        */
/* ------------------------------------------------------------------ */

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
      strokeWidth="0.5"
      strokeOpacity="0.55"
      fill="none"
      strokeDasharray={dashed ? "1.5 1" : `${len}`}
      strokeDashoffset={dashed ? 0 : len}
      initial={dashed ? { opacity: 0 } : { strokeDashoffset: len }}
      animate={dashed ? { opacity: 1 } : { strokeDashoffset: 0 }}
      transition={{ duration: 0.7, delay, ease: "easeOut" }}
    />
  );
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

  // Resolve positions once with collision avoidance
  const positions = useMemo(() => {
    const raw = initialPositions(nodes.length);
    // nodeR ≈ half of a ~5.5 rem node expressed in viewBox units (~12)
    // centerR ≈ half of the centre card (~16)
    return resolveCollisions(raw, 12, 16);
  }, [nodes.length]);

  const usedTypes = Array.from(new Set(nodes.map((n) => n.relationType)));
  const zoom = useZoomPan(1, 3);

  return (
    <div className={cn(framed ? "surface-card p-4" : "space-y-4")}>
      {/* Zoom controls */}
      <div className="mb-2 flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={zoom.zoomOut}
          disabled={!zoom.isZoomed}
          className="tap-button-secondary h-8 w-8 !rounded-full !p-0 text-slate-500 disabled:opacity-30"
          aria-label="Zoom out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={zoom.zoomIn}
          disabled={zoom.scale >= 3}
          className="tap-button-secondary h-8 w-8 !rounded-full !p-0 text-slate-500 disabled:opacity-30"
          aria-label="Zoom in"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        {zoom.isZoomed ? (
          <button
            type="button"
            onClick={zoom.resetZoom}
            className="tap-button-secondary h-8 !rounded-full !px-2.5 !py-0 text-xs text-slate-500"
            aria-label="Reset zoom"
          >
            <Minimize2 className="mr-1 h-3 w-3" />
            Reset
          </button>
        ) : null}
      </div>

      {/* Map container with pinch-to-zoom */}
      <div
        ref={zoom.containerRef}
        className="relative aspect-square overflow-hidden rounded-4xl border border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50"
        style={{ touchAction: zoom.isZoomed ? "none" : "auto" }}
        onTouchStart={zoom.onTouchStart}
        onTouchMove={zoom.onTouchMove}
        onTouchEnd={zoom.onTouchEnd}
      >
        {/* Zoomable inner layer */}
        <div
          className="absolute inset-0 origin-center transition-transform duration-200 ease-out"
          style={{
            transform: `scale(${zoom.scale}) translate(${zoom.translate.x / zoom.scale}%, ${zoom.translate.y / zoom.scale}%)`,
          }}
        >
          {/* Connection lines (animated draw-in) */}
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            aria-hidden="true"
          >
            {nodes.map((node, i) => {
              const pos = positions[i];
              const color = RELATION_COLORS[node.relationType];
              const isDashed =
                node.relationType === "similar" ||
                node.relationType === "variant";
              return (
                <AnimatedPath
                  key={node.id}
                  d={curvedPath(50, 50, pos.x, pos.y)}
                  stroke={color.line}
                  dashed={isDashed}
                  delay={0.15 + i * 0.08}
                />
              );
            })}
          </svg>

          {/* Centre word — scales in */}
          <motion.div
            className="absolute left-1/2 top-1/2 z-20 w-[7.5rem] -translate-x-1/2 -translate-y-1/2"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 22, delay: 0.05 }}
          >
            <div className="rounded-2xl bg-moss-700 px-3 py-3 text-center text-white shadow-card">
              <p className="truncate text-base font-semibold leading-tight">
                {centerWord.lemma}
              </p>
              {preferences.showSyllabics && centerWord.syllabics ? (
                <p className="mt-0.5 truncate text-xs text-white/70">
                  {centerWord.syllabics}
                </p>
              ) : null}
              <p className="mt-1 line-clamp-2 text-[0.68rem] leading-snug text-white/80">
                {centerWord.plainEnglish}
              </p>
            </div>
          </motion.div>

          {/* Related word nodes — stagger in with spring */}
          {nodes.map((node, i) => {
            const pos = positions[i];
            const color = RELATION_COLORS[node.relationType];

            return (
              <motion.div
                key={node.id}
                className="absolute z-30 w-[5.5rem] -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 260,
                  damping: 20,
                  delay: 0.2 + i * 0.09,
                }}
              >
                <Link
                  href={`/word/${node.word.slug}`}
                  className="block rounded-2xl border border-slate-200/90 bg-white px-2.5 py-2 text-center shadow-sm transition-transform active:scale-95"
                >
                  <div className="mb-1 flex items-center justify-center gap-1">
                    <span
                      className={cn(
                        "inline-block h-1.5 w-1.5 rounded-full",
                        color.dot
                      )}
                    />
                    <span
                      className={cn(
                        "text-[0.55rem] font-medium uppercase tracking-wider",
                        color.text
                      )}
                    >
                      {node.relationType === "categoryMember"
                        ? "category"
                        : node.relationType}
                    </span>
                  </div>
                  <p className="truncate text-xs font-semibold text-slate-900">
                    {node.word.lemma}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[0.6rem] leading-snug text-slate-500">
                    {node.word.plainEnglish}
                  </p>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Pinch hint (only when not zoomed) */}
      {!zoom.isZoomed ? (
        <p className="mt-1.5 text-center text-[0.65rem] text-slate-400">
          Pinch to zoom · tap a word to explore
        </p>
      ) : null}

      {/* Legend */}
      {usedTypes.length > 0 ? (
        <div className={cn(framed ? "mt-3" : "mt-4")}>
          <p className="section-label mb-2">Connection types</p>
          <div className="flex flex-wrap gap-2">
            {usedTypes.map((type) => {
              const color = RELATION_COLORS[type];
              const count = nodes.filter(
                (n) => n.relationType === type
              ).length;
              return (
                <span
                  key={type}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-100 bg-white px-2.5 py-1"
                >
                  <span
                    className={cn(
                      "inline-block h-2 w-2 rounded-full",
                      color.dot
                    )}
                  />
                  <span className="text-xs font-medium text-slate-700">
                    {RELATION_TYPE_LABELS[type]}
                  </span>
                  {count > 1 ? (
                    <span className="text-[0.65rem] text-slate-400">
                      {count}
                    </span>
                  ) : null}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
