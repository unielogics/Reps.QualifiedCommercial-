"use client";

// A conversation, rendered the way a phone renders one: theirs left on surface,
// ours right in accent, the time beneath the bubble, a divider when the day
// changes, and delivery state only on messages we sent.
//
// Shared by the inbox and the appointment workspace. Each of those owns its own
// composer and actions — this renders the messages and nothing else, so the two
// cannot drift apart visually while their surrounding chrome differs.

import { useEffect, useRef } from "react";
import {
  clock,
  dayBreak,
  dayLabel,
  type UnifiedCommunicationMessage,
} from "@/lib/communications";
import { InlineImageStrip } from "@/components/InlineImageStrip";

export function ConversationBubbles({
  messages,
  isLoading,
  isError,
  emptyLabel = "No messages in this conversation yet.",
  /** Who the other side is, when the message itself does not name them. */
  counterpartName,
  onRetry,
}: {
  messages: UnifiedCommunicationMessage[];
  isLoading?: boolean;
  isError?: boolean;
  emptyLabel?: string;
  counterpartName?: string | null;
  onRetry?: (message: UnifiedCommunicationMessage) => void;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);

  // Newest message in view on arrival and after each new one, as a chat should.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages.length]);

  return (
    <div className="rc-msgs" ref={scroller}>
      {isLoading ? <div className="thr-empty">Loading...</div> : null}
      {isError ? <div className="thr-empty">This conversation could not be loaded.</div> : null}
      {!isLoading && !isError && !messages.length ? <div className="thr-empty">{emptyLabel}</div> : null}
      {messages.map((message, index) => {
        const previous = index > 0 ? messages[index - 1] : null;
        const mine = message.direction === "outbound";
        const who = message.sender_name || counterpartName;
        return (
          <div key={message.id}>
            {dayBreak(previous?.created_at ?? null, message.created_at) ? (
              <div className="thr-day">{dayLabel(message.created_at)}</div>
            ) : null}
            <div className={`rc-row${mine ? " mine" : ""}`}>
              <div className="rc-bub">
                {/* Only name the other side; every outbound is us, and repeating
                    that on each bubble is noise the alignment already carries. */}
                {!mine && who ? <span className="rc-who">{who}</span> : null}
                {/* A picture with no caption is a real message: the body is
                    empty and the image is the whole content. */}
                {message.body ? <p>{message.body}</p> : null}
                <InlineImageStrip images={message.images ?? []} />
              </div>
              <span className="rc-meta">
                <time dateTime={message.created_at}>{clock(message.created_at)}</time>
                {mine && message.delivery_status ? (
                  <span className={`rc-st ${message.delivery_status}`}>{message.delivery_status}</span>
                ) : null}
                {mine && message.delivery_detail ? <span className="rc-delivery-detail">{message.delivery_detail}</span> : null}
                {mine && onRetry && ["failed", "blocked", "undelivered"].includes(message.delivery_status || "") ? (
                  <button type="button" className="linky" onClick={() => onRetry(message)}>Retry</button>
                ) : null}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
