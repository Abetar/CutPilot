import { NextResponse } from "next/server";
import { isValidPassword, setSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const password =
      typeof body?.password === "string" ? body.password : "";

    if (!password || !isValidPassword(password)) {
      return NextResponse.json(
        { error: "Contraseña incorrecta." },
        { status: 401 }
      );
    }

    await setSessionCookie();

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "No se pudo iniciar sesión." },
      { status: 500 }
    );
  }
}
