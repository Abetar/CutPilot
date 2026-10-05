let ffmpegInstance: import("@ffmpeg/ffmpeg").FFmpeg | null = null;

let loadingPromise: Promise<
  import("@ffmpeg/ffmpeg").FFmpeg
> | null = null;

export async function getFFmpeg() {
  if (typeof window === "undefined") {
    throw new Error(
      "FFmpeg solo puede ejecutarse en el navegador."
    );
  }

  if (ffmpegInstance?.loaded) {
    return ffmpegInstance;
  }

  if (!loadingPromise) {
    loadingPromise = (async () => {
      /*
        Importamos FFmpeg dinámicamente.

        Esto evita que Next.js intente
        inicializar ffmpeg.wasm durante SSR.
      */
      const { FFmpeg } = await import(
        "@ffmpeg/ffmpeg"
      );

      const { toBlobURL } = await import(
        "@ffmpeg/util"
      );

      const ffmpeg = new FFmpeg();

      const baseURL =
        "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

      await ffmpeg.load({
        coreURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.js`,
          "text/javascript"
        ),

        wasmURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.wasm`,
          "application/wasm"
        ),
      });

      ffmpegInstance = ffmpeg;

      return ffmpeg;
    })();
  }

  try {
    return await loadingPromise;
  } catch (error) {
    /*
      Si la carga falla permitimos
      volver a intentarlo posteriormente.
    */
    loadingPromise = null;
    ffmpegInstance = null;

    throw error;
  }
}

export async function extractAudioFromVideo(
  videoFile: File
): Promise<File> {
  if (typeof window === "undefined") {
    throw new Error(
      "La extracción de audio debe ejecutarse en el navegador."
    );
  }

  const ffmpeg = await getFFmpeg();

  const uniqueId = crypto.randomUUID();

  const inputName =
    `cutpilot-input-${uniqueId}.mp4`;

  const outputName =
    `cutpilot-audio-${uniqueId}.wav`;

  try {
    /*
      También cargamos fetchFile dinámicamente
      para mantener toda la dependencia
      FFmpeg en el browser.
    */
    const { fetchFile } = await import(
      "@ffmpeg/util"
    );

    await ffmpeg.writeFile(
      inputName,
      await fetchFile(videoFile)
    );

    /*
      Extraemos únicamente la voz/audio:

      -vn       → ignora video
      -ac 1     → mono
      -ar 16000 → 16 kHz
      pcm_s16le → WAV PCM
    */
    const exitCode = await ffmpeg.exec([
      "-i",
      inputName,

      "-vn",

      "-ac",
      "1",

      "-ar",
      "16000",

      "-c:a",
      "pcm_s16le",

      outputName,
    ]);

    if (exitCode !== 0) {
      throw new Error(
        "FFmpeg no pudo extraer el audio del video."
      );
    }

    const audioData =
      await ffmpeg.readFile(outputName);

    if (typeof audioData === "string") {
      throw new Error(
        "FFmpeg devolvió un formato de audio inesperado."
      );
    }

    /*
      Copiamos los datos a un Uint8Array
      normal antes de crear el Blob.
    */
    const bytes = new Uint8Array(
      audioData.byteLength
    );

    bytes.set(audioData);

    const blob = new Blob(
      [bytes],
      {
        type: "audio/wav",
      }
    );

    return new File(
      [blob],
      "cutpilot-audio.wav",
      {
        type: "audio/wav",
      }
    );
  } finally {
    try {
      await ffmpeg.deleteFile(inputName);
    } catch {
      // Cleanup best effort.
    }

    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      // Cleanup best effort.
    }
  }
}