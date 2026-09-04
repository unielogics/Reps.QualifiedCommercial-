// Pasting a picture into a note or an internal message.
//
// Three steps, because the bytes never go through our API: ask for a presigned
// PUT, ship the file straight to S3, tell the server it landed. The id that
// comes back is what the note or message carries in `image_ids` when it posts,
// which is the moment the image stops being an orphan and becomes part of
// something.
//
// Uploading before the note is written is deliberate. Someone pastes a
// screenshot and keeps typing; by the time they hit Enter the picture is
// already up, so sending stays instant.

import { api } from "@/lib/api";

export type InlineImageSubject =
  | "deal_note"
  | "bucket_note"
  | "dealer_message"
  | "appointment_activity";

export type InlineImage = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  url: string | null;
};

type UploadTicket = {
  image_id: string;
  upload_url: string | null;
  filename: string;
  mime_type: string;
  size_bytes: number;
};

export const MAX_INLINE_IMAGE_BYTES = 10 * 1024 * 1024;

const ALLOWED = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/** The client-side half of the server's rule, so a doomed upload fails instantly. */
export function describeRejection(file: File): string | null {
  const type = (file.type || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED.has(type)) {
    return `${file.name || "That file"} is not an image we can show here. Use a PNG, JPEG, GIF, or WebP.`;
  }
  if (file.size > MAX_INLINE_IMAGE_BYTES) {
    return `${file.name || "That image"} is over ${MAX_INLINE_IMAGE_BYTES / (1024 * 1024)} MB.`;
  }
  return null;
}

export async function uploadInlineImage(
  file: File,
  subjectKind: InlineImageSubject,
  authToken: string | undefined,
): Promise<InlineImage> {
  const rejection = describeRejection(file);
  if (rejection) throw new Error(rejection);

  const ticket = await api<UploadTicket>("/inline-images/upload-init", {
    method: "POST",
    authToken,
    body: JSON.stringify({
      subject_kind: subjectKind,
      // A pasted screenshot arrives as "image.png" or with no name at all.
      filename: file.name || `pasted-${Date.now()}.png`,
      mime_type: (file.type || "image/png").split(";")[0].trim().toLowerCase(),
      size_bytes: file.size,
    }),
  });

  if (!ticket.upload_url) {
    // Object storage is not configured. Say so rather than leaving a chip that
    // will never resolve into a picture.
    throw new Error("Image storage is not configured, so that image was not saved.");
  }

  const put = await fetch(ticket.upload_url, {
    method: "PUT",
    body: file,
    // Must match what the URL was signed for, or S3 rejects the request.
    headers: {
      "Content-Type": ticket.mime_type,
      "x-amz-server-side-encryption": "AES256",
    },
  });
  if (!put.ok) throw new Error("That image could not be uploaded.");

  return api<InlineImage>(`/inline-images/${ticket.image_id}/complete`, {
    method: "POST",
    authToken,
  });
}
