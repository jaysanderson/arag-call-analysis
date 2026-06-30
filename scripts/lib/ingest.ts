import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { api } from "./arag-admin.js";

export type CallMeta = {
  slug: string;
  title: string;
  icon: string; // mime, e.g. audio/mpeg, video/mp4, text/plain
  createdISO: string; // call datetime -> origin.created
  agentName: string;
  memberId: string;
  queue: string;
  durationSec: number;
  mediaType: "audio" | "video" | "transcript";
};

function originAndExtra(meta: CallMeta) {
  return {
    origin: {
      created: meta.createdISO,
      modified: meta.createdISO,
      path: `/${meta.queue}`,
      tags: [meta.mediaType, meta.queue],
      collaborators: [meta.agentName],
    },
    extra: {
      metadata: {
        agent_name: meta.agentName,
        member_id: meta.memberId,
        queue: meta.queue,
        duration_sec: meta.durationSec,
        media_type: meta.mediaType,
      },
    },
  };
}

/** Create a transcript-only resource (text field). Returns resource id. */
export async function createTextResource(meta: CallMeta, transcript: string): Promise<string> {
  const body = {
    title: meta.title,
    slug: meta.slug,
    icon: "text/plain",
    ...originAndExtra(meta),
    texts: {
      transcript: { body: transcript, format: "PLAIN" },
    },
  };
  const res = await api<{ uuid: string }>("/resources", { method: "POST", body });
  return res.uuid;
}

/** Create a resource shell (metadata only). Returns resource id. */
export async function createResourceShell(meta: CallMeta): Promise<string> {
  const body = {
    title: meta.title,
    slug: meta.slug,
    icon: meta.icon,
    ...originAndExtra(meta),
  };
  const res = await api<{ uuid: string }>("/resources", { method: "POST", body });
  return res.uuid;
}

/**
 * Upload a media file to a file field on an existing resource.
 * Uses the simple per-field upload endpoint with raw bytes.
 */
export async function uploadFileField(
  rid: string,
  field: string,
  filePath: string,
  contentType: string,
): Promise<void> {
  const bytes = readFileSync(filePath);
  const filenameB64 = Buffer.from(basename(filePath)).toString("base64");
  await api(`/resource/${rid}/file/${field}/upload`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "X-FILENAME": filenameB64,
      "X-LANGUAGE": "en",
    },
    raw: bytes,
  });
}

/** High-level: create a media resource (audio/video) and attach its file. */
export async function createMediaResource(
  meta: CallMeta,
  filePath: string,
): Promise<string> {
  const rid = await createResourceShell(meta);
  await uploadFileField(rid, "media", filePath, meta.icon);
  return rid;
}
