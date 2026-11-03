import type { BeforeAfterMotionGraphicRequest, BeforeAfterState } from "../types";
import { box, browser, dot, ease, icon, line, palette, phase, scenePng, text } from "./packDrawing";

function positions(state: BeforeAfterState) {
  if (state === "FRAGMENTED") return [[300, 720], [690, 640], [400, 1020], [755, 990]];
  return [[340, 735], [740, 735], [340, 1035], [740, 1035]];
}

export function createBeforeAfterPng(width: number, height: number, graphic: BeforeAfterMotionGraphicRequest, p: number) {
  return scenePng(width, height, p, c => {
    const change = ease(phase(p, 0.38, 0.68));
    const from = positions(graphic.before.state), to = positions(graphic.after.state);
    const connected = (s: BeforeAfterState) => s === "ORGANIZED" || s === "ACTIVE" ? 1 : 0;
    const connection = connected(graphic.before.state) * (1 - change) + connected(graphic.after.state) * change;
    const nodes = from.map((xy, i) => [xy[0] + (to[i][0] - xy[0]) * change, xy[1] + (to[i][1] - xy[1]) * change]);
    if (graphic.scene === "WEBSITE") browser(c, 145, 480, 790, 800);
    else box(c, 145, 480, 790, 800, palette.background, palette.border, 40);
    c.save(); c.globalAlpha *= connection;
    for (let i = 1; i < nodes.length; i++) line(c, nodes[i - 1][0], nodes[i - 1][1], nodes[i][0], nodes[i][1]);
    c.restore();
    nodes.forEach(([x, y], i) => {
      c.save(); c.translate(x, y);
      const fragmented = (graphic.before.state === "FRAGMENTED" ? 1 - change : 0) + (graphic.after.state === "FRAGMENTED" ? change : 0);
      c.rotate(fragmented * (i % 2 ? 0.14 : -0.12));
      box(c, -120, -95, 240, 190, palette.card, connection > 0.5 ? palette.accent : palette.border);
      if (graphic.scene === "WEBSITE") {
        box(c, -85, -55, 170, 65, i === 3 ? palette.accent : palette.border, "", 10);
        box(c, -85, 32, 130, 12, palette.muted, "", 5);
      } else icon(c, graphic.scene === "DATA" ? "DATABASE" : "APP", 0, -10, 75);
      const active = (graphic.before.state === "ACTIVE" ? 1 - change : 0) + (graphic.after.state === "ACTIVE" ? change : 0);
      if (active > 0) { c.save(); c.globalAlpha *= active; dot(c, 85, -65, 8); c.restore(); }
      c.restore();
    });
    text(c, change < 0.5 ? "ANTES" : "DESPUÉS", 540, 1360, 22, palette.muted);
    c.save(); c.globalAlpha *= Math.abs(change - 0.5) * 2;
    text(c, change < 0.5 ? graphic.before.label : graphic.after.label, 540, 1410, 34, palette.ink, 780);
    c.restore();
    line(c, 270, 1500, 810, 1500, 1, palette.border);
    dot(c, 270 + change * 540, 1500, 10);
  });
}
