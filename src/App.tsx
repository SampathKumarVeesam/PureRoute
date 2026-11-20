import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, LogOut, UserCog } from 'lucide-react';
import { api, getAuthToken, setAuthToken } from './lib/api';
import { resolveAvatarSrc } from './lib/avatars';
import { WaterRippleHero } from './components/WaterRippleHero';
import { StorefrontAndCustomerPortal } from './components/StorefrontAndCustomerPortal';
import { MerchantPortal } from './components/MerchantPortal';
import { DeliveryAgentPortal } from './components/DeliveryAgentPortal';
import { AdminConsole } from './components/AdminConsole';
import { AuthAndProfileModal } from './components/AuthAndProfileModal';
import { FeedbackReminderModal } from './components/FeedbackReminderModal';
import type {
  DairyProduct,
  MilkSubscription,
  OrderRecord,
  ProductReview,
  PublicUser,
} from './types/domain';

type ActiveView = 'hero' | 'storefront' | 'subscriptions' | 'orders' | 'delivery' | 'merchant' | 'admin';

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || 'Unexpected interface error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen inner-atmosphere text-[#f3efe8] flex items-center justify-center p-6">
          <div className="glass-panel max-w-md rounded-md p-8 space-y-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#d8b06c]">Recovery Notice</p>
            <h1 className="font-editorial text-2xl text-white">Interface Interrupted</h1>
            <p className="text-xs text-slate-300 font-mono-tabular break-all">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-sm btn-brass text-xs cursor-pointer"
            >
              Reload PureRoute
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface RoleGateProps {
  chapter: string;
  title: string;
  subtitle: string;
  pillars: { num: string; heading: string; detail: string }[];
  credentialHint: string;
  ctaLabel: string;
  onSignIn: () => void;
}

const ClassicRoleGate: React.FC<RoleGateProps> = ({
  chapter,
  title,
  subtitle,
  pillars,
  credentialHint,
  ctaLabel,
  onSignIn,
}) => (
  <section className="max-w-6xl mx-auto px-6 md:px-10 py-14 md:py-20">
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-stretch">
      <div className="lg:col-span-7 flex flex-col justify-between space-y-8">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#d8b06c]">{chapter}</p>
          <h1
            className="mt-3 font-editorial text-4xl md:text-5xl text-[#f8f5ef] font-medium leading-[1.08]"
            style={{ textWrap: 'balance' }}
          >
            {title}
          </h1>
          <p className="mt-4 text-sm md:text-base text-[#b7c0c9] leading-relaxed max-w-xl">{subtitle}</p>
        </div>

        <div className="border-t border-[#e4cca2]/15 divide-y divide-[#e4cca2]/12">
          {pillars.map((p) => (
            <div key={p.num} className="py-4 grid grid-cols-12 gap-4 items-baseline">
              <span className="col-span-2 font-mono-tabular text-xs text-[#d8b06c]">{p.num}</span>
              <div className="col-span-10">
                <h2 className="text-sm font-medium text-[#f8f5ef]">{p.heading}</h2>
                <p className="mt-1 text-xs text-[#9aa4ae] leading-relaxed">{p.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="lg:col-span-5 glass-panel rounded-md p-8 flex flex-col justify-between gap-8">
        <div className="space-y-4">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#d8b06c]">Authorized Portal Access</p>
          <h2 className="font-editorial text-2xl text-white">Sign In to Continue</h2>
          <p className="text-sm text-[#aeb7c0] leading-relaxed">
            Access requires verified PureRoute Hyderabad credentials. Use the quick-fill directory inside the sign-in sheet to test this role immediately.
          </p>
          <div className="pt-4 border-t border-[#e4cca2]/15 space-y-1.5">
            <span className="block text-[11px] uppercase tracking-[0.16em] text-[#9aa4ae]">
              Seeded Hyderabad Account
            </span>
            <p className="font-mono-tabular text-xs text-[#f3efe8]">{credentialHint}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onSignIn}
          className="w-full inline-flex items-center justify-between px-5 py-3.5 rounded-sm btn-brass text-xs uppercase tracking-[0.14em] cursor-pointer"
        >
          <span>{ctaLabel}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  </section>
);

function PureRouteShell() {
  const [view, setView] = useState<ActiveView>('hero');
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [products, setProducts] = useState<DairyProduct[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [subscriptions, setSubscriptions] = useState<MilkSubscription[]>([]);
  const [reviews, setReviews] = useState<ProductReview[]>([]);

  // Modals
  const [modalMode, setModalMode] = useState<'auth' | 'profile' | 'force-password' | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<{
    mode: 'reminder' | 'direct';
    pendingOrder: OrderRecord | null;
    directProduct?: DairyProduct | null;
    directOrderId?: string;
  } | null>(null);

  const refreshPublicAndUserData = useCallback(
    async (userOverride?: PublicUser | null) => {
      const activeUser = userOverride !== undefined ? userOverride : currentUser;
      try {
        const [prods, revs] = await Promise.all([api.getProducts(), api.getReviews()]);
        setProducts(prods);
        setReviews(revs);

        if (activeUser && (activeUser.role === 'customer' || activeUser.role === 'admin')) {
          const [ords, subs] = await Promise.all([api.getOrders(), api.getSubscriptions()]);
          setOrders(ords);
          setSubscriptions(subs);
        } else {
          setOrders([]);
          setSubscriptions([]);
        }
      } catch {
        // handled cleanly by individual portals
      }
    },
    [currentUser]
  );

  // Restore existing session on initial mount
  useEffect(() => {
    const bootstrap = async () => {
      const [prods, revs] = await Promise.all([
        api.getProducts().catch(() => []),
        api.getReviews().catch(() => []),
      ]);
      setProducts(prods);
      setReviews(revs);

      if (getAuthToken()) {
        try {
          const profile = await api.getProfile();
          setCurrentUser(profile);
          if (profile.mustChangePassword) {
            setModalMode('force-password');
          }
          await refreshPublicAndUserData(profile);
        } catch {
          setAuthToken(null);
        }
      }
    };
    bootstrap();
  }, []);

  // Smart Post-Delivery Feedback Reminder Watcher
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'customer' || view === 'hero') return;

    const checkReminder = async () => {
      try {
        const { pendingOrder } = await api.getPendingFeedback();
        if (pendingOrder && !feedbackModal) {
          setFeedbackModal({ mode: 'reminder', pendingOrder });
        }
      } catch {
        // silent
      }
    };

    const initialDelay = setTimeout(checkReminder, 12_000);
    const interval = setInterval(checkReminder, 60_000);
    return () => {
      clearTimeout(initialDelay);
      clearInterval(interval);
    };
  }, [currentUser, view]);

  const handleHeroNavigate = (
    target: 'storefront' | 'subscriptions' | 'delivery' | 'merchant' | 'admin' | 'auth'
  ) => {
    if (target === 'auth') {
      if (currentUser) {
        setModalMode('profile');
      } else {
        setModalMode('auth');
      }
      return;
    }
    if (target === 'delivery' && currentUser?.role !== 'agent') {
      setView('delivery');
      if (!currentUser) setModalMode('auth');
      return;
    }
    if (target === 'merchant' && currentUser?.role !== 'merchant' && currentUser?.role !== 'admin') {
      setView('merchant');
      if (!currentUser) setModalMode('auth');
      return;
    }
    if (target === 'admin' && currentUser?.role !== 'admin') {
      setView('admin');
      if (!currentUser) setModalMode('auth');
      return;
    }
    setView(target);
  };

  const handleAuthenticated = async (user: PublicUser) => {
    setCurrentUser(user);
    if (user.mustChangePassword) {
      setModalMode('force-password');
    } else {
      setModalMode(null);
    }
    await refreshPublicAndUserData(user);

    if (user.role === 'agent') setView('delivery');
    else if (user.role === 'merchant') setView('merchant');
    else if (user.role === 'admin') setView('admin');
    else if (view === 'hero') setView('storefront');
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    setAuthToken(null);
    setCurrentUser(null);
    setOrders([]);
    setSubscriptions([]);
    setView('hero');
  };

  // Full-Viewport WebGL2 Hero View (Preserved cleanly)
  if (view === 'hero') {
    return (
      <>
        <WaterRippleHero currentUser={currentUser} onNavigate={handleHeroNavigate} />
        {modalMode && (
          <AuthAndProfileModal
            mode={modalMode}
            currentUser={currentUser}
            onClose={() => setModalMode(null)}
            onAuthenticated={handleAuthenticated}
            onProfileUpdated={(u) => setCurrentUser(u)}
          />
        )}
      </>
    );
  }

  // Inner Architectural Luxury Editorial & Operations Shell
  return (
    <div className="min-h-screen inner-atmosphere text-[#f3efe8] flex flex-col">
      {/* Classic 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-[#060d14]/82 backdrop-blur-xl border-b border-[#e4cca2]/16">
        <div className="max-w-7xl mx-auto px-6 md:px-10 h-18 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line editorial serif wordmark */}
          <button
            type="button"
            onClick={() => setView('hero')}
            className="font-editorial text-2xl text-[#f8f5ef] tracking-wide whitespace-nowrap shrink-0 cursor-pointer hover:text-[#e7c68b] transition-colors"
          >
            PureRoute
          </button>

          {/* Zone 2: Clean single-line text navigation links with classic brass underline */}
          <nav aria-label="Workspace Navigation" className="hidden md:flex items-center gap-8 text-[13px] tracking-[0.04em]">
            {(
              [
                {
                  id: 'storefront',
                  label: 'Storefront',
                  active: view === 'storefront' || view === 'subscriptions' || view === 'orders',
                },
                { id: 'delivery', label: 'Delivery Portal', active: view === 'delivery' },
                { id: 'merchant', label: 'Farm Partner', active: view === 'merchant' },
                { id: 'admin', label: 'Operations', active: view === 'admin' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={`py-2 border-b transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  item.active
                    ? 'text-[#f8f5ef] border-[#d8b06c] font-medium'
                    : 'text-[#a5b0ba] border-transparent hover:text-[#f8f5ef]'
                }`}
              >
                {item.label}
              </button>
            ))}
            <a
              href="/api-docs"
              target="_blank"
              rel="noreferrer"
              className="py-2 border-b border-transparent text-[#a5b0ba] hover:text-[#f8f5ef] transition-colors whitespace-nowrap shrink-0"
            >
              API Docs
            </a>
          </nav>

          {/* Zone 3: Single primary account control */}
          <div className="flex items-center gap-3 shrink-0">
            {currentUser ? (
              <>
                <button
                  type="button"
                  onClick={() => setModalMode('profile')}
                  className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-sm btn-outline-classic text-xs cursor-pointer whitespace-nowrap"
                >
                  <img
                    src={resolveAvatarSrc(currentUser.avatarUrl)}
                    alt={currentUser.name}
                    className="w-6 h-6 rounded-full object-cover border border-[#e4cca2]/35"
                  />
                  <span className="max-w-[115px] truncate">{currentUser.name}</span>
                  <UserCog className="w-3.5 h-3.5 text-[#d8b06c]" />
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  aria-label="Sign Out"
                  className="p-2 rounded-sm text-[#9aa4ae] hover:text-[#f8f5ef] hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setModalMode('auth')}
                className="px-5 py-2.5 rounded-sm btn-brass text-xs uppercase tracking-[0.12em] whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Compact Navigation Rail */}
      <div className="md:hidden border-b border-[#e4cca2]/14 bg-[#060d14]/90 px-5 py-2.5 flex items-center gap-5 overflow-x-auto text-xs text-[#a5b0ba]">
        {(
          [
            { id: 'storefront', label: 'Storefront' },
            { id: 'delivery', label: 'Delivery' },
            { id: 'merchant', label: 'Farm' },
            { id: 'admin', label: 'Admin' },
          ] as const
        ).map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            className={`whitespace-nowrap pb-0.5 border-b ${
              view === v.id ? 'text-[#f8f5ef] border-[#d8b06c]' : 'border-transparent'
            }`}
          >
            {v.label}
          </button>
        ))}
        <a href="/api-docs" target="_blank" rel="noreferrer" className="whitespace-nowrap">
          Swagger
        </a>
      </div>

      {/* Active Portal Main Content */}
      <main className="flex-1">
        {(view === 'storefront' || view === 'subscriptions' || view === 'orders') && (
          <StorefrontAndCustomerPortal
            currentUser={currentUser}
            products={products}
            orders={orders}
            subscriptions={subscriptions}
            reviews={reviews}
            initialSection={
              view === 'subscriptions' ? 'subscriptions' : view === 'orders' ? 'orders' : 'products'
            }
            onRequireAuth={() => setModalMode('auth')}
            onRefreshData={() => refreshPublicAndUserData()}
            onOpenWriteReview={(productId, orderId) => {
              if (!currentUser) {
                setModalMode('auth');
                return;
              }
              const prod = products.find((p) => p.id === productId) || null;
              setFeedbackModal({
                mode: 'direct',
                pendingOrder: null,
                directProduct: prod,
                directOrderId: orderId,
              });
            }}
          />
        )}

        {view === 'delivery' &&
          (currentUser?.role === 'agent' ? (
            <DeliveryAgentPortal
              currentUser={currentUser}
              onUserUpdated={(u) => setCurrentUser(u)}
            />
          ) : (
            <ClassicRoleGate
              chapter="Hyderabad Fleet · Dispatch Protocol"
              title="Delivery Agent Field Portal"
              subtitle="Strict FIFO active-agent dispatch, privacy-masked lot manifests, live OpenStreetMap route telemetry, universal 6-digit OTP verification, and dynamic UPI QR / store-cash settlement."
              pillars={[
                {
                  num: '01.',
                  heading: 'FIFO Queue & 2–5 Minute Acceptance Window',
                  detail: 'Your 60-second heartbeat maintains your queue rank. Declined or expired offers rotate cleanly to the next online agent.',
                },
                {
                  num: '02.',
                  heading: 'Privacy-Masked Sealed Crate Manifests',
                  detail: 'Only numeric Product IDs and quantities are shown to protect customer privacy from Madhapur Hub to doorstep.',
                },
                {
                  num: '03.',
                  heading: 'Universal OTP & Store Cash Lockout Governance',
                  detail: 'Every PREPAID and COD drop requires the customer’s 6-digit OTP, with instant UPI QR or audited Madhapur cash-deposit clearance.',
                },
              ]}
              credentialHint="ravi.agent@pureroute.in / AgentHyd@2026 (or register via 2-Step Brevo Verification)"
              ctaLabel="Sign In or Register as Delivery Agent"
              onSignIn={() => setModalMode('auth')}
            />
          ))}

        {view === 'merchant' &&
          (currentUser?.role === 'merchant' || currentUser?.role === 'admin' ? (
            <MerchantPortal
              currentUser={currentUser}
              onCatalogUpdated={() => refreshPublicAndUserData()}
            />
          ) : (
            <ClassicRoleGate
              chapter="Telangana Pasture Network · Provenance"
              title="Local Dairy Farm Partner Portal"
              subtitle="Publish single-origin morning harvests with certified Fat and SNF assays, manage cold-chain glass-bottle inventory, and prepare incoming Madhapur Hub orders."
              pillars={[
                {
                  num: '01.',
                  heading: 'Batch Assay & Harvest Transparency',
                  detail: 'Record milking time, chilling temperature, and laboratory Fat/SNF percentages directly on each lot.',
                },
                {
                  num: '02.',
                  heading: 'Real-Time Storefront Inventory Sync',
                  detail: 'Replenish bottle allocations in real time so Hyderabad households always see verified morning stock.',
                },
                {
                  num: '03.',
                  heading: 'Hub Crate Preparation Queue',
                  detail: 'Monitor incoming Morning (05:30–07:30 AM) and Evening (05:00–07:00 PM) orders slated for dispatch.',
                },
              ]}
              credentialHint="srinivas.farm@pureroute.in / FarmFresh@2026 (Deccan Meadows Heritage Dairy)"
              ctaLabel="Sign In to Farm Partner Portal"
              onSignIn={() => setModalMode('auth')}
            />
          ))}

        {view === 'admin' &&
          (currentUser?.role === 'admin' ? (
            <AdminConsole />
          ) : (
            <ClassicRoleGate
              chapter="Madhapur Dairy Hub · 500081"
              title="Operations & Settlement Command"
              subtitle="Orchestrate end-to-end order processing, supervise live ACTIVE vs. INACTIVE FIFO agent queues, reassign deliveries manually, and audit UPI QR & store-cash settlements."
              pillars={[
                {
                  num: '01.',
                  heading: 'One-Click Process & FIFO Auto-Dispatch',
                  detail: 'Transitioning PROCESSING orders to PROCESSED notifies the customer via Brevo HTTPS API and dispatches FIFO Rank #1 immediately.',
                },
                {
                  num: '02.',
                  heading: 'Manual Override & Configurable 2–5 Min Timer',
                  detail: 'Remove any pending assignment or route orders to a specific unlocked active agent with full countdown oversight.',
                },
                {
                  num: '03.',
                  heading: 'UPI QR Confirmation & Cash-Lock Clearance',
                  detail: 'Verify incoming UPI QR receipts and clear agent store-cash deposit lockouts once cash is reconciled at Madhapur Hub.',
                },
              ]}
              credentialHint="admin@pureroute.in / AdminHyd@2026"
              ctaLabel="Sign In to Operations Command"
              onSignIn={() => setModalMode('auth')}
            />
          ))}
      </main>

      {/* Quiet Classic Architectural Footer */}
      <footer className="border-t border-[#e4cca2]/14 py-7 px-6 md:px-10 text-xs text-[#7d8892]">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-editorial text-sm text-[#e4cca2]">PureRoute</span>
            <span aria-hidden="true">·</span>
            <span>LocalMilkforYou · Hitech City / Madhapur Dairy Hub, Hyderabad, Telangana 500081</span>
          </div>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => setView('hero')}
              className="hover:text-[#f3efe8] transition-colors cursor-pointer"
            >
              Return to Dawn Hero
            </button>
            <a href="/api-docs" target="_blank" rel="noreferrer" className="hover:text-[#f3efe8] transition-colors">
              OpenAPI 3.0 Swagger
            </a>
          </div>
        </div>
      </footer>

      {modalMode && (
        <AuthAndProfileModal
          mode={modalMode}
          currentUser={currentUser}
          onClose={() => setModalMode(null)}
          onAuthenticated={handleAuthenticated}
          onProfileUpdated={(u) => setCurrentUser(u)}
        />
      )}

      {feedbackModal && (
        <FeedbackReminderModal
          mode={feedbackModal.mode}
          pendingOrder={feedbackModal.pendingOrder}
          directProduct={feedbackModal.directProduct}
          directOrderId={feedbackModal.directOrderId}
          onClose={() => setFeedbackModal(null)}
          onSubmitted={() => refreshPublicAndUserData()}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <PureRouteShell />
    </AppErrorBoundary>
  );
}
