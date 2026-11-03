import type { SystemDiagramMotionGraphicRequest } from "../types";
import { box, dot, icon, line, palette, phase, reveal, scenePng, text } from "./packDrawing";

export function createSystemDiagramPng(width: number, height: number, graphic: SystemDiagramMotionGraphicRequest, p: number) {
  return scenePng(width, height, p, c => {
    const positions = graphic.nodes.length <= 3
      ? graphic.nodes.map((_, i) => [540, 950 + (i - (graphic.nodes.length - 1) / 2) * 320])
      : [[540, 510], [270, 850], [810, 850], [270, 1230], [810, 1230]];
    graphic.connections.forEach((edge, i) => {
      const from = graphic.nodes.findIndex(n => n.id === edge.from), to = graphic.nodes.findIndex(n => n.id === edge.to);
      const a = positions[from], b = positions[to];
      const dx = b[0] - a[0], dy = b[1] - a[1], distance = Math.hypot(dx, dy);
      const x1 = a[0] + dx / distance * 120, y1 = a[1] + dy / distance * 120;
      const x2 = b[0] - dx / distance * 120, y2 = b[1] - dy / distance * 120;
      const r = phase(p, 0.38 + i * 0.045, 0.53 + i * 0.045);
      line(c, x1, y1, x2, y2, 1, palette.border); line(c, x1, y1, x2, y2, r);
      if (r > 0 && r < 1) dot(c, x1 + (x2 - x1) * r, y1 + (y2 - y1) * r, 9);
      c.save(); c.globalAlpha *= r; c.translate(x2, y2); c.rotate(Math.atan2(dy, dx));
      line(c, -17, -11, 0, 0); line(c, -17, 11, 0, 0); c.restore();
    });
    graphic.nodes.forEach((node, i) => {
      const [x, y] = positions[i], r = reveal(p, i, graphic.nodes.length);
      c.save(); c.globalAlpha *= r; c.translate(x, y + (1 - r) * 24);
      box(c, -115, -108, 230, 216, palette.card, palette.border, 32);
      icon(c, node.kind, 0, -27, 74);
      text(c, node.label, 0, 65, 28, palette.ink, 202); c.restore();
    });
  });
}
