"use client";

import * as React from "react";

const PortalActivityContext = React.createContext(true);

export function PortalActivityProvider({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <PortalActivityContext.Provider value={active}>
      {children}
    </PortalActivityContext.Provider>
  );
}

export function PortalActivityBoundary({ children }: { children: React.ReactNode }) {
  const active = React.useContext(PortalActivityContext);
  return active ? <>{children}</> : null;
}
