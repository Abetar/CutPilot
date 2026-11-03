import { createSystemDiagramPng } from "../templates/systemDiagram";
import { samplePackFrames } from "./packFrames";
import type { MotionSegmentBuildContext } from "./types";

export async function buildSystemDiagramSegment(context: MotionSegmentBuildContext) {
  const graphic = context.segment.graphic;
  if (graphic.type !== "SYSTEM_DIAGRAM") throw new Error("Motion template mismatch: SYSTEM_DIAGRAM.");
  return samplePackFrames(context, p => createSystemDiagramPng(context.width, context.height, graphic, p));
}
