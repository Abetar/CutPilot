import { createMetricCounterPng } from "../templates/metricCounter";
import { samplePackFrames } from "./packFrames";
import type { MotionSegmentBuildContext } from "./types";

export async function buildMetricCounterSegment(context: MotionSegmentBuildContext) {
  const graphic = context.segment.graphic;
  if (graphic.type !== "METRIC_COUNTER") throw new Error("Motion template mismatch: METRIC_COUNTER.");
  return samplePackFrames(context, p => createMetricCounterPng(context.width, context.height, graphic, p));
}
