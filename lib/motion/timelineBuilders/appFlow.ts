import { createAppFlowPng } from "../templates/appFlow";
import { samplePackFrames } from "./packFrames";
import type { MotionSegmentBuildContext } from "./types";

export async function buildAppFlowSegment(context: MotionSegmentBuildContext) {
  const graphic = context.segment.graphic;
  if (graphic.type !== "APP_FLOW") throw new Error("Motion template mismatch: APP_FLOW.");
  return samplePackFrames(context, p => createAppFlowPng(context.width, context.height, graphic, p));
}
