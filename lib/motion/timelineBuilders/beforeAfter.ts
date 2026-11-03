import { createBeforeAfterPng } from "../templates/beforeAfter";
import { samplePackFrames } from "./packFrames";
import type { MotionSegmentBuildContext } from "./types";

export async function buildBeforeAfterSegment(context: MotionSegmentBuildContext) {
  const graphic = context.segment.graphic;
  if (graphic.type !== "BEFORE_AFTER") throw new Error("Motion template mismatch: BEFORE_AFTER.");
  return samplePackFrames(context, p => createBeforeAfterPng(context.width, context.height, graphic, p));
}
