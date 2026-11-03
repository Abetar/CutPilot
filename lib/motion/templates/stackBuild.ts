import type { StackBuildMotionGraphicRequest } from "../types";
import { icon, palette, reveal, scenePng, text } from "./packDrawing";

export function createStackBuildPng(width: number, height: number, graphic: StackBuildMotionGraphicRequest, p: number) {
  return scenePng(width, height, p, c => {
    const count = graphic.layers.length, base = 1000 + (count - 1) * 85;
    graphic.layers.forEach((layer, i) => {
      const r = reveal(p, i, count), y = base - i * 170 - (1 - r) * 110;
      const half = 400 - i * 25;
      c.save(); c.globalAlpha *= r;
      // Each layer has a top surface and an extruded front edge.
      c.beginPath(); c.moveTo(540 - half, y); c.lineTo(540, y - 85);
      c.lineTo(540 + half, y); c.lineTo(540, y + 85); c.closePath();
      c.fillStyle = palette.card; c.fill(); c.strokeStyle = palette.accent; c.lineWidth = 3; c.stroke();
      c.beginPath(); c.moveTo(540 - half, y); c.lineTo(540, y + 85); c.lineTo(540 + half, y);
      c.lineTo(540 + half, y + 32); c.lineTo(540, y + 117); c.lineTo(540 - half, y + 32); c.closePath();
      c.fillStyle = palette.background; c.fill(); c.strokeStyle = palette.border; c.stroke();
      icon(c, layer.role, 415, y - 8, 45);
      text(c, layer.label, 570, y - 4, 30, palette.ink, 280);
      c.restore();
    });
  });
}
