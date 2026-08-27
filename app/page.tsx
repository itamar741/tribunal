import { AppHeader } from "@/components/AppHeader";
import { ChargeSheetUploadForm } from "@/components/ChargeSheetUploadForm";
import { OpenCaseForm } from "@/components/OpenCaseForm";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Submit a charge sheet
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Provide one Markdown (.md) charge sheet of 1 MB or less. A valid
            upload creates a unique Case. You can then start the Tribunal to
            run two independent analyses: SAME_MODEL and MIXED_MODELS.
          </p>
        </div>
        <ChargeSheetUploadForm />
        <OpenCaseForm />
      </main>
    </div>
  );
}
