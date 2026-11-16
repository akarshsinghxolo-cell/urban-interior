import { describe, expect, test } from "vitest";
import { buildSeedDatabase } from "../src/lib/rdash/seed";
import { assetPreview, customerMediaGroups, customerMediaItems, fileCustomerNames } from "../src/lib/rdash/file-attachments";
import type { EntityFileAttachment, FileAsset } from "../src/lib/rdash/types";

const timestamp = "2026-11-16T10:00:00.000Z";

function file(id: string, customerId: string, patch: Partial<FileAsset> = {}): FileAsset {
  return {
    id,
    file_name: `${id}.png`,
    mime_type: "image/png",
    kind: "media",
    web_view_link: "https://drive.google.com/file/d/1abcdefghijkLMNOP/view",
    storage_provider: "google_drive",
    storage_mode: "managed",
    sync_status: "uploaded",
    status: "active",
    customer_id: customerId,
    created_at: timestamp,
    updated_at: timestamp,
    ...patch,
  };
}

describe("customer media is one linked collection", () => {
  test("includes customer-owned assets even when their business attachment belongs to a measurement", () => {
    const db = buildSeedDatabase();
    const customer = db.customers[0];
    const site = db.sites.find((row) => row.customer_id === customer.id);
    const area = site && db.areas.find((row) => row.site_id === site.id);
    const revision = area && db.measurementRevisions.find((row) => row.area_id === area.id);
    if (!site || !area || !revision) throw new Error("Seed Customer must include a measured Area.");
    const direct = file("customer-document", customer.id);
    const measured = file("measurement-photo", customer.id, { site_id: site.id });
    const attachment: EntityFileAttachment = {
      id: "measurement-attachment",
      file_asset_id: measured.id,
      entity_type: "measurement_revision",
      entity_id: revision.id,
      entity_label: "Hall measurement",
      role: "measurement",
      visibility: "internal",
      created_at: timestamp,
      updated_at: timestamp,
    };
    db.master.fileAssets.push(direct, measured);
    db.entityFileAttachments.push(attachment);

    expect(customerMediaItems(db, customer.id).map((item) => item.asset.id)).toEqual(expect.arrayContaining([direct.id, measured.id]));
    expect(customerMediaGroups(db, customer.id).map((group) => group.section)).toEqual(expect.arrayContaining(["Customer documents", "Measurement photos"]));
    expect(fileCustomerNames(db, measured)).toEqual([customer.name]);
  });

  test("recovers the Drive ID from legacy managed links so image previews can load", () => {
    const preview = assetPreview(file("legacy-preview", "customer-1", { google_file_id: undefined }));
    expect(preview.googleFileId).toBe("1abcdefghijkLMNOP");
    expect(preview.proxyUrl).toContain("fileId=1abcdefghijkLMNOP");
  });
});
