
import { NextResponse } from "next/server";
import {
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

import { isMobileReadAuthorized } from "@/lib/mobileAuth";
import { getR2Client, getR2Bucket } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROJECT_KEY_REGEX =
  /^projects\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(video\.mp4|metadata\.json)$/i;

const MAX_VIDEO_SIZE = 500 * 1024 * 1024;
const MAX_METADATA_SIZE = 128 * 1024;

type ProjectFiles = {
  videoSize?: number;
  metadataSize?: number;
  lastModified?: Date;
};

type ProjectMetadata = {
  projectId: string;
  createdAt: string;
  youtubeTitle: string;
  youtubeDescription: string;
  youtubeTags: string[];
  tiktokCaption: string;
  tiktokHashtags: string[];
  thumbnailTitle: string;
};

function isProjectMetadata(
  value: unknown,
  projectId: string
): value is ProjectMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }

  const data = value as Record<string, unknown>;

  return (
    data.projectId === projectId &&
    typeof data.createdAt === "string" &&
    typeof data.youtubeTitle === "string" &&
    typeof data.youtubeDescription === "string" &&
    Array.isArray(data.youtubeTags) &&
    data.youtubeTags.every((tag) => typeof tag === "string") &&
    typeof data.tiktokCaption === "string" &&
    Array.isArray(data.tiktokHashtags) &&
    data.tiktokHashtags.every((tag) => typeof tag === "string") &&
    typeof data.thumbnailTitle === "string"
  );
}

export async function GET(request: Request) {
  try {
    // 1. Allow authenticated Web or Android access
    if (!(await isMobileReadAuthorized(request))) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const client = getR2Client();
    const bucket = getR2Bucket();

    const projectFiles = new Map<string, ProjectFiles>();

    // 2. List objects under projects/
    let continuationToken: string | undefined;

    do {
      const result = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: "projects/",
          ContinuationToken: continuationToken,
        })
      );

      for (const object of result.Contents ?? []) {
        if (!object.Key) continue;

        const match = PROJECT_KEY_REGEX.exec(object.Key);
        if (!match) continue;

        const [, projectId, filename] = match;
        const current = projectFiles.get(projectId) ?? {};

        if (filename === "video.mp4") {
          current.videoSize = object.Size;
        }

        if (filename === "metadata.json") {
          current.metadataSize = object.Size;
          current.lastModified = object.LastModified;
        }

        projectFiles.set(projectId, current);
      }

      if (result.IsTruncated && !result.NextContinuationToken) {
        throw new Error("Incomplete R2 object listing");
      }

      continuationToken = result.IsTruncated
        ? result.NextContinuationToken
        : undefined;
    } while (continuationToken);

    // 3. Only consider projects with both valid-sized files
    const completeCandidates = [...projectFiles.entries()]
      .filter(([, files]) => {
        return (
          typeof files.videoSize === "number" &&
          files.videoSize > 0 &&
          files.videoSize <= MAX_VIDEO_SIZE &&
          typeof files.metadataSize === "number" &&
          files.metadataSize > 0 &&
          files.metadataSize <= MAX_METADATA_SIZE
        );
      })
      .sort((a, b) => {
        return (
          (b[1].lastModified?.getTime() ?? 0) -
          (a[1].lastModified?.getTime() ?? 0)
        );
      })
      .slice(0, 50);

    // 4. Read metadata from complete project candidates
    const projects = [];

    for (const [projectId, files] of completeCandidates) {
      try {
        const response = await client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: `projects/${projectId}/metadata.json`,
          })
        );

        const json = await response.Body?.transformToString(
          "utf-8"
        );

        if (!json) continue;

        const metadata: unknown = JSON.parse(json);

        if (!isProjectMetadata(metadata, projectId)) {
          continue;
        }

        projects.push({
          ...metadata,
          videoSize: files.videoSize,
          status: "READY",
        });
      } catch (error) {
        console.error(
          `Failed to read project ${projectId}:`,
          error
        );
      }
    }

    // 5. Return the available projects
    return NextResponse.json(
      {
        projects,
        total: projects.length,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Mobile projects API error:", error);

    return NextResponse.json(
      { error: "Could not load mobile projects" },
      { status: 500 }
    );
  }
}
