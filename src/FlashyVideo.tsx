import React, { useMemo } from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { Audio } from "@remotion/media";
import type { SubtitleCue } from "./lib/parse-srt";

export interface FlashyVideoProps extends Record<string, unknown> {
  subtitles: SubtitleCue[];
  audioSrc: string;
  energies: number[];
  beats: number[];
  sensitivity: number;
  highlightIntensity: number;
  bgColor: string;
  textColor: string;
}

const FLASH_COLORS = [
  "#ff006e", "#8338ec", "#3a86ff", "#fb5607",
  "#ffbe0b", "#06d6a0", "#e63946", "#a855f7",
];

/** Parse hex color to {r,g,b} */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Create a lighter, slightly tinted accent from a base color */
function accentColor(hex: string, intensity: number): string {
  const { r, g, b } = hexToRgb(hex);
  const t = intensity; // 0 = same as bg, 1 = full accent
  const lr = Math.min(255, Math.round(r + (60 + r * 0.3) * t));
  const lg = Math.min(255, Math.round(g + (30 + g * 0.2) * t));
  const lb = Math.min(255, Math.round(b + (80 + b * 0.3) * t));
  return `rgb(${lr},${lg},${lb})`;
}

/** Create a dark, saturated version of a color for vignette edges */
function vignetteColor(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  // Darken to ~25% brightness but keep hue character
  const dr = Math.round(r * 0.25);
  const dg = Math.round(g * 0.25);
  const db = Math.round(b * 0.25);
  return `rgba(${dr},${dg},${db},${alpha})`;
}

export const FlashyVideo: React.FC<FlashyVideoProps> = ({
  audioSrc, subtitles, energies, beats, sensitivity, highlightIntensity, bgColor, textColor,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;
  const s = sensitivity ?? 0.5;

  const rawEnergy = energies[frame] ?? 0;
  const rawBeat = beats[frame] ?? 0;

  // rawBeat already incorporates sensitivity via computeBeats.
  // Use rawBeat for thresholds (whether to show an effect),
  // and s only for intensity scaling (how strong the effect is).

  const bg = bgColor || "#0a0a0a";
  const hi = highlightIntensity ?? 0.5;
  const accent = useMemo(() => accentColor(bg, hi), [bg, hi]);

  const currentCue = subtitles.find(
    (cue) => currentTime >= cue.startTime && currentTime <= cue.endTime,
  );

  const colorIndex = Math.floor(frame / 3) % FLASH_COLORS.length;
  const flashColor = FLASH_COLORS[colorIndex];

  const flashOpacity = interpolate(rawBeat, [0, 0.15, 0.5, 1], [0, 0.02, 0.2, 0.6], {
    extrapolateRight: "clamp",
  }) * s;
  const textScale = interpolate(rawEnergy, [0, 1], [1, 1 + 0.15 * s], {
    extrapolateRight: "clamp",
  });
  const glowSize = interpolate(rawBeat, [0, 1], [0, 40], {
    extrapolateRight: "clamp",
  }) * s;
  const sceneScale = interpolate(rawEnergy, [0, 1], [1, 1 + 0.03 * s], {
    extrapolateRight: "clamp",
  });
  const vignetteOpacity = interpolate(rawEnergy, [0, 1], [0.6, 0.6 - 0.3 * s], {
    extrapolateRight: "clamp",
  });

  // Gradient center position — moves slowly
  const gx = 50 + Math.sin(frame * 0.02) * 20;
  const gy = 50 + Math.cos(frame * 0.015) * 20;

  return (
    <AbsoluteFill style={{ backgroundColor: bg, overflow: "hidden" }}>
      {audioSrc && <Audio src={audioSrc} />}

      <AbsoluteFill style={{ transform: `scale(${sceneScale})` }}>
        {/* Shifting highlight glow — layered circles for canvas compat */}
        <HighlightGlow x={gx} y={gy} color={accent} />

        {/* Beat flash — colored */}
        {rawBeat > 0.05 && (
          <AbsoluteFill
            style={{ backgroundColor: flashColor, opacity: flashOpacity, mixBlendMode: "screen" }}
          />
        )}

        {/* White strobe on strong beats */}
        {rawBeat > 0.6 && (
          <AbsoluteFill
            style={{ backgroundColor: "#ffffff", opacity: (rawBeat - 0.6) * 1.2 * s, mixBlendMode: "overlay" }}
          />
        )}

        {/* Particles */}
        <BeatParticles frame={frame} energy={rawEnergy} beat={rawBeat} sensitivity={s} />

        {/* Scan lines */}
        <ScanLines />
      </AbsoluteFill>

      {/* Subtitle */}
      {currentCue && (
        <SubtitleDisplay
          cue={currentCue} frame={frame} fps={fps}
          textScale={textScale} glowSize={glowSize} beat={rawBeat}
          flashColor={flashColor} textColor={textColor || "#ffffff"}
        />
      )}

      {/* Vignette — edge overlays for canvas compat */}
      <Vignette color={vignetteColor(bg, vignetteOpacity)} />

      {/* Energy bar */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 6, backgroundColor: "rgba(255,255,255,0.08)" }}>
        <div style={{ height: "100%", width: `${rawEnergy * 100}%`, backgroundColor: flashColor, boxShadow: `0 0 12px ${flashColor}` }} />
      </div>
    </AbsoluteFill>
  );
};

/* ── Subtitle ── */

const SubtitleDisplay: React.FC<{
  cue: SubtitleCue; frame: number; fps: number;
  textScale: number; glowSize: number; beat: number;
  flashColor: string; textColor: string;
}> = ({ cue, frame, fps, textScale, glowSize, beat, flashColor, textColor }) => {
  const cueStartFrame = Math.floor(cue.startTime * fps);
  const cueFrame = frame - cueStartFrame;

  const entrance = spring({ frame: cueFrame, fps, config: { damping: 15, stiffness: 150, mass: 0.8 } });
  const translateY = interpolate(entrance, [0, 1], [60, 0]);
  const opacity = interpolate(entrance, [0, 1], [0, 1]);
  const lines = cue.text.split("\n");
  // Flatten for stagger index
  let wordIdx = 0;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 80px" }}>
      <div
        style={{
          transform: `scale(${textScale}) translateY(${translateY}px)`,
          opacity,
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: "8px", maxWidth: "90%",
        }}
      >
        {lines.map((line, li) => {
          const words = line.split(/\s+/).filter(Boolean);
          return (
            <div key={li} style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px 14px" }}>
              {words.map((word, wi) => {
                const idx = wordIdx++;
                const we = spring({ frame: cueFrame - idx * 2, fps, config: { damping: 12, stiffness: 200, mass: 0.5 } });
                return (
                  <span
                    key={`${cue.index}-${li}-${wi}`}
                    style={{
                      fontFamily: "'Inter','SF Pro Display',-apple-system,sans-serif",
                      fontSize: words.length > 6 ? 56 : 72,
                      fontWeight: 900,
                      color: textColor,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      textShadow: `0 0 ${glowSize}px ${flashColor},0 0 ${glowSize * 2}px ${flashColor}40,0 2px 4px rgba(0,0,0,0.8)`,
                      transform: `scale(${interpolate(we, [0, 1], [0.5, 1])})`,
                      opacity: interpolate(we, [0, 1], [0, 1]),
                      display: "inline-block",
                      WebkitTextStroke: beat > 0.4 ? `1px ${flashColor}` : "none",
                    }}
                  >
                    {word}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ── Highlight glow — concentric circles simulating blur for canvas compat ── */

const GLOW_LAYERS = Array.from({ length: 36 }, (_, i) => {
  const t = i / 35; // 0..1
  return {
    scale: 1.0 - t * 0.85, // 1.0 down to 0.15
    opacity: 0.015 + t * 0.2, // 0.015 up to 0.215
  };
});

const HighlightGlow: React.FC<{ x: number; y: number; color: string }> = ({ x, y, color }) => (
  <>
    {GLOW_LAYERS.map((l, i) => (
      <div
        key={i}
        style={{
          position: "absolute",
          left: `${x}%`,
          top: `${y}%`,
          width: `${l.scale * 120}%`,
          height: `${l.scale * 120}%`,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          backgroundColor: color,
          opacity: l.opacity,
          pointerEvents: "none",
        }}
      />
    ))}
  </>
);

/* ── Vignette — four edge gradients for canvas compat ── */

const Vignette: React.FC<{ color: string }> = ({ color }) => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    {/* Top */}
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "35%", background: `linear-gradient(to bottom, ${color}, transparent)` }} />
    {/* Bottom */}
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "35%", background: `linear-gradient(to top, ${color}, transparent)` }} />
    {/* Left */}
    <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "25%", background: `linear-gradient(to right, ${color}, transparent)` }} />
    {/* Right */}
    <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: "25%", background: `linear-gradient(to left, ${color}, transparent)` }} />
  </AbsoluteFill>
);

/* ── Scan lines — single SVG pattern, renders as 1 element ── */

const ScanLines: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="scanlines" width="1" height="4" patternUnits="userSpaceOnUse">
          <rect width="1" height="1" y="3" fill="rgba(255,255,255,0.06)" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#scanlines)" />
    </svg>
  </AbsoluteFill>
);

/* ── Particles ── */

const BeatParticles: React.FC<{
  frame: number; energy: number; beat: number; sensitivity: number;
}> = ({ frame, energy, beat, sensitivity }) => {
  if (sensitivity === 0 && energy === 0) return null;

  const ambientCount = Math.round(6 * energy * Math.max(sensitivity, 0.3));
  const burstCount = Math.round(16 * beat * sensitivity);
  const totalCount = Math.min(ambientCount + burstCount, 20); // cap for perf
  if (totalCount === 0) return null;

  const particles = Array.from({ length: totalCount }, (_, i) => {
    const h1 = (frame * 7 + i * 31) % 1000;
    const h2 = (frame * 13 + i * 47) % 1000;
    const h3 = (frame * 3 + i * 71) % 1000;
    const isBurst = i >= ambientCount;
    return {
      x: (h1 * 37) % 100,
      y: (h2 * 53) % 100,
      size: isBurst ? 3 + (h3 % 5) : 2 + (h3 % 3),
      opacity: isBurst ? beat * 0.8 : energy * 0.4,
    };
  });

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            backgroundColor: `rgba(255,255,255,${p.opacity})`,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};
