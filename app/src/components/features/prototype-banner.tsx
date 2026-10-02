export function PrototypeBanner({ demo = false }: { demo?: boolean }) {
  return (
    <div role="note" className="border-b border-border bg-muted px-6 py-2 text-xs text-muted-foreground">
      Prototype: human approval required before any external action. Nothing here is sent to customers, carriers or suppliers.
      {demo && " Demo mode: sample data, AI steps are pre-generated."}
    </div>
  );
}
