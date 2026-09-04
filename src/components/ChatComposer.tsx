"use client";

// One composer for every conversation in the app.
//
// The shape is the one people already know from their phone: an input that
// grows with the text, a round send button at the trailing edge, Enter to send
// and Shift+Enter for a new line. Before this each panel rolled its own
// textarea and its own rectangular button, so the same keystroke did different
// things depending on which conversation you were in — Enter sent a desk
// message and typed a newline into a text message.
//
// Attachments are opt-in per surface rather than assumed, because not every
// transport can carry a file. Outbound SMS through the handset relay is text
// only — the gateway's send API has no media field at all — so the text
// composers pass no `onFiles` and get no paperclip they cannot use. A button
// that silently does nothing is worse than no button.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Loader2, Paperclip, Send } from "lucide-react";

const MAX_INPUT_HEIGHT = 168; // ~7 lines, then it scrolls instead of growing.

export type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder?: string;
  /** The conversation cannot be written to at all (read-only thread, no consent). */
  disabled?: boolean;
  /** A send is in flight. Keeps the text, blocks a second one. */
  sending?: boolean;
  /** Screen-reader name for the round button. Say what it sends. */
  sendLabel?: string;
  /** Quiet line under the input — where this goes, what Enter does. */
  hint?: ReactNode;
  /** Warning above the input, for a channel that reaches the client. */
  notice?: ReactNode;
  error?: ReactNode;
  /** Provide to enable the paperclip AND pasting an image. Omit for text-only transports. */
  onFiles?: (files: File[]) => void;
  /** What the picker offers. Pasting is not filtered by this — the surface decides. */
  accept?: string;
  /** Chips for what is already attached, rendered above the input. */
  attachments?: ReactNode;
  /**
   * Send is allowed on an empty input. For a surface where an attachment on
   * its own is a complete message.
   */
  allowEmpty?: boolean;
  /**
   * Own control for the leading slot, replacing the file paperclip. The inbox
   * puts its conversation-action menu here — same position, different job.
   * Pasting an image still works when `onFiles` is set alongside it.
   */
  leading?: ReactNode;
  autoFocus?: boolean;
};

export function ChatComposer({
  value,
  onChange,
  onSend,
  placeholder,
  disabled = false,
  sending = false,
  sendLabel = "Send message",
  hint,
  notice,
  error,
  onFiles,
  accept = "image/*",
  attachments,
  allowEmpty = false,
  leading,
  autoFocus,
}: ChatComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  // An IME candidate window swallows Enter to commit a character. Sending on
  // that keystroke would post half a word in Japanese or Chinese.
  const [composing, setComposing] = useState(false);

  const canSend = (Boolean(value.trim()) || allowEmpty) && !disabled && !sending;

  // Grow to fit, up to a ceiling. Reset first so deleting text shrinks it back.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, [value]);

  const submit = useCallback(() => {
    if (!canSend) return;
    onSend();
  }, [canSend, onSend]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter") return;
    // Shift+Enter is the newline. Every other modifier is left alone so the
    // browser's own shortcuts keep working.
    if (event.shiftKey || composing || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  const takeFiles = (files: FileList | null) => {
    if (!onFiles || !files?.length) return;
    onFiles(Array.from(files));
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!onFiles) return;
    // Only intercept when the clipboard actually carries a file. A normal text
    // paste must still land in the input untouched.
    const files = Array.from(event.clipboardData?.files ?? []);
    if (!files.length) return;
    event.preventDefault();
    onFiles(files);
  };

  return (
    <div className={`chatComposer${disabled ? " is-disabled" : ""}`}>
      {notice ? <div className="warnline">{notice}</div> : null}
      {attachments ? <div className="chatComposer-attachments">{attachments}</div> : null}
      <div className="chatComposer-bar">
        {leading}
        {!leading && onFiles ? (
          <>
            <button
              type="button"
              className="chatComposer-attach"
              aria-label="Attach a file"
              disabled={disabled || sending}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip size={18} />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              multiple
              hidden
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                takeFiles(event.target.files);
                // Same file twice in a row still fires a change event.
                event.target.value = "";
              }}
            />
          </>
        ) : null}
        <textarea
          ref={inputRef}
          className="chatComposer-input"
          rows={1}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
        />
        <button
          type="button"
          className="chatComposer-send"
          aria-label={sendLabel}
          disabled={!canSend}
          onClick={submit}
        >
          {sending ? <Loader2 size={18} className="chatComposer-spin" /> : <Send size={17} />}
        </button>
      </div>
      {error ? <div className="chatComposer-error">{error}</div> : null}
      {hint ? <div className="chatComposer-hint">{hint}</div> : null}
    </div>
  );
}
