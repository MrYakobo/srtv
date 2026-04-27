import React, { useCallback, useEffect, useRef, useState } from "react";
import type { SubtitleCue } from "./lib/parse-srt";

interface SrtEditorProps {
  cues: SubtitleCue[];
  onChange: (cues: SubtitleCue[]) => void;
  activeCueIndex?: number;
  liveCueIndex?: number;
  onSelectCue?: (index: number) => void;
}

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function parseTime(str: string): number {
  const match = str.match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

export function cuesToSrt(cues: SubtitleCue[]): string {
  return cues.map((c, i) => `${i + 1}\n${formatTime(c.startTime)} --> ${formatTime(c.endTime)}\n${c.text}`).join("\n\n");
}

const COLS = "36px 1fr 156px 156px 28px";

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 6,
  padding: "5px 8px",
  color: "#fff",
  fontSize: 12,
  fontFamily: "'JetBrains Mono','Fira Code',monospace",
};

const btnStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 6,
  color: "rgba(255,255,255,0.5)",
  cursor: "pointer",
  fontSize: 12,
  padding: "4px 10px",
  transition: "all .15s",
};

const menuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "6px 14px",
  background: "none",
  border: "none",
  color: "rgba(255,255,255,0.8)",
  fontSize: 12,
  textAlign: "left",
  cursor: "pointer",
  borderRadius: 4,
  whiteSpace: "nowrap",
};

interface CtxMenu {
  x: number;
  y: number;
  cueIndex: number;
}

export const SrtEditor: React.FC<SrtEditorProps> = ({
  cues,
  onChange,
  activeCueIndex,
  liveCueIndex,
  onSelectCue,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [ctx, setCtx] = useState<CtxMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click or scroll
  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("click", close); window.removeEventListener("scroll", close, true); };
  }, [ctx]);

  // Auto-scroll active row into view
  useEffect(() => {
    const idx = activeCueIndex ?? liveCueIndex;
    if (idx == null || idx < 0) return;
    const row = rowRefs.current.get(idx);
    if (row && scrollRef.current) {
      const container = scrollRef.current;
      const rowTop = row.offsetTop - container.offsetTop;
      const rowBottom = rowTop + row.offsetHeight;
      if (rowTop < container.scrollTop || rowBottom > container.scrollTop + container.clientHeight) {
        row.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [activeCueIndex, liveCueIndex]);

  const update = useCallback(
    (index: number, patch: Partial<SubtitleCue>) => {
      onChange(cues.map((c, i) => (i === index ? { ...c, ...patch } : c)));
    },
    [cues, onChange],
  );

  const remove = useCallback(
    (index: number) => {
      onChange(cues.filter((_, i) => i !== index).map((c, i) => ({ ...c, index: i + 1 })));
    },
    [cues, onChange],
  );

  const insertAt = useCallback(
    (position: number) => {
      const prev = cues[position - 1];
      const next = cues[position];
      const start = prev ? prev.endTime : 0;
      const end = next ? next.startTime : start + 3;
      const newCue: SubtitleCue = { index: 0, startTime: start, endTime: Math.max(end, start + 0.5), text: "" };
      const updated = [...cues.slice(0, position), newCue, ...cues.slice(position)].map((c, i) => ({ ...c, index: i + 1 }));
      onChange(updated);
    },
    [cues, onChange],
  );

  const add = useCallback(() => {
    const last = cues[cues.length - 1];
    const start = last ? last.endTime + 0.5 : 0;
    onChange([...cues, { index: cues.length + 1, startTime: start, endTime: start + 3, text: "" }]);
  }, [cues, onChange]);

  const nudge = useCallback(
    (index: number, field: "startTime" | "endTime", delta: number) => {
      update(index, { [field]: Math.round(Math.max(0, cues[index][field] + delta) * 1000) / 1000 });
    },
    [cues, update],
  );

  const onContextMenu = useCallback((e: React.MouseEvent, i: number) => {
    e.preventDefault();
    e.stopPropagation();
    setCtx({ x: e.clientX, y: e.clientY, cueIndex: i });
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minHeight: 0, position: "relative" }}>
      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 6, padding: "0 0 4px", borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255,255,255,0.35)" }}>
        <span>#</span><span>Text</span><span>Start</span><span>End</span><span />
      </div>

      {/* Rows */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
        {cues.map((cue, i) => {
          const isActive = activeCueIndex === i;
          const isLiveTarget = liveCueIndex === i;
          return (
            <div
              key={i}
              ref={(el) => { if (el) rowRefs.current.set(i, el); else rowRefs.current.delete(i); }}
              onClick={() => onSelectCue?.(i)}
              onContextMenu={(e) => onContextMenu(e, i)}
              style={{
                display: "grid", gridTemplateColumns: COLS, gap: 6, alignItems: "center",
                padding: "3px 4px", borderRadius: 6,
                cursor: onSelectCue ? "pointer" : undefined,
                background: isActive ? "rgba(131,56,236,0.18)" : isLiveTarget ? "rgba(255,190,11,0.12)" : "transparent",
                border: isLiveTarget ? "1px solid rgba(255,190,11,0.3)" : "1px solid transparent",
                transition: "background .15s, border-color .15s",
              }}
            >
              <span style={{ fontSize: 11, color: isActive ? "#a855f7" : isLiveTarget ? "#ffbe0b" : "rgba(255,255,255,0.3)", textAlign: "center", fontWeight: isActive || isLiveTarget ? 700 : 400, userSelect: "none" }} title="Right-click for options">
                {isLiveTarget ? "▸" : ""}{i + 1}
              </span>

              <input value={cue.text} onChange={(e) => update(i, { text: e.target.value })} onClick={(e) => e.stopPropagation()} style={{ ...inputStyle, width: "100%" }} placeholder="Subtitle text…" />

              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <button onClick={(e) => { e.stopPropagation(); nudge(i, "startTime", -0.1); }} style={{ ...btnStyle, padding: "3px 5px", fontSize: 10, flexShrink: 0 }} title="-0.1s">◀</button>
                <input value={formatTime(cue.startTime)} onChange={(e) => { const t = parseTime(e.target.value); if (t >= 0) update(i, { startTime: t }); }} onClick={(e) => e.stopPropagation()} style={{ ...inputStyle, width: "100%", minWidth: 0, textAlign: "center", fontSize: 11 }} />
                <button onClick={(e) => { e.stopPropagation(); nudge(i, "startTime", 0.1); }} style={{ ...btnStyle, padding: "3px 5px", fontSize: 10, flexShrink: 0 }} title="+0.1s">▶</button>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <button onClick={(e) => { e.stopPropagation(); nudge(i, "endTime", -0.1); }} style={{ ...btnStyle, padding: "3px 5px", fontSize: 10, flexShrink: 0 }} title="-0.1s">◀</button>
                <input value={formatTime(cue.endTime)} onChange={(e) => { const t = parseTime(e.target.value); if (t >= 0) update(i, { endTime: t }); }} onClick={(e) => e.stopPropagation()} style={{ ...inputStyle, width: "100%", minWidth: 0, textAlign: "center", fontSize: 11 }} />
                <button onClick={(e) => { e.stopPropagation(); nudge(i, "endTime", 0.1); }} style={{ ...btnStyle, padding: "3px 5px", fontSize: 10, flexShrink: 0 }} title="+0.1s">▶</button>
              </div>

              <button onClick={(e) => { e.stopPropagation(); remove(i); }} style={{ ...btnStyle, padding: "3px 6px", color: "rgba(230,57,70,0.7)", fontSize: 13, lineHeight: 1 }} title="Delete cue">×</button>
            </div>
          );
        })}
      </div>

      {/* Add at end */}
      <button onClick={add} style={{ ...btnStyle, marginTop: 2, padding: "6px 0", textAlign: "center", width: "100%", color: "rgba(255,255,255,0.5)", flexShrink: 0 }}>+ Add cue</button>

      {/* Context menu */}
      {ctx && (
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            left: ctx.x,
            top: ctx.y,
            zIndex: 9999,
            background: "#1e1e1e",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8,
            padding: "4px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
            minWidth: 180,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            style={menuItemStyle}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "rgba(255,255,255,0.08)"; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "none"; }}
            onClick={() => { insertAt(ctx.cueIndex); setCtx(null); }}
          >
            Insert above cue {ctx.cueIndex + 1}
          </button>
          <button
            style={menuItemStyle}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "rgba(255,255,255,0.08)"; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "none"; }}
            onClick={() => { insertAt(ctx.cueIndex + 1); setCtx(null); }}
          >
            Insert below cue {ctx.cueIndex + 1}
          </button>
          <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "4px 0" }} />
          <button
            style={{ ...menuItemStyle, color: "#e63946" }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "rgba(230,57,70,0.12)"; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "none"; }}
            onClick={() => { remove(ctx.cueIndex); setCtx(null); }}
          >
            Delete cue {ctx.cueIndex + 1}
          </button>
        </div>
      )}
    </div>
  );
};
