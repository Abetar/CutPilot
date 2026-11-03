import { createFunnelFlowPng } from "../templates/funnelFlow";
import { samplePackFrames } from "./packFrames";
import type { MotionSegmentBuildContext } from "./types";

export async function buildFunnelFlowSegment(context: MotionSegmentBuildContext) {
  const graphic = context.segment.graphic;
  if (graphic.type !== "FUNNEL_FLOW") throw new Error("Motion template mismatch: FUNNEL_FLOW.");
  return samplePackFrames(context, p => createFunnelFlowPng(context.width, context.height, graphic, p));
}
