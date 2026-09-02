import test from "node:test";
import assert from "node:assert/strict";
import { MediaIntake, derivativeName, planVariants } from "../src/thumbnail_plan.ts";

test("tenant document pages are never cropped and never upscaled", () => {
  const variants = planVariants("tenant_document");
  assert.equal(variants.length, 1);
  for (const variant of variants) {
    assert.equal(variant.aspect, undefined);
    assert.equal(variant.fit, "inside");
    assert.equal(variant.enlarge, false);
  }
});

test("maintenance photos get both gallery sizes at a fixed 4:3 crop", () => {
  const labels = planVariants("maintenance_request").map((v) => v.label);
  assert.deepEqual(labels, ["grid", "card"]);
  for (const variant of planVariants("maintenance_request")) {
    assert.equal(variant.aspect, "4:3");
    assert.equal(variant.fit, "cover");
  }
});

test("inspection reminders reduce to one square badge", () => {
  const [badge, ...rest] = planVariants("inspection_reminder");
  assert.equal(rest.length, 0);
  assert.equal(badge.aspect, "1:1");
  assert.equal(badge.width, badge.height);
});

test("derivative names are stable for the same record", () => {
  const intake = MediaIntake.parse({
    recordId: "mr-10482",
    recordKind: "maintenance_request",
    unit: "B-204",
    filename: "leaking-sink.jpg",
    fileBase64: "aGVsbG8=",
  });
  const [grid] = planVariants(intake.recordKind);
  assert.equal(
    derivativeName(intake, grid),
    "maintenance_request/B-204/mr-10482--grid.webp",
  );
});

test("an intake without a record kind is rejected at the boundary", () => {
  const result = MediaIntake.safeParse({
    recordId: "mr-1",
    unit: "B-204",
    filename: "photo.jpg",
    fileBase64: "aGVsbG8=",
  });
  assert.equal(result.success, false);
});
