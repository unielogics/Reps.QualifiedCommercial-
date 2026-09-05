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
import {
  describeRejection,
  uploadInlineImage,
  type InlineImage,
  type InlineImageSubject,
} from "@/lib/inlineImages";

/** An image chosen but not yet sent. Held in the browser until then. */
export type PendingImage = {
  id: string;
  filename: string;
  file: File;
  url: string;
};

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
  images: PendingImage[];
  onRemove: (id: string) => void;
  /** How many images are still uploading, during a send. */
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
          Sending {busy} image{busy === 1 ? "" : "s"}…
        </span>
      ) : null}
    </>
  );
}

/**
 * Images attached to one composer, uploaded when the message is sent.
 *
 * Pasting keeps the file in the browser and shows it from an object URL — no
 * network, no row, nothing in object storage. The bytes leave only when the
 * person actually sends, which is the moment they have decided the image is
 * part of a message.
 *
 * The earlier version uploaded on paste so that sending stayed instant. That
 * traded a real cost for a small one: every abandoned paste left a finished
 * file in object storage attached to nothing, and the volume of that grows with
 * use and never shrinks. Waiting costs a second on send, and `pending` is
 * exported so the button can say what it is doing rather than appear stuck.
 *
 * `flush` returns the ids to hand to the send. Call it first; if it throws, the
 * message has not been posted and nothing has been lost.
 */
export function useInlineImages(
  subjectKind: InlineImageSubject,
  getToken: () => Promise<string | null>,
) {
  const [images, setImages] = useState<PendingImage[]>([]);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");

  const add = useCallback((files: File[]) => {
    const usable: PendingImage[] = [];
    for (const file of files) {
      const rejection = describeRejection(file);
      if (rejection) {
        // Said now rather than at send: a file that can never be attached
        // should not be discovered at the moment someone presses the button.
        setError(rejection);
        continue;
      }
      usable.push({
        id: `local-${Math.random().toString(36).slice(2)}`,
        filename: file.name || "pasted image",
        file,
        // Shown straight from the browser, so the preview is instant and costs
        // no round trip.
        url: URL.createObjectURL(file),
      });
    }
    if (usable.length) setError("");
    setImages((current) => [...current, ...usable]);
  }, []);

  const remove = useCallback((id: string) => {
    setImages((current) => {
      const going = current.find((image) => image.id === id);
      // Nothing was uploaded, so removing is purely local — and the object URL
      // has to be released or the bytes stay held for the life of the tab.
      if (going?.url) URL.revokeObjectURL(going.url);
      return current.filter((image) => image.id !== id);
    });
  }, []);

  const reset = useCallback(() => {
    setImages((current) => {
      for (const image of current) if (image.url) URL.revokeObjectURL(image.url);
      return [];
    });
    setError("");
  }, []);

  const flush = useCallback(async (): Promise<string[]> => {
    if (!images.length) return [];
    setError("");
    setPending(images.length);
    const token = (await getToken()) ?? undefined;
    try {
      // Sequential rather than parallel: these are phone uploads over one
      // connection, and the count in the button should mean something.
      const ids: string[] = [];
      for (const image of images) {
        const uploaded = await uploadInlineImage(image.file, subjectKind, token);
        ids.push(uploaded.id);
        setPending((count) => Math.max(0, count - 1));
      }
      return ids;
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "That image could not be attached.",
      );
      throw reason;
    } finally {
      setPending(0);
    }
  }, [getToken, images, subjectKind]);

  return { images, pending, error, add, remove, reset, flush };
}
