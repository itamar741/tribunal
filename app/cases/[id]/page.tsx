import { AppHeader } from "@/components/AppHeader";
import { CaseWorkspace } from "@/components/CaseWorkspace";
import { isCaseId } from "@/lib/cases/id";

export default async function CasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const valid = isCaseId(id);

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader detail={valid ? `Case ${id}` : "Invalid Case"} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Case results</h1>
          {valid ? (
            <p className="mt-2 text-sm text-[var(--muted)]">
              Persisted SAME_MODEL and MIXED_MODELS outcomes. Reloading this
              page reads stored results and does not execute models.
            </p>
          ) : (
            <p role="alert" className="mt-2 text-sm text-red-800">
              The Case ID is not valid.
            </p>
          )}
        </div>
        {valid ? <CaseWorkspace key={id} caseId={id} /> : null}
      </main>
    </div>
  );
}
