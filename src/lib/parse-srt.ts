export interface SubtitleCue {
  index: number;
  startTime: number; // seconds
  endTime: number; // seconds
  text: string;
}

function parseTimestamp(ts: string): number {
  // Format: HH:MM:SS,mmm
  const [time, ms] = ts.trim().split(",");
  const [h, m, s] = time.split(":").map(Number);
  return h * 3600 + m * 60 + s + Number(ms) / 1000;
}

export function parseSrt(srt: string): SubtitleCue[] {
  const blocks = srt
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n\n+/);

  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 2) continue;

    const index = parseInt(lines[0], 10);
    if (isNaN(index)) continue;

    const timeLine = lines[1];
    const match = timeLine.match(
      /(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/,
    );
    if (!match) continue;

    const startTime = parseTimestamp(match[1]);
    const endTime = parseTimestamp(match[2]);
    const text = lines.length > 2 ? lines.slice(2).join("\n") : "";

    cues.push({ index, startTime, endTime, text });
  }

  return cues;
}
