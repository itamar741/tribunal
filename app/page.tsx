import { AppHeader } from "@/components/AppHeader";
import { TribunalLaunchPanel } from "@/components/TribunalLaunchPanel";
import { OpenCaseForm } from "@/components/OpenCaseForm";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-5 py-9 sm:px-8 sm:py-12">
        <div className="stone-panel overflow-hidden px-6 py-9 text-center sm:px-12 sm:py-12">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#e8c269] to-transparent" />
          <p className="eyebrow">The High Chamber</p>
          <h1 className="display-face mt-3 text-4xl font-bold tracking-tight text-[#f4dfad] sm:text-5xl">
            Convene the Tribunal
          </h1>
          <div className="gold-rule mx-auto mt-4 max-w-sm text-[#d1a753]" aria-hidden="true">
            <span className="text-sm">◆</span>
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-[#cdbd9e] sm:text-base">
            The canonical charge is already entered into the record. Convene
            two independent councils to hear the same facts and deliver their
            verdicts side by side.
          </p>
        </div>
        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)]">
          <TribunalLaunchPanel />
          <OpenCaseForm />
        </div>
      </main>
    </div>
  );
}
