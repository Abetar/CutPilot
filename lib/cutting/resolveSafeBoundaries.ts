"use client";

import type {
  BoundaryLocalTranscription,
  BoundarySecondPassResult,
  BoundaryTranscriptWord,
} from "@/lib/cutting/transcribeBoundaryCandidates";

export type SafeBoundaryDecision = "KEEP" | "REMOVE" | "REVIEW";

export type SafeBoundaryPlanItem = {
  id: string;
  start: number;
  end: number;
  text: string;
  decision: SafeBoundaryDecision;
  confidence: number;
  reason: string;
};

export type SafeBoundaryCutPlan = {
  summary: string;
  originalDuration: number;
  estimatedDuration: number;
  items: SafeBoundaryPlanItem[];
};

export type SafeBoundaryTranscript = {
  words: Array<{
    word: string;
    start: number;
    end: number;
  }>;
};

export type SafeBoundaryCandidateResult = {
  candidateId: string;
  status: "APPLIED" | "NO_CHANGE" | "SKIPPED";
  reason: string;
  protectedWords: string[];
  restoredSeconds: number;
  restoredSegments: number;
};

export type SafeBoundaryReport = {
  version: "safe-boundary-resolver-v4";
  reliableCandidates: number;
  rejectedCandidates: number;
  appliedCandidates: number;
  protectedWords: number;
  restoredSegments: number;
  restoredSeconds: number;
  blockedBySemanticRemove: number;
  reconciledBoundaries: number;
  mergedSafeKeeps: number;
  candidateResults: SafeBoundaryCandidateResult[];
};

export type SafeBoundaryResolution = {
  plan: SafeBoundaryCutPlan;
  report: SafeBoundaryReport;
};

type TimedRange = {
  start: number;
  end: number;
};

type ProtectedRange = TimedRange & {
  candidateId: string;
  words: string[];
};

type AnchorMatch = {
  startIndex: number;
  endIndex: number;
  length: number;
};

const AUDIO_ACTIVITY_REASON = "Audio Activity Cutter";
const MIN_ITEM_SECONDS = 0.015;
const WORD_PREROLL_SECONDS = 0.04;
const WORD_POSTROLL_SECONDS = 0.06;
const DEGENERATE_WORD_SECONDS = 0.04;
const DEGENERATE_PRE_SECONDS = 0.15;
const DEGENERATE_POST_SECONDS = 0.19;
const MAX_TRUSTED_WORD_SECONDS = 1.25;
const MERGE_PROTECTED_GAP_SECONDS = 0.04;
const MAX_ANCHOR_TOKENS = 8;
const MAX_BRIDGE_WORDS = 5;
const MAX_MEANINGFUL_BRIDGE_WORDS = 3;
const GLOBAL_SUPPORT_WINDOW_SECONDS = 3;
const MAX_LOCAL_RECONCILIATION_WORDS = 16;
const MAX_LOCAL_RECONCILIATION_SECONDS = 8;
const RECONCILIATION_PRE_SECONDS = 0.04;
const RECONCILIATION_POST_SECONDS = 0.06;
const RETRY_REPLACEMENT_TOLERANCE_SECONDS = 0.16;
const MIN_KEEP_RESIDUAL_SECONDS = 0.08;
const SAFE_KEEP_MERGE_GAP_SECONDS = 0.025;
const MIN_RESTART_GAP_SECONDS = 0.18;
const RESTART_EDGE_TOLERANCE_SECONDS = 0.18;
const RESTART_CROSSING_TOLERANCE_SECONDS = 0.06;

/*
  RETAKE BARRIER

  A semantic REMOVE is stronger than local boundary recovery.
  Local timing can drift a few hundred milliseconds, so we protect a small
  margin around AI-removed speech. Safe Boundary may recover clipped speech
  next to that barrier, but it may not resurrect or merge through the retake.
*/
const SEMANTIC_REMOVE_GUARD_SECONDS = 0.28;

const BRIDGE_STOPWORDS = new Set([
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
  "no",
  "o",
  "para",
  "pero",
  "por",
  "porque",
  "que",
  "se",
  "si",
  "sin",
  "su",
  "sus",
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
    .toLocaleLowerCase("es-MX")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ]+/gi, "")
    .trim();
}

function textTokens(value: string) {
  return value
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean);
}

function isAudioRemoval(item: SafeBoundaryPlanItem) {
  return (
    item.decision === "REMOVE" &&
    (item.reason.includes(AUDIO_ACTIVITY_REASON) ||
      item.text.startsWith("Silencio de audio"))
  );
}

function overlapSeconds(
  startA: number,
  endA: number,
  startB: number,
  endB: number
) {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

function rangeIntersects(range: TimedRange, other: TimedRange) {
  return Math.min(range.end, other.end) > Math.max(range.start, other.start);
}

function midpoint(range: TimedRange) {
  return (range.start + range.end) / 2;
}

function isInsideSemanticRemove(
  word: BoundaryTranscriptWord,
  semanticRemoves: TimedRange[]
) {
  const mark = midpoint({ start: word.start, end: word.end });

  return semanticRemoves.some(
    (range) =>
      mark >= range.start - SEMANTIC_REMOVE_GUARD_SECONDS &&
      mark <= range.end + SEMANTIC_REMOVE_GUARD_SECONDS
  );
}

function semanticRemoveRange(item: SafeBoundaryPlanItem): TimedRange {
  return {
    start: Math.max(0, item.start - SEMANTIC_REMOVE_GUARD_SECONDS),
    end: item.end + SEMANTIC_REMOVE_GUARD_SECONDS,
  };
}

function itemMatchesSourceId(
  item: SafeBoundaryPlanItem,
  sourceId: string
) {
  if (item.id === sourceId || item.id.startsWith(`${sourceId}-`)) {
    return true;
  }

  return item.id
    .split("+")
    .some(
      (part) =>
        part === sourceId ||
        part.startsWith(`${sourceId}-`)
    );
}

function candidateHasSemanticRetakeBarrier(
  items: SafeBoundaryPlanItem[],
  candidate: BoundaryLocalTranscription
) {
  if (candidate.removedItemIds.length === 0) {
    return false;
  }

  return candidate.removedItemIds.some((removedId) =>
    items.some(
      (item) =>
        item.decision === "REMOVE" &&
        !isAudioRemoval(item) &&
        itemMatchesSourceId(item, removedId)
    )
  );
}

function findSequenceOccurrences(
  localTokens: string[],
  sequence: string[]
): AnchorMatch[] {
  if (sequence.length === 0 || sequence.length > localTokens.length) {
    return [];
  }

  const matches: AnchorMatch[] = [];

  for (
    let startIndex = 0;
    startIndex <= localTokens.length - sequence.length;
    startIndex += 1
  ) {
    let same = true;

    for (let offset = 0; offset < sequence.length; offset += 1) {
      if (localTokens[startIndex + offset] !== sequence[offset]) {
        same = false;
        break;
      }
    }

    if (same) {
      matches.push({
        startIndex,
        endIndex: startIndex + sequence.length - 1,
        length: sequence.length,
      });
    }
  }

  return matches;
}

function findLeftAnchor(
  localWords: BoundaryTranscriptWord[],
  leftText: string,
  gapStart: number
) {
  const localTokens = localWords.map((word) => normalizeToken(word.word));
  const leftTokens = textTokens(leftText);
  const maxLength = Math.min(MAX_ANCHOR_TOKENS, leftTokens.length);

  for (let length = maxLength; length >= 1; length -= 1) {
    const suffix = leftTokens.slice(leftTokens.length - length);
    const occurrences = findSequenceOccurrences(localTokens, suffix);

    if (occurrences.length === 0) {
      continue;
    }

    return occurrences
      .map((match) => ({
        ...match,
        distance: Math.abs(localWords[match.endIndex].end - gapStart),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
  }

  return null;
}

function findRightAnchor(
  localWords: BoundaryTranscriptWord[],
  rightText: string,
  gapEnd: number,
  afterIndex: number
) {
  const localTokens = localWords.map((word) => normalizeToken(word.word));
  const rightTokens = textTokens(rightText);
  const maxLength = Math.min(MAX_ANCHOR_TOKENS, rightTokens.length);

  for (let length = maxLength; length >= 1; length -= 1) {
    const prefix = rightTokens.slice(0, length);
    const occurrences = findSequenceOccurrences(localTokens, prefix).filter(
      (match) => match.startIndex > afterIndex
    );

    if (occurrences.length === 0) {
      continue;
    }

    return occurrences
      .map((match) => ({
        ...match,
        distance: Math.abs(localWords[match.startIndex].start - gapEnd),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
  }

  return null;
}

function wordProtectionRange(
  word: BoundaryTranscriptWord,
  sourceDuration: number
): TimedRange | null {
  if (
    !Number.isFinite(word.start) ||
    !Number.isFinite(word.end) ||
    word.start < 0 ||
    word.end < word.start
  ) {
    return null;
  }

  const duration = word.end - word.start;

  if (duration > MAX_TRUSTED_WORD_SECONDS) {
    return null;
  }

  if (duration <= DEGENERATE_WORD_SECONDS) {
    const center = (word.start + word.end) / 2;

    return {
      start: roundTime(Math.max(0, center - DEGENERATE_PRE_SECONDS)),
      end: roundTime(
        Math.min(sourceDuration, center + DEGENERATE_POST_SECONDS)
      ),
    };
  }

  return {
    start: roundTime(Math.max(0, word.start - WORD_PREROLL_SECONDS)),
    end: roundTime(Math.min(sourceDuration, word.end + WORD_POSTROLL_SECONDS)),
  };
}

function mergeProtectedRanges(ranges: ProtectedRange[]) {
  const sorted = [...ranges].sort(
    (a, b) => a.start - b.start || a.end - b.end
  );

  const merged: ProtectedRange[] = [];

  for (const range of sorted) {
    const previous = merged[merged.length - 1];

    if (
      previous &&
      previous.candidateId === range.candidateId &&
      range.start <= previous.end + MERGE_PROTECTED_GAP_SECONDS
    ) {
      previous.end = Math.max(previous.end, range.end);
      previous.words = Array.from(new Set([...previous.words, ...range.words]));
      continue;
    }

    merged.push({
      ...range,
      words: [...range.words],
    });
  }

  return merged;
}

function subtractRanges(range: TimedRange, blockers: TimedRange[]) {
  let parts: TimedRange[] = [{ ...range }];

  for (const blocker of [...blockers].sort((a, b) => a.start - b.start)) {
    const next: TimedRange[] = [];

    for (const part of parts) {
      if (!rangeIntersects(part, blocker)) {
        next.push(part);
        continue;
      }

      if (blocker.start > part.start) {
        next.push({
          start: part.start,
          end: Math.min(part.end, blocker.start),
        });
      }

      if (blocker.end < part.end) {
        next.push({
          start: Math.max(part.start, blocker.end),
          end: part.end,
        });
      }
    }

    parts = next;
  }

  return parts.filter((part) => part.end - part.start > MIN_ITEM_SECONDS);
}

function wordsForRange(
  transcription: BoundaryLocalTranscription,
  start: number,
  end: number
) {
  return transcription.words
    .filter((word) => word.end > start && word.start < end)
    .map((word) => word.word.trim())
    .filter(Boolean);
}

function isMeaningfulBridgeToken(value: string) {
  const token = normalizeToken(value);

  if (!token) {
    return false;
  }

  if (/\d/.test(token)) {
    return true;
  }

  return token.length >= 3 && !BRIDGE_STOPWORDS.has(token);
}

function hasExternalTokenSupport(
  word: BoundaryTranscriptWord,
  candidate: BoundaryLocalTranscription,
  transcription: SafeBoundaryTranscript
) {
  const token = normalizeToken(word.word);

  if (!token) {
    return false;
  }

  const supportedByRetake =
    candidate.reliability.retakeSupport
      ? textTokens(
          candidate.reliability.retakeSupport.text
        ).includes(token)
      : false;

  if (supportedByRetake) {
    return true;
  }

  const from = candidate.start - GLOBAL_SUPPORT_WINDOW_SECONDS;
  const to = candidate.end + GLOBAL_SUPPORT_WINDOW_SECONDS;

  return transcription.words.some((globalWord) => {
    if (normalizeToken(globalWord.word) !== token) {
      return false;
    }

    return (
      globalWord.end >= from &&
      globalWord.start <= to
    );
  });
}

function buildProtectedRangesForCandidate(
  candidate: BoundaryLocalTranscription,
  plan: SafeBoundaryCutPlan,
  sourceDuration: number,
  transcription: SafeBoundaryTranscript
) {
  const result: {
    ranges: ProtectedRange[];
    protectedWords: string[];
    blockedBySemanticRemove: number;
    reason: string;
  } = {
    ranges: [],
    protectedWords: [],
    blockedBySemanticRemove: 0,
    reason: "",
  };

  if (candidate.reliability.status !== "RELIABLE") {
    result.reason = "Boundary evidence rejected by Reliability Gate.";
    return result;
  }

  const localWords = candidate.words.filter(
    (word) => Boolean(normalizeToken(word.word))
  );

  if (localWords.length === 0) {
    result.reason = "Reliable boundary had no timed local words.";
    return result;
  }

  const leftAnchor = findLeftAnchor(
    localWords,
    candidate.leftText,
    candidate.gapStart
  );

  if (!leftAnchor) {
    result.reason = "Could not locate the left semantic anchor locally.";
    return result;
  }

  const rightAnchor = findRightAnchor(
    localWords,
    candidate.rightText,
    candidate.gapEnd,
    leftAnchor.endIndex
  );

  if (!rightAnchor) {
    result.reason = "Could not locate the right semantic anchor locally.";
    return result;
  }

  const semanticRemoves = plan.items
    .filter((item) => item.decision === "REMOVE" && !isAudioRemoval(item))
    .map((item) => ({ start: item.start, end: item.end }));

  const bridgeWords = localWords
    .slice(
      leftAnchor.endIndex + 1,
      rightAnchor.startIndex
    )
    .filter(
      (word) =>
        !isInsideSemanticRemove(
          word,
          semanticRemoves
        )
    );

  const supportedBridgeWords =
    bridgeWords.filter((word) =>
      hasExternalTokenSupport(
        word,
        candidate,
        transcription
      )
    );

  const meaningfulBridgeWords =
    supportedBridgeWords.filter((word) =>
      isMeaningfulBridgeToken(
        word.word
      )
    );

  result.blockedBySemanticRemove =
    localWords
      .slice(
        leftAnchor.endIndex + 1,
        rightAnchor.startIndex
      )
      .filter((word) =>
        isInsideSemanticRemove(
          word,
          semanticRemoves
        )
      ).length;

  /*
    SAFE BOUNDARY RULE:

    We only restore SHORT bridge content between two
    locally anchored KEEP phrases. This is intentionally
    conservative. A long bridge is much more likely to be
    an alternate take than a clipped boundary word.

    Every restored word also needs independent support from
    the global transcript or Retake Second Pass. This blocks
    local hallucinations such as the benchmark token "OCO".
  */
  if (
    bridgeWords.length > MAX_BRIDGE_WORDS ||
    meaningfulBridgeWords.length === 0 ||
    meaningfulBridgeWords.length >
      MAX_MEANINGFUL_BRIDGE_WORDS
  ) {
    result.reason =
      bridgeWords.length > MAX_BRIDGE_WORDS
        ? "Reliable local evidence contains a long bridge; treated as possible alternate take, not boundary speech."
        : "No short, externally supported bridge word required restoration.";

    return result;
  }

  for (const word of supportedBridgeWords) {
    const range =
      wordProtectionRange(
        word,
        sourceDuration
      );

    if (
      !range ||
      range.end - range.start <=
        MIN_ITEM_SECONDS
    ) {
      continue;
    }

    const intersectsAudioRemoval =
      plan.items.some(
        (item) =>
          isAudioRemoval(item) &&
          rangeIntersects(
            range,
            item
          )
      );

    if (!intersectsAudioRemoval) {
      continue;
    }

    result.ranges.push({
      ...range,
      candidateId:
        candidate.id,
      words: [
        word.word.trim(),
      ],
    });

    result.protectedWords.push(
      word.word.trim()
    );
  }

  result.ranges = mergeProtectedRanges(result.ranges);
  result.protectedWords = Array.from(new Set(result.protectedWords));
  result.reason =
    result.ranges.length > 0
      ? "Reliable local timing protects speech that Audio Activity proposed removing."
      : "Reliable boundary required no audio restoration.";

  return result;
}

type CoherentLocalMerge = {
  start: number;
  end: number;
  text: string;
  leftTokensUsed: number;
  rightTokensUsed: number;
  overlapTokens: number;
  leftCoverage: number;
  rightCoverage: number;
};

type ReconciledCandidate = {
  candidateId: string;
  recoveredSeconds: number;
  reason: string;
};

type RestartBoundaryResolution = {
  overlapTokens: number;
  trimLeftEnd: number;
  trimmedLeftText: string;
};

function boundaryTokenOverlapLength(
  left: string[],
  right: string[],
  maxTokens = 4
) {
  const maxLength = Math.min(
    maxTokens,
    left.length,
    right.length
  );

  for (let length = maxLength; length >= 1; length -= 1) {
    const leftSuffix = left.slice(left.length - length);
    const rightPrefix = right.slice(0, length);

    if (
      leftSuffix.every(
        (token, index) => token === rightPrefix[index]
      )
    ) {
      return length;
    }
  }

  return 0;
}

function rawWords(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function removePrefixTokens(value: string, count: number) {
  if (count <= 0) return value.trim();
  const words = rawWords(value);
  return words.slice(Math.min(count, words.length)).join(" ").trim();
}

function removeSuffixTokens(value: string, count: number) {
  if (count <= 0) return value.trim();
  const words = rawWords(value);
  return words
    .slice(0, Math.max(0, words.length - Math.min(count, words.length)))
    .join(" ")
    .trim();
}

function mergeTextsWithoutDuplicate(leftText: string, rightText: string) {
  const leftRaw = rawWords(leftText);
  const rightRaw = rawWords(rightText);
  const left = leftRaw.map(normalizeToken);
  const right = rightRaw.map(normalizeToken);
  const overlap = boundaryTokenOverlapLength(left, right, 6);

  return [...leftRaw, ...rightRaw.slice(overlap)]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function findRestartAcrossAudioGap(
  candidate: BoundaryLocalTranscription,
  leftItem: SafeBoundaryPlanItem,
  rightItem: SafeBoundaryPlanItem
): RestartBoundaryResolution | null {
  /*
    RESTART-AWARE DUPLICATE RESOLUTION

    A duplicated boundary is not always one phrase split badly. Sometimes the
    speaker says the last word/phrase, pauses, and restarts from that same
    word. Local ASR can collapse both attempts into one abnormally long word
    whose timestamp crosses the detected audio gap.

    In that specific geometry, preserve the later retry and trim the duplicated
    suffix from the earlier KEEP instead of reconciling both sides into one
    continuous local phrase. This is lexical/temporal, not phrase-specific.
  */
  if (candidate.reliability.status !== "RELIABLE") {
    return null;
  }

  if (
    !candidate.triggers.includes("semantic-keep-split-by-audio") ||
    candidate.gapDuration < MIN_RESTART_GAP_SECONDS
  ) {
    return null;
  }

  const leftEdgeMatchesGap =
    Math.abs(leftItem.end - candidate.gapStart) <=
    RESTART_EDGE_TOLERANCE_SECONDS;
  const rightEdgeMatchesGap =
    Math.abs(rightItem.start - candidate.gapEnd) <=
    RESTART_EDGE_TOLERANCE_SECONDS;

  if (!leftEdgeMatchesGap || !rightEdgeMatchesGap) {
    return null;
  }

  const leftTokens = textTokens(leftItem.text);
  const rightTokens = textTokens(rightItem.text);
  const overlapTokens = boundaryTokenOverlapLength(
    leftTokens,
    rightTokens,
    4
  );

  if (
    overlapTokens === 0 ||
    rightTokens.length <= overlapTokens
  ) {
    return null;
  }

  const duplicateSequence = rightTokens.slice(0, overlapTokens);
  const localWords = candidate.words.filter((word) =>
    Boolean(normalizeToken(word.word))
  );
  const localTokens = localWords.map((word) =>
    normalizeToken(word.word)
  );

  const occurrences = findSequenceOccurrences(
    localTokens,
    duplicateSequence
  );

  let best:
    | {
        trimLeftEnd: number;
        distance: number;
      }
    | null = null;

  for (const occurrence of occurrences) {
    const matchedWords = localWords.slice(
      occurrence.startIndex,
      occurrence.endIndex + 1
    );
    const first = matchedWords[0];
    const last = matchedWords[matchedWords.length - 1];

    if (!first || !last) {
      continue;
    }

    const oneWordCrossesGap = matchedWords.some(
      (word) =>
        word.start <=
          candidate.gapStart + RESTART_CROSSING_TOLERANCE_SECONDS &&
        word.end >=
          candidate.gapEnd - RESTART_CROSSING_TOLERANCE_SECONDS
    );

    const repeatedPhraseCrossesGap =
      overlapTokens > 1 &&
      first.start <=
        candidate.gapStart + RESTART_CROSSING_TOLERANCE_SECONDS &&
      last.end >=
        candidate.gapEnd - RESTART_CROSSING_TOLERANCE_SECONDS;

    if (!oneWordCrossesGap && !repeatedPhraseCrossesGap) {
      continue;
    }

    const trimLeftEnd = Math.max(
      leftItem.start,
      Math.min(leftItem.end, first.start)
    );

    const distance = Math.abs(first.start - candidate.gapStart);

    if (!best || distance < best.distance) {
      best = { trimLeftEnd, distance };
    }
  }

  if (!best) {
    return null;
  }

  return {
    overlapTokens,
    trimLeftEnd: roundTime(best.trimLeftEnd),
    trimmedLeftText: removeSuffixTokens(
      leftItem.text,
      overlapTokens
    ),
  };
}

function findCoherentLocalMerge(
  candidate: BoundaryLocalTranscription,
  sourceDuration: number
): CoherentLocalMerge | null {
  if (candidate.reliability.status !== "RELIABLE") {
    return null;
  }

  const localWords = candidate.words.filter(
    (word) => Boolean(normalizeToken(word.word))
  );

  if (localWords.length < 2) {
    return null;
  }

  const localTokens = localWords.map((word) => normalizeToken(word.word));
  const leftTokens = textTokens(candidate.leftText);
  const rightTokens = textTokens(candidate.rightText);

  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return null;
  }

  const maxLeft = Math.min(MAX_ANCHOR_TOKENS, leftTokens.length);
  const maxRight = Math.min(MAX_ANCHOR_TOKENS, rightTokens.length);

  let best:
    | {
        startIndex: number;
        endIndex: number;
        leftTokensUsed: number;
        rightTokensUsed: number;
        overlapTokens: number;
        score: number;
      }
    | null = null;

  for (let leftLength = 1; leftLength <= maxLeft; leftLength += 1) {
    const leftSequence = leftTokens.slice(leftTokens.length - leftLength);

    for (let rightLength = 1; rightLength <= maxRight; rightLength += 1) {
      const rightSequence = rightTokens.slice(0, rightLength);
      const overlapTokens = boundaryTokenOverlapLength(
        leftSequence,
        rightSequence,
        Math.min(4, leftLength, rightLength)
      );

      // Reconcile only a real duplicated lexical boundary.
      if (overlapTokens === 0) {
        continue;
      }

      const mergedSequence = [
        ...leftSequence,
        ...rightSequence.slice(overlapTokens),
      ];

      if (
        mergedSequence.length < 3 ||
        mergedSequence.length > MAX_LOCAL_RECONCILIATION_WORDS
      ) {
        continue;
      }

      const occurrences = findSequenceOccurrences(localTokens, mergedSequence);

      for (const occurrence of occurrences) {
        const firstWord = localWords[occurrence.startIndex];
        const lastWord = localWords[occurrence.endIndex];
        const duration = lastWord.end - firstWord.start;

        if (
          duration <= 0 ||
          duration > MAX_LOCAL_RECONCILIATION_SECONDS
        ) {
          continue;
        }

        const distance = Math.abs(
          (firstWord.start + lastWord.end) / 2 -
            (candidate.gapStart + candidate.gapEnd) / 2
        );

        const score =
          mergedSequence.length * 100 +
          leftLength * 4 +
          rightLength * 4 +
          overlapTokens * 10 -
          distance;

        if (!best || score > best.score) {
          best = {
            startIndex: occurrence.startIndex,
            endIndex: occurrence.endIndex,
            leftTokensUsed: leftLength,
            rightTokensUsed: rightLength,
            overlapTokens,
            score,
          };
        }
      }
    }
  }

  if (!best) {
    return null;
  }

  const firstWord = localWords[best.startIndex];
  const lastWord = localWords[best.endIndex];
  const matchedWords = localWords.slice(best.startIndex, best.endIndex + 1);

  return {
    start: roundTime(
      Math.max(0, firstWord.start - RECONCILIATION_PRE_SECONDS)
    ),
    end: roundTime(
      Math.min(sourceDuration, lastWord.end + RECONCILIATION_POST_SECONDS)
    ),
    text: matchedWords
      .map((word) => word.word.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
    leftTokensUsed: best.leftTokensUsed,
    rightTokensUsed: best.rightTokensUsed,
    overlapTokens: best.overlapTokens,
    leftCoverage: best.leftTokensUsed / Math.max(1, leftTokens.length),
    rightCoverage: best.rightTokensUsed / Math.max(1, rightTokens.length),
  };
}

function reconcileDuplicateBoundaries(
  sourcePlan: SafeBoundaryCutPlan,
  boundarySecondPass: BoundarySecondPassResult,
  sourceDuration: number
) {
  let items = sourcePlan.items.map((item) => ({ ...item }));
  const reconciled = new Map<string, ReconciledCandidate>();

  for (const candidate of boundarySecondPass.transcriptions) {
    /*
      HARD RETAKE BARRIER

      If the Boundary candidate explicitly spans one or more spoken items that
      the Take Selector marked REMOVE, do not build a new coherent KEEP across
      them. Boundary evidence can still protect a clipped word on either side,
      but it cannot merge THROUGH a semantic REMOVE.
    */
    if (candidateHasSemanticRetakeBarrier(items, candidate)) {
      continue;
    }

    const leftItem = items.find((item) => item.id === candidate.leftKeepId);
    const rightItem = items.find((item) => item.id === candidate.rightKeepId);

    if (
      !leftItem ||
      !rightItem ||
      leftItem.decision === "REMOVE" ||
      rightItem.decision === "REMOVE"
    ) {
      continue;
    }

    const restart = findRestartAcrossAudioGap(
      candidate,
      leftItem,
      rightItem
    );

    if (restart) {
      const nextItems: SafeBoundaryPlanItem[] = [];

      for (const item of items) {
        if (item.id !== leftItem.id) {
          nextItems.push({ ...item });
          continue;
        }

        const residualDuration = restart.trimLeftEnd - item.start;

        if (
          restart.trimmedLeftText &&
          residualDuration >= MIN_KEEP_RESIDUAL_SECONDS
        ) {
          nextItems.push({
            ...item,
            id: `${item.id}-restart-${candidate.id}`,
            end: restart.trimLeftEnd,
            text: restart.trimmedLeftText,
            confidence: Math.max(item.confidence, 0.99),
            reason:
              "Safe Boundary Resolver: reinicio detectado tras una pausa real; se elimina la repetición del intento anterior y se conserva la toma posterior.",
          });
        } else {
          nextItems.push({
            ...item,
            decision: "REMOVE",
            confidence: Math.max(item.confidence, 0.99),
            reason:
              "Safe Boundary Resolver: intento anterior descartado porque reinicia la misma palabra o frase después de una pausa real.",
          });
        }
      }

      items = nextItems.sort(
        (a, b) =>
          a.start - b.start ||
          a.end - b.end ||
          a.id.localeCompare(b.id)
      );

      reconciled.set(candidate.id, {
        candidateId: candidate.id,
        recoveredSeconds: 0,
        reason: `Reinicio local detectado; ${restart.overlapTokens} token(s) repetido(s) del intento anterior eliminados y se conserva la repetición posterior.`,
      });
      continue;
    }

    const localMerge = findCoherentLocalMerge(candidate, sourceDuration);

    if (!localMerge) {
      continue;
    }

    const mergeRange = {
      start: localMerge.start,
      end: localMerge.end,
    };

    const semanticConflict = items.some(
      (item) =>
        item.decision === "REMOVE" &&
        !isAudioRemoval(item) &&
        rangeIntersects(
          semanticRemoveRange(item),
          mergeRange
        )
    );

    if (semanticConflict) {
      continue;
    }

    const recoveredSeconds = roundTime(
      items
        .filter((item) => isAudioRemoval(item))
        .reduce(
          (total, item) =>
            total +
            overlapSeconds(
              mergeRange.start,
              mergeRange.end,
              item.start,
              item.end
            ),
          0
        )
    );

    const replaceEarlierRetry =
      localMerge.leftCoverage >= 0.999 &&
      candidate.gapDuration > 0.08 &&
      mergeRange.start >=
        leftItem.end - RETRY_REPLACEMENT_TOLERANCE_SECONDS;

    const nextItems: SafeBoundaryPlanItem[] = [];

    for (const item of items) {
      if (item.id === leftItem.id && replaceEarlierRetry) {
        nextItems.push({
          ...item,
          decision: "REMOVE",
          confidence: Math.max(0.99, item.confidence),
          reason:
            "Safe Boundary Resolver: intento incompleto sustituido por una frase local completa y coherente.",
        });
        continue;
      }

      if (
        item.decision === "REMOVE" &&
        !isAudioRemoval(item)
      ) {
        nextItems.push({ ...item });
        continue;
      }

      if (!rangeIntersects(item, mergeRange)) {
        nextItems.push({ ...item });
        continue;
      }

      const residuals = subtractRanges(
        { start: item.start, end: item.end },
        [mergeRange]
      );

      residuals.forEach((part, partIndex) => {
        const duration = part.end - part.start;

        if (
          item.decision !== "REMOVE" &&
          duration < MIN_KEEP_RESIDUAL_SECONDS
        ) {
          return;
        }

        let text = item.text;

        if (isAudioRemoval(item)) {
          text = `Silencio de audio (${duration.toFixed(2)} s)`;
        } else if (
          item.id === leftItem.id &&
          part.end <= mergeRange.start + 0.01
        ) {
          text =
            removeSuffixTokens(
              item.text,
              localMerge.leftTokensUsed
            ) || item.text;
        } else if (
          item.id === rightItem.id &&
          part.start >= mergeRange.end - 0.01
        ) {
          text =
            removePrefixTokens(
              item.text,
              localMerge.rightTokensUsed
            ) || item.text;
        }

        nextItems.push({
          ...item,
          id: `${item.id}-boundary-${candidate.id}-${partIndex}`,
          start: roundTime(part.start),
          end: roundTime(part.end),
          text,
        });
      });
    }

    nextItems.push({
      id: `safe-boundary-phrase-${candidate.id}`,
      start: mergeRange.start,
      end: mergeRange.end,
      text: localMerge.text,
      decision: "KEEP",
      confidence: 0.99,
      reason:
        "Safe Boundary Resolver: frase reconciliada con retranscripción local fiable; se elimina el duplicado de frontera sin cortar habla.",
    });

    items = nextItems.sort(
      (a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id)
    );

    reconciled.set(candidate.id, {
      candidateId: candidate.id,
      recoveredSeconds,
      reason: `Frase local reconciliada; ${localMerge.overlapTokens} token(s) duplicado(s) de frontera eliminados.`,
    });
  }

  return {
    plan: {
      ...sourcePlan,
      items,
      estimatedDuration: estimateDuration(items),
    },
    reconciled,
  };
}

function isSafeBoundaryKeep(item: SafeBoundaryPlanItem) {
  return (
    item.decision === "KEEP" &&
    (
      item.id.startsWith("safe-boundary-") ||
      item.reason.startsWith("Safe Boundary Resolver:")
    )
  );
}

function mergeAdjacentSafeKeeps(items: SafeBoundaryPlanItem[]) {
  const sorted = [...items].sort(
    (a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id)
  );

  const merged: SafeBoundaryPlanItem[] = [];
  let mergedCount = 0;

  for (const item of sorted) {
    const previous = merged[merged.length - 1];

    const canMerge =
      previous &&
      previous.decision === "KEEP" &&
      item.decision === "KEEP" &&
      (isSafeBoundaryKeep(previous) || isSafeBoundaryKeep(item)) &&
      item.start <= previous.end + SAFE_KEEP_MERGE_GAP_SECONDS;

    if (!canMerge) {
      merged.push({ ...item });
      continue;
    }

    previous.end = roundTime(Math.max(previous.end, item.end));
    previous.text = mergeTextsWithoutDuplicate(previous.text, item.text);
    previous.confidence = Math.max(previous.confidence, item.confidence, 0.99);
    previous.reason =
      "Safe Boundary Resolver: KEEP contiguos fusionados después de reconciliar la frontera con evidencia local fiable.";
    previous.id = `${previous.id}+${item.id}`;
    mergedCount += 1;
  }

  return {
    items: merged,
    mergedCount,
  };
}


function itemComesFromKeepId(
  item: SafeBoundaryPlanItem,
  sourceId: string
) {
  if (item.id === sourceId) {
    return true;
  }

  if (item.id.startsWith(`${sourceId}-`)) {
    return true;
  }

  return item.id
    .split("+")
    .some(
      (part) =>
        part === sourceId ||
        part.startsWith(`${sourceId}-`)
    );
}

function localEvidenceConfirmsSingleBoundaryToken(
  candidate: BoundaryLocalTranscription,
  duplicateSequence: string[],
  boundary: number
) {
  if (
    candidate.reliability.status !== "RELIABLE" ||
    duplicateSequence.length === 0
  ) {
    return false;
  }

  const localWords = candidate.words.filter((word) =>
    Boolean(normalizeToken(word.word))
  );

  const localTokens = localWords.map((word) =>
    normalizeToken(word.word)
  );

  const occurrences = findSequenceOccurrences(
    localTokens,
    duplicateSequence
  );

  let bestDistance = Number.POSITIVE_INFINITY;
  let bestLast: BoundaryTranscriptWord | null = null;
  let bestNext: BoundaryTranscriptWord | null = null;

  for (const occurrence of occurrences) {
    const last = localWords[occurrence.endIndex];

    if (!last) {
      continue;
    }

    const distance = Math.abs(last.end - boundary);

    if (distance >= bestDistance) {
      continue;
    }

    bestDistance = distance;
    bestLast = last;
    bestNext = localWords[occurrence.endIndex + 1] ?? null;
  }

  if (!bestLast || bestDistance > 0.15) {
    return false;
  }

  const duplicateEndsAtBoundary =
    bestLast.end >= boundary - 0.15 &&
    bestLast.end <= boundary + 0.04;

  const followingWordStartsAtOrAfterBoundary =
    bestNext === null ||
    bestNext.start >= boundary - 0.04;

  return (
    duplicateEndsAtBoundary &&
    followingWordStartsAtOrAfterBoundary
  );
}

function mergeContinuousDuplicateKeepBoundaries(
  sourceItems: SafeBoundaryPlanItem[],
  boundarySecondPass: BoundarySecondPassResult
) {
  let items = sourceItems.map((item) => ({ ...item }));
  let mergedCount = 0;

  for (const candidate of boundarySecondPass.transcriptions) {
    if (candidate.reliability.status !== "RELIABLE") {
      continue;
    }

    if (candidateHasSemanticRetakeBarrier(items, candidate)) {
      continue;
    }

    const leftIndex = items.findIndex(
      (item) =>
        item.decision === "KEEP" &&
        itemComesFromKeepId(item, candidate.leftKeepId)
    );

    const rightIndex = items.findIndex(
      (item) =>
        item.decision === "KEEP" &&
        itemComesFromKeepId(item, candidate.rightKeepId)
    );

    if (
      leftIndex < 0 ||
      rightIndex < 0 ||
      leftIndex === rightIndex
    ) {
      continue;
    }

    const left = items[leftIndex];
    const right = items[rightIndex];

    const physicalGap = right.start - left.end;

    /*
      If two semantic KEEP blocks are physically contiguous, a renderer cut
      between them buys us nothing and can create an audible repeated edge.

      We only remove that cut when reliable LOCAL evidence confirms that the
      shared suffix/prefix token exists once at the boundary.

      Example:
        "...para la edad" + "edad que tiene"
      becomes one continuous KEEP:
        "...para la edad que tiene"

      Audio is NOT removed here. We are deleting an unnecessary edit point.
    */
    if (Math.abs(physicalGap) > 0.04) {
      continue;
    }

    const leftTokens = textTokens(left.text);
    const rightTokens = textTokens(right.text);
    const overlap = boundaryTokenOverlapLength(
      leftTokens,
      rightTokens,
      4
    );

    if (
      overlap === 0 ||
      rightTokens.length <= overlap
    ) {
      continue;
    }

    const duplicateSequence = rightTokens.slice(0, overlap);
    const boundary = (left.end + right.start) / 2;

    if (
      !localEvidenceConfirmsSingleBoundaryToken(
        candidate,
        duplicateSequence,
        boundary
      )
    ) {
      continue;
    }

    const mergedItem: SafeBoundaryPlanItem = {
      id: `safe-boundary-contiguous-${candidate.id}`,
      start: roundTime(Math.min(left.start, right.start)),
      end: roundTime(Math.max(left.end, right.end)),
      text: mergeTextsWithoutDuplicate(left.text, right.text),
      decision: "KEEP",
      confidence: Math.max(left.confidence, right.confidence, 0.99),
      reason:
        "Safe Boundary Resolver: KEEP contiguos fusionados porque la retranscripción local fiable confirma una sola palabra en la frontera; se elimina el punto de corte redundante.",
    };

    items = items.filter(
      (_, index) => index !== leftIndex && index !== rightIndex
    );

    items.push(mergedItem);
    items.sort(
      (a, b) =>
        a.start - b.start ||
        a.end - b.end ||
        a.id.localeCompare(b.id)
    );

    mergedCount += 1;
  }

  return {
    items,
    mergedCount,
  };
}

function normalizeAdjacentKeepBoundaryText(
  items: SafeBoundaryPlanItem[],
  boundarySecondPass: BoundarySecondPassResult
) {
  const sorted = [...items].sort(
    (a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id)
  );

  let normalizedLabels = 0;

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const left = sorted[index];
    const right = sorted[index + 1];

    if (left.decision !== "KEEP" || right.decision !== "KEEP") {
      continue;
    }

    const physicalGap = right.start - left.end;

    /*
      Metadata-only boundary normalization.

      Whisper can assign the SAME boundary word to both adjacent KEEP labels
      even when the audio contains it only once. Example:

        left  ... "para la edad"  ends at 33.08
        right "edad que tiene"    starts at 33.08

      A reliable local retranscription can show that "edad" actually ends at
      33.08 and "que" begins immediately after it. In that case we must NOT
      trim audio — only remove the duplicated token from the right-hand label.
    */
    if (Math.abs(physicalGap) > 0.035) {
      continue;
    }

    const leftTokens = textTokens(left.text);
    const rightTokens = textTokens(right.text);
    const overlap = boundaryTokenOverlapLength(leftTokens, rightTokens, 4);

    if (overlap === 0 || rightTokens.length <= overlap) {
      continue;
    }

    const duplicateSequence = rightTokens.slice(0, overlap);
    const boundary = (left.end + right.start) / 2;

    const evidence = boundarySecondPass.transcriptions
      .filter((candidate) => candidate.reliability.status === "RELIABLE")
      .flatMap((candidate) => {
        const localWords = candidate.words.filter((word) =>
          Boolean(normalizeToken(word.word))
        );
        const localTokens = localWords.map((word) => normalizeToken(word.word));
        const occurrences = findSequenceOccurrences(
          localTokens,
          duplicateSequence
        );

        const nearest = occurrences
          .map((occurrence) => {
            const first = localWords[occurrence.startIndex];
            const last = localWords[occurrence.endIndex];
            const next: BoundaryTranscriptWord | null =
              localWords[occurrence.endIndex + 1] ?? null;

            return {
              first,
              last,
              next,
              distance: Math.abs(last.end - boundary),
            };
          })
          .filter((match) => match.distance <= 0.12)
          .sort((a, b) => a.distance - b.distance)[0];

        if (!nearest) {
          return [];
        }

        return [
          {
            candidate,
            ...nearest,
          },
        ];
      })
      .sort((a, b) => a.distance - b.distance)[0];

    if (!evidence) {
      continue;
    }

    const duplicateEndsAtBoundary =
      evidence.last.end <= boundary + 0.025 &&
      evidence.last.end >= boundary - 0.12;

    const followingWordStartsOnRight =
      evidence.next === null ||
      evidence.next.start >= boundary - 0.025;

    if (!duplicateEndsAtBoundary || !followingWordStartsOnRight) {
      continue;
    }

    const normalizedRightText = removePrefixTokens(right.text, overlap);

    if (!normalizedRightText) {
      continue;
    }

    right.text = normalizedRightText;
    normalizedLabels += 1;
  }

  return {
    items: sorted,
    normalizedLabels,
  };
}

function applyProtectedRanges(
  plan: SafeBoundaryCutPlan,
  protectedRanges: ProtectedRange[],
  transcriptionsById: Map<string, BoundaryLocalTranscription>
) {
  const nextItems: SafeBoundaryPlanItem[] = [];
  let restoredSegments = 0;
  let restoredSeconds = 0;

  for (const item of plan.items) {
    if (!isAudioRemoval(item)) {
      nextItems.push({ ...item });
      continue;
    }

    const rawBlockers = protectedRanges
      .filter((range) => rangeIntersects(range, item))
      .filter((range) => {
        const candidate = transcriptionsById.get(range.candidateId);

        if (!candidate || candidate.removedItemIds.length === 0) {
          return true;
        }

        const semanticBarriers = plan.items
          .filter(
            (planItem) =>
              planItem.decision === "REMOVE" &&
              !isAudioRemoval(planItem) &&
              candidate.removedItemIds.some((removedId) =>
                itemMatchesSourceId(planItem, removedId)
              )
          )
          .map(semanticRemoveRange);

        return !semanticBarriers.some((barrier) =>
          rangeIntersects(range, barrier)
        );
      })
      .map((range) => ({
        start: Math.max(item.start, range.start),
        end: Math.min(item.end, range.end),
        candidateId: range.candidateId,
        words: [...range.words],
      }))
      .filter((range) => range.end - range.start > MIN_ITEM_SECONDS)
      .sort((a, b) => a.start - b.start || a.end - b.end);

    const blockers: Array<{
      start: number;
      end: number;
      candidateId: string;
      words: string[];
    }> = [];

    for (const blocker of rawBlockers) {
      const previous = blockers[blockers.length - 1];

      if (previous && blocker.start <= previous.end + 0.005) {
        previous.end = Math.max(previous.end, blocker.end);
        previous.words = Array.from(
          new Set([...previous.words, ...blocker.words])
        );
        continue;
      }

      blockers.push({ ...blocker });
    }

    if (blockers.length === 0) {
      nextItems.push({ ...item });
      continue;
    }

    const remaining = subtractRanges(
      { start: item.start, end: item.end },
      blockers
    );

    remaining.forEach((part, index) => {
      nextItems.push({
        ...item,
        id: `${item.id}-safe-${index}`,
        start: roundTime(part.start),
        end: roundTime(part.end),
        text: `Silencio de audio (${(part.end - part.start).toFixed(2)} s)`,
      });
    });

    blockers.forEach((blocker, index) => {
      const transcription = transcriptionsById.get(blocker.candidateId);
      const restoredWords = transcription
        ? wordsForRange(transcription, blocker.start, blocker.end)
        : blocker.words;

      const duration = blocker.end - blocker.start;

      nextItems.push({
        id: `safe-boundary-restore-${blocker.candidateId}-${item.id}-${index}`,
        start: roundTime(blocker.start),
        end: roundTime(blocker.end),
        text:
          restoredWords.join(" ").trim() ||
          blocker.words.join(" ").trim() ||
          "Habla protegida",
        decision: "KEEP",
        confidence: 0.99,
        reason:
          "Safe Boundary Resolver: habla confirmada por retranscripción local fiable; Audio Activity no puede eliminarla.",
      });

      restoredSegments += 1;
      restoredSeconds += duration;
    });
  }

  nextItems.sort(
    (a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id)
  );

  return {
    items: nextItems,
    restoredSegments,
    restoredSeconds: roundTime(restoredSeconds),
  };
}

function estimateDuration(items: SafeBoundaryPlanItem[]) {
  return roundTime(
    items.reduce(
      (total, item) =>
        item.decision === "REMOVE"
          ? total
          : total + Math.max(0, item.end - item.start),
      0
    )
  );
}

export function resolveSafeBoundaries(
  plan: SafeBoundaryCutPlan,
  boundarySecondPass: BoundarySecondPassResult,
  transcription: SafeBoundaryTranscript
): SafeBoundaryResolution {
  const sourceDuration = Math.max(
    plan.originalDuration,
    ...plan.items.map((item) => item.end),
    ...boundarySecondPass.transcriptions.flatMap((candidate) =>
      candidate.words.map((word) => word.end)
    )
  );

  const reliable = boundarySecondPass.transcriptions.filter(
    (candidate) => candidate.reliability.status === "RELIABLE"
  );

  /*
    PHASE 1 — LOCAL PHRASE RECONCILIATION

    Duplicates such as "tiene / tiene" or "edad / edad" are no longer
    trimmed with global Whisper timestamps. When RELIABLE local evidence
    contains one coherent phrase spanning both sides, that local phrase
    becomes the authoritative KEEP around the boundary.
  */
  const reconciliation = reconcileDuplicateBoundaries(
    plan,
    boundarySecondPass,
    sourceDuration
  );

  const workingPlan = reconciliation.plan;
  const candidateResults: SafeBoundaryCandidateResult[] = [];
  const allProtectedRanges: ProtectedRange[] = [];
  let blockedBySemanticRemove = 0;
  let protectedWords = 0;

  for (const candidate of boundarySecondPass.transcriptions) {
    if (candidate.reliability.status !== "RELIABLE") {
      candidateResults.push({
        candidateId: candidate.id,
        status: "SKIPPED",
        reason: "Reliability Gate rejected this local transcription.",
        protectedWords: [],
        restoredSeconds: 0,
        restoredSegments: 0,
      });
      continue;
    }

    const reconciled = reconciliation.reconciled.get(candidate.id);

    if (reconciled) {
      candidateResults.push({
        candidateId: candidate.id,
        status: "APPLIED",
        reason: reconciled.reason,
        protectedWords: [],
        restoredSeconds: reconciled.recoveredSeconds,
        restoredSegments: 1,
      });
      continue;
    }

    const protectedResult = buildProtectedRangesForCandidate(
      candidate,
      workingPlan,
      sourceDuration,
      transcription
    );

    blockedBySemanticRemove += protectedResult.blockedBySemanticRemove;
    protectedWords += protectedResult.protectedWords.length;
    allProtectedRanges.push(...protectedResult.ranges);

    candidateResults.push({
      candidateId: candidate.id,
      status: protectedResult.ranges.length > 0 ? "APPLIED" : "NO_CHANGE",
      reason: protectedResult.reason,
      protectedWords: protectedResult.protectedWords,
      restoredSeconds: 0,
      restoredSegments: 0,
    });
  }

  const mergedProtectedRanges = mergeProtectedRanges(allProtectedRanges);
  const transcriptionsById = new Map(
    boundarySecondPass.transcriptions.map((candidate) => [
      candidate.id,
      candidate,
    ])
  );

  const applied = applyProtectedRanges(
    workingPlan,
    mergedProtectedRanges,
    transcriptionsById
  );

  for (const result of candidateResults) {
    if (
      result.status !== "APPLIED" ||
      reconciliation.reconciled.has(result.candidateId)
    ) {
      continue;
    }

    const candidateRanges = mergedProtectedRanges.filter(
      (range) => range.candidateId === result.candidateId
    );

    let seconds = 0;
    let segments = 0;

    for (const range of candidateRanges) {
      for (const item of workingPlan.items) {
        if (!isAudioRemoval(item)) {
          continue;
        }

        const overlap = overlapSeconds(
          range.start,
          range.end,
          item.start,
          item.end
        );

        if (overlap > MIN_ITEM_SECONDS) {
          seconds += overlap;
          segments += 1;
        }
      }
    }

    result.restoredSeconds = roundTime(seconds);
    result.restoredSegments = segments;
  }

  /*
    PHASE 3 — REMOVE REDUNDANT CUT POINTS

    Two semantic KEEP blocks that touch physically and repeat the same
    boundary token should not remain separate edit segments when RELIABLE
    local evidence confirms one continuous phrase. Removing the edit point
    fixes both the UI label and the real renderer boundary.
  */
  const continuousMerged = mergeContinuousDuplicateKeepBoundaries(
    applied.items,
    boundarySecondPass
  );

  /*
    PHASE 4 — COALESCE SAFE RESTORES

    One protected word can cross two adjacent Audio Activity blocks.
    V1 could therefore render "el detalle" + "detalle" as two SAFE
    RESTORE cards. Merge restored pieces with each other and with an
    adjacent KEEP whenever they are physically contiguous.
  */
  const coalesced = mergeAdjacentSafeKeeps(continuousMerged.items);

  /*
    PHASE 5 — METADATA BOUNDARY NORMALIZATION

    Do not change audio here. Reliable local timing only removes duplicated
    boundary words from adjacent KEEP labels when the duplicated word is
    physically located on the left side of the shared boundary.
  */
  const normalizedLabels = normalizeAdjacentKeepBoundaryText(
    coalesced.items,
    boundarySecondPass
  );

  const finalItems = normalizedLabels.items;
  const estimatedDuration = estimateDuration(finalItems);

  const reconciledRecoveredSeconds = Array.from(
    reconciliation.reconciled.values()
  ).reduce((total, result) => total + result.recoveredSeconds, 0);

  const totalRestoredSeconds = roundTime(
    applied.restoredSeconds + reconciledRecoveredSeconds
  );

  const totalRestoredSegments =
    applied.restoredSegments + reconciliation.reconciled.size;

  const appliedCandidates = candidateResults.filter(
    (result) => result.status === "APPLIED"
  ).length;

  const summarySuffix =
    appliedCandidates > 0
      ? ` Safe Boundaries reconcilió ${reconciliation.reconciled.size} frontera(s), protegió ${protectedWords} palabra(s) y recuperó ~${totalRestoredSeconds.toFixed(2)} s de habla confirmada.`
      : " Safe Boundaries validó las fronteras y no necesitó modificar audio.";

  return {
    plan: {
      ...plan,
      summary: `${plan.summary}${summarySuffix}`.trim(),
      estimatedDuration,
      items: finalItems,
    },
    report: {
      version: "safe-boundary-resolver-v4",
      reliableCandidates: reliable.length,
      rejectedCandidates:
        boundarySecondPass.transcriptions.length - reliable.length,
      appliedCandidates,
      protectedWords,
      restoredSegments: totalRestoredSegments,
      restoredSeconds: totalRestoredSeconds,
      blockedBySemanticRemove,
      reconciledBoundaries: reconciliation.reconciled.size,
      mergedSafeKeeps:
        continuousMerged.mergedCount + coalesced.mergedCount,
      candidateResults,
    },
  };
}
