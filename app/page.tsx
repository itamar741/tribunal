import { ChargeSheetUploadForm } from "@/components/ChargeSheetUploadForm";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-4">
        <p className="text-sm font-medium tracking-wide">AI Tribunal</p>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Submit a charge sheet
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Provide a Markdown (.md) charge sheet of 1 MB or less. A valid
            upload creates a unique Case and two Tribunal run records:
            SAME_MODEL and MIXED_MODELS. Later phases will execute those
            analyses on the stored text.
          </p>
        </div>
        <ChargeSheetUploadForm />
      </main>
    </div>
  );
}
