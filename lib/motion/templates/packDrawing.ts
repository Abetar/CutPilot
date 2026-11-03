// Drawing primitives for the new pack only. Existing templates keep their design.
export const palette = {
  background: "#05080c", card: "#121b27", border: "#2a3647",
  ink: "#f1f5f9", muted: "#8392a6", accent: "#bef264", secondary: "#c4b5fd",
};

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const phase = (p: number, start: number, end: number) => clamp01((p - start) / (end - start));
export const ease = (p: number) => 1 - Math.pow(1 - clamp01(p), 3);
export const reveal = (p: number, index: number, count: number) =>
  ease(phase(p, 0.1 + index * 0.64 / count, 0.1 + (index + 0.8) * 0.64 / count));

export function box(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  fill = palette.card, stroke = palette.border, radius = 24) {
  c.beginPath(); c.roundRect(x, y, w, h, Math.min(radius, w / 2, h / 2));
  c.fillStyle = fill; c.fill();
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = 3; c.stroke(); }
}

export function text(c: CanvasRenderingContext2D, value: string, x: number, y: number,
  size = 34, color = palette.ink, maxWidth = 700) {
  c.save(); c.textAlign = "center"; c.textBaseline = "middle";
  let fitted = size;
  do { c.font = `700 ${fitted}px Arial, sans-serif`; if (c.measureText(value).width <= maxWidth) break; fitted -= 1; } while (fitted > 16);
  c.fillStyle = color; c.fillText(value, x, y, maxWidth); c.restore();
}

export function line(c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number,
  progress = 1, color = palette.accent) {
  c.beginPath(); c.moveTo(x1, y1);
  c.lineTo(x1 + (x2 - x1) * clamp01(progress), y1 + (y2 - y1) * clamp01(progress));
  c.lineWidth = 5; c.lineCap = "round"; c.strokeStyle = color; c.stroke();
}

export function dot(c: CanvasRenderingContext2D, x: number, y: number, r = 10, color = palette.accent) {
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = color; c.fill();
}

export function cursor(c: CanvasRenderingContext2D, x: number, y: number, pulse = 0) {
  if (pulse > 0) { c.save(); c.globalAlpha *= 1 - pulse; c.beginPath(); c.arc(x, y, 12 + pulse * 45, 0, Math.PI * 2); c.strokeStyle = palette.accent; c.lineWidth = 5; c.stroke(); c.restore(); }
  c.beginPath(); c.moveTo(x, y); c.lineTo(x + 12, y + 52); c.lineTo(x + 24, y + 34);
  c.lineTo(x + 43, y + 31); c.closePath(); c.fillStyle = palette.ink; c.fill();
  c.strokeStyle = palette.background; c.lineWidth = 3; c.stroke();
}

export function browser(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  box(c, x, y, w, h);
  for (let i = 0; i < 3; i++) dot(c, x + 32 + i * 22, y + 32, 5, palette.muted);
  box(c, x + w * 0.3, y + 20, w * 0.55, 24, palette.background, "", 12);
  line(c, x, y + 64, x + w, y + 64, 1, palette.border);
}

// Icons are deterministic vector geometry, never model-supplied SVG or markup.
export function icon(c: CanvasRenderingContext2D, kind: string, x: number, y: number, size = 64) {
  c.save(); c.translate(x - size / 2, y - size / 2); c.scale(size / 64, size / 64);
  c.strokeStyle = palette.accent; c.fillStyle = palette.accent; c.lineWidth = 4;
  if (kind === "USER") {
    c.beginPath(); c.arc(32, 18, 10, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(32, 58, 22, Math.PI, 0); c.stroke();
  } else if (kind === "DATABASE" || kind === "DATA") {
    for (const yy of [14, 32, 50]) { c.beginPath(); c.ellipse(32, yy, 23, 9, 0, 0, Math.PI * 2); c.stroke(); }
    line(c, 9, 14, 9, 50); line(c, 55, 14, 55, 50);
  } else if (kind === "AI") {
    c.beginPath(); c.moveTo(32, 3); c.lineTo(40, 24); c.lineTo(61, 32);
    c.lineTo(40, 40); c.lineTo(32, 61); c.lineTo(24, 40); c.lineTo(3, 32); c.lineTo(24, 24); c.closePath(); c.stroke();
  } else if (kind === "API" || kind === "LOGIC") {
    c.beginPath(); c.moveTo(22, 14); c.lineTo(6, 32); c.lineTo(22, 50);
    c.moveTo(42, 14); c.lineTo(58, 32); c.lineTo(42, 50); c.moveTo(37, 9); c.lineTo(27, 55); c.stroke();
  } else if (kind === "CHART") {
    for (let i = 0; i < 3; i++) box(c, 6 + i * 19, 42 - i * 12, 12, 16 + i * 12, palette.accent, "", 3);
  } else if (kind === "INFRASTRUCTURE") {
    for (let i = 0; i < 3; i++) { box(c, 6, 7 + i * 18, 52, 14, palette.card, palette.accent, 4); dot(c, 48, 14 + i * 18, 2); }
  } else {
    box(c, 5, 8, 54, 48, palette.card, palette.accent, 7);
    line(c, 5, 22, 59, 22, 1, palette.accent);
    line(c, 15, 34, 42, 34, 1, palette.muted); line(c, 15, 44, 32, 44, 1, palette.muted);
  }
  c.restore();
}

export async function scenePng(width: number, height: number, progress: number,
  draw: (c: CanvasRenderingContext2D) => void): Promise<Uint8Array> {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("No se pudo crear el Canvas de Motion Pack.");
  c.globalAlpha = ease(phase(progress, 0, 0.07)) * (1 - phase(progress, 0.94, 1));
  c.fillStyle = palette.background; c.fillRect(0, 0, width, height);
  const scale = Math.min(width / 1080, height / 1920);
  c.translate((width - 1080 * scale) / 2, (height - 1920 * scale) / 2); c.scale(scale, scale);
  const glow = c.createRadialGradient(540, 900, 0, 540, 900, 650);
  glow.addColorStop(0, "rgba(190,242,100,0.055)"); glow.addColorStop(1, "rgba(190,242,100,0)");
  c.fillStyle = glow; c.fillRect(0, 0, 1080, 1920); draw(c);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    result => result ? resolve(result) : reject(new Error("No se pudo generar el frame Motion Pack.")), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}
