import Link from "next/link";

export function AppHeader({ detail }: { detail?: string }) {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)] px-6 py-4">
      <p className="text-sm font-medium tracking-wide">
        <Link href="/" className="underline-offset-2 hover:underline">
          AI Tribunal
        </Link>
        {detail ? <span className="text-[var(--muted)]"> · {detail}</span> : null}
      </p>
    </header>
  );
}
