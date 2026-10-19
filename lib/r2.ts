import { S3Client } from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 Client
 * CutPilot Mobile Companion
 *
 * Uso exclusivo del servidor.
 * Nunca importar desde componentes "use client".
 */

const requiredEnv = [
  "R2_BUCKET_NAME",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_ENDPOINT",
] as const;

export function getR2Client(): S3Client {
  // Validar variables de entorno
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      throw new Error(`Missing environment variable: ${key}`);
    }
  }

  return new S3Client({
    region: "auto",

    endpoint: process.env.R2_ENDPOINT!,

    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export function getR2Bucket(): string {
  const bucket = process.env.R2_BUCKET_NAME;

  if (!bucket) {
    throw new Error("Missing environment variable: R2_BUCKET_NAME");
  }

  return bucket;
}