"use client";

import { DriveSecurityDiagnosticsPanel } from "./DriveSecurityDiagnosticsPanel";
import { GoogleDriveManagerModule as GoogleDriveManagerCoreModule } from "./GoogleDriveManagerCoreModule";

export function GoogleDriveManagerModule() {
  return (
    <div className="grid gap-5">
      <DriveSecurityDiagnosticsPanel />
      <GoogleDriveManagerCoreModule />
    </div>
  );
}
