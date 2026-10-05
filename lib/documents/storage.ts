import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface DocumentStorage {
  upload(path: string, buffer: Buffer, contentType: string): Promise<void>;
}

type Bucket = ReturnType<SupabaseClient["storage"]["from"]>;

/** Thin wrapper over the private `documents` Supabase Storage bucket — see the storage bucket migration and lib/documents/db.ts. */
export function createSupabaseDocumentStorage(bucket: Bucket): DocumentStorage {
  return {
    async upload(path, buffer, contentType) {
      const { error } = await bucket.upload(path, buffer, {
        contentType,
        upsert: false,
      });
      if (error) throw error;
    },
  };
}
