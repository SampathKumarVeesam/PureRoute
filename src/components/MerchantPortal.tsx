import React, { useEffect, useState } from 'react';
import { CheckCircle2, PlusCircle, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { formatInr, type DairyProduct, type OrderRecord, type PublicUser } from '../types/domain';

interface MerchantPortalProps {
  currentUser: PublicUser;
  onCatalogUpdated: () => Promise<void>;
}

export const MerchantPortal: React.FC<MerchantPortalProps> = ({ currentUser, onCatalogUpdated }) => {
  const [products, setProducts] = useState<DairyProduct[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<DairyProduct['category']>('Buffalo Milk');
  const [unit, setUnit] = useState('1 Litre Glass Bottle');
  const [priceInr, setPriceInr] = useState(96);
  const [fatPercent, setFatPercent] = useState(7.5);
  const [snfPercent, setSnfPercent] = useState(9.1);
  const [stockQty, setStockQty] = useState(40);
  const [harvestNote, setHarvestNote] = useState('Milked 04:20 AM · Chilled to 4°C');
  const [description, setDescription] = useState('Pure morning single-farm dairy batch from Telangana pastures.');

  const loadData = async () => {
    try {
      const [prods, ords] = await Promise.all([api.getMerchantProducts(), api.getMerchantOrders()]);
      setProducts(prods);
      setOrders(ords);
    } catch (err: any) {
      setNotice(err.message);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      await api.createMerchantProduct({
        name,
        category,
        unit,
        priceInr,
        fatPercent,
        snfPercent,
        harvestNote,
        stockQty,
        description,
        supportsSubscription: true,
      });
      setName('');
      setNotice('New fresh dairy harvest lot published to Hyderabad Storefront.');
      await loadData();
      await onCatalogUpdated();
    } catch (err: any) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRestock = async (product: DairyProduct, delta: number) => {
    try {
      await api.updateMerchantStock(product.id, Math.max(0, product.stockQty + delta));
      await loadData();
      await onCatalogUpdated();
      setNotice(`Replenished stock and refreshed harvest timestamp for Lot #${product.id}.`);
    } catch (err: any) {
      setNotice(err.message);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-10 md:py-12 space-y-10">
      {/* Classic Farm Provenance Masthead */}
      <div className="flex flex-wrap items-end justify-between gap-6 pb-6 border-b border-[#e4cca2]/16">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#d8b06c]">
            Telangana Pasture Partner · Cold-Chain Provenance Ledger
          </p>
          <h1 className="mt-2 font-editorial text-4xl text-[#f8f5ef] font-medium">
            {currentUser.farmName || 'Local Dairy Farm Partner'}
          </h1>
          <p className="mt-1.5 text-xs text-[#9aa4ae] font-mono-tabular">
            Steward: {currentUser.name} · {currentUser.phone} ·{' '}
            {currentUser.merchantVerified ? (
              <span className="text-emerald-300">Accredited PureRoute Farm Partner</span>
            ) : (
              <span className="text-amber-300">Awaiting Madhapur Hub Verification</span>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-sm btn-outline-classic text-xs cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#d8b06c]" />
          <span>Refresh Ledger</span>
        </button>
      </div>

      {notice && (
        <div className="rounded-sm bg-[#d8b06c]/12 border border-[#d8b06c]/35 px-4 py-3 text-xs text-[#f8f5ef]">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Harvest Registration Folio */}
        <form onSubmit={handleCreateBatch} className="lg:col-span-5 glass-panel rounded-md p-7 space-y-5">
          <div className="pb-4 border-b border-[#e4cca2]/16">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#d8b06c]">01. Lot Intake</p>
            <h2 className="mt-1 font-editorial text-2xl text-[#f8f5ef]">Register Morning Harvest</h2>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1.5">
              Dairy Product Title
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Fresh A2 Sahiwal Cow Milk"
              className="w-full rounded-sm classic-input px-3.5 py-2.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1.5">
                Classification
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as DairyProduct['category'])}
                className="w-full rounded-sm classic-input px-3 py-2.5 text-xs"
              >
                <option value="Buffalo Milk" className="bg-[#08121c]">Buffalo Milk</option>
                <option value="A2 Cow Milk" className="bg-[#08121c]">A2 Cow Milk</option>
                <option value="Curd & Paneer" className="bg-[#08121c]">Curd &amp; Paneer</option>
                <option value="Ghee & Buttermilk" className="bg-[#08121c]">Ghee &amp; Buttermilk</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1.5">
                Vessel / Pack
              </label>
              <input
                type="text"
                required
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full rounded-sm classic-input px-3 py-2.5 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-[0.12em] text-[#a5b0ba] mb-1.5">Price (₹)</label>
              <input
                type="number"
                required
                min={10}
                value={priceInr}
                onChange={(e) => setPriceInr(Number(e.target.value))}
                className="w-full rounded-sm classic-input px-2.5 py-2 text-xs font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.12em] text-[#a5b0ba] mb-1.5">Fat %</label>
              <input
                type="number"
                step="0.1"
                value={fatPercent}
                onChange={(e) => setFatPercent(Number(e.target.value))}
                className="w-full rounded-sm classic-input px-2.5 py-2 text-xs font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.12em] text-[#a5b0ba] mb-1.5">SNF %</label>
              <input
                type="number"
                step="0.1"
                value={snfPercent}
                onChange={(e) => setSnfPercent(Number(e.target.value))}
                className="w-full rounded-sm classic-input px-2.5 py-2 text-xs font-mono-tabular"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-[0.12em] text-[#a5b0ba] mb-1.5">Stock</label>
              <input
                type="number"
                min={1}
                value={stockQty}
                onChange={(e) => setStockQty(Number(e.target.value))}
                className="w-full rounded-sm classic-input px-2.5 py-2 text-xs font-mono-tabular"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1.5">
              Harvest &amp; Chilling Note
            </label>
            <input
              type="text"
              value={harvestNote}
              onChange={(e) => setHarvestNote(e.target.value)}
              className="w-full rounded-sm classic-input px-3.5 py-2 text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1.5">
              Provenance Notes
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-sm classic-input px-3.5 py-2 text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-sm btn-brass text-xs uppercase tracking-[0.14em] cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{busy ? 'Publishing Lot...' : 'Publish Fresh Batch'}</span>
          </button>
        </form>

        {/* Inventory & Preparation Ledgers */}
        <div className="lg:col-span-7 space-y-8">
          <div className="glass-panel rounded-md p-7 space-y-5">
            <div className="pb-4 border-b border-[#e4cca2]/16 flex items-baseline justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#d8b06c]">02. Cold-Chain Stock</p>
                <h2 className="mt-1 font-editorial text-2xl text-[#f8f5ef]">Active Farm Lots</h2>
              </div>
              <span className="font-mono-tabular text-xs text-[#8f9ba6]">{products.length} Active</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] uppercase tracking-[0.12em] text-[#8f9ba6] border-b border-[#e4cca2]/16">
                  <tr>
                    <th className="py-3 pr-3">Lot</th>
                    <th className="py-3 pr-3">Dairy Product</th>
                    <th className="py-3 pr-3">Fat / SNF</th>
                    <th className="py-3 pr-3 text-right">Price</th>
                    <th className="py-3 text-right">Units</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e4cca2]/12">
                  {products.map((p) => (
                    <tr key={p.id} className="hover:bg-white/[0.02]">
                      <td className="py-3.5 pr-3 font-mono-tabular text-[#d8b06c]">#{p.id}</td>
                      <td className="py-3.5 pr-3">
                        <div className="font-editorial text-base text-[#f8f5ef]">{p.name}</div>
                        <div className="text-[11px] text-[#8f9ba6]">{p.unit}</div>
                      </td>
                      <td className="py-3.5 pr-3 font-mono-tabular text-[#c6ced6]">
                        {p.fatPercent}% / {p.snfPercent}%
                      </td>
                      <td className="py-3.5 pr-3 text-right font-mono-tabular text-[#f8f5ef]">
                        {formatInr(p.priceInr)}
                      </td>
                      <td className="py-3.5 text-right">
                        <div className="inline-flex items-center gap-2.5">
                          <span className="font-mono-tabular text-[#f8f5ef]">{p.stockQty}</span>
                          <button
                            type="button"
                            onClick={() => handleRestock(p, 10)}
                            className="px-2.5 py-1 rounded-sm btn-outline-classic text-[11px] font-mono-tabular cursor-pointer"
                          >
                            +10
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="glass-panel rounded-md p-7 space-y-5">
            <div className="pb-4 border-b border-[#e4cca2]/16 flex items-baseline justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#d8b06c]">03. Crate Dispatch</p>
                <h2 className="mt-1 font-editorial text-2xl text-[#f8f5ef]">Hub Preparation Queue</h2>
              </div>
              <span className="font-mono-tabular text-xs text-[#8f9ba6]">{orders.length} Orders</span>
            </div>

            <div className="divide-y divide-[#e4cca2]/12">
              {orders.map((ord) => (
                <div key={ord.id} className="py-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="text-[#f8f5ef] font-medium font-mono-tabular">
                      {ord.orderNumber} · {ord.deliverySlot}
                    </div>
                    <div className="text-[#9aa4ae] mt-1">
                      {ord.items.map((i) => `Lot #${i.productId} ${i.productName} ×${i.quantity}`).join(' · ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[#d8b06c] font-mono-tabular uppercase tracking-wider text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{ord.status.replace(/_/g, ' ')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
