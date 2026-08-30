export function TribunalExecutionState() {
  return (
    <div className="flex items-start gap-3" role="status" aria-live="polite">
      <span className="deliberating-flame mt-0.5" aria-hidden="true" />
      <p className="text-sm leading-6">
        <span className="display-face block text-lg font-bold">The Tribunal is deliberating…</span>
        Several AI agents are working. This can take several minutes; the
        record below updates automatically as completed seats are saved.
      </p>
    </div>
  );
}
