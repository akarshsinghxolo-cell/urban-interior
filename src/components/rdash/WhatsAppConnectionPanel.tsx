"use client";

import * as React from "react";
import { CheckCircle2, Link2, Loader2, MessageCircle, RefreshCw, Unlink, WifiOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AccountSnapshot = {
  status: "disconnected" | "pairing" | "connecting" | "connected" | "degraded" | "logged_out" | "error";
  paired: boolean;
  phoneNumber?: string;
  displayName?: string;
  connectedAt?: string;
  lastActivityAt?: string;
  lastError?: string;
};

type JournalMessage = {
  id: string;
  direction: "inbound" | "outbound";
  remoteJid: string;
  customerId?: string;
  subject?: string;
  body?: string;
  messageType: string;
  status: string;
  sentAt?: string;
  receivedAt?: string;
  createdAt: string;
};

export function WhatsAppConnectionPanel({
  isOwner,
  customers,
  onOpenCustomer,
}: {
  isOwner: boolean;
  customers: Array<{ id: string; name: string }>;
  onOpenCustomer: (customerId: string) => void;
}) {
  const [account, setAccount] = React.useState<AccountSnapshot | null>(null);
  const [messages, setMessages] = React.useState<JournalMessage[]>([]);
  const [phoneNumber, setPhoneNumber] = React.useState("");
  const [pairingCode, setPairingCode] = React.useState("");
  const [busy, setBusy] = React.useState<"pair" | "disconnect" | "refresh" | null>(null);

  const customerNames = React.useMemo(() => new Map(customers.map((customer) => [customer.id, customer.name])), [customers]);

  const refresh = React.useCallback(async (quiet = false) => {
    if (!quiet) setBusy("refresh");
    try {
      const [statusResponse, messageResponse] = await Promise.all([
        fetch("/api/whatsapp/status", { cache: "no-store" }),
        fetch("/api/whatsapp/messages?limit=12", { cache: "no-store" }),
      ]);
      if (!statusResponse.ok) throw new Error((await statusResponse.json().catch(() => ({}))).error || "Could not load WhatsApp status.");
      const statusPayload = await statusResponse.json() as { account: AccountSnapshot };
      setAccount(statusPayload.account);
      if (messageResponse.ok) {
        const payload = await messageResponse.json() as { messages?: JournalMessage[] };
        setMessages(payload.messages || []);
      }
    } catch (error) {
      if (!quiet) toast.error(error instanceof Error ? error.message : "Could not refresh WhatsApp.");
    } finally {
      if (!quiet) setBusy(null);
    }
  }, []);

  React.useEffect(() => {
    void refresh(true);
  }, [refresh]);

  React.useEffect(() => {
    if (account?.status !== "pairing") return;
    const timer = window.setInterval(() => void refresh(true), 4000);
    return () => window.clearInterval(timer);
  }, [account?.status, refresh]);

  React.useEffect(() => {
    if (!account?.paired) return;
    const source = new EventSource("/api/whatsapp/stream");
    const onMessage = () => void refresh(true);
    const onStatus = () => void refresh(true);
    source.addEventListener("message", onMessage);
    source.addEventListener("status", onStatus);
    return () => {
      source.removeEventListener("message", onMessage);
      source.removeEventListener("status", onStatus);
      source.close();
    };
  }, [account?.paired, refresh]);

  const pair = async () => {
    if (!phoneNumber.trim() || busy) return;
    setBusy("pair");
    try {
      const response = await fetch("/api/whatsapp/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });
      const payload = await response.json().catch(() => ({})) as { code?: string; error?: string };
      if (!response.ok || !payload.code) throw new Error(payload.error || "Could not create WhatsApp pairing code.");
      setPairingCode(payload.code);
      toast.success("Pairing code created. Enter it in WhatsApp Linked devices.");
      await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not pair WhatsApp.");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    if (busy) return;
    setBusy("disconnect");
    try {
      const response = await fetch("/api/whatsapp/disconnect", { method: "POST" });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not disconnect WhatsApp.");
      setPairingCode("");
      setPhoneNumber("");
      toast.success("Urban Castle WhatsApp disconnected.");
      await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect WhatsApp.");
    } finally {
      setBusy(null);
    }
  };

  const paired = Boolean(account?.paired);
  const healthy = paired && account?.status !== "error" && account?.status !== "logged_out";
  const statusLabel = paired
    ? account?.status === "connected" ? "Paired · live" : "Paired · reconnects on demand"
    : account?.status === "pairing" ? "Pairing in progress" : "Not paired";

  return (
    <section className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <span className={cn(
            "mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border",
            healthy ? "border-success/20 bg-success/10 text-success" : "border-border bg-muted text-muted-foreground",
          )}>
            {healthy ? <MessageCircle className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          </span>
          <div>
            <p className="text-sm font-bold">Urban Castle WhatsApp</p>
            <p className="text-[11px] text-muted-foreground">{statusLabel}</p>
            {account?.displayName && <p className="mt-0.5 text-[11px] font-medium">{account.displayName}{account.phoneNumber ? ` · +${account.phoneNumber}` : ""}</p>}
            {account?.lastError && <p className="mt-1 max-w-xl text-[10px] text-destructive">{account.lastError}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => void refresh()} disabled={busy !== null}>
            {busy === "refresh" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            Refresh
          </Button>
          {isOwner && paired && (
            <Button type="button" size="sm" variant="outline" className="h-8 text-destructive" onClick={() => void disconnect()} disabled={busy !== null}>
              {busy === "disconnect" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Unlink className="mr-1 h-3.5 w-3.5" />}
              Disconnect
            </Button>
          )}
        </div>
      </div>

      {!paired && isOwner && (
        <div className="grid gap-3 border-b border-border px-4 py-3 md:grid-cols-[1fr_auto]">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">WhatsApp number</label>
            <Input
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              placeholder="9876543210 or 919876543210"
              inputMode="tel"
              className="mt-1 h-9"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">India numbers can be entered as 10 digits. Other countries should include the country code.</p>
          </div>
          <div className="flex items-end">
            <Button type="button" size="sm" className="h-9" onClick={() => void pair()} disabled={!phoneNumber.trim() || busy !== null}>
              {busy === "pair" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1 h-3.5 w-3.5" />}
              Pair WhatsApp
            </Button>
          </div>
          {pairingCode && (
            <div className="rounded-md border border-success/20 bg-success/5 p-3 md:col-span-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <p className="text-xs font-semibold">Pairing code</p>
              </div>
              <p className="mt-2 font-mono text-2xl font-bold tracking-[0.25em]">{pairingCode}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">On the phone: WhatsApp → Linked devices → Link a device → Link with phone number, then enter this code. Keep this Urban Castle page open until it shows paired.</p>
            </div>
          )}
        </div>
      )}

      {!paired && !isOwner && (
        <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">The Owner must pair the company WhatsApp account before staff can send real WhatsApp messages.</div>
      )}

      <div>
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <p className="text-xs font-semibold">WhatsApp provider journal</p>
          <span className="text-[10px] text-muted-foreground">{messages.length} recent</span>
        </div>
        {messages.length === 0 ? (
          <div className="px-4 py-5 text-center text-[11px] text-muted-foreground">No provider messages recorded yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {messages.map((message) => {
              const customerName = message.customerId ? customerNames.get(message.customerId) : undefined;
              return (
                <button
                  key={message.id}
                  type="button"
                  disabled={!message.customerId}
                  onClick={() => message.customerId && onOpenCustomer(message.customerId)}
                  className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-accent/30 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <span className={cn(
                    "mt-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase",
                    message.direction === "inbound" ? "bg-success/10 text-success" : "bg-primary/10 text-primary",
                  )}>{message.direction === "inbound" ? "IN" : "OUT"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{customerName || message.remoteJid}</p>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{message.body || message.subject || `[${message.messageType}]`}</p>
                  </div>
                  <span className="shrink-0 text-[9px] text-muted-foreground">{new Date(message.receivedAt || message.sentAt || message.createdAt).toLocaleString()}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
