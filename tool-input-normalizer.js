function isHasDataAirbnbSearch(toolName) {
  return toolName.endsWith(
    "__hasdata_airbnb_listing_getAirbnbListings"
  );
}

/**
 * A provider-specific compatibility adapter. HasData's guest fields are
 * optional, but when present its API requires them to be at least 1. The
 * earlier learning server accepted zero, so models may include zero counts.
 */
export function normalizeToolInput(toolName, input) {
  if (!isHasDataAirbnbSearch(toolName) || !input || typeof input !== "object") {
    return { input, removedFields: [] };
  }

  const normalizedInput = { ...input };
  const removedFields = [];

  for (const field of ["children", "infants", "pets"]) {
    if (normalizedInput[field] === 0) {
      delete normalizedInput[field];
      removedFields.push(field);
    }
  }

  return { input: normalizedInput, removedFields };
}
