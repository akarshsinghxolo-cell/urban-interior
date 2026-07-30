"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { useRDashStore } from "@/lib/rdash/store";
import { enqueueWorkflowFiles } from "@/lib/uploads/workflow-upload";
import type { Customer, Site } from "@/lib/rdash/types";
import { findCustomerIdentityMatches, findSameNameCustomers, normalizeCustomerName, } from "@/lib/rdash/customer-identity";
import { notifyCreated } from "@/lib/rdash/notify";
import { parseCoordinatePair } from "@/lib/rdash/coordinates";
import { MetricCard, EmptyState } from "../primitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText, CheckCircle2, AlertTriangle, UserPlus, Download, Copy, X, Building2, ShieldAlert, } from "lucide-react";
import { toast } from "sonner";
type ImportDisposition = "new_customer" | "existing_customer_add_site" | "possible_duplicate" | "invalid" | "no_change";
interface ParsedRow {
    rowIndex: number;
    data: Record<string, string>;
    errors: string[];
    isValid: boolean;
    disposition: ImportDisposition;
    matchedCustomer?: Pick<Customer, "id" | "name">;
}
const REQUIRED_FIELDS = ["name"];
const OPTIONAL_FIELDS = [
    "phone",
    "whatsapp",
    "alternate_phone",
    "email",
    "source",
    "site_name",
    "property_type",
    "building_name",
    "address",
    "locality",
    "city",
    "gps_coordinates",
];
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];
const SAMPLE_CSV = `name,phone,whatsapp,alternate_phone,email,source,site_name,property_type,building_name,address,locality,city,gps_coordinates\nJohn Doe,+91 98765 43210,+91 98765 43210,,john@example.com,Referral,John Residence,apartment,Sunrise Tower,12 Main Road,Indiranagar,Bengaluru,"12.9716, 77.5946"`;
const SITE_TYPES = new Set<Site["site_type"]>(["apartment", "office", "villa", "shop", "showroom", "other"]);
function parseCsvRecords(text: string) {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
        const character = text[index]!;
        const next = text[index + 1];
        if (character === '"') {
            if (quoted && next === '"') {
                cell += '"';
                index += 1;
            }
            else {
                quoted = !quoted;
            }
        }
        else if (character === "," && !quoted) {
            row.push(cell.trim());
            cell = "";
        }
        else if ((character === "\n" || character === "\r") && !quoted) {
            if (character === "\r" && next === "\n")
                index += 1;
            row.push(cell.trim());
            if (row.some((value) => value.trim()))
                rows.push(row);
            row = [];
            cell = "";
        }
        else {
            cell += character;
        }
    }
    row.push(cell.trim());
    if (row.some((value) => value.trim()))
        rows.push(row);
    return { rows, unterminatedQuote: quoted };
}
function hasSiteData(data: Record<string, string>) {
    return Boolean(data.site_name ||
        data.building_name ||
        data.address ||
        data.locality ||
        data.city ||
        data.property_type ||
        data.gps_coordinates);
}
function sameSiteExists(db: ReturnType<typeof useRDashStore.getState>["db"], customerId: string, siteName: string) {
    const expected = normalizeCustomerName(siteName);
    return Boolean(expected && db.sites.some((site) => site.customer_id === customerId && normalizeCustomerName(site.name) === expected));
}
function dispositionLabel(disposition: ImportDisposition) {
    if (disposition === "new_customer")
        return "New customer";
    if (disposition === "existing_customer_add_site")
        return "Existing customer — add Site";
    if (disposition === "possible_duplicate")
        return "Possible duplicate — review";
    if (disposition === "no_change")
        return "No change";
    return "Invalid";
}
function dispositionClass(disposition: ImportDisposition) {
    if (disposition === "new_customer")
        return "bg-success/10 text-success";
    if (disposition === "existing_customer_add_site")
        return "bg-primary/10 text-primary";
    if (disposition === "possible_duplicate")
        return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
    return "bg-destructive/10 text-destructive";
}
export function DataImportModule() {
    const db = useRDashStore((state) => state.db);
    const saveCustomerWithSites = useRDashStore((state) => state.saveCustomerWithSites);
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [csvText, setCsvText] = React.useState("");
    const [parsedRows, setParsedRows] = React.useState<ParsedRow[]>([]);
    const [hasParsed, setHasParsed] = React.useState(false);
    const [uploadingCsv, setUploadingCsv] = React.useState(false);
    const [sourceCsvFileAssetId, setSourceCsvFileAssetId] = React.useState<string | null>(null);
    const parseCsv = React.useCallback((text: string): ParsedRow[] => {
        const parsed = parseCsvRecords(text.trim());
        if (parsed.unterminatedQuote || parsed.rows.length < 2)
            return [];
        const headers = parsed.rows[0]!.map((header) => header.trim().toLowerCase());
        const virtualCustomers: Customer[] = [];
        const rows: ParsedRow[] = [];
        for (let index = 1; index < parsed.rows.length; index += 1) {
            const cells = parsed.rows[index]!;
            const data: Record<string, string> = {};
            headers.forEach((header, cellIndex) => {
                data[header] = cells[cellIndex] || "";
            });
            const errors: string[] = [];
            if (!data.name?.trim())
                errors.push("name is required");
            if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()))
                errors.push("invalid email");
            if (data.gps_coordinates && !parseCoordinatePair(data.gps_coordinates))
                errors.push("invalid gps_coordinates; use latitude, longitude");
            if (data.property_type && !SITE_TYPES.has(data.property_type as Site["site_type"]))
                errors.push("invalid property_type");
            const candidate = {
                name: data.name,
                phone: data.phone,
                whatsapp: data.whatsapp || data.phone,
                alternate_phone: data.alternate_phone,
                email: data.email,
            };
            const existingMatches = findCustomerIdentityMatches(db.customers, candidate);
            const batchMatches = findCustomerIdentityMatches(virtualCustomers, candidate);
            const sameNameMatches = findSameNameCustomers(db.customers, candidate);
            let disposition: ImportDisposition = errors.length > 0 ? "invalid" : "new_customer";
            let matchedCustomer: Pick<Customer, "id" | "name"> | undefined;
            if (errors.length === 0 && batchMatches.length > 0) {
                disposition = "possible_duplicate";
                errors.push(`matches CSV row ${batchMatches[0]!.customer.id.replace("import-row-", "")} by contact identity`);
            }
            else if (errors.length === 0 && existingMatches.length > 1) {
                disposition = "possible_duplicate";
                errors.push("contact identity matches multiple existing customers; review before importing");
            }
            else if (errors.length === 0 && existingMatches.length === 1) {
                matchedCustomer = existingMatches[0]!.customer;
                const incomingSiteName = data.site_name || `${data.name} Site`;
                if (!hasSiteData(data)) {
                    disposition = "no_change";
                    errors.push(`existing customer ${matchedCustomer.name} found; add Site data or update the customer from Customer Desk`);
                }
                else if (sameSiteExists(db, matchedCustomer.id, incomingSiteName)) {
                    disposition = "no_change";
                    errors.push(`Site "${incomingSiteName}" already exists for ${matchedCustomer.name}`);
                }
                else {
                    disposition = "existing_customer_add_site";
                }
            }
            else if (errors.length === 0 && sameNameMatches.length > 0) {
                disposition = "possible_duplicate";
                errors.push(`same-name customer found: ${sameNameMatches.map((customer) => customer.name).join(", ")}; review before importing`);
            }
            const isValid = errors.length === 0 && (disposition === "new_customer" || disposition === "existing_customer_add_site");
            rows.push({ rowIndex: index + 1, data, errors, isValid, disposition, matchedCustomer });
            if (disposition === "new_customer" && errors.length === 0) {
                virtualCustomers.push({
                    id: `import-row-${index + 1}`,
                    name: data.name,
                    phone: data.phone || "",
                    whatsapp: data.whatsapp || data.phone || "",
                    alternate_phone: data.alternate_phone || undefined,
                    email: data.email || undefined,
                    customer_segments: ["service_customer"],
                    status: "active",
                    created_at: "",
                    updated_at: "",
                });
            }
        }
        return rows;
    }, [db]);
    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file)
            return;
        try {
            setUploadingCsv(true);
            const queued = await enqueueWorkflowFiles({
                sourceFlow: "customer_csv_import",
                sourceLabel: "Customer CSV import",
                targetEntityType: "general",
                targetEntityId: "customer-import",
                targetLabel: "Customer import source",
                purpose: "import_source",
                kind: "document",
                role: "document",
                caption: "Customer CSV import source",
                files: [file],
            });
            const text = await file.text();
            setSourceCsvFileAssetId(queued.files[0].attachmentId);
            setCsvText(text);
            setHasParsed(false);
            toast.success(`Loaded ${file.name}; Drive upload continues in Background Activity`);
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "CSV could not be queued. The import file was not retained.");
        }
        finally {
            setUploadingCsv(false);
        }
    };
    const handleParse = () => {
        const rows = parseCsv(csvText);
        setParsedRows(rows);
        setHasParsed(true);
        if (rows.length === 0) {
            toast.error("No rows found. Check that the CSV has a header row and balanced quotes.");
            return;
        }
        const ready = rows.filter((row) => row.isValid).length;
        const review = rows.filter((row) => row.disposition === "possible_duplicate").length;
        toast.success(`Parsed ${rows.length} rows · ${ready} ready · ${review} require duplicate review`);
    };
    const handleImport = () => {
        const readyRows = parsedRows.filter((row) => row.isValid);
        if (readyRows.length === 0) {
            toast.error("No rows are ready. Resolve duplicate and validation warnings before importing.");
            return;
        }
        const created: Array<{
            customerId: string;
            name: string;
        }> = [];
        const sitesAdded: Array<{
            customerId: string;
            name: string;
            siteName: string;
        }> = [];
        try {
            for (const row of readyRows) {
                const coordinates = parseCoordinatePair(row.data.gps_coordinates || "");
                const includesSite = hasSiteData(row.data);
                const firstSite: Partial<Site> = {
                    name: row.data.site_name || `${row.data.name} Site`,
                    site_type: SITE_TYPES.has(row.data.property_type as Site["site_type"]) ? row.data.property_type as Site["site_type"] : "other",
                    stage: "enquiry",
                    building_name: row.data.building_name || undefined,
                    address: row.data.address || undefined,
                    locality: row.data.locality || undefined,
                    city: row.data.city || undefined,
                    latitude: coordinates?.latitude,
                    longitude: coordinates?.longitude,
                };
                if (row.disposition === "existing_customer_add_site" && row.matchedCustomer) {
                    const existingCustomer = db.customers.find((customer) => customer.id === row.matchedCustomer!.id);
                    if (!existingCustomer) throw new Error("Matched customer no longer exists.");
                    saveCustomerWithSites({
                        customerId: existingCustomer.id,
                        customer: { ...existingCustomer },
                        sites: [{ ...firstSite, id: `site-import-${row.rowIndex}-${Date.now().toString(36)}` }],
                    });
                    sitesAdded.push({ customerId: row.matchedCustomer.id, name: row.matchedCustomer.name, siteName: firstSite.name || "Site" });
                }
                else if (row.disposition === "new_customer") {
                    const result = saveCustomerWithSites({
                        customer: {
                            name: row.data.name,
                            phone: row.data.phone || "",
                            whatsapp: row.data.whatsapp || row.data.phone || "",
                            alternate_phone: row.data.alternate_phone || undefined,
                            email: row.data.email || undefined,
                            source_partner_name: row.data.source || undefined,
                            status: "active",
                            customer_segments: ["service_customer"],
                        },
                        sites: includesSite ? [firstSite] : [],
                    });
                    created.push({ customerId: result.customerId, name: row.data.name });
                }
            }
        }
        catch (error) {
            toast.error(error instanceof Error ? error.message : "Import stopped. No further rows were processed.");
            return;
        }
        created.forEach((entry) => notifyCreated("customer", entry.customerId, entry.name, "Imported customer with first Site"));
        sitesAdded.forEach((entry) => notifyCreated("customer", entry.customerId, entry.siteName, `Added Site to existing customer · ${entry.name}`));
        toast.success(`${created.length} new customer${created.length === 1 ? "" : "s"} created · ${sitesAdded.length} Site${sitesAdded.length === 1 ? "" : "s"} added to existing customers`);
        setCsvText("");
        setParsedRows([]);
        setHasParsed(false);
    };
    const handleDownloadTemplate = () => {
        const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "rdash-customer-import-template.csv";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        toast.success("Template downloaded");
    };
    const handleCopyTemplate = () => {
        navigator.clipboard.writeText(SAMPLE_CSV).then(() => toast.success("Template copied to clipboard"), () => toast.error("Clipboard unavailable — copy the template manually"));
    };
    const readyCount = parsedRows.filter((row) => row.isValid).length;
    const reviewCount = parsedRows.filter((row) => row.disposition === "possible_duplicate").length;
    const issueCount = parsedRows.filter((row) => !row.isValid).length;
    return (<div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Upload className="h-5 w-5"/></span>
        <div>
          <h2 className="text-lg font-bold tracking-tight">Data Import</h2>
          <p className="text-xs text-muted-foreground">Bulk-import customers safely. Uploaded CSV source files are retained in managed Google Drive for import traceability.</p>
        </div>
      </div>
      <input ref={fileInputRef} type="file" accept="text/csv,.csv" onChange={handleFileUpload} className="hidden" aria-label="Upload customer CSV"/>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Existing customers" value={db.customers.filter((customer) => customer.customer_segments.includes("service_customer")).length} tone="primary" icon={<UserPlus className="h-4 w-4"/>}/>
        <MetricCard label="Ready" value={hasParsed ? readyCount : "—"} tone="success" icon={<CheckCircle2 className="h-4 w-4"/>}/>
        <MetricCard label="Duplicate review" value={hasParsed ? reviewCount : "—"} tone={reviewCount > 0 ? "warning" : "default"} icon={<ShieldAlert className="h-4 w-4"/>}/>
        <MetricCard label="Blocked rows" value={hasParsed ? issueCount : "—"} tone={issueCount > 0 ? "destructive" : "default"} icon={<AlertTriangle className="h-4 w-4"/>}/>
      </div>
      <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-primary"/><h3 className="text-sm font-semibold">CSV format</h3></div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={handleDownloadTemplate}><Download className="h-3.5 w-3.5"/> Template</Button>
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={handleCopyTemplate}><Copy className="h-3.5 w-3.5"/> Copy</Button>
          </div>
        </div>
        <p className="mb-2 text-xs text-muted-foreground"><span className="font-mono font-semibold text-foreground">name</span> is required. Contact columns are matched after phone/email normalization. An exact contact match adds the supplied Site to the existing customer. Same-name-only rows are held for review.</p>
        <pre className="overflow-x-auto rounded-md bg-muted/40 p-2.5 font-mono text-[11px] text-muted-foreground rd-scroll">{SAMPLE_CSV}</pre>
      </div>
      <div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2"><Upload className="h-4 w-4 text-primary"/><h3 className="text-sm font-semibold">Import data</h3></div>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploadingCsv}><Upload className="h-3.5 w-3.5"/> {uploadingCsv ? "Saving to Drive…" : "Upload CSV"}</Button>
        </div>
        <Textarea value={csvText} onChange={(event) => { setCsvText(event.target.value); setHasParsed(false); }} placeholder="Paste CSV text here, or upload a CSV file…" className="mb-2 min-h-[160px] font-mono text-xs"/>
        {sourceCsvFileAssetId && <p className="mb-3 text-[10px] text-success">✓ Source CSV queued for managed Google Drive retention</p>}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleParse} disabled={!csvText.trim()}><FileText className="mr-1.5 h-3.5 w-3.5"/> Parse & Preview</Button>
          {hasParsed && readyCount > 0 && <Button size="sm" onClick={handleImport} className="bg-success text-success-foreground hover:bg-success/90"><UserPlus className="mr-1.5 h-3.5 w-3.5"/> Apply {readyCount} ready row{readyCount === 1 ? "" : "s"}</Button>}
          {hasParsed && <Button size="sm" variant="ghost" onClick={() => { setCsvText(""); setParsedRows([]); setHasParsed(false); }}><X className="mr-1 h-3.5 w-3.5"/> Clear</Button>}
        </div>
      </div>
      {hasParsed && parsedRows.length > 0 && (<div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Preview ({parsedRows.length} rows)</h3><span className="text-[11px] text-muted-foreground">Only ready rows will be applied.</span></div>
          <div className="max-h-[28rem] overflow-auto rd-scroll">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10"><tr className="bg-muted/60"><th className="border-b border-border px-2 py-1.5 text-left font-semibold text-muted-foreground">#</th><th className="border-b border-border px-2 py-1.5 text-left font-semibold text-muted-foreground">name</th><th className="border-b border-border px-2 py-1.5 text-left font-semibold text-muted-foreground">contact</th><th className="border-b border-border px-2 py-1.5 text-left font-semibold text-muted-foreground">first Site</th><th className="border-b border-border px-2 py-1.5 text-left font-semibold text-muted-foreground">result</th></tr></thead>
              <tbody>
                {parsedRows.map((row) => <tr key={row.rowIndex} className={cn(row.isValid ? "bg-card" : "bg-destructive/[0.03]")}><td className="border-b border-border px-2 py-1.5 text-muted-foreground">{row.rowIndex}</td><td className="border-b border-border px-2 py-1.5 font-medium">{row.data.name || <span className="text-destructive">—</span>}</td><td className="border-b border-border px-2 py-1.5 text-muted-foreground">{row.data.phone || row.data.whatsapp || row.data.email || "—"}</td><td className="border-b border-border px-2 py-1.5 text-muted-foreground">{row.data.site_name || [row.data.locality, row.data.city].filter(Boolean).join(", ") || "—"}</td><td className="border-b border-border px-2 py-1.5"><span className={cn("inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", dispositionClass(row.disposition))}>{row.disposition === "existing_customer_add_site" ? <Building2 className="h-2.5 w-2.5"/> : row.isValid ? <CheckCircle2 className="h-2.5 w-2.5"/> : <AlertTriangle className="h-2.5 w-2.5"/>}{dispositionLabel(row.disposition)}</span>{row.matchedCustomer && <p className="mt-1 text-[10px] text-muted-foreground">{row.matchedCustomer.name}</p>}{row.errors[0] && <p className="mt-1 max-w-xs text-[10px] text-destructive">{row.errors[0]}</p>}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>)}
      {hasParsed && parsedRows.length === 0 && <EmptyState title="No rows to preview" description={`The CSV needs a header row + at least 1 data row. Allowed fields: ${ALL_FIELDS.join(", ")}.`} icon={<AlertTriangle className="h-8 w-8"/>}/>}
    </div>);
}
