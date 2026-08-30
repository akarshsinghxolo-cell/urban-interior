import type { Quotation } from "./types";
import { formatDate, formatINR } from "./format";

/**
 * WhatsApp-friendly plain-text quotation summary for quick customer sharing.
 * Pure string building — no DOM or network access — so it is fully unit-testable.
 * WhatsApp renders *bold* around words, so totals are emphasized that way.
 */
export function buildQuotationShareText(
    quotation: Pick<Quotation, "quotation_no" | "customer_name" | "title" | "status" | "revision_no" | "valid_until" | "subtotal" | "tax_amount" | "total_amount" | "scope_lines" | "items" | "payment_terms">,
    options?: { companyName?: string },
): string {
    const company = options?.companyName?.trim() || "Urban Castle";
    const items = (quotation.items && quotation.items.length > 0 ? quotation.items : quotation.scope_lines) || [];
    const lines: string[] = [];

    lines.push(`*${company} — Quotation ${quotation.quotation_no}*`);
    const who = quotation.customer_name?.trim();
    if (who) lines.push(who);
    lines.push("");

    if (items.length === 0) {
        lines.push("No line items added yet.");
    } else {
        items.forEach((item, index) => {
            const qty = item.quantity === 1 ? "" : ` ${item.quantity}${item.unit_name ? ` ${item.unit_name}` : ""} ×`;
            const parts = [`${index + 1}.`, `${item.title.trim() || "Item"}${qty ? ` —${qty}` : ""}`];
            lines.push(parts.join(" ").replace(/\s+/g, " "));
            lines.push(`   ${formatINR(item.amount)}`);
        });
    }

    lines.push("");
    lines.push(`Subtotal: ${formatINR(quotation.subtotal)}`);
    if (quotation.tax_amount > 0) lines.push(`GST: ${formatINR(quotation.tax_amount)}`);
    lines.push(`*Total: ${formatINR(quotation.total_amount)}*`);

    const milestones = quotation.payment_terms || [];
    if (milestones.length > 0) {
        lines.push("");
        lines.push("Payment plan:");
        milestones.forEach((m) => {
            lines.push(`• ${m.label} — ${m.percentage}%`);
        });
    }

    lines.push("");
    const valid = quotation.valid_until ? `Valid until ${formatDate(quotation.valid_until)}` : null;
    const rev = quotation.revision_no > 0 ? `Rev ${quotation.revision_no}` : null;
    const meta = [valid, rev].filter(Boolean).join(" · ");
    if (meta) lines.push(meta);
    if (quotation.status === "draft") lines.push("(Draft — figures indicative until sent)");

    return lines.join("\n");
}

/** WhatsApp click-to-chat link prefilled with the summary text. */
export function whatsappShareUrl(text: string): string {
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

type QuotationShareOutcome = "native-shared" | "whatsapp-opened" | "copied" | "failed";

function canUseClipboard(): boolean {
    return typeof navigator !== "undefined" && !!navigator.clipboard?.writeText;
}

async function copyText(text: string): Promise<boolean> {
    if (!canUseClipboard()) return false;
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

/**
 * Progressive-enhancement share flow: native share sheet on mobile →
 * WhatsApp click-to-chat in a new tab → clipboard copy fallback.
 * The caller renders the outcome toast based on the returned result.
 */
export async function shareQuotationText(text: string): Promise<QuotationShareOutcome> {
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav?.share) {
        try {
            await nav.share({ text });
            return "native-shared";
        } catch (error) {
            // User-cancelled share sheets should not fall through to WhatsApp.
            if (error instanceof Error && error.name === "AbortError") return "failed";
        }
    }
    if (typeof window !== "undefined") {
        const opened = window.open(whatsappShareUrl(text), "_blank", "noopener,noreferrer");
        if (opened) return "whatsapp-opened";
    }
    const copied = await copyText(text);
    return copied ? "copied" : "failed";
}
