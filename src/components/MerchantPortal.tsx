import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, MapPin, PlusCircle, RefreshCw, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { formatInr, type DairyProduct, type OrderRecord, type PublicUser } from '../types/domain';
import {
  getAvailableStates,
  getCitiesForState,
  getAreasForCity,
  type DeliveryLocationItem,
} from '../lib/locations';

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

  // Delivery Locations State (Max 3 zones)
  const [merchantLocations, setMerchantLocations] = useState<DeliveryLocationItem[]>(
    currentUser.deliveryLocations && currentUser.deliveryLocations.length > 0
      ? currentUser.deliveryLocations
      : [
          {
            state: 'Telangana',
            city: 'Hyderabad (Core + 300km Radius)',
            area: 'Madhapur / Hitech City',
            pin: '500081',
            zone: 'West',
          },
          {
            state: 'Telangana',
            city: 'Hyderabad (Core + 300km Radius)',
            area: 'Jubilee Hills / Film Nagar',
            pin: '500033',
            zone: 'West',
          },
          {
            state: 'Telangana',
            city: 'Hyderabad (Core + 300km Radius)',
            area: 'Gachibowli',
            pin: '500032',
            zone: 'West',
          },
        ]
  );
  const [selectedState, setSelectedState] = useState<string>('Telangana');
  const [selectedCity, setSelectedCity] = useState<string>('Hyderabad (Core + 300km Radius)');
  const [selectedAreaIndex, setSelectedAreaIndex] = useState<number>(0);
  const [savingLocations, setSavingLocations] = useState<boolean>(false);

  const availableStates = getAvailableStates();
  const availableCities = getCitiesForState(selectedState);
  const availableAreas = getAreasForCity(selectedState, selectedCity);

  const handleStateChange = (state: string) => {
    setSelectedState(state);
    const cities = getCitiesForState(state);
    const firstCity = cities[0] || '';
    setSelectedCity(firstCity);
    setSelectedAreaIndex(0);
  };

  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    setSelectedAreaIndex(0);
  };

  const handleAddLocation = async () => {
    if (merchantLocations.length >= 3) {
      setNotice('Maximum 3 delivery locations limit reached. Remove an existing zone to add a new one.');
      return;
    }
    const currentArea = availableAreas[selectedAreaIndex];
    if (!currentArea) return;

    const alreadyExists = merchantLocations.some(
      (loc) => loc.state === selectedState && loc.city === selectedCity && loc.area === currentArea.area
    );
    if (alreadyExists) {
      setNotice(`"${currentArea.area}" is already in your delivery zones list.`);
      return;
    }

    const nextLocations: DeliveryLocationItem[] = [
      ...merchantLocations,
      {
        state: selectedState,
        city: selectedCity,
        area: currentArea.area,
        pin: currentArea.pin,
        zone: currentArea.zone,
      },
    ];

    setSavingLocations(true);
    setNotice(null);
    try {
      await api.updateMerchantLocations(nextLocations);
      setMerchantLocations(nextLocations);
      setNotice(`Added "${currentArea.area}" to your farm delivery service zones (${nextLocations.length}/3).`);
      await onCatalogUpdated();
    } catch (err: any) {
      setNotice(err.message || 'Failed to update delivery locations');
    } finally {
      setSavingLocations(false);
    }
  };

  const handleRemoveLocation = async (indexToRemove: number) => {
    const removedItem = merchantLocations[indexToRemove];
    const nextLocations = merchantLocations.filter((_, idx) => idx !== indexToRemove);
    setSavingLocations(true);
    setNotice(null);
    try {
      await api.updateMerchantLocations(nextLocations);
      setMerchantLocations(nextLocations);
      setNotice(
        `Removed "${removedItem.area}". You can now assign a new delivery zone (${nextLocations.length}/3).`
      );
      await onCatalogUpdated();
    } catch (err: any) {
      setNotice(err.message || 'Failed to update delivery locations');
    } finally {
      setSavingLocations(false);
    }
  };

  const loadData = async () => {
    try {
      const [prods, ords, locsRes] = await Promise.all([
        api.getMerchantProducts(),
        api.getMerchantOrders(),
        api.getMerchantLocations().catch(() => ({ locations: [] })),
      ]);
      setProducts(prods);
      setOrders(ords);
      if (locsRes.locations && locsRes.locations.length > 0) {
        setMerchantLocations(locsRes.locations);
      }
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

      {/* 04. DELIVERY COVERAGE SETTINGS (MAX 3 DELIVERY ZONES) */}
      <div className="glass-panel rounded-md p-7 md:p-8 space-y-6">
        <div className="pb-4 border-b border-[#e4cca2]/16 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#d8b06c]" />
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#d8b06c]">
                04. Delivery Coverage Governance
              </p>
            </div>
            <h2 className="mt-1 font-editorial text-2xl md:text-3xl text-[#f8f5ef]">
              Farm Partner Delivery Service Zones ({merchantLocations.length} / 3 Allocated)
            </h2>
          </div>
          <span
            className={`text-xs px-3 py-1.5 rounded-sm border font-mono-tabular uppercase tracking-wider ${
              merchantLocations.length >= 3
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
            }`}
          >
            {merchantLocations.length >= 3
              ? '3/3 Maximum Limit Reached'
              : `${3 - merchantLocations.length} Slot${3 - merchantLocations.length === 1 ? '' : 's'} Remaining`}
          </span>
        </div>

        <p className="text-xs text-[#b8c2cc] leading-relaxed max-w-3xl">
          Select and save up to <strong>3 specific delivery locations/zones</strong> from our pan-India master dataset.
          On the customer storefront checkout, only the locations enabled here will be eligible for delivery when ordering your farm’s morning harvests.
        </p>

        {/* 3 Location Slots Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((slotIdx) => {
            const loc = merchantLocations[slotIdx];
            if (loc) {
              return (
                <div
                  key={slotIdx}
                  className="rounded-sm bg-[#08121c]/90 border border-[#d8b06c]/40 p-4 flex flex-col justify-between space-y-3.5 relative shadow-lg"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono-tabular text-xs text-[#d8b06c] font-semibold">
                      Zone #0{slotIdx + 1}
                    </span>
                    <span className="text-[10px] uppercase font-mono-tabular text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-sm">
                      Active Delivery Zone
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-[#f8f5ef]">{loc.area}</h3>
                    <p className="text-xs text-[#9aa4ae] mt-1">
                      {loc.city} · {loc.state}
                    </p>
                    <div className="flex items-center gap-2 mt-2.5">
                      <span className="text-[11px] font-mono-tabular text-[#e7c68b] bg-[#d8b06c]/10 border border-[#d8b06c]/30 px-2 py-0.5 rounded-sm">
                        PIN {loc.pin}
                      </span>
                      {loc.zone && (
                        <span className="text-[10px] text-[#8f9ba6] font-mono-tabular">
                          {loc.zone} Zone
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveLocation(slotIdx)}
                    disabled={savingLocations}
                    className="w-full mt-2 py-2 px-3 rounded-sm border border-rose-500/30 text-rose-300 hover:bg-rose-500/15 hover:border-rose-400 text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove Location</span>
                  </button>
                </div>
              );
            }

            return (
              <div
                key={slotIdx}
                className="rounded-sm border border-dashed border-[#e4cca2]/25 p-6 flex flex-col items-center justify-center text-center space-y-2 bg-[#08121c]/40 min-h-[160px]"
              >
                <MapPin className="w-6 h-6 text-[#8f9ba6]/40" />
                <span className="font-mono-tabular text-xs text-[#8f9ba6]">Slot #0{slotIdx + 1} — Unassigned</span>
                <p className="text-[11px] text-[#6b7682] max-w-[220px]">
                  Use the cascading dropdown below to assign this delivery zone.
                </p>
              </div>
            );
          })}
        </div>

        {/* Add Location Form OR Limit Reached Notice */}
        {merchantLocations.length >= 3 ? (
          <div className="p-4 rounded-sm bg-amber-500/10 border border-amber-500/35 text-amber-200 text-xs flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
            <div className="leading-relaxed">
              <strong className="text-amber-100">3-Location Capacity Limit Reached:</strong>{' '}
              Your farm has allocated all 3 delivery zones. To add or change to a different locality, remove one of the active locations above first.
            </div>
          </div>
        ) : (
          <div className="p-5 rounded-sm bg-[#08121c]/90 border border-[#e4cca2]/20 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#e4cca2]/12">
              <span className="text-[11px] uppercase tracking-[0.16em] text-[#d8b06c]">
                Add Delivery Zone ({merchantLocations.length} of 3 Allocated)
              </span>
              <span className="text-xs text-[#8f9ba6] font-mono-tabular">
                Localities in {selectedCity}: {availableAreas.length}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-[11px] uppercase tracking-[0.12em] text-[#a5b0ba] mb-1">
                  1. State
                </label>
                <select
                  value={selectedState}
                  onChange={(e) => handleStateChange(e.target.value)}
                  className="w-full rounded-sm classic-input px-3 py-2 text-xs"
                >
                  {availableStates.map((st) => (
                    <option key={st} value={st} className="bg-[#08121c]">
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-[0.12em] text-[#a5b0ba] mb-1">
                  2. City / Region
                </label>
                <select
                  value={selectedCity}
                  onChange={(e) => handleCityChange(e.target.value)}
                  className="w-full rounded-sm classic-input px-3 py-2 text-xs"
                >
                  {availableCities.map((ct) => (
                    <option key={ct} value={ct} className="bg-[#08121c]">
                      {ct}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-[0.12em] text-[#a5b0ba] mb-1">
                  3. Locality / Area
                </label>
                <select
                  value={selectedAreaIndex}
                  onChange={(e) => setSelectedAreaIndex(Number(e.target.value))}
                  className="w-full rounded-sm classic-input px-3 py-2 text-xs"
                >
                  {availableAreas.map((a, idx) => (
                    <option key={idx} value={idx} className="bg-[#08121c]">
                      {a.area} — PIN {a.pin}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={handleAddLocation}
                disabled={savingLocations || merchantLocations.length >= 3}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm btn-brass text-xs uppercase tracking-[0.12em] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{savingLocations ? 'Saving...' : 'Add Delivery Location'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
