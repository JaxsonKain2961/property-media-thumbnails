import { z } from "zod";

/**
 * The three record types a property-management back office actually attaches
 * images to. The record type — not the uploader's preference — decides how the
 * derivatives are produced, which is why it is part of the request body.
 */
export const RecordKind = z.enum([
  "maintenance_request",
  "tenant_document",
  "inspection_reminder",
]);
export type RecordKind = z.infer<typeof RecordKind>;

export const MediaIntake = z.object({
  /** Stable id of the maintenance request / document / reminder. */
  recordId: z.string().min(1),
  recordKind: RecordKind,
  unit: z.string().min(1),
  filename: z.string().regex(/\.(png|jpg|jpeg|webp)$/i),
  /** Base64 payload of the original capture. */
  fileBase64: z.string().min(1),
});
export type MediaIntake = z.infer<typeof MediaIntake>;

export interface Variant {
  label: string;
  width: number;
  height: number;
  fit: "cover" | "inside";
  enlarge: boolean;
  format: "webp" | "png";
  /** Set only when the derivative is allowed to lose edge pixels. */
  aspect?: string;
}

const GALLERY: Variant[] = [
  { label: "grid", width: 480, height: 360, fit: "cover", enlarge: false, format: "webp", aspect: "4:3" },
  { label: "card", width: 240, height: 180, fit: "cover", enlarge: false, format: "webp", aspect: "4:3" },
];

const REMINDER: Variant[] = [
  { label: "badge", width: 128, height: 128, fit: "cover", enlarge: false, format: "webp", aspect: "1:1" },
];

/**
 * A lease addendum photographed at an angle is evidence: cropping it to a tidy
 * rectangle can cut off a signature line, and upscaling a low-resolution capture
 * invents detail that a tenant may later be asked to read. So document pages get
 * a contain-fit PNG page preview and nothing else, while maintenance photos and
 * reminder badges — where the subject sits in the middle and the frame is
 * disposable — are free to be cropped to a fixed aspect.
 */
export function planVariants(kind: RecordKind): Variant[] {
  switch (kind) {
    case "tenant_document":
      return [
        { label: "page", width: 900, height: 1200, fit: "inside", enlarge: false, format: "png" },
      ];
    case "maintenance_request":
      return GALLERY;
    case "inspection_reminder":
      return REMINDER;
  }
}

/** Deterministic object name, so re-running an intake overwrites its own derivative. */
export function derivativeName(intake: MediaIntake, variant: Variant): string {
  return `${intake.recordKind}/${intake.unit}/${intake.recordId}--${variant.label}.${variant.format}`;
}
