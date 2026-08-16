from __future__ import annotations

import os
import subprocess
from pathlib import Path

BRANCH = "agent/nonblocking-module-loading"


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:100]!r}")
    target.write_text(text.replace(old, new, 1))


def main() -> None:
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("GITHUB_WORKFLOW") != "Application CI":
        print("Nonblocking module patch is CI-only; skipping outside Application CI.")
        return

    subprocess.run(["git", "fetch", "origin", BRANCH], check=True)
    subprocess.run(["git", "checkout", "-B", BRANCH, f"origin/{BRANCH}"], check=True)

    app_path = "src/components/rdash/RDashApp.tsx"
    replace_once(
        app_path,
        'import { useWorkspaceReadState, workspaceReadState } from "@/lib/rdash/workspace-read-state";',
        'import { workspaceReadState } from "@/lib/rdash/workspace-read-state";',
    )
    replace_once(app_path, '    const readState = useWorkspaceReadState();\n', "")
    replace_once(
        app_path,
        '    const secureWorkspaceReady = secureBootstrapReady && readState.scope !== "bootstrap" && readState.mode !== "unknown";',
        '    const secureWorkspaceReady = secureBootstrapReady;',
    )
    replace_once(
        app_path,
        '        const loadingMessage = secureWorkspaceError || (secureBootstrapReady\n            ? "Loading only the secure data required for this screen…"\n            : "Verifying your session and loading the workspace bootstrap…");',
        '        const loadingMessage = secureWorkspaceError || "Verifying your session and loading the workspace bootstrap…";',
    )

    router_path = Path("src/components/rdash/WorkspaceModuleRouter.tsx")
    router = router_path.read_text()
    start = router.index("function ModuleDataStateFallback")
    end = router.index("\n\nexport function WorkspaceModuleRouter", start)
    replacement = r'''function ModuleDataStateFallback({ status, error }: { status: WorkspaceDataLoadStatus; error?: string }) {
    const failed = status === "error";
    if (failed) {
        return <div className="rounded-[var(--panel-radius)] border border-destructive/30 bg-card p-6 shadow-card">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <AlertTriangle className="h-4 w-4"/>
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Module data unavailable</p>
              <p className="mt-1 text-xs text-muted-foreground">{error || "The requested workspace data could not be loaded. Use Retry and keep the rest of the workspace available."}</p>
            </div>
          </div>
        </div>;
    }

    return <div className="space-y-4" aria-live="polite" aria-busy="true">
      <div className="rounded-[var(--panel-radius)] border border-border bg-card p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Database className="h-4 w-4"/>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{status === "loading" ? "Loading module data" : "Preparing module data"}</p>
            <p className="mt-1 text-xs text-muted-foreground">This module is loading its scoped data. Navigation and the rest of the workspace remain available.</p>
          </div>
          <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-primary"/>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
        {[0, 1, 2].map((item) => <div key={item} className="rounded-[var(--panel-radius)] border border-border bg-card p-5 shadow-card">
          <div className="h-3 w-24 animate-pulse rounded bg-muted"/>
          <div className="mt-4 h-7 w-2/3 animate-pulse rounded bg-muted"/>
          <div className="mt-3 h-3 w-full animate-pulse rounded bg-muted"/>
          <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-muted"/>
        </div>)}
      </div>
    </div>;
}'''
    router_path.write_text(router[:start] + replacement + router[end:])

    boundary_path = Path("src/components/urban-castle/WorkspaceScopedReadBoundary.tsx")
    boundary = boundary_path.read_text()
    tail_start = boundary.index('  const error = loadState.status === "error" ? loadState.error : undefined;')
    new_tail = r'''  const error = loadState.status === "error" ? loadState.error : undefined;
  if (!error) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-[min(92vw,360px)] rounded-xl border border-destructive/30 bg-card/95 p-3 shadow-xl backdrop-blur-sm">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">Module data unavailable</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{error}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setRetryNonce((value) => value + 1)}>
          <RotateCw className="mr-1 h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    </div>
  );
}
'''
    boundary_path.write_text(boundary[:tail_start] + new_tail)

    bootstrap_test = "tests/workspace-bootstrap-scoped-flow.test.ts"
    replace_once(
        bootstrap_test,
        '    expect(app).toContain("hydrateSecureWorkspace({");\n',
        '    expect(app).toContain("hydrateSecureWorkspace({");\n    expect(app).toContain("const secureWorkspaceReady = secureBootstrapReady;");\n    expect(app).not.toContain(\'readState.scope !== "bootstrap"\');\n',
    )

    nav_path = Path("tests/workspace-navigation-revalidation.test.ts")
    nav = nav_path.read_text()
    marker = '  test("caches bounded targets by user and target revision", async () => {'
    if nav.count(marker) != 1:
        raise RuntimeError("Could not find navigation test insertion point")
    new_test = r'''  test("keeps the app shell visible during a first-time module load", async () => {
    const app = await read("src/components/rdash/RDashApp.tsx");
    const boundary = await read(
      "src/components/urban-castle/WorkspaceScopedReadBoundary.tsx",
    );
    const router = await read("src/components/rdash/WorkspaceModuleRouter.tsx");

    expect(app).toContain("const secureWorkspaceReady = secureBootstrapReady;");
    expect(app).not.toContain('readState.scope !== "bootstrap"');
    expect(boundary).not.toContain('fixed inset-0 z-[90]');
    expect(boundary).not.toContain("Refreshing module data");
    expect(boundary).toContain("if (!error) return null");
    expect(router).toContain('if (dataLoadState.status !== "loaded")');
    expect(router).toContain('aria-busy="true"');
    expect(router).toContain("animate-pulse");
    expect(router).toContain("Navigation and the rest of the workspace remain available.");
  });

'''
    nav_path.write_text(nav.replace(marker, new_test + marker, 1))

    print("Applied nonblocking module loading patch in CI working tree.")


if __name__ == "__main__":
    main()
