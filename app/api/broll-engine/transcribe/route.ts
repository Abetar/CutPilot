import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";

export const runtime = "nodejs";

type OpenAITranscriptionResponse = {
  text?: string;
  language?: string;
  duration?: number;

  segments?: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
  }>;

  words?: Array<{
    word: string;
    start: number;
    end: number;
  }>;

  error?: {
    message?: string;
  };
};

export async function POST(request: Request) {
  try {
    const authenticated = await isAuthenticated();

    if (!authenticated) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY no está configurada." },
        { status: 500 }
      );
    }

    const incomingFormData = await request.formData();
    const audio = incomingFormData.get("audio");

    if (!(audio instanceof File)) {
      return NextResponse.json(
        { error: "No se recibió ningún archivo de audio." },
        { status: 400 }
      );
    }

    if (audio.size <= 0) {
      return NextResponse.json(
        { error: "El archivo está vacío." },
        { status: 400 }
      );
    }

    const fileName = audio.name.toLowerCase();

    const validFile =
      audio.type === "audio/mpeg" ||
      audio.type === "audio/mp3" ||
      audio.type === "audio/wav" ||
      audio.type === "audio/x-wav" ||
      audio.type === "audio/mp4" ||
      audio.type === "audio/x-m4a" ||
      fileName.endsWith(".mp3") ||
      fileName.endsWith(".wav") ||
      fileName.endsWith(".m4a");

    if (!validFile) {
      return NextResponse.json(
        {
          error:
            "Formato no compatible. Usa MP3, WAV o M4A.",
        },
        { status: 400 }
      );
    }

    const openAIFormData = new FormData();

    openAIFormData.append("file", audio);
    openAIFormData.append("model", "whisper-1");
    openAIFormData.append("response_format", "verbose_json");

    openAIFormData.append(
      "timestamp_granularities[]",
      "segment"
    );

    openAIFormData.append(
      "timestamp_granularities[]",
      "word"
    );

    openAIFormData.append(
      "prompt",
      [
        "iPhone",
        "Apple",
        "Apple Watch",
        "MacBook",
        "Android",
        "USB-C",
        "iOS",
        "Pro",
        "Pro Max",
        "camera control",
        "tecnología",
        "smartphone",
      ].join(", ")
    );

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: openAIFormData,
      }
    );

    const data =
      (await response.json()) as OpenAITranscriptionResponse;

    if (!response.ok) {
      console.error(
        "B-Roll Engine transcription error:",
        data
      );

      return NextResponse.json(
        {
          error:
            data.error?.message ??
            "No se pudo transcribir el audio.",
        },
        {
          status: response.status,
        }
      );
    }

    const segments =
      data.segments?.map((segment) => ({
        id: segment.id,
        start: segment.start,
        end: segment.end,
        text: segment.text.trim(),
      })) ?? [];

    const words =
      data.words
        ?.filter(
          (word) =>
            typeof word.word === "string" &&
            word.word.trim().length > 0 &&
            Number.isFinite(word.start) &&
            Number.isFinite(word.end) &&
            word.end >= word.start
        )
        .map((word) => ({
          word: word.word.trim(),
          start: word.start,
          end: word.end,
        })) ?? [];

    return NextResponse.json({
      text: data.text ?? "",
      language: data.language ?? null,
      duration: data.duration ?? null,
      segments,
      words,
    });
  } catch (error) {
    console.error(
      "CutPilot B-Roll transcription error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Ocurrió un error al procesar la transcripción.",
      },
      {
        status: 500,
      }
    );
  }
}
