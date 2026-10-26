-- Reverse FK hardening before shared_domain_expansion rollback. No row data changes.

BEGIN;

SET LOCAL lock_timeout='15s';

SET LOCAL statement_timeout='120s';

LOCK TABLE public.entity_workspace_revision IN ACCESS EXCLUSIVE MODE;

SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE public."entity_payments" ADD CONSTRAINT "entity_payments_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public."entity_sites" ADD CONSTRAINT "entity_sites_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public."entity_workRequired" ADD CONSTRAINT "entity_workRequired_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public."entity_acceptedScopes" ADD CONSTRAINT "entity_acceptedScopes_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public."entity_workOrders" ADD CONSTRAINT "entity_workOrders_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public."entity_commissions" ADD CONSTRAINT "entity_commissions_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public."entity_commSends" ADD CONSTRAINT "entity_commSends_customer_id_fkey" FOREIGN KEY (customer_id_gen) REFERENCES entity_customers(id);

ALTER TABLE public."entity_areas" ADD CONSTRAINT "entity_areas_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public."entity_workRequired" ADD CONSTRAINT "entity_workRequired_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public."entity_acceptedScopes" ADD CONSTRAINT "entity_acceptedScopes_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public."entity_workOrders" ADD CONSTRAINT "entity_workOrders_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public."entity_payments" ADD CONSTRAINT "entity_payments_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public."entity_commissions" ADD CONSTRAINT "entity_commissions_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public."entity_commSends" ADD CONSTRAINT "entity_commSends_site_id_fkey" FOREIGN KEY (site_id_gen) REFERENCES entity_sites(id);

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_21e1d6b91113db2663b5" FOREIGN KEY (sd_de11944679c93077c0a0) REFERENCES entity_customers(id);

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "sd_e8761b8f070c9dbcac50" FOREIGN KEY (sd_76e724a8ae01dd269987) REFERENCES entity_sites(id);

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "sd_91e5326614a181727da2" FOREIGN KEY (sd_896262c53f4cfaa4f824) REFERENCES entity_customers(id);

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "sd_0f2545f97175c44b445d" FOREIGN KEY (sd_a291a3a1d61683190c5b) REFERENCES entity_sites(id);

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_afc8973449530910f685" FOREIGN KEY (sd_79a3041abf5ba7c29887) REFERENCES entity_customers(id);

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_3722bc7e601d83ed302f" FOREIGN KEY (sd_e4eff89c5be14ad2831f) REFERENCES entity_sites(id);

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_b1f1fdd06b8ebc837408" FOREIGN KEY (sd_47c9fed69701c1b111b4) REFERENCES entity_customers(id);

ALTER TABLE public."entity_money_movements" ADD CONSTRAINT "sd_cc51aa53426a27165efe" FOREIGN KEY (sd_677ef08b162d13bdfddc) REFERENCES entity_sites(id);

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "sd_dfa581eb3282671ff10a" FOREIGN KEY (sd_f0c5338ed87f8da85e2a) REFERENCES entity_customers(id);

ALTER TABLE public."entity_financial_documents" ADD CONSTRAINT "sd_1c594d762ace6b857d52" FOREIGN KEY (sd_ce2695f4fb72b9a68e00) REFERENCES entity_sites(id);

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "sd_c881b0b5a8e23d78c817" FOREIGN KEY (sd_7dad38aaab2a13e3cef5) REFERENCES entity_customers(id);

ALTER TABLE public."entity_commercial_documents" ADD CONSTRAINT "sd_9017f4bddf10572db008" FOREIGN KEY (sd_d362111c2dd759619485) REFERENCES entity_sites(id);

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "sd_c4e0f2d7e4b42d0af68f" FOREIGN KEY (sd_fdb4b4da80d2e32d77f6) REFERENCES entity_customers(id);

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "sd_d913d380a6647eb3644f" FOREIGN KEY (sd_ffb53a4ac65790034db9) REFERENCES entity_sites(id);

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "s2_a69cd7e475ff28a5849eff65" FOREIGN KEY (s2_3eae69b34d9068725e0ea417) REFERENCES entity_customers(id);

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "s2_5767eb76f3cc1c97c3c5b34d" FOREIGN KEY (s2_8acb09aad7eb38518e71efab) REFERENCES entity_customers(id);

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "s2_03f2367a46d0fbbbee804c73" FOREIGN KEY (s2_addeb7dd1695402ac3f4dbee) REFERENCES entity_customers(id);

ALTER TABLE public."entity_site_records" ADD CONSTRAINT "s2_aea09578fa2a23dd45c8f00f" FOREIGN KEY (s2_fbf14b5d31abe1937333f287) REFERENCES entity_customers(id);

ALTER TABLE public."entity_resource_links" ADD CONSTRAINT "s2_8185d27cb19f18cb3687f6be" FOREIGN KEY (s2_e95cb94c8ea1b8aa43ea8ef5) REFERENCES entity_customers(id);

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "s2_79384d3c4fd3d65aa3445c25" FOREIGN KEY (s2_c8e0189a449e078d3d6e4f70) REFERENCES entity_sites(id);

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "s2_e8aea462266c77d9959b9582" FOREIGN KEY (s2_49411c7ef6f6bba4135b5fad) REFERENCES entity_sites(id);

ALTER TABLE public."entity_workflow_controls" ADD CONSTRAINT "s2_c81ad6c6f44383862edc7e66" FOREIGN KEY (s2_47e1df9c2b782b3434e9126a) REFERENCES entity_sites(id);

ALTER TABLE public."entity_site_records" ADD CONSTRAINT "s2_1b4a6c0c040a470b284e434e" FOREIGN KEY (s2_1b2c72c70f3bf7d63e3ec173) REFERENCES entity_sites(id);

ALTER TABLE public."entity_resource_links" ADD CONSTRAINT "s2_d707504078887d1b60fdca5e" FOREIGN KEY (s2_2d6b1f960eadf05eb2ff22ed) REFERENCES entity_sites(id);

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_d92e814cd544c1a75add68";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_e7268df62d85872aca0b2b";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_76bca1f86ce8fed3f29c87";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_cba65517f0d34cf771c1aa";

ALTER TABLE public."entity_commSends" DROP CONSTRAINT "fk_7093e3705c4c4e7c0029f4";

ALTER TABLE public."entity_commissions" DROP CONSTRAINT "fk_7208dc2724a698aea88a51";

ALTER TABLE public."entity_storage_structure" DROP CONSTRAINT "fk_fe7fb9c43d92d57ed71fc1";

ALTER TABLE public."entity_storage_structure" DROP CONSTRAINT "fk_2e357823661007c0617fd5";

ALTER TABLE public."entity_storage_structure" DROP CONSTRAINT "fk_fb13267686b0aeec9b0e7c";

ALTER TABLE public."entity_master_fileAssets" DROP CONSTRAINT "fk_6e144924412fef31887f24";

ALTER TABLE public."entity_master_fileAssets" DROP CONSTRAINT "fk_9b6b0483f1907cb5669c18";

ALTER TABLE public."entity_auditLog" DROP CONSTRAINT "fk_928bf370ee3b08cf421503";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_1b29d4c9beb5dcb6444ca2";

ALTER TABLE public."entity_policy_rules" DROP CONSTRAINT "fk_fc0cc1c79fcf95bef06607";

ALTER TABLE public."entity_policy_rules" DROP CONSTRAINT "fk_aa44826eae816adb02071b";

ALTER TABLE public."entity_policy_rules" DROP CONSTRAINT "fk_4e76606867a54460b8dc43";

ALTER TABLE public."entity_staff_records" DROP CONSTRAINT "fk_dc6454755bcc2616aa07a2";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "fk_6dc246842fcf96a03d0350";

ALTER TABLE public."entity_acceptedScopes" DROP CONSTRAINT "fk_17474b5f5f529d4b1dd701";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "fk_8a9e295b7214d9f2c1234b";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "fk_a81d5a1a196c95900c7ad2";

ALTER TABLE public."entity_sites" DROP CONSTRAINT "fk_7f1d99cfae83ec36323d88";

ALTER TABLE public."entity_site_records" DROP CONSTRAINT "fk_73471282c5379ed394253b";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "fk_229f0dfee4370f04140a67";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "fk_7f333b54145fabfb6bafa3";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "fk_a5a31347f61349be9ed8bf";

ALTER TABLE public."entity_site_records" DROP CONSTRAINT "fk_cc4214770e5f8ebf29b5b2";

ALTER TABLE public."entity_workOrders" DROP CONSTRAINT "fk_78179bb0ce562b120652da";

ALTER TABLE public."entity_workOrders" DROP CONSTRAINT "fk_c3a53bb6f9da08b17092af";

ALTER TABLE public."entity_payments" DROP CONSTRAINT "fk_b21abe83b608a78c75529e";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_9805c8cf6eca89e317ff87";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_08eba53625235510ff7209";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_0f7e0bbcc579751f864e9e";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_a7ffd840ea0ea9a3444707";

ALTER TABLE public."entity_reference_libraries" DROP CONSTRAINT "fk_14cd4004347671e34b9059";

ALTER TABLE public."entity_reference_libraries" DROP CONSTRAINT "fk_88c831f84494b9dc7dac6e";

ALTER TABLE public."entity_reference_libraries" DROP CONSTRAINT "fk_4485270d403357688f1d2b";

ALTER TABLE public."entity_reference_libraries" DROP CONSTRAINT "fk_342e84fa330016125a4543";

ALTER TABLE public."entity_reference_libraries" DROP CONSTRAINT "fk_6a9958fbcfeaa547dbf651";

ALTER TABLE public."entity_reference_libraries" DROP CONSTRAINT "fk_f706d5ad9a4409a131a0f7";

ALTER TABLE public."entity_reference_libraries" DROP CONSTRAINT "fk_dc4b01f06ab810848f25f6";

ALTER TABLE public."entity_policy_rules" DROP CONSTRAINT "fk_8bcb8c65352ac11ff90f88";

ALTER TABLE public."entity_policy_rules" DROP CONSTRAINT "fk_0be457265c640290bed5c8";

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" DROP CONSTRAINT "fk_974cf57ed7ebdb8a1bbcb4";

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" DROP CONSTRAINT "fk_b5c37fee2f9c04aa82a033";

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" DROP CONSTRAINT "fk_748f3ffcd60e0dc190332a";

ALTER TABLE public."entity_master_fileAssets" DROP CONSTRAINT "fk_09d09780e9d212f7d3688b";

ALTER TABLE public."entity_master_fileAssets" DROP CONSTRAINT "fk_c0358e578d3f1482bd2fae";

ALTER TABLE public."entity_storage_structure" DROP CONSTRAINT "fk_2ab1e850dfae68b9c8545c";

ALTER TABLE public."entity_storage_structure" DROP CONSTRAINT "fk_94e0ba3236627460d6d78f";

ALTER TABLE public."entity_master_subcategoryArticleMap" DROP CONSTRAINT "fk_ffa522476204b5ac6d5cb8";

ALTER TABLE public."entity_master_subcategoryArticleMap" DROP CONSTRAINT "fk_ff3246da63474a9e259d2a";

ALTER TABLE public."entity_catalogue_items" DROP CONSTRAINT "fk_690423a8fc82dc079a02e2";

ALTER TABLE public."entity_catalogue_items" DROP CONSTRAINT "fk_d8a77b5ec3116469055396";

ALTER TABLE public."entity_rate_cards" DROP CONSTRAINT "fk_a3f6e42cb3248301ffb4b1";

ALTER TABLE public."entity_rate_cards" DROP CONSTRAINT "fk_9643810caa3ead0b4efbbd";

ALTER TABLE public."entity_rate_cards" DROP CONSTRAINT "fk_ce3106120d3face6bac506";

ALTER TABLE public."entity_rate_cards" DROP CONSTRAINT "fk_971b5def97b033c6faa476";

ALTER TABLE public."entity_rate_cards" DROP CONSTRAINT "fk_ba1489a7467d62a916f6de";

ALTER TABLE public."entity_rate_cards" DROP CONSTRAINT "fk_5ec0cee6ba814707ea61b9";

ALTER TABLE public."entity_rate_cards" DROP CONSTRAINT "fk_a0efd2f35ab05077f511f0";

ALTER TABLE public."entity_rate_cards" DROP CONSTRAINT "fk_a00a6b817ca3aef987c5f2";

ALTER TABLE public."entity_work_definitions" DROP CONSTRAINT "fk_ff30651d3512aee0de3c63";

ALTER TABLE public."entity_resource_links" DROP CONSTRAINT "fk_cc6bb7aca07614b0969a0f";

ALTER TABLE public."entity_resource_links" DROP CONSTRAINT "fk_9789435ef6453688c148db";

ALTER TABLE public."entity_resource_links" DROP CONSTRAINT "fk_a8ab1b3daf2e5e43875fe0";

ALTER TABLE public."entity_resource_links" DROP CONSTRAINT "fk_b119b36fa2d719fdf85e55";

ALTER TABLE public."entity_resource_links" DROP CONSTRAINT "fk_03e6c659b1b66f93ba5351";

ALTER TABLE public."entity_resource_links" DROP CONSTRAINT "fk_e4c89c6668648d6d6a38dd";

ALTER TABLE public."entity_resource_links" DROP CONSTRAINT "fk_44bc09dbee3eebc40dbdf0";

ALTER TABLE public."entity_resource_links" DROP CONSTRAINT "fk_b8130bab04531bbc185482";

ALTER TABLE public."entity_master_staff" DROP CONSTRAINT "fk_d5824d7c2e0078dfdd7680";

ALTER TABLE public."entity_reference_libraries" DROP CONSTRAINT "fk_8a12108e61dd4313fada92";

ALTER TABLE public."entity_reference_libraries" DROP CONSTRAINT "fk_e3285006b957a5ca96e15d";

ALTER TABLE public."entity_reference_libraries" DROP CONSTRAINT "fk_30ec54b01fa74a7a8d0d07";

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" DROP CONSTRAINT "fk_2a8bd38a5fcd576b947540";

ALTER TABLE public."entity_rate_cards" DROP CONSTRAINT "fk_1a23fccb040cb433a7e028";

ALTER TABLE public."entity_rate_cards" DROP CONSTRAINT "fk_612ceebc10d94a5b4bf6b5";

ALTER TABLE public."entity_rate_cards" DROP CONSTRAINT "fk_dab7a1ee8bd53014931a2b";

ALTER TABLE public."entity_rate_cards" DROP CONSTRAINT "fk_4893032f2f7289a5849130";

ALTER TABLE public."entity_master_subcategoryArticleMap" DROP CONSTRAINT "fk_0719d709820e3085d41bf3";

ALTER TABLE public."entity_catalogue_items" DROP CONSTRAINT "fk_d1fa09ff4dbc0b4bde5bad";

ALTER TABLE public."entity_catalogue_items" DROP CONSTRAINT "fk_0316b877f83df7ee315615";

ALTER TABLE public."entity_catalogue_items" DROP CONSTRAINT "fk_45b94fce7d4136852316a9";

ALTER TABLE public."entity_catalogue_items" DROP CONSTRAINT "fk_76b0e34853ce96e8cddaaa";

ALTER TABLE public."entity_work_definitions" DROP CONSTRAINT "fk_047ddb16d2fc14e959860b";

ALTER TABLE public."entity_resource_links" DROP CONSTRAINT "fk_21550eb7d1816275c1b8eb";

ALTER TABLE public."entity_resource_links" DROP CONSTRAINT "fk_a0fbf064aff8ed5f8949d1";

ALTER TABLE public."entity_staff_records" DROP CONSTRAINT "fk_f557bae84289b51b6faefc";

ALTER TABLE public."entity_staff_records" DROP CONSTRAINT "fk_f582f3d14f22826ec571a0";

ALTER TABLE public."entity_staff_records" DROP CONSTRAINT "fk_35c5c860e25a5dcc16e189";

ALTER TABLE public."entity_staff_records" DROP CONSTRAINT "fk_c14ca020d87c9c3bc3f38f";

ALTER TABLE public."entity_staff_records" DROP CONSTRAINT "fk_043da8afd9ea5b8c2785ac";

ALTER TABLE public."entity_commSends" DROP CONSTRAINT "fk_9374f21ccb960ffa79cd02";

ALTER TABLE public."entity_commSends" DROP CONSTRAINT "fk_6ee8fc60647b2783063872";

ALTER TABLE public."entity_commSends" DROP CONSTRAINT "fk_8fdd7c702090caab8b51f8";

ALTER TABLE public."entity_commSends" DROP CONSTRAINT "fk_4d700df1b51eb7efa3b48c";

ALTER TABLE public."entity_commSends" DROP CONSTRAINT "fk_53cff975739290e2063acc";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_0bffa47d162704b285cd11";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_5177fcfbc79ccd2214bedf";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_c9dd4ab6a897087ff17502";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_edc41eedf9a654983c5753";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_212d5e2379cff8eb250801";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_fcc966b27faaa7aaf56275";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "fk_3b278042f2b7952b5324f9";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "fk_5442397d12d48121452569";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "fk_27fc624a945f80610c90b9";

ALTER TABLE public."entity_money_movements" DROP CONSTRAINT "fk_8c770e233f848f8014e86b";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "fk_b5a1fc0372c1f3300a0b4f";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "fk_c75ba5840f885c8502cd85";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "fk_6d9c0c786b92906df759a3";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "fk_8d20f0482a87f0e9259fa6";

ALTER TABLE public."entity_payments" DROP CONSTRAINT "fk_39ada450c26c1e75f9ba86";

ALTER TABLE public."entity_payments" DROP CONSTRAINT "fk_83e828d6d00826a812222d";

ALTER TABLE public."entity_payments" DROP CONSTRAINT "fk_c9a501667ce2daf8eaa138";

ALTER TABLE public."entity_payments" DROP CONSTRAINT "fk_cf1285a77a438f10ad44c7";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_c20abf04ca3a97d9973685";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_922cae38c46a97b89914ac";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_20ee76cc4b66d47753ec3a";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_fa23a6f2d979c7a523fb16";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_82a0ec87d4e2c6138afc9f";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_2c6415dc0b90c0cdd29232";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_cf4a07a380bf1c08c09e66";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_39b2dcae4c3a874488ea29";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_3eb1a61a263088e30dd7d0";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_51edaf88c9d83f04baeac2";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_45757c6f1c0898d6713449";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_e8feb4e5dbe2eb49145e6c";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_0d4bb25631f4622bcaf782";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_42628d9d4ed76e8a88589e";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_a1e1adc38ddb64290a78b4";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_b5be5d91cdcb88217e9723";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_b2d49a0658f70938cc3876";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_590a818a59df4b54d9fc32";

ALTER TABLE public."entity_workflow_controls" DROP CONSTRAINT "fk_4c5105b9698c4ca640dbf5";

ALTER TABLE public."entity_site_records" DROP CONSTRAINT "fk_ba0e954faaea4dab0cb87c";

ALTER TABLE public."entity_site_records" DROP CONSTRAINT "fk_12c9da6fcc4e2c1aa82ab0";

ALTER TABLE public."entity_site_records" DROP CONSTRAINT "fk_c5dff8f1a0fea0804daa1b";

ALTER TABLE public."entity_site_records" DROP CONSTRAINT "fk_5155ed88c715e0034311fd";

ALTER TABLE public."entity_site_records" DROP CONSTRAINT "fk_6690dd3b6939abae5ab2b9";

ALTER TABLE public."entity_site_records" DROP CONSTRAINT "fk_ca8be0722b5b900004bcaa";

ALTER TABLE public."entity_site_records" DROP CONSTRAINT "fk_b112b4fda37f742cb9b40c";

ALTER TABLE public."entity_site_records" DROP CONSTRAINT "fk_613dcf520f8594944c9cd5";

ALTER TABLE public."entity_site_records" DROP CONSTRAINT "fk_8690da67edd74db99ec090";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "fk_85aad3b5630a69f6744ab5";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "fk_fbb325a503e283d878ff3b";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "fk_8675efcb6c3aaa0ce960e5";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "fk_00cb139598aa6defbd9191";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "fk_be5c82184dd6c28ebec0f8";

ALTER TABLE public."entity_commissions" DROP CONSTRAINT "fk_7558ea7eb1f5e11630d412";

ALTER TABLE public."entity_commissions" DROP CONSTRAINT "fk_a4f867e69d1dd24f104b30";

ALTER TABLE public."entity_commissions" DROP CONSTRAINT "fk_1339c516e239f8bb25f538";

ALTER TABLE public."entity_commissions" DROP CONSTRAINT "fk_e6dcb19c069d6070f96dab";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "fk_80afaa5c35ab6ae7156ce3";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "fk_ec8ea09f1823a0518017c8";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "fk_423a1846c2dcdfed117eb1";

ALTER TABLE public."entity_financial_documents" DROP CONSTRAINT "fk_f6b568c80083c1da9100dc";

ALTER TABLE public."entity_stockMovements" DROP CONSTRAINT "fk_3c923ab10e221a92ac97df";

ALTER TABLE public."entity_stockMovements" DROP CONSTRAINT "fk_b9780d3468247ee216a5e7";

ALTER TABLE public."entity_stockMovements" DROP CONSTRAINT "fk_554ac4d1d132c4adf01dc0";

ALTER TABLE public."entity_stockMovements" DROP CONSTRAINT "fk_44f7013c7c79cdf679d673";

ALTER TABLE public."entity_stockMovements" DROP CONSTRAINT "fk_fc6596535d2fcc9d05f412";

ALTER TABLE public."entity_inventory" DROP CONSTRAINT "fk_741f2d8735d50992e81d57";

ALTER TABLE public."entity_inventory" DROP CONSTRAINT "fk_4f89276d3dfd3d1ae0e15c";

ALTER TABLE public."entity_inventory" DROP CONSTRAINT "fk_9bf6c47aed272771fe896c";

ALTER TABLE public."entity_inventory" DROP CONSTRAINT "fk_7f462bbe09b33c52cc8cb2";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "fk_b28b35ce7b7ac56c3d077c";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "fk_8c601167d6c1f2d0f0474f";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "fk_757cb5cac8cc0aa37625fc";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "fk_0dd9cab7e28b0af42c60e0";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "fk_88c07f882465205342e84a";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "fk_8248de40d2b451057fce35";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "fk_abb31e06fe04b4a5c5bb06";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "fk_d012e37252c388048519ae";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "fk_b3c8077ac92a874e14a8b5";

ALTER TABLE public."entity_workOrders" DROP CONSTRAINT "fk_c7dcfd6f1b904c1d4579e5";

ALTER TABLE public."entity_workOrders" DROP CONSTRAINT "fk_6d95d022fa65659ab4e26d";

ALTER TABLE public."entity_acceptedScopes" DROP CONSTRAINT "fk_61f3f852ac7d3cddd62fb0";

ALTER TABLE public."entity_acceptedScopes" DROP CONSTRAINT "fk_dfc4b06e40d51e869c1cb6";

ALTER TABLE public."entity_acceptedScopes" DROP CONSTRAINT "fk_57a907e4e5a3493e3bc865";

ALTER TABLE public."entity_acceptedScopes" DROP CONSTRAINT "fk_832492dc0ebae12e256e5d";

ALTER TABLE public."entity_acceptedScopes" DROP CONSTRAINT "fk_4042e047f0e3a8f5c28eec";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "fk_9efb9abcb2c4349ea0c0c2";

ALTER TABLE public."entity_commercial_documents" DROP CONSTRAINT "fk_8f78663fff67cb2d1e4da6";

ALTER TABLE public."entity_site_records" DROP CONSTRAINT "fk_6c5fd6fe614fa17bc4a989";

ALTER TABLE public."entity_site_records" DROP CONSTRAINT "fk_8ea7cffe500bf44f5ced87";

ALTER TABLE public."entity_site_records" DROP CONSTRAINT "fk_3ec836e6e9e7f976c9f2ec";

ALTER TABLE public."entity_site_records" DROP CONSTRAINT "fk_2105354bd2715bedcfe2d0";

ALTER TABLE public."entity_workRequired" DROP CONSTRAINT "fk_effbca7833e714e2066dd2";

ALTER TABLE public."entity_workRequired" DROP CONSTRAINT "fk_3224562be51e137a578ee0";

ALTER TABLE public."entity_areas" DROP CONSTRAINT "fk_0d200c21780cd546eb3686";

ALTER TABLE public."entity_sites" DROP CONSTRAINT "fk_60b3dd9f6d7620ca56c60f";

DROP INDEX public."fk_0a07fa4658e95e97ee1a56";

DROP INDEX public."fk_755488fb4d2a59f113225a";

DROP INDEX public."fk_c8b6188442e77dd1abf1dd";

DROP INDEX public."fk_482a2fbf33e4bae26e72ed";

DROP INDEX public."fk_2e08c2d8815def117f7f84";

DROP INDEX public."fk_0b26bbe37f8d3366d431f6";

DROP INDEX public."fk_05fbf4864ace5c900418e3";

DROP INDEX public."fk_dc93a034353e78d72b2de2";

DROP INDEX public."fk_f9f0a4bed9921799289149";

DROP INDEX public."fk_8575be0d3e00f2b938b2d5";

DROP INDEX public."fk_94bcd837152d86b77a0abb";

DROP INDEX public."fk_22f5c47949709c3ca04a6a";

DROP INDEX public."fk_75c91c8fa0cf2357d62251";

DROP INDEX public."fk_06ce5c4adb2b079675b8fd";

DROP INDEX public."fk_07aa2445407643cb250d0c";

DROP INDEX public."fk_a7a2733a79aae5195fac0d";

DROP INDEX public."fk_de8f9ca07bc01e9c386437";

DROP INDEX public."fk_05b875cc0c02783bf32556";

DROP INDEX public."fk_916f17f661d7e449686f68";

DROP INDEX public."fk_2ad949cead25dd2771fe0a";

DROP INDEX public."fk_b00b227101805618b50fb0";

DROP INDEX public."fk_dc845b756525c558284402";

DROP INDEX public."fk_9d1b55e0e3a5ebab1796b8";

DROP INDEX public."fk_4c0c9b446f03ffeec3f412";

DROP INDEX public."fk_1f8dec0ca93fc1f2a16fd2";

DROP INDEX public."fk_63d88905812ff9ec7c4170";

DROP INDEX public."fk_989976ac366b2005302a66";

DROP INDEX public."fk_26068ef82afd1bb2b79d0f";

DROP INDEX public."fk_7b63e277f2cc1623795628";

DROP INDEX public."fk_821f26ac7f6ae2ba782c7f";

DROP INDEX public."fk_c22a25c31773ecd9a125ee";

DROP INDEX public."fk_0d3f972583e36f4241f28e";

DROP INDEX public."fk_86145948ca03d864d62757";

DROP INDEX public."fk_4ed52ad04cd8efb3679a73";

DROP INDEX public."fk_7662da432f9bbdc8b019f7";

DROP INDEX public."fk_a3297b6860d33d35c56596";

DROP INDEX public."fk_b4b226ef54cf7cbadc28e2";

DROP INDEX public."fk_04d5bb0895be1af98b1d15";

DROP INDEX public."fk_3d1edea278066831f83e4c";

DROP INDEX public."fk_8f8cd651f48fc11ec43759";

DROP INDEX public."fk_b0d668eb63e6fc5708d699";

DROP INDEX public."fk_6962836e20fc3b4546f992";

DROP INDEX public."fk_3211ee58bc2590f390816d";

DROP INDEX public."fk_43d7425ab7130a1ef69fc3";

DROP INDEX public."fk_bfb8f0fbbdf21b52affc70";

DROP INDEX public."fk_92a0feec010c42bcdfa4ed";

DROP INDEX public."fk_ff752c5021e38a5516ea14";

DROP INDEX public."fk_9288d6831e14b2f840982d";

DROP INDEX public."fk_d46a48c209e1f5a7024b07";

DROP INDEX public."fk_843cde6c244a26a793dd03";

DROP INDEX public."fk_35a2aa7802eeef6e18286d";

DROP INDEX public."fk_40174ed2a1e20be61e52db";

DROP INDEX public."fk_cd394b471fe93dc7eb9e4a";

DROP INDEX public."fk_e3ec6471348a42397db311";

DROP INDEX public."fk_0fefc561eb965cb7905794";

DROP INDEX public."fk_ca6f9c6baac61d8be8723e";

DROP INDEX public."fk_4e01a1a66fe43774f7e5b1";

DROP INDEX public."fk_ff314fdfbe03b7725d6149";

DROP INDEX public."fk_ae1332ebad52079f959b67";

DROP INDEX public."fk_c5191e8f17ba1e69403a91";

DROP INDEX public."fk_d0937b2a3ddf033ab7daa5";

DROP INDEX public."fk_6caaeedfadd60bcd67e073";

DROP INDEX public."fk_c6c187db1d0554a196268f";

DROP INDEX public."fk_9b5737296f750d513eaa24";

DROP INDEX public."fk_6a22fd7b233dda1bdda93f";

DROP INDEX public."fk_997a198b1800a00d131c37";

DROP INDEX public."fk_570bd797912659852dd7de";

DROP INDEX public."fk_03e906974f5d38dcebcf78";

DROP INDEX public."fk_03ae3ac594d61fe74fcda9";

DROP INDEX public."fk_34de51124f663c6852dd7a";

DROP INDEX public."fk_0050680e52a5b5adb053a1";

DROP INDEX public."fk_e8525a3ddee08baa5695a2";

DROP INDEX public."fk_e5da3eb8e85f77c6fd613f";

DROP INDEX public."fk_5dbfcc74d05a2af18d050a";

DROP INDEX public."fk_2d59bb982dc6cad8ed47b3";

DROP INDEX public."fk_2cbae80599de4f0e646404";

DROP INDEX public."fk_4ac28ecb21a11b2d2e3837";

DROP INDEX public."fk_9832a23fc70f1585efde16";

DROP INDEX public."fk_7db8e3cb99d7e818fa8b36";

DROP INDEX public."fk_dc4e0aac3c3dc60d9ea6b9";

DROP INDEX public."fk_678eb5a158560e59b16ff9";

DROP INDEX public."fk_968332196b39bd6075d9c6";

DROP INDEX public."fk_b2d630fd9cf7c8420971fb";

DROP INDEX public."fk_6831b8bf3687647ac7c096";

DROP INDEX public."fk_7c6431ca257c1cd4fc1a45";

DROP INDEX public."fk_3d956ed098e3f450822bcd";

DROP INDEX public."fk_9083b83386ba7cc1ba423b";

DROP INDEX public."fk_40b0e32bdfa2eed97dc862";

DROP INDEX public."fk_0d1f8bf1ad01860f051d9e";

DROP INDEX public."fk_92f5fcb5a93d94da5452c3";

DROP INDEX public."fk_6ee7f1574b51fb78801724";

DROP INDEX public."fk_9f3e4fd8f23bbf326579df";

DROP INDEX public."fk_0dd43a1b5f622e1fc43508";

DROP INDEX public."fk_8dcb04b91a6c1db41348d2";

DROP INDEX public."fk_e3ce27ba3706016f4acba7";

DROP INDEX public."fk_b84b7843547f2d756efcd0";

DROP INDEX public."fk_dc06761c97fed47f295b30";

DROP INDEX public."fk_906d13c65fa8ea07635c7a";

DROP INDEX public."fk_300cc9a761f5f09e5a07c4";

DROP INDEX public."fk_8158ff43a52a531d7af84d";

DROP INDEX public."fk_0c55dd460af8a56df3d334";

DROP INDEX public."fk_66f4c2952f03b205eeade5";

DROP INDEX public."fk_8abdb5c707ac111bff2bfd";

DROP INDEX public."fk_eec84cdd07b8ef5ca8d351";

DROP INDEX public."fk_bb16ded7a7fd84358429a2";

DROP INDEX public."fk_95ad9d08f24b535566426a";

DROP INDEX public."fk_e6f6f44eeb771eb40a8cfd";

DROP INDEX public."fk_6c2ebe2b497fd57747b068";

DROP INDEX public."fk_6d5ecf314bf85eb16e50b1";

DROP INDEX public."fk_1f1c00c8fac9def9d44cb5";

DROP INDEX public."fk_8628a386d5f87b878f3c97";

DROP INDEX public."fk_03df1090f06037b906ebc5";

DROP INDEX public."fk_cc4d031a9be5ebb77ad13d";

DROP INDEX public."fk_7cc37fb59927ea1936b4f7";

DROP INDEX public."fk_f4b3680decef0449b814b6";

DROP INDEX public."fk_a5a295c02fc88a36d7a90a";

DROP INDEX public."fk_f15ada9a0aea61ae083fda";

DROP INDEX public."fk_920ed14c5b22dde2cefd59";

DROP INDEX public."fk_ce023d368f9be7eee0e169";

DROP INDEX public."fk_1437d447e55a8cea0e1ff2";

DROP INDEX public."fk_fb5fe58d070502ed32d943";

DROP INDEX public."fk_04fccfdefe28d41ef24fb9";

DROP INDEX public."fk_30f5844c7b006c90474091";

DROP INDEX public."fk_b0baa516322a03a5c05fdf";

DROP INDEX public."fk_54a093fe6a74d035bb8f8b";

DROP INDEX public."fk_8fcf4e6060c8a2c2ff9f9c";

DROP INDEX public."fk_fc4e317dfc022dfa77c648";

DROP INDEX public."fk_bd43f91060df3d9749fb78";

DROP INDEX public."fk_76c55d5a0eeecc7d54fafe";

DROP INDEX public."fk_31394d1308d224f9184706";

DROP INDEX public."fk_3a8f5621c853545459d87f";

DROP INDEX public."fk_a9cae94cde7a6ee872dff2";

DROP INDEX public."fk_fffba98abdee6882b4add5";

DROP INDEX public."fk_73f78c46845c831994dc87";

DROP INDEX public."fk_8320d4269f56ef9df87b2e";

DROP INDEX public."fk_bc84b3f0e72fbaccd750a6";

DROP INDEX public."fk_623725dc99d8aacc558568";

DROP INDEX public."fk_436256f804bcca77d29b9a";

DROP INDEX public."fk_9687a0249e7dbe6f53bf1f";

DROP INDEX public."fk_d36dae83f4ce3d8146384e";

DROP INDEX public."fk_f8f346b0b8bac06b591ca3";

DROP INDEX public."fk_d9cc453a46a447c99f64d6";

DROP INDEX public."fk_6278b711908710894cface";

DROP INDEX public."fk_7ccaf28b78abaf16b47c87";

DROP INDEX public."fk_8806188136109d1ee9208b";

DROP INDEX public."fk_a0218e54be6fe3c24f85b3";

DROP INDEX public."fk_b98da341273ae4bb087f39";

DROP INDEX public."fk_0b28f35d2ae7b055f7b04e";

DROP INDEX public."fk_a41919494f439406e3f547";

DROP INDEX public."fk_4a55fcc013b9c57b3dc9aa";

DROP INDEX public."fk_470b02246e19d3e1bee2fc";

DROP INDEX public."fk_c22620ba0dc126e428ff4c";

DROP INDEX public."fk_a42a8af451dbfdfcd9fcf5";

DROP INDEX public."fk_993b18ee76cda5a0e510dd";

DROP INDEX public."fk_a578d36b22ad24adb1ab48";

DROP INDEX public."fk_6c68aada900acf7d0cf906";

DROP INDEX public."fk_6162f1b896f6cf1ff9dc95";

DROP INDEX public."fk_04c9f90ed060bc6db54416";

DROP INDEX public."fk_9454335b02361497b474dd";

DROP INDEX public."fk_67253c33e7febd4901ccf2";

DROP INDEX public."fk_3c3cb20c9455645c921d57";

DROP INDEX public."fk_99e511e835c25a25c464c8";

DROP INDEX public."fk_837d21af6f1074c46c0c3c";

DROP INDEX public."fk_95a0b1f6a76718c7b9a259";

DROP INDEX public."fk_4278a07e1cf25da7f7d805";

DROP INDEX public."fk_d65e8ebdc90b6e7704c4a3";

DROP INDEX public."fk_89653649b8218ecd6e3e16";

DROP INDEX public."fk_f79d71e5ec6071599dc238";

DROP INDEX public."fk_0e82af9521986d9242e5a7";

DROP INDEX public."fk_a03b4b94e72feb11cdb1b2";

DROP INDEX public."fk_c6547c9b60cc5ca481a1c1";

DROP INDEX public."fk_3cf2c22200711ef0f61f76";

DROP INDEX public."fk_439455cd97ce806b6d3654";

DROP INDEX public."fk_0fabe02e09717dd785e547";

DROP INDEX public."fk_26bf7e0aaa88afc16605b4";

DROP INDEX public."fk_67bddc61d88d9685cc9224";

DROP INDEX public."fk_52b35d52ba46b48d7fff09";

DROP INDEX public."fk_f666b06ef2decfc46b2c1d";

DROP INDEX public."fk_d5810ffb9e3efb9fe1bd44";

DROP INDEX public."fk_228db7d2c5b6a94f4de013";

DROP INDEX public."fk_256cf11bc47d1833d8daa4";

DROP INDEX public."fk_e04ab4cb2624a5ee525404";

DROP INDEX public."fk_2078e40c0e336f34537b53";

DROP INDEX public."fk_55c62be0e093e9d304eb6c";

DROP INDEX public."fk_5b0e8c3b97d0abce675dfd";

DROP INDEX public."fk_be21c8a92a66f522b4a951";

DROP INDEX public."fk_aa5deaed86702ac5e12131";

DROP INDEX public."fk_8a6911f8300f7f36017e39";

DROP INDEX public."fk_364d06ac39d48f39352e75";

DROP INDEX public."fk_3cb32f6eb8811690f957ae";

DROP INDEX public."fk_e25ffb02fd176393f72d76";

DROP INDEX public."fk_dad1699df217b109370768";

DROP INDEX public."fk_8ca3e44149c479a9dca788";

DROP INDEX public."fk_90b50d5c987b0b9c651b70";

DROP INDEX public."fk_be437c6f8a128a0fc1c20e";

DROP INDEX public."fk_2f90205b434872f34d1f84";

DROP INDEX public."fk_657d1460b8c74dba6b2463";

DROP INDEX public."fk_9feb1fffa2ffc548ffa96d";

DROP INDEX public."fk_a7bc438915063bff465155";

DROP INDEX public."fk_db51ef3d82fd3aa875fc8c";

DROP INDEX public."fk_a3c798826c9e2e7a2c64d3";

DROP INDEX public."fk_c29c2b3e8b5b5ea14830bd";

DROP INDEX public."fk_e86069df16d88a642feaed";

DROP INDEX public."fk_27b8d818dc64f53572f69a";

DROP INDEX public."fk_aeef2fc04077a8131a1e41";

DROP INDEX public."fk_88352eda92bda6afee4a67";

DROP INDEX public."fk_26274574ee69dd60a02ed1";

DROP INDEX public."fk_eed8f6cd609c85601e711f";

ALTER TABLE public."entity_storage_structure" DROP COLUMN "fk_75d807b07b238c4287c423";

ALTER TABLE public."entity_storage_structure" DROP COLUMN "fk_75910e2fbaf662367dae85";

ALTER TABLE public."entity_storage_structure" DROP COLUMN "fk_3ed4c9fb6f98d672eea1f6";

ALTER TABLE public."entity_master_fileAssets" DROP COLUMN "fk_463d558a10e3080e73869a";

ALTER TABLE public."entity_master_fileAssets" DROP COLUMN "fk_9dd55da28d514ed1ae3fa6";

ALTER TABLE public."entity_auditLog" DROP COLUMN "fk_0643096ce7bedeb69787f0";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_ba7fdc4b68694c59cdd396";

ALTER TABLE public."entity_policy_rules" DROP COLUMN "fk_d5143a715986ab35224433";

ALTER TABLE public."entity_policy_rules" DROP COLUMN "fk_f22512ffe604eb1d1d25ee";

ALTER TABLE public."entity_policy_rules" DROP COLUMN "fk_0d09bc1948d69a213e76ed";

ALTER TABLE public."entity_staff_records" DROP COLUMN "fk_cc1f5f7e1dc1bdb3b40b75";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_b4cd05008d89ca902bc24b";

ALTER TABLE public."entity_acceptedScopes" DROP COLUMN "fk_c54e2099ca843e0887abc9";

ALTER TABLE public."entity_acceptedScopes" DROP COLUMN "fk_383222e592db5fd66a634c";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_84c1be0f15e887d9695ace";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_0853d2f491d44bf1c48d8a";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_14c440208db17069411b62";

ALTER TABLE public."entity_sites" DROP COLUMN "fk_f1892595aba508043212c3";

ALTER TABLE public."entity_site_records" DROP COLUMN "fk_c8f7fe4cfde8eff5535d3e";

ALTER TABLE public."entity_site_records" DROP COLUMN "fk_a0564f9c6126491c077618";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "fk_acc63b09e5f6f4893403ab";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "fk_5513b4b0e52ac9d3ea3c19";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_4adab8fe285be0a2698c68";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_2dcf3859a7872a6e330a41";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_acc63b09e5f6f4893403ab";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_a04b52af6c37e65ecef590";

ALTER TABLE public."entity_site_records" DROP COLUMN "fk_d839543714eb0592cc67f6";

ALTER TABLE public."entity_workOrders" DROP COLUMN "fk_6a19c08ff1313f013b4b20";

ALTER TABLE public."entity_workOrders" DROP COLUMN "fk_ad7ea408471e7cb5177099";

ALTER TABLE public."entity_payments" DROP COLUMN "fk_bdc2f67f6d1c55498b5f82";

ALTER TABLE public."entity_payments" DROP COLUMN "fk_e67dac9cfc4fff4bcb38ef";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_4e233e7e96a2b125380d2b";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_acc63b09e5f6f4893403ab";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_2745a1d3b92d3789a9b837";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_f61cbbc200b724658ca2d2";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_f8791eb9f0b3d744b237b2";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_e47da5d02bfbf133bb2bc0";

ALTER TABLE public."entity_reference_libraries" DROP COLUMN "fk_a2c7f098a6a3df62791891";

ALTER TABLE public."entity_reference_libraries" DROP COLUMN "fk_50dbe7d123e68291dde36e";

ALTER TABLE public."entity_reference_libraries" DROP COLUMN "fk_7f8a9aedda707dab2bc641";

ALTER TABLE public."entity_reference_libraries" DROP COLUMN "fk_1645cefc5658ccf20fb49c";

ALTER TABLE public."entity_reference_libraries" DROP COLUMN "fk_fac422498fa0394b160927";

ALTER TABLE public."entity_reference_libraries" DROP COLUMN "fk_784a7618f9dfe244ff7c56";

ALTER TABLE public."entity_reference_libraries" DROP COLUMN "fk_2654525b51c04b0efab6ef";

ALTER TABLE public."entity_reference_libraries" DROP COLUMN "fk_f63212e6e69c6516f3e205";

ALTER TABLE public."entity_reference_libraries" DROP COLUMN "fk_0a4191a5dc2b24ac172269";

ALTER TABLE public."entity_reference_libraries" DROP COLUMN "fk_8a8877c0404aa5d1b7d647";

ALTER TABLE public."entity_policy_rules" DROP COLUMN "fk_0a4191a5dc2b24ac172269";

ALTER TABLE public."entity_policy_rules" DROP COLUMN "fk_bf286c96ac1c12dd4d89e7";

ALTER TABLE public."entity_policy_rules" DROP COLUMN "fk_102797febcb32ed3248056";

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" DROP COLUMN "fk_31040da32553891d411ee2";

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" DROP COLUMN "fk_fac422498fa0394b160927";

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" DROP COLUMN "fk_e6ba4a1248905f9997e996";

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" DROP COLUMN "fk_236135feae33ca9ca3b0cd";

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" DROP COLUMN "fk_c703e5cfa8df4a9d2336f2";

ALTER TABLE public."entity_master_fileAssets" DROP COLUMN "fk_9ae333c9d8fa30ce724a0e";

ALTER TABLE public."entity_master_fileAssets" DROP COLUMN "fk_62f1eb46eaa5b05fb32879";

ALTER TABLE public."entity_master_fileAssets" DROP COLUMN "fk_f0c5c2f590dc58858709dc";

ALTER TABLE public."entity_storage_structure" DROP COLUMN "fk_44a69c42015c8241b55452";

ALTER TABLE public."entity_storage_structure" DROP COLUMN "fk_1081b559071058ce2d5ab7";

ALTER TABLE public."entity_storage_structure" DROP COLUMN "fk_04da0de8aae155ec9bd994";

ALTER TABLE public."entity_master_subcategoryArticleMap" DROP COLUMN "fk_2654525b51c04b0efab6ef";

ALTER TABLE public."entity_master_subcategoryArticleMap" DROP COLUMN "fk_6e9bdb1ecfdba3041d6b95";

ALTER TABLE public."entity_master_subcategoryArticleMap" DROP COLUMN "fk_fac422498fa0394b160927";

ALTER TABLE public."entity_master_subcategoryArticleMap" DROP COLUMN "fk_b36ddbb4bc654531c3c1cc";

ALTER TABLE public."entity_catalogue_items" DROP COLUMN "fk_6ebf8ddcf6a612bca71b60";

ALTER TABLE public."entity_catalogue_items" DROP COLUMN "fk_fac422498fa0394b160927";

ALTER TABLE public."entity_catalogue_items" DROP COLUMN "fk_7a840400af1160b43d9f67";

ALTER TABLE public."entity_rate_cards" DROP COLUMN "fk_8ef9871636db8a181fb5ce";

ALTER TABLE public."entity_rate_cards" DROP COLUMN "fk_95016ddea22546dd84d5a8";

ALTER TABLE public."entity_rate_cards" DROP COLUMN "fk_e6a6594c5c41000dab09c6";

ALTER TABLE public."entity_rate_cards" DROP COLUMN "fk_0fada2c2bbf5136e0c8b7d";

ALTER TABLE public."entity_rate_cards" DROP COLUMN "fk_99f284dcefe36ba0909b03";

ALTER TABLE public."entity_rate_cards" DROP COLUMN "fk_c9d9abf3c52bdbfe1d7002";

ALTER TABLE public."entity_rate_cards" DROP COLUMN "fk_fac422498fa0394b160927";

ALTER TABLE public."entity_rate_cards" DROP COLUMN "fk_25e0f870855581899ddfd0";

ALTER TABLE public."entity_rate_cards" DROP COLUMN "fk_8a507531c7acecd235a7b0";

ALTER TABLE public."entity_rate_cards" DROP COLUMN "fk_603f8b15b82ee7fd2ef97c";

ALTER TABLE public."entity_work_definitions" DROP COLUMN "fk_0a4191a5dc2b24ac172269";

ALTER TABLE public."entity_work_definitions" DROP COLUMN "fk_9780631d80052ebe69fca1";

ALTER TABLE public."entity_resource_links" DROP COLUMN "fk_68b7ee5b9f1b742d44f9e8";

ALTER TABLE public."entity_resource_links" DROP COLUMN "fk_1cd70b4cd2f5d99a0c26d7";

ALTER TABLE public."entity_resource_links" DROP COLUMN "fk_b9ad05508e51eb1fe23ba5";

ALTER TABLE public."entity_resource_links" DROP COLUMN "fk_fac422498fa0394b160927";

ALTER TABLE public."entity_resource_links" DROP COLUMN "fk_cc680ef9f9a8fd7faf9966";

ALTER TABLE public."entity_resource_links" DROP COLUMN "fk_988c7a31f569779d03359c";

ALTER TABLE public."entity_resource_links" DROP COLUMN "fk_67e5ddaef114bebb77b9a8";

ALTER TABLE public."entity_resource_links" DROP COLUMN "fk_0853d2f491d44bf1c48d8a";

ALTER TABLE public."entity_resource_links" DROP COLUMN "fk_2512295419b9a39864a673";

ALTER TABLE public."entity_resource_links" DROP COLUMN "fk_d46b91a12d72bcfed87daa";

ALTER TABLE public."entity_master_staff" DROP COLUMN "fk_79551058039cd5c6c71b26";

ALTER TABLE public."entity_reference_libraries" DROP COLUMN "fk_5193d9bda360797cd48056";

ALTER TABLE public."entity_reference_libraries" DROP COLUMN "fk_16aa0919054a7866b8b06c";

ALTER TABLE public."entity_reference_libraries" DROP COLUMN "fk_1cd70b4cd2f5d99a0c26d7";

ALTER TABLE public."entity_reference_libraries" DROP COLUMN "fk_72c2c7ca8f6d8afbe4c5f3";

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" DROP COLUMN "fk_1cd70b4cd2f5d99a0c26d7";

ALTER TABLE public."entity_master_catalogueArticleVendorLinks" DROP COLUMN "fk_450feed94fbcd78825b5c6";

ALTER TABLE public."entity_rate_cards" DROP COLUMN "fk_80449abae91c8de40a6463";

ALTER TABLE public."entity_rate_cards" DROP COLUMN "fk_21939ac50c88698434a400";

ALTER TABLE public."entity_rate_cards" DROP COLUMN "fk_bd0c38735e2cc52effab0b";

ALTER TABLE public."entity_rate_cards" DROP COLUMN "fk_1cd70b4cd2f5d99a0c26d7";

ALTER TABLE public."entity_rate_cards" DROP COLUMN "fk_9036586dfc79f0010d2c24";

ALTER TABLE public."entity_master_subcategoryArticleMap" DROP COLUMN "fk_0d1809aab48570397ef8b2";

ALTER TABLE public."entity_catalogue_items" DROP COLUMN "fk_462a700cfa2a2f92e72e71";

ALTER TABLE public."entity_catalogue_items" DROP COLUMN "fk_2b043c27696eb2f750befa";

ALTER TABLE public."entity_catalogue_items" DROP COLUMN "fk_64729664196ad7b4fac07e";

ALTER TABLE public."entity_catalogue_items" DROP COLUMN "fk_0a4191a5dc2b24ac172269";

ALTER TABLE public."entity_catalogue_items" DROP COLUMN "fk_8d4ac18b6c75f3a40e272b";

ALTER TABLE public."entity_work_definitions" DROP COLUMN "fk_3aa87c542c8a07119a75f5";

ALTER TABLE public."entity_resource_links" DROP COLUMN "fk_1fbda2e999cec542b203e5";

ALTER TABLE public."entity_staff_records" DROP COLUMN "fk_23bb4d3cc09facbd3efab2";

ALTER TABLE public."entity_staff_records" DROP COLUMN "fk_6450298be5f3fc93aecb02";

ALTER TABLE public."entity_staff_records" DROP COLUMN "fk_d123635022cbb8957102e6";

ALTER TABLE public."entity_staff_records" DROP COLUMN "fk_eaae0549de6f467559421f";

ALTER TABLE public."entity_staff_records" DROP COLUMN "fk_5c6460df9aaca663775e94";

ALTER TABLE public."entity_staff_records" DROP COLUMN "fk_cb17bdd280007897ed74c0";

ALTER TABLE public."entity_staff_records" DROP COLUMN "fk_7065276f232cdd338b1ab3";

ALTER TABLE public."entity_commSends" DROP COLUMN "fk_0853d2f491d44bf1c48d8a";

ALTER TABLE public."entity_commSends" DROP COLUMN "fk_a1f6bf781a3e37dfacd04d";

ALTER TABLE public."entity_commSends" DROP COLUMN "fk_eca7d0d9d2bbb9eb824e04";

ALTER TABLE public."entity_commSends" DROP COLUMN "fk_786ae18e16d97766002ef1";

ALTER TABLE public."entity_commSends" DROP COLUMN "fk_8116d4f3427c949df47ded";

ALTER TABLE public."entity_commSends" DROP COLUMN "fk_f8791eb9f0b3d744b237b2";

ALTER TABLE public."entity_commSends" DROP COLUMN "fk_2c5c0b4536abdcc14ff056";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_786ae18e16d97766002ef1";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_a8f6fe983046d7581df008";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_ddc8f7d052dbed27880e70";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_7409887f12a2950fccd5ac";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_f9628020918880110d7e36";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_45b72bbd42a8cec266539d";

ALTER TABLE public."entity_money_movements" DROP COLUMN "fk_4f33ecf90136a97a82223e";

ALTER TABLE public."entity_money_movements" DROP COLUMN "fk_0853d2f491d44bf1c48d8a";

ALTER TABLE public."entity_money_movements" DROP COLUMN "fk_a9a90ae84db7fbfd07f73b";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "fk_5e01330187dc9a4bbd5648";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "fk_0853d2f491d44bf1c48d8a";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "fk_f905e3166b2a22f7d6406c";

ALTER TABLE public."entity_payments" DROP COLUMN "fk_c101efd23d771573ca5549";

ALTER TABLE public."entity_payments" DROP COLUMN "fk_0853d2f491d44bf1c48d8a";

ALTER TABLE public."entity_payments" DROP COLUMN "fk_56e30db524815172569588";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_18c95b790e0d38b20922ce";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_015eaac490701c6a2d85ca";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_a74b645a1c2738fb186115";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_9e6ab147f4cbde41434d72";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_73b01ca72803c5e4cf5c98";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_58501682bd9e0d1c572a17";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_953d8687632fd07a75d163";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_cb17bdd280007897ed74c0";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_a04f46fdcc2aa90beb0fe7";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_0853d2f491d44bf1c48d8a";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_2e5a7145b0cd89722197e8";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_7b93e024c47af3933d82ae";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_4dbeff4f841d33c18fb57c";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_c7a552887de8df41877374";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_38640995a1552b46250636";

ALTER TABLE public."entity_workflow_controls" DROP COLUMN "fk_5b62bf8b55d88be8293b71";

ALTER TABLE public."entity_site_records" DROP COLUMN "fk_4a03c0242bea24a0e54390";

ALTER TABLE public."entity_site_records" DROP COLUMN "fk_5179661c000c454f21bdd2";

ALTER TABLE public."entity_site_records" DROP COLUMN "fk_0d9e634722ad2fec0bdc88";

ALTER TABLE public."entity_site_records" DROP COLUMN "fk_600b43a5e6cfd7378878f4";

ALTER TABLE public."entity_site_records" DROP COLUMN "fk_ca4d44ce70d581747696d4";

ALTER TABLE public."entity_site_records" DROP COLUMN "fk_4978319042b99507c75ea4";

ALTER TABLE public."entity_site_records" DROP COLUMN "fk_ea26303c886a93a851868d";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_d34c922ce43283dd7d0a7c";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_651b0a929c11c4e990bd9c";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_17aa718599743a6a85f6b0";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_1fc53206fc42919f5ceed7";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_3e9235a9321c6ba600b72e";

ALTER TABLE public."entity_commissions" DROP COLUMN "fk_0853d2f491d44bf1c48d8a";

ALTER TABLE public."entity_commissions" DROP COLUMN "fk_e3c213d44476e14a10bd6d";

ALTER TABLE public."entity_commissions" DROP COLUMN "fk_f78e3d600be57d55f80b95";

ALTER TABLE public."entity_commissions" DROP COLUMN "fk_5b62d5863e6027fe6514ba";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "fk_1884a74c87effd8c71c4f6";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "fk_d5f3334efa1f71fbb650ab";

ALTER TABLE public."entity_financial_documents" DROP COLUMN "fk_a50efb593eca2e4ce9f964";

ALTER TABLE public."entity_stockMovements" DROP COLUMN "fk_e8f8c3b07c118955be8ce6";

ALTER TABLE public."entity_stockMovements" DROP COLUMN "fk_cb709b61ac0aa8a4a98300";

ALTER TABLE public."entity_stockMovements" DROP COLUMN "fk_ddc8f7d052dbed27880e70";

ALTER TABLE public."entity_stockMovements" DROP COLUMN "fk_dec691dc703f2ab0fce2b3";

ALTER TABLE public."entity_stockMovements" DROP COLUMN "fk_58501682bd9e0d1c572a17";

ALTER TABLE public."entity_stockMovements" DROP COLUMN "fk_b92191666f20f37b39b23e";

ALTER TABLE public."entity_stockMovements" DROP COLUMN "fk_fa74d8db3975a981d21b4a";

ALTER TABLE public."entity_stockMovements" DROP COLUMN "fk_292e72a90675a7f95d5f39";

ALTER TABLE public."entity_inventory" DROP COLUMN "fk_8c5b5d4d94dbe3feb78042";

ALTER TABLE public."entity_inventory" DROP COLUMN "fk_fac422498fa0394b160927";

ALTER TABLE public."entity_inventory" DROP COLUMN "fk_3bb7be1adcb89583414f04";

ALTER TABLE public."entity_inventory" DROP COLUMN "fk_c28abf316488fe91627c3c";

ALTER TABLE public."entity_inventory" DROP COLUMN "fk_ddc8f7d052dbed27880e70";

ALTER TABLE public."entity_inventory" DROP COLUMN "fk_c5a771fa8caed35828d0d7";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_e1612eb53986efe045b195";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_2f3c80d3a51f5b3d8bfae9";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_c2de248eb3471753e8052e";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_67779c31b1f70e393c7c30";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_eea6e1d233152270d8f2e6";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_8de9db8fc8e5a7feda96db";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_6a4698fb629c886b35693e";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_2f6df3f430b82daf321303";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_72a71299bc8f80264ca34a";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_f79be1591db98a2e9f9819";

ALTER TABLE public."entity_commercial_documents" DROP COLUMN "fk_c7a42560262ae3f3bd1c40";

ALTER TABLE public."entity_acceptedScopes" DROP COLUMN "fk_907a82a54f99c5f559aea4";

ALTER TABLE public."entity_acceptedScopes" DROP COLUMN "fk_0853d2f491d44bf1c48d8a";

ALTER TABLE public."entity_acceptedScopes" DROP COLUMN "fk_d08aebf50269477f5f3177";

ALTER TABLE public."entity_acceptedScopes" DROP COLUMN "fk_9b5d1f805774ca81b771f6";

ALTER TABLE public."entity_site_records" DROP COLUMN "fk_95cdd59bbe408086bd47d3";

ALTER TABLE public."entity_site_records" DROP COLUMN "fk_09b0a6b82348f900a39b74";

ALTER TABLE public."entity_site_records" DROP COLUMN "fk_0fee8b0239f61c18359aee";

ALTER TABLE public."entity_site_records" DROP COLUMN "fk_49eaae94bc0606b4d4dd43";

ALTER TABLE public."entity_site_records" DROP COLUMN "fk_c6a5f96ea3c94625acd49a";

NOTIFY pgrst, 'reload schema';

COMMIT;
