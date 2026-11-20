import React, { useEffect, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  Clock,
  Navigation,
  QrCode,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { LiveHyderabadMap } from './LiveHyderabadMap';
import {
  formatInr,
  type AgentMaskedOrder,
  type PublicUser,
} from '../types/domain';

interface DeliveryAgentPortalProps {
  currentUser: PublicUser;
  onUserUpdated: (user: PublicUser) => void;
}

function formatCountdown(expiresAt: string | null, nowMs: number): string {
  if (!expiresAt) return '00:00';
  const remainingSec = Math.max(0, Math.floor((new Date(expiresAt).getTime() - nowMs) / 1000));
  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const DeliveryAgentPortal: React.FC<DeliveryAgentPortalProps> = ({
  currentUser,
  onUserUpdated,
}) => {
  const [agent, setAgent] = useState<PublicUser>(currentUser);
  const [fifoRank, setFifoRank] = useState<number | null>(null);
  const [totalQueue, setTotalQueue] = useState(0);
  const [orders, setOrders] = useState<AgentMaskedOrder[]>([]);
  const [nowMs, setNowMs] = useState(Date.now());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [otpInputs, setOtpInputs] = useState<Record<string, string>>({});
  const [qrMap, setQrMap] = useState<Record<string, { upiUri: string; upiQrDataUrl: string }>>({});

  const loadAgentState = async () => {
    try {
      const res = await api.getAgentOrders();
      setAgent(res.agent);
      onUserUpdated(res.agent);
      setFifoRank(res.fifoQueueRank);
      setTotalQueue(res.totalActiveQueue);
      setOrders(res.orders);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadAgentState();
    api.agentHeartbeat().catch(() => {});

    const heartbeatTimer = setInterval(() => {
      api.agentHeartbeat().catch(() => {});
    }, 60_000);

    const pollTimer = setInterval(() => {
      loadAgentState();
    }, 15_000);

    const clockTimer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      clearInterval(heartbeatTimer);
      clearInterval(pollTimer);
      clearInterval(clockTimer);
    };
  }, []);

  const handleAccept = async (orderId: string) => {
    setBusyId(orderId);
    setError(null);
    setNotice(null);
    try {
      const res = await api.agentAcceptOrder(orderId);
      setNotice(res.message);
      await loadAgentState();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (orderId: string) => {
    setBusyId(orderId);
    setError(null);
    setNotice(null);
    try {
      const res = await api.agentRejectOrder(orderId);
      setNotice(res.message);
      await loadAgentState();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleAdvanceGps = async (order: AgentMaskedOrder) => {
    setBusyId(order.id);
    try {
      const nextLat =
        order.agentLiveCoordinates.lat + (order.deliveryCoordinates.lat - order.agentLiveCoordinates.lat) * 0.45;
      const nextLng =
        order.agentLiveCoordinates.lng + (order.deliveryCoordinates.lng - order.agentLiveCoordinates.lng) * 0.45;
      await api.agentUpdateLocation(order.id, nextLat, nextLng);
      setNotice(`Live GPS route updated for ${order.orderNumber}.`);
      await loadAgentState();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleShowUpiQr = async (orderId: string) => {
    setBusyId(orderId);
    setError(null);
    try {
      const qr = await api.agentGenerateUpiQr(orderId);
      setQrMap((prev) => ({ ...prev, [orderId]: qr }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleComplete = async (order: AgentMaskedOrder, codMethod?: 'UPI_QR' | 'CASH') => {
    const otp = (otpInputs[order.id] || '').trim();
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the exact 6-digit Delivery OTP provided by the customer first.');
      return;
    }
    setBusyId(order.id);
    setError(null);
    setNotice(null);
    try {
      const res = await api.agentCompleteOrder(order.id, otp, codMethod);
      setNotice(res.message);
      setOtpInputs((prev) => ({ ...prev, [order.id]: '' }));
      await loadAgentState();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleMarkCashDeposited = async (orderId: string) => {
    setBusyId(orderId);
    setError(null);
    try {
      const res = await api.agentMarkCashDeposited(orderId);
      setNotice(res.message);
      await loadAgentState();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const pendingOffers = orders.filter((o) => o.status === 'AWAITING_AGENT_ACCEPTANCE');
  const activeDeliveries = orders.filter(
    (o) => o.status === 'OUT_FOR_DELIVERY' || o.status === 'COD_QR_PENDING_ADMIN'
  );
  const cashLockOrders = orders.filter(
    (o) => o.cashDepositStatus !== 'NONE' && o.cashDepositStatus !== 'CONFIRMED'
  );

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-10 md:py-12 space-y-10">
      {/* Classic Masthead */}
      <div className="flex flex-wrap items-end justify-between gap-6 pb-6 border-b border-[#e4cca2]/16">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#d8b06c]">
            Hyderabad Courier Fleet · Privacy-Masked Manifest Mode
          </p>
          <h1 className="mt-2 font-editorial text-4xl text-[#f8f5ef] font-medium">
            Delivery Dispatch Desk
          </h1>
          <p className="mt-1.5 text-xs text-[#9aa4ae] font-mono-tabular">
            Courier: {agent.name} · {agent.phone} · Active 60s Presence Heartbeat
          </p>
        </div>

        <button
          type="button"
          onClick={loadAgentState}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-sm btn-outline-classic text-xs cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#d8b06c]" />
          <span>Sync Queue &amp; Offers</span>
        </button>
      </div>

      {/* Continuous Architectural 4-Column Operational Ribbon */}
      <div className="glass-panel rounded-md grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-[#e4cca2]/14">
        <div className="p-5 md:p-6">
          <div className="text-[11px] uppercase tracking-[0.16em] text-[#8f9ba6]">FIFO Queue Rank</div>
          <div className="mt-2 text-2xl font-semibold text-[#f8f5ef] font-mono-tabular">
            {agent.hasPendingCashDeposit ? (
              <span className="text-amber-300">LOCKED</span>
            ) : fifoRank ? (
              `#${fifoRank} of ${totalQueue}`
            ) : (
              'Standby'
            )}
          </div>
        </div>
        <div className="p-5 md:p-6">
          <div className="text-[11px] uppercase tracking-[0.16em] text-[#8f9ba6]">Settled Earnings</div>
          <div className="mt-2 text-2xl font-semibold text-[#d8b06c] font-mono-tabular">
            {formatInr(agent.walletBalance)}
          </div>
        </div>
        <div className="p-5 md:p-6">
          <div className="text-[11px] uppercase tracking-[0.16em] text-[#8f9ba6]">Completed Drops</div>
          <div className="mt-2 text-2xl font-semibold text-[#f8f5ef] font-mono-tabular">
            {agent.completedDeliveries}
          </div>
        </div>
        <div className="p-5 md:p-6">
          <div className="text-[11px] uppercase tracking-[0.16em] text-[#8f9ba6]">Store Cash Liability</div>
          <div
            className={`mt-2 text-2xl font-semibold font-mono-tabular ${
              agent.hasPendingCashDeposit ? 'text-amber-300' : 'text-[#9aa4ae]'
            }`}
          >
            {formatInr(agent.pendingCashAmount)}
          </div>
        </div>
      </div>

      {/* CASH STORE-DEPOSIT LOCKOUT NOTICE */}
      {agent.hasPendingCashDeposit && (
        <div className="glass-panel rounded-md border-amber-400/45 bg-amber-500/[0.08] p-6 space-y-4">
          <div className="flex items-start gap-3.5">
            <ShieldAlert className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-amber-300">
                Dispatch Lockout Active
              </p>
              <h2 className="mt-1 font-editorial text-xl text-[#f8f5ef]">
                Pending COD Cash Deposit Required at Madhapur Dairy Hub
              </h2>
              <p className="mt-1.5 text-xs text-amber-100/85 leading-relaxed max-w-3xl">
                You hold {formatInr(agent.pendingCashAmount)} in collected COD cash. All new FIFO and manual assignments are paused until you deposit this cash at Madhapur Store (TG 500081) and Admin confirms receipt.
              </p>
            </div>
          </div>

          {cashLockOrders.map((ord) => (
            <div
              key={ord.id}
              className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-amber-400/20 text-xs"
            >
              <div className="font-mono-tabular text-amber-100">
                {ord.orderNumber} · Collected {formatInr(ord.totalInr)} · Status:{' '}
                <strong className="text-white">
                  {ord.cashDepositStatus === 'DEPOSIT_REQUESTED'
                    ? 'Admin Notice: Deposit Cash at Store'
                    : ord.cashDepositStatus === 'AGENT_DEPOSITED'
                      ? 'Cash Deposited in Store (Awaiting Admin Confirmation)'
                      : 'Pending Admin Store Deposit Request'}
                </strong>
              </div>
              {ord.cashDepositStatus !== 'AGENT_DEPOSITED' && (
                <button
                  type="button"
                  disabled={busyId === ord.id}
                  onClick={() => handleMarkCashDeposited(ord.id)}
                  className="px-5 py-2.5 rounded-sm btn-brass text-xs uppercase tracking-[0.1em] cursor-pointer"
                >
                  Mark &ldquo;Cash Deposited in Store&rdquo;
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-sm bg-rose-500/12 border border-rose-400/35 px-4 py-3 text-xs text-rose-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-sm bg-emerald-500/12 border border-emerald-400/35 px-4 py-3 text-xs text-emerald-200">
          {notice}
        </div>
      )}

      {/* INCOMING FIFO DISPATCH DOCKETS */}
      {pendingOffers.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between border-b border-[#e4cca2]/14 pb-3">
            <h2 className="font-editorial text-2xl text-[#f8f5ef]">Incoming FIFO Dispatch Dockets</h2>
            <span className="text-xs font-mono-tabular text-[#d8b06c]">
              {pendingOffers.length} Awaiting Decision
            </span>
          </div>

          {pendingOffers.map((offer) => (
            <div
              key={offer.id}
              className="glass-panel rounded-md border-[#d8b06c]/45 p-6 md:p-7 space-y-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-[#e4cca2]/16">
                <div>
                  <div className="font-mono-tabular text-xs text-[#d8b06c]">
                    {offer.orderNumber} · {offer.paymentMethod} · {offer.deliverySlot}
                  </div>
                  <div className="mt-1.5 font-editorial text-2xl text-[#f8f5ef]">
                    {offer.customerName}
                  </div>
                  <div className="mt-1 text-xs text-[#b7c0c9] font-mono-tabular">
                    {offer.customerPhone} · {offer.deliveryAddress} — PIN {offer.pinCode}
                  </div>
                </div>

                <div className="text-right">
                  <div className="inline-flex items-center gap-2 text-[#d8b06c] font-mono-tabular text-2xl font-semibold">
                    <Clock className="w-5 h-5" />
                    <span>{formatCountdown(offer.offerExpiresAt, nowMs)}</span>
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.14em] text-[#8f9ba6]">
                    Accept / Reject Window
                  </div>
                </div>
              </div>

              {/* PRIVACY-MASKED SEALED CRATE LEDGER */}
              <div className="rounded-sm bg-[#060d14]/70 border border-[#e4cca2]/16 p-4 flex flex-wrap items-center justify-between gap-4 text-xs font-mono-tabular">
                <div className="text-[#b7c0c9]">
                  Sealed Crate Manifest (Product IDs Only):{' '}
                  <strong className="text-[#f8f5ef]">
                    {offer.maskedItems.map((i) => `Product ID: #${i.productId} (×${i.quantity})`).join(' · ')}
                  </strong>
                </div>
                <div className="text-[#f8f5ef] font-semibold">Amount: {formatInr(offer.totalInr)}</div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={busyId === offer.id}
                  onClick={() => handleAccept(offer.id)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm btn-brass text-xs uppercase tracking-[0.12em] cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Accept &amp; Issue Delivery OTP</span>
                </button>
                <button
                  type="button"
                  disabled={busyId === offer.id}
                  onClick={() => handleReject(offer.id)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/35 text-rose-200 text-xs cursor-pointer"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Reject (Rotate to Back of FIFO Queue)</span>
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ACTIVE RUN FOLIOS */}
      <section className="space-y-5">
        <div className="flex items-baseline justify-between border-b border-[#e4cca2]/14 pb-3">
          <h2 className="font-editorial text-2xl text-[#f8f5ef]">Active Hyderabad Deliveries</h2>
          <span className="text-xs font-mono-tabular text-[#8f9ba6]">{activeDeliveries.length} En Route</span>
        </div>

        {activeDeliveries.length === 0 ? (
          <div className="glass-panel rounded-md p-10 text-sm text-[#9aa4ae]">
            No active deliveries assigned right now. Keep this dispatch desk open—your 60-second heartbeat maintains your FIFO queue rank automatically.
          </div>
        ) : (
          activeDeliveries.map((order) => {
            const qrInfo =
              qrMap[order.id] || (order.upiQrDataUrl ? { upiUri: '', upiQrDataUrl: order.upiQrDataUrl } : null);
            return (
              <article key={order.id} className="glass-panel rounded-md p-6 md:p-8 space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-[#e4cca2]/16">
                  <div>
                    <div className="font-mono-tabular text-xs text-[#d8b06c]">
                      {order.orderNumber} · {order.paymentMethod} · {order.status.replace(/_/g, ' ')}
                    </div>
                    <h3 className="mt-1.5 font-editorial text-2xl text-[#f8f5ef]">{order.customerName}</h3>
                    <div className="mt-1 text-xs text-[#b7c0c9] font-mono-tabular">
                      {order.customerPhone} · {order.deliveryAddress} — PIN {order.pinCode}
                    </div>
                  </div>
                  <div className="text-right font-mono-tabular">
                    <div className="text-2xl font-semibold text-[#f8f5ef]">{formatInr(order.totalInr)}</div>
                    <div className="text-xs text-[#d8b06c]">Courier Fee: {formatInr(order.deliveryFeeInr)}</div>
                  </div>
                </div>

                {/* STRICT PRIVACY-MASKED MANIFEST */}
                <div className="rounded-sm bg-[#060d14]/70 border border-[#e4cca2]/16 p-4 text-xs font-mono-tabular text-[#b7c0c9]">
                  Sealed Crate Manifest (Product IDs Only — Names &amp; Images Redacted):{' '}
                  <strong className="text-[#f8f5ef]">
                    {order.maskedItems.map((i) => `Product ID: #${i.productId} × ${i.quantity}`).join(' · ')}
                  </strong>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* Cartographic Map + GPS Broadcaster */}
                  <div className="lg:col-span-7 space-y-3">
                    <div className="flex items-center justify-between text-[11px] font-mono-tabular text-[#8f9ba6]">
                      <span>CARTOGRAPHIC ROUTE · MADHAPUR HUB → PIN {order.pinCode}</span>
                      <span>
                        {order.agentLiveCoordinates.lat.toFixed(4)}° N, {order.agentLiveCoordinates.lng.toFixed(4)}° E
                      </span>
                    </div>
                    <LiveHyderabadMap
                      customerCoords={order.deliveryCoordinates}
                      agentCoords={order.agentLiveCoordinates}
                      customerLabel={`${order.customerName} (${order.pinCode})`}
                      agentLabel="Your Live Location"
                      heightClass="h-72"
                    />
                    {order.status === 'OUT_FOR_DELIVERY' && (
                      <button
                        type="button"
                        disabled={busyId === order.id}
                        onClick={() => handleAdvanceGps(order)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-sm btn-outline-classic text-xs cursor-pointer"
                      >
                        <Navigation className="w-3.5 h-3.5 text-[#d8b06c]" />
                        <span>Broadcast Next GPS Coordinate Along Route</span>
                      </button>
                    )}
                  </div>

                  {/* Universal OTP & Settlement Vault */}
                  <div className="lg:col-span-5">
                    {order.status === 'COD_QR_PENDING_ADMIN' ? (
                      <div className="rounded-sm bg-[#d8b06c]/10 border border-[#d8b06c]/40 p-5 text-xs text-[#f3efe8] space-y-2">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-[#d8b06c]">
                          Settlement Pending Verification
                        </p>
                        <div className="font-editorial text-xl text-white">UPI QR Marked Paid</div>
                        <p className="text-[#c6ced6] leading-relaxed">
                          Universal OTP verified cleanly. Awaiting Operations Admin to click &ldquo;Confirm QR Amount Received&rdquo; to mark DELIVERED and credit your wallet.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-sm bg-[#060d14]/75 border border-[#e4cca2]/20 p-5 space-y-5">
                        <div>
                          <label className="block text-[11px] uppercase tracking-[0.16em] text-[#d8b06c] mb-2">
                            Universal 6-Digit Delivery OTP
                          </label>
                          <input
                            type="text"
                            maxLength={6}
                            value={otpInputs[order.id] || ''}
                            onChange={(e) =>
                              setOtpInputs((prev) => ({
                                ...prev,
                                [order.id]: e.target.value.replace(/\D/g, '').slice(0, 6),
                              }))
                            }
                            placeholder="000000"
                            className="w-full rounded-sm classic-input px-4 py-3 text-xl font-mono-tabular tracking-[0.3em] text-center"
                          />
                        </div>

                        {order.paymentMethod === 'PREPAID' ? (
                          <button
                            type="button"
                            disabled={busyId === order.id}
                            onClick={() => handleComplete(order)}
                            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-sm btn-brass text-xs uppercase tracking-[0.12em] cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Verify OTP &amp; Complete PREPAID Drop</span>
                          </button>
                        ) : (
                          <div className="space-y-3.5 pt-2 border-t border-[#e4cca2]/14">
                            <div className="text-[11px] uppercase tracking-[0.16em] text-[#9aa4ae]">
                              COD Collection · {formatInr(order.totalInr)}
                            </div>

                            <button
                              type="button"
                              disabled={busyId === order.id}
                              onClick={() => handleShowUpiQr(order.id)}
                              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-sm btn-outline-classic text-xs cursor-pointer"
                            >
                              <QrCode className="w-4 h-4 text-[#d8b06c]" />
                              <span>Generate Dynamic UPI QR ({formatInr(order.totalInr)})</span>
                            </button>

                            {qrInfo?.upiQrDataUrl && (
                              <div className="rounded-sm bg-[#faf7f0] p-4 text-center space-y-2 border border-[#d8b06c]">
                                <img
                                  src={qrInfo.upiQrDataUrl}
                                  alt="Dynamic UPI QR Code"
                                  className="w-44 h-44 mx-auto"
                                />
                                <div className="text-[11px] font-semibold text-[#08121c] font-mono-tabular">
                                  EXACT AMOUNT {formatInr(order.totalInr)} · PUREROUTE HYDERABAD
                                </div>
                              </div>
                            )}

                            <div className="space-y-2.5 pt-1">
                              <button
                                type="button"
                                disabled={busyId === order.id}
                                onClick={() => handleComplete(order, 'UPI_QR')}
                                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-sm btn-brass text-xs uppercase tracking-[0.1em] cursor-pointer"
                              >
                                <QrCode className="w-4 h-4" />
                                <span>Verify OTP &amp; Mark UPI QR Paid</span>
                              </button>

                              <button
                                type="button"
                                disabled={busyId === order.id}
                                onClick={() => handleComplete(order, 'CASH')}
                                className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-sm bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-amber-200 text-xs font-medium cursor-pointer"
                              >
                                <Banknote className="w-4 h-4" />
                                <span>Verify OTP &amp; Collect Cash (Store Lockout)</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
};
