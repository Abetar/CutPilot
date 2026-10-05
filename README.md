# CutPilot — Paso 1

Incluye únicamente:

- Next.js 16+
- App Router
- TypeScript
- Tailwind CSS
- Login personal mediante variables de entorno
- Home
- Selector / drag & drop de MP4
- Preview local con `URL.createObjectURL`
- Acciones visibles:
  - Auto Edit
  - Publish Existing Video

No incluye todavía IA, transcripción, FFmpeg, B-roll, captions, render, APIs sociales ni almacenamiento cloud.

## Ejecutar

1. Copia `.env.example` a `.env.local`
2. Define una contraseña y un secret largo
3. Instala dependencias
4. Ejecuta desarrollo

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

Generar un secret en Git Bash / terminal con Node:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Después abre:

http://localhost:3000
