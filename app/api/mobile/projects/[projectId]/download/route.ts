
import { NextResponse } from "next/server";
import {
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { isMobileReadAuthorized } from "@/lib/mobileAuth";
import { getR2Client, getR2Bucket } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_VIDEO_SIZE = 500 * 1024 * 1024;
const MAX_METADATA_SIZE = 128 * 1024;

type RouteContext = {
  params: Promise<{
    projectId: string;
  }>;
};

export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    // 1. Allow authenticated Web or Android access
    if (!(await isMobileReadAuthorized(request))) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { projectId } = await context.params;

    // 2. Validate project ID
    if (!UUID_REGEX.test(projectId)) {
      return NextResponse.json(
        { error: "Invalid project ID" },
        { status: 400 }
      );
    }

    const client = getR2Client();
    const bucket = getR2Bucket();

    const videoKey = `projects/${projectId}/video.mp4`;
    const metadataKey = `projects/${projectId}/metadata.json`;

    // 3. Verify both files exist in R2
    const [video, metadata] = await Promise.all([
      client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: videoKey,
        })
      ),
      client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: metadataKey,
        })
      ),
    ]);

    // 4. Validate stored object sizes
    const videoSize = video.ContentLength;
    const metadataSize = metadata.ContentLength;

    if (
      typeof videoSize !== "number" ||
      videoSize <= 0 ||
      videoSize > MAX_VIDEO_SIZE ||
      typeof metadataSize !== "number" ||
      metadataSize <= 0 ||
      metadataSize > MAX_METADATA_SIZE
    ) {
      return NextResponse.json(
        { error: "Invalid project files" },
        { status: 422 }
      );
    }

    // 5. Generate temporary download URL
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: videoKey,
    });

    const downloadUrl = await getSignedUrl(
      client,
      command,
      { expiresIn: 300 }
    );

    return NextResponse.json(
      {
        projectId,
        downloadUrl,
        filename: "video.mp4",
        videoSize,
        expiresIn: 300,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Mobile download URL error:", error);

    return NextResponse.json(
      { error: "Could not generate download URL" },
      { status: 500 }
    );
  }
}
