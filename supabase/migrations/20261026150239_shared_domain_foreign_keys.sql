-- Workspace- and kind-scoped foreign keys for the canonical scalar reference registry.
-- Application cascade/nullification remains journalled; database checks defer to transaction end.
-- No data edits or new tables. Optional/conditional requiredness remains in business validation.

BEGIN;

SET LOCAL lock_timeout='15s';

SET LOCAL statement_timeout='120s';

LOCK TABLE public.entity_workspace_revision IN ACCESS EXCLUSIVE MODE;

SET CONSTRAINTS ALL IMMEDIATE;

-- sites.customer_id -> customers; app deletion policy: cascade
ALTER TABLE public."entity_sites" ADD CONSTRAINT "fk_60b3dd9f6d7620ca56c60f" FOREIGN KEY ("workspace_id", "customer_id_gen") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_sites" VALIDATE CONSTRAINT "fk_60b3dd9f6d7620ca56c60f";

CREATE INDEX "fk_eed8f6cd609c85601e711f" ON public."entity_sites" ("workspace_id", "customer_id_gen");

-- areas.site_id -> sites; app deletion policy: cascade
ALTER TABLE public."entity_areas" ADD CONSTRAINT "fk_0d200c21780cd546eb3686" FOREIGN KEY ("workspace_id", "site_id_gen") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_areas" VALIDATE CONSTRAINT "fk_0d200c21780cd546eb3686";

CREATE INDEX "fk_26274574ee69dd60a02ed1" ON public."entity_areas" ("workspace_id", "site_id_gen");

-- workRequired.customer_id -> customers; app deletion policy: restrict
ALTER TABLE public."entity_workRequired" ADD CONSTRAINT "fk_3224562be51e137a578ee0" FOREIGN KEY ("workspace_id", "customer_id_gen") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workRequired" VALIDATE CONSTRAINT "fk_3224562be51e137a578ee0";

CREATE INDEX "fk_88352eda92bda6afee4a67" ON public."entity_workRequired" ("workspace_id", "customer_id_gen");

-- workRequired.site_id -> sites; app deletion policy: restrict
ALTER TABLE public."entity_workRequired" ADD CONSTRAINT "fk_effbca7833e714e2066dd2" FOREIGN KEY ("workspace_id", "site_id_gen") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workRequired" VALIDATE CONSTRAINT "fk_effbca7833e714e2066dd2";

CREATE INDEX "fk_aeef2fc04077a8131a1e41" ON public."entity_workRequired" ("workspace_id", "site_id_gen");

ALTER TABLE public."entity_site_records" ADD COLUMN "fk_c6a5f96ea3c94625acd49a" text GENERATED ALWAYS AS (CASE WHEN collection='measurementRevisions' THEN NULLIF(data #>> '{site_id}', '') ELSE NULL END) STORED;

-- measurementRevisions.site_id -> sites; app deletion policy: restrict
ALTER TABLE public."entity_site_records" ADD CONSTRAINT "fk_2105354bd2715bedcfe2d0" FOREIGN KEY ("workspace_id", "fk_c6a5f96ea3c94625acd49a") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_site_records" VALIDATE CONSTRAINT "fk_2105354bd2715bedcfe2d0";

CREATE INDEX "fk_27b8d818dc64f53572f69a" ON public."entity_site_records" ("workspace_id", "fk_c6a5f96ea3c94625acd49a");

CREATE UNIQUE INDEX "fk_e86069df16d88a642feaed" ON public."entity_areas" ("workspace_id", "id");

ALTER TABLE public."entity_site_records" ADD COLUMN "fk_49eaae94bc0606b4d4dd43" text GENERATED ALWAYS AS (CASE WHEN collection='measurementRevisions' THEN NULLIF(data #>> '{area_id}', '') ELSE NULL END) STORED;

-- measurementRevisions.area_id -> areas; app deletion policy: restrict
ALTER TABLE public."entity_site_records" ADD CONSTRAINT "fk_3ec836e6e9e7f976c9f2ec" FOREIGN KEY ("workspace_id", "fk_49eaae94bc0606b4d4dd43") REFERENCES public."entity_areas" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_site_records" VALIDATE CONSTRAINT "fk_3ec836e6e9e7f976c9f2ec";

CREATE INDEX "fk_c29c2b3e8b5b5ea14830bd" ON public."entity_site_records" ("workspace_id", "fk_49eaae94bc0606b4d4dd43");

CREATE UNIQUE INDEX "fk_a3c798826c9e2e7a2c64d3" ON public."entity_workRequired" ("workspace_id", "id");

ALTER TABLE public."entity_site_records" ADD COLUMN "fk_0fee8b0239f61c18359aee" text GENERATED ALWAYS AS (CASE WHEN collection='measurementRevisions' THEN NULLIF(data #>> '{work_required_id}', '') ELSE NULL END) STORED;

-- measurementRevisions.work_required_id -> workRequired; app deletion policy: nullify
ALTER TABLE public."entity_site_records" ADD CONSTRAINT "fk_8ea7cffe500bf44f5ced87" FOREIGN KEY ("workspace_id", "fk_0fee8b0239f61c18359aee") REFERENCES public."entity_workRequired" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_site_records" VALIDATE CONSTRAINT "fk_8ea7cffe500bf44f5ced87";

CREATE INDEX "fk_db51ef3d82fd3aa875fc8c" ON public."entity_site_records" ("workspace_id", "fk_0fee8b0239f61c18359aee");

CREATE UNIQUE INDEX "fk_a7bc438915063bff465155" ON public."entity_site_records" ("collection", "workspace_id", "id");

ALTER TABLE public."entity_site_records" ADD COLUMN "fk_09b0a6b82348f900a39b74" text GENERATED ALWAYS AS (CASE WHEN collection='measurementRevisions' THEN NULLIF(data #>> '{drawing_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_site_records" ADD COLUMN "fk_95cdd59bbe408086bd47d3" text GENERATED ALWAYS AS ('drawings') STORED;

-- measurementRevisions.drawing_id -> drawings; app deletion policy: nullify
ALTER TABLE public."entity_site_records" ADD CONSTRAINT "fk_6c5fd6fe614fa17bc4a989" FOREIGN KEY ("fk_95cdd59bbe408086bd47d3", "workspace_id", "fk_09b0a6b82348f900a39b74") REFERENCES public."entity_site_records" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_site_records" VALIDATE CONSTRAINT "fk_6c5fd6fe614fa17bc4a989";

CREATE INDEX "fk_9feb1fffa2ffc548ffa96d" ON public."entity_site_records" ("fk_95cdd59bbe408086bd47d3", "workspace_id", "fk_09b0a6b82348f900a39b74");

-- quotations.customer_id -> customers; app deletion policy: restrict
ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_8f78663fff67cb2d1e4da6" FOREIGN KEY ("workspace_id", "sd_7dad38aaab2a13e3cef5") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commercial_documents" VALIDATE CONSTRAINT "fk_8f78663fff67cb2d1e4da6";

CREATE INDEX "fk_657d1460b8c74dba6b2463" ON public."entity_commercial_documents" ("workspace_id", "sd_7dad38aaab2a13e3cef5");

-- quotations.site_id -> sites; app deletion policy: restrict
ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_9efb9abcb2c4349ea0c0c2" FOREIGN KEY ("workspace_id", "sd_d362111c2dd759619485") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commercial_documents" VALIDATE CONSTRAINT "fk_9efb9abcb2c4349ea0c0c2";

CREATE INDEX "fk_2f90205b434872f34d1f84" ON public."entity_commercial_documents" ("workspace_id", "sd_d362111c2dd759619485");

-- acceptedScopes.customer_id -> customers; app deletion policy: restrict
ALTER TABLE public."entity_acceptedScopes" ADD CONSTRAINT "fk_4042e047f0e3a8f5c28eec" FOREIGN KEY ("workspace_id", "customer_id_gen") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_acceptedScopes" VALIDATE CONSTRAINT "fk_4042e047f0e3a8f5c28eec";

CREATE INDEX "fk_be437c6f8a128a0fc1c20e" ON public."entity_acceptedScopes" ("workspace_id", "customer_id_gen");

-- acceptedScopes.site_id -> sites; app deletion policy: restrict
ALTER TABLE public."entity_acceptedScopes" ADD CONSTRAINT "fk_832492dc0ebae12e256e5d" FOREIGN KEY ("workspace_id", "site_id_gen") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_acceptedScopes" VALIDATE CONSTRAINT "fk_832492dc0ebae12e256e5d";

CREATE INDEX "fk_90b50d5c987b0b9c651b70" ON public."entity_acceptedScopes" ("workspace_id", "site_id_gen");

ALTER TABLE public."entity_acceptedScopes" ADD COLUMN "fk_9b5d1f805774ca81b771f6" text GENERATED ALWAYS AS (NULLIF(data #>> '{work_required_id}', '')) STORED;

-- acceptedScopes.work_required_id -> workRequired; app deletion policy: restrict
ALTER TABLE public."entity_acceptedScopes" ADD CONSTRAINT "fk_57a907e4e5a3493e3bc865" FOREIGN KEY ("workspace_id", "fk_9b5d1f805774ca81b771f6") REFERENCES public."entity_workRequired" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_acceptedScopes" VALIDATE CONSTRAINT "fk_57a907e4e5a3493e3bc865";

CREATE INDEX "fk_8ca3e44149c479a9dca788" ON public."entity_acceptedScopes" ("workspace_id", "fk_9b5d1f805774ca81b771f6");

ALTER TABLE public."entity_acceptedScopes" ADD COLUMN "fk_d08aebf50269477f5f3177" text GENERATED ALWAYS AS (NULLIF(data #>> '{quotation_id}', '')) STORED;

ALTER TABLE public."entity_acceptedScopes" ADD COLUMN "fk_0853d2f491d44bf1c48d8a" text GENERATED ALWAYS AS ('quotations') STORED;

-- acceptedScopes.quotation_id -> quotations; app deletion policy: restrict
ALTER TABLE public."entity_acceptedScopes" ADD CONSTRAINT "fk_dfc4b06e40d51e869c1cb6" FOREIGN KEY ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_d08aebf50269477f5f3177") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_acceptedScopes" VALIDATE CONSTRAINT "fk_dfc4b06e40d51e869c1cb6";

CREATE INDEX "fk_dad1699df217b109370768" ON public."entity_acceptedScopes" ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_d08aebf50269477f5f3177");

ALTER TABLE public."entity_acceptedScopes" ADD COLUMN "fk_907a82a54f99c5f559aea4" text GENERATED ALWAYS AS (NULLIF(data #>> '{work_order_id}', '')) STORED;

-- acceptedScopes.work_order_id -> workOrders; app deletion policy: nullify
ALTER TABLE public."entity_acceptedScopes" ADD CONSTRAINT "fk_61f3f852ac7d3cddd62fb0" FOREIGN KEY ("workspace_id", "fk_907a82a54f99c5f559aea4") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_acceptedScopes" VALIDATE CONSTRAINT "fk_61f3f852ac7d3cddd62fb0";

CREATE INDEX "fk_e25ffb02fd176393f72d76" ON public."entity_acceptedScopes" ("workspace_id", "fk_907a82a54f99c5f559aea4");

-- workOrders.customer_id -> customers; app deletion policy: restrict
ALTER TABLE public."entity_workOrders" ADD CONSTRAINT "fk_6d95d022fa65659ab4e26d" FOREIGN KEY ("workspace_id", "customer_id_gen") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workOrders" VALIDATE CONSTRAINT "fk_6d95d022fa65659ab4e26d";

CREATE INDEX "fk_3cb32f6eb8811690f957ae" ON public."entity_workOrders" ("workspace_id", "customer_id_gen");

-- workOrders.site_id -> sites; app deletion policy: restrict
ALTER TABLE public."entity_workOrders" ADD CONSTRAINT "fk_c7dcfd6f1b904c1d4579e5" FOREIGN KEY ("workspace_id", "site_id_gen") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workOrders" VALIDATE CONSTRAINT "fk_c7dcfd6f1b904c1d4579e5";

CREATE INDEX "fk_364d06ac39d48f39352e75" ON public."entity_workOrders" ("workspace_id", "site_id_gen");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_c7a42560262ae3f3bd1c40" text GENERATED ALWAYS AS (CASE WHEN collection='boqs' THEN NULLIF(data #>> '{work_order_id}', '') ELSE NULL END) STORED;

-- boqs.work_order_id -> workOrders; app deletion policy: cascade
ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_b3c8077ac92a874e14a8b5" FOREIGN KEY ("workspace_id", "fk_c7a42560262ae3f3bd1c40") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commercial_documents" VALIDATE CONSTRAINT "fk_b3c8077ac92a874e14a8b5";

CREATE INDEX "fk_8a6911f8300f7f36017e39" ON public."entity_commercial_documents" ("workspace_id", "fk_c7a42560262ae3f3bd1c40");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_f79be1591db98a2e9f9819" text GENERATED ALWAYS AS (CASE WHEN collection='vendorRfqs' THEN NULLIF(data #>> '{work_order_id}', '') ELSE NULL END) STORED;

-- vendorRfqs.work_order_id -> workOrders; app deletion policy: cascade
ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_d012e37252c388048519ae" FOREIGN KEY ("workspace_id", "fk_f79be1591db98a2e9f9819") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commercial_documents" VALIDATE CONSTRAINT "fk_d012e37252c388048519ae";

CREATE INDEX "fk_aa5deaed86702ac5e12131" ON public."entity_commercial_documents" ("workspace_id", "fk_f79be1591db98a2e9f9819");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_72a71299bc8f80264ca34a" text GENERATED ALWAYS AS (CASE WHEN collection='vendorRfqs' THEN NULLIF(data #>> '{boq_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_2f6df3f430b82daf321303" text GENERATED ALWAYS AS ('boqs') STORED;

-- vendorRfqs.boq_id -> boqs; app deletion policy: restrict
ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_abb31e06fe04b4a5c5bb06" FOREIGN KEY ("fk_2f6df3f430b82daf321303", "workspace_id", "fk_72a71299bc8f80264ca34a") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commercial_documents" VALIDATE CONSTRAINT "fk_abb31e06fe04b4a5c5bb06";

CREATE INDEX "fk_be21c8a92a66f522b4a951" ON public."entity_commercial_documents" ("fk_2f6df3f430b82daf321303", "workspace_id", "fk_72a71299bc8f80264ca34a");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_6a4698fb629c886b35693e" text GENERATED ALWAYS AS (CASE WHEN collection='vendorRfqs' THEN NULLIF(data #>> '{site_id}', '') ELSE NULL END) STORED;

-- vendorRfqs.site_id -> sites; app deletion policy: nullify
ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_8248de40d2b451057fce35" FOREIGN KEY ("workspace_id", "fk_6a4698fb629c886b35693e") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commercial_documents" VALIDATE CONSTRAINT "fk_8248de40d2b451057fce35";

CREATE INDEX "fk_5b0e8c3b97d0abce675dfd" ON public."entity_commercial_documents" ("workspace_id", "fk_6a4698fb629c886b35693e");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_8de9db8fc8e5a7feda96db" text GENERATED ALWAYS AS (CASE WHEN collection='vendorBids' THEN NULLIF(data #>> '{rfq_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_eea6e1d233152270d8f2e6" text GENERATED ALWAYS AS ('vendorRfqs') STORED;

-- vendorBids.rfq_id -> vendorRfqs; app deletion policy: cascade
ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_88c07f882465205342e84a" FOREIGN KEY ("fk_eea6e1d233152270d8f2e6", "workspace_id", "fk_8de9db8fc8e5a7feda96db") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commercial_documents" VALIDATE CONSTRAINT "fk_88c07f882465205342e84a";

CREATE INDEX "fk_55c62be0e093e9d304eb6c" ON public."entity_commercial_documents" ("fk_eea6e1d233152270d8f2e6", "workspace_id", "fk_8de9db8fc8e5a7feda96db");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_67779c31b1f70e393c7c30" text GENERATED ALWAYS AS (CASE WHEN collection='vendorBids' THEN NULLIF(data #>> '{vendor_id}', '') ELSE NULL END) STORED;

-- vendorBids.vendor_id -> master.vendors; app deletion policy: restrict
ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_0dd9cab7e28b0af42c60e0" FOREIGN KEY ("workspace_id", "fk_67779c31b1f70e393c7c30") REFERENCES public."entity_master_vendors" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commercial_documents" VALIDATE CONSTRAINT "fk_0dd9cab7e28b0af42c60e0";

CREATE INDEX "fk_2078e40c0e336f34537b53" ON public."entity_commercial_documents" ("workspace_id", "fk_67779c31b1f70e393c7c30");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_c2de248eb3471753e8052e" text GENERATED ALWAYS AS (CASE WHEN collection='purchaseOrders' THEN NULLIF(data #>> '{rfq_id}', '') ELSE NULL END) STORED;

-- purchaseOrders.rfq_id -> vendorRfqs; app deletion policy: nullify
ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_757cb5cac8cc0aa37625fc" FOREIGN KEY ("fk_eea6e1d233152270d8f2e6", "workspace_id", "fk_c2de248eb3471753e8052e") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commercial_documents" VALIDATE CONSTRAINT "fk_757cb5cac8cc0aa37625fc";

CREATE INDEX "fk_e04ab4cb2624a5ee525404" ON public."entity_commercial_documents" ("fk_eea6e1d233152270d8f2e6", "workspace_id", "fk_c2de248eb3471753e8052e");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_2f3c80d3a51f5b3d8bfae9" text GENERATED ALWAYS AS (CASE WHEN collection='dispatches' THEN NULLIF(data #>> '{work_order_id}', '') ELSE NULL END) STORED;

-- dispatches.work_order_id -> workOrders; app deletion policy: nullify
ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_8c601167d6c1f2d0f0474f" FOREIGN KEY ("workspace_id", "fk_2f3c80d3a51f5b3d8bfae9") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commercial_documents" VALIDATE CONSTRAINT "fk_8c601167d6c1f2d0f0474f";

CREATE INDEX "fk_256cf11bc47d1833d8daa4" ON public."entity_commercial_documents" ("workspace_id", "fk_2f3c80d3a51f5b3d8bfae9");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_e1612eb53986efe045b195" text GENERATED ALWAYS AS (CASE WHEN collection='dispatches' THEN NULLIF(data #>> '{site_id}', '') ELSE NULL END) STORED;

-- dispatches.site_id -> sites; app deletion policy: nullify
ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_b28b35ce7b7ac56c3d077c" FOREIGN KEY ("workspace_id", "fk_e1612eb53986efe045b195") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commercial_documents" VALIDATE CONSTRAINT "fk_b28b35ce7b7ac56c3d077c";

CREATE INDEX "fk_228db7d2c5b6a94f4de013" ON public."entity_commercial_documents" ("workspace_id", "fk_e1612eb53986efe045b195");

ALTER TABLE public."entity_inventory" ADD COLUMN "fk_c5a771fa8caed35828d0d7" text GENERATED ALWAYS AS (NULLIF(data #>> '{grn_id}', '')) STORED;

ALTER TABLE public."entity_inventory" ADD COLUMN "fk_ddc8f7d052dbed27880e70" text GENERATED ALWAYS AS ('grns') STORED;

-- inventory.grn_id -> grns; app deletion policy: nullify
ALTER TABLE public."entity_inventory" ADD CONSTRAINT "fk_7f462bbe09b33c52cc8cb2" FOREIGN KEY ("fk_ddc8f7d052dbed27880e70", "workspace_id", "fk_c5a771fa8caed35828d0d7") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_inventory" VALIDATE CONSTRAINT "fk_7f462bbe09b33c52cc8cb2";

CREATE INDEX "fk_d5810ffb9e3efb9fe1bd44" ON public."entity_inventory" ("fk_ddc8f7d052dbed27880e70", "workspace_id", "fk_c5a771fa8caed35828d0d7");

ALTER TABLE public."entity_inventory" ADD COLUMN "fk_c28abf316488fe91627c3c" text GENERATED ALWAYS AS (NULLIF(data #>> '{work_order_id}', '')) STORED;

-- inventory.work_order_id -> workOrders; app deletion policy: nullify
ALTER TABLE public."entity_inventory" ADD CONSTRAINT "fk_9bf6c47aed272771fe896c" FOREIGN KEY ("workspace_id", "fk_c28abf316488fe91627c3c") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_inventory" VALIDATE CONSTRAINT "fk_9bf6c47aed272771fe896c";

CREATE INDEX "fk_f666b06ef2decfc46b2c1d" ON public."entity_inventory" ("workspace_id", "fk_c28abf316488fe91627c3c");

CREATE UNIQUE INDEX "fk_52b35d52ba46b48d7fff09" ON public."entity_catalogue_items" ("collection", "workspace_id", "id");

ALTER TABLE public."entity_inventory" ADD COLUMN "fk_3bb7be1adcb89583414f04" text GENERATED ALWAYS AS (NULLIF(data #>> '{article_id}', '')) STORED;

ALTER TABLE public."entity_inventory" ADD COLUMN "fk_fac422498fa0394b160927" text GENERATED ALWAYS AS ('master.articles') STORED;

-- inventory.article_id -> master.articles; app deletion policy: restrict
ALTER TABLE public."entity_inventory" ADD CONSTRAINT "fk_4f89276d3dfd3d1ae0e15c" FOREIGN KEY ("fk_fac422498fa0394b160927", "workspace_id", "fk_3bb7be1adcb89583414f04") REFERENCES public."entity_catalogue_items" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_inventory" VALIDATE CONSTRAINT "fk_4f89276d3dfd3d1ae0e15c";

CREATE INDEX "fk_67bddc61d88d9685cc9224" ON public."entity_inventory" ("fk_fac422498fa0394b160927", "workspace_id", "fk_3bb7be1adcb89583414f04");

CREATE UNIQUE INDEX "fk_26bf7e0aaa88afc16605b4" ON public."entity_master_subcategoryArticleMap" ("workspace_id", "id");

ALTER TABLE public."entity_inventory" ADD COLUMN "fk_8c5b5d4d94dbe3feb78042" text GENERATED ALWAYS AS (NULLIF(data #>> '{work_required_article_id}', '')) STORED;

-- inventory.work_required_article_id -> master.subcategoryArticleMap; app deletion policy: restrict
ALTER TABLE public."entity_inventory" ADD CONSTRAINT "fk_741f2d8735d50992e81d57" FOREIGN KEY ("workspace_id", "fk_8c5b5d4d94dbe3feb78042") REFERENCES public."entity_master_subcategoryArticleMap" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_inventory" VALIDATE CONSTRAINT "fk_741f2d8735d50992e81d57";

CREATE INDEX "fk_0fabe02e09717dd785e547" ON public."entity_inventory" ("workspace_id", "fk_8c5b5d4d94dbe3feb78042");

CREATE UNIQUE INDEX "fk_439455cd97ce806b6d3654" ON public."entity_inventory" ("workspace_id", "id");

ALTER TABLE public."entity_stockMovements" ADD COLUMN "fk_292e72a90675a7f95d5f39" text GENERATED ALWAYS AS (NULLIF(data #>> '{inventory_id}', '')) STORED;

-- stockMovements.inventory_id -> inventory; app deletion policy: cascade
ALTER TABLE public."entity_stockMovements" ADD CONSTRAINT "fk_fc6596535d2fcc9d05f412" FOREIGN KEY ("workspace_id", "fk_292e72a90675a7f95d5f39") REFERENCES public."entity_inventory" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_stockMovements" VALIDATE CONSTRAINT "fk_fc6596535d2fcc9d05f412";

CREATE INDEX "fk_3cf2c22200711ef0f61f76" ON public."entity_stockMovements" ("workspace_id", "fk_292e72a90675a7f95d5f39");

ALTER TABLE public."entity_stockMovements" ADD COLUMN "fk_fa74d8db3975a981d21b4a" text GENERATED ALWAYS AS (NULLIF(data #>> '{work_order_id}', '')) STORED;

-- stockMovements.work_order_id -> workOrders; app deletion policy: nullify
ALTER TABLE public."entity_stockMovements" ADD CONSTRAINT "fk_44f7013c7c79cdf679d673" FOREIGN KEY ("workspace_id", "fk_fa74d8db3975a981d21b4a") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_stockMovements" VALIDATE CONSTRAINT "fk_44f7013c7c79cdf679d673";

CREATE INDEX "fk_c6547c9b60cc5ca481a1c1" ON public."entity_stockMovements" ("workspace_id", "fk_fa74d8db3975a981d21b4a");

ALTER TABLE public."entity_stockMovements" ADD COLUMN "fk_b92191666f20f37b39b23e" text GENERATED ALWAYS AS (NULLIF(data #>> '{po_id}', '')) STORED;

ALTER TABLE public."entity_stockMovements" ADD COLUMN "fk_58501682bd9e0d1c572a17" text GENERATED ALWAYS AS ('purchaseOrders') STORED;

-- stockMovements.po_id -> purchaseOrders; app deletion policy: nullify
ALTER TABLE public."entity_stockMovements" ADD CONSTRAINT "fk_554ac4d1d132c4adf01dc0" FOREIGN KEY ("fk_58501682bd9e0d1c572a17", "workspace_id", "fk_b92191666f20f37b39b23e") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_stockMovements" VALIDATE CONSTRAINT "fk_554ac4d1d132c4adf01dc0";

CREATE INDEX "fk_a03b4b94e72feb11cdb1b2" ON public."entity_stockMovements" ("fk_58501682bd9e0d1c572a17", "workspace_id", "fk_b92191666f20f37b39b23e");

ALTER TABLE public."entity_stockMovements" ADD COLUMN "fk_dec691dc703f2ab0fce2b3" text GENERATED ALWAYS AS (NULLIF(data #>> '{grn_id}', '')) STORED;

ALTER TABLE public."entity_stockMovements" ADD COLUMN "fk_ddc8f7d052dbed27880e70" text GENERATED ALWAYS AS ('grns') STORED;

-- stockMovements.grn_id -> grns; app deletion policy: nullify
ALTER TABLE public."entity_stockMovements" ADD CONSTRAINT "fk_b9780d3468247ee216a5e7" FOREIGN KEY ("fk_ddc8f7d052dbed27880e70", "workspace_id", "fk_dec691dc703f2ab0fce2b3") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_stockMovements" VALIDATE CONSTRAINT "fk_b9780d3468247ee216a5e7";

CREATE INDEX "fk_0e82af9521986d9242e5a7" ON public."entity_stockMovements" ("fk_ddc8f7d052dbed27880e70", "workspace_id", "fk_dec691dc703f2ab0fce2b3");

ALTER TABLE public."entity_stockMovements" ADD COLUMN "fk_cb709b61ac0aa8a4a98300" text GENERATED ALWAYS AS (NULLIF(data #>> '{dispatch_id}', '')) STORED;

ALTER TABLE public."entity_stockMovements" ADD COLUMN "fk_e8f8c3b07c118955be8ce6" text GENERATED ALWAYS AS ('dispatches') STORED;

-- stockMovements.dispatch_id -> dispatches; app deletion policy: nullify
ALTER TABLE public."entity_stockMovements" ADD CONSTRAINT "fk_3c923ab10e221a92ac97df" FOREIGN KEY ("fk_e8f8c3b07c118955be8ce6", "workspace_id", "fk_cb709b61ac0aa8a4a98300") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_stockMovements" VALIDATE CONSTRAINT "fk_3c923ab10e221a92ac97df";

CREATE INDEX "fk_f79d71e5ec6071599dc238" ON public."entity_stockMovements" ("fk_e8f8c3b07c118955be8ce6", "workspace_id", "fk_cb709b61ac0aa8a4a98300");

-- contractorBills.customer_id -> customers; app deletion policy: restrict
ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "fk_f6b568c80083c1da9100dc" FOREIGN KEY ("workspace_id", "sd_79a3041abf5ba7c29887") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_financial_documents" VALIDATE CONSTRAINT "fk_f6b568c80083c1da9100dc";

CREATE INDEX "fk_89653649b8218ecd6e3e16" ON public."entity_financial_documents" ("workspace_id", "sd_79a3041abf5ba7c29887");

-- contractorBills.site_id -> sites; app deletion policy: nullify
ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "fk_423a1846c2dcdfed117eb1" FOREIGN KEY ("workspace_id", "sd_e4eff89c5be14ad2831f") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_financial_documents" VALIDATE CONSTRAINT "fk_423a1846c2dcdfed117eb1";

CREATE INDEX "fk_d65e8ebdc90b6e7704c4a3" ON public."entity_financial_documents" ("workspace_id", "sd_e4eff89c5be14ad2831f");

ALTER TABLE public."entity_financial_documents" ADD COLUMN "fk_a50efb593eca2e4ce9f964" text GENERATED ALWAYS AS (CASE WHEN collection='contractorBills' THEN NULLIF(data #>> '{work_required_id}', '') ELSE NULL END) STORED;

-- contractorBills.work_required_id -> workRequired; app deletion policy: nullify
ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "fk_ec8ea09f1823a0518017c8" FOREIGN KEY ("workspace_id", "fk_a50efb593eca2e4ce9f964") REFERENCES public."entity_workRequired" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_financial_documents" VALIDATE CONSTRAINT "fk_ec8ea09f1823a0518017c8";

CREATE INDEX "fk_4278a07e1cf25da7f7d805" ON public."entity_financial_documents" ("workspace_id", "fk_a50efb593eca2e4ce9f964");

ALTER TABLE public."entity_financial_documents" ADD COLUMN "fk_d5f3334efa1f71fbb650ab" text GENERATED ALWAYS AS (CASE WHEN collection='contractorBills' THEN NULLIF(data #>> '{settlement_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_financial_documents" ADD COLUMN "fk_1884a74c87effd8c71c4f6" text GENERATED ALWAYS AS ('contractorSettlements') STORED;

-- contractorBills.settlement_id -> contractorSettlements; app deletion policy: restrict
ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "fk_80afaa5c35ab6ae7156ce3" FOREIGN KEY ("fk_1884a74c87effd8c71c4f6", "workspace_id", "fk_d5f3334efa1f71fbb650ab") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_financial_documents" VALIDATE CONSTRAINT "fk_80afaa5c35ab6ae7156ce3";

CREATE INDEX "fk_95a0b1f6a76718c7b9a259" ON public."entity_financial_documents" ("fk_1884a74c87effd8c71c4f6", "workspace_id", "fk_d5f3334efa1f71fbb650ab");

ALTER TABLE public."entity_commissions" ADD COLUMN "fk_5b62d5863e6027fe6514ba" text GENERATED ALWAYS AS (NULLIF(data #>> '{work_order_id}', '')) STORED;

-- commissions.work_order_id -> workOrders; app deletion policy: restrict
ALTER TABLE public."entity_commissions" ADD CONSTRAINT "fk_e6dcb19c069d6070f96dab" FOREIGN KEY ("workspace_id", "fk_5b62d5863e6027fe6514ba") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commissions" VALIDATE CONSTRAINT "fk_e6dcb19c069d6070f96dab";

CREATE INDEX "fk_837d21af6f1074c46c0c3c" ON public."entity_commissions" ("workspace_id", "fk_5b62d5863e6027fe6514ba");

CREATE UNIQUE INDEX "fk_99e511e835c25a25c464c8" ON public."entity_master_sourcePartners" ("workspace_id", "id");

ALTER TABLE public."entity_commissions" ADD COLUMN "fk_f78e3d600be57d55f80b95" text GENERATED ALWAYS AS (NULLIF(data #>> '{source_partner_id}', '')) STORED;

-- commissions.source_partner_id -> master.sourcePartners; app deletion policy: restrict
ALTER TABLE public."entity_commissions" ADD CONSTRAINT "fk_1339c516e239f8bb25f538" FOREIGN KEY ("workspace_id", "fk_f78e3d600be57d55f80b95") REFERENCES public."entity_master_sourcePartners" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commissions" VALIDATE CONSTRAINT "fk_1339c516e239f8bb25f538";

CREATE INDEX "fk_3c3cb20c9455645c921d57" ON public."entity_commissions" ("workspace_id", "fk_f78e3d600be57d55f80b95");

-- commissions.customer_id -> customers; app deletion policy: nullify
ALTER TABLE public."entity_commissions" ADD CONSTRAINT "fk_a4f867e69d1dd24f104b30" FOREIGN KEY ("workspace_id", "customer_id_gen") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commissions" VALIDATE CONSTRAINT "fk_a4f867e69d1dd24f104b30";

CREATE INDEX "fk_67253c33e7febd4901ccf2" ON public."entity_commissions" ("workspace_id", "customer_id_gen");

ALTER TABLE public."entity_commissions" ADD COLUMN "fk_e3c213d44476e14a10bd6d" text GENERATED ALWAYS AS (NULLIF(data #>> '{quotation_id}', '')) STORED;

ALTER TABLE public."entity_commissions" ADD COLUMN "fk_0853d2f491d44bf1c48d8a" text GENERATED ALWAYS AS ('quotations') STORED;

-- commissions.quotation_id -> quotations; app deletion policy: nullify
ALTER TABLE public."entity_commissions" ADD CONSTRAINT "fk_7558ea7eb1f5e11630d412" FOREIGN KEY ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_e3c213d44476e14a10bd6d") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commissions" VALIDATE CONSTRAINT "fk_7558ea7eb1f5e11630d412";

CREATE INDEX "fk_9454335b02361497b474dd" ON public."entity_commissions" ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_e3c213d44476e14a10bd6d");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_3e9235a9321c6ba600b72e" text GENERATED ALWAYS AS (CASE WHEN collection='contractorBids' THEN NULLIF(data #>> '{work_order_id}', '') ELSE NULL END) STORED;

-- contractorBids.work_order_id -> workOrders; app deletion policy: cascade
ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_be5c82184dd6c28ebec0f8" FOREIGN KEY ("workspace_id", "fk_3e9235a9321c6ba600b72e") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commercial_documents" VALIDATE CONSTRAINT "fk_be5c82184dd6c28ebec0f8";

CREATE INDEX "fk_04c9f90ed060bc6db54416" ON public."entity_commercial_documents" ("workspace_id", "fk_3e9235a9321c6ba600b72e");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_1fc53206fc42919f5ceed7" text GENERATED ALWAYS AS (CASE WHEN collection='contractorBids' THEN NULLIF(data #>> '{contractor_id}', '') ELSE NULL END) STORED;

-- contractorBids.contractor_id -> master.contractors; app deletion policy: restrict
ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_00cb139598aa6defbd9191" FOREIGN KEY ("workspace_id", "fk_1fc53206fc42919f5ceed7") REFERENCES public."entity_master_contractors" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commercial_documents" VALIDATE CONSTRAINT "fk_00cb139598aa6defbd9191";

CREATE INDEX "fk_6162f1b896f6cf1ff9dc95" ON public."entity_commercial_documents" ("workspace_id", "fk_1fc53206fc42919f5ceed7");

CREATE UNIQUE INDEX "fk_6c68aada900acf7d0cf906" ON public."entity_acceptedScopes" ("workspace_id", "id");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_17aa718599743a6a85f6b0" text GENERATED ALWAYS AS (CASE WHEN collection='contractorBids' THEN NULLIF(data #>> '{accepted_scope_id}', '') ELSE NULL END) STORED;

-- contractorBids.accepted_scope_id -> acceptedScopes; app deletion policy: nullify
ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_8675efcb6c3aaa0ce960e5" FOREIGN KEY ("workspace_id", "fk_17aa718599743a6a85f6b0") REFERENCES public."entity_acceptedScopes" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commercial_documents" VALIDATE CONSTRAINT "fk_8675efcb6c3aaa0ce960e5";

CREATE INDEX "fk_a578d36b22ad24adb1ab48" ON public."entity_commercial_documents" ("workspace_id", "fk_17aa718599743a6a85f6b0");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_651b0a929c11c4e990bd9c" text GENERATED ALWAYS AS (CASE WHEN collection='contractorSettlements' THEN NULLIF(data #>> '{work_order_id}', '') ELSE NULL END) STORED;

-- contractorSettlements.work_order_id -> workOrders; app deletion policy: cascade
ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_fbb325a503e283d878ff3b" FOREIGN KEY ("workspace_id", "fk_651b0a929c11c4e990bd9c") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commercial_documents" VALIDATE CONSTRAINT "fk_fbb325a503e283d878ff3b";

CREATE INDEX "fk_993b18ee76cda5a0e510dd" ON public."entity_commercial_documents" ("workspace_id", "fk_651b0a929c11c4e990bd9c");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_d34c922ce43283dd7d0a7c" text GENERATED ALWAYS AS (CASE WHEN collection='contractorSettlements' THEN NULLIF(data #>> '{contractor_id}', '') ELSE NULL END) STORED;

-- contractorSettlements.contractor_id -> master.contractors; app deletion policy: restrict
ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_85aad3b5630a69f6744ab5" FOREIGN KEY ("workspace_id", "fk_d34c922ce43283dd7d0a7c") REFERENCES public."entity_master_contractors" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commercial_documents" VALIDATE CONSTRAINT "fk_85aad3b5630a69f6744ab5";

CREATE INDEX "fk_a42a8af451dbfdfcd9fcf5" ON public."entity_commercial_documents" ("workspace_id", "fk_d34c922ce43283dd7d0a7c");

ALTER TABLE public."entity_site_records" ADD COLUMN "fk_ea26303c886a93a851868d" text GENERATED ALWAYS AS (CASE WHEN collection='drawings' THEN NULLIF(data #>> '{site_id}', '') ELSE NULL END) STORED;

-- drawings.site_id -> sites; app deletion policy: nullify
ALTER TABLE public."entity_site_records" ADD CONSTRAINT "fk_8690da67edd74db99ec090" FOREIGN KEY ("workspace_id", "fk_ea26303c886a93a851868d") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_site_records" VALIDATE CONSTRAINT "fk_8690da67edd74db99ec090";

CREATE INDEX "fk_c22620ba0dc126e428ff4c" ON public."entity_site_records" ("workspace_id", "fk_ea26303c886a93a851868d");

ALTER TABLE public."entity_site_records" ADD COLUMN "fk_4978319042b99507c75ea4" text GENERATED ALWAYS AS (CASE WHEN collection='drawings' THEN NULLIF(data #>> '{work_order_id}', '') ELSE NULL END) STORED;

-- drawings.work_order_id -> workOrders; app deletion policy: nullify
ALTER TABLE public."entity_site_records" ADD CONSTRAINT "fk_613dcf520f8594944c9cd5" FOREIGN KEY ("workspace_id", "fk_4978319042b99507c75ea4") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_site_records" VALIDATE CONSTRAINT "fk_613dcf520f8594944c9cd5";

CREATE INDEX "fk_470b02246e19d3e1bee2fc" ON public."entity_site_records" ("workspace_id", "fk_4978319042b99507c75ea4");

ALTER TABLE public."entity_site_records" ADD COLUMN "fk_ca4d44ce70d581747696d4" text GENERATED ALWAYS AS (CASE WHEN collection='drawings' THEN NULLIF(data #>> '{area_id}', '') ELSE NULL END) STORED;

-- drawings.area_id -> areas; app deletion policy: nullify
ALTER TABLE public."entity_site_records" ADD CONSTRAINT "fk_b112b4fda37f742cb9b40c" FOREIGN KEY ("workspace_id", "fk_ca4d44ce70d581747696d4") REFERENCES public."entity_areas" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_site_records" VALIDATE CONSTRAINT "fk_b112b4fda37f742cb9b40c";

CREATE INDEX "fk_4a55fcc013b9c57b3dc9aa" ON public."entity_site_records" ("workspace_id", "fk_ca4d44ce70d581747696d4");

ALTER TABLE public."entity_site_records" ADD COLUMN "fk_600b43a5e6cfd7378878f4" text GENERATED ALWAYS AS (CASE WHEN collection='executionLogs' THEN NULLIF(data #>> '{work_order_id}', '') ELSE NULL END) STORED;

-- executionLogs.work_order_id -> workOrders; app deletion policy: cascade
ALTER TABLE public."entity_site_records" ADD CONSTRAINT "fk_ca8be0722b5b900004bcaa" FOREIGN KEY ("workspace_id", "fk_600b43a5e6cfd7378878f4") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_site_records" VALIDATE CONSTRAINT "fk_ca8be0722b5b900004bcaa";

CREATE INDEX "fk_a41919494f439406e3f547" ON public."entity_site_records" ("workspace_id", "fk_600b43a5e6cfd7378878f4");

ALTER TABLE public."entity_site_records" ADD COLUMN "fk_0d9e634722ad2fec0bdc88" text GENERATED ALWAYS AS (CASE WHEN collection='executionLogs' THEN NULLIF(data #>> '{filed_by_staff_id}', '') ELSE NULL END) STORED;

-- executionLogs.filed_by_staff_id -> master.staff; app deletion policy: nullify
ALTER TABLE public."entity_site_records" ADD CONSTRAINT "fk_6690dd3b6939abae5ab2b9" FOREIGN KEY ("workspace_id", "fk_0d9e634722ad2fec0bdc88") REFERENCES public."entity_master_staff" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_site_records" VALIDATE CONSTRAINT "fk_6690dd3b6939abae5ab2b9";

CREATE INDEX "fk_0b28f35d2ae7b055f7b04e" ON public."entity_site_records" ("workspace_id", "fk_0d9e634722ad2fec0bdc88");

ALTER TABLE public."entity_site_records" ADD COLUMN "fk_5179661c000c454f21bdd2" text GENERATED ALWAYS AS (CASE WHEN collection='executionLogs' THEN NULLIF(data #>> '{site_id}', '') ELSE NULL END) STORED;

-- executionLogs.site_id -> sites; app deletion policy: nullify
ALTER TABLE public."entity_site_records" ADD CONSTRAINT "fk_5155ed88c715e0034311fd" FOREIGN KEY ("workspace_id", "fk_5179661c000c454f21bdd2") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_site_records" VALIDATE CONSTRAINT "fk_5155ed88c715e0034311fd";

CREATE INDEX "fk_b98da341273ae4bb087f39" ON public."entity_site_records" ("workspace_id", "fk_5179661c000c454f21bdd2");

ALTER TABLE public."entity_site_records" ADD COLUMN "fk_4a03c0242bea24a0e54390" text GENERATED ALWAYS AS (CASE WHEN collection='variationRequests' THEN NULLIF(data #>> '{work_order_id}', '') ELSE NULL END) STORED;

-- variationRequests.work_order_id -> workOrders; app deletion policy: cascade
ALTER TABLE public."entity_site_records" ADD CONSTRAINT "fk_c5dff8f1a0fea0804daa1b" FOREIGN KEY ("workspace_id", "fk_4a03c0242bea24a0e54390") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_site_records" VALIDATE CONSTRAINT "fk_c5dff8f1a0fea0804daa1b";

CREATE INDEX "fk_a0218e54be6fe3c24f85b3" ON public."entity_site_records" ("workspace_id", "fk_4a03c0242bea24a0e54390");

-- variationRequests.customer_id -> customers; app deletion policy: restrict
ALTER TABLE public."entity_site_records" ADD CONSTRAINT "fk_12c9da6fcc4e2c1aa82ab0" FOREIGN KEY ("workspace_id", "s2_fbf14b5d31abe1937333f287") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_site_records" VALIDATE CONSTRAINT "fk_12c9da6fcc4e2c1aa82ab0";

CREATE INDEX "fk_8806188136109d1ee9208b" ON public."entity_site_records" ("workspace_id", "s2_fbf14b5d31abe1937333f287");

-- variationRequests.site_id -> sites; app deletion policy: nullify
ALTER TABLE public."entity_site_records" ADD CONSTRAINT "fk_ba0e954faaea4dab0cb87c" FOREIGN KEY ("workspace_id", "s2_1b2c72c70f3bf7d63e3ec173") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_site_records" VALIDATE CONSTRAINT "fk_ba0e954faaea4dab0cb87c";

CREATE INDEX "fk_7ccaf28b78abaf16b47c87" ON public."entity_site_records" ("workspace_id", "s2_1b2c72c70f3bf7d63e3ec173");

-- visits.customer_id -> customers; app deletion policy: restrict
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_4c5105b9698c4ca640dbf5" FOREIGN KEY ("workspace_id", "s2_3eae69b34d9068725e0ea417") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_4c5105b9698c4ca640dbf5";

CREATE INDEX "fk_6278b711908710894cface" ON public."entity_workflow_controls" ("workspace_id", "s2_3eae69b34d9068725e0ea417");

-- visits.site_id -> sites; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_590a818a59df4b54d9fc32" FOREIGN KEY ("workspace_id", "s2_c8e0189a449e078d3d6e4f70") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_590a818a59df4b54d9fc32";

CREATE INDEX "fk_d9cc453a46a447c99f64d6" ON public."entity_workflow_controls" ("workspace_id", "s2_c8e0189a449e078d3d6e4f70");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_5b62bf8b55d88be8293b71" text GENERATED ALWAYS AS (CASE WHEN collection='visits' THEN NULLIF(data #>> '{work_required_id}', '') ELSE NULL END) STORED;

-- visits.work_required_id -> workRequired; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_b2d49a0658f70938cc3876" FOREIGN KEY ("workspace_id", "fk_5b62bf8b55d88be8293b71") REFERENCES public."entity_workRequired" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_b2d49a0658f70938cc3876";

CREATE INDEX "fk_f8f346b0b8bac06b591ca3" ON public."entity_workflow_controls" ("workspace_id", "fk_5b62bf8b55d88be8293b71");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_38640995a1552b46250636" text GENERATED ALWAYS AS (CASE WHEN collection='visits' THEN NULLIF(data #>> '{work_order_id}', '') ELSE NULL END) STORED;

-- visits.work_order_id -> workOrders; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_b5be5d91cdcb88217e9723" FOREIGN KEY ("workspace_id", "fk_38640995a1552b46250636") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_b5be5d91cdcb88217e9723";

CREATE INDEX "fk_d36dae83f4ce3d8146384e" ON public."entity_workflow_controls" ("workspace_id", "fk_38640995a1552b46250636");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_c7a552887de8df41877374" text GENERATED ALWAYS AS (CASE WHEN collection='visits' THEN NULLIF(data #>> '{contractor_id}', '') ELSE NULL END) STORED;

-- visits.contractor_id -> master.contractors; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_a1e1adc38ddb64290a78b4" FOREIGN KEY ("workspace_id", "fk_c7a552887de8df41877374") REFERENCES public."entity_master_contractors" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_a1e1adc38ddb64290a78b4";

CREATE INDEX "fk_9687a0249e7dbe6f53bf1f" ON public."entity_workflow_controls" ("workspace_id", "fk_c7a552887de8df41877374");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_4dbeff4f841d33c18fb57c" text GENERATED ALWAYS AS (CASE WHEN collection='visits' THEN NULLIF(data #>> '{vendor_id}', '') ELSE NULL END) STORED;

-- visits.vendor_id -> master.vendors; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_42628d9d4ed76e8a88589e" FOREIGN KEY ("workspace_id", "fk_4dbeff4f841d33c18fb57c") REFERENCES public."entity_master_vendors" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_42628d9d4ed76e8a88589e";

CREATE INDEX "fk_436256f804bcca77d29b9a" ON public."entity_workflow_controls" ("workspace_id", "fk_4dbeff4f841d33c18fb57c");

-- tasks.customer_id -> customers; app deletion policy: restrict
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_0d4bb25631f4622bcaf782" FOREIGN KEY ("workspace_id", "s2_8acb09aad7eb38518e71efab") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_0d4bb25631f4622bcaf782";

CREATE INDEX "fk_623725dc99d8aacc558568" ON public."entity_workflow_controls" ("workspace_id", "s2_8acb09aad7eb38518e71efab");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_7b93e024c47af3933d82ae" text GENERATED ALWAYS AS (CASE WHEN collection='tasks' THEN NULLIF(data #>> '{work_order_id}', '') ELSE NULL END) STORED;

-- tasks.work_order_id -> workOrders; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_e8feb4e5dbe2eb49145e6c" FOREIGN KEY ("workspace_id", "fk_7b93e024c47af3933d82ae") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_e8feb4e5dbe2eb49145e6c";

CREATE INDEX "fk_bc84b3f0e72fbaccd750a6" ON public."entity_workflow_controls" ("workspace_id", "fk_7b93e024c47af3933d82ae");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_2e5a7145b0cd89722197e8" text GENERATED ALWAYS AS (CASE WHEN collection='tasks' THEN NULLIF(data #>> '{quotation_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_0853d2f491d44bf1c48d8a" text GENERATED ALWAYS AS ('quotations') STORED;

-- tasks.quotation_id -> quotations; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_45757c6f1c0898d6713449" FOREIGN KEY ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_2e5a7145b0cd89722197e8") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_45757c6f1c0898d6713449";

CREATE INDEX "fk_8320d4269f56ef9df87b2e" ON public."entity_workflow_controls" ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_2e5a7145b0cd89722197e8");

-- tasks.site_id -> sites; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_51edaf88c9d83f04baeac2" FOREIGN KEY ("workspace_id", "s2_49411c7ef6f6bba4135b5fad") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_51edaf88c9d83f04baeac2";

CREATE INDEX "fk_73f78c46845c831994dc87" ON public."entity_workflow_controls" ("workspace_id", "s2_49411c7ef6f6bba4135b5fad");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_a04f46fdcc2aa90beb0fe7" text GENERATED ALWAYS AS (CASE WHEN collection='tasks' THEN NULLIF(data #>> '{visit_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_cb17bdd280007897ed74c0" text GENERATED ALWAYS AS ('visits') STORED;

-- tasks.visit_id -> visits; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_3eb1a61a263088e30dd7d0" FOREIGN KEY ("fk_cb17bdd280007897ed74c0", "workspace_id", "fk_a04f46fdcc2aa90beb0fe7") REFERENCES public."entity_workflow_controls" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_3eb1a61a263088e30dd7d0";

CREATE INDEX "fk_fffba98abdee6882b4add5" ON public."entity_workflow_controls" ("fk_cb17bdd280007897ed74c0", "workspace_id", "fk_a04f46fdcc2aa90beb0fe7");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_953d8687632fd07a75d163" text GENERATED ALWAYS AS (CASE WHEN collection='tasks' THEN NULLIF(data #>> '{po_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_58501682bd9e0d1c572a17" text GENERATED ALWAYS AS ('purchaseOrders') STORED;

-- tasks.po_id -> purchaseOrders; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_39b2dcae4c3a874488ea29" FOREIGN KEY ("fk_58501682bd9e0d1c572a17", "workspace_id", "fk_953d8687632fd07a75d163") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_39b2dcae4c3a874488ea29";

CREATE INDEX "fk_a9cae94cde7a6ee872dff2" ON public."entity_workflow_controls" ("fk_58501682bd9e0d1c572a17", "workspace_id", "fk_953d8687632fd07a75d163");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_73b01ca72803c5e4cf5c98" text GENERATED ALWAYS AS (CASE WHEN collection='tasks' THEN NULLIF(data #>> '{work_required_id}', '') ELSE NULL END) STORED;

-- tasks.work_required_id -> workRequired; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_cf4a07a380bf1c08c09e66" FOREIGN KEY ("workspace_id", "fk_73b01ca72803c5e4cf5c98") REFERENCES public."entity_workRequired" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_cf4a07a380bf1c08c09e66";

CREATE INDEX "fk_3a8f5621c853545459d87f" ON public."entity_workflow_controls" ("workspace_id", "fk_73b01ca72803c5e4cf5c98");

-- followups.customer_id -> customers; app deletion policy: restrict
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_2c6415dc0b90c0cdd29232" FOREIGN KEY ("workspace_id", "s2_addeb7dd1695402ac3f4dbee") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_2c6415dc0b90c0cdd29232";

CREATE INDEX "fk_31394d1308d224f9184706" ON public."entity_workflow_controls" ("workspace_id", "s2_addeb7dd1695402ac3f4dbee");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_9e6ab147f4cbde41434d72" text GENERATED ALWAYS AS (CASE WHEN collection='followups' THEN NULLIF(data #>> '{quotation_id}', '') ELSE NULL END) STORED;

-- followups.quotation_id -> quotations; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_82a0ec87d4e2c6138afc9f" FOREIGN KEY ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_9e6ab147f4cbde41434d72") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_82a0ec87d4e2c6138afc9f";

CREATE INDEX "fk_76c55d5a0eeecc7d54fafe" ON public."entity_workflow_controls" ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_9e6ab147f4cbde41434d72");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_a74b645a1c2738fb186115" text GENERATED ALWAYS AS (CASE WHEN collection='followups' THEN NULLIF(data #>> '{payment_id}', '') ELSE NULL END) STORED;

-- followups.payment_id -> payments; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_fa23a6f2d979c7a523fb16" FOREIGN KEY ("workspace_id", "fk_a74b645a1c2738fb186115") REFERENCES public."entity_payments" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_fa23a6f2d979c7a523fb16";

CREATE INDEX "fk_bd43f91060df3d9749fb78" ON public."entity_workflow_controls" ("workspace_id", "fk_a74b645a1c2738fb186115");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_015eaac490701c6a2d85ca" text GENERATED ALWAYS AS (CASE WHEN collection='followups' THEN NULLIF(data #>> '{visit_id}', '') ELSE NULL END) STORED;

-- followups.visit_id -> visits; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_20ee76cc4b66d47753ec3a" FOREIGN KEY ("fk_cb17bdd280007897ed74c0", "workspace_id", "fk_015eaac490701c6a2d85ca") REFERENCES public."entity_workflow_controls" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_20ee76cc4b66d47753ec3a";

CREATE INDEX "fk_fc4e317dfc022dfa77c648" ON public."entity_workflow_controls" ("fk_cb17bdd280007897ed74c0", "workspace_id", "fk_015eaac490701c6a2d85ca");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_18c95b790e0d38b20922ce" text GENERATED ALWAYS AS (CASE WHEN collection='followups' THEN NULLIF(data #>> '{work_required_id}', '') ELSE NULL END) STORED;

-- followups.work_required_id -> workRequired; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_922cae38c46a97b89914ac" FOREIGN KEY ("workspace_id", "fk_18c95b790e0d38b20922ce") REFERENCES public."entity_workRequired" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_922cae38c46a97b89914ac";

CREATE INDEX "fk_8fcf4e6060c8a2c2ff9f9c" ON public."entity_workflow_controls" ("workspace_id", "fk_18c95b790e0d38b20922ce");

-- actions.customer_id -> customers; app deletion policy: restrict
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_c20abf04ca3a97d9973685" FOREIGN KEY ("workspace_id", "sd_f0c5338ed87f8da85e2a") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_c20abf04ca3a97d9973685";

CREATE INDEX "fk_54a093fe6a74d035bb8f8b" ON public."entity_workflow_controls" ("workspace_id", "sd_f0c5338ed87f8da85e2a");

-- payments.customer_id -> customers; app deletion policy: restrict
ALTER TABLE public."entity_payments" ADD CONSTRAINT "fk_cf1285a77a438f10ad44c7" FOREIGN KEY ("workspace_id", "customer_id_gen") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_payments" VALIDATE CONSTRAINT "fk_cf1285a77a438f10ad44c7";

CREATE INDEX "fk_b0baa516322a03a5c05fdf" ON public."entity_payments" ("workspace_id", "customer_id_gen");

-- payments.site_id -> sites; app deletion policy: nullify
ALTER TABLE public."entity_payments" ADD CONSTRAINT "fk_c9a501667ce2daf8eaa138" FOREIGN KEY ("workspace_id", "site_id_gen") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_payments" VALIDATE CONSTRAINT "fk_c9a501667ce2daf8eaa138";

CREATE INDEX "fk_30f5844c7b006c90474091" ON public."entity_payments" ("workspace_id", "site_id_gen");

ALTER TABLE public."entity_payments" ADD COLUMN "fk_56e30db524815172569588" text GENERATED ALWAYS AS (NULLIF(data #>> '{quotation_id}', '')) STORED;

ALTER TABLE public."entity_payments" ADD COLUMN "fk_0853d2f491d44bf1c48d8a" text GENERATED ALWAYS AS ('quotations') STORED;

-- payments.quotation_id -> quotations; app deletion policy: nullify
ALTER TABLE public."entity_payments" ADD CONSTRAINT "fk_83e828d6d00826a812222d" FOREIGN KEY ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_56e30db524815172569588") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_payments" VALIDATE CONSTRAINT "fk_83e828d6d00826a812222d";

CREATE INDEX "fk_04fccfdefe28d41ef24fb9" ON public."entity_payments" ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_56e30db524815172569588");

ALTER TABLE public."entity_payments" ADD COLUMN "fk_c101efd23d771573ca5549" text GENERATED ALWAYS AS (NULLIF(data #>> '{work_required_id}', '')) STORED;

-- payments.work_required_id -> workRequired; app deletion policy: nullify
ALTER TABLE public."entity_payments" ADD CONSTRAINT "fk_39ada450c26c1e75f9ba86" FOREIGN KEY ("workspace_id", "fk_c101efd23d771573ca5549") REFERENCES public."entity_workRequired" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_payments" VALIDATE CONSTRAINT "fk_39ada450c26c1e75f9ba86";

CREATE INDEX "fk_fb5fe58d070502ed32d943" ON public."entity_payments" ("workspace_id", "fk_c101efd23d771573ca5549");

-- invoices.customer_id -> customers; app deletion policy: restrict
ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "fk_8d20f0482a87f0e9259fa6" FOREIGN KEY ("workspace_id", "sd_de11944679c93077c0a0") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_financial_documents" VALIDATE CONSTRAINT "fk_8d20f0482a87f0e9259fa6";

CREATE INDEX "fk_1437d447e55a8cea0e1ff2" ON public."entity_financial_documents" ("workspace_id", "sd_de11944679c93077c0a0");

-- invoices.site_id -> sites; app deletion policy: nullify
ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "fk_6d9c0c786b92906df759a3" FOREIGN KEY ("workspace_id", "sd_ce2695f4fb72b9a68e00") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_financial_documents" VALIDATE CONSTRAINT "fk_6d9c0c786b92906df759a3";

CREATE INDEX "fk_ce023d368f9be7eee0e169" ON public."entity_financial_documents" ("workspace_id", "sd_ce2695f4fb72b9a68e00");

ALTER TABLE public."entity_financial_documents" ADD COLUMN "fk_f905e3166b2a22f7d6406c" text GENERATED ALWAYS AS (CASE WHEN collection='invoices' THEN NULLIF(data #>> '{quotation_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_financial_documents" ADD COLUMN "fk_0853d2f491d44bf1c48d8a" text GENERATED ALWAYS AS ('quotations') STORED;

-- invoices.quotation_id -> quotations; app deletion policy: nullify
ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "fk_c75ba5840f885c8502cd85" FOREIGN KEY ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_f905e3166b2a22f7d6406c") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_financial_documents" VALIDATE CONSTRAINT "fk_c75ba5840f885c8502cd85";

CREATE INDEX "fk_920ed14c5b22dde2cefd59" ON public."entity_financial_documents" ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_f905e3166b2a22f7d6406c");

ALTER TABLE public."entity_financial_documents" ADD COLUMN "fk_5e01330187dc9a4bbd5648" text GENERATED ALWAYS AS (CASE WHEN collection='invoices' THEN NULLIF(data #>> '{work_required_id}', '') ELSE NULL END) STORED;

-- invoices.work_required_id -> workRequired; app deletion policy: nullify
ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "fk_b5a1fc0372c1f3300a0b4f" FOREIGN KEY ("workspace_id", "fk_5e01330187dc9a4bbd5648") REFERENCES public."entity_workRequired" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_financial_documents" VALIDATE CONSTRAINT "fk_b5a1fc0372c1f3300a0b4f";

CREATE INDEX "fk_f15ada9a0aea61ae083fda" ON public."entity_financial_documents" ("workspace_id", "fk_5e01330187dc9a4bbd5648");

-- customerReceipts.customer_id -> customers; app deletion policy: restrict
ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "fk_8c770e233f848f8014e86b" FOREIGN KEY ("workspace_id", "sd_47c9fed69701c1b111b4") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_money_movements" VALIDATE CONSTRAINT "fk_8c770e233f848f8014e86b";

CREATE INDEX "fk_a5a295c02fc88a36d7a90a" ON public."entity_money_movements" ("workspace_id", "sd_47c9fed69701c1b111b4");

-- customerReceipts.site_id -> sites; app deletion policy: nullify
ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "fk_27fc624a945f80610c90b9" FOREIGN KEY ("workspace_id", "sd_677ef08b162d13bdfddc") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_money_movements" VALIDATE CONSTRAINT "fk_27fc624a945f80610c90b9";

CREATE INDEX "fk_f4b3680decef0449b814b6" ON public."entity_money_movements" ("workspace_id", "sd_677ef08b162d13bdfddc");

ALTER TABLE public."entity_money_movements" ADD COLUMN "fk_a9a90ae84db7fbfd07f73b" text GENERATED ALWAYS AS (CASE WHEN collection='customerReceipts' THEN NULLIF(data #>> '{quotation_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_money_movements" ADD COLUMN "fk_0853d2f491d44bf1c48d8a" text GENERATED ALWAYS AS ('quotations') STORED;

-- customerReceipts.quotation_id -> quotations; app deletion policy: nullify
ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "fk_5442397d12d48121452569" FOREIGN KEY ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_a9a90ae84db7fbfd07f73b") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_money_movements" VALIDATE CONSTRAINT "fk_5442397d12d48121452569";

CREATE INDEX "fk_7cc37fb59927ea1936b4f7" ON public."entity_money_movements" ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_a9a90ae84db7fbfd07f73b");

ALTER TABLE public."entity_money_movements" ADD COLUMN "fk_4f33ecf90136a97a82223e" text GENERATED ALWAYS AS (CASE WHEN collection='customerReceipts' THEN NULLIF(data #>> '{work_required_id}', '') ELSE NULL END) STORED;

-- customerReceipts.work_required_id -> workRequired; app deletion policy: nullify
ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "fk_3b278042f2b7952b5324f9" FOREIGN KEY ("workspace_id", "fk_4f33ecf90136a97a82223e") REFERENCES public."entity_workRequired" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_money_movements" VALIDATE CONSTRAINT "fk_3b278042f2b7952b5324f9";

CREATE INDEX "fk_cc4d031a9be5ebb77ad13d" ON public."entity_money_movements" ("workspace_id", "fk_4f33ecf90136a97a82223e");

-- blocked.customer_id -> customers; app deletion policy: restrict
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_fcc966b27faaa7aaf56275" FOREIGN KEY ("workspace_id", "sd_896262c53f4cfaa4f824") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_fcc966b27faaa7aaf56275";

CREATE INDEX "fk_03df1090f06037b906ebc5" ON public."entity_workflow_controls" ("workspace_id", "sd_896262c53f4cfaa4f824");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_45b72bbd42a8cec266539d" text GENERATED ALWAYS AS (CASE WHEN collection='blocked' THEN NULLIF(data #>> '{linked_work_order_id}', '') ELSE NULL END) STORED;

-- blocked.linked_work_order_id -> workOrders; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_212d5e2379cff8eb250801" FOREIGN KEY ("workspace_id", "fk_45b72bbd42a8cec266539d") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_212d5e2379cff8eb250801";

CREATE INDEX "fk_8628a386d5f87b878f3c97" ON public."entity_workflow_controls" ("workspace_id", "fk_45b72bbd42a8cec266539d");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_f9628020918880110d7e36" text GENERATED ALWAYS AS (CASE WHEN collection='blocked' THEN NULLIF(data #>> '{linked_po_id}', '') ELSE NULL END) STORED;

-- blocked.linked_po_id -> purchaseOrders; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_edc41eedf9a654983c5753" FOREIGN KEY ("fk_58501682bd9e0d1c572a17", "workspace_id", "fk_f9628020918880110d7e36") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_edc41eedf9a654983c5753";

CREATE INDEX "fk_1f1c00c8fac9def9d44cb5" ON public."entity_workflow_controls" ("fk_58501682bd9e0d1c572a17", "workspace_id", "fk_f9628020918880110d7e36");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_7409887f12a2950fccd5ac" text GENERATED ALWAYS AS (CASE WHEN collection='blocked' THEN NULLIF(data #>> '{linked_grn_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_ddc8f7d052dbed27880e70" text GENERATED ALWAYS AS ('grns') STORED;

-- blocked.linked_grn_id -> grns; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_c9dd4ab6a897087ff17502" FOREIGN KEY ("fk_ddc8f7d052dbed27880e70", "workspace_id", "fk_7409887f12a2950fccd5ac") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_c9dd4ab6a897087ff17502";

CREATE INDEX "fk_6d5ecf314bf85eb16e50b1" ON public."entity_workflow_controls" ("fk_ddc8f7d052dbed27880e70", "workspace_id", "fk_7409887f12a2950fccd5ac");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_a8f6fe983046d7581df008" text GENERATED ALWAYS AS (CASE WHEN collection='blocked' THEN NULLIF(data #>> '{linked_task_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_786ae18e16d97766002ef1" text GENERATED ALWAYS AS ('tasks') STORED;

-- blocked.linked_task_id -> tasks; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_5177fcfbc79ccd2214bedf" FOREIGN KEY ("fk_786ae18e16d97766002ef1", "workspace_id", "fk_a8f6fe983046d7581df008") REFERENCES public."entity_workflow_controls" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_5177fcfbc79ccd2214bedf";

CREATE INDEX "fk_6c2ebe2b497fd57747b068" ON public."entity_workflow_controls" ("fk_786ae18e16d97766002ef1", "workspace_id", "fk_a8f6fe983046d7581df008");

-- risks.customer_id -> customers; app deletion policy: restrict
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_0bffa47d162704b285cd11" FOREIGN KEY ("workspace_id", "sd_fdb4b4da80d2e32d77f6") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_0bffa47d162704b285cd11";

CREATE INDEX "fk_e6f6f44eeb771eb40a8cfd" ON public."entity_workflow_controls" ("workspace_id", "sd_fdb4b4da80d2e32d77f6");

-- commSends.customer_id -> customers; app deletion policy: restrict
ALTER TABLE public."entity_commSends" ADD CONSTRAINT "fk_53cff975739290e2063acc" FOREIGN KEY ("workspace_id", "customer_id_gen") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commSends" VALIDATE CONSTRAINT "fk_53cff975739290e2063acc";

CREATE INDEX "fk_95ad9d08f24b535566426a" ON public."entity_commSends" ("workspace_id", "customer_id_gen");

ALTER TABLE public."entity_commSends" ADD COLUMN "fk_2c5c0b4536abdcc14ff056" text GENERATED ALWAYS AS (NULLIF(data #>> '{followup_id}', '')) STORED;

ALTER TABLE public."entity_commSends" ADD COLUMN "fk_f8791eb9f0b3d744b237b2" text GENERATED ALWAYS AS ('followups') STORED;

-- commSends.followup_id -> followups; app deletion policy: nullify
ALTER TABLE public."entity_commSends" ADD CONSTRAINT "fk_4d700df1b51eb7efa3b48c" FOREIGN KEY ("fk_f8791eb9f0b3d744b237b2", "workspace_id", "fk_2c5c0b4536abdcc14ff056") REFERENCES public."entity_workflow_controls" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commSends" VALIDATE CONSTRAINT "fk_4d700df1b51eb7efa3b48c";

CREATE INDEX "fk_bb16ded7a7fd84358429a2" ON public."entity_commSends" ("fk_f8791eb9f0b3d744b237b2", "workspace_id", "fk_2c5c0b4536abdcc14ff056");

ALTER TABLE public."entity_commSends" ADD COLUMN "fk_8116d4f3427c949df47ded" text GENERATED ALWAYS AS (NULLIF(data #>> '{task_id}', '')) STORED;

ALTER TABLE public."entity_commSends" ADD COLUMN "fk_786ae18e16d97766002ef1" text GENERATED ALWAYS AS ('tasks') STORED;

-- commSends.task_id -> tasks; app deletion policy: nullify
ALTER TABLE public."entity_commSends" ADD CONSTRAINT "fk_8fdd7c702090caab8b51f8" FOREIGN KEY ("fk_786ae18e16d97766002ef1", "workspace_id", "fk_8116d4f3427c949df47ded") REFERENCES public."entity_workflow_controls" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commSends" VALIDATE CONSTRAINT "fk_8fdd7c702090caab8b51f8";

CREATE INDEX "fk_eec84cdd07b8ef5ca8d351" ON public."entity_commSends" ("fk_786ae18e16d97766002ef1", "workspace_id", "fk_8116d4f3427c949df47ded");

ALTER TABLE public."entity_commSends" ADD COLUMN "fk_eca7d0d9d2bbb9eb824e04" text GENERATED ALWAYS AS (NULLIF(data #>> '{work_order_id}', '')) STORED;

-- commSends.work_order_id -> workOrders; app deletion policy: nullify
ALTER TABLE public."entity_commSends" ADD CONSTRAINT "fk_6ee8fc60647b2783063872" FOREIGN KEY ("workspace_id", "fk_eca7d0d9d2bbb9eb824e04") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commSends" VALIDATE CONSTRAINT "fk_6ee8fc60647b2783063872";

CREATE INDEX "fk_8abdb5c707ac111bff2bfd" ON public."entity_commSends" ("workspace_id", "fk_eca7d0d9d2bbb9eb824e04");

ALTER TABLE public."entity_commSends" ADD COLUMN "fk_a1f6bf781a3e37dfacd04d" text GENERATED ALWAYS AS (NULLIF(data #>> '{quotation_id}', '')) STORED;

ALTER TABLE public."entity_commSends" ADD COLUMN "fk_0853d2f491d44bf1c48d8a" text GENERATED ALWAYS AS ('quotations') STORED;

-- commSends.quotation_id -> quotations; app deletion policy: nullify
ALTER TABLE public."entity_commSends" ADD CONSTRAINT "fk_9374f21ccb960ffa79cd02" FOREIGN KEY ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_a1f6bf781a3e37dfacd04d") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commSends" VALIDATE CONSTRAINT "fk_9374f21ccb960ffa79cd02";

CREATE INDEX "fk_66f4c2952f03b205eeade5" ON public."entity_commSends" ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_a1f6bf781a3e37dfacd04d");

ALTER TABLE public."entity_staff_records" ADD COLUMN "fk_7065276f232cdd338b1ab3" text GENERATED ALWAYS AS (CASE WHEN collection='attendance' THEN NULLIF(data #>> '{visit_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_staff_records" ADD COLUMN "fk_cb17bdd280007897ed74c0" text GENERATED ALWAYS AS ('visits') STORED;

-- attendance.visit_id -> visits; app deletion policy: nullify
ALTER TABLE public."entity_staff_records" ADD CONSTRAINT "fk_043da8afd9ea5b8c2785ac" FOREIGN KEY ("fk_cb17bdd280007897ed74c0", "workspace_id", "fk_7065276f232cdd338b1ab3") REFERENCES public."entity_workflow_controls" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_staff_records" VALIDATE CONSTRAINT "fk_043da8afd9ea5b8c2785ac";

CREATE INDEX "fk_0c55dd460af8a56df3d334" ON public."entity_staff_records" ("fk_cb17bdd280007897ed74c0", "workspace_id", "fk_7065276f232cdd338b1ab3");

ALTER TABLE public."entity_staff_records" ADD COLUMN "fk_5c6460df9aaca663775e94" text GENERATED ALWAYS AS (CASE WHEN collection='payrollLines' THEN NULLIF(data #>> '{payroll_period_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_staff_records" ADD COLUMN "fk_eaae0549de6f467559421f" text GENERATED ALWAYS AS ('payrollPeriods') STORED;

-- payrollLines.payroll_period_id -> payrollPeriods; app deletion policy: cascade
ALTER TABLE public."entity_staff_records" ADD CONSTRAINT "fk_c14ca020d87c9c3bc3f38f" FOREIGN KEY ("fk_eaae0549de6f467559421f", "workspace_id", "fk_5c6460df9aaca663775e94") REFERENCES public."entity_financial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_staff_records" VALIDATE CONSTRAINT "fk_c14ca020d87c9c3bc3f38f";

CREATE INDEX "fk_8158ff43a52a531d7af84d" ON public."entity_staff_records" ("fk_eaae0549de6f467559421f", "workspace_id", "fk_5c6460df9aaca663775e94");

ALTER TABLE public."entity_staff_records" ADD COLUMN "fk_d123635022cbb8957102e6" text GENERATED ALWAYS AS (CASE WHEN collection='salaryAdjustments' THEN NULLIF(data #>> '{payroll_period_id}', '') ELSE NULL END) STORED;

-- salaryAdjustments.payroll_period_id -> payrollPeriods; app deletion policy: nullify
ALTER TABLE public."entity_staff_records" ADD CONSTRAINT "fk_35c5c860e25a5dcc16e189" FOREIGN KEY ("fk_eaae0549de6f467559421f", "workspace_id", "fk_d123635022cbb8957102e6") REFERENCES public."entity_financial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_staff_records" VALIDATE CONSTRAINT "fk_35c5c860e25a5dcc16e189";

CREATE INDEX "fk_300cc9a761f5f09e5a07c4" ON public."entity_staff_records" ("fk_eaae0549de6f467559421f", "workspace_id", "fk_d123635022cbb8957102e6");

ALTER TABLE public."entity_staff_records" ADD COLUMN "fk_6450298be5f3fc93aecb02" text GENERATED ALWAYS AS (CASE WHEN collection='staffDocuments' THEN NULLIF(data #>> '{staff_id}', '') ELSE NULL END) STORED;

-- staffDocuments.staff_id -> master.staff; app deletion policy: cascade
ALTER TABLE public."entity_staff_records" ADD CONSTRAINT "fk_f582f3d14f22826ec571a0" FOREIGN KEY ("workspace_id", "fk_6450298be5f3fc93aecb02") REFERENCES public."entity_master_staff" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_staff_records" VALIDATE CONSTRAINT "fk_f582f3d14f22826ec571a0";

CREATE INDEX "fk_906d13c65fa8ea07635c7a" ON public."entity_staff_records" ("workspace_id", "fk_6450298be5f3fc93aecb02");

CREATE UNIQUE INDEX "fk_dc06761c97fed47f295b30" ON public."entity_master_fileAssets" ("workspace_id", "id");

ALTER TABLE public."entity_staff_records" ADD COLUMN "fk_23bb4d3cc09facbd3efab2" text GENERATED ALWAYS AS (CASE WHEN collection='staffDocuments' THEN NULLIF(data #>> '{file_asset_id}', '') ELSE NULL END) STORED;

-- staffDocuments.file_asset_id -> master.fileAssets; app deletion policy: nullify
ALTER TABLE public."entity_staff_records" ADD CONSTRAINT "fk_f557bae84289b51b6faefc" FOREIGN KEY ("workspace_id", "fk_23bb4d3cc09facbd3efab2") REFERENCES public."entity_master_fileAssets" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_staff_records" VALIDATE CONSTRAINT "fk_f557bae84289b51b6faefc";

CREATE INDEX "fk_b84b7843547f2d756efcd0" ON public."entity_staff_records" ("workspace_id", "fk_23bb4d3cc09facbd3efab2");

ALTER TABLE public."entity_resource_links" ADD COLUMN "fk_1fbda2e999cec542b203e5" text GENERATED ALWAYS AS (CASE WHEN collection='entityFileAttachments' THEN NULLIF(data #>> '{file_asset_id}', '') ELSE NULL END) STORED;

-- entityFileAttachments.file_asset_id -> master.fileAssets; app deletion policy: cascade
ALTER TABLE public."entity_resource_links" ADD CONSTRAINT "fk_a0fbf064aff8ed5f8949d1" FOREIGN KEY ("workspace_id", "fk_1fbda2e999cec542b203e5") REFERENCES public."entity_master_fileAssets" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_resource_links" VALIDATE CONSTRAINT "fk_a0fbf064aff8ed5f8949d1";

CREATE INDEX "fk_e3ce27ba3706016f4acba7" ON public."entity_resource_links" ("workspace_id", "fk_1fbda2e999cec542b203e5");

-- entityReferenceAssignments.customer_id -> customers; app deletion policy: nullify
ALTER TABLE public."entity_resource_links" ADD CONSTRAINT "fk_21550eb7d1816275c1b8eb" FOREIGN KEY ("workspace_id", "s2_e95cb94c8ea1b8aa43ea8ef5") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_resource_links" VALIDATE CONSTRAINT "fk_21550eb7d1816275c1b8eb";

CREATE INDEX "fk_8dcb04b91a6c1db41348d2" ON public."entity_resource_links" ("workspace_id", "s2_e95cb94c8ea1b8aa43ea8ef5");

CREATE UNIQUE INDEX "fk_0dd43a1b5f622e1fc43508" ON public."entity_master_units" ("workspace_id", "id");

ALTER TABLE public."entity_work_definitions" ADD COLUMN "fk_3aa87c542c8a07119a75f5" text GENERATED ALWAYS AS (CASE WHEN collection='master.workSubcategories' THEN NULLIF(data #>> '{unit_id}', '') ELSE NULL END) STORED;

-- master.workSubcategories.unit_id -> master.units; app deletion policy: restrict
ALTER TABLE public."entity_work_definitions" ADD CONSTRAINT "fk_047ddb16d2fc14e959860b" FOREIGN KEY ("workspace_id", "fk_3aa87c542c8a07119a75f5") REFERENCES public."entity_master_units" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_work_definitions" VALIDATE CONSTRAINT "fk_047ddb16d2fc14e959860b";

CREATE INDEX "fk_9f3e4fd8f23bbf326579df" ON public."entity_work_definitions" ("workspace_id", "fk_3aa87c542c8a07119a75f5");

CREATE UNIQUE INDEX "fk_6ee7f1574b51fb78801724" ON public."entity_work_definitions" ("collection", "workspace_id", "id");

ALTER TABLE public."entity_catalogue_items" ADD COLUMN "fk_8d4ac18b6c75f3a40e272b" text GENERATED ALWAYS AS (CASE WHEN collection='master.articles' THEN NULLIF(data #>> '{category_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_catalogue_items" ADD COLUMN "fk_0a4191a5dc2b24ac172269" text GENERATED ALWAYS AS ('master.workCategories') STORED;

-- master.articles.category_id -> master.workCategories; app deletion policy: restrict
ALTER TABLE public."entity_catalogue_items" ADD CONSTRAINT "fk_76b0e34853ce96e8cddaaa" FOREIGN KEY ("fk_0a4191a5dc2b24ac172269", "workspace_id", "fk_8d4ac18b6c75f3a40e272b") REFERENCES public."entity_work_definitions" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_catalogue_items" VALIDATE CONSTRAINT "fk_76b0e34853ce96e8cddaaa";

CREATE INDEX "fk_92f5fcb5a93d94da5452c3" ON public."entity_catalogue_items" ("fk_0a4191a5dc2b24ac172269", "workspace_id", "fk_8d4ac18b6c75f3a40e272b");

ALTER TABLE public."entity_catalogue_items" ADD COLUMN "fk_64729664196ad7b4fac07e" text GENERATED ALWAYS AS (CASE WHEN collection='master.articles' THEN NULLIF(data #>> '{unit_id}', '') ELSE NULL END) STORED;

-- master.articles.unit_id -> master.units; app deletion policy: restrict
ALTER TABLE public."entity_catalogue_items" ADD CONSTRAINT "fk_45b94fce7d4136852316a9" FOREIGN KEY ("workspace_id", "fk_64729664196ad7b4fac07e") REFERENCES public."entity_master_units" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_catalogue_items" VALIDATE CONSTRAINT "fk_45b94fce7d4136852316a9";

CREATE INDEX "fk_0d1f8bf1ad01860f051d9e" ON public."entity_catalogue_items" ("workspace_id", "fk_64729664196ad7b4fac07e");

ALTER TABLE public."entity_catalogue_items" ADD COLUMN "fk_2b043c27696eb2f750befa" text GENERATED ALWAYS AS (CASE WHEN collection='master.articles' THEN NULLIF(data #>> '{default_unit_id}', '') ELSE NULL END) STORED;

-- master.articles.default_unit_id -> master.units; app deletion policy: restrict
ALTER TABLE public."entity_catalogue_items" ADD CONSTRAINT "fk_0316b877f83df7ee315615" FOREIGN KEY ("workspace_id", "fk_2b043c27696eb2f750befa") REFERENCES public."entity_master_units" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_catalogue_items" VALIDATE CONSTRAINT "fk_0316b877f83df7ee315615";

CREATE INDEX "fk_40b0e32bdfa2eed97dc862" ON public."entity_catalogue_items" ("workspace_id", "fk_2b043c27696eb2f750befa");

ALTER TABLE public."entity_catalogue_items" ADD COLUMN "fk_462a700cfa2a2f92e72e71" text GENERATED ALWAYS AS (CASE WHEN collection='master.articleVariants' THEN NULLIF(data #>> '{unit_id}', '') ELSE NULL END) STORED;

-- master.articleVariants.unit_id -> master.units; app deletion policy: restrict
ALTER TABLE public."entity_catalogue_items" ADD CONSTRAINT "fk_d1fa09ff4dbc0b4bde5bad" FOREIGN KEY ("workspace_id", "fk_462a700cfa2a2f92e72e71") REFERENCES public."entity_master_units" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_catalogue_items" VALIDATE CONSTRAINT "fk_d1fa09ff4dbc0b4bde5bad";

CREATE INDEX "fk_9083b83386ba7cc1ba423b" ON public."entity_catalogue_items" ("workspace_id", "fk_462a700cfa2a2f92e72e71");

ALTER TABLE public."entity_master_subcategoryArticleMap" ADD COLUMN "fk_0d1809aab48570397ef8b2" text GENERATED ALWAYS AS (NULLIF(data #>> '{unit_id}', '')) STORED;

-- master.subcategoryArticleMap.unit_id -> master.units; app deletion policy: restrict
ALTER TABLE public."entity_master_subcategoryArticleMap" ADD CONSTRAINT "fk_0719d709820e3085d41bf3" FOREIGN KEY ("workspace_id", "fk_0d1809aab48570397ef8b2") REFERENCES public."entity_master_units" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_master_subcategoryArticleMap" VALIDATE CONSTRAINT "fk_0719d709820e3085d41bf3";

CREATE INDEX "fk_3d956ed098e3f450822bcd" ON public."entity_master_subcategoryArticleMap" ("workspace_id", "fk_0d1809aab48570397ef8b2");

ALTER TABLE public."entity_rate_cards" ADD COLUMN "fk_9036586dfc79f0010d2c24" text GENERATED ALWAYS AS (CASE WHEN collection='master.vendorRates' THEN NULLIF(data #>> '{variant_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_rate_cards" ADD COLUMN "fk_1cd70b4cd2f5d99a0c26d7" text GENERATED ALWAYS AS ('master.articleVariants') STORED;

-- master.vendorRates.variant_id -> master.articleVariants; app deletion policy: restrict
ALTER TABLE public."entity_rate_cards" ADD CONSTRAINT "fk_4893032f2f7289a5849130" FOREIGN KEY ("fk_1cd70b4cd2f5d99a0c26d7", "workspace_id", "fk_9036586dfc79f0010d2c24") REFERENCES public."entity_catalogue_items" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_rate_cards" VALIDATE CONSTRAINT "fk_4893032f2f7289a5849130";

CREATE INDEX "fk_7c6431ca257c1cd4fc1a45" ON public."entity_rate_cards" ("fk_1cd70b4cd2f5d99a0c26d7", "workspace_id", "fk_9036586dfc79f0010d2c24");

ALTER TABLE public."entity_rate_cards" ADD COLUMN "fk_bd0c38735e2cc52effab0b" text GENERATED ALWAYS AS (CASE WHEN collection='master.vendorRateHistories' THEN NULLIF(data #>> '{variant_id}', '') ELSE NULL END) STORED;

-- master.vendorRateHistories.variant_id -> master.articleVariants; app deletion policy: restrict
ALTER TABLE public."entity_rate_cards" ADD CONSTRAINT "fk_dab7a1ee8bd53014931a2b" FOREIGN KEY ("fk_1cd70b4cd2f5d99a0c26d7", "workspace_id", "fk_bd0c38735e2cc52effab0b") REFERENCES public."entity_catalogue_items" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_rate_cards" VALIDATE CONSTRAINT "fk_dab7a1ee8bd53014931a2b";

CREATE INDEX "fk_6831b8bf3687647ac7c096" ON public."entity_rate_cards" ("fk_1cd70b4cd2f5d99a0c26d7", "workspace_id", "fk_bd0c38735e2cc52effab0b");

ALTER TABLE public."entity_rate_cards" ADD COLUMN "fk_21939ac50c88698434a400" text GENERATED ALWAYS AS (CASE WHEN collection='master.vendorRateHistories' THEN NULLIF(data #>> '{unit_id}', '') ELSE NULL END) STORED;

-- master.vendorRateHistories.unit_id -> master.units; app deletion policy: restrict
ALTER TABLE public."entity_rate_cards" ADD CONSTRAINT "fk_612ceebc10d94a5b4bf6b5" FOREIGN KEY ("workspace_id", "fk_21939ac50c88698434a400") REFERENCES public."entity_master_units" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_rate_cards" VALIDATE CONSTRAINT "fk_612ceebc10d94a5b4bf6b5";

CREATE INDEX "fk_b2d630fd9cf7c8420971fb" ON public."entity_rate_cards" ("workspace_id", "fk_21939ac50c88698434a400");

ALTER TABLE public."entity_rate_cards" ADD COLUMN "fk_80449abae91c8de40a6463" text GENERATED ALWAYS AS (CASE WHEN collection='master.contractorRates' THEN NULLIF(data #>> '{unit_id}', '') ELSE NULL END) STORED;

-- master.contractorRates.unit_id -> master.units; app deletion policy: restrict
ALTER TABLE public."entity_rate_cards" ADD CONSTRAINT "fk_1a23fccb040cb433a7e028" FOREIGN KEY ("workspace_id", "fk_80449abae91c8de40a6463") REFERENCES public."entity_master_units" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_rate_cards" VALIDATE CONSTRAINT "fk_1a23fccb040cb433a7e028";

CREATE INDEX "fk_968332196b39bd6075d9c6" ON public."entity_rate_cards" ("workspace_id", "fk_80449abae91c8de40a6463");

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" ADD COLUMN "fk_450feed94fbcd78825b5c6" text GENERATED ALWAYS AS (NULLIF(data #>> '{variant_id}', '')) STORED;

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" ADD COLUMN "fk_1cd70b4cd2f5d99a0c26d7" text GENERATED ALWAYS AS ('master.articleVariants') STORED;

-- master.catalogueArticleVendorLinks.variant_id -> master.articleVariants; app deletion policy: nullify
ALTER TABLE public."entity_master_catalogueArticleVendorLinks" ADD CONSTRAINT "fk_2a8bd38a5fcd576b947540" FOREIGN KEY ("fk_1cd70b4cd2f5d99a0c26d7", "workspace_id", "fk_450feed94fbcd78825b5c6") REFERENCES public."entity_catalogue_items" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" VALIDATE CONSTRAINT "fk_2a8bd38a5fcd576b947540";

CREATE INDEX "fk_678eb5a158560e59b16ff9" ON public."entity_master_catalogueArticleVendorLinks" ("fk_1cd70b4cd2f5d99a0c26d7", "workspace_id", "fk_450feed94fbcd78825b5c6");

ALTER TABLE public."entity_reference_libraries" ADD COLUMN "fk_72c2c7ca8f6d8afbe4c5f3" text GENERATED ALWAYS AS (CASE WHEN collection='master.pinterestBoards' THEN NULLIF(data #>> '{variant_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_reference_libraries" ADD COLUMN "fk_1cd70b4cd2f5d99a0c26d7" text GENERATED ALWAYS AS ('master.articleVariants') STORED;

-- master.pinterestBoards.variant_id -> master.articleVariants; app deletion policy: nullify
ALTER TABLE public."entity_reference_libraries" ADD CONSTRAINT "fk_30ec54b01fa74a7a8d0d07" FOREIGN KEY ("fk_1cd70b4cd2f5d99a0c26d7", "workspace_id", "fk_72c2c7ca8f6d8afbe4c5f3") REFERENCES public."entity_catalogue_items" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_reference_libraries" VALIDATE CONSTRAINT "fk_30ec54b01fa74a7a8d0d07";

CREATE INDEX "fk_dc4e0aac3c3dc60d9ea6b9" ON public."entity_reference_libraries" ("fk_1cd70b4cd2f5d99a0c26d7", "workspace_id", "fk_72c2c7ca8f6d8afbe4c5f3");

ALTER TABLE public."entity_reference_libraries" ADD COLUMN "fk_16aa0919054a7866b8b06c" text GENERATED ALWAYS AS (CASE WHEN collection='master.referenceMedia' THEN NULLIF(data #>> '{variant_id}', '') ELSE NULL END) STORED;

-- master.referenceMedia.variant_id -> master.articleVariants; app deletion policy: nullify
ALTER TABLE public."entity_reference_libraries" ADD CONSTRAINT "fk_e3285006b957a5ca96e15d" FOREIGN KEY ("fk_1cd70b4cd2f5d99a0c26d7", "workspace_id", "fk_16aa0919054a7866b8b06c") REFERENCES public."entity_catalogue_items" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_reference_libraries" VALIDATE CONSTRAINT "fk_e3285006b957a5ca96e15d";

CREATE INDEX "fk_7db8e3cb99d7e818fa8b36" ON public."entity_reference_libraries" ("fk_1cd70b4cd2f5d99a0c26d7", "workspace_id", "fk_16aa0919054a7866b8b06c");

ALTER TABLE public."entity_reference_libraries" ADD COLUMN "fk_5193d9bda360797cd48056" text GENERATED ALWAYS AS (CASE WHEN collection='master.referenceMedia' THEN NULLIF(data #>> '{drive_asset_id}', '') ELSE NULL END) STORED;

-- master.referenceMedia.drive_asset_id -> master.fileAssets; app deletion policy: nullify
ALTER TABLE public."entity_reference_libraries" ADD CONSTRAINT "fk_8a12108e61dd4313fada92" FOREIGN KEY ("workspace_id", "fk_5193d9bda360797cd48056") REFERENCES public."entity_master_fileAssets" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_reference_libraries" VALIDATE CONSTRAINT "fk_8a12108e61dd4313fada92";

CREATE INDEX "fk_9832a23fc70f1585efde16" ON public."entity_reference_libraries" ("workspace_id", "fk_5193d9bda360797cd48056");

ALTER TABLE public."entity_master_staff" ADD COLUMN "fk_79551058039cd5c6c71b26" text GENERATED ALWAYS AS (NULLIF(data #>> '{reporting_manager_id}', '')) STORED;

-- master.staff.reporting_manager_id -> master.staff; app deletion policy: nullify
ALTER TABLE public."entity_master_staff" ADD CONSTRAINT "fk_d5824d7c2e0078dfdd7680" FOREIGN KEY ("workspace_id", "fk_79551058039cd5c6c71b26") REFERENCES public."entity_master_staff" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_master_staff" VALIDATE CONSTRAINT "fk_d5824d7c2e0078dfdd7680";

CREATE INDEX "fk_4ac28ecb21a11b2d2e3837" ON public."entity_master_staff" ("workspace_id", "fk_79551058039cd5c6c71b26");

ALTER TABLE public."entity_resource_links" ADD COLUMN "fk_d46b91a12d72bcfed87daa" text GENERATED ALWAYS AS (CASE WHEN collection='entityReferenceAssignments' THEN NULLIF(data #>> '{work_required_id}', '') ELSE NULL END) STORED;

-- entityReferenceAssignments.work_required_id -> workRequired; app deletion policy: nullify
ALTER TABLE public."entity_resource_links" ADD CONSTRAINT "fk_b8130bab04531bbc185482" FOREIGN KEY ("workspace_id", "fk_d46b91a12d72bcfed87daa") REFERENCES public."entity_workRequired" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_resource_links" VALIDATE CONSTRAINT "fk_b8130bab04531bbc185482";

CREATE INDEX "fk_2cbae80599de4f0e646404" ON public."entity_resource_links" ("workspace_id", "fk_d46b91a12d72bcfed87daa");

ALTER TABLE public."entity_resource_links" ADD COLUMN "fk_2512295419b9a39864a673" text GENERATED ALWAYS AS (CASE WHEN collection='entityReferenceAssignments' THEN NULLIF(data #>> '{quotation_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_resource_links" ADD COLUMN "fk_0853d2f491d44bf1c48d8a" text GENERATED ALWAYS AS ('quotations') STORED;

-- entityReferenceAssignments.quotation_id -> quotations; app deletion policy: nullify
ALTER TABLE public."entity_resource_links" ADD CONSTRAINT "fk_44bc09dbee3eebc40dbdf0" FOREIGN KEY ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_2512295419b9a39864a673") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_resource_links" VALIDATE CONSTRAINT "fk_44bc09dbee3eebc40dbdf0";

CREATE INDEX "fk_2d59bb982dc6cad8ed47b3" ON public."entity_resource_links" ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_2512295419b9a39864a673");

ALTER TABLE public."entity_resource_links" ADD COLUMN "fk_67e5ddaef114bebb77b9a8" text GENERATED ALWAYS AS (CASE WHEN collection='entityReferenceAssignments' THEN NULLIF(data #>> '{work_order_id}', '') ELSE NULL END) STORED;

-- entityReferenceAssignments.work_order_id -> workOrders; app deletion policy: nullify
ALTER TABLE public."entity_resource_links" ADD CONSTRAINT "fk_e4c89c6668648d6d6a38dd" FOREIGN KEY ("workspace_id", "fk_67e5ddaef114bebb77b9a8") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_resource_links" VALIDATE CONSTRAINT "fk_e4c89c6668648d6d6a38dd";

CREATE INDEX "fk_5dbfcc74d05a2af18d050a" ON public."entity_resource_links" ("workspace_id", "fk_67e5ddaef114bebb77b9a8");

-- entityReferenceAssignments.site_id -> sites; app deletion policy: nullify
ALTER TABLE public."entity_resource_links" ADD CONSTRAINT "fk_03e6c659b1b66f93ba5351" FOREIGN KEY ("workspace_id", "s2_2d6b1f960eadf05eb2ff22ed") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_resource_links" VALIDATE CONSTRAINT "fk_03e6c659b1b66f93ba5351";

CREATE INDEX "fk_e5da3eb8e85f77c6fd613f" ON public."entity_resource_links" ("workspace_id", "s2_2d6b1f960eadf05eb2ff22ed");

ALTER TABLE public."entity_resource_links" ADD COLUMN "fk_988c7a31f569779d03359c" text GENERATED ALWAYS AS (CASE WHEN collection='entityReferenceAssignments' THEN NULLIF(data #>> '{area_id}', '') ELSE NULL END) STORED;

-- entityReferenceAssignments.area_id -> areas; app deletion policy: nullify
ALTER TABLE public."entity_resource_links" ADD CONSTRAINT "fk_b119b36fa2d719fdf85e55" FOREIGN KEY ("workspace_id", "fk_988c7a31f569779d03359c") REFERENCES public."entity_areas" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_resource_links" VALIDATE CONSTRAINT "fk_b119b36fa2d719fdf85e55";

CREATE INDEX "fk_e8525a3ddee08baa5695a2" ON public."entity_resource_links" ("workspace_id", "fk_988c7a31f569779d03359c");

ALTER TABLE public."entity_resource_links" ADD COLUMN "fk_cc680ef9f9a8fd7faf9966" text GENERATED ALWAYS AS (CASE WHEN collection='entityReferenceAssignments' THEN NULLIF(data #>> '{article_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_resource_links" ADD COLUMN "fk_fac422498fa0394b160927" text GENERATED ALWAYS AS ('master.articles') STORED;

-- entityReferenceAssignments.article_id -> master.articles; app deletion policy: nullify
ALTER TABLE public."entity_resource_links" ADD CONSTRAINT "fk_a8ab1b3daf2e5e43875fe0" FOREIGN KEY ("fk_fac422498fa0394b160927", "workspace_id", "fk_cc680ef9f9a8fd7faf9966") REFERENCES public."entity_catalogue_items" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_resource_links" VALIDATE CONSTRAINT "fk_a8ab1b3daf2e5e43875fe0";

CREATE INDEX "fk_0050680e52a5b5adb053a1" ON public."entity_resource_links" ("fk_fac422498fa0394b160927", "workspace_id", "fk_cc680ef9f9a8fd7faf9966");

ALTER TABLE public."entity_resource_links" ADD COLUMN "fk_b9ad05508e51eb1fe23ba5" text GENERATED ALWAYS AS (CASE WHEN collection='entityReferenceAssignments' THEN NULLIF(data #>> '{variant_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_resource_links" ADD COLUMN "fk_1cd70b4cd2f5d99a0c26d7" text GENERATED ALWAYS AS ('master.articleVariants') STORED;

-- entityReferenceAssignments.variant_id -> master.articleVariants; app deletion policy: nullify
ALTER TABLE public."entity_resource_links" ADD CONSTRAINT "fk_9789435ef6453688c148db" FOREIGN KEY ("fk_1cd70b4cd2f5d99a0c26d7", "workspace_id", "fk_b9ad05508e51eb1fe23ba5") REFERENCES public."entity_catalogue_items" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_resource_links" VALIDATE CONSTRAINT "fk_9789435ef6453688c148db";

CREATE INDEX "fk_34de51124f663c6852dd7a" ON public."entity_resource_links" ("fk_1cd70b4cd2f5d99a0c26d7", "workspace_id", "fk_b9ad05508e51eb1fe23ba5");

ALTER TABLE public."entity_resource_links" ADD COLUMN "fk_68b7ee5b9f1b742d44f9e8" text GENERATED ALWAYS AS (CASE WHEN collection='entityReferenceAssignments' THEN NULLIF(data #>> '{vendor_id}', '') ELSE NULL END) STORED;

-- entityReferenceAssignments.vendor_id -> master.vendors; app deletion policy: nullify
ALTER TABLE public."entity_resource_links" ADD CONSTRAINT "fk_cc6bb7aca07614b0969a0f" FOREIGN KEY ("workspace_id", "fk_68b7ee5b9f1b742d44f9e8") REFERENCES public."entity_master_vendors" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_resource_links" VALIDATE CONSTRAINT "fk_cc6bb7aca07614b0969a0f";

CREATE INDEX "fk_03ae3ac594d61fe74fcda9" ON public."entity_resource_links" ("workspace_id", "fk_68b7ee5b9f1b742d44f9e8");

ALTER TABLE public."entity_work_definitions" ADD COLUMN "fk_9780631d80052ebe69fca1" text GENERATED ALWAYS AS (CASE WHEN collection='master.workSubcategories' THEN NULLIF(data #>> '{category_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_work_definitions" ADD COLUMN "fk_0a4191a5dc2b24ac172269" text GENERATED ALWAYS AS ('master.workCategories') STORED;

-- master.workSubcategories.category_id -> master.workCategories; app deletion policy: restrict
ALTER TABLE public."entity_work_definitions" ADD CONSTRAINT "fk_ff30651d3512aee0de3c63" FOREIGN KEY ("fk_0a4191a5dc2b24ac172269", "workspace_id", "fk_9780631d80052ebe69fca1") REFERENCES public."entity_work_definitions" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_work_definitions" VALIDATE CONSTRAINT "fk_ff30651d3512aee0de3c63";

CREATE INDEX "fk_03e906974f5d38dcebcf78" ON public."entity_work_definitions" ("fk_0a4191a5dc2b24ac172269", "workspace_id", "fk_9780631d80052ebe69fca1");

ALTER TABLE public."entity_rate_cards" ADD COLUMN "fk_603f8b15b82ee7fd2ef97c" text GENERATED ALWAYS AS (CASE WHEN collection='master.vendorRates' THEN NULLIF(data #>> '{vendor_id}', '') ELSE NULL END) STORED;

-- master.vendorRates.vendor_id -> master.vendors; app deletion policy: cascade
ALTER TABLE public."entity_rate_cards" ADD CONSTRAINT "fk_a00a6b817ca3aef987c5f2" FOREIGN KEY ("workspace_id", "fk_603f8b15b82ee7fd2ef97c") REFERENCES public."entity_master_vendors" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_rate_cards" VALIDATE CONSTRAINT "fk_a00a6b817ca3aef987c5f2";

CREATE INDEX "fk_570bd797912659852dd7de" ON public."entity_rate_cards" ("workspace_id", "fk_603f8b15b82ee7fd2ef97c");

ALTER TABLE public."entity_rate_cards" ADD COLUMN "fk_8a507531c7acecd235a7b0" text GENERATED ALWAYS AS (CASE WHEN collection='master.vendorRates' THEN NULLIF(data #>> '{work_required_article_id}', '') ELSE NULL END) STORED;

-- master.vendorRates.work_required_article_id -> master.subcategoryArticleMap; app deletion policy: cascade
ALTER TABLE public."entity_rate_cards" ADD CONSTRAINT "fk_a0efd2f35ab05077f511f0" FOREIGN KEY ("workspace_id", "fk_8a507531c7acecd235a7b0") REFERENCES public."entity_master_subcategoryArticleMap" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_rate_cards" VALIDATE CONSTRAINT "fk_a0efd2f35ab05077f511f0";

CREATE INDEX "fk_997a198b1800a00d131c37" ON public."entity_rate_cards" ("workspace_id", "fk_8a507531c7acecd235a7b0");

ALTER TABLE public."entity_rate_cards" ADD COLUMN "fk_25e0f870855581899ddfd0" text GENERATED ALWAYS AS (CASE WHEN collection='master.vendorRates' THEN NULLIF(data #>> '{article_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_rate_cards" ADD COLUMN "fk_fac422498fa0394b160927" text GENERATED ALWAYS AS ('master.articles') STORED;

-- master.vendorRates.article_id -> master.articles; app deletion policy: restrict
ALTER TABLE public."entity_rate_cards" ADD CONSTRAINT "fk_5ec0cee6ba814707ea61b9" FOREIGN KEY ("fk_fac422498fa0394b160927", "workspace_id", "fk_25e0f870855581899ddfd0") REFERENCES public."entity_catalogue_items" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_rate_cards" VALIDATE CONSTRAINT "fk_5ec0cee6ba814707ea61b9";

CREATE INDEX "fk_6a22fd7b233dda1bdda93f" ON public."entity_rate_cards" ("fk_fac422498fa0394b160927", "workspace_id", "fk_25e0f870855581899ddfd0");

CREATE UNIQUE INDEX "fk_9b5737296f750d513eaa24" ON public."entity_rate_cards" ("collection", "workspace_id", "id");

ALTER TABLE public."entity_rate_cards" ADD COLUMN "fk_c9d9abf3c52bdbfe1d7002" text GENERATED ALWAYS AS (CASE WHEN collection='master.vendorRateHistories' THEN NULLIF(data #>> '{vendor_rate_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_rate_cards" ADD COLUMN "fk_99f284dcefe36ba0909b03" text GENERATED ALWAYS AS ('master.vendorRates') STORED;

-- master.vendorRateHistories.vendor_rate_id -> master.vendorRates; app deletion policy: cascade
ALTER TABLE public."entity_rate_cards" ADD CONSTRAINT "fk_ba1489a7467d62a916f6de" FOREIGN KEY ("fk_99f284dcefe36ba0909b03", "workspace_id", "fk_c9d9abf3c52bdbfe1d7002") REFERENCES public."entity_rate_cards" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_rate_cards" VALIDATE CONSTRAINT "fk_ba1489a7467d62a916f6de";

CREATE INDEX "fk_c6c187db1d0554a196268f" ON public."entity_rate_cards" ("fk_99f284dcefe36ba0909b03", "workspace_id", "fk_c9d9abf3c52bdbfe1d7002");

ALTER TABLE public."entity_rate_cards" ADD COLUMN "fk_0fada2c2bbf5136e0c8b7d" text GENERATED ALWAYS AS (CASE WHEN collection='master.vendorRateHistories' THEN NULLIF(data #>> '{vendor_id}', '') ELSE NULL END) STORED;

-- master.vendorRateHistories.vendor_id -> master.vendors; app deletion policy: cascade
ALTER TABLE public."entity_rate_cards" ADD CONSTRAINT "fk_971b5def97b033c6faa476" FOREIGN KEY ("workspace_id", "fk_0fada2c2bbf5136e0c8b7d") REFERENCES public."entity_master_vendors" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_rate_cards" VALIDATE CONSTRAINT "fk_971b5def97b033c6faa476";

CREATE INDEX "fk_6caaeedfadd60bcd67e073" ON public."entity_rate_cards" ("workspace_id", "fk_0fada2c2bbf5136e0c8b7d");

ALTER TABLE public."entity_rate_cards" ADD COLUMN "fk_e6a6594c5c41000dab09c6" text GENERATED ALWAYS AS (CASE WHEN collection='master.vendorRateHistories' THEN NULLIF(data #>> '{article_id}', '') ELSE NULL END) STORED;

-- master.vendorRateHistories.article_id -> master.articles; app deletion policy: restrict
ALTER TABLE public."entity_rate_cards" ADD CONSTRAINT "fk_ce3106120d3face6bac506" FOREIGN KEY ("fk_fac422498fa0394b160927", "workspace_id", "fk_e6a6594c5c41000dab09c6") REFERENCES public."entity_catalogue_items" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_rate_cards" VALIDATE CONSTRAINT "fk_ce3106120d3face6bac506";

CREATE INDEX "fk_d0937b2a3ddf033ab7daa5" ON public."entity_rate_cards" ("fk_fac422498fa0394b160927", "workspace_id", "fk_e6a6594c5c41000dab09c6");

ALTER TABLE public."entity_rate_cards" ADD COLUMN "fk_95016ddea22546dd84d5a8" text GENERATED ALWAYS AS (CASE WHEN collection='master.vendorRateHistories' THEN NULLIF(data #>> '{work_required_article_id}', '') ELSE NULL END) STORED;

-- master.vendorRateHistories.work_required_article_id -> master.subcategoryArticleMap; app deletion policy: cascade
ALTER TABLE public."entity_rate_cards" ADD CONSTRAINT "fk_9643810caa3ead0b4efbbd" FOREIGN KEY ("workspace_id", "fk_95016ddea22546dd84d5a8") REFERENCES public."entity_master_subcategoryArticleMap" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_rate_cards" VALIDATE CONSTRAINT "fk_9643810caa3ead0b4efbbd";

CREATE INDEX "fk_c5191e8f17ba1e69403a91" ON public."entity_rate_cards" ("workspace_id", "fk_95016ddea22546dd84d5a8");

ALTER TABLE public."entity_rate_cards" ADD COLUMN "fk_8ef9871636db8a181fb5ce" text GENERATED ALWAYS AS (CASE WHEN collection='master.contractorRates' THEN NULLIF(data #>> '{contractor_id}', '') ELSE NULL END) STORED;

-- master.contractorRates.contractor_id -> master.contractors; app deletion policy: cascade
ALTER TABLE public."entity_rate_cards" ADD CONSTRAINT "fk_a3f6e42cb3248301ffb4b1" FOREIGN KEY ("workspace_id", "fk_8ef9871636db8a181fb5ce") REFERENCES public."entity_master_contractors" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_rate_cards" VALIDATE CONSTRAINT "fk_a3f6e42cb3248301ffb4b1";

CREATE INDEX "fk_ae1332ebad52079f959b67" ON public."entity_rate_cards" ("workspace_id", "fk_8ef9871636db8a181fb5ce");

ALTER TABLE public."entity_catalogue_items" ADD COLUMN "fk_7a840400af1160b43d9f67" text GENERATED ALWAYS AS (CASE WHEN collection='master.articleVariants' THEN NULLIF(data #>> '{article_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_catalogue_items" ADD COLUMN "fk_fac422498fa0394b160927" text GENERATED ALWAYS AS ('master.articles') STORED;

-- master.articleVariants.article_id -> master.articles; app deletion policy: cascade
ALTER TABLE public."entity_catalogue_items" ADD CONSTRAINT "fk_d8a77b5ec3116469055396" FOREIGN KEY ("fk_fac422498fa0394b160927", "workspace_id", "fk_7a840400af1160b43d9f67") REFERENCES public."entity_catalogue_items" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_catalogue_items" VALIDATE CONSTRAINT "fk_d8a77b5ec3116469055396";

CREATE INDEX "fk_ff314fdfbe03b7725d6149" ON public."entity_catalogue_items" ("fk_fac422498fa0394b160927", "workspace_id", "fk_7a840400af1160b43d9f67");

ALTER TABLE public."entity_catalogue_items" ADD COLUMN "fk_6ebf8ddcf6a612bca71b60" text GENERATED ALWAYS AS (CASE WHEN collection='master.articleVariants' THEN NULLIF(data #>> '{work_required_article_id}', '') ELSE NULL END) STORED;

-- master.articleVariants.work_required_article_id -> master.subcategoryArticleMap; app deletion policy: nullify
ALTER TABLE public."entity_catalogue_items" ADD CONSTRAINT "fk_690423a8fc82dc079a02e2" FOREIGN KEY ("workspace_id", "fk_6ebf8ddcf6a612bca71b60") REFERENCES public."entity_master_subcategoryArticleMap" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_catalogue_items" VALIDATE CONSTRAINT "fk_690423a8fc82dc079a02e2";

CREATE INDEX "fk_4e01a1a66fe43774f7e5b1" ON public."entity_catalogue_items" ("workspace_id", "fk_6ebf8ddcf6a612bca71b60");

ALTER TABLE public."entity_master_subcategoryArticleMap" ADD COLUMN "fk_b36ddbb4bc654531c3c1cc" text GENERATED ALWAYS AS (NULLIF(data #>> '{article_id}', '')) STORED;

ALTER TABLE public."entity_master_subcategoryArticleMap" ADD COLUMN "fk_fac422498fa0394b160927" text GENERATED ALWAYS AS ('master.articles') STORED;

-- master.subcategoryArticleMap.article_id -> master.articles; app deletion policy: cascade
ALTER TABLE public."entity_master_subcategoryArticleMap" ADD CONSTRAINT "fk_ff3246da63474a9e259d2a" FOREIGN KEY ("fk_fac422498fa0394b160927", "workspace_id", "fk_b36ddbb4bc654531c3c1cc") REFERENCES public."entity_catalogue_items" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_master_subcategoryArticleMap" VALIDATE CONSTRAINT "fk_ff3246da63474a9e259d2a";

CREATE INDEX "fk_ca6f9c6baac61d8be8723e" ON public."entity_master_subcategoryArticleMap" ("fk_fac422498fa0394b160927", "workspace_id", "fk_b36ddbb4bc654531c3c1cc");

ALTER TABLE public."entity_master_subcategoryArticleMap" ADD COLUMN "fk_6e9bdb1ecfdba3041d6b95" text GENERATED ALWAYS AS (NULLIF(data #>> '{work_required_id}', '')) STORED;

ALTER TABLE public."entity_master_subcategoryArticleMap" ADD COLUMN "fk_2654525b51c04b0efab6ef" text GENERATED ALWAYS AS ('master.workSubcategories') STORED;

-- master.subcategoryArticleMap.work_required_id -> master.workSubcategories; app deletion policy: cascade
ALTER TABLE public."entity_master_subcategoryArticleMap" ADD CONSTRAINT "fk_ffa522476204b5ac6d5cb8" FOREIGN KEY ("fk_2654525b51c04b0efab6ef", "workspace_id", "fk_6e9bdb1ecfdba3041d6b95") REFERENCES public."entity_work_definitions" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_master_subcategoryArticleMap" VALIDATE CONSTRAINT "fk_ffa522476204b5ac6d5cb8";

CREATE INDEX "fk_0fefc561eb965cb7905794" ON public."entity_master_subcategoryArticleMap" ("fk_2654525b51c04b0efab6ef", "workspace_id", "fk_6e9bdb1ecfdba3041d6b95");

CREATE UNIQUE INDEX "fk_e3ec6471348a42397db311" ON public."entity_master_storageAccounts" ("workspace_id", "id");

ALTER TABLE public."entity_storage_structure" ADD COLUMN "fk_04da0de8aae155ec9bd994" text GENERATED ALWAYS AS (CASE WHEN collection='master.storageFolderInstances' THEN NULLIF(data #>> '{storage_account_id}', '') ELSE NULL END) STORED;

-- master.storageFolderInstances.storage_account_id -> master.storageAccounts; app deletion policy: restrict
ALTER TABLE public."entity_storage_structure" ADD CONSTRAINT "fk_94e0ba3236627460d6d78f" FOREIGN KEY ("workspace_id", "fk_04da0de8aae155ec9bd994") REFERENCES public."entity_master_storageAccounts" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_storage_structure" VALIDATE CONSTRAINT "fk_94e0ba3236627460d6d78f";

CREATE INDEX "fk_cd394b471fe93dc7eb9e4a" ON public."entity_storage_structure" ("workspace_id", "fk_04da0de8aae155ec9bd994");

CREATE UNIQUE INDEX "fk_40174ed2a1e20be61e52db" ON public."entity_storage_structure" ("collection", "workspace_id", "id");

ALTER TABLE public."entity_storage_structure" ADD COLUMN "fk_1081b559071058ce2d5ab7" text GENERATED ALWAYS AS (CASE WHEN collection='master.storageFolderInstances' THEN NULLIF(data #>> '{template_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_storage_structure" ADD COLUMN "fk_44a69c42015c8241b55452" text GENERATED ALWAYS AS ('master.storageFolderTemplates') STORED;

-- master.storageFolderInstances.template_id -> master.storageFolderTemplates; app deletion policy: restrict
ALTER TABLE public."entity_storage_structure" ADD CONSTRAINT "fk_2ab1e850dfae68b9c8545c" FOREIGN KEY ("fk_44a69c42015c8241b55452", "workspace_id", "fk_1081b559071058ce2d5ab7") REFERENCES public."entity_storage_structure" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_storage_structure" VALIDATE CONSTRAINT "fk_2ab1e850dfae68b9c8545c";

CREATE INDEX "fk_35a2aa7802eeef6e18286d" ON public."entity_storage_structure" ("fk_44a69c42015c8241b55452", "workspace_id", "fk_1081b559071058ce2d5ab7");

ALTER TABLE public."entity_master_fileAssets" ADD COLUMN "fk_f0c5c2f590dc58858709dc" text GENERATED ALWAYS AS (NULLIF(data #>> '{storage_account_id}', '')) STORED;

-- master.fileAssets.storage_account_id -> master.storageAccounts; app deletion policy: nullify
ALTER TABLE public."entity_master_fileAssets" ADD CONSTRAINT "fk_c0358e578d3f1482bd2fae" FOREIGN KEY ("workspace_id", "fk_f0c5c2f590dc58858709dc") REFERENCES public."entity_master_storageAccounts" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_master_fileAssets" VALIDATE CONSTRAINT "fk_c0358e578d3f1482bd2fae";

CREATE INDEX "fk_843cde6c244a26a793dd03" ON public."entity_master_fileAssets" ("workspace_id", "fk_f0c5c2f590dc58858709dc");

ALTER TABLE public."entity_master_fileAssets" ADD COLUMN "fk_62f1eb46eaa5b05fb32879" text GENERATED ALWAYS AS (NULLIF(data #>> '{storage_folder_instance_id}', '')) STORED;

ALTER TABLE public."entity_master_fileAssets" ADD COLUMN "fk_9ae333c9d8fa30ce724a0e" text GENERATED ALWAYS AS ('master.storageFolderInstances') STORED;

-- master.fileAssets.storage_folder_instance_id -> master.storageFolderInstances; app deletion policy: nullify
ALTER TABLE public."entity_master_fileAssets" ADD CONSTRAINT "fk_09d09780e9d212f7d3688b" FOREIGN KEY ("fk_9ae333c9d8fa30ce724a0e", "workspace_id", "fk_62f1eb46eaa5b05fb32879") REFERENCES public."entity_storage_structure" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_master_fileAssets" VALIDATE CONSTRAINT "fk_09d09780e9d212f7d3688b";

CREATE INDEX "fk_d46a48c209e1f5a7024b07" ON public."entity_master_fileAssets" ("fk_9ae333c9d8fa30ce724a0e", "workspace_id", "fk_62f1eb46eaa5b05fb32879");

CREATE UNIQUE INDEX "fk_9288d6831e14b2f840982d" ON public."entity_reference_libraries" ("collection", "workspace_id", "id");

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" ADD COLUMN "fk_c703e5cfa8df4a9d2336f2" text GENERATED ALWAYS AS (NULLIF(data #>> '{catalogue_id}', '')) STORED;

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" ADD COLUMN "fk_236135feae33ca9ca3b0cd" text GENERATED ALWAYS AS ('master.catalogues') STORED;

-- master.catalogueArticleVendorLinks.catalogue_id -> master.catalogues; app deletion policy: cascade
ALTER TABLE public."entity_master_catalogueArticleVendorLinks" ADD CONSTRAINT "fk_748f3ffcd60e0dc190332a" FOREIGN KEY ("fk_236135feae33ca9ca3b0cd", "workspace_id", "fk_c703e5cfa8df4a9d2336f2") REFERENCES public."entity_reference_libraries" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" VALIDATE CONSTRAINT "fk_748f3ffcd60e0dc190332a";

CREATE INDEX "fk_ff752c5021e38a5516ea14" ON public."entity_master_catalogueArticleVendorLinks" ("fk_236135feae33ca9ca3b0cd", "workspace_id", "fk_c703e5cfa8df4a9d2336f2");

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" ADD COLUMN "fk_e6ba4a1248905f9997e996" text GENERATED ALWAYS AS (NULLIF(data #>> '{article_id}', '')) STORED;

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" ADD COLUMN "fk_fac422498fa0394b160927" text GENERATED ALWAYS AS ('master.articles') STORED;

-- master.catalogueArticleVendorLinks.article_id -> master.articles; app deletion policy: cascade
ALTER TABLE public."entity_master_catalogueArticleVendorLinks" ADD CONSTRAINT "fk_b5c37fee2f9c04aa82a033" FOREIGN KEY ("fk_fac422498fa0394b160927", "workspace_id", "fk_e6ba4a1248905f9997e996") REFERENCES public."entity_catalogue_items" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" VALIDATE CONSTRAINT "fk_b5c37fee2f9c04aa82a033";

CREATE INDEX "fk_92a0feec010c42bcdfa4ed" ON public."entity_master_catalogueArticleVendorLinks" ("fk_fac422498fa0394b160927", "workspace_id", "fk_e6ba4a1248905f9997e996");

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" ADD COLUMN "fk_31040da32553891d411ee2" text GENERATED ALWAYS AS (NULLIF(data #>> '{vendor_id}', '')) STORED;

-- master.catalogueArticleVendorLinks.vendor_id -> master.vendors; app deletion policy: cascade
ALTER TABLE public."entity_master_catalogueArticleVendorLinks" ADD CONSTRAINT "fk_974cf57ed7ebdb8a1bbcb4" FOREIGN KEY ("workspace_id", "fk_31040da32553891d411ee2") REFERENCES public."entity_master_vendors" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" VALIDATE CONSTRAINT "fk_974cf57ed7ebdb8a1bbcb4";

CREATE INDEX "fk_bfb8f0fbbdf21b52affc70" ON public."entity_master_catalogueArticleVendorLinks" ("workspace_id", "fk_31040da32553891d411ee2");

ALTER TABLE public."entity_policy_rules" ADD COLUMN "fk_102797febcb32ed3248056" text GENERATED ALWAYS AS (CASE WHEN collection='master.commissionRules' THEN NULLIF(data #>> '{source_partner_id}', '') ELSE NULL END) STORED;

-- master.commissionRules.source_partner_id -> master.sourcePartners; app deletion policy: restrict
ALTER TABLE public."entity_policy_rules" ADD CONSTRAINT "fk_0be457265c640290bed5c8" FOREIGN KEY ("workspace_id", "fk_102797febcb32ed3248056") REFERENCES public."entity_master_sourcePartners" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_policy_rules" VALIDATE CONSTRAINT "fk_0be457265c640290bed5c8";

CREATE INDEX "fk_43d7425ab7130a1ef69fc3" ON public."entity_policy_rules" ("workspace_id", "fk_102797febcb32ed3248056");

ALTER TABLE public."entity_policy_rules" ADD COLUMN "fk_bf286c96ac1c12dd4d89e7" text GENERATED ALWAYS AS (CASE WHEN collection='master.commissionRules' THEN NULLIF(data #>> '{category_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_policy_rules" ADD COLUMN "fk_0a4191a5dc2b24ac172269" text GENERATED ALWAYS AS ('master.workCategories') STORED;

-- master.commissionRules.category_id -> master.workCategories; app deletion policy: nullify
ALTER TABLE public."entity_policy_rules" ADD CONSTRAINT "fk_8bcb8c65352ac11ff90f88" FOREIGN KEY ("fk_0a4191a5dc2b24ac172269", "workspace_id", "fk_bf286c96ac1c12dd4d89e7") REFERENCES public."entity_work_definitions" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_policy_rules" VALIDATE CONSTRAINT "fk_8bcb8c65352ac11ff90f88";

CREATE INDEX "fk_3211ee58bc2590f390816d" ON public."entity_policy_rules" ("fk_0a4191a5dc2b24ac172269", "workspace_id", "fk_bf286c96ac1c12dd4d89e7");

ALTER TABLE public."entity_reference_libraries" ADD COLUMN "fk_8a8877c0404aa5d1b7d647" text GENERATED ALWAYS AS (CASE WHEN collection='master.pinterestBoards' THEN NULLIF(data #>> '{category_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_reference_libraries" ADD COLUMN "fk_0a4191a5dc2b24ac172269" text GENERATED ALWAYS AS ('master.workCategories') STORED;

-- master.pinterestBoards.category_id -> master.workCategories; app deletion policy: nullify
ALTER TABLE public."entity_reference_libraries" ADD CONSTRAINT "fk_dc4b01f06ab810848f25f6" FOREIGN KEY ("fk_0a4191a5dc2b24ac172269", "workspace_id", "fk_8a8877c0404aa5d1b7d647") REFERENCES public."entity_work_definitions" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_reference_libraries" VALIDATE CONSTRAINT "fk_dc4b01f06ab810848f25f6";

CREATE INDEX "fk_6962836e20fc3b4546f992" ON public."entity_reference_libraries" ("fk_0a4191a5dc2b24ac172269", "workspace_id", "fk_8a8877c0404aa5d1b7d647");

ALTER TABLE public."entity_reference_libraries" ADD COLUMN "fk_f63212e6e69c6516f3e205" text GENERATED ALWAYS AS (CASE WHEN collection='master.pinterestBoards' THEN NULLIF(data #>> '{subcategory_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_reference_libraries" ADD COLUMN "fk_2654525b51c04b0efab6ef" text GENERATED ALWAYS AS ('master.workSubcategories') STORED;

-- master.pinterestBoards.subcategory_id -> master.workSubcategories; app deletion policy: nullify
ALTER TABLE public."entity_reference_libraries" ADD CONSTRAINT "fk_f706d5ad9a4409a131a0f7" FOREIGN KEY ("fk_2654525b51c04b0efab6ef", "workspace_id", "fk_f63212e6e69c6516f3e205") REFERENCES public."entity_work_definitions" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_reference_libraries" VALIDATE CONSTRAINT "fk_f706d5ad9a4409a131a0f7";

CREATE INDEX "fk_b0d668eb63e6fc5708d699" ON public."entity_reference_libraries" ("fk_2654525b51c04b0efab6ef", "workspace_id", "fk_f63212e6e69c6516f3e205");

ALTER TABLE public."entity_reference_libraries" ADD COLUMN "fk_784a7618f9dfe244ff7c56" text GENERATED ALWAYS AS (CASE WHEN collection='master.pinterestBoards' THEN NULLIF(data #>> '{article_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_reference_libraries" ADD COLUMN "fk_fac422498fa0394b160927" text GENERATED ALWAYS AS ('master.articles') STORED;

-- master.pinterestBoards.article_id -> master.articles; app deletion policy: nullify
ALTER TABLE public."entity_reference_libraries" ADD CONSTRAINT "fk_6a9958fbcfeaa547dbf651" FOREIGN KEY ("fk_fac422498fa0394b160927", "workspace_id", "fk_784a7618f9dfe244ff7c56") REFERENCES public."entity_catalogue_items" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_reference_libraries" VALIDATE CONSTRAINT "fk_6a9958fbcfeaa547dbf651";

CREATE INDEX "fk_8f8cd651f48fc11ec43759" ON public."entity_reference_libraries" ("fk_fac422498fa0394b160927", "workspace_id", "fk_784a7618f9dfe244ff7c56");

ALTER TABLE public."entity_reference_libraries" ADD COLUMN "fk_1645cefc5658ccf20fb49c" text GENERATED ALWAYS AS (CASE WHEN collection='master.referenceMedia' THEN NULLIF(data #>> '{category_id}', '') ELSE NULL END) STORED;

-- master.referenceMedia.category_id -> master.workCategories; app deletion policy: nullify
ALTER TABLE public."entity_reference_libraries" ADD CONSTRAINT "fk_342e84fa330016125a4543" FOREIGN KEY ("fk_0a4191a5dc2b24ac172269", "workspace_id", "fk_1645cefc5658ccf20fb49c") REFERENCES public."entity_work_definitions" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_reference_libraries" VALIDATE CONSTRAINT "fk_342e84fa330016125a4543";

CREATE INDEX "fk_3d1edea278066831f83e4c" ON public."entity_reference_libraries" ("fk_0a4191a5dc2b24ac172269", "workspace_id", "fk_1645cefc5658ccf20fb49c");

ALTER TABLE public."entity_reference_libraries" ADD COLUMN "fk_7f8a9aedda707dab2bc641" text GENERATED ALWAYS AS (CASE WHEN collection='master.referenceMedia' THEN NULLIF(data #>> '{subcategory_id}', '') ELSE NULL END) STORED;

-- master.referenceMedia.subcategory_id -> master.workSubcategories; app deletion policy: nullify
ALTER TABLE public."entity_reference_libraries" ADD CONSTRAINT "fk_4485270d403357688f1d2b" FOREIGN KEY ("fk_2654525b51c04b0efab6ef", "workspace_id", "fk_7f8a9aedda707dab2bc641") REFERENCES public."entity_work_definitions" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_reference_libraries" VALIDATE CONSTRAINT "fk_4485270d403357688f1d2b";

CREATE INDEX "fk_04d5bb0895be1af98b1d15" ON public."entity_reference_libraries" ("fk_2654525b51c04b0efab6ef", "workspace_id", "fk_7f8a9aedda707dab2bc641");

ALTER TABLE public."entity_reference_libraries" ADD COLUMN "fk_50dbe7d123e68291dde36e" text GENERATED ALWAYS AS (CASE WHEN collection='master.referenceMedia' THEN NULLIF(data #>> '{article_id}', '') ELSE NULL END) STORED;

-- master.referenceMedia.article_id -> master.articles; app deletion policy: nullify
ALTER TABLE public."entity_reference_libraries" ADD CONSTRAINT "fk_88c831f84494b9dc7dac6e" FOREIGN KEY ("fk_fac422498fa0394b160927", "workspace_id", "fk_50dbe7d123e68291dde36e") REFERENCES public."entity_catalogue_items" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_reference_libraries" VALIDATE CONSTRAINT "fk_88c831f84494b9dc7dac6e";

CREATE INDEX "fk_b4b226ef54cf7cbadc28e2" ON public."entity_reference_libraries" ("fk_fac422498fa0394b160927", "workspace_id", "fk_50dbe7d123e68291dde36e");

ALTER TABLE public."entity_reference_libraries" ADD COLUMN "fk_a2c7f098a6a3df62791891" text GENERATED ALWAYS AS (CASE WHEN collection='master.catalogues' THEN NULLIF(data #>> '{drive_asset_id}', '') ELSE NULL END) STORED;

-- master.catalogues.drive_asset_id -> master.fileAssets; app deletion policy: nullify
ALTER TABLE public."entity_reference_libraries" ADD CONSTRAINT "fk_14cd4004347671e34b9059" FOREIGN KEY ("workspace_id", "fk_a2c7f098a6a3df62791891") REFERENCES public."entity_master_fileAssets" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_reference_libraries" VALIDATE CONSTRAINT "fk_14cd4004347671e34b9059";

CREATE INDEX "fk_a3297b6860d33d35c56596" ON public."entity_reference_libraries" ("workspace_id", "fk_a2c7f098a6a3df62791891");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_e47da5d02bfbf133bb2bc0" text GENERATED ALWAYS AS (CASE WHEN collection='visits' THEN NULLIF(data #>> '{recovery_followup_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_f8791eb9f0b3d744b237b2" text GENERATED ALWAYS AS ('followups') STORED;

-- visits.recovery_followup_id -> followups; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_a7ffd840ea0ea9a3444707" FOREIGN KEY ("fk_f8791eb9f0b3d744b237b2", "workspace_id", "fk_e47da5d02bfbf133bb2bc0") REFERENCES public."entity_workflow_controls" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_a7ffd840ea0ea9a3444707";

CREATE INDEX "fk_7662da432f9bbdc8b019f7" ON public."entity_workflow_controls" ("fk_f8791eb9f0b3d744b237b2", "workspace_id", "fk_e47da5d02bfbf133bb2bc0");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_f61cbbc200b724658ca2d2" text GENERATED ALWAYS AS (CASE WHEN collection='visits' THEN NULLIF(data #>> '{report_task_id}', '') ELSE NULL END) STORED;

-- visits.report_task_id -> tasks; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_0f7e0bbcc579751f864e9e" FOREIGN KEY ("fk_786ae18e16d97766002ef1", "workspace_id", "fk_f61cbbc200b724658ca2d2") REFERENCES public."entity_workflow_controls" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_0f7e0bbcc579751f864e9e";

CREATE INDEX "fk_4ed52ad04cd8efb3679a73" ON public."entity_workflow_controls" ("fk_786ae18e16d97766002ef1", "workspace_id", "fk_f61cbbc200b724658ca2d2");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_2745a1d3b92d3789a9b837" text GENERATED ALWAYS AS (CASE WHEN collection='tasks' THEN NULLIF(data #>> '{blocked_item_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_acc63b09e5f6f4893403ab" text GENERATED ALWAYS AS ('blocked') STORED;

-- tasks.blocked_item_id -> blocked; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_08eba53625235510ff7209" FOREIGN KEY ("fk_acc63b09e5f6f4893403ab", "workspace_id", "fk_2745a1d3b92d3789a9b837") REFERENCES public."entity_workflow_controls" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_08eba53625235510ff7209";

CREATE INDEX "fk_86145948ca03d864d62757" ON public."entity_workflow_controls" ("fk_acc63b09e5f6f4893403ab", "workspace_id", "fk_2745a1d3b92d3789a9b837");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_4e233e7e96a2b125380d2b" text GENERATED ALWAYS AS (CASE WHEN collection='followups' THEN NULLIF(data #>> '{next_followup_id}', '') ELSE NULL END) STORED;

-- followups.next_followup_id -> followups; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_9805c8cf6eca89e317ff87" FOREIGN KEY ("fk_f8791eb9f0b3d744b237b2", "workspace_id", "fk_4e233e7e96a2b125380d2b") REFERENCES public."entity_workflow_controls" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_9805c8cf6eca89e317ff87";

CREATE INDEX "fk_0d3f972583e36f4241f28e" ON public."entity_workflow_controls" ("fk_f8791eb9f0b3d744b237b2", "workspace_id", "fk_4e233e7e96a2b125380d2b");

CREATE UNIQUE INDEX "fk_c22a25c31773ecd9a125ee" ON public."entity_commercial_settings" ("collection", "workspace_id", "id");

ALTER TABLE public."entity_payments" ADD COLUMN "fk_e67dac9cfc4fff4bcb38ef" text GENERATED ALWAYS AS (NULLIF(data #>> '{milestone_term_id}', '')) STORED;

ALTER TABLE public."entity_payments" ADD COLUMN "fk_bdc2f67f6d1c55498b5f82" text GENERATED ALWAYS AS ('paymentTermTemplates') STORED;

-- payments.milestone_term_id -> paymentTermTemplates; app deletion policy: nullify
ALTER TABLE public."entity_payments" ADD CONSTRAINT "fk_b21abe83b608a78c75529e" FOREIGN KEY ("fk_bdc2f67f6d1c55498b5f82", "workspace_id", "fk_e67dac9cfc4fff4bcb38ef") REFERENCES public."entity_commercial_settings" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_payments" VALIDATE CONSTRAINT "fk_b21abe83b608a78c75529e";

CREATE INDEX "fk_821f26ac7f6ae2ba782c7f" ON public."entity_payments" ("fk_bdc2f67f6d1c55498b5f82", "workspace_id", "fk_e67dac9cfc4fff4bcb38ef");

ALTER TABLE public."entity_workOrders" ADD COLUMN "fk_ad7ea408471e7cb5177099" text GENERATED ALWAYS AS (NULLIF(data #>> '{replacement_for_work_order_id}', '')) STORED;

-- workOrders.replacement_for_work_order_id -> workOrders; app deletion policy: nullify
ALTER TABLE public."entity_workOrders" ADD CONSTRAINT "fk_c3a53bb6f9da08b17092af" FOREIGN KEY ("workspace_id", "fk_ad7ea408471e7cb5177099") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workOrders" VALIDATE CONSTRAINT "fk_c3a53bb6f9da08b17092af";

CREATE INDEX "fk_7b63e277f2cc1623795628" ON public."entity_workOrders" ("workspace_id", "fk_ad7ea408471e7cb5177099");

ALTER TABLE public."entity_workOrders" ADD COLUMN "fk_6a19c08ff1313f013b4b20" text GENERATED ALWAYS AS (NULLIF(data #>> '{abandoned_contractor_id}', '')) STORED;

-- workOrders.abandoned_contractor_id -> master.contractors; app deletion policy: nullify
ALTER TABLE public."entity_workOrders" ADD CONSTRAINT "fk_78179bb0ce562b120652da" FOREIGN KEY ("workspace_id", "fk_6a19c08ff1313f013b4b20") REFERENCES public."entity_master_contractors" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workOrders" VALIDATE CONSTRAINT "fk_78179bb0ce562b120652da";

CREATE INDEX "fk_26068ef82afd1bb2b79d0f" ON public."entity_workOrders" ("workspace_id", "fk_6a19c08ff1313f013b4b20");

ALTER TABLE public."entity_site_records" ADD COLUMN "fk_d839543714eb0592cc67f6" text GENERATED ALWAYS AS (CASE WHEN collection='drawings' THEN NULLIF(data #>> '{parent_drawing_id}', '') ELSE NULL END) STORED;

-- drawings.parent_drawing_id -> drawings; app deletion policy: nullify
ALTER TABLE public."entity_site_records" ADD CONSTRAINT "fk_cc4214770e5f8ebf29b5b2" FOREIGN KEY ("fk_95cdd59bbe408086bd47d3", "workspace_id", "fk_d839543714eb0592cc67f6") REFERENCES public."entity_site_records" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_site_records" VALIDATE CONSTRAINT "fk_cc4214770e5f8ebf29b5b2";

CREATE INDEX "fk_989976ac366b2005302a66" ON public."entity_site_records" ("fk_95cdd59bbe408086bd47d3", "workspace_id", "fk_d839543714eb0592cc67f6");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_a04b52af6c37e65ecef590" text GENERATED ALWAYS AS (CASE WHEN collection='grns' THEN NULLIF(data #>> '{obstacle_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_acc63b09e5f6f4893403ab" text GENERATED ALWAYS AS ('blocked') STORED;

-- grns.obstacle_id -> blocked; app deletion policy: nullify
ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_a5a31347f61349be9ed8bf" FOREIGN KEY ("fk_acc63b09e5f6f4893403ab", "workspace_id", "fk_a04b52af6c37e65ecef590") REFERENCES public."entity_workflow_controls" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commercial_documents" VALIDATE CONSTRAINT "fk_a5a31347f61349be9ed8bf";

CREATE INDEX "fk_63d88905812ff9ec7c4170" ON public."entity_commercial_documents" ("fk_acc63b09e5f6f4893403ab", "workspace_id", "fk_a04b52af6c37e65ecef590");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_2dcf3859a7872a6e330a41" text GENERATED ALWAYS AS (CASE WHEN collection='grns' THEN NULLIF(data #>> '{bill_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_4adab8fe285be0a2698c68" text GENERATED ALWAYS AS ('vendorBills') STORED;

-- grns.bill_id -> vendorBills; app deletion policy: nullify
ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_7f333b54145fabfb6bafa3" FOREIGN KEY ("fk_4adab8fe285be0a2698c68", "workspace_id", "fk_2dcf3859a7872a6e330a41") REFERENCES public."entity_financial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commercial_documents" VALIDATE CONSTRAINT "fk_7f333b54145fabfb6bafa3";

CREATE INDEX "fk_1f8dec0ca93fc1f2a16fd2" ON public."entity_commercial_documents" ("fk_4adab8fe285be0a2698c68", "workspace_id", "fk_2dcf3859a7872a6e330a41");

ALTER TABLE public."entity_financial_documents" ADD COLUMN "fk_5513b4b0e52ac9d3ea3c19" text GENERATED ALWAYS AS (CASE WHEN collection='vendorBills' THEN NULLIF(data #>> '{three_way_match,obstacle_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_financial_documents" ADD COLUMN "fk_acc63b09e5f6f4893403ab" text GENERATED ALWAYS AS ('blocked') STORED;

-- vendorBills.three_way_match.obstacle_id -> blocked; app deletion policy: nullify
ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "fk_229f0dfee4370f04140a67" FOREIGN KEY ("fk_acc63b09e5f6f4893403ab", "workspace_id", "fk_5513b4b0e52ac9d3ea3c19") REFERENCES public."entity_workflow_controls" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_financial_documents" VALIDATE CONSTRAINT "fk_229f0dfee4370f04140a67";

CREATE INDEX "fk_4c0c9b446f03ffeec3f412" ON public."entity_financial_documents" ("fk_acc63b09e5f6f4893403ab", "workspace_id", "fk_5513b4b0e52ac9d3ea3c19");

ALTER TABLE public."entity_site_records" ADD COLUMN "fk_a0564f9c6126491c077618" text GENERATED ALWAYS AS (CASE WHEN collection='variationRequests' THEN NULLIF(data #>> '{execution_log_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_site_records" ADD COLUMN "fk_c8f7fe4cfde8eff5535d3e" text GENERATED ALWAYS AS ('executionLogs') STORED;

-- variationRequests.execution_log_id -> executionLogs; app deletion policy: nullify
ALTER TABLE public."entity_site_records" ADD CONSTRAINT "fk_73471282c5379ed394253b" FOREIGN KEY ("fk_c8f7fe4cfde8eff5535d3e", "workspace_id", "fk_a0564f9c6126491c077618") REFERENCES public."entity_site_records" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_site_records" VALIDATE CONSTRAINT "fk_73471282c5379ed394253b";

CREATE INDEX "fk_9d1b55e0e3a5ebab1796b8" ON public."entity_site_records" ("fk_c8f7fe4cfde8eff5535d3e", "workspace_id", "fk_a0564f9c6126491c077618");

ALTER TABLE public."entity_sites" ADD COLUMN "fk_f1892595aba508043212c3" text GENERATED ALWAYS AS (NULLIF(data #>> '{source_partner_id}', '')) STORED;

-- sites.source_partner_id -> master.sourcePartners; app deletion policy: nullify
ALTER TABLE public."entity_sites" ADD CONSTRAINT "fk_7f1d99cfae83ec36323d88" FOREIGN KEY ("workspace_id", "fk_f1892595aba508043212c3") REFERENCES public."entity_master_sourcePartners" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_sites" VALIDATE CONSTRAINT "fk_7f1d99cfae83ec36323d88";

CREATE INDEX "fk_dc845b756525c558284402" ON public."entity_sites" ("workspace_id", "fk_f1892595aba508043212c3");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_14c440208db17069411b62" text GENERATED ALWAYS AS (CASE WHEN collection='quotations' THEN NULLIF(data #>> '{parent_quotation_id}', '') ELSE NULL END) STORED;

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_0853d2f491d44bf1c48d8a" text GENERATED ALWAYS AS ('quotations') STORED;

-- quotations.parent_quotation_id -> quotations; app deletion policy: nullify
ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_a81d5a1a196c95900c7ad2" FOREIGN KEY ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_14c440208db17069411b62") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commercial_documents" VALIDATE CONSTRAINT "fk_a81d5a1a196c95900c7ad2";

CREATE INDEX "fk_b00b227101805618b50fb0" ON public."entity_commercial_documents" ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_14c440208db17069411b62");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_84c1be0f15e887d9695ace" text GENERATED ALWAYS AS (CASE WHEN collection='quotations' THEN NULLIF(data #>> '{superseded_by_quotation_id}', '') ELSE NULL END) STORED;

-- quotations.superseded_by_quotation_id -> quotations; app deletion policy: nullify
ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_8a9e295b7214d9f2c1234b" FOREIGN KEY ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_84c1be0f15e887d9695ace") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commercial_documents" VALIDATE CONSTRAINT "fk_8a9e295b7214d9f2c1234b";

CREATE INDEX "fk_2ad949cead25dd2771fe0a" ON public."entity_commercial_documents" ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_84c1be0f15e887d9695ace");

ALTER TABLE public."entity_acceptedScopes" ADD COLUMN "fk_383222e592db5fd66a634c" text GENERATED ALWAYS AS (NULLIF(data #>> '{contractor_bid_id}', '')) STORED;

ALTER TABLE public."entity_acceptedScopes" ADD COLUMN "fk_c54e2099ca843e0887abc9" text GENERATED ALWAYS AS ('contractorBids') STORED;

-- acceptedScopes.contractor_bid_id -> contractorBids; app deletion policy: nullify
ALTER TABLE public."entity_acceptedScopes" ADD CONSTRAINT "fk_17474b5f5f529d4b1dd701" FOREIGN KEY ("fk_c54e2099ca843e0887abc9", "workspace_id", "fk_383222e592db5fd66a634c") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_acceptedScopes" VALIDATE CONSTRAINT "fk_17474b5f5f529d4b1dd701";

CREATE INDEX "fk_916f17f661d7e449686f68" ON public."entity_acceptedScopes" ("fk_c54e2099ca843e0887abc9", "workspace_id", "fk_383222e592db5fd66a634c");

ALTER TABLE public."entity_commercial_documents" ADD COLUMN "fk_b4cd05008d89ca902bc24b" text GENERATED ALWAYS AS (CASE WHEN collection='contractorSettlements' THEN NULLIF(data #>> '{replacement_work_order_id}', '') ELSE NULL END) STORED;

-- contractorSettlements.replacement_work_order_id -> workOrders; app deletion policy: nullify
ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "fk_6dc246842fcf96a03d0350" FOREIGN KEY ("workspace_id", "fk_b4cd05008d89ca902bc24b") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commercial_documents" VALIDATE CONSTRAINT "fk_6dc246842fcf96a03d0350";

CREATE INDEX "fk_05b875cc0c02783bf32556" ON public."entity_commercial_documents" ("workspace_id", "fk_b4cd05008d89ca902bc24b");

ALTER TABLE public."entity_staff_records" ADD COLUMN "fk_cc1f5f7e1dc1bdb3b40b75" text GENERATED ALWAYS AS (CASE WHEN collection='leaveRequests' THEN NULLIF(data #>> '{approved_by_staff_id}', '') ELSE NULL END) STORED;

-- leaveRequests.approved_by_staff_id -> master.staff; app deletion policy: nullify
ALTER TABLE public."entity_staff_records" ADD CONSTRAINT "fk_dc6454755bcc2616aa07a2" FOREIGN KEY ("workspace_id", "fk_cc1f5f7e1dc1bdb3b40b75") REFERENCES public."entity_master_staff" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_staff_records" VALIDATE CONSTRAINT "fk_dc6454755bcc2616aa07a2";

CREATE INDEX "fk_de8f9ca07bc01e9c386437" ON public."entity_staff_records" ("workspace_id", "fk_cc1f5f7e1dc1bdb3b40b75");

ALTER TABLE public."entity_policy_rules" ADD COLUMN "fk_0d09bc1948d69a213e76ed" text GENERATED ALWAYS AS (CASE WHEN collection='recurringTasks' THEN NULLIF(data #>> '{customer_id}', '') ELSE NULL END) STORED;

-- recurringTasks.customer_id -> customers; app deletion policy: nullify
ALTER TABLE public."entity_policy_rules" ADD CONSTRAINT "fk_4e76606867a54460b8dc43" FOREIGN KEY ("workspace_id", "fk_0d09bc1948d69a213e76ed") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_policy_rules" VALIDATE CONSTRAINT "fk_4e76606867a54460b8dc43";

CREATE INDEX "fk_a7a2733a79aae5195fac0d" ON public."entity_policy_rules" ("workspace_id", "fk_0d09bc1948d69a213e76ed");

ALTER TABLE public."entity_policy_rules" ADD COLUMN "fk_f22512ffe604eb1d1d25ee" text GENERATED ALWAYS AS (CASE WHEN collection='recurringTasks' THEN NULLIF(data #>> '{site_id}', '') ELSE NULL END) STORED;

-- recurringTasks.site_id -> sites; app deletion policy: nullify
ALTER TABLE public."entity_policy_rules" ADD CONSTRAINT "fk_aa44826eae816adb02071b" FOREIGN KEY ("workspace_id", "fk_f22512ffe604eb1d1d25ee") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_policy_rules" VALIDATE CONSTRAINT "fk_aa44826eae816adb02071b";

CREATE INDEX "fk_07aa2445407643cb250d0c" ON public."entity_policy_rules" ("workspace_id", "fk_f22512ffe604eb1d1d25ee");

ALTER TABLE public."entity_policy_rules" ADD COLUMN "fk_d5143a715986ab35224433" text GENERATED ALWAYS AS (CASE WHEN collection='recurringTasks' THEN NULLIF(data #>> '{work_order_id}', '') ELSE NULL END) STORED;

-- recurringTasks.work_order_id -> workOrders; app deletion policy: nullify
ALTER TABLE public."entity_policy_rules" ADD CONSTRAINT "fk_fc0cc1c79fcf95bef06607" FOREIGN KEY ("workspace_id", "fk_d5143a715986ab35224433") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_policy_rules" VALIDATE CONSTRAINT "fk_fc0cc1c79fcf95bef06607";

CREATE INDEX "fk_06ce5c4adb2b079675b8fd" ON public."entity_policy_rules" ("workspace_id", "fk_d5143a715986ab35224433");

ALTER TABLE public."entity_workflow_controls" ADD COLUMN "fk_ba7fdc4b68694c59cdd396" text GENERATED ALWAYS AS (CASE WHEN collection='blocked' THEN NULLIF(data #>> '{linked_quotation_id}', '') ELSE NULL END) STORED;

-- blocked.linked_quotation_id -> quotations; app deletion policy: nullify
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_1b29d4c9beb5dcb6444ca2" FOREIGN KEY ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_ba7fdc4b68694c59cdd396") REFERENCES public."entity_commercial_documents" ("collection", "workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_1b29d4c9beb5dcb6444ca2";

CREATE INDEX "fk_75c91c8fa0cf2357d62251" ON public."entity_workflow_controls" ("fk_0853d2f491d44bf1c48d8a", "workspace_id", "fk_ba7fdc4b68694c59cdd396");

ALTER TABLE public."entity_auditLog" ADD COLUMN "fk_0643096ce7bedeb69787f0" text GENERATED ALWAYS AS (NULLIF(data #>> '{customer_id}', '')) STORED;

-- auditLog.customer_id -> customers; app deletion policy: nullify
ALTER TABLE public."entity_auditLog" ADD CONSTRAINT "fk_928bf370ee3b08cf421503" FOREIGN KEY ("workspace_id", "fk_0643096ce7bedeb69787f0") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_auditLog" VALIDATE CONSTRAINT "fk_928bf370ee3b08cf421503";

CREATE INDEX "fk_22f5c47949709c3ca04a6a" ON public."entity_auditLog" ("workspace_id", "fk_0643096ce7bedeb69787f0");

ALTER TABLE public."entity_master_fileAssets" ADD COLUMN "fk_9dd55da28d514ed1ae3fa6" text GENERATED ALWAYS AS (NULLIF(data #>> '{customer_id}', '')) STORED;

-- master.fileAssets.customer_id -> customers; app deletion policy: nullify
ALTER TABLE public."entity_master_fileAssets" ADD CONSTRAINT "fk_9b6b0483f1907cb5669c18" FOREIGN KEY ("workspace_id", "fk_9dd55da28d514ed1ae3fa6") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_master_fileAssets" VALIDATE CONSTRAINT "fk_9b6b0483f1907cb5669c18";

CREATE INDEX "fk_94bcd837152d86b77a0abb" ON public."entity_master_fileAssets" ("workspace_id", "fk_9dd55da28d514ed1ae3fa6");

ALTER TABLE public."entity_master_fileAssets" ADD COLUMN "fk_463d558a10e3080e73869a" text GENERATED ALWAYS AS (NULLIF(data #>> '{site_id}', '')) STORED;

-- master.fileAssets.site_id -> sites; app deletion policy: nullify
ALTER TABLE public."entity_master_fileAssets" ADD CONSTRAINT "fk_6e144924412fef31887f24" FOREIGN KEY ("workspace_id", "fk_463d558a10e3080e73869a") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_master_fileAssets" VALIDATE CONSTRAINT "fk_6e144924412fef31887f24";

CREATE INDEX "fk_8575be0d3e00f2b938b2d5" ON public."entity_master_fileAssets" ("workspace_id", "fk_463d558a10e3080e73869a");

ALTER TABLE public."entity_storage_structure" ADD COLUMN "fk_3ed4c9fb6f98d672eea1f6" text GENERATED ALWAYS AS (CASE WHEN collection='master.storageFolderInstances' THEN NULLIF(data #>> '{customer_id}', '') ELSE NULL END) STORED;

-- master.storageFolderInstances.customer_id -> customers; app deletion policy: nullify
ALTER TABLE public."entity_storage_structure" ADD CONSTRAINT "fk_fb13267686b0aeec9b0e7c" FOREIGN KEY ("workspace_id", "fk_3ed4c9fb6f98d672eea1f6") REFERENCES public."entity_customers" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_storage_structure" VALIDATE CONSTRAINT "fk_fb13267686b0aeec9b0e7c";

CREATE INDEX "fk_f9f0a4bed9921799289149" ON public."entity_storage_structure" ("workspace_id", "fk_3ed4c9fb6f98d672eea1f6");

ALTER TABLE public."entity_storage_structure" ADD COLUMN "fk_75910e2fbaf662367dae85" text GENERATED ALWAYS AS (CASE WHEN collection='master.storageFolderInstances' THEN NULLIF(data #>> '{site_id}', '') ELSE NULL END) STORED;

-- master.storageFolderInstances.site_id -> sites; app deletion policy: nullify
ALTER TABLE public."entity_storage_structure" ADD CONSTRAINT "fk_2e357823661007c0617fd5" FOREIGN KEY ("workspace_id", "fk_75910e2fbaf662367dae85") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_storage_structure" VALIDATE CONSTRAINT "fk_2e357823661007c0617fd5";

CREATE INDEX "fk_dc93a034353e78d72b2de2" ON public."entity_storage_structure" ("workspace_id", "fk_75910e2fbaf662367dae85");

ALTER TABLE public."entity_storage_structure" ADD COLUMN "fk_75d807b07b238c4287c423" text GENERATED ALWAYS AS (CASE WHEN collection='master.storageFolderInstances' THEN NULLIF(data #>> '{work_order_id}', '') ELSE NULL END) STORED;

-- master.storageFolderInstances.work_order_id -> workOrders; app deletion policy: nullify
ALTER TABLE public."entity_storage_structure" ADD CONSTRAINT "fk_fe7fb9c43d92d57ed71fc1" FOREIGN KEY ("workspace_id", "fk_75d807b07b238c4287c423") REFERENCES public."entity_workOrders" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_storage_structure" VALIDATE CONSTRAINT "fk_fe7fb9c43d92d57ed71fc1";

CREATE INDEX "fk_05fbf4864ace5c900418e3" ON public."entity_storage_structure" ("workspace_id", "fk_75d807b07b238c4287c423");

-- commissions.site_id -> sites; app deletion policy: restrict
ALTER TABLE public."entity_commissions" ADD CONSTRAINT "fk_7208dc2724a698aea88a51" FOREIGN KEY ("workspace_id", "site_id_gen") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commissions" VALIDATE CONSTRAINT "fk_7208dc2724a698aea88a51";

CREATE INDEX "fk_0b26bbe37f8d3366d431f6" ON public."entity_commissions" ("workspace_id", "site_id_gen");

-- commSends.site_id -> sites; app deletion policy: restrict
ALTER TABLE public."entity_commSends" ADD CONSTRAINT "fk_7093e3705c4c4e7c0029f4" FOREIGN KEY ("workspace_id", "site_id_gen") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_commSends" VALIDATE CONSTRAINT "fk_7093e3705c4c4e7c0029f4";

CREATE INDEX "fk_2e08c2d8815def117f7f84" ON public."entity_commSends" ("workspace_id", "site_id_gen");

-- actions.site_id -> sites; app deletion policy: restrict
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_cba65517f0d34cf771c1aa" FOREIGN KEY ("workspace_id", "sd_76e724a8ae01dd269987") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_cba65517f0d34cf771c1aa";

CREATE INDEX "fk_482a2fbf33e4bae26e72ed" ON public."entity_workflow_controls" ("workspace_id", "sd_76e724a8ae01dd269987");

-- blocked.site_id -> sites; app deletion policy: restrict
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_76bca1f86ce8fed3f29c87" FOREIGN KEY ("workspace_id", "sd_a291a3a1d61683190c5b") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_76bca1f86ce8fed3f29c87";

CREATE INDEX "fk_c8b6188442e77dd1abf1dd" ON public."entity_workflow_controls" ("workspace_id", "sd_a291a3a1d61683190c5b");

-- risks.site_id -> sites; app deletion policy: restrict
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_e7268df62d85872aca0b2b" FOREIGN KEY ("workspace_id", "sd_ffb53a4ac65790034db9") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_e7268df62d85872aca0b2b";

CREATE INDEX "fk_755488fb4d2a59f113225a" ON public."entity_workflow_controls" ("workspace_id", "sd_ffb53a4ac65790034db9");

-- followups.site_id -> sites; app deletion policy: restrict
ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "fk_d92e814cd544c1a75add68" FOREIGN KEY ("workspace_id", "s2_47e1df9c2b782b3434e9126a") REFERENCES public."entity_sites" ("workspace_id", "id") DEFERRABLE INITIALLY DEFERRED NOT VALID;

ALTER TABLE public."entity_workflow_controls" VALIDATE CONSTRAINT "fk_d92e814cd544c1a75add68";

CREATE INDEX "fk_0a07fa4658e95e97ee1a56" ON public."entity_workflow_controls" ("workspace_id", "s2_47e1df9c2b782b3434e9126a");

ALTER TABLE public."entity_payments" DROP CONSTRAINT "entity_payments_customer_id_fkey";

ALTER TABLE public."entity_sites" DROP CONSTRAINT "entity_sites_customer_id_fkey";

ALTER TABLE public."entity_workRequired" DROP CONSTRAINT "entity_workRequired_customer_id_fkey";

ALTER TABLE public."entity_acceptedScopes" DROP CONSTRAINT "entity_acceptedScopes_customer_id_fkey";

ALTER TABLE public."entity_workOrders" DROP CONSTRAINT "entity_workOrders_customer_id_fkey";

ALTER TABLE public."entity_commissions" DROP CONSTRAINT "entity_commissions_customer_id_fkey";

ALTER TABLE public."entity_commSends" DROP CONSTRAINT "entity_commSends_customer_id_fkey";

ALTER TABLE public."entity_areas" DROP CONSTRAINT "entity_areas_site_id_fkey";

ALTER TABLE public."entity_workRequired" DROP CONSTRAINT "entity_workRequired_site_id_fkey";

ALTER TABLE public."entity_acceptedScopes" DROP CONSTRAINT "entity_acceptedScopes_site_id_fkey";

ALTER TABLE public."entity_workOrders" DROP CONSTRAINT "entity_workOrders_site_id_fkey";

ALTER TABLE public."entity_payments" DROP CONSTRAINT "entity_payments_site_id_fkey";

ALTER TABLE public."entity_commissions" DROP CONSTRAINT "entity_commissions_site_id_fkey";

ALTER TABLE public."entity_commSends" DROP CONSTRAINT "entity_commSends_site_id_fkey";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "sd_21e1d6b91113db2663b5";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "sd_e8761b8f070c9dbcac50";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "sd_91e5326614a181727da2";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "sd_0f2545f97175c44b445d";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "sd_afc8973449530910f685";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "sd_3722bc7e601d83ed302f";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "sd_b1f1fdd06b8ebc837408";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "sd_cc51aa53426a27165efe";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "sd_dfa581eb3282671ff10a";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "sd_1c594d762ace6b857d52";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "sd_c881b0b5a8e23d78c817";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "sd_9017f4bddf10572db008";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "sd_c4e0f2d7e4b42d0af68f";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "sd_d913d380a6647eb3644f";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "s2_a69cd7e475ff28a5849eff65";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "s2_5767eb76f3cc1c97c3c5b34d";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "s2_03f2367a46d0fbbbee804c73";

ALTER TABLE public."entity_site_records" DROP CONSTRAINT "s2_aea09578fa2a23dd45c8f00f";

ALTER TABLE public."entity_resource_links" DROP CONSTRAINT "s2_8185d27cb19f18cb3687f6be";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "s2_79384d3c4fd3d65aa3445c25";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "s2_e8aea462266c77d9959b9582";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "s2_c81ad6c6f44383862edc7e66";

ALTER TABLE public."entity_site_records" DROP CONSTRAINT "s2_1b4a6c0c040a470b284e434e";

ALTER TABLE public."entity_resource_links" DROP CONSTRAINT "s2_d707504078887d1b60fdca5e";

NOTIFY pgrst, 'reload schema';

COMMIT;
