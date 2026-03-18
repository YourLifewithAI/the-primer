"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { MathText } from "@primer/math-renderer";
import type { TutorMessage, TutorContext } from "@/lib/tutor";

interface TutorChatProps {
  problemId: string;
  context: TutorContext;
  /** Called when the chat opens (for engagement tracking) */
  onOpen?: () => void;
}

const MAX_MESSAGES = 10;

export function TutorChat({ problemId, context, onOpen }: TutorChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const userMessageCount = messages.filter((m) => m.role === "user").length;
  const atLimit = userMessageCount >= MAX_MESSAGES;

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const handleOpen = useCallback(() => {
    setIsOpen(true);
    onOpen?.();

    // Send a welcome message if this is the first open
    if (messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content:
            "Hi there! I'm Primer, your math helper. What part of this problem are you stuck on?",
          timestamp: Date.now(),
        },
      ]);
    }
  }, [messages.length, onOpen]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || streaming || atLimit) return;

    setError(null);
    setInput("");

    // Add user message immediately
    const userMsg: TutorMessage = {
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    // Create placeholder for assistant response
    const assistantMsg: TutorMessage = {
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };
    setMessages([...updatedMessages, assistantMsg]);
    setStreaming(true);

    try {
      const res = await fetch("/api/tutor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId,
          sessionId,
          context,
          messages: messages.filter((m) => m.role !== "assistant" || m.content !== ""),
          newMessage: trimmed,
        }),
      });

      // Capture session ID from header
      const newSessionId = res.headers.get("X-Tutor-Session-Id");
      if (newSessionId) {
        setSessionId(newSessionId);
      }

      if (!res.ok) {
        // Handle rate limit or other errors
        const data = await res.json();
        const errorMsg: TutorMessage = {
          role: "assistant",
          content:
            data.message ??
            "I'm having trouble right now. Try using the hint button instead!",
          timestamp: Date.now(),
        };
        setMessages([...updatedMessages, errorMsg]);
        setStreaming(false);
        return;
      }

      // Check if this is a JSON response (safety filter or fallback)
      const contentType = res.headers.get("Content-Type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        const responseMsg: TutorMessage = {
          role: "assistant",
          content: data.message,
          timestamp: Date.now(),
        };
        if (data.sessionId) setSessionId(data.sessionId);
        setMessages([...updatedMessages, responseMsg]);
        setStreaming(false);
        return;
      }

      // Stream the response
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        accumulated += decoder.decode(value, { stream: true });
        const streamMsg: TutorMessage = {
          role: "assistant",
          content: accumulated,
          timestamp: Date.now(),
        };
        setMessages([...updatedMessages, streamMsg]);
      }

      setStreaming(false);
    } catch {
      setError("Something went wrong. Try again or use the hint button.");
      setStreaming(false);
      // Remove the empty assistant message on error
      setMessages(updatedMessages);
    }
  }, [input, streaming, atLimit, messages, problemId, sessionId, context]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  // Collapsed state — just a help button
  if (!isOpen) {
    return (
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 px-4 py-2 min-h-[44px] text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors cursor-pointer"
        aria-label="Ask your AI tutor for help"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
          />
        </svg>
        I need help
      </button>
    );
  }

  // Expanded chat panel
  return (
    <div className="border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-blue-100/50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800">
        <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342"
            />
          </svg>
          Primer — Math Helper
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-blue-500 dark:text-blue-400">
            {userMessageCount}/{MAX_MESSAGES}
          </span>
          <button
            onClick={() => setIsOpen(false)}
            className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200 transition-colors cursor-pointer p-1"
            aria-label="Minimize tutor chat"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 8.25l-7.5 7.5-7.5-7.5"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="max-h-64 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-blue-500 text-white"
                  : "bg-white dark:bg-slate-800 text-foreground border border-blue-100 dark:border-slate-700"
              }`}
            >
              {msg.role === "assistant" ? (
                <MathText content={msg.content || (streaming && i === messages.length - 1 ? "..." : "")} />
              ) : (
                <span>{msg.content}</span>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 pb-2">
          <p className="text-xs text-red-500">{error}</p>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-blue-200 dark:border-blue-800 p-2">
        {atLimit ? (
          <p className="text-xs text-center text-blue-500 dark:text-blue-400 py-2">
            You&apos;ve used all {MAX_MESSAGES} messages. Try the hints or come
            back later!
          </p>
        ) : (
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                streaming ? "Primer is thinking..." : "Ask about the problem..."
              }
              disabled={streaming}
              className="flex-1 px-3 py-2 min-h-[40px] text-sm border border-blue-200 dark:border-blue-700 rounded-lg bg-white dark:bg-slate-900 text-foreground placeholder:text-blue-300 dark:placeholder:text-blue-600 outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={streaming || !input.trim()}
              className="px-3 py-2 min-h-[40px] bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
              aria-label="Send message"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
