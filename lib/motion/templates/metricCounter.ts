import type { MetricCounterMotionGraphicRequest } from "../types";
import { box, dot, ease, line, palette, phase, scenePng, text } from "./packDrawing";

export function createMetricCounterPng(width: number, height: number, graphic: MetricCounterMotionGraphicRequest, p: number) {
  return scenePng(width, height, p, c => {
    const count = ease(phase(p, 0.24, 0.78));
    const value = graphic.from + (graphic.to - graphic.from) * count;
    const decimals = Math.min(4, Math.max(...[graphic.from, graphic.to].map(n => (String(n).split(".")[1] ?? "").length)));
    const format = (n: number) => n.toLocaleString("es-MX", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    box(c, 115, 530, 850, 780, palette.card, palette.border, 52);
    text(c, format(value), 540, 810, 152, palette.accent, 730);
    if (graphic.unit) text(c, graphic.unit, 540, 935, 42, palette.ink, 600);
    text(c, graphic.label, 540, 1010, 30, palette.muted, 710);
    const y1 = graphic.to >= graphic.from ? 1205 : 1135;
    const y2 = graphic.to >= graphic.from ? 1135 : 1205;
    line(c, 235, y1, 845, y2, 1, palette.border);
    line(c, 235, y1, 845, y2, count);
    dot(c, 235 + 610 * count, y1 + (y2 - y1) * count, 13);
    text(c, format(graphic.from), 235, 1380, 30, palette.muted, 300);
    text(c, format(graphic.to), 845, 1380, 30, palette.ink, 300);
    line(c, 430, 1380, 650, 1380, 1, palette.border);
    line(c, 630, 1365, 650, 1380); line(c, 630, 1395, 650, 1380);
  });
}
