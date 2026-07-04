const { finalizePricing, pricingFromSyncItem } = require('../src/lib/posPricing');

// نسبة 20% على 15500 → 12400 (وليس price الخاطئ من POS مثل 9600)
const a = pricingFromSyncItem({
  originalPrice: 15500,
  price: 9600,
  discountPercent: 20,
});
if (a.finalPrice !== 12400 || !a.hasOffer || a.discountPercent !== 20) {
  console.error('FAIL percent offer:', a);
  process.exit(1);
}

const b = finalizePricing({
  originalPrice: 15000,
  finalPrice: 15000,
  discountPercent: 20,
  discountValue: 20,
  discountType: 0,
});
if (b.finalPrice !== 12000) {
  console.error('FAIL recompute when price equals original:', b);
  process.exit(1);
}

const c = pricingFromSyncItem({
  originalPrice: 10000,
  price: 10000,
  discountPercent: 0,
});
if (c.finalPrice !== 10000 || c.hasOffer) {
  console.error('FAIL no discount:', c);
  process.exit(1);
}

console.log('OK pos pricing discount tests');
