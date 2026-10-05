export type SubtitleWord = {
  word: string;
  start: number;
  end: number;
};

export type SubtitleCue = {
  id: string;
  start: number;
  end: number;
  text: string;
  words: SubtitleWord[];
};

type BuildSubtitlesOptions = {
  maxWords?: number;
  maxCharacters?: number;
  maxDuration?: number;
  pauseThreshold?: number;
};

const DEFAULT_OPTIONS: Required<BuildSubtitlesOptions> = {
  /*
    Queremos subtítulos cortos, tipo contenido vertical.

    Normalmente:
    2–5 palabras por bloque.
  */
  maxWords: 5,

  /*
    Evita líneas demasiado largas.
  */
  maxCharacters: 30,

  /*
    Un bloque no debería quedarse demasiado
    tiempo en pantalla.
  */
  maxDuration: 1.8,

  /*
    Si hay una pausa clara entre palabras,
    cerramos el bloque aunque todavía quepan
    más palabras.
  */
  pauseThreshold: 0.38,
};

function cleanWord(value: string) {
  return value.trim();
}

function normalizeWords(
  words: SubtitleWord[]
): SubtitleWord[] {
  return words
    .filter(
      (word) =>
        cleanWord(word.word).length > 0 &&
        Number.isFinite(word.start) &&
        Number.isFinite(word.end) &&
        word.start >= 0
    )
    .map((word, index, source) => {
      const start = Math.max(
        0,
        word.start
      );

      /*
        Whisper ocasionalmente devuelve palabras
        con start === end.

        En esos casos usamos el inicio de la
        siguiente palabra como referencia.

        Si es la última palabra, añadimos una
        duración mínima.
      */
      let end = word.end;

      if (end <= start) {
        const nextWord =
          source[index + 1];

        if (
          nextWord &&
          Number.isFinite(nextWord.start) &&
          nextWord.start > start
        ) {
          end =
            nextWord.start;
        } else {
          end =
            start + 0.12;
        }
      }

      return {
        word: cleanWord(
          word.word
        ),
        start,
        end,
      };
    })
    .sort(
      (a, b) =>
        a.start - b.start
    );
}

function buildText(
  words: SubtitleWord[]
) {
  return words
    .map((word) => word.word)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildSubtitles(
  inputWords: SubtitleWord[],
  options: BuildSubtitlesOptions = {}
): SubtitleCue[] {
  const config = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const words =
    normalizeWords(inputWords);

  if (words.length === 0) {
    return [];
  }

  const cues: SubtitleCue[] = [];

  let currentWords: SubtitleWord[] =
    [];

  function flushCue() {
    if (currentWords.length === 0) {
      return;
    }

    const firstWord =
      currentWords[0];

    const lastWord =
      currentWords[
        currentWords.length - 1
      ];

    cues.push({
      id:
        `subtitle-${cues.length + 1}`,

      start:
        firstWord.start,

      end:
        Math.max(
          lastWord.end,
          firstWord.start + 0.12
        ),

      text:
        buildText(currentWords),

      words:
        currentWords,
    });

    currentWords = [];
  }

  for (
    let index = 0;
    index < words.length;
    index += 1
  ) {
    const word =
      words[index];

    if (currentWords.length === 0) {
      currentWords.push(word);
      continue;
    }

    const previousWord =
      currentWords[
        currentWords.length - 1
      ];

    const prospectiveWords = [
      ...currentWords,
      word,
    ];

    const prospectiveText =
      buildText(
        prospectiveWords
      );

    const prospectiveDuration =
      word.end -
      currentWords[0].start;

    const pause =
      word.start -
      previousWord.end;

    const exceedsWordLimit =
      prospectiveWords.length >
      config.maxWords;

    const exceedsCharacterLimit =
      prospectiveText.length >
      config.maxCharacters;

    const exceedsDuration =
      prospectiveDuration >
      config.maxDuration;

    const hasNaturalPause =
      pause >=
      config.pauseThreshold;

    /*
      Si cualquiera de estas condiciones se cumple,
      cerramos el subtítulo actual y empezamos otro.

      Esto prioriza lectura rápida sobre llenar
      cada bloque al máximo.
    */
    if (
      exceedsWordLimit ||
      exceedsCharacterLimit ||
      exceedsDuration ||
      hasNaturalPause
    ) {
      flushCue();

      currentWords.push(word);

      continue;
    }

    currentWords.push(word);
  }

  flushCue();

  return cues;
}