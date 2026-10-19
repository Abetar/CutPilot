"use client";

export type AudioSilenceSegment = {
  start: number;
  end: number;
  duration: number;
};

export type AudioActivityAnalysis = {
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

/*
  ==========================================
  AUDIO ACTIVITY CUTTER V4
  ==========================================

  Calibrado inicialmente contra el ejemplo
  real del usuario:

  CutPilot: ~2:10
  CapCut humano: ~1:05

  En esa muestra, alrededor de -29.5 dBFS
  separó bastante bien "habla" de "tiempo
  muerto / lectura de guion".

  Este análisis usa AUDIO REAL, no timestamps
  de Whisper.
*/

const FRAME_SECONDS =
  0.02;

const SILENCE_THRESHOLD_DB =
  -29.5;

/*
  Calibrado contra el corte manual del usuario.

  En el render de CutPilot encontramos:
  - silencio medio ANTES del jump cut: ~259 ms
  - mediana: ~240 ms
  - 18/29 cortes con >=200 ms de dead air

  En el corte manual:
  - silencio medio ANTES del jump cut: ~61 ms
  - mediana: ~60 ms
  - 0/29 cortes con >=200 ms

  Por eso bajamos el mínimo detectable y usamos
  padding asimétrico.
*/
/*
  V4.3 separa dos conceptos:

  1) SILENCE CUT:
     silencio suficientemente largo como para
     eliminarlo realmente del video.

  2) TAKE BOUNDARY:
     pausa más corta que puede indicar que el
     usuario terminó un intento y empezó otro.

  Así recuperamos el comportamiento cercano al
  V4.1 para duración final, sin perder la mejora
  del Take Detector V4.2.
*/
const MIN_SILENCE_SECONDS =
  0.45;

const TAKE_BOUNDARY_MIN_SILENCE_SECONDS =
  0.2;

/*
  Después de terminar una frase, dejamos ~60 ms.
  Eso evita el frame de "mirada perdida" que se
  veía antes del salto, pero no corta en seco.
*/
const OUTGOING_PADDING_SECONDS =
  0.06;

/*
  Antes de que empiece la siguiente frase dejamos
  ~40 ms de audio visualmente quieto.

  La protección real del inicio de palabra se hace
  además en el Cut Plan usando word timestamps.
*/
const INCOMING_PADDING_SECONDS =
  0.04;

/*
  Si durante un silencio aparece un pico
  muy breve (respiración, click, ruido),
  no queremos que divida artificialmente
  un silencio largo en dos.

  80 ms es suficientemente corto para
  tratarlo como ruido transitorio.
*/
const MAX_ACTIVE_BLIP_SECONDS =
  0.08;

function roundTime(
  value: number
) {
  return Math.round(
    value * 1000
  ) / 1000;
}

function rmsToDb(
  rms: number
) {
  if (
    !Number.isFinite(rms) ||
    rms <= 0
  ) {
    return -120;
  }

  return Math.max(
    -120,
    20 *
      Math.log10(
        rms
      )
  );
}

function closeShortActiveBlips(
  silentFrames: boolean[],
  maxBlipFrames: number
) {
  const result =
    [...silentFrames];

  let index = 0;

  while (
    index <
    result.length
  ) {
    if (
      result[index]
    ) {
      index += 1;
      continue;
    }

    const start =
      index;

    while (
      index <
        result.length &&
      !result[index]
    ) {
      index += 1;
    }

    const end =
      index;

    const length =
      end -
      start;

    const hasSilenceBefore =
      start > 0 &&
      result[
        start - 1
      ];

    const hasSilenceAfter =
      end <
        result.length &&
      result[end];

    if (
      hasSilenceBefore &&
      hasSilenceAfter &&
      length <=
        maxBlipFrames
    ) {
      for (
        let frame =
          start;
        frame <
          end;
        frame += 1
      ) {
        result[frame] =
          true;
      }
    }
  }

  return result;
}

export async function analyzeAudioActivity(
  audioFile: File
): Promise<AudioActivityAnalysis> {
  if (
    typeof window ===
    "undefined"
  ) {
    throw new Error(
      "Audio Activity Cutter solo puede ejecutarse en el navegador."
    );
  }

  const AudioContextClass =
    window.AudioContext ??
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

  if (
    !AudioContextClass
  ) {
    throw new Error(
      "Este navegador no soporta Web Audio API."
    );
  }

  const context =
    new AudioContextClass();

  try {
    const arrayBuffer =
      await audioFile.arrayBuffer();

    /*
      slice(0) evita problemas de ownership
      con algunos navegadores al decodificar.
    */
    const audioBuffer =
      await context.decodeAudioData(
        arrayBuffer.slice(
          0
        )
      );

    const sampleRate =
      audioBuffer.sampleRate;

    const duration =
      audioBuffer.duration;

    const frameSize =
      Math.max(
        1,
        Math.round(
          sampleRate *
            FRAME_SECONDS
        )
      );

    const frameCount =
      Math.ceil(
        audioBuffer.length /
          frameSize
      );

    const channels =
      Array.from(
        {
          length:
            audioBuffer.numberOfChannels,
        },
        (
          _,
          channelIndex
        ) =>
          audioBuffer.getChannelData(
            channelIndex
          )
      );

    const silentFrames =
      new Array<boolean>(
        frameCount
      ).fill(
        false
      );

    /*
      Para cada frame calculamos RMS.

      Usamos el canal con MAYOR energía,
      no el promedio de canales.

      Eso reduce el riesgo de marcar como
      silencio una voz que exista más fuerte
      en uno de los canales.
    */
    for (
      let frameIndex =
        0;
      frameIndex <
        frameCount;
      frameIndex += 1
    ) {
      const startSample =
        frameIndex *
        frameSize;

      const endSample =
        Math.min(
          audioBuffer.length,
          startSample +
            frameSize
        );

      let maxChannelRms =
        0;

      for (
        const channel of
          channels
      ) {
        let sumSquares =
          0;

        for (
          let sampleIndex =
            startSample;
          sampleIndex <
            endSample;
          sampleIndex += 1
        ) {
          const sample =
            channel[
              sampleIndex
            ];

          sumSquares +=
            sample *
            sample;
        }

        const sampleCount =
          Math.max(
            1,
            endSample -
              startSample
          );

        const rms =
          Math.sqrt(
            sumSquares /
              sampleCount
          );

        maxChannelRms =
          Math.max(
            maxChannelRms,
            rms
          );
      }

      const db =
        rmsToDb(
          maxChannelRms
        );

      silentFrames[
        frameIndex
      ] =
        db <
        SILENCE_THRESHOLD_DB;
    }

    const maxBlipFrames =
      Math.max(
        1,
        Math.round(
          MAX_ACTIVE_BLIP_SECONDS /
            FRAME_SECONDS
        )
      );

    const cleanedSilentFrames =
      closeShortActiveBlips(
        silentFrames,
        maxBlipFrames
      );

    const silenceSegments:
      AudioSilenceSegment[] =
      [];

    const takeBoundarySegments:
      AudioSilenceSegment[] =
      [];

    let index =
      0;

    while (
      index <
      cleanedSilentFrames.length
    ) {
      if (
        !cleanedSilentFrames[
          index
        ]
      ) {
        index += 1;
        continue;
      }

      const startFrame =
        index;

      while (
        index <
          cleanedSilentFrames.length &&
        cleanedSilentFrames[
          index
        ]
      ) {
        index += 1;
      }

      const endFrame =
        index;

      const rawStart =
        startFrame *
        FRAME_SECONDS;

      const rawEnd =
        Math.min(
          duration,
          endFrame *
            FRAME_SECONDS
        );

      const rawDuration =
        rawEnd -
        rawStart;

      /*
        Capa 1:
        cualquier pausa >=200 ms puede separar
        dos speech units para comparar retakes.

        Esto NO significa que se vaya a cortar.
      */
      if (
        rawDuration >=
        TAKE_BOUNDARY_MIN_SILENCE_SECONDS
      ) {
        takeBoundarySegments.push({
          start:
            roundTime(
              rawStart
            ),

          end:
            roundTime(
              rawEnd
            ),

          duration:
            roundTime(
              rawDuration
            ),
        });
      }

      /*
        Capa 2:
        solo pausas >=450 ms pasan al Cut Plan
        como REMOVE automático.

        Este threshold es el que nos dejó cerca
        del benchmark humano de ~1:05.
      */
      if (
        rawDuration <
        MIN_SILENCE_SECONDS
      ) {
        continue;
      }

      const isLeading =
        rawStart <=
        FRAME_SECONDS;

      const isTrailing =
        rawEnd >=
        duration -
          FRAME_SECONDS;

      let cutStart =
        rawStart;

      let cutEnd =
        rawEnd;

      /*
        Padding asimétrico:

        ~60 ms después de terminar una frase.
        ~40 ms antes de iniciar la siguiente.

        Esto conserva respiración visual mínima
        pero evita el frame largo de mirada perdida.
      */
      if (
        !isLeading
      ) {
        cutStart +=
          OUTGOING_PADDING_SECONDS;
      }

      if (
        !isTrailing
      ) {
        cutEnd -=
          INCOMING_PADDING_SECONDS;
      }

      cutStart =
        Math.max(
          0,
          cutStart
        );

      cutEnd =
        Math.min(
          duration,
          Math.max(
            cutStart,
            cutEnd
          )
        );

      if (
        cutEnd -
          cutStart <
        0.12
      ) {
        continue;
      }

      silenceSegments.push({
        start:
          roundTime(
            cutStart
          ),

        end:
          roundTime(
            cutEnd
          ),

        duration:
          roundTime(
            cutEnd -
              cutStart
          ),
      });
    }

    const removedSeconds =
      silenceSegments.reduce(
        (
          total,
          segment
        ) =>
          total +
          segment.duration,
        0
      );

    return {
      duration:
        roundTime(
          duration
        ),

      thresholdDb:
        SILENCE_THRESHOLD_DB,

      minSilenceSeconds:
        MIN_SILENCE_SECONDS,

      outgoingPaddingSeconds:
        OUTGOING_PADDING_SECONDS,

      incomingPaddingSeconds:
        INCOMING_PADDING_SECONDS,

      frameSeconds:
        FRAME_SECONDS,

      silenceSegments,

      takeBoundarySegments,

      removedSeconds:
        roundTime(
          removedSeconds
        ),
    };
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `No se pudo analizar actividad de audio: ${error.message}`
        : "No se pudo analizar actividad de audio."
    );
  } finally {
    try {
      await context.close();
    } catch {
      // Best effort.
    }
  }
}
