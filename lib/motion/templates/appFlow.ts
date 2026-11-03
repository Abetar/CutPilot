import type { AppFlowMotionGraphicRequest } from "../types";
import { box, browser, cursor, dot, ease, palette, phase, scenePng, text } from "./packDrawing";

export function createAppFlowPng(width: number, height: number, graphic: AppFlowMotionGraphicRequest, p: number) {
  return scenePng(width, height, p, c => {
    const sequence = phase(p, 0.12, 0.81) * graphic.screens.length;
    const active = Math.min(graphic.screens.length - 1, Math.floor(sequence));
    const local = Math.min(1, sequence - active);
    browser(c, 165, 435, 750, 890);
    // Clip transitions to the same interface, rather than showing text slides.
    c.save(); c.beginPath(); c.rect(185, 510, 710, 790); c.clip();
    graphic.screens.forEach((screen, i) => {
      if (i !== active) return;
      c.save(); c.translate((1 - ease(phase(local, 0, 0.25))) * 120, 0);
      text(c, screen.name, 540, 580, 34, palette.ink, 600);
      box(c, 225, 650, 630, 220, palette.background, "", 20);
      for (let row = 0; row < 3; row++) {
        box(c, 255, 685 + row * 54, 40, 32, i > 0 ? palette.accent : palette.border, "", 8);
        box(c, 320, 690 + row * 54, 400 - row * 55, 20, palette.border, "", 8);
      }
      box(c, 255, 920, 570, 64, palette.background);
      box(c, 255, 1020, 570, 96, palette.accent, "", 20);
      text(c, screen.action, 540, 1068, 31, palette.background, 500);
      cursor(c, 770 - ease(phase(local, 0.2, 0.65)) * 210,
        1210 - ease(phase(local, 0.2, 0.65)) * 145, phase(local, 0.65, 0.93));
      c.restore();
    });
    c.restore();
    graphic.screens.forEach((_, i) => dot(c, 540 + (i - (graphic.screens.length - 1) / 2) * 44, 1390, i === active ? 9 : 5, i <= active ? palette.accent : palette.border));
  });
}
