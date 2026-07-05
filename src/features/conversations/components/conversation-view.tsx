import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ConversationMessage } from "@/features/conversations/types";

export function ConversationView({
  status,
  messages,
  text,
  onTextChange,
  onHandoff,
  onSend,
  loading,
}: {
  status: string;
  messages: ConversationMessage[];
  text: string;
  onTextChange: (text: string) => void;
  onHandoff: (next: string) => void;
  onSend: () => void;
  loading: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-muted-foreground">Estado:</span>
        <Badge variant="secondary" className="font-mono">
          {status}
        </Badge>
        {status === "active" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => onHandoff("handed_off")}
          >
            Pasar a humano
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => onHandoff("active")}
          >
            Devolver al bot
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={loading}
          onClick={() => onHandoff("closed")}
        >
          Cerrar
        </Button>
      </div>

      <div className="max-h-[50vh] space-y-3 overflow-y-auto rounded-lg border border-border bg-muted/30 p-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "rounded-lg px-3 py-2 text-sm",
              m.role === "user"
                ? "ml-8 bg-secondary text-secondary-foreground"
                : "mr-8 bg-primary/10 text-foreground"
            )}
          >
            <div className="text-xs text-muted-foreground">
              {m.role} · {m.mediaType} · {new Date(m.createdAt).toLocaleString()}
            </div>
            <div className="mt-1 whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Mensaje manual (WhatsApp)…"
          className="flex-1"
        />
        <Button type="button" disabled={loading} onClick={onSend}>
          Enviar
        </Button>
      </div>
    </div>
  );
}
