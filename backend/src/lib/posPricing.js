/** POS pricing — offer_details.discount; discount_type 0 = نسبة */

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

function computePricing(row) {
  const original = Math.round(Number(row.originalPrice) || 0);
  const storedFinal = Math.round(Number(row.storedFinalPrice ?? row.price) || 0);
  const discountValue = row.discountValue != null ? Number(row.discountValue) : null;
  const discountType = row.discountType != null ? Number(row.discountType) : 0;

  let hasOffer = false;
  let finalPrice = original;
  let discountPercent = null;

  if (discountValue != null && discountValue > 0) {
    hasOffer = true;
    if (storedFinal > 0 && storedFinal < original) {
      finalPrice = storedFinal;
      discountPercent = original > 0 ? round1((1 - finalPrice / original) * 100) : 0;
    } else if (discountType === 0) {
      discountPercent = discountValue;
      finalPrice = Math.round(original * (1 - discountValue / 100));
    } else {
      finalPrice = Math.max(0, Math.round(original - discountValue));
      discountPercent = original > 0 ? round1((discountValue / original) * 100) : 0;
    }
  }

  return {
    originalPrice: original,
    finalPrice: hasOffer ? finalPrice : original,
    discountPercent: hasOffer ? discountPercent : null,
    discountValue: hasOffer ? discountValue : null,
    discountType: hasOffer ? discountType : null,
    hasOffer,
  };
}

function pricingFromSyncItem(item) {
  const discountValueRaw = item.discountValue != null ? Number(item.discountValue) : null;
  const discountType = item.discountType != null ? Number(item.discountType) : 0;

  if (discountValueRaw != null && discountValueRaw > 0) {
    return computePricing({
      originalPrice: item.originalPrice,
      storedFinalPrice: item.price,
      discountValue: discountValueRaw,
      discountType,
      offerName: item.offerName,
    });
  }

  const original = Math.round(Number(item.originalPrice) || 0);
  const price = Math.round(Number(item.price) || 0);
  const discountPercentRaw = item.discountPercent != null ? Number(item.discountPercent) : null;

  let discountPercent = null;
  if (discountPercentRaw != null && discountPercentRaw > 0) {
    discountPercent = round1(discountPercentRaw);
  } else if (original > 0 && price > 0 && price < original) {
    discountPercent = round1((1 - price / original) * 100);
  }

  const hasOffer = discountPercent != null && discountPercent > 0;

  return {
    originalPrice: original,
    finalPrice: hasOffer ? price : (price > 0 ? price : original),
    discountPercent: hasOffer ? discountPercent : null,
    discountValue: hasOffer ? discountPercent : null,
    discountType: hasOffer ? 0 : null,
    hasOffer,
  };
}

/** عند القراءة من DB — استخدم discount_value/type أو احسب من السعرين */
function resolveStoredPricing(row) {
  const original = row.original_price != null && Number.isFinite(Number(row.original_price))
    ? Math.round(Number(row.original_price))
    : null;
  let finalPrice = row.final_price != null && Number.isFinite(Number(row.final_price))
    ? Math.round(Number(row.final_price))
    : null;
  if (finalPrice == null && row.consumer_price != null && Number.isFinite(Number(row.consumer_price))) {
    finalPrice = Math.round(Number(row.consumer_price));
  }

  let discountPercent = row.discount_percent != null && Number.isFinite(Number(row.discount_percent))
    ? round1(Number(row.discount_percent))
    : null;
  const discountValue = row.discount_value != null && Number.isFinite(Number(row.discount_value))
    ? Number(row.discount_value)
    : null;
  const discountType = row.discount_type != null ? Number(row.discount_type) : null;

  if ((discountPercent == null || discountPercent <= 0) && discountValue != null && discountValue > 0 && discountType === 0) {
    discountPercent = round1(discountValue);
  }

  if ((discountPercent == null || discountPercent <= 0) && original != null && original > 0 && finalPrice != null && finalPrice > 0 && finalPrice < original) {
    discountPercent = round1((1 - finalPrice / original) * 100);
  }

  const hasOffer = discountPercent != null && discountPercent > 0;

  return {
    originalPrice: original,
    finalPrice: finalPrice ?? original,
    discountPercent: hasOffer ? discountPercent : null,
    discountValue: hasOffer ? (discountType === 0 ? discountValue ?? discountPercent : discountValue) : null,
    discountType: hasOffer ? (discountType ?? 0) : null,
    hasOffer,
  };
}

module.exports = { computePricing, pricingFromSyncItem, resolveStoredPricing, round1 };
