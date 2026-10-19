"use client";

export type BoundaryTranscriptWord = {
  word: string;
  start: number;
  end: number;
};

export type BoundaryPlanItem = {
  id: string;
  start: number;
  end: number;
  text: string;
  decision: "KEEP" | "REMOVE" | "REVIEW";
  confidence: number;
  reason: string;
};

export type BoundaryCandidateWindow = {
  id: string;
  start: number;
  end: number;
  duration: number;
  score: number;
  leftKeepId: string;
  rightKeepId: string;
  leftText: string;
  rightText: string;
  gapStart: number;
  gapEnd: number;
  gapDuration: number;
  triggers: string[];
  removedItemIds: string[];
};

export type BoundaryReliabilityStatus =
  | "RELIABLE"
  | "REJECTED";

export type BoundaryReliability = {
  status: BoundaryReliabilityStatus;
  score: number;
  reasons: string[];
  leftSuffixMatchTokens: number;
  rightPrefixMatchTokens: number;
  sharedMeaningfulTokens: string[];
  meaningfulCoverage: number;
  retakeSupport: {
    id: string;
    text: string;
    overlapSeconds: number;
    sharedMeaningfulTokens: string[];
    meaningfulCoverage: number;
  } | null;
};

export type BoundaryLocalTranscription =
  BoundaryCandidateWindow & {
    text: string;
    language: string | null;
    words: BoundaryTranscriptWord[];
    reliability: BoundaryReliability;
  };

export type BoundarySecondPassResult = {
  version: "boundary-second-pass-v2";
  candidateCount: number;
  transcribedCount: number;
  reliableCount: number;
  rejectedCount: number;
  candidates: BoundaryCandidateWindow[];
  transcriptions: BoundaryLocalTranscription[];
};

type Transcription = {
  text: string;
  language: string | null;
  duration: number | null;
  words: BoundaryTranscriptWord[];
};

type CutPlan = {
  items: BoundaryPlanItem[];
};

type RetakeEvidence = {
  transcriptions: Array<{
    id: string;
    start: number;
    end: number;
    text: string;
  }>;
} | null;

const WINDOW_PREROLL_SECONDS = 1.5;
const WINDOW_POSTROLL_SECONDS = 1.5;
const MAX_WINDOW_SECONDS = 18;
const MAX_CANDIDATES = 14;
const MIN_SCORE = 4;
const OUTPUT_SAMPLE_RATE = 16000;

const RELIABILITY_THRESHOLD = 5;
const MIN_RETAKE_TIME_OVERLAP_SECONDS = 0.35;

const MEANINGLESS_TOKENS = new Set([
  "a",
  "al",
  "con",
  "de",
  "del",
  "el",
  "en",
  "es",
  "la",
  "las",
  "lo",
  "los",
  "o",
  "para",
  "pero",
  "por",
  "que",
  "se",
  "si",
  "sin",
  "su",
  "sus",
  "tu",
  "un",
  "una",
  "unos",
  "unas",
  "y",
]);

const DANGLING_LEFT_TOKENS = new Set([
  "a",
  "al",
  "con",
  "de",
  "del",
  "el",
  "en",
  "la",
  "las",
  "lo",
  "los",
  "o",
  "para",
  "pero",
  "por",
  "que",
  "se",
  "si",
  "sin",
  "su",
  "sus",
  "tu",
  "un",
  "una",
  "unos",
  "unas",
  "y",
]);

const CONTINUATION_RIGHT_TOKENS = new Set([
  "a",
  "al",
  "con",
  "cuando",
  "de",
  "del",
  "donde",
  "el",
  "en",
  "la",
  "las",
  "lo",
  "los",
  "no",
  "o",
  "para",
  "pero",
  "porque",
  "por",
  "que",
  "se",
  "si",
  "sin",
  "su",
  "sus",
  "tu",
  "un",
  "una",
  "unos",
  "unas",
  "y",
]);

function roundTime(value: number) {
  return Math.round(value * 1000) / 1000;
}

function normalizeToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, "")
    .trim();
}

function tokens(value: string) {
  return value
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean);
}

function meaningfulTokens(value: string) {
  return tokens(value).filter(
    (token) =>
      token.length >= 3 &&
      !MEANINGLESS_TOKENS.has(token)
  );
}

function uniqueTokens(values: string[]) {
  return Array.from(new Set(values));
}

function sequenceAppears(
  sequence: string[],
  target: string[]
) {
  if (
    sequence.length === 0 ||
    sequence.length > target.length
  ) {
    return false;
  }

  for (
    let start = 0;
    start <= target.length - sequence.length;
    start += 1
  ) {
    let matches = true;

    for (
      let offset = 0;
      offset < sequence.length;
      offset += 1
    ) {
      if (
        target[start + offset] !==
        sequence[offset]
      ) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return true;
    }
  }

  return false;
}

function longestLeftSuffixMatch(
  leftText: string,
  localText: string
) {
  const left = tokens(leftText);
  const local = tokens(localText);

  const maxLength =
    Math.min(
      8,
      left.length,
      local.length
    );

  for (
    let length = maxLength;
    length >= 1;
    length -= 1
  ) {
    const suffix =
      left.slice(
        left.length -
          length
      );

    if (
      sequenceAppears(
        suffix,
        local
      )
    ) {
      return length;
    }
  }

  return 0;
}

function longestRightPrefixMatch(
  rightText: string,
  localText: string
) {
  const right = tokens(rightText);
  const local = tokens(localText);

  const maxLength =
    Math.min(
      8,
      right.length,
      local.length
    );

  for (
    let length = maxLength;
    length >= 1;
    length -= 1
  ) {
    const prefix =
      right.slice(
        0,
        length
      );

    if (
      sequenceAppears(
        prefix,
        local
      )
    ) {
      return length;
    }
  }

  return 0;
}

function rangeOverlapSeconds(
  startA: number,
  endA: number,
  startB: number,
  endB: number
) {
  return Math.max(
    0,
    Math.min(
      endA,
      endB
    ) -
      Math.max(
        startA,
        startB
      )
  );
}

function sharedMeaningfulTokens(
  firstText: string,
  secondText: string
) {
  const first =
    uniqueTokens(
      meaningfulTokens(
        firstText
      )
    );

  const secondSet =
    new Set(
      meaningfulTokens(
        secondText
      )
    );

  return first.filter(
    (token) =>
      secondSet.has(token)
  );
}

function meaningfulCoverage(
  localText: string,
  referenceText: string,
  shared: string[]
) {
  const localCount =
    uniqueTokens(
      meaningfulTokens(
        localText
      )
    ).length;

  const referenceCount =
    uniqueTokens(
      meaningfulTokens(
        referenceText
      )
    ).length;

  const denominator =
    Math.max(
      1,
      Math.min(
        localCount,
        referenceCount
      )
    );

  return Math.min(
    1,
    shared.length /
      denominator
  );
}

function bestRetakeSupport(
  localText: string,
  candidate: BoundaryCandidateWindow,
  retakeEvidence: RetakeEvidence
) {
  if (
    !retakeEvidence ||
    !Array.isArray(
      retakeEvidence.transcriptions
    )
  ) {
    return null;
  }

  const matches =
    retakeEvidence.transcriptions
      .map(
        (retake) => {
          const overlapSeconds =
            rangeOverlapSeconds(
              candidate.start,
              candidate.end,
              retake.start,
              retake.end
            );

          if (
            overlapSeconds <
            MIN_RETAKE_TIME_OVERLAP_SECONDS
          ) {
            return null;
          }

          const shared =
            sharedMeaningfulTokens(
              localText,
              retake.text
            );

          const coverage =
            meaningfulCoverage(
              localText,
              retake.text,
              shared
            );

          return {
            id:
              retake.id,
            text:
              retake.text,
            overlapSeconds:
              roundTime(
                overlapSeconds
              ),
            sharedMeaningfulTokens:
              shared,
            meaningfulCoverage:
              roundTime(
                coverage
              ),
          };
        }
      )
      .filter(
        (
          value
        ): value is {
          id: string;
          text: string;
          overlapSeconds: number;
          sharedMeaningfulTokens: string[];
          meaningfulCoverage: number;
        } =>
          value !==
          null
      )
      .sort(
        (a, b) =>
          b.sharedMeaningfulTokens.length -
            a.sharedMeaningfulTokens.length ||
          b.meaningfulCoverage -
            a.meaningfulCoverage ||
          b.overlapSeconds -
            a.overlapSeconds
      );

  return (
    matches[0] ??
    null
  );
}

function evaluateBoundaryReliability(
  localText: string,
  candidate: BoundaryCandidateWindow,
  retakeEvidence: RetakeEvidence
): BoundaryReliability {
  const cleanText =
    localText.trim();

  if (!cleanText) {
    return {
      status:
        "REJECTED",
      score:
        0,
      reasons: [
        "empty-local-transcription",
      ],
      leftSuffixMatchTokens:
        0,
      rightPrefixMatchTokens:
        0,
      sharedMeaningfulTokens:
        [],
      meaningfulCoverage:
        0,
      retakeSupport:
        null,
    };
  }

  const localMeaningful =
    uniqueTokens(
      meaningfulTokens(
        cleanText
      )
    );

  const boundaryReference =
    `${candidate.leftText} ${candidate.rightText}`;

  const shared =
    sharedMeaningfulTokens(
      cleanText,
      boundaryReference
    );

  const coverage =
    meaningfulCoverage(
      cleanText,
      boundaryReference,
      shared
    );

  const leftSuffixMatchTokens =
    longestLeftSuffixMatch(
      candidate.leftText,
      cleanText
    );

  const rightPrefixMatchTokens =
    longestRightPrefixMatch(
      candidate.rightText,
      cleanText
    );

  const retakeSupport =
    bestRetakeSupport(
      cleanText,
      candidate,
      retakeEvidence
    );

  let score = 0;
  const reasons: string[] =
    [];

  if (
    leftSuffixMatchTokens >=
    3
  ) {
    score += 4;
    reasons.push(
      `left-suffix:${leftSuffixMatchTokens}`
    );
  } else if (
    leftSuffixMatchTokens >=
    1
  ) {
    score += 1.5;
    reasons.push(
      `left-suffix:${leftSuffixMatchTokens}`
    );
  }

  if (
    rightPrefixMatchTokens >=
    3
  ) {
    score += 4;
    reasons.push(
      `right-prefix:${rightPrefixMatchTokens}`
    );
  } else if (
    rightPrefixMatchTokens >=
    1
  ) {
    score += 1.5;
    reasons.push(
      `right-prefix:${rightPrefixMatchTokens}`
    );
  }

  if (
    shared.length >=
    3
  ) {
    score += 3;
    reasons.push(
      `shared-meaningful:${shared.length}`
    );
  } else if (
    shared.length ===
    2
  ) {
    score += 2;
    reasons.push(
      "shared-meaningful:2"
    );
  } else if (
    shared.length ===
    1
  ) {
    score += 0.75;
    reasons.push(
      "shared-meaningful:1"
    );
  }

  if (
    coverage >=
      0.6 &&
    shared.length >=
      2
  ) {
    score += 3;
    reasons.push(
      `boundary-coverage:${roundTime(
        coverage
      )}`
    );
  } else if (
    coverage >=
      0.35 &&
    shared.length >=
      2
  ) {
    score += 1.5;
    reasons.push(
      `boundary-coverage:${roundTime(
        coverage
      )}`
    );
  }

  if (
    retakeSupport &&
    retakeSupport
      .sharedMeaningfulTokens
      .length >=
      3 &&
    retakeSupport
      .meaningfulCoverage >=
      0.5
  ) {
    score += 2;
    reasons.push(
      `retake-support:${retakeSupport.id}`
    );
  }

  const hasBoundaryAnchor =
    leftSuffixMatchTokens >
      0 ||
    rightPrefixMatchTokens >
      0 ||
    shared.length >
      0;

  const hasRetakeAnchor =
    Boolean(
      retakeSupport &&
        retakeSupport
          .sharedMeaningfulTokens
          .length >
          0
    );

  if (
    !hasBoundaryAnchor &&
    !hasRetakeAnchor
  ) {
    score -= 6;
    reasons.push(
      "no-semantic-anchor"
    );
  }

  if (
    localMeaningful.length ===
      0 &&
    leftSuffixMatchTokens <
      2 &&
    rightPrefixMatchTokens <
      2
  ) {
    score -= 3;
    reasons.push(
      "no-meaningful-local-content"
    );
  }

  const roundedScore =
    roundTime(
      Math.max(
        0,
        score
      )
    );

  const status:
    BoundaryReliabilityStatus =
      roundedScore >=
      RELIABILITY_THRESHOLD
        ? "RELIABLE"
        : "REJECTED";

  if (
    status ===
    "RELIABLE"
  ) {
    reasons.unshift(
      "semantic-evidence-accepted"
    );
  } else {
    reasons.unshift(
      "semantic-evidence-rejected"
    );
  }

  return {
    status,
    score:
      roundedScore,
    reasons,
    leftSuffixMatchTokens,
    rightPrefixMatchTokens,
    sharedMeaningfulTokens:
      shared,
    meaningfulCoverage:
      roundTime(
        coverage
      ),
    retakeSupport,
  };
}

function isAudioRemoval(item: BoundaryPlanItem) {
  return (
    item.reason.includes("Audio Activity Cutter") ||
    item.text.startsWith("Silencio de audio")
  );
}

function semanticTakeId(itemId: string) {
  return itemId
    .replace(/-spoken-\d+$/, "")
    .replace(/-safe-\d+$/, "");
}

function overlapsRange(
  item: BoundaryPlanItem,
  start: number,
  end: number
) {
  return Math.min(item.end, end) > Math.max(item.start, start);
}

function candidateWindow(
  duration: number,
  left: BoundaryPlanItem,
  right: BoundaryPlanItem
) {
  let start = Math.max(0, left.end - WINDOW_PREROLL_SECONDS);
  let end = Math.min(duration, right.start + WINDOW_POSTROLL_SECONDS);

  if (end - start > MAX_WINDOW_SECONDS) {
    const midpoint = (left.end + right.start) / 2;
    start = Math.max(0, midpoint - MAX_WINDOW_SECONDS / 2);
    end = Math.min(duration, start + MAX_WINDOW_SECONDS);

    if (end - start < MAX_WINDOW_SECONDS) {
      start = Math.max(0, end - MAX_WINDOW_SECONDS);
    }
  }

  return {
    start,
    end,
  };
}

function malformedWordsNearBoundary(
  transcription: Transcription,
  left: BoundaryPlanItem,
  right: BoundaryPlanItem
) {
  const from = Math.max(0, left.end - 0.35);
  const to = right.start + 0.35;

  return transcription.words.filter((word) => {
    if (!Number.isFinite(word.start) || !Number.isFinite(word.end)) {
      return false;
    }

    const duration = Math.max(0, word.end - word.start);
    const inside = word.end >= from && word.start <= to;

    return inside && (duration <= 0.04 || duration >= 2.5);
  });
}

export function findBoundaryCandidateWindows(
  transcription: Transcription,
  cutPlan: CutPlan
): BoundaryCandidateWindow[] {
  const sourceDuration =
    typeof transcription.duration === "number" &&
    Number.isFinite(transcription.duration) &&
    transcription.duration > 0
      ? transcription.duration
      : Math.max(
          0,
          ...cutPlan.items.map((item) => item.end),
          ...transcription.words.map((word) => word.end)
        );

  const keepItems = cutPlan.items
    .filter((item) => item.decision !== "REMOVE")
    .sort((a, b) => a.start - b.start);

  const candidates: BoundaryCandidateWindow[] = [];

  for (let index = 0; index < keepItems.length - 1; index += 1) {
    const left = keepItems[index];
    const right = keepItems[index + 1];

    const leftTokens = tokens(left.text);
    const rightTokens = tokens(right.text);

    const leftLast = leftTokens[leftTokens.length - 1] ?? "";
    const rightFirst = rightTokens[0] ?? "";

    const gapStart = left.end;
    const gapEnd = right.start;
    const gapDuration = Math.max(0, gapEnd - gapStart);

    const removedBetween = cutPlan.items
      .filter(
        (item) =>
          item.decision === "REMOVE" &&
          overlapsRange(item, gapStart, gapEnd)
      )
      .sort((a, b) => a.start - b.start);

    const spokenRemovedBetween = removedBetween.filter(
      (item) => !isAudioRemoval(item)
    );

    const audioRemovedBetween = removedBetween.filter(
      (item) => isAudioRemoval(item)
    );

    const sameSemanticTake =
      semanticTakeId(left.id) ===
      semanticTakeId(right.id);

    const malformedWords = malformedWordsNearBoundary(
      transcription,
      left,
      right
    );

    const triggers: string[] = [];
    let score = 0;

    if (DANGLING_LEFT_TOKENS.has(leftLast)) {
      triggers.push(`dangling-left:${leftLast}`);
      score += 4;
    }

    if (CONTINUATION_RIGHT_TOKENS.has(rightFirst)) {
      triggers.push(`continuation-right:${rightFirst}`);
      score += 2;
    }

    if (leftLast && leftLast === rightFirst) {
      triggers.push(`duplicate-boundary:${leftLast}`);
      score += 4;
    }

    if (spokenRemovedBetween.length > 0) {
      triggers.push(`spoken-remove-between:${spokenRemovedBetween.length}`);
      score += Math.min(4, 2 + spokenRemovedBetween.length * 0.75);
    }

    if (audioRemovedBetween.length > 0) {
      triggers.push(`audio-remove-between:${audioRemovedBetween.length}`);
      score += 2;
    }

    if (sameSemanticTake && audioRemovedBetween.length > 0) {
      triggers.push("semantic-keep-split-by-audio");
      score += 5;
    }

    if (
      spokenRemovedBetween.length > 0 &&
      CONTINUATION_RIGHT_TOKENS.has(rightFirst)
    ) {
      triggers.push("continuation-after-removed-spoken");
      score += 3;
    }

    if (gapDuration >= 0.08) {
      triggers.push(`gap:${roundTime(gapDuration)}`);
      score += 1;
    }

    if (malformedWords.length > 0) {
      triggers.push(
        `malformed-word-near-boundary:${malformedWords
          .slice(0, 3)
          .map((word) => normalizeToken(word.word) || word.word)
          .join(",")}`
      );
      score += 2;
    }

    if (score < MIN_SCORE) {
      continue;
    }

    const window = candidateWindow(sourceDuration, left, right);

    if (window.end - window.start <= 0.2) {
      continue;
    }

    candidates.push({
      id: `boundary-candidate-${candidates.length}`,
      start: roundTime(window.start),
      end: roundTime(window.end),
      duration: roundTime(window.end - window.start),
      score: roundTime(score),
      leftKeepId: left.id,
      rightKeepId: right.id,
      leftText: left.text,
      rightText: right.text,
      gapStart: roundTime(gapStart),
      gapEnd: roundTime(gapEnd),
      gapDuration: roundTime(gapDuration),
      triggers,
      removedItemIds: spokenRemovedBetween.map((item) => item.id),
    });
  }

  /*
    CRITICAL BOUNDARY PRESERVATION

    Correctness-critical boundaries must never disappear just because the
    diagnostic budget is full. A pure score ranking can drop a low-score
    duplicate such as:

      "...para la edad" + "edad que tiene"

    even though that is exactly the kind of boundary the Safe Boundary
    Resolver needs in order to remove a redundant edit point.

    Always keep:
    - explicit duplicate suffix/prefix boundaries;
    - semantic KEEP blocks split by Audio Activity.

    Then fill the remaining budget with the highest-scoring candidates.
    If there are ever more critical boundaries than MAX_CANDIDATES, keep all
    of them rather than sacrificing phrase integrity for the diagnostic cap.
  */
  const criticalCandidates = candidates.filter((candidate) =>
    candidate.triggers.some(
      (trigger) =>
        trigger.startsWith("duplicate-boundary:") ||
        trigger === "semantic-keep-split-by-audio"
    )
  );

  const criticalKeys = new Set(
    criticalCandidates.map(
      (candidate) => `${candidate.leftKeepId}::${candidate.rightKeepId}`
    )
  );

  const remainingCandidates = candidates
    .filter(
      (candidate) =>
        !criticalKeys.has(
          `${candidate.leftKeepId}::${candidate.rightKeepId}`
        )
    )
    .sort((a, b) => b.score - a.score);

  const remainingSlots = Math.max(
    0,
    MAX_CANDIDATES - criticalCandidates.length
  );

  return [
    ...criticalCandidates,
    ...remainingCandidates.slice(0, remainingSlots),
  ]
    .sort((a, b) => a.start - b.start)
    .map((candidate, index) => ({
      ...candidate,
      id: `boundary-candidate-${index}`,
    }));
}

function mixToMono(audioBuffer: AudioBuffer) {
  const output = new Float32Array(audioBuffer.length);

  for (
    let channel = 0;
    channel < audioBuffer.numberOfChannels;
    channel += 1
  ) {
    const input = audioBuffer.getChannelData(channel);

    for (let index = 0; index < audioBuffer.length; index += 1) {
      output[index] += input[index] / audioBuffer.numberOfChannels;
    }
  }

  return output;
}

function resampleMono(
  source: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number
) {
  if (sourceSampleRate === targetSampleRate) {
    return source;
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const outputLength = Math.max(1, Math.floor(source.length / ratio));
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const sourcePosition = index * ratio;
    const left = Math.floor(sourcePosition);
    const right = Math.min(source.length - 1, left + 1);
    const fraction = sourcePosition - left;

    output[index] =
      source[left] * (1 - fraction) + source[right] * fraction;
  }

  return output;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeMonoWav(samples: Float32Array, sampleRate: number) {
  const bytesPerSample = 2;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));

    view.setInt16(
      offset,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true
    );

    offset += bytesPerSample;
  }

  return buffer;
}

function clipToWav(
  mono: Float32Array,
  sampleRate: number,
  start: number,
  end: number
) {
  const sourceStart = Math.max(0, Math.floor(start * sampleRate));
  const sourceEnd = Math.min(mono.length, Math.ceil(end * sampleRate));
  const clip = mono.slice(sourceStart, sourceEnd);
  const resampled = resampleMono(clip, sampleRate, OUTPUT_SAMPLE_RATE);

  return encodeMonoWav(resampled, OUTPUT_SAMPLE_RATE);
}

async function transcribeBoundaryWindow(
  wavBuffer: ArrayBuffer,
  candidate: BoundaryCandidateWindow,
  retakeEvidence: RetakeEvidence
): Promise<BoundaryLocalTranscription> {
  const file = new File([wavBuffer], `${candidate.id}.wav`, {
    type: "audio/wav",
  });

  const formData = new FormData();
  formData.append("audio", file);

  const response = await fetch("/api/auto-edit/transcribe", {
    method: "POST",
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error ?? `No se pudo retranscribir ${candidate.id}.`
    );
  }

  const words: BoundaryTranscriptWord[] = Array.isArray(data.words)
    ? data.words
        .map((word: Partial<BoundaryTranscriptWord>) => ({
          word: typeof word.word === "string" ? word.word : "",
          start: roundTime(
            candidate.start +
              (typeof word.start === "number" ? word.start : 0)
          ),
          end: roundTime(
            candidate.start +
              (typeof word.end === "number" ? word.end : 0)
          ),
        }))
        .filter((word: BoundaryTranscriptWord) => Boolean(word.word.trim()))
    : [];

  const text =
    typeof data.text ===
      "string"
      ? data.text.trim()
      : "";

  return {
    ...candidate,
    text,
    language:
      typeof data.language ===
        "string"
        ? data.language
        : null,
    words,
    reliability:
      evaluateBoundaryReliability(
        text,
        candidate,
        retakeEvidence
      ),
  };
}

export async function runBoundarySecondPass(
  audioFile: File,
  transcription: Transcription,
  cutPlan: CutPlan,
  retakeEvidence: RetakeEvidence,
  onProgress?: (completed: number, total: number) => void
): Promise<BoundarySecondPassResult> {
  const candidates = findBoundaryCandidateWindows(transcription, cutPlan);

  if (candidates.length === 0) {
    return {
      version: "boundary-second-pass-v2",
      candidateCount: 0,
      transcribedCount: 0,
      reliableCount: 0,
      rejectedCount: 0,
      candidates: [],
      transcriptions: [],
    };
  }

  const context = new window.AudioContext();

  try {
    const sourceBuffer = await audioFile.arrayBuffer();
    const decoded = await context.decodeAudioData(sourceBuffer.slice(0));
    const mono = mixToMono(decoded);
    const transcriptions: BoundaryLocalTranscription[] = [];

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const wavBuffer = clipToWav(
        mono,
        decoded.sampleRate,
        candidate.start,
        candidate.end
      );

      const local =
        await transcribeBoundaryWindow(
          wavBuffer,
          candidate,
          retakeEvidence
        );

      transcriptions.push(local);
      onProgress?.(index + 1, candidates.length);
    }

    const reliableCount =
      transcriptions.filter(
        (item) =>
          item.reliability
            .status ===
          "RELIABLE"
      ).length;

    const rejectedCount =
      transcriptions.length -
      reliableCount;

    return {
      version: "boundary-second-pass-v2",
      candidateCount: candidates.length,
      transcribedCount: transcriptions.length,
      reliableCount,
      rejectedCount,
      candidates,
      transcriptions,
    };
  } finally {
    await context.close();
  }
}
