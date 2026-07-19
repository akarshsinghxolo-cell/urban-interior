"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

export interface ConfirmDialogConfig {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmDialogState {
  open: boolean;
  config: ConfirmDialogConfig | null;
  resolve: ((value: boolean) => void) | null;
}

let _confirmFn: ((config: ConfirmDialogConfig) => Promise<boolean>) | null = null;

export function confirmDialog(config: ConfirmDialogConfig): Promise<boolean> {
  if (_confirmFn) return _confirmFn(config);
  return Promise.resolve(window.confirm(config.title));
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ConfirmDialogState>({
    open: false,
    config: null,
    resolve: null,
  });

  const confirm = React.useCallback((config: ConfirmDialogConfig) => {
    return new Promise<boolean>((resolve) => {
      setState({ open: true, config, resolve });
    });
  }, []);

  React.useEffect(() => {
    _confirmFn = confirm;
    return () => { _confirmFn = null; };
  }, [confirm]);

  const handleConfirm = () => {
    state.resolve?.(true);
    setState({ open: false, config: null, resolve: null });
  };

  const handleCancel = () => {
    state.resolve?.(false);
    setState({ open: false, config: null, resolve: null });
  };

  return (
    <>
      {children}
      <Dialog open={state.open} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {state.config?.danger && <AlertTriangle className="h-4 w-4 text-destructive" />}
              {state.config?.title}
            </DialogTitle>
            {state.config?.description && (
              <DialogDescription>{state.config.description}</DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              {state.config?.cancelLabel || "Cancel"}
            </Button>
            <Button
              variant={state.config?.danger ? "destructive" : "default"}
              onClick={handleConfirm}
            >
              {state.config?.confirmLabel || "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
