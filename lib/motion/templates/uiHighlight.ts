import type { UiHighlightMotionGraphicRequest } from "../types";
import { box, browser, cursor, ease, icon, palette, phase, scenePng, text } from "./packDrawing";

export function createUiHighlightPng(width: number, height: number, graphic: UiHighlightMotionGraphicRequest, p: number) {
  return scenePng(width, height, p, c => {
    const sequence = phase(p, 0.18, 0.82) * graphic.focus.length;
    const step = Math.min(graphic.focus.length - 1, Math.floor(sequence));
    const active = graphic.focus[step];
    const zoom = ease(phase(sequence - step, 0, 0.25));
    browser(c, 120, 420, 840, 960);
    const top = graphic.surface === "LANDING" ? 760 : 600;
    const gap = Math.min(180, 580 / graphic.elements.length);
    if (graphic.surface === "LANDING") {
      box(c, 180, 535, 720, 155, palette.background, "");
      box(c, 235, 565, 610, 30, palette.border, "");
      box(c, 300, 620, 480, 18, palette.border, "");
    }
    if (graphic.surface === "DASHBOARD") {
      for (let i = 0; i < 4; i++) box(c, 150, 545 + i * 180, 45, 45, palette.border, "", 8);
    }
    graphic.elements.forEach((element, i) => {
      const focused = i === active && p >= 0.18;
      const y = top + i * gap;
      c.save(); c.globalAlpha *= focused ? 1 : 0.42;
      c.translate(540, y); const scale = focused ? 1 + zoom * 0.055 : 1; c.scale(scale, scale);
      box(c, -310, -53, 620, 106, element.role === "BUTTON" && focused ? palette.accent : palette.background,
        focused ? palette.accent : palette.border, 18);
      if (element.role === "CHART") icon(c, "CHART", -235, 0, 60);
      else if (element.role === "INPUT") lineInput(c, -260, 26, focused ? zoom : 0);
      text(c, element.label, element.role === "CHART" ? 35 : 0, -4, 30,
        element.role === "BUTTON" && focused ? palette.background : palette.ink, 460);
      c.restore();
    });
    const prev = step > 0 ? graphic.focus[step - 1] : active;
    const cursorY = top + (prev + (active - prev) * zoom) * gap;
    cursor(c, 775, cursorY + 12, phase(sequence - step, 0.35, 0.9));
  });
}

function lineInput(c: CanvasRenderingContext2D, x: number, y: number, p: number) {
  box(c, x, y, 520 * Math.max(0.05, p), 4, palette.accent, "", 2);
}
