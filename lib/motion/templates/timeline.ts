import type { TimelineMotionGraphicRequest } from "../types";
import { box, dot, line, palette, phase, reveal, scenePng, text } from "./packDrawing";

export function createTimelinePng(width: number, height: number, graphic: TimelineMotionGraphicRequest, p: number) {
  return scenePng(width, height, p, c => {
    const count = graphic.events.length, gap = 215;
    const top = 950 - (count - 1) * gap / 2;
    line(c, 440, top, 440, top + gap * (count - 1), 1, palette.border);
    line(c, 440, top, 440, top + gap * (count - 1), phase(p, 0.14, 0.73));
    graphic.events.forEach((event, i) => {
      const r = reveal(p, i, count), y = top + gap * i;
      c.save(); c.globalAlpha *= r;
      dot(c, 440, y, 10 + r * 5);
      text(c, event.when, 265, y, 31, palette.secondary, 245);
      c.translate((1 - r) * 65, 0);
      box(c, 510, y - 60, 420, 120, palette.card, palette.border, 22);
      text(c, event.label, 720, y, 30, palette.ink, 365);
      c.restore();
    });
  });
}
