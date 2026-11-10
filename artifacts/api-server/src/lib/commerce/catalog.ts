import type { CommerceProduct, CommercePolicy, CommerceOrder } from "@workspace/api-zod";
import { randomUUID } from "node:crypto";

export const products: CommerceProduct[] = [
  { id: "headphones", name: "Kiko Studio Wireless Headphones", description: "Your everyday soundtrack. Soft cushions, 40-hour battery and noise isolation.", category: "Electronics", price: 89, image: "/products/headphones.jpg", rating: 4.7, reviews: 284, returnable: true },
  { id: "speaker", name: "Pebble Mini Bluetooth Speaker", description: "Big sound, small footprint. A portable companion for every room.", category: "Electronics", price: 39, image: "/products/speaker.jpg", rating: 4.6, reviews: 192, returnable: true },
  { id: "backpack", name: "Everyday Commuter Backpack", description: "Thoughtful pockets, a padded laptop sleeve and water-resistant fabric.", category: "Lifestyle", price: 64, image: "/products/backpack.jpg", rating: 4.8, reviews: 316, returnable: true },
  { id: "watch", name: "Orbit Smart Watch", description: "An understated companion for movement, messages and daily routines.", category: "Electronics", price: 149, image: "/products/watch.webp", rating: 4.5, reviews: 128, returnable: true },
  { id: "lamp", name: "Arc Desk Light", description: "Warm, adjustable light for focused days and slow evenings.", category: "Home", price: 45, image: "/products/lamp.jpg", rating: 4.9, reviews: 87, returnable: true },
  { id: "bottle", name: "Daily Insulated Bottle", description: "A reusable steel bottle with an easy-carry lid. Final-sale hygiene item.", category: "Lifestyle", price: 24, image: "/products/bottle.jpg", rating: 4.6, reviews: 241, returnable: false },
];
export const policy: CommercePolicy = {
  name: "KikoStore returns & refunds", version: "2026-11",
  returnDays: 30, automaticLimit: 100, instantRefundLimit: 50,
  text: "Returnable items may be returned within 30 days of delivery. Requests up to $100 can be authorized automatically after the customer confirms. A reported damaged or defective returnable item up to $50 may receive a no-return refund after confirmation. Higher-value orders, final-sale items, expired windows and unclear payment evidence require staff review. Other refunds require a return and warehouse receipt. Full original-payment refunds only; no cash alternatives or deductions. Return authorization is not a refund. Sample orders simulate outcomes; Sandbox orders use verified PayPal captures. Staff exceptions require a recorded explanation. Shipping labels and physical pickup are not provided by this demo.",
};
export function sampleOrder(productId: string, quantity = 1, days = 3): CommerceOrder {
  const p = products.find(p => p.id === productId)!;
  const delivered = new Date(Date.now() - days * 86400000).toISOString();
  return { id: randomUUID(), productId, quantity, amount: Math.round(p.price * quantity * 100) / 100, currency: "USD", createdAt: new Date(Date.now() - (days + 3) * 86400000).toISOString(), deliveredAt: delivered, status: "delivered", source: "sample" };
}
