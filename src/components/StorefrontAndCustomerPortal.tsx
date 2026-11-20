import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CalendarClock,
  Check,
  MapPin,
  Minus,
  Package,
  Plus,
  ShoppingBag,
  Star,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { resolveAvatarSrc } from '../lib/avatars';
import { LiveHyderabadMap } from './LiveHyderabadMap';
import {
  HYDERABAD_AREAS,
  formatInr,
  type DairyProduct,
  type DeliverySlot,
  type MilkSubscription,
  type OrderRecord,
  type ProductReview,
  type PublicUser,
} from '../types/domain';

interface StorefrontProps {
  currentUser: PublicUser | null;
  products: DairyProduct[];
  orders: OrderRecord[];
  subscriptions: MilkSubscription[];
  reviews: ProductReview[];
  initialSection: 'products' | 'subscriptions' | 'orders';
  onRequireAuth: () => void;
  onRefreshData: () => Promise<void>;
  onOpenWriteReview: (productId: number, orderId?: string) => void;
}

const CATEGORIES = ['All', 'Buffalo Milk', 'A2 Cow Milk', 'Curd & Paneer', 'Ghee & Buttermilk'] as const;

const ORDER_STEPS = [
  { key: 'PROCESSING', label: 'Order Placed' },
  { key: 'PROCESSED', label: 'Hub Processed' },
  { key: 'OUT_FOR_DELIVERY', label: 'En Route' },
  { key: 'DELIVERED', label: 'OTP Delivered' },
] as const;

function getOrderStepIndex(status: OrderRecord['status']): number {
  if (status === 'PROCESSING') return 0;
  if (status === 'PROCESSED' || status === 'AWAITING_AGENT_ACCEPTANCE') return 1;
  if (status === 'OUT_FOR_DELIVERY' || status === 'COD_QR_PENDING_ADMIN') return 2;
  if (status === 'DELIVERED') return 3;
  return 0;
}

export const StorefrontAndCustomerPortal: React.FC<StorefrontProps> = ({
  currentUser,
  products,
  orders,
  subscriptions,
  reviews,
  initialSection,
  onRequireAuth,
  onRefreshData,
  onOpenWriteReview,
}) => {
  const [section, setSection] = useState<'products' | 'subscriptions' | 'orders'>(initialSection);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');
  const [cart, setCart] = useState<{ product: DairyProduct; quantity: number }[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<DairyProduct | null>(null);

  // Checkout state
  const [selectedAreaIdx, setSelectedAreaIdx] = useState(1);
  const [streetAddress, setStreetAddress] = useState(
    currentUser?.address || 'Villa 14, Road No. 36, Jubilee Hills, Hyderabad, TG'
  );
  const [deliverySlot, setDeliverySlot] = useState<DeliverySlot>('Morning (05:30 - 07:30 AM)');
  const [paymentMethod, setPaymentMethod] = useState<'PREPAID' | 'COD'>('PREPAID');
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Subscription creation state
  const [subProductId, setSubProductId] = useState<number>(products[0]?.id || 101);
  const [subQty, setSubQty] = useState(1);
  const [subSlot, setSubSlot] = useState<DeliverySlot>('Morning (05:30 - 07:30 AM)');
  const [subFreq, setSubFreq] = useState<'Daily' | 'Alternate Days' | 'Weekdays'>('Daily');

  React.useEffect(() => {
    setSection(initialSection);
  }, [initialSection]);

  const filteredProducts = useMemo(() => {
    if (category === 'All') return products;
    return products.filter((p) => p.category === category);
  }, [products, category]);

  const featuredLead = products[0] || null;
  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const cartSubtotal = cart.reduce((acc, item) => acc + item.product.priceInr * item.quantity, 0);
  const deliveryFee = cart.length > 0 ? 45 : 0;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const addToCart = (product: DairyProduct) => {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.product.id === product.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { product, quantity: 1 }];
    });
    showToast(`Added ${product.name} to morning basket.`);
  };

  const updateCartQty = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.product.id === productId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    if (cart.length === 0) return;

    setCheckoutBusy(true);
    try {
      const area = HYDERABAD_AREAS[selectedAreaIdx] || HYDERABAD_AREAS[0];
      const order = await api.createOrder({
        items: cart.map((c) => ({ productId: c.product.id, quantity: c.quantity })),
        deliveryAddress: streetAddress || `${area.label}, Hyderabad, TG`,
        pinCode: area.pinCode,
        lat: area.lat,
        lng: area.lng,
        deliverySlot,
        paymentMethod,
      });
      setCart([]);
      setCartOpen(false);
      await onRefreshData();
      setSection('orders');
      showToast(`Order ${order.orderNumber} recorded at Madhapur Hub.`);
    } catch (err: any) {
      showToast(err.message);
    } finally {
      setCheckoutBusy(false);
    }
  };

  const handleCreateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    try {
      await api.createSubscription({
        productId: subProductId,
        quantity: subQty,
        slot: subSlot,
        frequency: subFreq,
      });
      await onRefreshData();
      showToast('Standing morning delivery slot confirmed.');
    } catch (err: any) {
      showToast(err.message);
    }
  };

  const handleToggleSub = async (id: string) => {
    try {
      await api.toggleSubscription(id);
      await onRefreshData();
    } catch (err: any) {
      showToast(err.message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-10 md:py-12 space-y-10">
      {toast && (
        <div className="fixed bottom-6 right-6 z-40 glass-panel px-5 py-3.5 rounded-sm text-xs tracking-wide text-[#f8f5ef] shadow-2xl border border-[#d8b06c]/45">
          {toast}
        </div>
      )}

      {/* Classic Editorial Masthead */}
      <div className="space-y-6 pb-6 border-b border-[#e4cca2]/16">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#d8b06c]">
              Hitech City &amp; Madhapur Cold-Chain Hub · Hyderabad, TG 500081
            </p>
            <h1 className="mt-2 font-editorial text-4xl md:text-5xl text-[#f8f5ef] font-medium tracking-tight">
              The Morning Dairy Folio
            </h1>
          </div>

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="inline-flex items-center gap-3 px-5 py-3 rounded-sm btn-brass text-xs uppercase tracking-[0.12em] cursor-pointer whitespace-nowrap"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Basket ({cartCount})</span>
            {cartSubtotal > 0 && (
              <span className="font-mono-tabular pl-2 border-l border-[#081119]/25">
                {formatInr(cartSubtotal)}
              </span>
            )}
          </button>
        </div>

        {/* Classic Underlined Editorial Chapter Tabs */}
        <div className="flex items-center gap-8 overflow-x-auto pt-2">
          {(
            [
              { id: 'products', num: '01.', label: 'Morning Collection' },
              { id: 'subscriptions', num: '02.', label: 'Standing Milk Orders' },
              { id: 'orders', num: '03.', label: `Orders & Live Route (${orders.length})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSection(t.id)}
              className={`pb-3 text-sm border-b-2 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2 ${
                section === t.id
                  ? 'border-[#d8b06c] text-[#f8f5ef] font-medium'
                  : 'border-transparent text-[#8f9ba6] hover:text-[#f3efe8]'
              }`}
            >
              <span className="font-mono-tabular text-[11px] text-[#d8b06c]">{t.num}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* SECTION 1: MORNING DAIRY COLLECTION */}
      {section === 'products' && (
        <div className="space-y-10">
          {/* Featured Morning Harvest Lead Split (2-Column Editorial Salience) */}
          {featuredLead && category === 'All' && (
            <section className="glass-panel rounded-md overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
              <div className="lg:col-span-6 relative min-h-[280px] lg:min-h-[360px] bg-[#08121c]">
                <img
                  src={featuredLead.imageUrl}
                  alt={featuredLead.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#060d14]/70 via-transparent to-transparent" />
                <div className="absolute bottom-5 left-6 right-6 flex items-center justify-between text-xs text-[#f3efe8]/90 font-mono-tabular">
                  <span>LOT #{featuredLead.id} · {featuredLead.merchantName}</span>
                  <span>CHILLED 4°C</span>
                </div>
              </div>

              <div className="lg:col-span-6 p-7 md:p-10 flex flex-col justify-between gap-6">
                <div className="space-y-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[#d8b06c]">
                    Today&apos;s Featured Dawn Harvest
                  </p>
                  <h2 className="font-editorial text-3xl md:text-4xl text-[#f8f5ef] font-medium leading-[1.12]">
                    {featuredLead.name}
                  </h2>
                  <p className="text-sm text-[#b2bcc6] leading-relaxed">{featuredLead.description}</p>

                  {/* Accession-style Assay Specification Ledger */}
                  <dl className="pt-4 border-t border-[#e4cca2]/16 grid grid-cols-3 gap-4 font-mono-tabular">
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.16em] text-[#8f9ba6]">Fat Assay</dt>
                      <dd className="mt-1 text-base text-[#f8f5ef]">{featuredLead.fatPercent}%</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.16em] text-[#8f9ba6]">SNF Grade</dt>
                      <dd className="mt-1 text-base text-[#f8f5ef]">{featuredLead.snfPercent}%</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-[0.16em] text-[#8f9ba6]">Vessel</dt>
                      <dd className="mt-1 text-xs text-[#f8f5ef]">{featuredLead.unit}</dd>
                    </div>
                  </dl>
                </div>

                <div className="pt-5 border-t border-[#e4cca2]/16 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <span className="block text-[11px] uppercase tracking-[0.14em] text-[#8f9ba6]">
                      Farm-Direct Price
                    </span>
                    <span className="font-mono-tabular text-2xl font-semibold text-[#f8f5ef]">
                      {formatInr(featuredLead.priceInr)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedProduct(featuredLead)}
                      className="px-4 py-2.5 rounded-sm btn-outline-classic text-xs cursor-pointer"
                    >
                      Provenance Sheet
                    </button>
                    <button
                      type="button"
                      onClick={() => addToCart(featuredLead)}
                      className="px-5 py-2.5 rounded-sm btn-brass text-xs uppercase tracking-[0.1em] cursor-pointer"
                    >
                      Add to Basket
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Classic Hairline Category Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e4cca2]/14 pb-3">
            <div className="flex items-center gap-6 overflow-x-auto">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`pb-1 text-xs tracking-[0.06em] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    category === c
                      ? 'text-[#d8b06c] font-semibold'
                      : 'text-[#8f9ba6] hover:text-[#f3efe8]'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <span className="text-xs font-mono-tabular text-[#8f9ba6]">
              {filteredProducts.length} Lots Available · Hyderabad Morning Dispatch
            </span>
          </div>

          {/* Curated 3-Column Museum-Grade Product Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
            {filteredProducts.map((product) => (
              <article
                key={product.id}
                className="glass-panel rounded-md overflow-hidden flex flex-col group transition-transform duration-200 hover:-translate-y-0.5"
              >
                <div
                  onClick={() => setSelectedProduct(product)}
                  className="relative aspect-[4/3] w-full bg-[#08121c] overflow-hidden cursor-pointer border-b border-[#e4cca2]/14"
                >
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </div>

                <div className="p-6 flex-1 flex flex-col justify-between gap-5">
                  <div>
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-[#8f9ba6]">
                      <span>{product.category}</span>
                      <span className="font-mono-tabular text-[#d8b06c]">Lot #{product.id}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedProduct(product)}
                      className="mt-2 text-left font-editorial text-2xl text-[#f8f5ef] hover:text-[#e7c68b] transition-colors cursor-pointer leading-snug"
                    >
                      {product.name}
                    </button>

                    <p className="mt-2 text-xs text-[#9aa4ae] leading-relaxed">{product.harvestNote}</p>

                    <div className="mt-4 pt-3 border-t border-[#e4cca2]/12 flex items-center justify-between text-xs font-mono-tabular text-[#c6ced6]">
                      <span>{product.unit}</span>
                      <span>
                        Fat {product.fatPercent}% · SNF {product.snfPercent}%
                      </span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-[#e4cca2]/14 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xl font-semibold text-[#f8f5ef] font-mono-tabular">
                        {formatInr(product.priceInr)}
                      </div>
                      <div className="text-[11px] text-[#9aa4ae] flex items-center gap-1 font-mono-tabular">
                        <Star className="w-3 h-3 text-[#d8b06c] fill-[#d8b06c]" />
                        <span>{product.ratingAvg.toFixed(1)}</span>
                        <span>({product.reviewCount} reviews)</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedProduct(product)}
                        className="px-3 py-2 rounded-sm text-xs text-[#b7c0c9] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Inspect
                      </button>
                      <button
                        type="button"
                        onClick={() => addToCart(product)}
                        disabled={product.stockQty <= 0}
                        className="px-4 py-2 rounded-sm btn-brass text-xs cursor-pointer whitespace-nowrap"
                      >
                        {product.stockQty > 0 ? 'Add' : 'Sold Out'}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 2: STANDING MILK ORDERS (CLASSIC HOUSEHOLD LEDGER) */}
      {section === 'subscriptions' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <form onSubmit={handleCreateSubscription} className="lg:col-span-5 glass-panel rounded-md p-7 space-y-5">
            <div className="pb-4 border-b border-[#e4cca2]/15">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#d8b06c]">Standing Order Book</p>
              <h2 className="mt-1.5 font-editorial text-2xl text-[#f8f5ef]">Schedule Recurring Delivery</h2>
              <p className="text-xs text-[#9aa4ae] mt-1">
                Silent dawn doorstep placement across Hyderabad PINs (500xxx). Pause anytime before 10 PM.
              </p>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-2">
                Farm Dairy Selection
              </label>
              <select
                value={subProductId}
                onChange={(e) => setSubProductId(Number(e.target.value))}
                className="w-full rounded-sm classic-input px-3.5 py-2.5 text-sm"
              >
                {products
                  .filter((p) => p.supportsSubscription)
                  .map((p) => (
                    <option key={p.id} value={p.id} className="bg-[#08121c]">
                      {p.name} ({p.unit}) — {formatInr(p.priceInr)}
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-2">
                  Cadence
                </label>
                <select
                  value={subFreq}
                  onChange={(e) => setSubFreq(e.target.value as any)}
                  className="w-full rounded-sm classic-input px-3.5 py-2.5 text-sm"
                >
                  <option value="Daily" className="bg-[#08121c]">Daily</option>
                  <option value="Alternate Days" className="bg-[#08121c]">Alternate Days</option>
                  <option value="Weekdays" className="bg-[#08121c]">Weekdays (Mon–Fri)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-2">
                  Bottles / Day
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={subQty}
                  onChange={(e) => setSubQty(Math.max(1, Number(e.target.value)))}
                  className="w-full rounded-sm classic-input px-3.5 py-2.5 text-sm font-mono-tabular"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-2">
                Delivery Window
              </label>
              <div className="grid grid-cols-1 gap-2.5">
                {(['Morning (05:30 - 07:30 AM)', 'Evening (05:00 - 07:00 PM)'] as const).map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSubSlot(slot)}
                    className={`text-left px-4 py-3 rounded-sm text-xs border transition-colors cursor-pointer flex items-center justify-between ${
                      subSlot === slot
                        ? 'bg-[#d8b06c]/14 border-[#d8b06c] text-[#f8f5ef] font-medium'
                        : 'bg-white/[0.02] border-[#e4cca2]/14 text-[#9aa4ae] hover:text-white'
                    }`}
                  >
                    <span>{slot}</span>
                    {subSlot === slot && <Check className="w-3.5 h-3.5 text-[#d8b06c]" />}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-sm btn-brass text-xs uppercase tracking-[0.14em] cursor-pointer"
            >
              <CalendarClock className="w-4 h-4" />
              <span>Confirm Standing Order</span>
            </button>
          </form>

          <div className="lg:col-span-7 glass-panel rounded-md p-7 space-y-5">
            <div className="pb-4 border-b border-[#e4cca2]/15 flex items-baseline justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#d8b06c]">Household Ledger</p>
                <h2 className="mt-1.5 font-editorial text-2xl text-[#f8f5ef]">Active Milk Subscriptions</h2>
              </div>
              <span className="font-mono-tabular text-xs text-[#8f9ba6]">{subscriptions.length} Scheduled</span>
            </div>

            {!currentUser ? (
              <div className="py-12 text-center space-y-4">
                <p className="text-sm text-[#9aa4ae]">Sign in to review or modify your standing Hyderabad milk deliveries.</p>
                <button
                  type="button"
                  onClick={onRequireAuth}
                  className="px-6 py-2.5 rounded-sm btn-brass text-xs uppercase tracking-[0.12em] cursor-pointer"
                >
                  Sign In
                </button>
              </div>
            ) : subscriptions.length === 0 ? (
              <p className="text-sm text-[#9aa4ae] py-10">No standing milk orders scheduled yet.</p>
            ) : (
              <div className="divide-y divide-[#e4cca2]/14">
                {subscriptions.map((sub) => (
                  <div key={sub.id} className="py-5 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-editorial text-lg text-[#f8f5ef]">
                          {sub.productName} × {sub.quantity}
                        </span>
                        <span
                          className={`text-[11px] font-mono-tabular uppercase tracking-wider ${
                            sub.status === 'ACTIVE' ? 'text-emerald-300' : 'text-amber-300'
                          }`}
                        >
                          {sub.status}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-[#9aa4ae] font-mono-tabular">
                        {sub.frequency} · {sub.slot} · Next Drop: {sub.nextDeliveryDate}
                      </div>
                    </div>
                    <div className="flex items-center gap-5">
                      <span className="text-base font-semibold text-[#f8f5ef] font-mono-tabular">
                        {formatInr(sub.priceInr * sub.quantity)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggleSub(sub.id)}
                        className="px-4 py-2 rounded-sm btn-outline-classic text-xs cursor-pointer"
                      >
                        {sub.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 3: ORDERS, SYNCED OTP PLATE & CARTOGRAPHIC LIVE TRACKING */}
      {section === 'orders' && (
        <div className="space-y-8">
          {!currentUser ? (
            <div className="glass-panel rounded-md p-12 text-center space-y-4">
              <p className="text-sm text-[#b2bcc6]">
                Sign in to inspect your Hyderabad orders, synced 6-digit doorstep OTPs, and live cartographic delivery routes.
              </p>
              <button
                type="button"
                onClick={onRequireAuth}
                className="px-6 py-2.5 rounded-sm btn-brass text-xs uppercase tracking-[0.12em] cursor-pointer"
              >
                Sign In to Track Orders
              </button>
            </div>
          ) : orders.length === 0 ? (
            <div className="glass-panel rounded-md p-12 text-center text-sm text-[#9aa4ae]">
              No orders recorded yet. Return to the Morning Collection to place your first farm-direct order.
            </div>
          ) : (
            orders.map((order) => {
              const stepIdx = getOrderStepIndex(order.status);
              return (
                <article key={order.id} className="glass-panel rounded-md p-6 md:p-8 space-y-6">
                  {/* Order Header */}
                  <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-[#e4cca2]/16">
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono-tabular text-[#9aa4ae]">
                        <span className="text-[#d8b06c] font-semibold">{order.orderNumber}</span>
                        <span>·</span>
                        <span>{order.paymentMethod}</span>
                        <span>·</span>
                        <span>{order.deliverySlot}</span>
                      </div>
                      <div className="mt-2 text-sm text-[#f3efe8] flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-[#d8b06c] shrink-0" />
                        <span>
                          {order.deliveryAddress} — Hyderabad {order.pinCode}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-2xl font-semibold text-[#f8f5ef] font-mono-tabular">
                        {formatInr(order.totalInr)}
                      </div>
                      <div className="text-xs uppercase tracking-[0.14em] text-[#d8b06c] mt-0.5">
                        {order.status.replace(/_/g, ' ')}
                      </div>
                    </div>
                  </div>

                  {/* Classic Horizontal Milestone Rail */}
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    {ORDER_STEPS.map((step, idx) => {
                      const reached = idx <= stepIdx;
                      return (
                        <div key={step.key} className="space-y-2">
                          <div
                            className={`h-0.5 w-full transition-colors ${
                              reached ? 'bg-[#d8b06c]' : 'bg-white/12'
                            }`}
                          />
                          <div className="flex items-center gap-1.5 text-[11px] font-mono-tabular">
                            <span className={reached ? 'text-[#d8b06c]' : 'text-[#6c7782]'}>
                              0{idx + 1}.
                            </span>
                            <span className={reached ? 'text-[#f3efe8]' : 'text-[#6c7782]'}>
                              {step.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-2">
                    <div className="lg:col-span-5 space-y-5">
                      {/* Line Items Ledger */}
                      <div className="divide-y divide-[#e4cca2]/12 border-y border-[#e4cca2]/14">
                        {order.items.map((item) => (
                          <div key={item.productId} className="py-3.5 flex items-center justify-between gap-3 text-sm">
                            <div className="flex items-center gap-3.5">
                              <img
                                src={item.imageUrl}
                                alt={item.productName}
                                referrerPolicy="no-referrer"
                                className="w-12 h-12 rounded-sm object-cover border border-[#e4cca2]/20"
                              />
                              <div>
                                <div className="font-editorial text-base text-[#f8f5ef]">{item.productName}</div>
                                <div className="text-xs text-[#9aa4ae] font-mono-tabular">
                                  Lot #{item.productId} · Qty {item.quantity} · {formatInr(item.priceInr)}
                                </div>
                              </div>
                            </div>
                            {order.status === 'DELIVERED' && (
                              <button
                                type="button"
                                onClick={() => onOpenWriteReview(item.productId, order.id)}
                                className="px-3 py-1.5 rounded-sm btn-outline-classic text-xs cursor-pointer whitespace-nowrap"
                              >
                                Write a Review
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Strict Rule: COD payment controls hidden/disabled during PROCESSING & PROCESSED */}
                      {order.paymentMethod === 'COD' &&
                        (order.status === 'PROCESSING' || order.status === 'PROCESSED') && (
                          <div className="rounded-sm bg-white/[0.03] border border-[#e4cca2]/16 p-4 text-xs text-[#b7c0c9] leading-relaxed">
                            Doorstep COD Settlement: Payment options (Dynamic UPI QR or Cash) remain locked until your assigned agent arrives at your Hyderabad address.
                          </div>
                        )}

                      {/* Engraved Synced 6-Digit Doorstep OTP Plate */}
                      {order.deliveryOtp &&
                        (order.status === 'OUT_FOR_DELIVERY' || order.status === 'COD_QR_PENDING_ADMIN') && (
                          <div className="rounded-sm bg-[#d8b06c]/10 border border-[#d8b06c]/45 p-5 space-y-2">
                            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-[#e7c68b]">
                              <span>Synced Universal Delivery OTP</span>
                              <span>Doorstep Handover</span>
                            </div>
                            <div className="font-mono-tabular text-4xl font-semibold tracking-[0.28em] text-[#f8f5ef] py-1">
                              {order.deliveryOtp}
                            </div>
                            <div className="text-xs text-[#c7d0d8] pt-2 border-t border-[#d8b06c]/20">
                              Courier: <strong className="text-white">{order.assignedAgentName}</strong>{' '}
                              <span className="font-mono-tabular">({order.assignedAgentPhone})</span>
                            </div>
                          </div>
                        )}

                      {/* Store Cash Reconciliation Notices */}
                      {order.cashDepositStatus === 'DEPOSIT_REQUESTED' && (
                        <div className="rounded-sm bg-amber-500/12 border border-amber-400/35 p-4 text-xs text-amber-200">
                          Cash Reconciliation Notice: <strong>Deposit Cash at Store</strong> issued to agent {order.assignedAgentName}.
                        </div>
                      )}
                      {order.cashDepositStatus === 'AGENT_DEPOSITED' && (
                        <div className="rounded-sm bg-[#d8b06c]/12 border border-[#d8b06c]/35 p-4 text-xs text-[#f3efe8]">
                          Cash Reconciliation: Agent marked cash deposited at Madhapur Hub; awaiting Admin verification.
                        </div>
                      )}
                      {order.cashDepositStatus === 'CONFIRMED' && (
                        <div className="rounded-sm bg-emerald-500/12 border border-emerald-400/35 p-4 text-xs text-emerald-200 flex items-center gap-2">
                          <Check className="w-4 h-4 shrink-0" />
                          <span>Amount Deposited by Agent to Store — Fully Settled.</span>
                        </div>
                      )}
                    </div>

                    {/* Cartographic Live Map Plate */}
                    <div className="lg:col-span-7 space-y-2.5">
                      <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[#9aa4ae]">
                        <span>LIVE ROUTE · MADHAPUR HUB → {order.pinCode}</span>
                        <span>
                          {order.deliveryCoordinates.lat.toFixed(4)}° N, {order.deliveryCoordinates.lng.toFixed(4)}° E
                        </span>
                      </div>
                      <LiveHyderabadMap
                        customerCoords={order.deliveryCoordinates}
                        agentCoords={order.assignedAgentId ? order.agentLiveCoordinates : undefined}
                        customerLabel={`${order.orderNumber} Drop (${order.pinCode})`}
                        agentLabel={order.assignedAgentName ? `${order.assignedAgentName} (Live)` : undefined}
                        heightClass="h-72"
                      />
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      )}

      {/* PRODUCT PROVENANCE & REVIEWS SHEET */}
      {selectedProduct && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto"
        >
          <div className="glass-panel w-full max-w-3xl rounded-md overflow-hidden text-[#f3efe8] my-auto">
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="aspect-[4/3] md:aspect-auto bg-[#08121c] border-b md:border-b-0 md:border-r border-[#e4cca2]/16">
                <img
                  src={selectedProduct.imageUrl}
                  alt={selectedProduct.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-7 flex flex-col justify-between gap-6">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-[#d8b06c] font-mono-tabular">
                      Lot #{selectedProduct.id} · {selectedProduct.merchantName}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedProduct(null)}
                      className="p-1 text-[#9aa4ae] hover:text-white cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <h3 className="mt-2 font-editorial text-3xl text-[#f8f5ef]">{selectedProduct.name}</h3>
                  <p className="mt-3 text-xs text-[#b7c0c9] leading-relaxed">{selectedProduct.description}</p>

                  <dl className="mt-5 pt-4 border-t border-[#e4cca2]/14 grid grid-cols-2 gap-4 text-xs font-mono-tabular">
                    <div>
                      <dt className="text-[#8f9ba6]">Fat Assay</dt>
                      <dd className="text-[#f8f5ef] text-sm font-semibold mt-0.5">{selectedProduct.fatPercent}%</dd>
                    </div>
                    <div>
                      <dt className="text-[#8f9ba6]">SNF Grade</dt>
                      <dd className="text-[#f8f5ef] text-sm font-semibold mt-0.5">{selectedProduct.snfPercent}%</dd>
                    </div>
                  </dl>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-[#e4cca2]/14">
                  <div className="text-2xl font-semibold text-[#f8f5ef] font-mono-tabular">
                    {formatInr(selectedProduct.priceInr)}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      addToCart(selectedProduct);
                      setSelectedProduct(null);
                    }}
                    className="px-5 py-2.5 rounded-sm btn-brass text-xs uppercase tracking-[0.12em] cursor-pointer"
                  >
                    Add to Basket
                  </button>
                </div>
              </div>
            </div>

            {/* Verified Customer Reviews + Permanent Write a Review Button */}
            <div className="p-7 border-t border-[#e4cca2]/16 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-editorial text-lg text-[#f8f5ef]">
                  Verified Tasting Ledger ({reviews.filter((r) => r.productId === selectedProduct.id).length})
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    const prodId = selectedProduct.id;
                    setSelectedProduct(null);
                    onOpenWriteReview(prodId);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-sm btn-outline-classic text-xs cursor-pointer"
                >
                  <span>Write a Review</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#d8b06c]" />
                </button>
              </div>
              <div className="divide-y divide-[#e4cca2]/12 max-h-48 overflow-y-auto pr-1">
                {reviews.filter((r) => r.productId === selectedProduct.id).length === 0 ? (
                  <p className="text-xs text-[#9aa4ae] py-3">No reviews recorded yet for this harvest lot.</p>
                ) : (
                  reviews
                    .filter((r) => r.productId === selectedProduct.id)
                    .map((rev) => (
                      <div key={rev.id} className="flex items-start gap-3.5 py-3">
                        <img
                          src={resolveAvatarSrc(rev.customerAvatarUrl)}
                          alt={rev.customerName}
                          className="w-9 h-9 rounded-full border border-[#e4cca2]/30 shrink-0"
                        />
                        <div className="text-xs space-y-1">
                          <div className="flex items-center gap-2.5 text-[#f8f5ef] font-medium">
                            <span>{rev.customerName}</span>
                            <span className="text-[#d8b06c] font-mono-tabular">{'★'.repeat(rev.rating)}</span>
                          </div>
                          <p className="text-[#b7c0c9] leading-relaxed">{rev.comment}</p>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CLASSIC ITEMIZED RECEIPT BASKET DRAWER */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md h-full p-7 flex flex-col justify-between overflow-y-auto border-y-0 border-r-0">
            <div className="space-y-6">
              <div className="flex items-start justify-between pb-4 border-b border-[#e4cca2]/16">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#d8b06c]">Hyderabad Dispatch</p>
                  <h3 className="mt-1 font-editorial text-2xl text-[#f8f5ef]">Morning Dairy Basket</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setCartOpen(false)}
                  className="p-1.5 text-[#9aa4ae] hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {cart.length === 0 ? (
                <div className="py-16 text-center text-sm text-[#9aa4ae] space-y-3">
                  <Package className="w-8 h-8 mx-auto text-[#d8b06c]/60" />
                  <p>Your morning basket is currently empty.</p>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-[#e4cca2]/14">
                    {cart.map((item) => (
                      <div key={item.product.id} className="py-3.5 flex items-center justify-between gap-3">
                        <div>
                          <div className="font-editorial text-base text-[#f8f5ef]">{item.product.name}</div>
                          <div className="text-xs text-[#9aa4ae] font-mono-tabular">
                            {formatInr(item.product.priceInr)} · {item.product.unit}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateCartQty(item.product.id, -1)}
                            className="p-1.5 rounded-sm btn-outline-classic cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm font-mono-tabular text-[#f8f5ef]">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQty(item.product.id, 1)}
                            className="p-1.5 rounded-sm btn-outline-classic cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <form id="checkout-form" onSubmit={handleCheckout} className="space-y-4 pt-4 border-t border-[#e4cca2]/16">
                    <div>
                      <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1.5">
                        Hyderabad Delivery Zone (PIN 500xxx)
                      </label>
                      <select
                        value={selectedAreaIdx}
                        onChange={(e) => {
                          const idx = Number(e.target.value);
                          setSelectedAreaIdx(idx);
                          setStreetAddress(`${HYDERABAD_AREAS[idx].label}, Hyderabad, TG`);
                        }}
                        className="w-full rounded-sm classic-input px-3 py-2.5 text-xs"
                      >
                        {HYDERABAD_AREAS.map((a, idx) => (
                          <option key={a.pinCode} value={idx} className="bg-[#08121c]">
                            {a.label} — PIN {a.pinCode}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1.5">
                        Residence / Landmark
                      </label>
                      <input
                        type="text"
                        required
                        value={streetAddress}
                        onChange={(e) => setStreetAddress(e.target.value)}
                        className="w-full rounded-sm classic-input px-3 py-2.5 text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1.5">
                        Delivery Slot
                      </label>
                      <select
                        value={deliverySlot}
                        onChange={(e) => setDeliverySlot(e.target.value as DeliverySlot)}
                        className="w-full rounded-sm classic-input px-3 py-2.5 text-xs"
                      >
                        <option value="Morning (05:30 - 07:30 AM)" className="bg-[#08121c]">
                          Morning (05:30 - 07:30 AM)
                        </option>
                        <option value="Evening (05:00 - 07:00 PM)" className="bg-[#08121c]">
                          Evening (05:00 - 07:00 PM)
                        </option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1.5">
                        Settlement Method
                      </label>
                      <div className="grid grid-cols-2 gap-2.5">
                        {(['PREPAID', 'COD'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setPaymentMethod(m)}
                            className={`py-2.5 px-3 rounded-sm text-xs border transition-colors cursor-pointer ${
                              paymentMethod === m
                                ? 'bg-[#d8b06c]/16 border-[#d8b06c] text-[#f8f5ef] font-medium'
                                : 'bg-white/[0.02] border-[#e4cca2]/16 text-[#9aa4ae]'
                            }`}
                          >
                            {m === 'PREPAID' ? 'Prepaid Online' : 'COD (UPI QR / Cash)'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </form>
                </>
              )}
            </div>

            {cart.length > 0 && (
              <div className="pt-5 mt-6 border-t border-[#e4cca2]/18 space-y-3">
                <div className="flex justify-between text-xs text-[#9aa4ae] font-mono-tabular">
                  <span>Dairy Subtotal</span>
                  <span>{formatInr(cartSubtotal)}</span>
                </div>
                <div className="flex justify-between text-xs text-[#9aa4ae] font-mono-tabular">
                  <span>Chilled Hub Delivery</span>
                  <span>{formatInr(deliveryFee)}</span>
                </div>
                <div className="flex justify-between text-lg font-semibold text-[#f8f5ef] font-mono-tabular pt-3 border-t border-[#e4cca2]/16">
                  <span>Total Payable</span>
                  <span>{formatInr(cartSubtotal + deliveryFee)}</span>
                </div>
                <button
                  type="submit"
                  form="checkout-form"
                  disabled={checkoutBusy}
                  className="w-full py-3.5 rounded-sm btn-brass text-xs uppercase tracking-[0.14em] cursor-pointer"
                >
                  {checkoutBusy
                    ? 'Recording Order...'
                    : currentUser
                      ? `Place ${paymentMethod} Order · ${formatInr(cartSubtotal + deliveryFee)}`
                      : 'Sign In to Place Order'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
