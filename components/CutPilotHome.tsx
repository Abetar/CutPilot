"use client";

import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { useVideoSession } from "@/components/VideoSessionProvider";
import { useBrollLibrary } from "@/components/BrollLibraryProvider";

type Notice = {
  id: number;
  message: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CutPilotHome() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const { video, setVideoFile } = useVideoSession();

  const {
    library,
    isConnecting,
    error: brollError,
    connectLibrary,
    disconnectLibrary,
  } = useBrollLibrary();

  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!notice) return;

    const timeout = window.setTimeout(() => {
      setNotice(null);
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [notice]);

  function showNotice(message: string) {
    setNotice({
      id: Date.now(),
      message,
    });
  }

  function selectFile(file?: File) {
    if (!file) return;

    if (
      file.type !== "video/mp4" &&
      !file.name.toLowerCase().endsWith(".mp4")
    ) {
      showNotice(
        "Por ahora CutPilot acepta únicamente archivos MP4."
      );
      return;
    }

    setVideoFile(file);
  }

  function handleInput(
    event: ChangeEvent<HTMLInputElement>
  ) {
    selectFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>
  ) {
    event.preventDefault();
    setDragging(false);

    selectFile(
      event.dataTransfer.files?.[0]
    );
  }

  async function logout() {
    await fetch(
      "/api/auth/logout",
      {
        method: "POST",
      }
    );

    router.replace("/login");
    router.refresh();
  }

  function unavailable(
    feature: string
  ) {
    showNotice(
      `${feature} queda visible en Paso 1, pero todavía no se ejecuta.`
    );
  }

  return (
    <main className="min-h-screen px-5 py-5 md:px-8 md:py-7">
      {notice && (
        <div
          key={notice.id}
          role="status"
          className="fixed right-4 top-4 z-50 w-[calc(100%-2rem)] max-w-sm animate-[toastIn_0.2s_ease-out] md:right-6 md:top-6"
        >
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-[#111722]/95 px-4 py-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-lime-300 shadow-[0_0_12px_rgba(190,242,100,0.7)]" />

            <p className="flex-1 text-sm leading-5 text-slate-200">
              {notice.message}
            </p>

            <button
              type="button"
              onClick={() =>
                setNotice(null)
              }
              aria-label="Cerrar aviso"
              className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-lg text-slate-500 transition hover:bg-white/5 hover:text-white"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl">
        <header className="mb-12 flex items-center justify-between gap-4">
          <div>
            <div className="text-2xl font-black tracking-[-0.05em]">
              CUT
              <span className="text-lime-300">
                PILOT
              </span>
            </div>

            <p className="mt-1 text-xs tracking-[0.16em] text-slate-500">
              EDIT LESS. PUBLISH FASTER.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {library ? (
              <div className="flex items-center gap-3">
                <div className="hidden rounded-xl border border-lime-300/15 bg-lime-300/[0.05] px-3 py-2 sm:block">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-lime-300" />

                    <span className="text-xs font-semibold text-lime-200">
                      B-ROLL CONNECTED
                    </span>
                  </div>

                  <p className="mt-1 text-[11px] text-slate-500">
                    {
                      library.catalog
                        .totalAssets
                    }{" "}
                    assets ·{" "}
                    {
                      library.rootHandle
                        .name
                    }
                  </p>
                </div>

                <button
                  onClick={
                    disconnectLibrary
                  }
                  className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs text-slate-400 transition hover:border-red-300/20 hover:text-red-200"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={
                  connectLibrary
                }
                disabled={
                  isConnecting
                }
                className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.05] px-4 py-2 text-sm font-medium text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-300/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isConnecting
                  ? "Connecting..."
                  : "Connect B-roll Library"}
              </button>
            )}

            <button
              onClick={logout}
              className="rounded-xl border border-white/10 bg-white/[0.025] px-4 py-2 text-sm text-slate-400 transition hover:border-white/20 hover:text-white"
            >
              Salir
            </button>
          </div>
        </header>

        {brollError && (
          <div className="mb-6 rounded-2xl border border-red-400/15 bg-red-400/[0.04] px-4 py-3 text-sm text-red-200">
            {brollError}
          </div>
        )}

        <section className="mb-8 max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/5 px-3 py-1 text-xs font-medium text-cyan-100">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
            PASO 1 · LOCAL VIDEO PREVIEW
          </div>

          <h1 className="max-w-2xl text-5xl font-black leading-[0.95] tracking-[-0.06em] md:text-7xl">
            Del video crudo al{" "}
            <span className="text-lime-300">
              Short listo.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-7 text-slate-400 md:text-lg">
            Selecciona un MP4. En este
            paso el archivo permanece en
            tu navegador: todavía no se
            sube a ninguna nube.
          </p>
        </section>

        {!video ? (
          <section
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() =>
              setDragging(false)
            }
            onDrop={handleDrop}
            onClick={() =>
              inputRef.current?.click()
            }
            className={`group cursor-pointer rounded-[2rem] border border-dashed p-5 transition md:p-8 ${
              dragging
                ? "border-lime-300/70 bg-lime-300/[0.06]"
                : "border-white/15 bg-white/[0.025] hover:border-white/30 hover:bg-white/[0.04]"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept="video/mp4,.mp4"
              onChange={
                handleInput
              }
              className="hidden"
            />

            <div className="flex min-h-[330px] flex-col items-center justify-center rounded-[1.5rem] border border-white/[0.05] bg-black/10 px-6 text-center">
              <div className="mb-7 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-3xl transition group-hover:scale-105">
                ↑
              </div>

              <h2 className="text-2xl font-bold tracking-[-0.03em]">
                Drop video
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Arrastra un MP4 aquí o
                haz clic para elegirlo.
              </p>

              <div className="mt-7 rounded-full border border-white/10 px-4 py-2 text-xs text-slate-400">
                MP4 · Optimizado
                inicialmente para 9:16
              </div>
            </div>
          </section>
        ) : (
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.025] p-4 md:p-5">
              <div className="relative overflow-hidden rounded-[1.4rem] bg-black">
                <video
                  src={video.url}
                  controls
                  playsInline
                  className="mx-auto max-h-[68vh] w-full object-contain"
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-200">
                    {
                      video.file
                        .name
                    }
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    {formatBytes(
                      video.file
                        .size
                    )}{" "}
                    · Preview local
                  </p>
                </div>

                <button
                  onClick={() =>
                    inputRef.current?.click()
                  }
                  className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:border-white/25 hover:text-white"
                >
                  Cambiar video
                </button>

                <input
                  ref={inputRef}
                  type="file"
                  accept="video/mp4,.mp4"
                  onChange={
                    handleInput
                  }
                  className="hidden"
                />
              </div>
            </div>

            <aside className="flex flex-col gap-4">
              <div className="rounded-[2rem] border border-white/10 bg-white/[0.025] p-6">
                <p className="mb-5 text-xs font-semibold tracking-[0.18em] text-slate-500">
                  WHAT DO YOU WANT TO
                  DO?
                </p>

                <button
                  onClick={() =>
                    router.push(
                      "/auto-edit"
                    )
                  }
                  className="group mb-3 w-full rounded-2xl border border-lime-300/25 bg-lime-300 px-5 py-5 text-left text-black transition hover:bg-lime-200"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-black">
                      AUTO EDIT
                    </span>

                    <span className="text-xl transition group-hover:translate-x-1">
                      →
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-black/65">
                    Generar una primera
                    edición automática.
                  </p>
                </button>

                <button
                  onClick={() =>
                    unavailable(
                      "Publish Existing Video"
                    )
                  }
                  className="group w-full rounded-2xl border border-white/10 bg-white/[0.035] px-5 py-5 text-left transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.04]"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-black">
                      PUBLISH EXISTING
                      VIDEO
                    </span>

                    <span className="text-xl text-cyan-200 transition group-hover:translate-x-1">
                      →
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-slate-500">
                    Usar este MP4
                    directamente en
                    Publisher.
                  </p>
                </button>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-white/[0.025] p-6">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-300">
                    Archivo
                  </span>

                  <span className="rounded-full bg-lime-300/10 px-2.5 py-1 text-xs font-medium text-lime-200">
                    LOCAL
                  </span>
                </div>

                <p className="mt-3 text-sm leading-6 text-slate-500">
                  Nada se persiste todavía.
                  Si recargas o cierras la
                  pestaña, CutPilot pierde
                  este video
                  intencionalmente.
                </p>
              </div>
            </aside>
          </section>
        )}
      </div>

      <style jsx global>{`
        @keyframes toastIn {
          from {
            opacity: 0;
            transform: translateY(-10px)
              scale(0.97);
          }

          to {
            opacity: 1;
            transform: translateY(0)
              scale(1);
          }
        }
      `}</style>
    </main>
  );
}