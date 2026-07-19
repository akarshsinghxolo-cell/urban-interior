"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export interface PromptDialogConfig {
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  multiline?: boolean;
  validate?: (value: string) => string | null; // returns error message or null
  confirmLabel?: string;
  cancelLabel?: string;
}

interface PromptDialogState {
  open: boolean;
  config: PromptDialogConfig | null;
  resolve: ((value: string | null) => void) | null;
}

const PromptDialogContext = React.createContext<{
  prompt: (config: PromptDialogConfig) => Promise<string | null>;
} | null>(null);

// Module-level singleton — allows non-component code (like recordActions) to call promptDialog()
let _promptFn: ((config: PromptDialogConfig) => Promise<string | null>) | null = null;

export function promptDialog(config: PromptDialogConfig): Promise<string | null> {
  if (_promptFn) return _promptFn(config);
  // Fallback to window.prompt if provider not mounted
  return Promise.resolve(window.prompt(config.title, config.defaultValue || ""));
}

export function PromptDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<PromptDialogState>({
    open: false,
    config: null,
    resolve: null,
  });
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const prompt = React.useCallback((config: PromptDialogConfig) => {
    return new Promise<string | null>((resolve) => {
      setValue(config.defaultValue || "");
      setError(null);
      setState({ open: true, config, resolve });
    });
  }, []);

  // Register the prompt function at module level so non-component code can use it
  React.useEffect(() => {
    _promptFn = prompt;
    return () => { _promptFn = null; };
  }, [prompt]);

  const handleClose = React.useCallback((result: string | null) => {
    setState((prev) => {
      if (prev.resolve) {
        prev.resolve(result);
      }
      return { open: false, config: null, resolve: null };
    });
  }, []);

  const handleConfirm = React.useCallback(() => {
    const config = state.config;
    if (!config) return;
    if (config.required && !value.trim()) {
      setError("This field is required.");
      return;
    }
    if (config.validate) {
      const validationError = config.validate(value);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    handleClose(value);
  }, [state.config, value, handleClose]);

  const handleCancel = React.useCallback(() => {
    handleClose(null);
  }, [handleClose]);

  return (
    <PromptDialogContext.Provider value={{ prompt }}>
      {children}
      <Dialog open={state.open} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{state.config?.title || ""}</DialogTitle>
            {state.config?.description && (
              <DialogDescription>{state.config.description}</DialogDescription>
            )}
          </DialogHeader>
          <div className="space-y-2 py-2">
            {state.config?.label && (
              <Label htmlFor="prompt-input">{state.config.label}</Label>
            )}
            {state.config?.multiline ? (
              <Textarea
                id="prompt-input"
                value={value}
                onChange={(e) => { setValue(e.target.value); setError(null); }}
                placeholder={state.config?.placeholder || ""}
                rows={3}
                autoFocus
              />
            ) : (
              <Input
                id="prompt-input"
                value={value}
                onChange={(e) => { setValue(e.target.value); setError(null); }}
                placeholder={state.config?.placeholder || ""}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
              />
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              {state.config?.cancelLabel || "Cancel"}
            </Button>
            <Button onClick={handleConfirm}>
              {state.config?.confirmLabel || "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PromptDialogContext.Provider>
  );
}

export function usePromptDialog() {
  const ctx = React.useContext(PromptDialogContext);
  if (!ctx) {
    // Fallback: if no provider, use window.prompt
    return {
      prompt: async (config: PromptDialogConfig): Promise<string | null> => {
        return promptDialog(config);
      },
    };
  }
  return ctx;
}
