"use client";

import type {
  AudioActivityAnalysis,
  AudioSilenceSegment,
} from "@/lib/cutting/analyzeAudioActivity";

export type RetakeTranscriptWord = {
  word: string;
  start: number;
  end: number;
};

export type RetakeCandidateWindow = {
  id: string;
  start: number;
  end: number;
  duration: number;
  score: number;
  triggerWords: string[];
};

export type RetakeLocalTranscription = {
  id: string;
  start: number;
  end: number;
  duration: number;
  score: number;
  triggerWords: string[];
  text: string;
  language: string | null;
  words: RetakeTranscriptWord[];
};

export type RetakeSecondPassResult = {
  version: "retake-second-pass-v1";
  candidateCount: number;
  transcribedCount: number;
  candidates: RetakeCandidateWindow[];
  transcriptions: RetakeLocalTranscription[];
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
  words: TranscriptWord[];
};

const MIN_SUSPECT_WORD_DURATION = 1.4;
const MIN_SILENCE_OVERLAP = 0.45;
const MIN_OVERLAP_RATIO = 0.25;

const WINDOW_PREROLL_SECONDS = 1.5;
const WINDOW_POSTROLL_SECONDS = 5.0;

const MERGE_GAP_SECONDS = 0.8;
const MAX_WINDOW_SECONDS = 22;
const MAX_CANDIDATES = 6;

const OUTPUT_SAMPLE_RATE = 16000;

function roundTime(value: number) {
  return Math.round(value * 1000) / 1000;
}

function rangeOverlap(
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

function silenceOverlapForWord(
  word: TranscriptWord,
  silenceSegments: AudioSilenceSegment[]
) {
  return silenceSegments.reduce(
    (
      total,
      silence
    ) =>
      total +
      rangeOverlap(
        word.start,
        word.end,
        silence.start,
        silence.end
      ),
    0
  );
}

export function findRetakeCandidateWindows(
  transcription: Transcription,
  audioActivity: AudioActivityAnalysis
): RetakeCandidateWindow[] {
  const duration =
    typeof transcription.duration ===
      "number" &&
    Number.isFinite(
      transcription.duration
    )
      ? transcription.duration
      : audioActivity.duration;

  const rawCandidates =
    transcription.words
      .filter(
        (word) =>
          Number.isFinite(
            word.start
          ) &&
          Number.isFinite(
            word.end
          ) &&
          word.end >
            word.start
      )
      .map(
        (word) => {
          const wordDuration =
            word.end -
            word.start;

          const silenceOverlap =
            silenceOverlapForWord(
              word,
              audioActivity.silenceSegments
            );

          const overlapRatio =
            silenceOverlap /
            Math.max(
              0.001,
              wordDuration
            );

          const suspicious =
            wordDuration >=
              MIN_SUSPECT_WORD_DURATION ||
            (
              silenceOverlap >=
                MIN_SILENCE_OVERLAP &&
              overlapRatio >=
                MIN_OVERLAP_RATIO
            );

          if (!suspicious) {
            return null;
          }

          /*
            Una palabra "estirada" por Whisper es una
            señal fuerte de que dentro de ese rango
            puede existir:
            - una pausa real;
            - un reinicio;
            - una segunda toma que el transcript global
              absorbió dentro de una sola palabra.

            Expandimos hacia atrás y especialmente hacia
            adelante para capturar el posible retake.
          */
          const start =
            Math.max(
              0,
              word.start -
                WINDOW_PREROLL_SECONDS
            );

          const end =
            Math.min(
              duration,
              word.end +
                WINDOW_POSTROLL_SECONDS
            );

          const score =
            Math.min(
              6,
              wordDuration
            ) +
            silenceOverlap *
              1.5;

          return {
            start,
            end,
            score,
            triggerWords: [
              word.word,
            ],
          };
        }
      )
      .filter(
        (
          candidate
        ): candidate is {
          start: number;
          end: number;
          score: number;
          triggerWords: string[];
        } =>
          candidate !== null
      )
      .sort(
        (a, b) =>
          a.start -
          b.start
      );

  const merged: Array<{
    start: number;
    end: number;
    score: number;
    triggerWords: string[];
  }> = [];

  for (
    const candidate of
      rawCandidates
  ) {
    const previous =
      merged[
        merged.length - 1
      ];

    if (previous) {
      const unionEnd =
        Math.max(
          previous.end,
          candidate.end
        );

      const unionDuration =
        unionEnd -
        previous.start;

      if (
        candidate.start <=
          previous.end +
            MERGE_GAP_SECONDS &&
        unionDuration <=
          MAX_WINDOW_SECONDS
      ) {
        previous.end =
          unionEnd;

        previous.score +=
          candidate.score;

        previous.triggerWords.push(
          ...candidate.triggerWords
        );

        continue;
      }
    }

    merged.push({
      ...candidate,
    });
  }

  /*
    No queremos convertir esto en 40 transcripciones.

    Elegimos solo los grupos con mayor evidencia de
    timestamps globales defectuosos y después los
    devolvemos en orden cronológico.
  */
  return merged
    .sort(
      (a, b) =>
        b.score -
        a.score
    )
    .slice(
      0,
      MAX_CANDIDATES
    )
    .sort(
      (a, b) =>
        a.start -
        b.start
    )
    .map(
      (
        candidate,
        index
      ) => ({
        id:
          `retake-candidate-${index}`,

        start:
          roundTime(
            candidate.start
          ),

        end:
          roundTime(
            candidate.end
          ),

        duration:
          roundTime(
            candidate.end -
              candidate.start
          ),

        score:
          roundTime(
            candidate.score
          ),

        triggerWords:
          [
            ...new Set(
              candidate.triggerWords
            ),
          ],
      })
    );
}

function mixToMono(
  audioBuffer: AudioBuffer
) {
  const length =
    audioBuffer.length;

  const output =
    new Float32Array(
      length
    );

  const channels =
    audioBuffer.numberOfChannels;

  for (
    let channel = 0;
    channel <
      channels;
    channel += 1
  ) {
    const input =
      audioBuffer.getChannelData(
        channel
      );

    for (
      let index = 0;
      index <
        length;
      index += 1
    ) {
      output[index] +=
        input[index] /
        channels;
    }
  }

  return output;
}

function resampleMono(
  source: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number
) {
  if (
    sourceSampleRate ===
    targetSampleRate
  ) {
    return source;
  }

  const ratio =
    sourceSampleRate /
    targetSampleRate;

  const outputLength =
    Math.max(
      1,
      Math.floor(
        source.length /
          ratio
      )
    );

  const output =
    new Float32Array(
      outputLength
    );

  for (
    let index = 0;
    index <
      outputLength;
    index += 1
  ) {
    const sourcePosition =
      index *
      ratio;

    const left =
      Math.floor(
        sourcePosition
      );

    const right =
      Math.min(
        source.length - 1,
        left + 1
      );

    const fraction =
      sourcePosition -
      left;

    output[index] =
      source[left] *
        (
          1 -
          fraction
        ) +
      source[right] *
        fraction;
  }

  return output;
}

function writeAscii(
  view: DataView,
  offset: number,
  value: string
) {
  for (
    let index = 0;
    index <
      value.length;
    index += 1
  ) {
    view.setUint8(
      offset + index,
      value.charCodeAt(
        index
      )
    );
  }
}

function encodeMonoWav(
  samples: Float32Array,
  sampleRate: number
) {
  const bytesPerSample =
    2;

  const dataLength =
    samples.length *
    bytesPerSample;

  const buffer =
    new ArrayBuffer(
      44 +
        dataLength
    );

  const view =
    new DataView(
      buffer
    );

  writeAscii(
    view,
    0,
    "RIFF"
  );

  view.setUint32(
    4,
    36 +
      dataLength,
    true
  );

  writeAscii(
    view,
    8,
    "WAVE"
  );

  writeAscii(
    view,
    12,
    "fmt "
  );

  view.setUint32(
    16,
    16,
    true
  );

  view.setUint16(
    20,
    1,
    true
  );

  view.setUint16(
    22,
    1,
    true
  );

  view.setUint32(
    24,
    sampleRate,
    true
  );

  view.setUint32(
    28,
    sampleRate *
      bytesPerSample,
    true
  );

  view.setUint16(
    32,
    bytesPerSample,
    true
  );

  view.setUint16(
    34,
    16,
    true
  );

  writeAscii(
    view,
    36,
    "data"
  );

  view.setUint32(
    40,
    dataLength,
    true
  );

  let offset =
    44;

  for (
    let index = 0;
    index <
      samples.length;
    index += 1
  ) {
    const sample =
      Math.max(
        -1,
        Math.min(
          1,
          samples[index]
        )
      );

    view.setInt16(
      offset,
      sample < 0
        ? sample *
            0x8000
        : sample *
            0x7fff,
      true
    );

    offset +=
      bytesPerSample;
  }

  return buffer;
}

function clipToWav(
  mono: Float32Array,
  sampleRate: number,
  start: number,
  end: number
) {
  const sourceStart =
    Math.max(
      0,
      Math.floor(
        start *
          sampleRate
      )
    );

  const sourceEnd =
    Math.min(
      mono.length,
      Math.ceil(
        end *
          sampleRate
      )
    );

  const clip =
    mono.slice(
      sourceStart,
      sourceEnd
    );

  const resampled =
    resampleMono(
      clip,
      sampleRate,
      OUTPUT_SAMPLE_RATE
    );

  return encodeMonoWav(
    resampled,
    OUTPUT_SAMPLE_RATE
  );
}

async function transcribeWindow(
  wavBuffer: ArrayBuffer,
  candidate: RetakeCandidateWindow
): Promise<RetakeLocalTranscription> {
  const file =
    new File(
      [
        wavBuffer,
      ],
      `${candidate.id}.wav`,
      {
        type:
          "audio/wav",
      }
    );

  const formData =
    new FormData();

  formData.append(
    "audio",
    file
  );

  const response =
    await fetch(
      "/api/auto-edit/transcribe",
      {
        method:
          "POST",

        body:
          formData,
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data.error ??
        `No se pudo retranscribir ${candidate.id}.`
    );
  }

  const words:
    RetakeTranscriptWord[] =
    Array.isArray(
      data.words
    )
      ? data.words
          .map(
            (
              word: Partial<RetakeTranscriptWord>
            ) => ({
              word:
                typeof word.word ===
                  "string"
                  ? word.word
                  : "",

              start:
                roundTime(
                  candidate.start +
                    (
                      typeof word.start ===
                        "number"
                        ? word.start
                        : 0
                    )
                ),

              end:
                roundTime(
                  candidate.start +
                    (
                      typeof word.end ===
                        "number"
                        ? word.end
                        : 0
                    )
                ),
            })
          )
          .filter(
            (
              word: RetakeTranscriptWord
            ) =>
              Boolean(
                word.word.trim()
              )
          )
      : [];

  return {
    ...candidate,

    text:
      typeof data.text ===
        "string"
        ? data.text.trim()
        : "",

    language:
      typeof data.language ===
        "string"
        ? data.language
        : null,

    words,
  };
}

export async function runRetakeSecondPass(
  audioFile: File,
  transcription: Transcription,
  audioActivity: AudioActivityAnalysis,
  onProgress?: (
    completed: number,
    total: number
  ) => void
): Promise<RetakeSecondPassResult> {
  const candidates =
    findRetakeCandidateWindows(
      transcription,
      audioActivity
    );

  if (
    candidates.length ===
    0
  ) {
    return {
      version:
        "retake-second-pass-v1",

      candidateCount:
        0,

      transcribedCount:
        0,

      candidates: [],

      transcriptions: [],
    };
  }

  const AudioContextClass =
    window.AudioContext;

  const context =
    new AudioContextClass();

  try {
    const sourceBuffer =
      await audioFile.arrayBuffer();

    const decoded =
      await context.decodeAudioData(
        sourceBuffer.slice(
          0
        )
      );

    const mono =
      mixToMono(
        decoded
      );

    const transcriptions:
      RetakeLocalTranscription[] =
      [];

    for (
      let index = 0;
      index <
        candidates.length;
      index += 1
    ) {
      const candidate =
        candidates[index];

      const wavBuffer =
        clipToWav(
          mono,
          decoded.sampleRate,
          candidate.start,
          candidate.end
        );

      const local =
        await transcribeWindow(
          wavBuffer,
          candidate
        );

      transcriptions.push(
        local
      );

      onProgress?.(
        index + 1,
        candidates.length
      );
    }

    return {
      version:
        "retake-second-pass-v1",

      candidateCount:
        candidates.length,

      transcribedCount:
        transcriptions.length,

      candidates,

      transcriptions,
    };
  } finally {
    await context.close();
  }
}
