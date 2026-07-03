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
  if (item.discountValue != null || item.discountType != null) {
    return computePricing({
      originalPrice: item.originalPrice,
      storedFinalPrice: item.price,
      discountValue: item.discountValue,
      discountType: item.discountType,
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

  return {
    originalPrice: original,
    finalPrice: price > 0 ? price : original,
    discountPercent,
    discountValue: discountPercent != null ? discountPercent : null,
    discountType: discountPercent != null ? 0 : null,
    hasOffer: discountPercent != null && discountPercent > 0,
  };
}

module.exports = { computePricing, pricingFromSyncItem, round1 };
