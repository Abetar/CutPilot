"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "No se pudo iniciar sesión.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("No se pudo conectar con CutPilot.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.035] p-8 shadow-2xl backdrop-blur">
        <div className="mb-9">
          <div className="mb-4 inline-flex rounded-full border border-lime-300/20 bg-lime-300/10 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-lime-200">
            PERSONAL WORKSPACE
          </div>
          <h1 className="text-4xl font-black tracking-[-0.05em]">
            CUT<span className="text-lime-300">PILOT</span>
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Tu editor automático y publisher personal.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-slate-300">
            Contraseña
          </label>

          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="••••••••••••"
            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 text-white outline-none transition focus:border-lime-300/50"
          />

          {error && (
            <p className="rounded-xl border border-red-400/15 bg-red-400/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full rounded-2xl bg-lime-300 px-4 py-3.5 font-bold text-black transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Entrando..." : "Entrar a CutPilot"}
          </button>
        </form>
      </section>
    </main>
  );
}
