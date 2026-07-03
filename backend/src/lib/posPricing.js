/** POS pricing — offer_details.discount; discount_type 0 = نسبة */

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

function positivePrice(n) {
  const v = Math.round(Number(n) || 0);
  return v > 0 ? v : null;
}

function deriveOriginalFromFinal(finalPrice, discountPercent, discountValue, discountType) {
  const final = positivePrice(finalPrice);
  if (!final) return null;

  let pct = discountPercent != null && Number(discountPercent) > 0
    ? round1(Number(discountPercent))
    : null;
  if ((pct == null || pct <= 0) && discountValue != null && Number(discountValue) > 0 && Number(discountType ?? 0) === 0) {
    pct = round1(Number(discountValue));
  }
  if (pct != null && pct > 0 && pct < 100) {
    return Math.round(final / (1 - pct / 100));
  }
  return null;
}

function deriveDiscountFromPrices(original, final) {
  if (original == null || final == null || original <= 0 || final <= 0 || final >= original) return null;
  return round1((1 - final / original) * 100);
}

function finalizePricing({
  originalPrice,
  finalPrice,
  discountPercent,
  discountValue,
  discountType,
  offerName,
}) {
  let original = positivePrice(originalPrice);
  let final = positivePrice(finalPrice);
  let pct = discountPercent != null && Number(discountPercent) > 0
    ? round1(Number(discountPercent))
    : null;
  const dVal = discountValue != null && Number(discountValue) > 0 ? Number(discountValue) : null;
  const dType = discountType != null ? Number(discountType) : 0;

  if ((pct == null || pct <= 0) && dVal != null && dType === 0) {
    pct = round1(dVal);
  }

  if ((original == null || original <= 0) && final != null && pct != null && pct > 0) {
    original = deriveOriginalFromFinal(final, pct, dVal, dType);
  }

  if ((pct == null || pct <= 0) && original != null && final != null && final < original) {
    pct = deriveDiscountFromPrices(original, final);
  }

  if (final == null && original != null && pct != null && pct > 0 && pct < 100) {
    final = Math.round(original * (1 - pct / 100));
  }

  if (final == null && original != null) final = original;
  if (original == null && final != null && (pct == null || pct <= 0)) original = final;

  const hasOffer = pct != null && pct > 0 && original != null && final != null && final < original;

  return {
    originalPrice: original,
    finalPrice: hasOffer ? final : (final ?? original),
    discountPercent: hasOffer ? pct : null,
    discountValue: hasOffer ? (dType === 0 ? (dVal ?? pct) : dVal) : null,
    discountType: hasOffer ? dType : null,
    hasOffer,
    offerName: hasOffer && offerName ? String(offerName).trim() || null : null,
  };
}

function computePricing(row) {
  const original = Math.round(Number(row.originalPrice) || 0);
  const storedFinal = Math.round(Number(row.storedFinalPrice ?? row.price) || 0);
  const discountValue = row.discountValue != null ? Number(row.discountValue) : null;
  const discountType = row.discountType != null ? Number(row.discountType) : 0;

  if (discountValue != null && discountValue > 0) {
    let orig = original;
    if (orig <= 0 && storedFinal > 0 && discountType === 0) {
      orig = Math.round(storedFinal / (1 - discountValue / 100));
    }
    return finalizePricing({
      originalPrice: orig,
      finalPrice: storedFinal > 0 && storedFinal < orig ? storedFinal : undefined,
      discountValue,
      discountType,
      offerName: row.offerName,
    });
  }

  return finalizePricing({
    originalPrice: original,
    finalPrice: storedFinal || original,
    offerName: row.offerName,
  });
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

  return finalizePricing({
    originalPrice: original > 0 ? original : null,
    finalPrice: price > 0 ? price : null,
    discountPercent: discountPercentRaw != null && discountPercentRaw > 0 ? discountPercentRaw : null,
    discountValue: discountPercentRaw != null && discountPercentRaw > 0 ? discountPercentRaw : null,
    discountType: discountPercentRaw != null && discountPercentRaw > 0 ? 0 : null,
    offerName: item.offerName,
  });
}

function resolveStoredPricing(row) {
  const hasPosSync = row.pos_synced_at != null && String(row.pos_synced_at).trim() !== '';
  if (!hasPosSync) {
    return {
      originalPrice: null,
      finalPrice: null,
      discountPercent: null,
      discountValue: null,
      discountType: null,
      hasOffer: false,
      offerName: null,
    };
  }

  return finalizePricing({
    originalPrice: row.original_price,
    finalPrice: row.final_price ?? row.consumer_price,
    discountPercent: row.discount_percent,
    discountValue: row.discount_value,
    discountType: row.discount_type,
    offerName: row.offer_name,
  });
}

function recomputeStoredPricingRows(db) {
  const rows = db.prepare(`
    SELECT id, original_price, final_price, consumer_price, discount_percent,
           discount_value, discount_type, offer_name, pos_synced_at
    FROM products
    WHERE pos_synced_at IS NOT NULL AND TRIM(pos_synced_at) <> ''
  `).all();

  const update = db.prepare(`
    UPDATE products
    SET original_price = @original_price,
        final_price = @final_price,
        discount_percent = @discount_percent,
        discount_value = @discount_value,
        discount_type = @discount_type,
        consumer_price = @consumer_price,
        updated_at = strftime('%Y-%m-%d %H:%M:%f','now')
    WHERE id = @id
  `);

  let updated = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      const pricing = resolveStoredPricing(row);
      if (!pricing.originalPrice && !pricing.finalPrice) continue;
      update.run({
        id: row.id,
        original_price: pricing.originalPrice,
        final_price: pricing.finalPrice,
        discount_percent: pricing.discountPercent,
        discount_value: pricing.discountValue,
        discount_type: pricing.discountType,
        consumer_price: pricing.finalPrice,
      });
      updated += 1;
    }
  });
  tx();
  return updated;
}

module.exports = {
  computePricing,
  pricingFromSyncItem,
  resolveStoredPricing,
  finalizePricing,
  recomputeStoredPricingRows,
  round1,
};
