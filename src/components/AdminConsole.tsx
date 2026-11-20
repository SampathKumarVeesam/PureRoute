import React, { useEffect, useState } from 'react';
import {
  Clock,
  Mail,
  MapPin,
  RefreshCw,
  ShieldCheck,
  UserMinus,
} from 'lucide-react';
import { api } from '../lib/api';
import { resolveAvatarSrc } from '../lib/avatars';
import { LiveHyderabadMap } from './LiveHyderabadMap';
import {
  formatInr,
  type EmailDispatchLog,
  type OrderRecord,
} from '../types/domain';

type AdminOverviewData = Awaited<ReturnType<typeof api.getAdminOverview>>;

export const AdminConsole: React.FC = () => {
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [selectedMapOrder, setSelectedMapOrder] = useState<OrderRecord | null>(null);
  const [reassignTarget, setReassignTarget] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'orders' | 'agents' | 'merchants' | 'emails'>('orders');

  const loadOverview = async () => {
    try {
      const res = await api.getAdminOverview();
      setData(res);
      if (!selectedMapOrder) {
        const live = res.orders.find((o) => o.status === 'OUT_FOR_DELIVERY') || res.orders[0] || null;
        setSelectedMapOrder(live);
      } else {
        const refreshed = res.orders.find((o) => o.id === selectedMapOrder.id) || null;
        setSelectedMapOrder(refreshed);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    loadOverview();
    const timer = setInterval(loadOverview, 12_000);
    return () => clearInterval(timer);
  }, []);

  const runAction = async (id: string, fn: () => Promise<{ message: string }>) => {
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const res = await fn();
      setNotice(res.message);
      await loadOverview();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleTimerChange = async (mins: number) => {
    try {
      await api.setFifoMinutes(mins);
      setNotice(`FIFO Accept/Reject countdown window updated to ${mins} minutes.`);
      await loadOverview();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-16 text-sm text-[#9aa4ae]">
        Loading Madhapur Hub Operations Ledger...
      </div>
    );
  }

  const eligibleAgents = data.agents.filter((a) => a.isEligibleForDispatch);

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-10 py-10 md:py-12 space-y-10">
      {/* Executive Command Masthead */}
      <div className="flex flex-wrap items-end justify-between gap-6 pb-6 border-b border-[#e4cca2]/16">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#d8b06c]">
            Hitech City / Madhapur Dairy Hub · TG 500081
          </p>
          <h1 className="mt-2 font-editorial text-4xl text-[#f8f5ef] font-medium">
            Operations &amp; Dispatch Command
          </h1>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-[#b7c0c9] glass-panel rounded-sm px-3.5 py-2">
            <Clock className="w-3.5 h-3.5 text-[#d8b06c]" />
            <span className="uppercase tracking-[0.1em] text-[10px]">FIFO Window</span>
            <div className="flex items-center gap-1 pl-2 border-l border-[#e4cca2]/16">
              {[2, 3, 4, 5].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleTimerChange(m)}
                  className={`px-2 py-0.5 rounded-sm font-mono-tabular text-xs cursor-pointer transition-colors ${
                    data.settings.fifoOfferMinutes === m
                      ? 'bg-[#d8b06c] text-[#081119] font-semibold'
                      : 'text-[#a5b0ba] hover:text-white'
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={loadOverview}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-sm btn-outline-classic text-xs cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#d8b06c]" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Single Continuous 6-Metric Architectural Ribbon */}
      <div className="glass-panel rounded-md grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-y md:divide-y-0 md:divide-x divide-[#e4cca2]/14">
        {[
          { label: 'Total Orders', value: data.stats.totalOrders, tone: 'text-[#f8f5ef]' },
          { label: 'Awaiting Process', value: data.stats.processingCount, tone: 'text-[#d8b06c]' },
          { label: 'Out for Delivery', value: data.stats.outForDeliveryCount, tone: 'text-[#f8f5ef]' },
          { label: 'Active Fleet', value: data.stats.activeAgentsCount, tone: 'text-emerald-300' },
          { label: 'Cash-Locked', value: data.stats.cashLockedAgentsCount, tone: 'text-amber-300' },
          { label: 'Pending UPI QR', value: data.stats.pendingQrConfirmCount, tone: 'text-[#d8b06c]' },
        ].map((k) => (
          <div key={k.label} className="p-4 md:p-5">
            <div className="text-[10px] uppercase tracking-[0.14em] text-[#8f9ba6]">{k.label}</div>
            <div className={`mt-1.5 text-2xl font-semibold font-mono-tabular ${k.tone}`}>{k.value}</div>
          </div>
        ))}
      </div>

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

      {/* Classic Underlined Editorial Console Tabs */}
      <div className="flex items-center gap-8 border-b border-[#e4cca2]/14 overflow-x-auto">
        {(
          [
            { id: 'orders', num: '01.', label: `Dispatch & Settlement (${data.orders.length})` },
            { id: 'agents', num: '02.', label: `FIFO Agent Roster (${data.agents.length})` },
            { id: 'merchants', num: '03.', label: `Farm Accreditation (${data.merchants.length})` },
            { id: 'emails', num: '04.', label: `Brevo Mail Ledger (${data.emailLogs.length})` },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`pb-3 text-sm border-b-2 transition-colors cursor-pointer whitespace-nowrap flex items-center gap-2 ${
              activeTab === t.id
                ? 'border-[#d8b06c] text-[#f8f5ef] font-medium'
                : 'border-transparent text-[#8f9ba6] hover:text-[#f3efe8]'
            }`}
          >
            <span className="font-mono-tabular text-[11px] text-[#d8b06c]">{t.num}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: ORDERS, FIFO DISPATCH, MANUAL REASSIGNMENT & SETTLEMENT */}
      {activeTab === 'orders' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 space-y-5">
            {data.orders.map((order) => (
              <article
                key={order.id}
                className={`glass-panel rounded-md p-6 space-y-4 transition-colors ${
                  selectedMapOrder?.id === order.id ? 'border-[#d8b06c]/55' : ''
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono-tabular">
                      <span className="text-[#d8b06c] font-semibold">{order.orderNumber}</span>
                      <span className="text-[#6c7782]">·</span>
                      <span className="text-[#f3efe8]">{order.status.replace(/_/g, ' ')}</span>
                      <span className="text-[#6c7782]">·</span>
                      <span className="text-[#9aa4ae]">{order.paymentMethod}</span>
                    </div>
                    <div className="mt-1.5 font-editorial text-xl text-[#f8f5ef]">
                      {order.customerName}{' '}
                      <span className="font-mono-tabular text-xs text-[#9aa4ae] font-sans">
                        ({order.customerPhone})
                      </span>
                    </div>
                    <div className="text-xs text-[#9aa4ae] mt-0.5">
                      {order.deliveryAddress} — PIN {order.pinCode}
                    </div>
                  </div>
                  <div className="text-right font-mono-tabular">
                    <div className="text-lg font-semibold text-[#f8f5ef]">{formatInr(order.totalInr)}</div>
                    <button
                      type="button"
                      onClick={() => setSelectedMapOrder(order)}
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#d8b06c] hover:text-white cursor-pointer"
                    >
                      <MapPin className="w-3 h-3" />
                      <span>Inspect Route</span>
                    </button>
                  </div>
                </div>

                <div className="text-xs text-[#b7c0c9] flex flex-wrap items-center justify-between gap-2 pt-3.5 border-t border-[#e4cca2]/14">
                  <span>
                    Assigned Courier:{' '}
                    <strong className="text-[#f8f5ef]">
                      {order.assignedAgentName
                        ? `${order.assignedAgentName} (${order.assignedAgentPhone})`
                        : 'Unassigned'}
                    </strong>
                  </span>
                  {order.deliveryOtp && (
                    <span className="font-mono-tabular text-[#d8b06c]">
                      Synced OTP: <strong>{order.deliveryOtp}</strong>
                    </span>
                  )}
                </div>

                {/* Lifecycle Action Controls */}
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  {order.status === 'PROCESSING' && (
                    <button
                      type="button"
                      disabled={busyId === order.id}
                      onClick={() => runAction(order.id, () => api.adminProcessOrder(order.id))}
                      className="px-4 py-2.5 rounded-sm btn-brass text-xs uppercase tracking-[0.1em] cursor-pointer"
                    >
                      Mark PROCESSED &amp; Auto-Assign FIFO #1
                    </button>
                  )}

                  {(order.status === 'PROCESSED' || order.status === 'AWAITING_AGENT_ACCEPTANCE') && (
                    <div className="flex flex-wrap items-center gap-2.5 w-full">
                      {order.assignedAgentId && (
                        <button
                          type="button"
                          disabled={busyId === order.id}
                          onClick={() => runAction(order.id, () => api.adminReassignOrder(order.id, null))}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-sm bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/35 text-rose-200 text-xs cursor-pointer"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                          <span>Remove Agent</span>
                        </button>
                      )}
                      <select
                        value={reassignTarget[order.id] || ''}
                        onChange={(e) =>
                          setReassignTarget((prev) => ({ ...prev, [order.id]: e.target.value }))
                        }
                        className="rounded-sm classic-input px-3 py-2 text-xs"
                      >
                        <option value="" className="bg-[#08121c]">
                          Select eligible active agent...
                        </option>
                        {eligibleAgents.map((a) => (
                          <option key={a.id} value={a.id} className="bg-[#08121c]">
                            FIFO #{a.fifoQueueRank} — {a.name} ({a.phone})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busyId === order.id || !reassignTarget[order.id]}
                        onClick={() =>
                          runAction(order.id, () =>
                            api.adminReassignOrder(order.id, reassignTarget[order.id])
                          )
                        }
                        className="px-4 py-2 rounded-sm btn-brass text-xs cursor-pointer"
                      >
                        Manual Reassign
                      </button>
                    </div>
                  )}

                  {order.status === 'COD_QR_PENDING_ADMIN' && (
                    <button
                      type="button"
                      disabled={busyId === order.id}
                      onClick={() => runAction(order.id, () => api.adminConfirmQr(order.id))}
                      className="px-4 py-2.5 rounded-sm btn-brass text-xs uppercase tracking-[0.1em] cursor-pointer"
                    >
                      Confirm &ldquo;QR Amount Received&rdquo; ({formatInr(order.totalInr)})
                    </button>
                  )}

                  {order.cashDepositStatus === 'PENDING_ADMIN_REQUEST' && (
                    <button
                      type="button"
                      disabled={busyId === order.id}
                      onClick={() => runAction(order.id, () => api.adminRequestCashDeposit(order.id))}
                      className="px-4 py-2.5 rounded-sm btn-brass text-xs uppercase tracking-[0.1em] cursor-pointer"
                    >
                      Send &ldquo;Deposit Cash at Store&rdquo; Notice
                    </button>
                  )}

                  {(order.cashDepositStatus === 'DEPOSIT_REQUESTED' ||
                    order.cashDepositStatus === 'AGENT_DEPOSITED') && (
                    <button
                      type="button"
                      disabled={busyId === order.id}
                      onClick={() => runAction(order.id, () => api.adminConfirmCashDeposit(order.id))}
                      className="px-4 py-2.5 rounded-sm bg-emerald-400 hover:bg-emerald-300 text-[#081119] font-semibold text-xs cursor-pointer"
                    >
                      Confirm &ldquo;Amount Deposited by Agent to Store&rdquo; (Unlock FIFO)
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>

          {/* Sticky Cartographic Monitor */}
          <aside className="lg:col-span-5 lg:sticky lg:top-24 glass-panel rounded-md p-6 space-y-4">
            <div className="flex items-baseline justify-between pb-3 border-b border-[#e4cca2]/16">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-[#d8b06c]">Cartographic Monitor</p>
                <h2 className="mt-1 font-editorial text-xl text-[#f8f5ef]">Hyderabad Live Route</h2>
              </div>
              {selectedMapOrder && (
                <span className="font-mono-tabular text-xs text-[#d8b06c]">
                  {selectedMapOrder.orderNumber}
                </span>
              )}
            </div>
            {selectedMapOrder ? (
              <>
                <LiveHyderabadMap
                  customerCoords={selectedMapOrder.deliveryCoordinates}
                  agentCoords={selectedMapOrder.assignedAgentId ? selectedMapOrder.agentLiveCoordinates : undefined}
                  customerLabel={`${selectedMapOrder.customerName} (${selectedMapOrder.pinCode})`}
                  agentLabel={selectedMapOrder.assignedAgentName || 'Madhapur Hub'}
                  heightClass="h-80"
                />
                <dl className="pt-2 border-t border-[#e4cca2]/14 grid grid-cols-1 gap-2 text-xs">
                  <div className="flex justify-between gap-4">
                    <dt className="text-[#8f9ba6]">Destination</dt>
                    <dd className="text-[#f8f5ef] text-right">{selectedMapOrder.deliveryAddress}</dd>
                  </div>
                  <div className="flex justify-between gap-4 font-mono-tabular">
                    <dt className="text-[#8f9ba6]">Cash Settlement</dt>
                    <dd className="text-[#d8b06c]">{selectedMapOrder.cashDepositStatus.replace(/_/g, ' ')}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="text-xs text-[#9aa4ae]">Select an order docket to monitor its live Hyderabad route.</p>
            )}
          </aside>
        </div>
      )}

      {/* TAB 2: FIFO AGENT ROSTER */}
      {activeTab === 'agents' && (
        <div className="glass-panel rounded-md p-6 md:p-7 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-[0.14em] text-[#8f9ba6] border-b border-[#e4cca2]/16">
              <tr>
                <th className="py-3.5 pr-4">FIFO Rank</th>
                <th className="py-3.5 pr-4">Courier Profile</th>
                <th className="py-3.5 pr-4">Presence</th>
                <th className="py-3.5 pr-4">Cash Deposit Lock</th>
                <th className="py-3.5 pr-4 text-right">Drops</th>
                <th className="py-3.5 text-right">Wallet</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e4cca2]/12">
              {data.agents.map((agent) => (
                <tr key={agent.id} className="hover:bg-white/[0.02]">
                  <td className="py-4 pr-4 font-mono-tabular font-semibold text-[#d8b06c] text-sm">
                    {agent.fifoQueueRank ? `#${agent.fifoQueueRank}` : '—'}
                  </td>
                  <td className="py-4 pr-4">
                    <div className="flex items-center gap-3.5">
                      <img
                        src={resolveAvatarSrc(agent.avatarUrl)}
                        alt={agent.name}
                        className="w-10 h-10 rounded-full object-cover border border-[#e4cca2]/30"
                      />
                      <div>
                        <div className="font-editorial text-base text-[#f8f5ef]">{agent.name}</div>
                        <div className="text-[11px] text-[#8f9ba6] font-mono-tabular">
                          {agent.phone} · {agent.gender}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 pr-4 font-mono-tabular">
                    <span className={agent.presenceStatus === 'ACTIVE' ? 'text-emerald-300' : 'text-[#7d8892]'}>
                      {agent.presenceStatus === 'ACTIVE' ? 'ACTIVE (Logged In)' : 'INACTIVE (Logged Out)'}
                    </span>
                  </td>
                  <td className="py-4 pr-4 font-mono-tabular">
                    {agent.hasPendingCashDeposit ? (
                      <span className="text-amber-300 font-semibold">
                        LOCKED · Pending {formatInr(agent.pendingCashAmount)}
                      </span>
                    ) : (
                      <span className="text-[#8f9ba6]">Clear</span>
                    )}
                  </td>
                  <td className="py-4 pr-4 text-right font-mono-tabular text-[#f8f5ef]">
                    {agent.completedDeliveries}
                  </td>
                  <td className="py-4 text-right font-mono-tabular text-[#d8b06c] font-semibold">
                    {formatInr(agent.walletBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: FARM PARTNER ACCREDITATION */}
      {activeTab === 'merchants' && (
        <div className="glass-panel rounded-md p-6 md:p-7 divide-y divide-[#e4cca2]/14">
          {data.merchants.map((m) => (
            <div key={m.id} className="py-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-editorial text-xl text-[#f8f5ef]">{m.farmName || m.name}</div>
                <div className="text-xs text-[#9aa4ae] font-mono-tabular mt-1">
                  Steward: {m.name} · {m.phone} · {m.address} ({m.pinCode})
                </div>
              </div>
              {m.merchantVerified ? (
                <span className="inline-flex items-center gap-2 text-xs text-emerald-300 font-mono-tabular uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verified Farm Partner</span>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busyId === m.id}
                  onClick={() => runAction(m.id, () => api.adminVerifyMerchant(m.id))}
                  className="px-4 py-2.5 rounded-sm btn-brass text-xs uppercase tracking-[0.1em] cursor-pointer"
                >
                  Approve Accreditation
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* TAB 4: BREVO MAIL LEDGER */}
      {activeTab === 'emails' && (
        <div className="glass-panel rounded-md p-6 md:p-7 space-y-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 pb-4 border-b border-[#e4cca2]/16">
            <h2 className="font-editorial text-2xl text-[#f8f5ef]">Brevo HTTPS Dispatch Ledger</h2>
            <span className="text-xs text-[#8f9ba6] font-mono-tabular">
              POST https://api.brevo.com/v3/smtp/email
            </span>
          </div>
          {data.emailLogs.length === 0 ? (
            <p className="text-xs text-[#9aa4ae] py-6">
              No transactional dispatches recorded yet. Process an order, accept a delivery, or onboard a new courier to audit live Brevo payloads.
            </p>
          ) : (
            <div className="divide-y divide-[#e4cca2]/12">
              {data.emailLogs.map((log: EmailDispatchLog) => (
                <div key={log.id} className="py-4 space-y-1 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[#f8f5ef] font-medium flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-[#d8b06c]" />
                      <span>{log.subject}</span>
                    </span>
                    <span className="font-mono-tabular text-[#8f9ba6]">
                      {log.provider} · HTTP {log.statusCode} · {new Date(log.sentAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-[#9aa4ae] font-mono-tabular">
                    Recipient: {log.toName} &lt;{log.toEmail}&gt;
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
