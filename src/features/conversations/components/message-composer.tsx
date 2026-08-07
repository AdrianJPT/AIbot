"use client";

import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function MessageComposer({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="flex min-w-0 items-end gap-2 border-t border-border bg-background p-2 sm:p-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Escribí un mensaje… (Enter para enviar, Shift+Enter salto de línea)"
        className="min-h-[44px] min-w-0 flex-1 resize-none"
        rows={1}
      />
      <Button
        type="button"
        onClick={submit}
        disabled={disabled || !text.trim()}
        className="min-h-11 shrink-0"
      >
        Enviar
      </Button>
    </div>
  );
}
