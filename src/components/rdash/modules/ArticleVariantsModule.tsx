"use client";

import { WorkCategoryMasterModule } from "./WorkCategoryMasterModule";

/**
 * Canonical article-variant workspace.
 *
 * The retired prototype kept a hard-coded variant list in component state.
 * This view delegates to the real master-data editor, which reads
 * db.master.articleVariants and persists changes through mutateMaster.
 */
export function ArticleVariantsModule() {
  return <WorkCategoryMasterModule initialView="variants" />;
}
