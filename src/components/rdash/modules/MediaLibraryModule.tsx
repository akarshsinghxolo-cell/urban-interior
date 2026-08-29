"use client";

import * as React from "react";
import { useRDashStore } from "@/lib/rdash/store";
import type {
  CatalogueAsset,
  CatalogueArticleVendorLink,
  FileAsset,
  PinterestBoard,
  ReferenceMediaAsset,
  StorageAccount,
  StorageFolderInstance,
  StorageFolderTemplate,
} from "@/lib/rdash/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { accountIsAtSwitchThreshold, accountUsagePercent, selectWriteStorageAccount } from "@/lib/rdash/storage";
import { FilePreview } from "../FilePreview";
import { assetPreview } from "@/lib/rdash/file-attachments";
import {
  AlertTriangle,
  Archive,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FolderCog,
  HardDrive,
  Image as ImageIcon,
  Link2,
  Pin,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from "lucide-react";

type View = "catalogues" | "pinterest" | "reference" | "operations";
type SimpleOption = { id: string; name: string };
type AccessPolicy = "internal" | "customer" | "vendor" | "contractor";

const now = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function isHttpUrl(value?: string) {
  return /^https:\/\//.test(value || "");
}

function formatBytes(value?: number) {
  const bytes = Number(value || 0);
  if (!bytes) return "Quota pending";
  const gb = bytes / 1024 ** 3;
  return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
}

function ExternalLinkButton({ href, children }: { href?: string; children: React.ReactNode }) {
  if (!isHttpUrl(href)) return <span className="text-[11px] text-muted-foreground">No link</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
      <ExternalLink className="h-3 w-3" />
      {children}
    </a>
  );
}

function accountState(account: StorageAccount, writeDestination?: StorageAccount) {
  if (writeDestination?.id === account.id) return { label: "Active upload", tone: "primary" as const };
  if (account.status === "disabled") return { label: "Disabled", tone: "muted" as const };
  if (account.status === "paused") return { label: "Standby", tone: "muted" as const };
  if (account.status === "reconnect_required") return { label: "Reconnect needed", tone: "danger" as const };
  if (accountIsAtSwitchThreshold(account)) return { label: "Used archive", tone: "warning" as const };
  if (account.write_enabled === false) return { label: "Standby", tone: "muted" as const };
  return { label: "Connected", tone: "success" as const };
}

function StatusPill({ account, writeDestination }: { account: StorageAccount; writeDestination?: StorageAccount }) {
  const state = accountState(account, writeDestination);
  const className = state.tone === "primary"
    ? "rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
    : state.tone === "success"
      ? "rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success"
      : state.tone === "warning"
        ? "rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning"
        : state.tone === "danger"
          ? "rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive"
          : "rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground";
  return <span className={className}>{state.label}</span>;
}

function Capacity({ account }: { account: StorageAccount }) {
  const used = Number(account.quota_used_bytes || 0);
  const limit = Number(account.quota_limit_bytes || 0);
  const percent = accountUsagePercent(account);
  const threshold = Number(account.switch_threshold_percent || 85);
  const nearLimit = accountIsAtSwitchThreshold(account);

  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{limit > 0 ? `${formatBytes(used)} / ${formatBytes(limit)}` : "Quota pending refresh"}</span>
        <span className={nearLimit ? "font-semibold text-warning" : ""}>{limit > 0 ? `${percent}% used` : `switch at ${threshold}%`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={nearLimit ? "h-full rounded-full bg-warning" : "h-full rounded-full bg-primary"} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <p className="text-[10px] text-muted-foreground">Auto-switch at {threshold}%</p>
    </div>
  );
}

export function MediaLibraryModule({ initialView = "catalogues" }: { initialView?: string }) {
  const db = useRDashStore((state) => state.db);
  const mutateMaster = useRDashStore((state) => state.mutateMaster);
  const openDetail = useRDashStore((state) => state.openDetail);
  const setActiveModule = useRDashStore((state) => state.setActiveModule);
  const currentRole = useRDashStore((state) => state.authUser?.role || "Owner");
  const master = db.master;
  const accounts = master.storageAccounts || [];
  const templates = master.storageFolderTemplates || [];
  const folderInstances = master.storageFolderInstances || [];
  const fileAssets = master.fileAssets || [];
  const catalogues = master.catalogues || [];
  const catalogueLinks = master.catalogueArticleVendorLinks || [];
  const pinterestBoards = master.pinterestBoards || [];
  const referenceMedia = master.referenceMedia || [];
  const [view, setView] = React.useState<View>((initialView as View) || "catalogues");

  React.useEffect(() => {
    if (["catalogues", "pinterest", "reference", "operations"].includes(initialView)) setView(initialView as View);
  }, [initialView]);

  const activeFiles = fileAssets.filter((file) => file.status === "active");
  const activeCatalogueLinks = catalogueLinks.filter((link) => link.status === "active");
  const sharedLinkCount = activeCatalogueLinks.length - new Set(activeCatalogueLinks.map((link) => `${link.catalogue_id}:${link.article_id}`)).size;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><FolderCog className="h-5 w-5" /></span>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Drive, Catalogues & Reference Media</h2>
            <p className="text-xs text-muted-foreground">One shared Drive-file registry; catalogue applicability and customer-share media are linked records, never copied files.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-success" /> Drive links stay usable after auto-switch</div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Drive files" value={activeFiles.length} icon={<UploadCloud className="h-4 w-4" />} onClick={() => setActiveModule("driveManager")} />
        <Metric label="Catalogues" value={catalogues.filter((item) => item.status === "active").length} icon={<BookOpen className="h-4 w-4" />} onClick={() => setView("catalogues")} active={view === "catalogues"} />
        <Metric label="Shared assignments" value={sharedLinkCount} icon={<Link2 className="h-4 w-4" />} onClick={() => setView("catalogues")} />
        <Metric label="Pinterest boards" value={pinterestBoards.filter((item) => item.status === "active").length} icon={<Pin className="h-4 w-4" />} onClick={() => setView("pinterest")} active={view === "pinterest"} />
        <Metric label="Operational links" value={(db.entityFileAttachments || []).length + (db.entityReferenceAssignments || []).filter((item) => item.status === "active").length} icon={<Link2 className="h-4 w-4" />} onClick={() => setView("operations")} active={view === "operations"} />
      </div>

      <nav className="flex flex-wrap gap-1 rounded-[var(--panel-radius)] border border-border bg-card p-1.5 shadow-card" aria-label="Drive media library views">
        {([
          ["catalogues", "Catalogue links", BookOpen],
          ["pinterest", "Pinterest boards", Pin],
          ["reference", "Reference media", ImageIcon],
          ["operations", "Operational audit", Link2],
        ] as Array<[View, string, React.ComponentType<{ className?: string }>]>).map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => setView(id)} className={view === id ? "inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm" : "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"}>
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </nav>

      {view === "catalogues" && <CatalogueLinksView catalogues={catalogues} links={catalogueLinks} files={fileAssets} articles={master.articles} vendors={master.vendors} onMutate={mutateMaster} onOpenFile={(fileId) => openDetail("media" as any, fileId)} />}
      {view === "pinterest" && <PinterestBoardsView boards={pinterestBoards} articles={master.articles} categories={master.workCategories} subcategories={master.workSubcategories} onMutate={mutateMaster} />}
      {view === "reference" && <ReferenceMediaView media={referenceMedia} files={fileAssets} articles={master.articles} categories={master.workCategories} subcategories={master.workSubcategories} onMutate={mutateMaster} onOpenFile={(fileId) => openDetail("media" as any, fileId)} />}
      {view === "operations" && <OperationalLinksAudit db={db} onOpenFile={(fileId) => openDetail("media" as any, fileId)} />}
    </div>
  );
}

function Metric({ label, value, icon, onClick, active }: { label: string; value: number | string; icon: React.ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={active ? "rounded-[var(--panel-radius)] border border-primary/40 bg-primary/[0.04] p-3 text-left shadow-card" : "rounded-[var(--panel-radius)] border border-border bg-card p-3 text-left shadow-card hover:border-primary/30"}>
      <div className="flex items-center justify-between text-primary"><span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>{icon}</div>
      <p className="mt-2 text-xl font-bold">{value}</p>
    </button>
  );
}

function CatalogueLinksView({ catalogues, links, files, articles, vendors, onMutate, onOpenFile }: {
  catalogues: CatalogueAsset[];
  links: CatalogueArticleVendorLink[];
  files: FileAsset[];
  articles: SimpleOption[];
  vendors: SimpleOption[];
  onMutate: (updater: (master: any) => any) => void;
  onOpenFile: (fileId: string) => void;
}) {
  const [draft, setDraft] = React.useState({ catalogueId: "", title: "", driveAssetId: "", url: "", type: "product_catalog", customerSendable: true, tags: "", articleId: articles[0]?.id || "", vendorId: "", notes: "" });
  React.useEffect(() => { if (!draft.articleId && articles[0]?.id) setDraft((current) => ({ ...current, articleId: articles[0].id })); }, [articles, draft.articleId]);
  const activeCatalogues = catalogues.filter((item) => item.status === "active");
  const activeLinks = links.filter((item) => item.status === "active");
  const saveCatalogueLink = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.articleId) return toast.error("Choose an article");
    const timestamp = now();
    const creatingNew = !draft.catalogueId;
    if (creatingNew && !draft.title.trim()) return toast.error("Catalogue title is required");
    if (creatingNew && !draft.driveAssetId && !isHttpUrl(draft.url)) return toast.error("Link a Drive file or provide a catalogue URL");
    const catalogueId = draft.catalogueId || makeId("catalogue");
    const exists = activeLinks.some((item) => item.catalogue_id === catalogueId && item.article_id === draft.articleId && (item.vendor_id || "") === draft.vendorId);
    if (exists) return toast.error("That exact catalogue/article/vendor link already exists");
    const newCatalogue: CatalogueAsset | null = creatingNew ? { id: catalogueId, title: draft.title.trim(), drive_asset_id: draft.driveAssetId || undefined, catalog_url: draft.url.trim() || undefined, catalog_type: draft.type as CatalogueAsset["catalog_type"], sendable_to_customer: draft.customerSendable, tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean), status: "active", created_at: timestamp, updated_at: timestamp } : null;
    const newLink: CatalogueArticleVendorLink = { id: makeId("catalogue-link"), catalogue_id: catalogueId, article_id: draft.articleId, vendor_id: draft.vendorId || undefined, notes: draft.notes.trim() || undefined, status: "active", created_at: timestamp, updated_at: timestamp };
    onMutate((master) => ({ ...master, catalogues: newCatalogue ? [...(master.catalogues || []), newCatalogue] : (master.catalogues || []), catalogueArticleVendorLinks: [...(master.catalogueArticleVendorLinks || []), newLink] }));
    setDraft((current) => ({ ...current, catalogueId: "", title: "", driveAssetId: "", url: "", tags: "", vendorId: "", notes: "" }));
    toast.success(creatingNew ? "Catalogue saved and linked" : "Catalogue linked to article/vendor");
  };
  const archiveLink = (id: string) => onMutate((master) => ({ ...master, catalogueArticleVendorLinks: (master.catalogueArticleVendorLinks || []).map((item: CatalogueArticleVendorLink) => item.id === id ? { ...item, status: "archived", updated_at: now() } : item) }));
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-[var(--panel-radius)] border border-border bg-card shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3"><div className="min-w-0"><h3 className="text-sm font-bold">Catalogue applicability</h3><p className="text-[11px] text-muted-foreground">Each row assigns one shared catalogue asset to an article and optional vendor scope.</p></div><span className="shrink-0 text-xs text-muted-foreground">{activeLinks.length} active links</span></div>
        <div className="divide-y divide-border">
          {activeLinks.map((item) => { const asset = catalogues.find((catalogue) => catalogue.id === item.catalogue_id); const article = articles.find((entry) => entry.id === item.article_id); const vendor = vendors.find((entry) => entry.id === item.vendor_id); const driveFile = asset?.drive_asset_id ? files.find((entry) => entry.id === asset.drive_asset_id) : undefined; return <div key={item.id} className="grid gap-2 px-4 py-3 md:grid-cols-[72px_minmax(160px,1.2fr)_minmax(160px,1fr)_minmax(150px,1fr)_auto]"><div>{driveFile ? <FilePreview file={assetPreview(driveFile)} compact controls className="h-16" /> : <div className="flex h-16 items-center justify-center rounded-md border border-border bg-muted/20 text-primary"><BookOpen className="h-5 w-5" /></div>}</div><div className="min-w-0"><p className="truncate text-sm font-medium">{asset?.title || "Missing catalogue"}</p><p className="text-[10px] text-muted-foreground">Click the thumbnail to preview</p></div><div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Article</p><p className="truncate text-xs font-medium">{article?.name || "Missing article"}</p></div><div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Vendor scope</p><p className="truncate text-xs font-medium">{vendor?.name || "Shared / any vendor"}</p>{item.notes ? <p className="mt-0.5 text-[10px] text-muted-foreground">{item.notes}</p> : null}</div><div className="flex items-center gap-1">{driveFile ? <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => onOpenFile(driveFile.id)}>Context</Button> : null}<Button size="icon" variant="ghost" aria-label="Archive catalogue link" onClick={() => archiveLink(item.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></div>; })}
          {!activeLinks.length ? <p className="p-6 text-center text-xs text-muted-foreground">No catalogue links yet.</p> : null}
        </div>
      </section>
      <aside className="grid content-start gap-4"><FormCard title="Add catalogue and link" icon={<Link2 className="h-3.5 w-3.5" />}><form onSubmit={saveCatalogueLink} className="grid gap-2"><Field label="Use existing catalogue"><NativeSelect value={draft.catalogueId} onChange={(event) => setDraft({ ...draft, catalogueId: event.target.value })}><option value="">Create a new catalogue asset</option>{activeCatalogues.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</NativeSelect></Field>{!draft.catalogueId ? <><Field label="Catalogue title"><Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Vendor product catalogue" /></Field><Field label="Existing Drive file"><NativeSelect value={draft.driveAssetId} onChange={(event) => setDraft({ ...draft, driveAssetId: event.target.value })}><option value="">No linked Drive file</option>{files.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.file_name}</option>)}</NativeSelect></Field><Field label="Direct URL (optional)"><Input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://..." /></Field><Field label="Catalogue type"><NativeSelect value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}>{["product_catalog", "technical_sheet", "price_list", "installation_guide", "other"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</NativeSelect></Field><Field label="Tags"><Input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder="plywood, kitchen" /></Field><label className="flex items-center gap-2 text-xs"><Checkbox checked={draft.customerSendable} onCheckedChange={(value) => setDraft({ ...draft, customerSendable: value === true })} />Customer-shareable</label></> : null}<Field label="Article"><NativeSelect value={draft.articleId} onChange={(event) => setDraft({ ...draft, articleId: event.target.value })}><option value="">Select article</option>{articles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></Field><Field label="Vendor scope"><NativeSelect value={draft.vendorId} onChange={(event) => setDraft({ ...draft, vendorId: event.target.value })}><option value="">Shared / any vendor</option>{vendors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></Field><Field label="Note"><Textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows={2} placeholder="Optional scope note" /></Field><Button size="sm" type="submit"><Link2 className="mr-1 h-3.5 w-3.5" />Save catalogue link</Button></form></FormCard></aside>
    </div>
  );
}

function PinterestBoardsView({ boards, articles, categories, subcategories, onMutate }: { boards: PinterestBoard[]; articles: SimpleOption[]; categories: SimpleOption[]; subcategories: SimpleOption[]; onMutate: (updater: (master: any) => any) => void }) {
  const [draft, setDraft] = React.useState({ title: "", url: "", categoryId: "", subcategoryId: "", articleId: "", tags: "", sendable: true });
  const create = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim() || !isHttpUrl(draft.url)) return toast.error("Enter a board title and valid Pinterest link");
    const timestamp = now();
    const row: PinterestBoard = { id: makeId("pinterest"), title: draft.title.trim(), board_url: draft.url.trim(), category_id: draft.categoryId || undefined, subcategory_id: draft.subcategoryId || undefined, article_id: draft.articleId || undefined, tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean), sendable_to_customer: draft.sendable, status: "active", sort_order: boards.length + 1, created_at: timestamp, updated_at: timestamp };
    onMutate((master) => ({ ...master, pinterestBoards: [...(master.pinterestBoards || []), row] }));
    setDraft({ title: "", url: "", categoryId: "", subcategoryId: "", articleId: "", tags: "", sendable: true });
    toast.success("Pinterest board added for reference sharing");
  };
  const archive = (id: string) => onMutate((master) => ({ ...master, pinterestBoards: (master.pinterestBoards || []).map((item: PinterestBoard) => item.id === id ? { ...item, status: "archived", updated_at: now() } : item) }));
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]"><section className="grid gap-3 md:grid-cols-2">{boards.filter((item) => item.status === "active").map((item) => <article key={item.id} className="flex min-h-40 flex-col rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><div className="flex items-start justify-between gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive"><Pin className="h-5 w-5" /></span><Button size="icon" variant="ghost" aria-label={`Archive ${item.title}`} onClick={() => archive(item.id)}><Archive className="h-4 w-4 text-muted-foreground" /></Button></div><div className="mt-4 min-w-0"><h3 className="truncate text-sm font-bold">{item.title}</h3><p className="mt-1 text-[11px] text-muted-foreground">{articles.find((article) => article.id === item.article_id)?.name || subcategories.find((sub) => sub.id === item.subcategory_id)?.name || categories.find((category) => category.id === item.category_id)?.name || "General inspiration"}</p></div><div className="mt-auto flex items-center justify-between pt-3"><span className={item.sendable_to_customer === false ? "rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground" : "rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success"}>{item.sendable_to_customer === false ? "Internal only" : "Customer-shareable"}</span><ExternalLinkButton href={item.board_url}>Open board</ExternalLinkButton></div></article>)}{!boards.some((item) => item.status === "active") ? <div className="rounded-[var(--panel-radius)] border border-dashed border-border p-8 text-center text-xs text-muted-foreground">No Pinterest boards saved yet.</div> : null}</section><aside><FormCard title="Add Pinterest board" icon={<Plus className="h-3.5 w-3.5" />}><form onSubmit={create} className="grid gap-2"><Field label="Board title"><Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Kitchen inspiration" /></Field><Field label="Pinterest URL"><Input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://www.pinterest.com/..." /></Field><Field label="Category"><NativeSelect value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}><option value="">General</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></Field><Field label="Submodule"><NativeSelect value={draft.subcategoryId} onChange={(event) => setDraft({ ...draft, subcategoryId: event.target.value })}><option value="">None</option>{subcategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></Field><Field label="Article"><NativeSelect value={draft.articleId} onChange={(event) => setDraft({ ...draft, articleId: event.target.value })}><option value="">None</option>{articles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></Field><Field label="Tags"><Input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder="wardrobe, finish" /></Field><label className="flex items-center gap-2 text-xs"><Checkbox checked={draft.sendable} onCheckedChange={(value) => setDraft({ ...draft, sendable: value === true })} />Customer-shareable</label><Button size="sm" type="submit"><Pin className="mr-1 h-3.5 w-3.5" />Save board</Button></form></FormCard></aside></div>;
}

function ReferenceMediaView({ media, files, articles, categories, subcategories, onMutate, onOpenFile }: { media: ReferenceMediaAsset[]; files: FileAsset[]; articles: SimpleOption[]; categories: SimpleOption[]; subcategories: SimpleOption[]; onMutate: (updater: (master: any) => any) => void; onOpenFile: (fileId: string) => void }) {
  const [draft, setDraft] = React.useState({ title: "", driveAssetId: "", url: "", categoryId: "", subcategoryId: "", articleId: "", tags: "", sendable: true });
  const create = (event: React.FormEvent) => { event.preventDefault(); if (!draft.title.trim() || (!draft.driveAssetId && !isHttpUrl(draft.url))) return toast.error("Enter title and a Drive file or media link"); const timestamp = now(); const row: ReferenceMediaAsset = { id: makeId("reference"), title: draft.title.trim(), drive_asset_id: draft.driveAssetId || undefined, media_url: draft.url.trim() || undefined, category_id: draft.categoryId || undefined, subcategory_id: draft.subcategoryId || undefined, article_id: draft.articleId || undefined, tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean), sendable_to_customer: draft.sendable, status: "active", sort_order: media.length + 1, created_at: timestamp, updated_at: timestamp }; onMutate((master) => ({ ...master, referenceMedia: [...(master.referenceMedia || []), row] })); setDraft({ title: "", driveAssetId: "", url: "", categoryId: "", subcategoryId: "", articleId: "", tags: "", sendable: true }); toast.success("Reference media added"); };
  const archive = (id: string) => onMutate((master) => ({ ...master, referenceMedia: (master.referenceMedia || []).map((item: ReferenceMediaAsset) => item.id === id ? { ...item, status: "archived", updated_at: now() } : item) }));
  const mediaUrl = (item: ReferenceMediaAsset) => files.find((file) => file.id === item.drive_asset_id)?.web_view_link || item.media_url;
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]"><section className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{media.filter((item) => item.status === "active").map((item) => { const file = files.find((entry) => entry.id === item.drive_asset_id); return <article key={item.id} className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card"><div className="h-32">{file ? <FilePreview file={assetPreview(file)} controls className="h-32 rounded-none border-x-0 border-t-0" /> : <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/10 via-muted to-primary/5 text-primary"><ImageIcon className="h-8 w-8" /></div>}</div><div className="p-3"><div className="flex items-start justify-between gap-2"><h3 className="line-clamp-2 text-sm font-bold">{item.title}</h3><Button size="icon" variant="ghost" aria-label={`Archive ${item.title}`} onClick={() => archive(item.id)}><Archive className="h-4 w-4 text-muted-foreground" /></Button></div><p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{articles.find((article) => article.id === item.article_id)?.name || subcategories.find((sub) => sub.id === item.subcategory_id)?.name || categories.find((category) => category.id === item.category_id)?.name || "General reference"}</p><div className="mt-3 flex items-center justify-between gap-2"><span className={item.sendable_to_customer === false ? "rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground" : "rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success"}>{item.sendable_to_customer === false ? "Internal only" : "Customer-shareable"}</span><div className="flex items-center gap-2">{file ? <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => onOpenFile(file.id)}>Context</Button> : <ExternalLinkButton href={mediaUrl(item)}>Open media</ExternalLinkButton>}</div></div></div></article>; })}{!media.some((item) => item.status === "active") ? <div className="rounded-[var(--panel-radius)] border border-dashed border-border p-8 text-center text-xs text-muted-foreground">No reference media saved yet.</div> : null}</section><aside><FormCard title="Add reference media" icon={<Plus className="h-3.5 w-3.5" />}><form onSubmit={create} className="grid gap-2"><Field label="Reference title"><Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Kitchen shutter reference" /></Field><Field label="Existing Drive file"><NativeSelect value={draft.driveAssetId} onChange={(event) => setDraft({ ...draft, driveAssetId: event.target.value })}><option value="">No linked Drive file</option>{files.filter((item) => item.status === "active" && (item.kind === "media" || item.kind === "document")).map((item) => <option key={item.id} value={item.id}>{item.file_name}</option>)}</NativeSelect></Field><Field label="Media URL (optional)"><Input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://drive.google.com/..." /></Field><Field label="Category"><NativeSelect value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}><option value="">General</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></Field><Field label="Submodule"><NativeSelect value={draft.subcategoryId} onChange={(event) => setDraft({ ...draft, subcategoryId: event.target.value })}><option value="">None</option>{subcategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></Field><Field label="Article"><NativeSelect value={draft.articleId} onChange={(event) => setDraft({ ...draft, articleId: event.target.value })}><option value="">None</option>{articles.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect></Field><Field label="Tags"><Input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder="design, kitchen" /></Field><label className="flex items-center gap-2 text-xs"><Checkbox checked={draft.sendable} onCheckedChange={(value) => setDraft({ ...draft, sendable: value === true })} />Customer-shareable</label><Button size="sm" type="submit"><ImageIcon className="mr-1 h-3.5 w-3.5" />Save media</Button></form></FormCard></aside></div>;
}

function FormCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold">{icon}{title}</h3>{children}</section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1"><span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>{children}</label>;
}

function NativeSelect({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20">{children}</select>;
}

function OperationalLinksAudit({ db, onOpenFile }: { db: any; onOpenFile: (fileId: string) => void }) {
  const attachments = db.entityFileAttachments || [];
  const assignments = (db.entityReferenceAssignments || []).filter((item: any) => item.status === "active");
  const filesById = new Map<string, FileAsset>((db.master.fileAssets || []).map((file: FileAsset) => [file.id, file]));
  const missingFiles = attachments.filter((link: any) => !filesById.has(link.file_asset_id));
  const byEntity = new Map<string, { files: number; references: number }>();
  attachments.forEach((link: any) => { const current = byEntity.get(link.entity_type) || { files: 0, references: 0 }; current.files += 1; byEntity.set(link.entity_type, current); });
  assignments.forEach((link: any) => { const current = byEntity.get(link.entity_type) || { files: 0, references: 0 }; current.references += 1; byEntity.set(link.entity_type, current); });
  const rows = Array.from(byEntity.entries()).sort((a, b) => (b[1].files + b[1].references) - (a[1].files + a[1].references));
  const reusedFiles = new Set(attachments.map((link: any) => link.file_asset_id)).size;
  const reusedAssignments = attachments.length - reusedFiles;
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]"><section className="overflow-hidden rounded-[var(--panel-radius)] border border-border bg-card shadow-card"><div className="border-b border-border px-4 py-3"><h3 className="text-sm font-bold">Operational link audit</h3><p className="mt-0.5 text-xs text-muted-foreground">Every row is a relationship to a shared Drive file, catalogue, Pinterest board, or reference asset—not a copied file.</p></div>{rows.length ? <div className="divide-y divide-border">{rows.map(([entityType, count]) => <div key={entityType} className="grid grid-cols-[1fr_100px_120px] gap-3 px-4 py-2.5 text-xs"><span className="font-semibold">{entityType.replaceAll("_", " ")}</span><span className="text-right text-muted-foreground">{count.files} Drive file{count.files === 1 ? "" : "s"}</span><span className="text-right text-muted-foreground">{count.references} reference{count.references === 1 ? "" : "s"}</span></div>)}</div> : <div className="p-8 text-center text-xs text-muted-foreground">No operational links created yet.</div>}{attachments.length ? <div className="border-t border-border"><div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Linked file rows</div>{attachments.map((link: any) => { const file = filesById.get(link.file_asset_id); return <div key={link.id} className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs"><div className="min-w-0"><p className="truncate font-semibold">{file?.file_name || link.file_asset_id}</p><p className="truncate text-[10px] text-muted-foreground">{link.entity_type.replaceAll("_", " ")} · {link.entity_label || link.entity_id}</p></div>{file ? <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => onOpenFile(file.id)}>Context</Button> : null}</div>; })}</div> : null}</section><aside className="space-y-3"><div className="rounded-[var(--panel-radius)] border border-border bg-card p-4 shadow-card"><p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" />File reuse</p><p className="mt-1 text-2xl font-bold">{reusedAssignments}</p><p className="mt-1 text-xs text-muted-foreground">additional entity links reuse an existing Drive file, so no catalogue or media duplicate was created.</p></div><div className={missingFiles.length ? "rounded-[var(--panel-radius)] border border-destructive/30 bg-destructive/[0.04] p-4" : "rounded-[var(--panel-radius)] border border-success/30 bg-success/[0.04] p-4"}><p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{missingFiles.length ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Referential integrity</p><p className={missingFiles.length ? "mt-1 text-lg font-bold text-destructive" : "mt-1 text-lg font-bold text-success"}>{missingFiles.length ? `${missingFiles.length} missing file link${missingFiles.length === 1 ? "" : "s"}` : "All Drive links resolve"}</p><p className="mt-1 text-xs text-muted-foreground">Detaching a file removes only its operational relationship; it never deletes the shared library file.</p></div></aside></div>;
}
