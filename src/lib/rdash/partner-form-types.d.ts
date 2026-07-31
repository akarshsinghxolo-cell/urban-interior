import "./types";

declare module "./types" {
  interface Vendor {
    /** Structured Article Library links supplied by this Vendor. */
    article_ids?: string[];
  }
}

export {};
