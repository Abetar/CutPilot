import type { MotionSegmentBuildContext, MotionSegmentBuildResult } from "./types";

// Shared sampling only; each template owns its typed payload, composition and timing.
// Bounded PNG count prevents long segments from exhausting ffmpeg.wasm memory.
export async function samplePackFrames(context: MotionSegmentBuildContext,
  render: (progress: number) => Promise<Uint8Array>): Promise<MotionSegmentBuildResult> {
  const duration = context.segmentEnd - context.segmentStart;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Duración Motion inválida.");
  const count = Math.min(96, Math.max(1, Math.ceil(duration * 12)));
  const result: MotionSegmentBuildResult = { assets: [], frames: [] };
  for (let i = 0; i < count; i++) {
    const key = `segment-${context.segmentIndex}-${context.segment.graphic.type}-${i}`;
    result.assets.push({ key, data: await render(count === 1 ? 0.8 : i / (count - 1)) });
    result.frames.push({ assetKey: key, duration: duration / count });
  }
  return result;
}
