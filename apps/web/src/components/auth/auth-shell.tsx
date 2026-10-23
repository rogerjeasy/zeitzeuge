import { AuthPanel } from "./auth-panel";
import { AuthTopbar, BackHomeLink } from "./auth-topbar";
import { ResidencyNote } from "./legal-note";

/**
 * Two columns on a wide screen, one on a narrow one. The panel is decorative,
 * so below `lg` it simply goes away rather than being crushed or stacked under
 * the form where it would push the actual task below the fold.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.02fr)]">
      <div className="flex flex-col gap-8 px-5 py-7 sm:px-8 sm:py-9 lg:px-12">
        <AuthTopbar />

        <main id="main" className="flex flex-1 items-center py-4">
          <div className="mx-auto w-full max-w-[26.5rem]">{children}</div>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <BackHomeLink />
          <ResidencyNote />
        </footer>
      </div>

      <AuthPanel />
    </div>
  );
}
