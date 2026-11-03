import { createTimelinePng } from "../templates/timeline";
import { samplePackFrames } from "./packFrames";
import type { MotionSegmentBuildContext } from "./types";

export async function buildTimelineSegment(context: MotionSegmentBuildContext) {
  const graphic = context.segment.graphic;
  if (graphic.type !== "TIMELINE") throw new Error("Motion template mismatch: TIMELINE.");
  return samplePackFrames(context, p => createTimelinePng(context.width, context.height, graphic, p));
}
