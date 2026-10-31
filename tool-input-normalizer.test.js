import assert from "node:assert/strict";
import test from "node:test";
import { normalizeToolInput } from "./tool-input-normalizer.js";

const hasDataTool = "airbnb__hasdata_airbnb_listing_getAirbnbListings";

test("omits zero-value HasData optional guest fields", () => {
  const result = normalizeToolInput(hasDataTool, {
    location: "Detroit, Michigan, United States",
    adults: 2,
    children: 0,
    infants: 0,
    pets: 0,
  });

  assert.deepEqual(result.removedFields, ["children", "infants", "pets"]);
  assert.deepEqual(result.input, {
    location: "Detroit, Michigan, United States",
    adults: 2,
  });
});

test("keeps non-zero HasData optional guest fields", () => {
  const result = normalizeToolInput(hasDataTool, {
    adults: 2,
    children: 1,
    pets: 2,
  });

  assert.deepEqual(result.removedFields, []);
  assert.deepEqual(result.input, {
    adults: 2,
    children: 1,
    pets: 2,
  });
});

test("does not alter other MCP tools", () => {
  const input = { children: 0, infants: 0, pets: 0 };
  const result = normalizeToolInput("learning-tools__get_current_time", input);

  assert.equal(result.input, input);
  assert.deepEqual(result.removedFields, []);
});
