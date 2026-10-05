"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

import { extractAudioFromVideo } from "@/lib/extractAudio";

export type SelectedVideo = {
  file: File;
  url: string;
};

export type AutoEditStatus =
  | "IDLE"
  | "READY"
  | "ANALYZING"
  | "EDIT_PLAN_READY"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export type TranscriptSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

export type TranscriptWord = {
  word: string;
  start: number;
  end: number;
};

export type Transcription = {
  text: string;
  language: string | null;
  duration: number | null;
  segments: TranscriptSegment[];
  words: TranscriptWord[];
};

export type EditActionType =
  | "TALKING_HEAD"
  | "BROLL"
  | "KEY_STATEMENT"
  | "COMPARISON"
  | "PRICE"
  | "QUESTION"
  | "PRODUCT_NAME";

export type EffectPreset =
  | "NONE"
  | "SUBTLE_PUNCH_IN"
  | "KEY_STATEMENT"
  | "PRICE"
  | "COMPARISON"
  | "QUESTION"
  | "PRODUCT_NAME";

export type BrollRequest = {
  subject: string | null;
  intent: string | null;
  concepts: string[];
};

export type EditPlanItem = {
  id: string;

  start: number;
  end: number;

  transcript: string;

  action: EditActionType;

  effect: EffectPreset;

  textOverlay: string | null;

  broll: BrollRequest | null;

  reason: string;
};

export type EditPlan = {
  summary: string;
  items: EditPlanItem[];
};

/*
  ========================================
  B-ROLL REVIEW
  ========================================

  Estas decisiones pertenecen a cada item
  del Edit Plan.

  Ejemplo:

  {
    "3": {
      decision: "KEEP",
      selectedAssetId: "smartphone-camaras-closeup-01"
    }
  }
*/
export type BrollReviewDecision =
  | "PENDING"
  | "KEEP"
  | "REMOVE";

export type BrollReview = {
  decision: BrollReviewDecision;

  /*
    ID del asset actualmente seleccionado.

    - BEST original
    - o candidato elegido vía REPLACE

    Si decision === REMOVE,
    selectedAssetId será null.
  */
  selectedAssetId: string | null;
};

export type BrollReviews = Record<
  string,
  BrollReview
>;

type VideoSessionContextType = {
  video: SelectedVideo | null;

  /*
    MP4 final generado por Auto Edit.

    Se guarda como File para poder reutilizarlo
    después en Publish sin volver a renderizar
    ni pedirle al usuario que lo seleccione.
  */
  renderedVideo: File | null;

  autoEditStatus: AutoEditStatus;

  transcription: Transcription | null;

  editPlan: EditPlan | null;

  /*
    Review de B-roll indexado por
    EditPlanItem.id.
  */
  brollReviews: BrollReviews;

  autoEditError: string | null;

  setVideoFile: (file: File) => void;

  setRenderedVideo: (
    file: File | null
  ) => void;

  clearVideo: () => void;

  startAutoEdit: () => Promise<void>;

  setAutoEditStatus: (
    status: AutoEditStatus
  ) => void;

  setEditPlan: (
    plan: EditPlan | null
  ) => void;

  /*
    Guarda/reemplaza la decisión completa
    de un bloque B-roll.
  */
  setBrollReview: (
    itemId: string,
    review: BrollReview
  ) => void;

  /*
    Elimina la decisión de un único bloque.
  */
  clearBrollReview: (
    itemId: string
  ) => void;

  /*
    Limpia todas las decisiones.
  */
  resetBrollReviews: () => void;
};

const VideoSessionContext =
  createContext<VideoSessionContextType | null>(
    null
  );

export function VideoSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [video, setVideo] =
    useState<SelectedVideo | null>(null);

  const [
    renderedVideo,
    setRenderedVideo,
  ] =
    useState<File | null>(null);

  const [
    autoEditStatus,
    setAutoEditStatus,
  ] =
    useState<AutoEditStatus>("IDLE");

  const [
    transcription,
    setTranscription,
  ] =
    useState<Transcription | null>(null);

  const [
    editPlan,
    setEditPlanState,
  ] =
    useState<EditPlan | null>(null);

  const [
    brollReviews,
    setBrollReviews,
  ] =
    useState<BrollReviews>({});

  const [
    autoEditError,
    setAutoEditError,
  ] =
    useState<string | null>(null);

  /*
    Wrapper para mantener sincronizado
    Edit Plan + B-roll Review.

    Si reemplazamos o eliminamos el plan,
    las decisiones antiguas dejan de tener
    sentido.
  */
  function setEditPlan(
    plan: EditPlan | null
  ) {
    setEditPlanState(plan);

    setBrollReviews({});
  }

  function setBrollReview(
    itemId: string,
    review: BrollReview
  ) {
    setBrollReviews(
      (current) => ({
        ...current,

        [itemId]: review,
      })
    );
  }

  function clearBrollReview(
    itemId: string
  ) {
    setBrollReviews(
      (current) => {
        const next = {
          ...current,
        };

        delete next[itemId];

        return next;
      }
    );
  }

  function resetBrollReviews() {
    setBrollReviews({});
  }

  function setVideoFile(
    file: File
  ) {
    setVideo((current) => {
      if (current?.url) {
        URL.revokeObjectURL(
          current.url
        );
      }

      return {
        file,
        url: URL.createObjectURL(
          file
        ),
      };
    });

    setRenderedVideo(null);

    setTranscription(null);

    setEditPlanState(null);

    setBrollReviews({});

    setAutoEditError(null);

    setAutoEditStatus(
      "READY"
    );
  }

  function clearVideo() {
    setVideo((current) => {
      if (current?.url) {
        URL.revokeObjectURL(
          current.url
        );
      }

      return null;
    });

    setRenderedVideo(null);

    setTranscription(null);

    setEditPlanState(null);

    setBrollReviews({});

    setAutoEditError(null);

    setAutoEditStatus(
      "IDLE"
    );
  }

  async function startAutoEdit() {
    if (!video) {
      return;
    }

    setAutoEditStatus(
      "ANALYZING"
    );

    setAutoEditError(null);

    /*
      Un análisis nuevo invalida cualquier
      render anterior.
    */
    setRenderedVideo(null);

    setTranscription(null);

    setEditPlanState(null);

    /*
      Un nuevo análisis invalida cualquier
      decisión previa de B-roll.
    */
    setBrollReviews({});

    try {
      /*
        ======================================
        STEP 1
        EXTRAER AUDIO LOCALMENTE
        ======================================
      */

      const audioFile =
        await extractAudioFromVideo(
          video.file
        );

      console.log(
        "CutPilot audio extracted:",
        audioFile.name,
        `${(
          audioFile.size /
          (1024 * 1024)
        ).toFixed(2)} MB`
      );

      /*
        ======================================
        STEP 2
        TRANSCRIPCIÓN
        ======================================
      */

      const formData =
        new FormData();

      formData.append(
        "audio",
        audioFile
      );

      const transcriptionResponse =
        await fetch(
          "/api/auto-edit/transcribe",
          {
            method: "POST",

            body: formData,
          }
        );

      const transcriptionData =
        await transcriptionResponse.json();

      if (
        !transcriptionResponse.ok
      ) {
        throw new Error(
          transcriptionData.error ??
            "No se pudo transcribir el video."
        );
      }

      const transcriptionResult: Transcription =
        {
          text:
            typeof transcriptionData.text ===
            "string"
              ? transcriptionData.text
              : "",

          language:
            typeof transcriptionData.language ===
            "string"
              ? transcriptionData.language
              : null,

          duration:
            typeof transcriptionData.duration ===
            "number"
              ? transcriptionData.duration
              : null,

          segments: Array.isArray(
            transcriptionData.segments
          )
            ? transcriptionData.segments.map(
                (
                  segment: Partial<TranscriptSegment>
                ) => ({
                  id:
                    typeof segment.id ===
                    "number"
                      ? segment.id
                      : 0,

                  start:
                    typeof segment.start ===
                    "number"
                      ? segment.start
                      : 0,

                  end:
                    typeof segment.end ===
                    "number"
                      ? segment.end
                      : 0,

                  text:
                    typeof segment.text ===
                    "string"
                      ? segment.text
                      : "",
                })
              )
            : [],

          words: Array.isArray(
            transcriptionData.words
          )
            ? transcriptionData.words.map(
                (
                  word: Partial<TranscriptWord>
                ) => ({
                  word:
                    typeof word.word ===
                    "string"
                      ? word.word
                      : "",

                  start:
                    typeof word.start ===
                    "number"
                      ? word.start
                      : 0,

                  end:
                    typeof word.end ===
                    "number"
                      ? word.end
                      : 0,
                })
              )
            : [],
        };

      setTranscription(
        transcriptionResult
      );

      console.log(
        "CutPilot transcription ready:",
        transcriptionResult
      );

      /*
        ======================================
        STEP 3
        EDITORIAL ENGINE
        ======================================
      */

      const editorialResponse =
        await fetch(
          "/api/auto-edit/editorial-plan",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              transcription:
                transcriptionResult,
            }),
          }
        );

      const editorialData =
        await editorialResponse.json();

      if (
        !editorialResponse.ok
      ) {
        throw new Error(
          editorialData.error ??
            "No se pudo generar el Edit Plan."
        );
      }

      /*
        Validación mínima antes de aceptar
        el plan dentro de la sesión.
      */
      if (
        typeof editorialData.summary !==
          "string" ||
        !Array.isArray(
          editorialData.items
        )
      ) {
        throw new Error(
          "El Editorial Engine devolvió un Edit Plan inválido."
        );
      }

      const editorialPlan =
        editorialData as EditPlan;

      /*
        Guardamos directamente aquí porque
        el nuevo plan ya viene acompañado
        de un reset previo de reviews.
      */
      setEditPlanState(
        editorialPlan
      );

      /*
        El análisis terminó correctamente.
      */
      setAutoEditStatus(
        "EDIT_PLAN_READY"
      );

      console.log(
        "CutPilot Edit Plan ready:",
        editorialPlan
      );
    } catch (error) {
      console.error(
        "CutPilot Auto Edit error:",
        error
      );

      setAutoEditError(
        error instanceof Error
          ? error.message
          : "Ocurrió un error durante Auto Edit."
      );

      setAutoEditStatus(
        "FAILED"
      );
    }
  }

  useEffect(() => {
    return () => {
      if (video?.url) {
        URL.revokeObjectURL(
          video.url
        );
      }
    };
  }, [video]);

  return (
    <VideoSessionContext.Provider
      value={{
        video,

        renderedVideo,

        autoEditStatus,

        transcription,

        editPlan,

        brollReviews,

        autoEditError,

        setVideoFile,

        setRenderedVideo,

        clearVideo,

        startAutoEdit,

        setAutoEditStatus,

        setEditPlan,

        setBrollReview,

        clearBrollReview,

        resetBrollReviews,
      }}
    >
      {children}
    </VideoSessionContext.Provider>
  );
}

export function useVideoSession() {
  const context =
    useContext(
      VideoSessionContext
    );

  if (!context) {
    throw new Error(
      "useVideoSession must be used inside VideoSessionProvider"
    );
  }

  return context;
}