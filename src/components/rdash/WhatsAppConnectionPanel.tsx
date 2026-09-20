"use client";

import Image from "next/image";
import * as React from "react";
import { CheckCircle2, Link2, Loader2, MessageCircle, RefreshCw, Unlink, WifiOff } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  const [qrImage, setQrImage] = React.useState("");
  const [pairingActive, setPairingActive] = React.useState(false);
  const [busy, setBusy] = React.useState<"pair" | "disconnect" | "refresh" | null>(null);
  const pairingSourceRef = React.useRef<EventSource | null>(null);

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

  const pair = () => {
    if (busy || pairingActive) return;
    pairingSourceRef.current?.close();
    setBusy("pair");
    setQrImage("");
    setPairingActive(true);

    const source = new EventSource("/api/whatsapp/pair");
    pairingSourceRef.current = source;

    const stop = () => {
      source.close();
      if (pairingSourceRef.current === source) pairingSourceRef.current = null;
      setPairingActive(false);
      setBusy(null);
    };

    source.addEventListener("qr", (event) => {
      const payload = JSON.parse((event as MessageEvent).data || "{}") as { image?: string };
      if (payload.image) {
        setQrImage(payload.image);
        setBusy(null);
      }
    });

    source.addEventListener("paired", () => {
      setQrImage("");
      stop();
      toast.success("WhatsApp linked successfully.");
      void refresh(true);
    });

    const handleFailure = (event: Event) => {
      let message = "WhatsApp QR pairing session ended. Generate a fresh QR code and try again.";
      if ("data" in event) {
        try {
          const payload = JSON.parse((event as MessageEvent).data || "{}") as { error?: string };
          if (payload.error) message = payload.error;
        } catch {
          // Keep the safe fallback message.
        }
      }
      stop();
      toast.error(message);
      void refresh(true);
    };

    source.addEventListener("failed", handleFailure);
    source.addEventListener("expired", handleFailure);
    source.onerror = () => {
      stop();
      toast.error("Could not keep the WhatsApp QR pairing session open.");
    };
  };

  const disconnect = async () => {
    if (busy) return;
    setBusy("disconnect");
    try {
      const response = await fetch("/api/whatsapp/disconnect", { method: "POST" });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not disconnect WhatsApp.");
      pairingSourceRef.current?.close();
      pairingSourceRef.current = null;
      setQrImage("");
      setPairingActive(false);
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
            <p className="text-xs font-semibold">Link Urban Castle as a WhatsApp device</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              On the primary phone open WhatsApp → Linked devices → Link a device, then scan the QR code shown here.
            </p>
          </div>
          <div className="flex items-start md:items-center">
            <Button type="button" size="sm" className="h-9" onClick={pair} disabled={busy !== null || pairingActive}>
              {busy === "pair" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1 h-3.5 w-3.5" />}
              {pairingActive ? "Waiting for scan…" : "Generate QR"}
            </Button>
          </div>
          {qrImage && (
            <div className="rounded-md border border-success/20 bg-success/5 p-4 md:col-span-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <p className="text-xs font-semibold">Scan this QR code with the primary WhatsApp phone</p>
              </div>
              <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
                  <Image
                    src={qrImage}
                    alt="WhatsApp linked-device QR code"
                    width={320}
                    height={320}
                    unoptimized
                    className="h-64 w-64 sm:h-72 sm:w-72"
                  />
                </div>
                <div className="max-w-sm text-[11px] leading-relaxed text-muted-foreground">
                  <p>1. Open WhatsApp on the phone that owns the company account.</p>
                  <p className="mt-1">2. Open Linked devices → Link a device.</p>
                  <p className="mt-1">3. Point the phone camera at this QR code.</p>
                  <p className="mt-2 font-medium text-foreground">Keep this page open. If WhatsApp rotates the QR code, Urban Castle updates it automatically.</p>
                </div>
              </div>
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
