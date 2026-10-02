"use client";

import { useActionState } from "react";
import { messageAction } from "@/actions/messages";
import { Button } from "@/components/ui/button";

export function MessageDraftCard({ id, caseId, body, language, items }: { id: string; caseId: string; body: string; language: string; items: string[] }) {
  const [error, action, pending] = useActionState(messageAction.bind(null, id, caseId), undefined);
  return (
    <form action={action} className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
      <div className="text-muted-foreground">Draft email to the customer ({language}). Review and edit it, send it yourself, then mark it as sent.</div>
      <ul className="list-disc pl-5 text-muted-foreground">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
      <textarea name="body" defaultValue={body} rows={9} className="rounded-md border border-input bg-background p-3" />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="save" size="sm" variant="outline" disabled={pending}>Save edits</Button>
        <Button type="submit" name="intent" value="send" size="sm" disabled={pending}>Mark as sent (manual attestation)</Button>
        <Button type="submit" name="intent" value="discard" size="sm" variant="outline" disabled={pending}>Discard</Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
