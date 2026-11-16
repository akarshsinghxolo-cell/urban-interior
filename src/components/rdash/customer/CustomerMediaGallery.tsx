"use client";

import * as React from "react";
import { Paperclip } from "lucide-react";
import { useRDashStore } from "@/lib/rdash/store";
import { assetPreview, customerMediaGroups } from "@/lib/rdash/file-attachments";
import { formatDate } from "@/lib/rdash/format";
import { FilePreview } from "../FilePreview";

export function CustomerMediaGallery({ customerId }: { customerId: string }) {
  const db = useRDashStore((state) => state.db);
  const groups = React.useMemo(() => customerMediaGroups(db, customerId), [db, customerId]);

  return (
    <section aria-label="Customer media">
      <div className="mb-2 flex items-center gap-2">
        <Paperclip className="h-3.5 w-3.5 text-primary" />
        <h3 className="text-xs font-bold uppercase text-muted-foreground">Media</h3>
      </div>
      {groups.length ? (
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.section}>
              <p className="mb-1.5 text-xs font-semibold text-foreground">{group.section} <span className="font-normal text-muted-foreground">({group.items.length})</span></p>
              <div className="rd-scroll flex gap-2 overflow-x-auto pb-2" data-testid="customer-media-row">
                {group.items.map(({ asset, attachment, sourceLabel }) => (
                  <article key={asset.id} className="w-44 shrink-0 rounded-lg border border-border bg-background p-2">
                    <FilePreview file={assetPreview(asset)} compact controls />
                    <p className="mt-1.5 truncate text-xs font-semibold" title={asset.file_name}>{asset.file_name}</p>
                    <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={sourceLabel}>{sourceLabel}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{formatDate(attachment?.created_at || asset.created_at)}</p>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">No customer-linked media yet.</p>
      )}
    </section>
  );
}
