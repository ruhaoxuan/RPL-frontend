import { z } from "zod";
import { dataSourceSchema } from "./dataSources";
// Validate the complete response before exposing it to rendering code.
export const syncJobSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  status: z.enum(["running", "success", "failed"]),
  message: z.string(),
  kind: z.enum(["sync", "check"]).optional(),
});
export const syncStateSchema = z.object({
  busy: z.boolean(),
  sources: z.array(
    z.object({
      id: z.string(),
      supported: z.boolean(),
      checkSupported: z.boolean().optional(),
      record: dataSourceSchema.optional(),
      job: syncJobSchema.nullable(),
    }),
  ),
});
