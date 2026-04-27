import React from "react";
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
  audioSrc: string; // blob URL or empty
  energies: number[];
  beats: number[];
}

const FLASH_COLORS = [
  "#ff006e",
  "#8338ec",
  "#3a86ff",
  "#fb5607",
  "#ffbe0b",
  "#06d6a0",
  "#e63946",
  "#a855f7",
];

export const FlashyVideo: React.FC<FlashyVideoProps> = ({
  audioSrc,
  subtitles,
  energies,
  beats,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const energy = energies[frame] ?? 0;
  const beat = beats[frame] ?? 0;

  const currentCue = subtitles.find(
    (cue) => currentTime >= cue.startTime && currentTime <= cue.endTime,
  );

  const colorIndex = Math.floor(frame / 3) % FLASH_COLORS.length;
  const flashColor = FLASH_COLORS[colorIndex];

  const flashOpacity = interpolate(beat, [0, 0.3, 1], [0, 0.05, 0.7], {
    extrapolateRight: "clamp",
  });
  const textScale = interpolate(energy, [0, 1], [1, 1.15], {
    extrapolateRight: "clamp",
  });
  const glowSize = interpolate(beat, [0, 1], [0, 40], {
    extrapolateRight: "clamp",
  });
  const sceneScale = interpolate(energy, [0, 1], [1, 1.03], {
    extrapolateRight: "clamp",
  });
  const vignetteOpacity = interpolate(energy, [0, 1], [0.6, 0.3], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0a", overflow: "hidden" }}>
      {audioSrc && <Audio src={audioSrc} />}

      <AbsoluteFill style={{ transform: `scale(${sceneScale})` }}>
        {/* Shifting gradient */}
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at ${50 + Math.sin(frame * 0.02) * 20}% ${50 + Math.cos(frame * 0.015) * 20}%, #1a0030 0%, #0a0a0a 70%)`,
          }}
        />
        {/* Beat flash */}
        <AbsoluteFill
          style={{
            backgroundColor: flashColor,
            opacity: flashOpacity,
            mixBlendMode: "screen",
          }}
        />
        {/* White strobe on strong beats */}
        {beat > 0.6 && (
          <AbsoluteFill
            style={{
              backgroundColor: "#fff",
              opacity: (beat - 0.6) * 1.5,
              mixBlendMode: "overlay",
            }}
          />
        )}
        {/* Particles */}
        {beat > 0.4 && <BeatParticles frame={frame} beat={beat} />}
        {/* Scan lines */}
        <AbsoluteFill
          style={{
            background:
              "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.015) 3px,rgba(255,255,255,0.015) 4px)",
            pointerEvents: "none",
          }}
        />
      </AbsoluteFill>

      {/* Subtitle */}
      {currentCue && (
        <SubtitleDisplay
          cue={currentCue}
          frame={frame}
          fps={fps}
          textScale={textScale}
          glowSize={glowSize}
          beat={beat}
          flashColor={flashColor}
        />
      )}

      {/* Vignette */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${vignetteOpacity}) 100%)`,
          pointerEvents: "none",
        }}
      />

      {/* Energy bar */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 4,
          background: "rgba(255,255,255,0.1)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${energy * 100}%`,
            background: flashColor,
            boxShadow: `0 0 10px ${flashColor}`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

/* ── Subtitle with spring word-by-word entrance ── */

const SubtitleDisplay: React.FC<{
  cue: SubtitleCue;
  frame: number;
  fps: number;
  textScale: number;
  glowSize: number;
  beat: number;
  flashColor: string;
}> = ({ cue, frame, fps, textScale, glowSize, beat, flashColor }) => {
  const cueStartFrame = Math.floor(cue.startTime * fps);
  const cueFrame = frame - cueStartFrame;

  const entrance = spring({
    frame: cueFrame,
    fps,
    config: { damping: 15, stiffness: 150, mass: 0.8 },
  });
  const translateY = interpolate(entrance, [0, 1], [60, 0]);
  const opacity = interpolate(entrance, [0, 1], [0, 1]);
  const words = cue.text.split(/\s+/);

  return (
    <AbsoluteFill
      style={{ justifyContent: "center", alignItems: "center", padding: "0 80px" }}
    >
      <div
        style={{
          transform: `scale(${textScale}) translateY(${translateY}px)`,
          opacity,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "12px 16px",
          maxWidth: "90%",
        }}
      >
        {words.map((word, i) => {
          const we = spring({
            frame: cueFrame - i * 2,
            fps,
            config: { damping: 12, stiffness: 200, mass: 0.5 },
          });
          return (
            <span
              key={`${cue.index}-${i}`}
              style={{
                fontFamily: "'Inter','SF Pro Display',-apple-system,sans-serif",
                fontSize: words.length > 6 ? 56 : 72,
                fontWeight: 900,
                color: "#fff",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                textShadow: `0 0 ${glowSize}px ${flashColor},0 0 ${glowSize * 2}px ${flashColor}40,0 2px 4px rgba(0,0,0,0.8)`,
                transform: `scale(${interpolate(we, [0, 1], [0.5, 1])})`,
                opacity: interpolate(we, [0, 1], [0, 1]),
                display: "inline-block",
                WebkitTextStroke: beat > 0.5 ? `1px ${flashColor}` : "none",
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* ── Beat particles ── */

const BeatParticles: React.FC<{ frame: number; beat: number }> = ({ frame, beat }) => {
  const particles = Array.from({ length: 12 }, (_, i) => {
    const seed = (frame * 7 + i * 13) % 100;
    return { x: (seed * 37) % 100, y: (seed * 53) % 100, size: 2 + (seed % 4) };
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
            backgroundColor: "#fff",
            opacity: beat * 0.6,
            boxShadow: `0 0 ${p.size * 2}px rgba(255,255,255,${beat * 0.5})`,
          }}
        />
      ))}
    </AbsoluteFill>
  );
};
