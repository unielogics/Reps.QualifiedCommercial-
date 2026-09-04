"use client";

// The two halves of a pasted image, kept together because they must agree:
// the chips under the composer while it is being written, and the thumbnails
// on the message once it is posted.
//
// A thumbnail is a link rather than a lightbox. The signed URL opens full size
// in a new tab, which is what someone reading a bank statement screenshot
// actually wants, and it costs no modal state.

import { useCallback, useState } from "react";
import { X } from "lucide-react";
import { uploadInlineImage, type InlineImage, type InlineImageSubject } from "@/lib/inlineImages";

/** Attached images on a posted note or message. */
export function InlineImageStrip({ images }: { images: InlineImage[] }) {
  if (!images.length) return null;
  return (
    <div className="inlineImages">
      {images.map((image) => (
        <a
          key={image.id}
          className="inlineImage"
          href={image.url ?? undefined}
          target="_blank"
          rel="noreferrer"
          title={`Open ${image.filename}`}
        >
          {/* Signed S3 URLs, not a configured remote pattern — next/image
              would need the host allow-listed and would proxy every view. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url ?? ""} alt={image.filename} loading="lazy" />
        </a>
      ))}
    </div>
  );
}

/** Staged images under a composer, each removable before the message is sent. */
export function InlineImageChips({
  images,
  onRemove,
  busy = 0,
}: {
  images: InlineImage[];
  onRemove: (id: string) => void;
  /** How many uploads are still in flight. */
  busy?: number;
}) {
  if (!images.length && !busy) return null;
  return (
    <>
      {images.map((image) => (
        <span key={image.id} className="inlineImageChip">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url ?? ""} alt="" />
          <span className="inlineImageChip-name">{image.filename}</span>
          <button
            type="button"
            aria-label={`Remove ${image.filename}`}
            onClick={() => onRemove(image.id)}
          >
            <X size={13} />
          </button>
        </span>
      ))}
      {busy > 0 ? (
        <span className="inlineImageChip is-busy">
          Uploading {busy} image{busy === 1 ? "" : "s"}…
        </span>
      ) : null}
    </>
  );
}

/**
 * Staged uploads for one composer.
 *
 * Uploads start the moment a file arrives and run in parallel; the ids are
 * handed to the send as `image_ids`. `reset` is called after a successful post
 * — the images now belong to the message, not to the composer.
 */
export function useInlineImages(
  subjectKind: InlineImageSubject,
  getToken: () => Promise<string | null>,
) {
  const [images, setImages] = useState<InlineImage[]>([]);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");

  const add = useCallback(
    async (files: File[]) => {
      setError("");
      setBusy((count) => count + files.length);
      const token = (await getToken()) ?? undefined;
      await Promise.all(
        files.map(async (file) => {
          try {
            const image = await uploadInlineImage(file, subjectKind, token);
            setImages((current) => [...current, image]);
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : "That image could not be attached.");
          } finally {
            setBusy((count) => Math.max(0, count - 1));
          }
        }),
      );
    },
    [getToken, subjectKind],
  );

  const remove = useCallback((id: string) => {
    // Dropped from the composer only. The staged row is never bound to
    // anything, so it stays an orphan in S3 rather than needing a delete call.
    setImages((current) => current.filter((image) => image.id !== id));
  }, []);

  const reset = useCallback(() => {
    setImages([]);
    setError("");
  }, []);

  return { images, ids: images.map((image) => image.id), busy, error, add, remove, reset };
}
