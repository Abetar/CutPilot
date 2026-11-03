import type { FunnelFlowMotionGraphicRequest } from "../types";
import { dot, line, palette, phase, reveal, scenePng, text } from "./packDrawing";

export function createFunnelFlowPng(width: number, height: number, graphic: FunnelFlowMotionGraphicRequest, p: number) {
  return scenePng(width, height, p, c => {
    const count = graphic.stages.length;
    const gap = 210;
    const top = 950 - ((count - 1) * gap + 135) / 2;
    graphic.stages.forEach((stage, i) => {
      const r = reveal(p, i, count), y = top + i * gap;
      const w = 840 - i * 110, bottom = w - 65;
      c.save(); c.globalAlpha *= r; c.translate(0, (1 - r) * -25);
      c.beginPath(); c.moveTo(540 - w / 2, y); c.lineTo(540 + w / 2, y);
      c.lineTo(540 + bottom / 2, y + 135); c.lineTo(540 - bottom / 2, y + 135); c.closePath();
      c.fillStyle = palette.card; c.fill(); c.strokeStyle = i === count - 1 ? palette.accent : palette.secondary; c.lineWidth = 3; c.stroke();
      text(c, stage, 540, y + 65, 34, palette.ink, bottom - 60);
      c.restore();
      if (i < count - 1) {
        const next = reveal(p, i + 1, count);
        c.save(); c.globalAlpha *= r;
        for (const offset of [-60, 0, 60]) {
          line(c, 540 + offset, y + 145, 540 + offset * 0.8, y + gap - 12, next, palette.border);
          const travel = phase(p, 0.1 + (i + 0.6) * 0.64 / count, 0.1 + (i + 1.6) * 0.64 / count);
          if (travel > 0 && travel < 1) dot(c, 540 + offset * (1 - travel * 0.2), y + 145 + travel * (gap - 157), 6);
        }
        c.restore();
      }
    });
  });
}
