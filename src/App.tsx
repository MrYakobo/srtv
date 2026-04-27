import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { renderMediaOnWeb } from "@remotion/web-renderer";
import { FlashyVideo, type FlashyVideoProps } from "./FlashyVideo";
import { parseSrt, type SubtitleCue } from "./lib/parse-srt";
import { analyzeAudio, computeBeats } from "./lib/analyze-audio";
import { SrtEditor, cuesToSrt } from "./SrtEditor";
import { Zap, Music, Download, Loader, AlertCircle, Upload, Palette } from "lucide-react";

const FPS = 30;

const BG_SWATCHES = [
  "#0a0a0a", "#000000", "#0f172a", "#1a1a2e", "#0d1b2a",
  "#1b1b1b", "#2d1b69", "#0b132b", "#1a0000", "#0a1628",
];
const TEXT_SWATCHES = [
  "#ffffff", "#f8f8f8", "#e2e8f0", "#fbbf24", "#f472b6",
  "#a78bfa", "#34d399", "#60a5fa", "#fb923c", "#f87171",
];
const MIN_PANEL = 340;
const MAX_PANEL = 1200;
const DEFAULT_PANEL = 540;
const LS_KEY = "srtv-state";

interface SavedState {
  srtText: string;
  beatSensitivity: number;
  presetIdx: number;
  customW: number;
  customH: number;
  panelWidth: number;
  srtTab: "raw" | "editor";
  audioFileName?: string;
  bgColor: string;
  textColor: string;
  highlightIntensity: number;
}

function loadState(): Partial<SavedState> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

const PRESETS = [
  { label: "1080×1920 (9:16 Vertical)", w: 1080, h: 1920 },
  { label: "1920×1080 (16:9 Landscape)", w: 1920, h: 1080 },
  { label: "1080×1080 (1:1 Square)", w: 1080, h: 1080 },
  { label: "720×1280 (9:16 720p)", w: 720, h: 1280 },
  { label: "1280×720 (16:9 720p)", w: 1280, h: 720 },
  { label: "3840×2160 (16:9 4K)", w: 3840, h: 2160 },
  { label: "Custom", w: 0, h: 0 },
] as const;

const SAMPLE_SRT = `1
00:00:01,000 --> 00:00:04,000
Welcome to the show

2
00:00:04,500 --> 00:00:08,000
Feel the beat drop

3
00:00:08,500 --> 00:00:12,000
Let the music take control

4
00:00:12,500 --> 00:00:16,000
We are just getting started`;

export const App: React.FC = () => {
  const saved = useRef(loadState()).current;

  const [srtText, setSrtText] = useState(saved.srtText ?? SAMPLE_SRT);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [rawEnergies, setRawEnergies] = useState<number[]>([]);
  const [beatSensitivity, setBeatSensitivity] = useState(saved.beatSensitivity ?? 0.5);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [presetIdx, setPresetIdx] = useState(saved.presetIdx ?? 1);
  const [customW, setCustomW] = useState(saved.customW ?? 1920);
  const [customH, setCustomH] = useState(saved.customH ?? 1080);
  const [panelWidth, setPanelWidth] = useState(saved.panelWidth ?? DEFAULT_PANEL);
  const [srtTab, setSrtTab] = useState<"raw" | "editor">(saved.srtTab ?? "editor");
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState("");
  const [exportFrom, setExportFrom] = useState<string>("");
  const [exportTo, setExportTo] = useState<string>("");
  const [activeCueIndex, setActiveCueIndex] = useState(-1);
  const [liveMode, setLiveMode] = useState(false);
  const [liveCursor, setLiveCursor] = useState(0);
  const [bgColor, setBgColor] = useState(saved.bgColor ?? "#0a0a0a");
  const [textColor, setTextColor] = useState(saved.textColor ?? "#ffffff");
  const [highlightIntensity, setHighlightIntensity] = useState(saved.highlightIntensity ?? 0.5);
  const playerRef = useRef<PlayerRef>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const state: SavedState = { srtText, beatSensitivity, presetIdx, customW, customH, panelWidth, srtTab, audioFileName: audioFile?.name, bgColor, textColor, highlightIntensity };
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }, [srtText, beatSensitivity, presetIdx, customW, customH, panelWidth, srtTab, audioFile, bgColor, textColor, highlightIntensity]);

  const preset = PRESETS[presetIdx];
  const compWidth = preset.w || customW;
  const compHeight = preset.h || customH;
  const beats = useMemo(() => (rawEnergies.length > 0 ? computeBeats(rawEnergies, beatSensitivity) : []), [rawEnergies, beatSensitivity]);
  const subtitles = useMemo(() => { try { return parseSrt(srtText); } catch { return []; } }, [srtText]);
  const handleEditorChange = useCallback((cues: SubtitleCue[]) => { setSrtText(cuesToSrt(cues)); }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const handler = () => {
      const time = player.getCurrentFrame() / FPS;
      setActiveCueIndex(subtitles.findIndex((c) => time >= c.startTime && time <= c.endTime));
    };
    player.addEventListener("frameupdate", handler);
    return () => { player.removeEventListener("frameupdate", handler); };
  }, [subtitles]);

  useEffect(() => {
    if (!liveMode) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const player = playerRef.current;
      if (!player) return;
      const time = Math.round((player.getCurrentFrame() / FPS) * 1000) / 1000;
      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        if (liveCursor < subtitles.length) {
          setSrtText(cuesToSrt(subtitles.map((c, i) => i === liveCursor ? { ...c, startTime: time } : c)));
        }
      } else if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        if (liveCursor < subtitles.length) {
          setSrtText(cuesToSrt(subtitles.map((c, i) => {
            if (i === liveCursor) return { ...c, endTime: time };
            if (i === liveCursor + 1) return { ...c, startTime: time };
            return c;
          })));
          setLiveCursor((prev) => Math.min(prev + 1, subtitles.length - 1));
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => { window.removeEventListener("keydown", handler); };
  }, [liveMode, liveCursor, subtitles]);

  const handleAudio = useCallback(async (file: File) => {
    setError(""); setAudioFile(file); setAnalyzing(true);
    try {
      setAudioUrl(URL.createObjectURL(file));
      const result = await analyzeAudio(await file.arrayBuffer(), FPS);
      setRawEnergies(result.energies);
    } catch (err) { setError(`Failed to analyze audio: ${err instanceof Error ? err.message : "Unknown error"}`); }
    finally { setAnalyzing(false); }
  }, []);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) handleAudio(f); }, [handleAudio]);
  const [dragOver, setDragOver] = useState(false);
  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f?.type.startsWith("audio/")) handleAudio(f); }, [handleAudio]);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); dragging.current = true;
    const startX = e.clientX, startW = panelWidth;
    const onMove = (ev: MouseEvent) => { if (!dragging.current) return; setPanelWidth(Math.min(MAX_PANEL, Math.max(MIN_PANEL, startW + (ev.clientX - startX)))); };
    const onUp = () => { dragging.current = false; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp);
  }, [panelWidth]);

  const totalFrames = rawEnergies.length || Math.max(subtitles.length > 0 ? Math.ceil((subtitles[subtitles.length - 1].endTime + 2) * FPS) : 0, 300);
  const inputProps: FlashyVideoProps = { subtitles, audioSrc: audioUrl, energies: rawEnergies, beats, sensitivity: beatSensitivity, highlightIntensity, bgColor, textColor };

  const handleExport = useCallback(async () => {
    setExporting(true); setExportProgress(0); setExportError("");
    const from = exportFrom ? parseInt(exportFrom, 10) : undefined;
    const to = exportTo ? parseInt(exportTo, 10) : undefined;
    const frameRange: [number, number] | undefined = (from != null && !isNaN(from)) || (to != null && !isNaN(to))
      ? [from ?? 0, to ?? Math.max(totalFrames, 30) - 1] : undefined;
    try {
      const { getBlob } = await renderMediaOnWeb({
        composition: { component: FlashyVideo, durationInFrames: Math.max(totalFrames, 30), fps: FPS, width: compWidth, height: compHeight, id: "SRTV", defaultProps: inputProps },
        inputProps, container: "mp4", videoCodec: "h264", videoBitrate: "high", hardwareAcceleration: "prefer-hardware",
        frameRange,
        onProgress: ({ progress }) => { setExportProgress(Math.round(progress * 100)); },
      });
      const blob = await getBlob(); const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "srtv-export.mp4"; a.click(); URL.revokeObjectURL(url);
    } catch (err) { console.error("Export failed:", err); setExportError(err instanceof Error ? err.message : "Export failed"); }
    finally { setExporting(false); }
  }, [totalFrames, compWidth, compHeight, inputProps, exportFrom, exportTo]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0a0a0a", color: "#fff", overflow: "hidden" }}>
      {/* Header */}
      <header style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ width: 26, height: 26, borderRadius: 6, background: "linear-gradient(135deg,#ff006e,#8338ec)", display: "grid", placeItems: "center" }}>
          <Zap size={14} color="#fff" />
        </div>
        <h1 style={{ fontSize: 15, fontWeight: 700 }}>SRTV</h1>
      </header>

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Left: Cue editor */}
        <div style={{ flex: `0 0 ${panelWidth}px`, display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.08)", minHeight: 0 }}>
          <div style={{ padding: "10px 14px 6px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: 2 }}>
              {(["editor", "raw"] as const).map((tab) => (
                <button key={tab} onClick={() => setSrtTab(tab)} style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, border: "none", borderRadius: 5, cursor: "pointer", background: srtTab === tab ? "rgba(255,255,255,0.1)" : "transparent", color: srtTab === tab ? "#fff" : "rgba(255,255,255,0.4)" }}>
                  {tab === "editor" ? "Editor" : "Raw"}
                </button>
              ))}
            </div>
            <button onClick={() => { setLiveMode((v) => !v); setLiveCursor(0); }} style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, border: "none", borderRadius: 6, cursor: "pointer", background: liveMode ? "rgba(255,190,11,0.2)" : "rgba(255,255,255,0.06)", color: liveMode ? "#ffbe0b" : "rgba(255,255,255,0.4)" }}>
              {liveMode ? "● Live" : "Live Mode"}
            </button>
          </div>
          {liveMode && (
            <div style={{ margin: "0 14px 6px", padding: "6px 10px", background: "rgba(255,190,11,0.06)", border: "1px solid rgba(255,190,11,0.15)", borderRadius: 6, fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, flexShrink: 0 }}>
              <kbd style={{ padding: "1px 4px", background: "rgba(255,255,255,0.1)", borderRadius: 3, fontFamily: "monospace", fontWeight: 700 }}>I</kbd> start · <kbd style={{ padding: "1px 4px", background: "rgba(255,255,255,0.1)", borderRadius: 3, fontFamily: "monospace", fontWeight: 700 }}>O</kbd> end+next — cue <strong style={{ color: "#ffbe0b" }}>#{liveCursor + 1}</strong>
            </div>
          )}
          <div style={{ flex: 1, minHeight: 0, padding: "0 14px 10px", display: "flex", flexDirection: "column" }}>
            {srtTab === "raw" ? (
              <textarea value={srtText} onChange={(e) => setSrtText(e.target.value)} spellCheck={false} style={{ flex: 1, width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "10px 12px", color: "#fff", fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 12, lineHeight: 1.6, resize: "none" }} placeholder="Paste your SRT here…" />
            ) : (
              <SrtEditor cues={subtitles} onChange={handleEditorChange} activeCueIndex={activeCueIndex} liveCueIndex={liveMode ? liveCursor : undefined} onSelectCue={liveMode ? (i) => setLiveCursor(i) : undefined} />
            )}
          </div>
        </div>

        {/* Resize handle */}
        <div onMouseDown={onResizeStart} style={{ flex: "0 0 8px", cursor: "col-resize", display: "flex", alignItems: "center", justifyContent: "center", userSelect: "none" }}>
          <div style={{ width: 3, height: 40, borderRadius: 2, background: "rgba(255,255,255,0.12)" }} />
        </div>

        {/* Right: Preview + controls */}
        <div style={{ flex: 1, minWidth: 280, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Preview */}
          <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "center", padding: 14 }}>
            <Player ref={playerRef} component={FlashyVideo} inputProps={inputProps} durationInFrames={Math.max(totalFrames, 30)} compositionWidth={compWidth} compositionHeight={compHeight} fps={FPS}
              style={{ width: compWidth >= compHeight ? 460 : Math.round(460 * (compWidth / compHeight)), height: compWidth >= compHeight ? Math.round(460 * (compHeight / compWidth)) : 460, maxWidth: "100%", borderRadius: 8, overflow: "hidden" }}
              controls loop
            />
          </div>

          {/* Export */}
          <section>
            <Label>Export</Label>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <input type="number" min={0} max={totalFrames - 1} value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} placeholder={`From (0)`} style={{ width: "100%", padding: "6px 8px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#fff", fontSize: 12 }} />
              </div>
              <div style={{ flex: 1 }}>
                <input type="number" min={0} max={totalFrames - 1} value={exportTo} onChange={(e) => setExportTo(e.target.value)} placeholder={`To (${totalFrames - 1})`} style={{ width: "100%", padding: "6px 8px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#fff", fontSize: 12 }} />
              </div>
              <Hint style={{ marginTop: 0, display: "flex", alignItems: "center", whiteSpace: "nowrap", color: "rgba(255,255,255,0.25)" }}>frames</Hint>
            </div>
            <button onClick={handleExport} disabled={exporting || totalFrames <= 30} style={{ width: "100%", padding: "12px", background: exporting ? "rgba(131,56,236,0.3)" : "linear-gradient(135deg,#8338ec,#ff006e)", border: "none", borderRadius: 8, color: "#fff", fontSize: 13, fontWeight: 700, cursor: exporting || totalFrames <= 30 ? "not-allowed" : "pointer", opacity: totalFrames <= 30 ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {exporting ? <><Loader size={14} style={{ animation: "spin 1s linear infinite" }} /> Exporting… {exportProgress}%</> : <><Download size={14} /> Export to MP4</>}
            </button>
          </section>
          {exporting && <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}><div style={{ height: "100%", width: `${exportProgress}%`, background: "linear-gradient(90deg,#8338ec,#ff006e)", transition: "width .3s" }} /></div>}
          {exportError && <StatusBox icon={<AlertCircle size={13} />} color="#e63946" bg="rgba(230,57,70,0.12)">{exportError}</StatusBox>}

          {/* Audio */}
          <section>
            <Label>Audio</Label>
            <label onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 16, background: dragOver ? "rgba(131,56,236,0.12)" : "rgba(255,255,255,0.04)", border: `2px dashed ${dragOver ? "#8338ec" : "rgba(255,255,255,0.15)"}`, borderRadius: 8, cursor: "pointer" }}>
              <input type="file" accept="audio/*" onChange={onFileChange} style={{ display: "none" }} />
              {audioFile ? <Music size={16} color="rgba(255,255,255,0.5)" /> : <Upload size={16} color="rgba(255,255,255,0.4)" />}
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{audioFile ? audioFile.name : "Click or drag audio"}</span>
            </label>
            {analyzing && <StatusBox icon={<Loader size={13} style={{ animation: "spin 1s linear infinite" }} />} color="#a855f7" bg="rgba(131,56,236,0.12)">Analyzing…</StatusBox>}
            {error && <StatusBox icon={<AlertCircle size={13} />} color="#e63946" bg="rgba(230,57,70,0.12)">{error}</StatusBox>}
          </section>

          {/* Beat sensitivity */}
          <section style={{ opacity: rawEnergies.length > 0 ? 1 : 0.35, transition: "opacity .2s" }}>
            <Label>Beat Sensitivity</Label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Subtle</span>
              <input type="range" min={0} max={1} step={0.01} value={beatSensitivity} onChange={(e) => setBeatSensitivity(Number(e.target.value))} disabled={rawEnergies.length === 0} style={{ flex: 1, accentColor: "#8338ec", cursor: rawEnergies.length > 0 ? "pointer" : "not-allowed" }} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Intense</span>
            </div>
          </section>

          {/* Colors */}
          <section>
            <Label>Background</Label>
            <SwatchPicker value={bgColor} onChange={setBgColor} swatches={BG_SWATCHES} />
          </section>
          <section>
            <Label>Highlight</Label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>None</span>
              <input type="range" min={0} max={1} step={0.01} value={highlightIntensity} onChange={(e) => setHighlightIntensity(Number(e.target.value))} style={{ flex: 1, accentColor: "#8338ec", cursor: "pointer" }} />
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Bright</span>
            </div>
          </section>
          <section>
            <Label>Text</Label>
            <SwatchPicker value={textColor} onChange={setTextColor} swatches={TEXT_SWATCHES} />
          </section>

          {/* Resolution */}
          <section>
            <Label>Resolution</Label>
            <select value={presetIdx} onChange={(e) => { const idx = Number(e.target.value); setPresetIdx(idx); const p = PRESETS[idx]; if (p.w) { setCustomW(p.w); setCustomH(p.h); } }} style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7, color: "#fff", fontSize: 12, cursor: "pointer", appearance: "none", WebkitAppearance: "none", backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='rgba(255,255,255,0.4)' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}>
              {PRESETS.map((p, i) => (<option key={i} value={i} style={{ background: "#1a1a1a" }}>{p.label}</option>))}
            </select>
            {preset.label === "Custom" && (
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <input type="number" min={100} max={7680} value={customW} onChange={(e) => setCustomW(Math.max(100, Number(e.target.value)))} placeholder="W" style={{ flex: 1, padding: "6px 8px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#fff", fontSize: 12 }} />
                <input type="number" min={100} max={7680} value={customH} onChange={(e) => setCustomH(Math.max(100, Number(e.target.value)))} placeholder="H" style={{ flex: 1, padding: "6px 8px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, color: "#fff", fontSize: 12 }} />
              </div>
            )}
            <Hint>{compWidth}×{compHeight}</Hint>
          </section>
        </div>
      </div>
    </div>
  );
};

const Label: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.45)", marginBottom: 6, ...style }}>{children}</div>
);
const Hint: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4, ...style }}>{children}</div>
);
const StatusBox: React.FC<{ icon?: React.ReactNode; color: string; bg: string; children: React.ReactNode }> = ({ icon, color, bg, children }) => (
  <div style={{ marginTop: 6, padding: "6px 10px", background: bg, borderRadius: 6, fontSize: 12, color, display: "flex", alignItems: "center", gap: 6 }}>{icon}{children}</div>
);

const SwatchPicker: React.FC<{ value: string; onChange: (v: string) => void; swatches: string[] }> = ({ value, onChange, swatches }) => {
  const [showCustom, setShowCustom] = useState(false);
  const isCustom = !swatches.includes(value);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {swatches.map((c) => (
        <button
          key={c}
          onClick={() => { onChange(c); setShowCustom(false); }}
          style={{
            width: 24, height: 24, borderRadius: 6, border: value === c ? "2px solid #fff" : "2px solid rgba(255,255,255,0.12)",
            background: c, cursor: "pointer", padding: 0, boxShadow: value === c ? "0 0 0 1px rgba(0,0,0,0.5)" : "none",
            transition: "border-color .15s",
          }}
          title={c}
        />
      ))}
      {/* Custom color toggle */}
      <button
        onClick={() => setShowCustom((v) => !v)}
        style={{
          width: 24, height: 24, borderRadius: 6,
          border: (showCustom || isCustom) ? "2px solid #fff" : "2px solid rgba(255,255,255,0.12)",
          background: isCustom ? value : "conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
          cursor: "pointer", padding: 0, display: "grid", placeItems: "center",
        }}
        title="Custom color"
      >
        {!isCustom && <Palette size={12} color="rgba(255,255,255,0.7)" />}
      </button>
      {showCustom && (
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 28, height: 24, border: "none", borderRadius: 4, padding: 0, cursor: "pointer", background: "none" }}
        />
      )}
    </div>
  );
};
