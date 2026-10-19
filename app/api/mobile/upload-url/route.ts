
import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

import { isAuthenticated } from "@/lib/auth";
import { getR2Client, getR2Bucket } from "@/lib/r2";

export const runtime = "nodejs";

type UploadType = "video" | "metadata";

const UPLOAD_CONFIG = {
  video: {
    mimeType: "video/mp4",
    maxSize: 500 * 1024 * 1024,
    filename: "video.mp4",
  },
  metadata: {
    mimeType: "application/json",
    maxSize: 128 * 1024,
    filename: "metadata.json",
  },
} as const;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    // 1. Verify existing CutPilot session
    if (!(await isAuthenticated())) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 2. Only allow same-origin requests
    const origin = request.headers.get("origin");

    if (!origin || origin !== request.nextUrl.origin) {
      return NextResponse.json(
        { error: "Invalid request origin" },
        { status: 403 }
      );
    }

    // 3. Parse and validate request
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const data = body as Record<string, unknown>;

    const { type, contentType, fileSize, projectId } = data;

    if (type !== "video" && type !== "metadata") {
      return NextResponse.json(
        { error: "Invalid upload type" },
        { status: 400 }
      );
    }

    const uploadType: UploadType = type;
    const config = UPLOAD_CONFIG[uploadType];

    if (contentType !== config.mimeType) {
      return NextResponse.json(
        { error: "Unsupported file type" },
        { status: 400 }
      );
    }

    if (
      typeof fileSize !== "number" ||
      !Number.isSafeInteger(fileSize) ||
      fileSize <= 0 ||
      fileSize > config.maxSize
    ) {
      return NextResponse.json(
        { error: "Invalid file size" },
        { status: 400 }
      );
    }

    // 4. Create project on video request.
    // Metadata must reuse that project's ID.
    let resolvedProjectId: string;

    if (uploadType === "video") {
      if (projectId !== undefined) {
        return NextResponse.json(
          { error: "Video upload must start a new project" },
          { status: 400 }
        );
      }

      resolvedProjectId = randomUUID();
    } else {
      if (
        typeof projectId !== "string" ||
        !UUID_REGEX.test(projectId)
      ) {
        return NextResponse.json(
          { error: "Valid projectId is required for metadata" },
          { status: 400 }
        );
      }

      resolvedProjectId = projectId;
    }

    // 5. Both assets share the same project folder
    const key =
      `projects/${resolvedProjectId}/${config.filename}`;

    // 6. Generate a temporary signed PUT URL
    const command = new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      ContentType: config.mimeType,
    });

    const uploadUrl = await getSignedUrl(
      getR2Client(),
      command,
      { expiresIn: 300 }
    );

    return NextResponse.json({
      projectId: resolvedProjectId,
      uploadUrl,
      key,
      method: "PUT",
      contentType: config.mimeType,
      expiresIn: 300,
    });
  } catch (error) {
    console.error("R2 upload URL error:", error);

    return NextResponse.json(
      { error: "Could not generate upload URL" },
      { status: 500 }
    );
  }
}
