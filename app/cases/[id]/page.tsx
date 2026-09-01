import { AppHeader } from "@/components/AppHeader";
import { CaseWorkspace } from "@/components/CaseWorkspace";
import { isCaseId } from "@/lib/cases/id";

export default async function CasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ start?: string }>;
}) {
  const { id } = await params;
  const { start } = await searchParams;
  const valid = isCaseId(id);

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader detail={valid ? `Case ${id}` : "Invalid Case"} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-5 py-8 sm:px-8 sm:py-10">
        {valid ? (
          <CaseWorkspace key={id} caseId={id} autoStart={start === "1"} />
        ) : null}
        {!valid ? (
          <div className="stone-panel px-5 py-5 sm:px-7">
            <p className="eyebrow">Tribunal chamber</p>
            <h1 className="display-face mt-1 text-3xl font-bold tracking-tight text-[#f0dbab]">Case results</h1>
            <p role="alert" className="mt-2 text-sm text-[#f3a7a7]">
              The Case ID is not valid.
            </p>
          </div>
        ) : null}
      </main>
    </div>
  );
}
