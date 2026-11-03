import { createUiHighlightPng } from "../templates/uiHighlight";
import { samplePackFrames } from "./packFrames";
import type { MotionSegmentBuildContext } from "./types";

export async function buildUiHighlightSegment(context: MotionSegmentBuildContext) {
  const graphic = context.segment.graphic;
  if (graphic.type !== "UI_HIGHLIGHT") throw new Error("Motion template mismatch: UI_HIGHLIGHT.");
  return samplePackFrames(context, p => createUiHighlightPng(context.width, context.height, graphic, p));
}
