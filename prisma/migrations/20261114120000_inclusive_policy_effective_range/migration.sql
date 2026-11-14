-- Policy effective dates are inclusive at both ends, including one-day versions.
ALTER TABLE "PolicyVersion"
  DROP CONSTRAINT "PolicyVersion_effective_range";

ALTER TABLE "PolicyVersion"
  ADD CONSTRAINT "PolicyVersion_effective_range"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");
