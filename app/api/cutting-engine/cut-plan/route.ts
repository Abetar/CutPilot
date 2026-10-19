import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";

export const runtime = "nodejs";

type TranscriptSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

type TranscriptWord = {
  word: string;
  start: number;
  end: number;
};

type Transcription = {
  text: string;
  language: string | null;
  duration: number | null;
  segments: TranscriptSegment[];
  words: TranscriptWord[];
};

type AudioSilenceSegment = {
  start: number;
  end: number;
  duration: number;
};

type AudioActivityAnalysis = {
  duration: number;
  thresholdDb: number;
  minSilenceSeconds: number;
  outgoingPaddingSeconds: number;
  incomingPaddingSeconds: number;
  frameSeconds: number;
  silenceSegments: AudioSilenceSegment[];
  takeBoundarySegments: AudioSilenceSegment[];
  removedSeconds: number;
};

type CutDecision =
  | "KEEP"
  | "REMOVE"
  | "REVIEW";

type CutPlanItem = {
  id: string;
  start: number;
  end: number;
  text: string;
  decision: CutDecision;
  confidence: number;
  reason: string;
};

type CutPlan = {
  summary: string;
  originalDuration: number;
  estimatedDuration: number;
  items: CutPlanItem[];
};

type PauseCut = {
  id: string;
  start: number;
  end: number;
  rawGapDuration: number;
};

type Take = {
  id: string;
  start: number;
  end: number;
  text: string;
  duration: number;
  gapBefore: number;
  gapAfter: number;
};

type TakeDecision = {
  takeId: string;
  decision: CutDecision;
  confidence: number;
  reason: string;
};

type TakeSelection = {
  summary: string;
  decisions: TakeDecision[];
};

type TakeState = {
  take: Take;
  decision: CutDecision;
  confidence: number;
  reason: string;
};

type RetakeHint = {
  takeA: string;
  takeB: string;
  similarity: number;
  repeatedPhrase: string | null;
};

type RetakeSecondPassWord = {
  word: string;
  start: number;
  end: number;
};

type RetakeSecondPassTranscription = {
  id: string;
  start: number;
  end: number;
  duration: number;
  score: number;
  triggerWords: string[];
  text: string;
  language: string | null;
  words: RetakeSecondPassWord[];
};

type RetakeSecondPassResult = {
  version: string;
  candidateCount: number;
  transcribedCount: number;
  candidates: Array<{
    id: string;
    start: number;
    end: number;
    duration: number;
    score: number;
    triggerWords: string[];
  }>;
  transcriptions: RetakeSecondPassTranscription[];
};

type LocalRetakeEvidence = {
  candidateId: string;
  start: number;
  end: number;
  text: string;
  repeatedPhrase: string;
  overlappingTakeIds: string[];
};

type OpenAIResponse = {
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;

  error?: {
    message?: string;
  };
};

/*
  ========================================
  CUTTING ENGINE — SAFE BOUNDARY BASELINE
  ========================================

  Architecture:

  GLOBAL WORD TIMESTAMPS
      ↓
  RETAKE SECOND PASS
      ↓
  LOCAL RETAKE TIMING REPAIR
      ↓
  TAKE DETECTOR
      ↓
  AI TAKE SELECTOR
      ↓
  PAUSE CUTTER
      ↓
  FINAL CUT PLAN
      ↓
  CONTINUITY PASS

  The model no longer invents arbitrary time ranges.
  It can only classify concrete take IDs.
*/

/*
  Pause Cutter:
  remove long silent gaps, but preserve
  a tiny edge around spoken words.
*/
const PAUSE_THRESHOLD_SECONDS =
  0.7;

const PAUSE_EDGE_PADDING_SECONDS =
  0.12;

const MIN_PAUSE_REMOVAL_SECONDS =
  0.2;

/*
  Take Detector:

  A take is a spoken chunk separated by a
  meaningful silent gap.

  Using the same 0.70 s threshold is intentional:
  in the user's recording style those pauses often
  happen while reading the next part of the script.

  This gives the AI concrete alternatives to compare
  instead of one giant transcript.
*/
/*
  V4.2:
  El Take Selector anterior separaba tomas solo con
  gaps de 0.70 s. Eso dejó dos intentos de frases
  repetidas dentro del MISMO take.

  Ahora las pausas reales del audio son la fuente
  principal de límites de toma.

  Solo una pausa aplicada de >=140 ms necesita poder
  separar dos speech units; la IA decidirá si son
  partes complementarias o retakes.
*/
const TAKE_BOUNDARY_AUDIO_CUT_SECONDS =
  0.14;

const takeSelectionSchema = {
  type: "object",

  additionalProperties: false,

  required: [
    "summary",
    "decisions",
  ],

  properties: {
    summary: {
      type: "string",
    },

    decisions: {
      type: "array",

      items: {
        type: "object",

        additionalProperties: false,

        required: [
          "takeId",
          "decision",
          "confidence",
          "reason",
        ],

        properties: {
          takeId: {
            type: "string",
          },

          decision: {
            type: "string",

            enum: [
              "KEEP",
              "REMOVE",
              "REVIEW",
            ],
          },

          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },

          reason: {
            type: "string",
          },
        },
      },
    },
  },
};

function roundTime(
  value: number
) {
  return Math.round(
    value * 1000
  ) / 1000;
}

function cleanWords(
  transcription: Transcription
) {
  return transcription.words
    .filter(
      (word) =>
        typeof word.word ===
          "string" &&
        word.word.trim().length >
          0 &&
        Number.isFinite(
          word.start
        ) &&
        Number.isFinite(
          word.end
        ) &&
        word.start >= 0 &&
        word.end >=
          word.start
    )
    .map(
      (word) => ({
        word:
          word.word.trim(),

        start:
          word.start,

        end:
          word.end,
      })
    )
    .sort(
      (a, b) =>
        a.start -
        b.start
    );
}

function normalizeAudioActivityCuts(
  audioActivity: AudioActivityAnalysis
): PauseCut[] {
  return audioActivity.silenceSegments
    .filter(
      (segment) =>
        Number.isFinite(
          segment.start
        ) &&
        Number.isFinite(
          segment.end
        ) &&
        segment.start >= 0 &&
        segment.end >
          segment.start
    )
    .map(
      (
        segment,
        index
      ) => ({
        id:
          `audio-silence-${index}`,

        start:
          roundTime(
            segment.start
          ),

        end:
          roundTime(
            segment.end
          ),

        rawGapDuration:
          roundTime(
            Math.max(
              0,
              segment.duration
            )
          ),
      })
    )
    .sort(
      (a, b) =>
        a.start -
        b.start
    );
}

function normalizeAudioTakeBoundaries(
  audioActivity: AudioActivityAnalysis
): PauseCut[] {
  const source =
    Array.isArray(
      audioActivity.takeBoundarySegments
    )
      ? audioActivity.takeBoundarySegments
      : audioActivity.silenceSegments;

  return source
    .filter(
      (segment) =>
        Number.isFinite(
          segment.start
        ) &&
        Number.isFinite(
          segment.end
        ) &&
        segment.start >= 0 &&
        segment.end >
          segment.start
    )
    .map(
      (
        segment,
        index
      ) => ({
        id:
          `take-boundary-${index}`,

        start:
          roundTime(
            segment.start
          ),

        end:
          roundTime(
            segment.end
          ),

        rawGapDuration:
          roundTime(
            Math.max(
              0,
              segment.duration
            )
          ),
      })
    )
    .sort(
      (a, b) =>
        a.start -
        b.start
    );
}

function detectPauseCuts(
  transcription: Transcription
): PauseCut[] {
  const words =
    cleanWords(
      transcription
    );

  if (
    words.length === 0
  ) {
    return [];
  }

  const pauses:
    PauseCut[] = [];

  let pauseIndex = 0;

  function addPause(
    rawStart: number,
    rawEnd: number,
    mode:
      | "LEADING"
      | "BETWEEN"
      | "TRAILING"
  ) {
    const rawGapDuration =
      rawEnd -
      rawStart;

    if (
      rawGapDuration <=
      PAUSE_THRESHOLD_SECONDS
    ) {
      return;
    }

    let start =
      rawStart;

    let end =
      rawEnd;

    if (
      mode ===
      "LEADING"
    ) {
      end =
        rawEnd -
        PAUSE_EDGE_PADDING_SECONDS;
    } else if (
      mode ===
      "TRAILING"
    ) {
      start =
        rawStart +
        PAUSE_EDGE_PADDING_SECONDS;
    } else {
      start =
        rawStart +
        PAUSE_EDGE_PADDING_SECONDS;

      end =
        rawEnd -
        PAUSE_EDGE_PADDING_SECONDS;
    }

    start =
      Math.max(
        0,
        start
      );

    end =
      Math.max(
        start,
        end
      );

    if (
      end -
        start <
      MIN_PAUSE_REMOVAL_SECONDS
    ) {
      return;
    }

    pauses.push({
      id:
        `pause-${pauseIndex}`,

      start:
        roundTime(
          start
        ),

      end:
        roundTime(
          end
        ),

      rawGapDuration:
        roundTime(
          rawGapDuration
        ),
    });

    pauseIndex += 1;
  }

  addPause(
    0,
    words[0].start,
    "LEADING"
  );

  for (
    let index = 0;
    index <
      words.length - 1;
    index += 1
  ) {
    const current =
      words[index];

    const next =
      words[index + 1];

    addPause(
      current.end,
      next.start,
      "BETWEEN"
    );
  }

  if (
    typeof transcription.duration ===
      "number" &&
    Number.isFinite(
      transcription.duration
    ) &&
    transcription.duration >
      0
  ) {
    addPause(
      words[
        words.length - 1
      ].end,
      transcription.duration,
      "TRAILING"
    );
  }

  return pauses;
}

function hasAudioBoundaryBetween(
  current: TranscriptWord,
  next: TranscriptWord,
  pauseCuts: PauseCut[]
) {
  return pauseCuts.some(
    (pause) => {
      const duration =
        pause.end -
        pause.start;

      if (
        duration <
        TAKE_BOUNDARY_AUDIO_CUT_SECONDS
      ) {
        return false;
      }

      /*
        El silence cut puede tocar levemente el inicio
        de la siguiente palabra antes del word guard.

        Basta con que viva mayormente entre ambos words
        para usarlo como límite de take.
      */
      return (
        pause.end >
          current.end &&
        pause.start <
          next.start
      );
    }
  );
}

function buildTakes(
  transcription: Transcription,
  pauseCuts: PauseCut[]
): Take[] {
  const words =
    cleanWords(
      transcription
    );

  if (
    words.length === 0
  ) {
    return [];
  }

  const takes:
    Take[] = [];

  let currentWords:
    typeof words = [];

  let takeIndex = 0;

  function flushTake(
    gapBefore: number,
    gapAfter: number
  ) {
    if (
      currentWords.length === 0
    ) {
      return;
    }

    const first =
      currentWords[0];

    const last =
      currentWords[
        currentWords.length - 1
      ];

    const text =
      currentWords
        .map(
          (word) =>
            word.word
        )
        .join(" ")
        .replace(
          /\s+/g,
          " "
        )
        .trim();

    takes.push({
      id:
        `take-${takeIndex}`,

      start:
        roundTime(
          first.start
        ),

      end:
        roundTime(
          last.end
        ),

      text,

      duration:
        roundTime(
          last.end -
          first.start
        ),

      gapBefore:
        roundTime(
          Math.max(
            0,
            gapBefore
          )
        ),

      gapAfter:
        roundTime(
          Math.max(
            0,
            gapAfter
          )
        ),
    });

    takeIndex += 1;
    currentWords = [];
  }

  let previousGap =
    words[0].start;

  for (
    let index = 0;
    index <
      words.length;
    index += 1
  ) {
    const word =
      words[index];

    currentWords.push(
      word
    );

    const next =
      words[index + 1];

    if (!next) {
      const trailingGap =
        typeof transcription.duration ===
          "number" &&
        Number.isFinite(
          transcription.duration
        )
          ? Math.max(
              0,
              transcription.duration -
                word.end
            )
          : 0;

      flushTake(
        previousGap,
        trailingGap
      );

      break;
    }

    const gap =
      next.start -
      word.end;

    const audioBoundary =
      hasAudioBoundaryBetween(
        word,
        next,
        pauseCuts
      );

    /*
      Audio real primero.

      Dejamos el gap de 0.70 s como fallback por si
      existe un caso donde Web Audio no marcó el hueco.
    */
    if (
      audioBoundary ||
      gap >
        0.7
    ) {
      flushTake(
        previousGap,
        gap
      );

      previousGap =
        gap;
    }
  }

  return takes;
}

function textForRange(
  transcription: Transcription,
  start: number,
  end: number
) {
  return transcription.words
    .filter(
      (word) =>
        Number.isFinite(
          word.start
        ) &&
        Number.isFinite(
          word.end
        ) &&
        word.end >
          start &&
        word.start <
          end
    )
    .map(
      (word) =>
        word.word.trim()
    )
    .filter(
      Boolean
    )
    .join(" ")
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

type TimedRange = {
  start: number;
  end: number;
};

function subtractRanges(
  range: TimedRange,
  blockers: TimedRange[]
): TimedRange[] {
  let parts:
    TimedRange[] = [
      {
        start:
          range.start,

        end:
          range.end,
      },
    ];

  const sortedBlockers =
    blockers
      .filter(
        (blocker) =>
          blocker.end >
            range.start &&
          blocker.start <
            range.end
      )
      .sort(
        (a, b) =>
          a.start -
          b.start
      );

  for (
    const blocker of
      sortedBlockers
  ) {
    const nextParts:
      TimedRange[] = [];

    for (
      const part of
        parts
    ) {
      if (
        blocker.end <=
          part.start ||
        blocker.start >=
          part.end
      ) {
        nextParts.push(
          part
        );

        continue;
      }

      if (
        blocker.start >
        part.start
      ) {
        nextParts.push({
          start:
            part.start,

          end:
            Math.min(
              part.end,
              blocker.start
            ),
        });
      }

      if (
        blocker.end <
        part.end
      ) {
        nextParts.push({
          start:
            Math.max(
              part.start,
              blocker.end
            ),

          end:
            part.end,
        });
      }
    }

    parts =
      nextParts;
  }

  return parts.filter(
    (part) =>
      part.end -
        part.start >
      0.015
  );
}

function normalizeTakeTokens(
  text: string
) {
  return text
    .toLocaleLowerCase(
      "es-MX"
    )
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-z0-9ñáéíóúü\s]/gi,
      " "
    )
    .split(
      /\s+/
    )
    .map(
      (token) =>
        token.trim()
    )
    .filter(
      (token) =>
        token.length >
        1
    );
}

function findRepeatedPhrase(
  a: string[],
  b: string[],
  minWords = 4
) {
  let best:
    string[] = [];

  for (
    let i = 0;
    i <
      a.length;
    i += 1
  ) {
    for (
      let j = 0;
      j <
        b.length;
      j += 1
    ) {
      const match:
        string[] = [];

      let offset =
        0;

      while (
        i + offset <
          a.length &&
        j + offset <
          b.length &&
        a[
          i + offset
        ] ===
          b[
            j + offset
          ]
      ) {
        match.push(
          a[
            i + offset
          ]
        );

        offset += 1;
      }

      if (
        match.length >
        best.length
      ) {
        best =
          match;
      }
    }
  }

  return best.length >=
    minWords
    ? best.join(
        " "
      )
    : null;
}

function normalizeSingleToken(
  value: string
) {
  return value
    .toLocaleLowerCase(
      "es-MX"
    )
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-z0-9ñáéíóúü]/gi,
      ""
    )
    .trim();
}

const SECOND_PASS_BOUNDARY_EPSILON_SECONDS =
  0.04;

function hasSuspiciousRepeatedCharacters(
  value: string
) {
  /*
    Ejemplos que queremos rechazar:
    "LLORRRRNNNNNNNNNNNNNN"
    "aaaaaaa"
    "zzzzzzzz"

    No penalizamos puntuación repetida como "...".
  */
  return /([a-záéíóúüñ])\1{5,}/i.test(
    value
  );
}

function isReliableSecondPassTranscription(
  transcription: RetakeSecondPassTranscription
) {
  if (
    typeof transcription.text !==
      "string" ||
    !transcription.text.trim() ||
    !Array.isArray(
      transcription.words
    ) ||
    transcription.words.length <
      3
  ) {
    return false;
  }

  if (
    hasSuspiciousRepeatedCharacters(
      transcription.text
    )
  ) {
    return false;
  }

  for (
    const word of
      transcription.words
  ) {
    if (
      typeof word.word !==
        "string"
    ) {
      return false;
    }

    const raw =
      word.word.trim();

    const normalized =
      normalizeSingleToken(
        raw
      );

    /*
      Una "palabra" enorme o con la misma letra
      repetida muchas veces es señal de una
      retranscripción local degradada.

      En V4.5 esto permitió que una ventana con
      "LLORRRRNNNN..." reconstruyera takes reales.
    */
    if (
      normalized.length >
        28 ||
      hasSuspiciousRepeatedCharacters(
        normalized
      )
    ) {
      return false;
    }

    if (
      !Number.isFinite(
        word.start
      ) ||
      !Number.isFinite(
        word.end
      ) ||
      word.end <
        word.start
    ) {
      return false;
    }
  }

  return true;
}

function findRepeatedLocalPhrase(
  transcription: RetakeSecondPassTranscription,
  minWords = 3
) {
  const tokens =
    transcription.words
      .map(
        (word) => ({
          token:
            normalizeSingleToken(
              word.word
            ),

          start:
            word.start,

          end:
            word.end,
        })
      )
      .filter(
        (word) =>
          word.token.length >
          1
      );

  if (
    tokens.length <
    minWords * 2
  ) {
    return null;
  }

  let best:
    {
      phrase: string;
      firstIndex: number;
      secondIndex: number;
      length: number;
    } | null =
    null;

  for (
    let firstIndex = 0;
    firstIndex <
      tokens.length;
    firstIndex += 1
  ) {
    for (
      let secondIndex =
        firstIndex +
        minWords;
      secondIndex <
        tokens.length;
      secondIndex += 1
    ) {
      let length =
        0;

      while (
        firstIndex +
          length <
          tokens.length &&
        secondIndex +
          length <
          tokens.length &&
        tokens[
          firstIndex +
            length
        ].token ===
          tokens[
            secondIndex +
              length
          ].token
      ) {
        length += 1;
      }

      if (
        length <
        minWords
      ) {
        continue;
      }

      if (
        !best ||
        length >
          best.length
      ) {
        best = {
          phrase:
            tokens
              .slice(
                firstIndex,
                firstIndex +
                  length
              )
              .map(
                (word) =>
                  word.token
              )
              .join(" "),

          firstIndex,

          secondIndex,

          length,
        };
      }
    }
  }

  return best;
}

function getUsefulSecondPassRetakes(
  secondPass:
    | RetakeSecondPassResult
    | undefined
) {
  if (
    !secondPass ||
    !Array.isArray(
      secondPass.transcriptions
    )
  ) {
    return [];
  }

  return secondPass.transcriptions
    .map(
      (transcription) => {
        if (
          !Array.isArray(
            transcription.words
          ) ||
          transcription.words.length <
            6 ||
          !isReliableSecondPassTranscription(
            transcription
          )
        ) {
          return null;
        }

        const repeated =
          findRepeatedLocalPhrase(
            transcription,
            3
          );

        if (!repeated) {
          return null;
        }

        const validWords =
          transcription.words
            .filter(
              (word) =>
                typeof word.word ===
                  "string" &&
                word.word.trim().length >
                  0 &&
                Number.isFinite(
                  word.start
                ) &&
                Number.isFinite(
                  word.end
                ) &&
                word.end >=
                  word.start
            )
            .map(
              (word) => ({
                word:
                  word.word.trim(),

                start:
                  roundTime(
                    word.start
                  ),

                end:
                  roundTime(
                    word.end
                  ),
              })
            )
            .sort(
              (a, b) =>
                a.start -
                b.start
            );

        if (
          validWords.length <
          6
        ) {
          return null;
        }

        return {
          transcription: {
            ...transcription,

            words:
              validWords,
          },

          repeatedPhrase:
            repeated.phrase,
        };
      }
    )
    .filter(
      (
        item
      ): item is {
        transcription:
          RetakeSecondPassTranscription;
        repeatedPhrase:
          string;
      } =>
        item !== null
    );
}

function repairTranscriptionWithSecondPass(
  transcription: Transcription,
  secondPass:
    | RetakeSecondPassResult
    | undefined
) {
  const useful =
    getUsefulSecondPassRetakes(
      secondPass
    );

  if (
    useful.length ===
    0
  ) {
    return {
      transcription,
      repairedCandidateIds:
        [] as string[],
    };
  }

  let words =
    cleanWords(
      transcription
    );

  const repairedCandidateIds:
    string[] = [];

  for (
    const item of
      useful
  ) {
    const local =
      item.transcription;

    const first =
      local.words[0];

    const last =
      local.words[
        local.words.length - 1
      ];

    if (
      !first ||
      !last ||
      last.end <=
        first.start
    ) {
      continue;
    }

    /*
      Reemplazamos SOLO la zona realmente cubierta
      por las palabras del second pass.

      No sustituimos toda la ventana candidata porque
      puede tener preroll/postroll deliberado.
    */
    const firstToken =
      normalizeSingleToken(
        first.word
      );

    const lastToken =
      normalizeSingleToken(
        last.word
      );

    words =
      words.filter(
        (word) => {
          const overlapsLocalRange =
            word.end >
              first.start &&
            word.start <
              last.end;

          if (
            overlapsLocalRange
          ) {
            return false;
          }

          const token =
            normalizeSingleToken(
              word.word
            );

          /*
            V4.5 podía conservar la misma palabra
            dos veces justo en el borde del reemplazo.

            Ejemplo real:
            local "que" termina 142.02
            global "que" empieza 142.02

            Como no existe overlap matemático,
            ambas sobrevivían y terminábamos con:
            "No significa que que..."
          */
          const duplicatesFirstBoundary =
            token.length >
              0 &&
            token ===
              firstToken &&
            Math.abs(
              word.end -
                first.start
            ) <=
              SECOND_PASS_BOUNDARY_EPSILON_SECONDS;

          const duplicatesLastBoundary =
            token.length >
              0 &&
            token ===
              lastToken &&
            Math.abs(
              word.start -
                last.end
            ) <=
              SECOND_PASS_BOUNDARY_EPSILON_SECONDS;

          return !(
            duplicatesFirstBoundary ||
            duplicatesLastBoundary
          );
        }
      );

    words.push(
      ...local.words.map(
        (word) => ({
          word:
            word.word,

          start:
            word.start,

          end:
            word.end,
        })
      )
    );

    repairedCandidateIds.push(
      local.id
    );
  }

  words.sort(
    (a, b) =>
      a.start -
      b.start ||
      a.end -
        b.end
  );

  return {
    transcription: {
      ...transcription,

      words,
    },

    repairedCandidateIds,
  };
}

function buildLocalRetakeEvidence(
  secondPass:
    | RetakeSecondPassResult
    | undefined,
  takes: Take[]
): LocalRetakeEvidence[] {
  const useful =
    getUsefulSecondPassRetakes(
      secondPass
    );

  return useful.map(
    (item) => {
      const local =
        item.transcription;

      const overlappingTakeIds =
        takes
          .filter(
            (take) =>
              take.end >
                local.start &&
              take.start <
                local.end
          )
          .map(
            (take) =>
              take.id
          );

      return {
        candidateId:
          local.id,

        start:
          roundTime(
            local.start
          ),

        end:
          roundTime(
            local.end
          ),

        text:
          local.text,

        repeatedPhrase:
          item.repeatedPhrase,

        overlappingTakeIds,
      };
    }
  );
}

function buildRetakeHints(
  takes: Take[]
): RetakeHint[] {
  const hints:
    RetakeHint[] = [];

  for (
    let index = 0;
    index <
      takes.length;
    index += 1
  ) {
    const a =
      takes[index];

    const aTokens =
      normalizeTakeTokens(
        a.text
      );

    if (
      aTokens.length <
      3
    ) {
      continue;
    }

    /*
      Comparamos contra las siguientes 3 speech units.
      Un retake normalmente ocurre localmente.
    */
    for (
      let offset = 1;
      offset <= 3;
      offset += 1
    ) {
      const b =
        takes[
          index + offset
        ];

      if (!b) {
        break;
      }

      if (
        b.start -
          a.end >
        15
      ) {
        break;
      }

      const bTokens =
        normalizeTakeTokens(
          b.text
        );

      if (
        bTokens.length <
        3
      ) {
        continue;
      }

      const aSet =
        new Set(
          aTokens
        );

      const bSet =
        new Set(
          bTokens
        );

      const intersection =
        [...aSet].filter(
          (token) =>
            bSet.has(
              token
            )
        ).length;

      const union =
        new Set([
          ...aSet,
          ...bSet,
        ]).size;

      const jaccard =
        union > 0
          ? intersection /
            union
          : 0;

      const repeatedPhrase =
        findRepeatedPhrase(
          aTokens,
          bTokens,
          4
        );

      /*
        Exact phrase repetition is a very strong
        retake candidate.

        Jaccard catches paraphrased attempts.
      */
      if (
        repeatedPhrase ||
        jaccard >=
          0.42
      ) {
        hints.push({
          takeA:
            a.id,

          takeB:
            b.id,

          similarity:
            roundTime(
              jaccard
            ),

          repeatedPhrase,
        });
      }
    }
  }

  return hints;
}

const AUDIO_ACTIVITY_REASON =
  "Silencio detectado directamente en el audio por Audio Activity Cutter.";

const CONTINUITY_REASON_PREFIX =
  "Continuity Pass:";

const CONTINUITY_WORD_PREROLL_SECONDS =
  0.025;

const CONTINUITY_WORD_POSTROLL_SECONDS =
  0.035;

const CONTINUITY_MAX_RESCUE_WORD_SECONDS =
  1.2;

const CONTINUITY_DEGENERATE_WORD_SECONDS =
  0.12;

const CONTINUITY_MIN_AUDIBLE_RESCUE_SECONDS =
  0.34;

const CONTINUITY_MIN_AUDIBLE_PRE_SECONDS =
  0.15;

const CONTINUITY_MIN_AUDIBLE_POST_SECONDS =
  0.19;

const CONTINUITY_MAX_DUPLICATE_TOKENS =
  2;

const CONTINUITY_STOPWORDS =
  new Set([
    "a",
    "al",
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
    "pero",
    "que",
    "se",
    "un",
    "una",
    "y",
  ]);

type ContinuityPassResult = {
  items: CutPlanItem[];
  rescuedWords: number;
  duplicateFixes: number;
};

function continuityTokens(
  value: string
) {
  return value
    .split(/\s+/)
    .map(
      (token) =>
        normalizeSingleToken(
          token
        )
    )
    .filter(Boolean);
}

function overlapSeconds(
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

function visibleKeepAlreadyContainsToken(
  items: CutPlanItem[],
  word: {
    word: string;
    start: number;
    end: number;
  }
) {
  const token =
    normalizeSingleToken(
      word.word
    );

  if (!token) {
    return false;
  }

  return items.some(
    (item) => {
      if (
        item.decision ===
          "REMOVE"
      ) {
        return false;
      }

      const temporalOverlap =
        overlapSeconds(
          word.start,
          word.end,
          item.start,
          item.end
        );

      const nearDegenerateMark =
        word.end -
          word.start <=
          CONTINUITY_DEGENERATE_WORD_SECONDS &&
        word.start >=
          item.start -
            0.08 &&
        word.start <=
          item.end +
            0.08;

      if (
        temporalOverlap <=
          0.015 &&
        !nearDegenerateMark
      ) {
        return false;
      }

      return continuityTokens(
        item.text
      ).includes(
        token
      );
    }
  );
}

function isMeaningfulContinuityWord(
  value: string
) {
  const token =
    normalizeSingleToken(
      value
    );

  if (!token) {
    return false;
  }

  if (
    /\d/.test(
      token
    )
  ) {
    return true;
  }

  if (
    CONTINUITY_STOPWORDS.has(
      token
    )
  ) {
    return false;
  }

  return token.length >= 4;
}

function findBoundaryTokenOverlap(
  leftText: string,
  rightText: string
) {
  const left =
    continuityTokens(
      leftText
    );

  const right =
    continuityTokens(
      rightText
    );

  const maxLength =
    Math.min(
      CONTINUITY_MAX_DUPLICATE_TOKENS,
      left.length,
      right.length
    );

  for (
    let length =
      maxLength;
    length >= 1;
    length -= 1
  ) {
    const leftSuffix =
      left.slice(
        left.length -
          length
      );

    const rightPrefix =
      right.slice(
        0,
        length
      );

    const same =
      leftSuffix.every(
        (
          token,
          index
        ) =>
          token ===
          rightPrefix[index]
      );

    if (same) {
      return {
        length,
        left,
        right,
      };
    }
  }

  return null;
}

function subtractRangeFromAudioItems(
  items: CutPlanItem[],
  rescueRange: TimedRange,
  suffix: string
) {
  const next:
    CutPlanItem[] = [];

  for (
    const item of
      items
  ) {
    const isAudioCut =
      item.decision ===
        "REMOVE" &&
      item.reason ===
        AUDIO_ACTIVITY_REASON;

    if (
      !isAudioCut ||
      item.end <=
        rescueRange.start ||
      item.start >=
        rescueRange.end
    ) {
      next.push(
        item
      );

      continue;
    }

    const remaining =
      subtractRanges(
        {
          start:
            item.start,

          end:
            item.end,
        },
        [
          rescueRange,
        ]
      );

    remaining.forEach(
      (
        part,
        partIndex
      ) => {
        if (
          part.end -
            part.start <=
          0.015
        ) {
          return;
        }

        next.push({
          ...item,

          id:
            `${item.id}-continuity-${suffix}-${partIndex}`,

          start:
            roundTime(
              part.start
            ),

          end:
            roundTime(
              part.end
            ),

          text:
            `Silencio de audio (${(
              part.end -
              part.start
            ).toFixed(2)} s)`,
        });
      }
    );
  }

  return next;
}

function rescueWordsErasedByAudio(
  sourceItems: CutPlanItem[],
  transcription: Transcription,
  takeStates: TakeState[]
) {
  let items =
    sourceItems.map(
      (item) => ({
        ...item,
      })
    );

  let rescuedWords =
    0;

  const sourceDuration =
    typeof transcription.duration ===
      "number" &&
    Number.isFinite(
      transcription.duration
    ) &&
    transcription.duration >
      0
      ? transcription.duration
      : Math.max(
          0,
          ...transcription.words.map(
            (word) =>
              Number.isFinite(
                word.end
              )
                ? word.end
                : 0
          ),
          ...takeStates.map(
            (state) =>
              state.take.end
          )
        );

  const existingRescues:
    TimedRange[] = [];

  const keepStates =
    takeStates.filter(
      (state) =>
        state.decision ===
        "KEEP"
    );

  for (
    const state of
      keepStates
  ) {
    const takeWords =
      transcription.words
        .filter(
          (word) =>
            typeof word.word ===
              "string" &&
            word.word.trim() &&
            Number.isFinite(
              word.start
            ) &&
            Number.isFinite(
              word.end
            ) &&
            word.end >=
              word.start &&
            word.end >
              state.take.start &&
            word.start <
              state.take.end
        )
        .sort(
          (a, b) =>
            a.start -
            b.start
        );

    for (
      let wordIndex = 0;
      wordIndex <
        takeWords.length;
      wordIndex += 1
    ) {
      const word =
        takeWords[
          wordIndex
        ];

      if (
        !isMeaningfulContinuityWord(
          word.word
        )
      ) {
        continue;
      }

      const wordDuration =
        Math.max(
          0,
          word.end -
            word.start
        );

      if (
        wordDuration >
        CONTINUITY_MAX_RESCUE_WORD_SECONDS
      ) {
        continue;
      }

      if (
        visibleKeepAlreadyContainsToken(
          items,
          word
        )
      ) {
        continue;
      }

      const visibleOverlap =
        items
          .filter(
            (item) =>
              item.decision !==
                "REMOVE"
          )
          .reduce(
            (
              total,
              item
            ) =>
              total +
              overlapSeconds(
                word.start,
                word.end,
                item.start,
                item.end
              ),
            0
          );

      /*
        Si cualquier porción razonable de la palabra ya
        sobrevive, no intervenimos.

        El objetivo NO es volver al antiguo Word Guard.
        Solo rescatar palabras que desaparecieron por
        completo.
      */
      const alreadyVisible =
        wordDuration >
          0.02
          ? visibleOverlap >=
            wordDuration *
              0.35
          : visibleOverlap >
            0.015;

      if (
        alreadyVisible
      ) {
        continue;
      }

      const audioRemovedOverlap =
        items
          .filter(
            (item) =>
              item.decision ===
                "REMOVE" &&
              item.reason ===
                AUDIO_ACTIVITY_REASON
          )
          .reduce(
            (
              total,
              item
            ) =>
              total +
              overlapSeconds(
                word.start,
                word.end,
                item.start,
                item.end
              ),
            0
          );

      const erasedByAudio =
        wordDuration >
          0.02
          ? audioRemovedOverlap >=
            wordDuration *
              0.6
          : items.some(
              (item) =>
                item.decision ===
                  "REMOVE" &&
                item.reason ===
                  AUDIO_ACTIVITY_REASON &&
                word.start >=
                  item.start -
                    0.03 &&
                word.start <=
                  item.end +
                    0.03
            );

      if (
        !erasedByAudio
      ) {
        continue;
      }

      const wordIsDegenerate =
        wordDuration <=
        CONTINUITY_DEGENERATE_WORD_SECONDS;

      let rescueStart =
        Math.max(
          0,
          word.start -
            CONTINUITY_WORD_PREROLL_SECONDS
        );

      let rescueEnd =
        Math.min(
          sourceDuration,
          word.end +
            CONTINUITY_WORD_POSTROLL_SECONDS
        );

      if (
        wordIsDegenerate ||
        rescueEnd -
          rescueStart <
          CONTINUITY_MIN_AUDIBLE_RESCUE_SECONDS
      ) {
        const center =
          (
            word.start +
            word.end
          ) /
          2;

        rescueStart =
          Math.max(
            0,
            center -
              CONTINUITY_MIN_AUDIBLE_PRE_SECONDS
          );

        rescueEnd =
          Math.min(
            sourceDuration,
            center +
              CONTINUITY_MIN_AUDIBLE_POST_SECONDS
          );
      }

      if (
        rescueEnd -
          rescueStart <=
        0.02
      ) {
        continue;
      }

      const overlapsPreviousRescue =
        existingRescues.some(
          (range) =>
            range.end >
              rescueStart &&
            range.start <
              rescueEnd
        );

      if (
        overlapsPreviousRescue
      ) {
        continue;
      }

      const rescueRange = {
        start:
          roundTime(
            rescueStart
          ),

        end:
          roundTime(
            rescueEnd
          ),
      };

      items =
        subtractRangeFromAudioItems(
          items,
          rescueRange,
          `${state.take.id}-${wordIndex}`
        );

      items.push({
        id:
          `continuity-restore-${state.take.id}-${wordIndex}`,

        start:
          rescueRange.start,

        end:
          rescueRange.end,

        text:
          word.word.trim(),

        decision:
          "KEEP",

        confidence:
          Math.max(
            0.9,
            state.confidence
          ),

        reason:
          `${CONTINUITY_REASON_PREFIX} palabra significativa restaurada porque pertenecía a una toma KEEP y Audio Activity la había eliminado por completo.`,
      });

      existingRescues.push(
        rescueRange
      );

      rescuedWords += 1;
    }
  }

  items.sort(
    (a, b) =>
      a.start -
        b.start ||
      a.end -
        b.end
  );

  return {
    items,
    rescuedWords,
  };
}

function trimDuplicatePrefixFromRightItem(
  item: CutPlanItem,
  overlapLength: number,
  transcription: Transcription
) {
  const words =
    transcription.words
      .filter(
        (word) =>
          typeof word.word ===
            "string" &&
          word.word.trim() &&
          Number.isFinite(
            word.start
          ) &&
          Number.isFinite(
            word.end
          ) &&
          word.end >
            item.start &&
          word.start <
            item.end
      )
      .sort(
        (a, b) =>
          a.start -
          b.start
      );

  const expectedPrefix =
    continuityTokens(
      item.text
    ).slice(
      0,
      overlapLength
    );

  const timedTokens =
    words.map(
      (word) =>
        normalizeSingleToken(
          word.word
        )
    );

  for (
    let startIndex = 0;
    startIndex <
      timedTokens.length;
    startIndex += 1
  ) {
    let matches =
      true;

    for (
      let offset = 0;
      offset <
        expectedPrefix.length;
      offset += 1
    ) {
      if (
        timedTokens[
          startIndex +
            offset
        ] !==
        expectedPrefix[
          offset
        ]
      ) {
        matches =
          false;

        break;
      }
    }

    if (
      !matches
    ) {
      continue;
    }

    const nextWord =
      words[
        startIndex +
          expectedPrefix.length
      ];

    if (
      !nextWord ||
      nextWord.start >=
        item.end
    ) {
      return null;
    }

    const newStart =
      roundTime(
        Math.max(
          item.start,
          nextWord.start
        )
      );

    if (
      newStart <=
        item.start +
          0.015 ||
      newStart >=
        item.end -
          0.015
    ) {
      return null;
    }

    const newText =
      textForRange(
        transcription,
        newStart,
        item.end
      );

    return {
      newStart,
      newText:
        newText ||
        continuityTokens(
          item.text
        )
          .slice(
            overlapLength
          )
          .join(" "),
    };
  }

  return null;
}

function cleanBoundaryDuplicates(
  sourceItems: CutPlanItem[],
  transcription: Transcription
) {
  let items =
    sourceItems.map(
      (item) => ({
        ...item,
      })
    );

  let duplicateFixes =
    0;

  /*
    Recalculamos vecinos después de cada ajuste.
    El límite evita cualquier loop accidental.
  */
  for (
    let pass = 0;
    pass < 20;
    pass += 1
  ) {
    const visible =
      items
        .filter(
          (item) =>
            item.decision !==
              "REMOVE"
        )
        .sort(
          (a, b) =>
            a.start -
              b.start ||
            a.end -
              b.end
        );

    let changed =
      false;

    for (
      let index = 0;
      index <
        visible.length -
          1;
      index += 1
    ) {
      const left =
        visible[index];

      const right =
        visible[
          index + 1
        ];

      const overlap =
        findBoundaryTokenOverlap(
          left.text,
          right.text
        );

      if (!overlap) {
        continue;
      }

      /*
        Caso A:
        "el" + "el iPhone..."
        "pero" + "pero probablemente..."

        Si TODO el fragmento izquierdo es solo el
        prefijo repetido y tiene máximo 2 palabras,
        el fragmento izquierdo es un huérfano.
      */
      if (
        overlap.left.length <=
          CONTINUITY_MAX_DUPLICATE_TOKENS &&
        overlap.length ===
          overlap.left.length
      ) {
        const target =
          items.find(
            (item) =>
              item.id ===
              left.id
          );

        if (!target) {
          continue;
        }

        target.decision =
          "REMOVE";

        target.confidence =
          Math.max(
            target.confidence,
            0.98
          );

        target.reason =
          `${CONTINUITY_REASON_PREFIX} fragmento huérfano duplicado al inicio del siguiente KEEP.`;

        duplicateFixes += 1;
        changed =
          true;

        break;
      }

      /*
        Caso B:
        "...iPhone 11 y" + "y eso..."
        "cuando dejamos" + "dejamos de recomendarlo"

        Conservamos el final correcto del fragmento
        izquierdo y recortamos SOLO el prefijo
        repetido del fragmento derecho.
      */
      if (
        overlap.length <=
          CONTINUITY_MAX_DUPLICATE_TOKENS &&
        overlap.right.length >
          overlap.length
      ) {
        const trim =
          trimDuplicatePrefixFromRightItem(
            right,
            overlap.length,
            transcription
          );

        if (!trim) {
          continue;
        }

        const target =
          items.find(
            (item) =>
              item.id ===
              right.id
          );

        if (!target) {
          continue;
        }

        const oldStart =
          target.start;

        target.start =
          trim.newStart;

        target.text =
          trim.newText;

        items.push({
          id:
            `continuity-trim-${target.id}-${pass}`,

          start:
            oldStart,

          end:
            trim.newStart,

          text:
            "Prefijo duplicado",

          decision:
            "REMOVE",

          confidence:
            0.98,

          reason:
            `${CONTINUITY_REASON_PREFIX} prefijo repetido eliminado entre dos KEEP consecutivos.`,
        });

        duplicateFixes += 1;
        changed =
          true;

        break;
      }
    }

    if (!changed) {
      break;
    }
  }

  items =
    items.filter(
      (item) =>
        item.end -
          item.start >
        0.015
    );

  items.sort(
    (a, b) =>
      a.start -
        b.start ||
      a.end -
        b.end
  );

  return {
    items,
    duplicateFixes,
  };
}

function applyContinuityPass(
  sourceItems: CutPlanItem[],
  _transcription: Transcription,
  _takeStates: TakeState[]
): ContinuityPassResult {
  /*
    SAFE BOUNDARY ARCHITECTURE V2

    El route ya NO toca fronteras de KEEP con timestamps
    globales de Whisper. Eso incluye dos comportamientos
    antiguos que resultaron destructivos en los benchmarks:

    - rescatar palabras desde el transcript global;
    - recortar prefijos duplicados como "tiene / tiene".

    El route ahora entrega un BASELINE semántico. Audio
    Activity sigue proponiendo silencios, pero cualquier
    reconciliación de frase / duplicado / palabra recortada
    se resuelve después con retranscripción LOCAL fiable en
    Safe Boundary Resolver.
  */
  return {
    items: sourceItems.map((item) => ({ ...item })),
    rescuedWords: 0,
    duplicateFixes: 0,
  };
}

function buildFinalCutPlan(
  transcription: Transcription,
  takes: Take[],
  takeSelection: TakeSelection,
  pauseCuts: PauseCut[]
): CutPlan {
  const decisionByTake =
    new Map<
      string,
      TakeDecision
    >();

  for (
    const decision of
      takeSelection.decisions
  ) {
    decisionByTake.set(
      decision.takeId,
      decision
    );
  }

  /*
    ========================================
    V4.1 — NON-OVERLAPPING FINAL TIMELINE
    ========================================

    V4 could return:

    KEEP   10.0–20.0
    REMOVE 14.0–18.0

    The renderer then received KEEP 10–20
    and the silence survived.

    V4.1 physically splits KEEP/REVIEW:

    KEEP   10.0–14.0
    REMOVE 14.0–18.0
    KEEP   18.0–20.0

    AI-removed takes remain one REMOVE block.
    Audio cuts inside an already removed take
    are ignored to avoid double counting.
  */

  const takeStates:
    TakeState[] =
    takes.map(
      (take) => {
        const modelDecision =
          decisionByTake.get(
            take.id
          );

        const decision:
          CutDecision =
          modelDecision?.decision ??
          "REVIEW";

        return {
          take,

          decision,

          confidence:
            typeof modelDecision?.confidence ===
              "number"
              ? modelDecision.confidence
              : 0.5,

          reason:
            modelDecision?.reason ??
            "El Take Selector no devolvió una decisión para este bloque.",
        };
      }
    );

  const aiRemovedRanges =
    takeStates
      .filter(
        (state) =>
          state.decision ===
          "REMOVE"
      )
      .map(
        (state) => ({
          start:
            state.take.start,

          end:
            state.take.end,
        })
      );

  /*
    Remove portions of Audio Activity cuts that
    are already inside an AI REMOVE take.

    This gives us the REAL audio cuts that still
    matter for the final timeline.
  */
  const applicablePauseParts =
    pauseCuts.flatMap(
      (pause) =>
        subtractRanges(
          {
            start:
              pause.start,

            end:
              pause.end,
          },
          aiRemovedRanges
        ).map(
          (
            part,
            partIndex
          ) => ({
            id:
              `${pause.id}-part-${partIndex}`,

            start:
              roundTime(
                part.start
              ),

            end:
              roundTime(
                part.end
              ),

            rawGapDuration:
              roundTime(
                part.end -
                part.start
              ),
          })
        )
    );

  let items:
    CutPlanItem[] = [];

  let audioCutIndex =
    0;

  /*
    First build every TAKE.

    KEEP/REVIEW takes are physically split
    by the real audio-silence ranges.
  */
  for (
    const state of
      takeStates
  ) {
    const {
      take,
      decision,
      confidence,
      reason,
    } =
      state;

    if (
      decision ===
      "REMOVE"
    ) {
      items.push({
        id:
          take.id,

        start:
          take.start,

        end:
          take.end,

        text:
          take.text,

        decision,

        confidence,

        reason,
      });

      continue;
    }

    const relevantPauses =
      applicablePauseParts
        .filter(
          (pause) =>
            pause.end >
              take.start &&
            pause.start <
              take.end
        )
        .sort(
          (a, b) =>
            a.start -
            b.start
        );

    if (
      relevantPauses.length ===
      0
    ) {
      items.push({
        id:
          take.id,

        start:
          take.start,

        end:
          take.end,

        text:
          take.text,

        decision,

        confidence,

        reason,
      });

      continue;
    }

    let cursor =
      take.start;

    let spokenPartIndex =
      0;

    for (
      const pause of
        relevantPauses
    ) {
      const cutStart =
        Math.max(
          take.start,
          pause.start
        );

      const cutEnd =
        Math.min(
          take.end,
          pause.end
        );

      if (
        cutStart -
          cursor >
        0.015
      ) {
        const fragmentText =
          textForRange(
            transcription,
            cursor,
            cutStart
          );

        items.push({
          id:
            `${take.id}-spoken-${spokenPartIndex}`,

          start:
            roundTime(
              cursor
            ),

          end:
            roundTime(
              cutStart
            ),

          text:
            fragmentText ||
            take.text,

          decision,

          confidence,

          reason,
        });

        spokenPartIndex += 1;
      }

      if (
        cutEnd -
          cutStart >
        0.015
      ) {
        items.push({
          id:
            `audio-cut-${audioCutIndex}`,

          start:
            roundTime(
              cutStart
            ),

          end:
            roundTime(
              cutEnd
            ),

          text:
            `Silencio de audio (${(
              cutEnd -
              cutStart
            ).toFixed(2)} s)`,

          decision:
            "REMOVE",

          confidence:
            1,

          reason:
            "Silencio detectado directamente en el audio por Audio Activity Cutter.",
        });

        audioCutIndex += 1;
      }

      cursor =
        Math.max(
          cursor,
          cutEnd
        );
    }

    if (
      take.end -
        cursor >
      0.015
    ) {
      const fragmentText =
        textForRange(
          transcription,
          cursor,
          take.end
        );

      items.push({
        id:
          `${take.id}-spoken-${spokenPartIndex}`,

        start:
          roundTime(
            cursor
          ),

        end:
          take.end,

        text:
          fragmentText ||
          take.text,

        decision,

        confidence,

        reason,
      });
    }
  }

  /*
    Audio cuts that live OUTSIDE all take ranges
    (for example pre-roll, post-roll or gaps
    between takes) still need to appear as REMOVE.

    We subtract all take ranges so these standalone
    blocks cannot overlap the items created above.
  */
  const allTakeRanges =
    takes.map(
      (take) => ({
        start:
          take.start,

        end:
          take.end,
      })
    );

  for (
    const pause of
      applicablePauseParts
  ) {
    const outsideTakeParts =
      subtractRanges(
        {
          start:
            pause.start,

          end:
            pause.end,
        },
        allTakeRanges
      );

    for (
      const part of
        outsideTakeParts
    ) {
      items.push({
        id:
          `audio-cut-${audioCutIndex}`,

        start:
          roundTime(
            part.start
          ),

        end:
          roundTime(
            part.end
          ),

        text:
          `Silencio de audio (${(
            part.end -
            part.start
          ).toFixed(2)} s)`,

        decision:
          "REMOVE",

        confidence:
          1,

        reason:
          "Silencio detectado directamente en el audio por Audio Activity Cutter.",
      });

      audioCutIndex += 1;
    }
  }

  items.sort(
    (a, b) => {
      if (
        a.start !==
        b.start
      ) {
        return (
          a.start -
          b.start
        );
      }

      return (
        a.end -
        b.end
      );
    }
  );

  /*
    ========================================
    SEMANTIC KEEP AUTHORITY
    ========================================

    The legacy Continuity Pass is intentionally NOT applied here.

    It relies on global Whisper word timestamps and can rewrite KEEP ids/ranges
    before Boundary Second Pass has produced reliable local evidence. That makes
    the Safe Boundary Resolver lose the exact semantic KEEP pair it needs to
    reconcile duplicated or clipped boundary words.

    From this point onward the server returns the semantic baseline unchanged.
    Boundary reconciliation belongs exclusively to the Safe Boundary Resolver.
  */
  // Keep the legacy implementation referenced for now so this change stays
  // surgical; it is no longer executed in the production pipeline.
  void applyContinuityPass;

  /*
    Because the final items are now non-overlapping,
    estimatedDuration is the actual amount of timeline
    the renderer will preserve when all REVIEW items are
    eventually resolved as KEEP.
  */
  const estimatedDuration =
    items.reduce(
      (
        total,
        item
      ) =>
        item.decision ===
        "REMOVE"
          ? total
          : total +
            Math.max(
              0,
              item.end -
                item.start
            ),
      0
    );

  const aiRemovedTakes =
    takeStates.filter(
      (state) =>
        state.decision ===
        "REMOVE"
    );

  const aiRemovedSeconds =
    aiRemovedTakes.reduce(
      (
        total,
        state
      ) =>
        total +
        Math.max(
          0,
          state.take.end -
            state.take.start
        ),
      0
    );

  /*
    IMPORTANT:
    Report only APPLIED audio seconds.

    V4 reported raw detector seconds even when
    those seconds overlapped material the AI had
    already removed. That made the summary numbers
    impossible to reconcile.
  */
  const appliedAudioItems =
    items.filter(
      (item) =>
        item.decision ===
          "REMOVE" &&
        item.reason ===
          AUDIO_ACTIVITY_REASON
    );

  const appliedAudioSeconds =
    appliedAudioItems.reduce(
      (
        total,
        item
      ) =>
        total +
        Math.max(
          0,
          item.end -
            item.start
        ),
      0
    );

  const reviewCount =
    items.filter(
      (item) =>
        item.decision ===
        "REVIEW"
    ).length;

  const originalDuration =
    typeof transcription.duration ===
      "number" &&
    Number.isFinite(
      transcription.duration
    )
      ? transcription.duration
      : Math.max(
          0,
          ...takes.map(
            (take) =>
              take.end
          )
        );

  const totalEstimatedReduction =
    Math.max(
      0,
      originalDuration -
        estimatedDuration
    );

  const summary =
    `${takeSelection.summary} ` +
    `Take Detector: ${takes.length} toma(s). ` +
    `AI removió ${aiRemovedTakes.length} toma(s), ~${aiRemovedSeconds.toFixed(1)} s. ` +
    `Audio Activity Cutter propuso ${appliedAudioItems.length} corte(s), ~${appliedAudioSeconds.toFixed(1)} s. ` +
    `Semantic KEEP baseline listo; las fronteras se reconciliarán con evidencia local antes del render. ` +
    `Reducción estimada total: ~${totalEstimatedReduction.toFixed(1)} s. ` +
    `${reviewCount} review.`;

  return {
    summary,

    originalDuration:
      roundTime(
        originalDuration
      ),

    estimatedDuration:
      roundTime(
        estimatedDuration
      ),

    items,
  };
}

export async function POST(
  request: Request
) {
  try {
    const authenticated =
      await isAuthenticated();

    if (!authenticated) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const apiKey =
      process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY no está configurada.",
        },
        {
          status: 500,
        }
      );
    }

    const body =
      await request.json();

    const transcription =
      body?.transcription as
        | Transcription
        | undefined;

    const audioActivity =
      body?.audioActivity as
        | AudioActivityAnalysis
        | undefined;

    const retakeSecondPass =
      body?.retakeSecondPass as
        | RetakeSecondPassResult
        | undefined;

    if (
      !transcription ||
      typeof transcription.text !==
        "string" ||
      !transcription.text.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "No se recibió una transcripción válida.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !Array.isArray(
        transcription.words
      ) ||
      transcription.words.length ===
        0
    ) {
      return NextResponse.json(
        {
          error:
            "La transcripción no contiene timestamps por palabra.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !audioActivity ||
      !Array.isArray(
        audioActivity.silenceSegments
      )
    ) {
      return NextResponse.json(
        {
          error:
            "No se recibió el análisis real de actividad de audio.",
        },
        {
          status: 400,
        }
      );
    }

    /*
      V4.4 separa responsabilidades de forma estricta.

      HARD SILENCE CUTS
      >=450 ms
      → salen DIRECTAMENTE del audio real.
      → Whisper NO puede mover, reducir ni cancelar
        sus bordes.

      TAKE BOUNDARIES
      >=200 ms
      → solo ayudan a dividir speech units para
        detectar retakes.
      → no se eliminan automáticamente.

      Whisper queda únicamente para:
      - contenido semántico;
      - clasificación de takes;
      - detección de retakes.

      Esto corrige la regresión encontrada en el
      debug JSON: el word guard recuperaba ~51 s
      de silencio que Audio Activity ya había
      detectado correctamente.
    */
    const pauseCuts =
      normalizeAudioActivityCuts(
        audioActivity
      );

    const takeBoundaryCuts =
      normalizeAudioTakeBoundaries(
        audioActivity
      );

    /*
      V4.6:
      usamos el second pass SOLO cuando:
      - detectó una frase realmente repetida;
      - la retranscripción local pasó validación
        mínima de calidad.

      Además, el merge elimina duplicados exactos
      en los bordes del reemplazo local/global.
    */
    const repaired =
      repairTranscriptionWithSecondPass(
        transcription,
        retakeSecondPass
      );

    const selectorTranscription =
      repaired.transcription;

    const takes =
      buildTakes(
        selectorTranscription,
        takeBoundaryCuts
      );

    if (
      takes.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No se pudieron construir tomas a partir del video.",
        },
        {
          status: 400,
        }
      );
    }

    const retakeHints =
      buildRetakeHints(
        takes
      );

    const localRetakeEvidence =
      buildLocalRetakeEvidence(
        retakeSecondPass,
        takes
      );

    const model =
      process.env
        .OPENAI_CUTTING_MODEL ??
      process.env
        .OPENAI_EDITORIAL_MODEL ??
      "gpt-6-sol";

    const cuttingInstructions = `
You are the Take Selector for CutPilot.

You are NOT choosing arbitrary timestamp ranges.

You receive a chronological list of pre-detected spoken TAKES.
Each take has:
- takeId
- start
- end
- text
- duration
- gapBefore
- gapAfter

You may also receive RETAKE HINTS generated deterministically from nearby
speech units.

A retake hint means:
- the units share a repeated phrase, OR
- they have unusually high lexical similarity.

A hint is NOT an automatic REMOVE instruction.
Use it as evidence that the speaker may have repeated a take.

Your only job is to classify EVERY take as:
KEEP
REMOVE
REVIEW

CutPilot is cleaning a RAW talking-head recording.

The speaker commonly:
- reads from a script between takes
- repeats the same idea several times
- abandons sentences
- restarts after mistakes
- improves wording on later attempts
- says "otra vez", "no", "espera", etc.
- records several versions until one sounds right

The final result should sound like ONE intentional recording.

THIS IS NOT A SUMMARY.
THIS IS NOT A HIGHLIGHT EXTRACTOR.

Do not remove unique arguments merely to make the video shorter.

TAKE SELECTION RULES:

1. COMPARE NEARBY TAKES AGAINST EACH OTHER.

The main purpose of this system is detecting alternate attempts.

If Take 4, Take 5 and Take 6 communicate substantially the same idea,
they may be alternate takes even if the wording is different.

Do not judge each take in isolation.

2. KEEP ONE BEST VERSION OF THE SAME IDEA.

When multiple nearby takes are alternative versions of the same point,
prefer ONE.

Prefer the take that is:
- complete
- concise
- clear
- confident
- grammatically coherent
- closest to final intended wording
- usually later if the speaker is iterating toward a better version

Mark weaker alternatives REMOVE.

3. FALSE STARTS.

Incomplete or abandoned attempts should be REMOVE.

Example:

take-4:
"El iPhone 12 todavía puede..."

take-5:
"no, espera"

take-6:
"El iPhone 12 todavía puede tener sentido si lo encuentras muy barato"

Expected:
take-4 REMOVE
take-5 REMOVE
take-6 KEEP

4. SEMANTIC DUPLICATION MATTERS MORE THAN WORD-FOR-WORD DUPLICATION.

Example:

Take A:
"El iPhone 12 todavía sirve bien."

Take B:
"En 2026 el iPhone 12 aún puede tener sentido si está barato."

If they are clearly alternate attempts of the same local script point,
choose the stronger version.

5. USE THE SILENT GAPS AS CONTEXT.

A large gap before or after a take can indicate:
- reading the next line
- preparing another attempt
- restarting

But a gap by itself does NOT mean the spoken take should be removed.

6. PRESERVE LOGICAL DEPENDENCIES.

Do not remove:
- conditions
- contrasts
- consequences
- conclusions
- unique examples

just because another take sounds similar.

Example:

"puede ser buena compra"
and
"pero solo si cuesta menos de nueve mil"

are complementary, not duplicate takes.

7. REMOVE RECORDING CHATTER.

Examples:
- "otra vez"
- "no, espera"
- "vamos de nuevo"
- "a ver"
- "déjame repetirlo"

when they are clearly production chatter.

8. REVIEW SHOULD BE RARE.

Use REVIEW only when:
- two takes are both strong and meaningfully different
- removing one might alter the argument
- repetition might be intentional emphasis
- the relationship between takes is genuinely ambiguous

Do NOT use REVIEW merely because two takes are both grammatically valid.

9. BE DECISIVE ABOUT RETAKES.

This is a clean-edit tool.
If one take clearly replaces another, REMOVE the weaker version.

If two nearby units repeat the same 4+ word phrase — for example:
"si el problema es comprarlo"
followed shortly by another delivery of:
"si el problema es comprarlo"

treat that as a STRONG retake signal unless the surrounding context clearly
shows deliberate rhetorical repetition.

When the first delivery is weaker / aborted / less fluent and the second is
the clean retry, REMOVE the first and KEEP the second.

10. LOCAL RETAKE SECOND PASS HAS PRIORITY FOR RETAKES.

You may receive LOCAL RETAKE EVIDENCE.

This comes from retranscribing only suspicious windows and is usually
more reliable than the global transcript for:
- repeated attempts
- false starts
- restart boundaries
- phrases that the global transcript collapsed into one long word

If local evidence explicitly shows repeated nearby phrases such as:

"Que un iPhone funcione..."
"Que un iPhone todavía..."
"Que un iPhone todavía funcione bien..."

treat them as separate attempts.

Prefer the complete final delivery and remove earlier incomplete attempts.

11. PHRASE INTEGRITY.

The surviving sequence must be made of complete spoken ideas.

Avoid keeping orphan fragments such as:
- "el"
- "y"
- "pero"
- "cuando dejamos"

when they only exist because another nearby take contains the complete phrase.

A short connector is valid ONLY when it is genuinely necessary to connect
the surviving sentence.

Before keeping a very short take, ask whether removing it makes the
neighboring complete phrase cleaner.

12. DO NOT MICRO-EDIT WITHIN A TAKE.

You are classifying whole takes only.
Do not invent timestamps inside a take.

13. CLASSIFY EVERY TAKE ID EXACTLY ONCE.

Do not omit take IDs.
Do not invent take IDs.

14. CONFIDENCE:

0.90-1.00
obvious false start, restart chatter, duplicate retake, clear winner.

0.75-0.89
strong evidence.

Below 0.75
usually REVIEW.

15. REASONS:

Short and concrete.

Good:
"Earlier attempt; take-7 delivers the same point more clearly."

Good:
"Production chatter before restart."

Good:
"Unique supporting argument; keep."

Bad:
"Improves engagement."

Before finalizing, ask:
- Did I keep multiple alternate takes of the same idea?
- Did I accidentally remove a unique argument?
- Did I preserve the intended narrative order?
- Does the surviving sequence sound like one clean recording?

Return one decision for every provided take.
`;

    const payload = {
      language:
        transcription.language,

      originalDuration:
        transcription.duration,

      audioActivity: {
        thresholdDb:
          audioActivity.thresholdDb,

        detectedSilences:
          pauseCuts.length,

        takeBoundaries:
          takeBoundaryCuts.length,

        removedSeconds:
          pauseCuts.reduce(
            (
              total,
              pause
            ) =>
              total +
              Math.max(
                0,
                pause.end -
                  pause.start
              ),
            0
          ),
      },

      retakeHints,

      retakeSecondPass: {
        repairedCandidateIds:
          repaired.repairedCandidateIds,

        evidence:
          localRetakeEvidence,
      },

      takes,
    };

    const response =
      await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${apiKey}`,

            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              model,

              reasoning: {
                effort:
                  "medium",
              },

              instructions:
                cuttingInstructions,

              input: [
                {
                  role:
                    "user",

                  content: [
                    {
                      type:
                        "input_text",

                      text:
                        JSON.stringify(
                          payload
                        ),
                    },
                  ],
                },
              ],

              text: {
                format: {
                  type:
                    "json_schema",

                  name:
                    "cutpilot_take_selection",

                  strict:
                    true,

                  schema:
                    takeSelectionSchema,
                },
              },
            }),
        }
      );

    const data =
      (await response.json()) as
        OpenAIResponse;

    if (!response.ok) {
      console.error(
        "Take Selector error:",
        data
      );

      return NextResponse.json(
        {
          error:
            data.error?.message ??
            "No se pudo generar la selección de tomas.",
        },
        {
          status:
            response.status,
        }
      );
    }

    let outputText:
      | string
      | null = null;

    for (
      const output of
      data.output ?? []
    ) {
      if (
        output.type !==
        "message"
      ) {
        continue;
      }

      for (
        const content of
        output.content ?? []
      ) {
        if (
          content.type ===
            "output_text" &&
          typeof content.text ===
            "string"
        ) {
          outputText =
            content.text;

          break;
        }
      }

      if (outputText) {
        break;
      }
    }

    if (!outputText) {
      return NextResponse.json(
        {
          error:
            "El Take Selector no devolvió decisiones.",
        },
        {
          status: 500,
        }
      );
    }

    let takeSelection:
      TakeSelection;

    try {
      takeSelection =
        JSON.parse(
          outputText
        ) as TakeSelection;
    } catch {
      console.error(
        "Invalid Take Selection JSON:",
        outputText
      );

      return NextResponse.json(
        {
          error:
            "El Take Selector devolvió una respuesta inválida.",
        },
        {
          status: 500,
        }
      );
    }

    if (
      typeof takeSelection.summary !==
        "string" ||
      !Array.isArray(
        takeSelection.decisions
      )
    ) {
      return NextResponse.json(
        {
          error:
            "El Take Selector devolvió una estructura inválida.",
        },
        {
          status: 500,
        }
      );
    }

    /*
      Reject invented take IDs.
      Missing real IDs become REVIEW inside buildFinalCutPlan.
    */
    const validTakeIds =
      new Set(
        takes.map(
          (take) =>
            take.id
        )
      );

    const decisions =
      takeSelection.decisions
        .filter(
          (decision) =>
            validTakeIds.has(
              decision.takeId
            )
        )
        .filter(
          (
            decision,
            index,
            array
          ) =>
            array.findIndex(
              (candidate) =>
                candidate.takeId ===
                decision.takeId
            ) === index
        );

    const safeSelection:
      TakeSelection = {
        ...takeSelection,
        decisions,
    };

    const finalCutPlan =
      buildFinalCutPlan(
        selectorTranscription,
        takes,
        safeSelection,
        pauseCuts
      );

    return NextResponse.json(
      finalCutPlan
    );
  } catch (error) {
    console.error(
      "CutPilot Cutting Engine Safe Boundary Baseline error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Ocurrió un error al generar el Cut Plan.",
      },
      {
        status: 500,
      }
    );
  }
}
