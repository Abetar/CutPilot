"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useBrollLibrary } from "@/components/BrollLibraryProvider";

type Notice = {
  id: number;
  message: string;
};

export default function CutPilotHome() {
  const router = useRouter();

  const {
    library,
    isConnecting,
    error: brollError,
    connectLibrary,
    disconnectLibrary,
  } = useBrollLibrary();

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

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
    });

    router.replace("/login");
    router.refresh();
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
              onClick={() => setNotice(null)}
              aria-label="Cerrar aviso"
              className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-lg text-slate-500 transition hover:bg-white/5 hover:text-white"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl">
        <header className="mb-14 flex items-center justify-between gap-4">
          <div>
            <div className="text-2xl font-black tracking-[-0.05em]">
              CUT
              <span className="text-lime-300">PILOT</span>
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
                    {library.catalog.totalAssets} assets · {library.rootHandle.name}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={disconnectLibrary}
                  className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-2 text-xs text-slate-400 transition hover:border-red-300/20 hover:text-red-200"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={connectLibrary}
                disabled={isConnecting}
                className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.05] px-4 py-2 text-sm font-medium text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-300/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isConnecting ? "Connecting..." : "Connect B-roll Library"}
              </button>
            )}

            <button
              type="button"
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

        <section className="mb-10 max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/5 px-3 py-1 text-xs font-medium text-cyan-100">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
            CUTPILOT ENGINES
          </div>

          <h1 className="max-w-3xl text-5xl font-black leading-[0.95] tracking-[-0.06em] md:text-7xl">
            Elige cómo quieres{" "}
            <span className="text-lime-300">editar.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-400 md:text-lg">
            Cada engine resuelve una parte distinta de tu flujo de contenido.
            Elige el que corresponda al material que quieres trabajar.
          </p>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <button
            type="button"
            onClick={() => router.push("/auto-edit")}
            className="group relative overflow-hidden rounded-[2rem] border border-lime-300/25 bg-lime-300 p-7 text-left text-black transition hover:-translate-y-0.5 hover:bg-lime-200 md:p-8 lg:col-span-2"
          >
            <div className="absolute right-7 top-7 rounded-full bg-black/10 px-3 py-1 text-[11px] font-black tracking-[0.14em]">
              READY
            </div>

            <div className="max-w-3xl">
              <p className="text-xs font-black tracking-[0.18em] text-black/50">
                MAIN WORKFLOW
              </p>

              <div className="mt-4 flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black/10 text-2xl">
                  ✦
                </span>

                <h2 className="text-3xl font-black tracking-[-0.04em] md:text-4xl">
                  AUTO EDIT ENGINE
                </h2>
              </div>

              <p className="mt-5 max-w-2xl text-base leading-7 text-black/65 md:text-lg">
                Convierte un video talking-head ya cortado en una edición lista:
                B-roll, subtítulos, zooms, impact words y render final.
              </p>

              <div className="mt-7 flex items-center gap-2 text-sm font-black">
                START EDIT
                <span className="text-xl transition group-hover:translate-x-1">
                  →
                </span>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => router.push("/cutting-engine")}
            className="group rounded-[2rem] border border-white/10 bg-white/[0.025] p-7 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/25 hover:bg-cyan-300/[0.035] md:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] text-xl text-cyan-100">
                ✂
              </span>

              <span className="rounded-full border border-amber-300/15 bg-amber-300/[0.06] px-3 py-1 text-[10px] font-bold tracking-[0.14em] text-amber-200">
                EXPERIMENTAL
              </span>
            </div>

            <h2 className="mt-7 text-2xl font-black tracking-[-0.04em]">
              CUTTING ENGINE
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-500">
              Analiza video crudo e intenta eliminar pausas, intentos repetidos y
              secciones innecesarias antes de la edición.
            </p>

            <div className="mt-7 flex items-center gap-2 text-sm font-bold text-cyan-100">
              OPEN ENGINE
              <span className="text-lg transition group-hover:translate-x-1">
                →
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              showNotice(
                "B-Roll Engine será el siguiente engine de CutPilot."
              )
            }
            className="group rounded-[2rem] border border-white/10 bg-white/[0.025] p-7 text-left transition hover:-translate-y-0.5 hover:border-violet-300/25 hover:bg-violet-300/[0.035] md:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-300/15 bg-violet-300/[0.06] text-xl text-violet-100">
                ◉
              </span>

              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold tracking-[0.14em] text-slate-400">
                COMING SOON
              </span>
            </div>

            <h2 className="mt-7 text-2xl font-black tracking-[-0.04em]">
              B-ROLL ENGINE
            </h2>

            <p className="mt-3 text-sm leading-6 text-slate-500">
              Convierte una pista de voz en un video completamente visual usando
              tu biblioteca de B-roll, subtítulos e impact words.
            </p>

            <div className="mt-7 flex items-center gap-2 text-sm font-bold text-violet-200">
              VOICE-OVER → FULL VIDEO
            </div>
          </button>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => router.push("/publish")}
            className="group rounded-2xl border border-white/[0.07] bg-white/[0.015] px-5 py-4 text-left transition hover:border-white/15 hover:bg-white/[0.03]"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-slate-600">
                  UTILITY
                </p>

                <p className="mt-1 font-semibold text-slate-300">
                  Publish Package
                </p>
              </div>

              <span className="text-slate-600 transition group-hover:translate-x-1 group-hover:text-slate-300">
                →
              </span>
            </div>
          </button>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.01] px-5 py-4">
            <p className="text-xs font-semibold tracking-[0.14em] text-slate-600">
              B-ROLL LIBRARY
            </p>

            <p className="mt-1 text-sm text-slate-500">
              {library
                ? `${library.catalog.totalAssets} assets disponibles para tus engines.`
                : "Conecta tu biblioteca local para Auto Edit y B-Roll Engine."}
            </p>
          </div>
        </section>
      </div>

      <style jsx global>{`
        @keyframes toastIn {
          from {
            opacity: 0;
            transform: translateY(-10px) scale(0.97);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </main>
  );
}
