import { createStackBuildPng } from "../templates/stackBuild";
import { samplePackFrames } from "./packFrames";
import type { MotionSegmentBuildContext } from "./types";

export async function buildStackBuildSegment(context: MotionSegmentBuildContext) {
  const graphic = context.segment.graphic;
  if (graphic.type !== "STACK_BUILD") throw new Error("Motion template mismatch: STACK_BUILD.");
  return samplePackFrames(context, p => createStackBuildPng(context.width, context.height, graphic, p));
}
