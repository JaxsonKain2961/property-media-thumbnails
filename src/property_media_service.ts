/**
 * Intake entry point: one captured image in, one set of stored derivatives out.
 *
 * Read this file top to bottom — it is the whole workflow. The only piece pulled
 * out into a module is the per-record-kind variant decision in ./thumbnail_plan.ts,
 * because that is the part a property-management team argues about and changes.
 */
import { z } from "zod";
import { callInfrai, InfraiError } from "./infrai_client.ts";
import {
  MediaIntake,
  derivativeName,
  planVariants,
  type Variant,
} from "./thumbnail_plan.ts";

interface ImageRef {
  id?: string;
  url?: string;
}

function reference(image: ImageRef): string {
  const ref = image.url ?? image.id;
  if (!ref) throw new Error("Image reference missing from response data");
  return ref;
}

export interface Derivative {
  label: string;
  storedAs: string;
  image: string;
}

export async function ingest(input: unknown): Promise<Derivative[]> {
  const intake = MediaIntake.parse(input);

  // The filename is derived from the record id, so replaying an intake after a
  // network hiccup lands on the same original instead of a second copy.
  const original = await callInfrai<ImageRef>("/image/upload", {
    file: intake.fileBase64,
    filename: `${intake.recordKind}-${intake.recordId}-${intake.filename}`,
  });

  const results: Derivative[] = [];
  for (const variant of planVariants(intake.recordKind)) {
    results.push(await render(reference(original), intake, variant));
  }
  return results;
}

async function render(
  source: string,
  intake: MediaIntake,
  variant: Variant,
): Promise<Derivative> {
  let image = source;

  if (variant.aspect) {
    const cropped = await callInfrai<ImageRef>("/image/smart_crop", {
      image,
      aspect: variant.aspect,
    });
    image = reference(cropped);
  }

  const resized = await callInfrai<ImageRef>("/image/process", {
    image,
    ops: [
      {
        op: "resize",
        width: variant.width,
        height: variant.height,
        fit: variant.fit,
        enlarge: variant.enlarge,
      },
    ],
    format: variant.format,
    store: true,
  });

  return {
    label: variant.label,
    storedAs: derivativeName(intake, variant),
    image: reference(resized),
  };
}

/** HTTP-shaped result: a rejected body or a rejected argument is the caller's 4xx. */
export async function handleIntake(body: unknown) {
  try {
    return { status: 201, body: { derivatives: await ingest(body) } };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { status: 400, body: { error: "invalid_intake", issues: error.issues } };
    }
    if (error instanceof InfraiError && error.status < 500) {
      return { status: error.status, body: { error: error.code, message: error.message } };
    }
    throw error;
  }
}

// A tiny solid-colour PNG stands in for the phone capture the mobile app posts.
const SAMPLE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAM0lEQVR42u3NMQEAAAgDoJnc6BpjDyQg" +
  "d6bJVQEAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8G4WkKEBAdOx7NkAAAAASUVORK5CYII=";

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) {
  const result = await handleIntake({
    recordId: "mr-10482",
    recordKind: "maintenance_request",
    unit: "B-204",
    filename: "leaking-sink.png",
    fileBase64: SAMPLE_PNG,
  });
  console.log(JSON.stringify(result, null, 2));
}
