import Link from "next/link";

export function AppHeader({ detail }: { detail?: string }) {
  return (
    <header className="app-header px-5 py-4 sm:px-8">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
        <Link
          href="/"
          className="group flex min-w-0 items-center gap-3 no-underline"
          aria-label="AI Tribunal home"
        >
          <span className="brand-crest" aria-hidden="true">
            T
          </span>
          <span className="min-w-0">
            <span className="display-face block text-xl font-bold tracking-[0.09em] text-[#f5dfaa] sm:text-2xl">
              AI Tribunal
            </span>
            <span className="block truncate text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[#bca576]">
              Council of Seven · Dual review
            </span>
          </span>
        </Link>
        {detail ? (
          <p className="hidden max-w-[45%] truncate text-right text-xs font-medium tracking-wide text-[#cdb98d] sm:block">
            {detail}
          </p>
        ) : (
          <p className="hidden text-xs uppercase tracking-[0.16em] text-[#cdb98d] sm:block">
            The record shall be heard
          </p>
        )}
      </div>
    </header>
  );
}
