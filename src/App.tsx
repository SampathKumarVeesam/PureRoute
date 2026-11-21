import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Sparkles,
  UserCog,
} from 'lucide-react';
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
  UserRole,
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
  defaultEmail?: string;
  defaultPassword?: string;
  onSignIn: () => void;
  onRegister?: () => void;
  onForgotPassword?: (email?: string) => void;
  onAuthenticated?: (user: PublicUser) => void;
}

const ClassicRoleGate: React.FC<RoleGateProps> = ({
  chapter,
  title,
  subtitle,
  pillars,
  credentialHint,
  ctaLabel,
  defaultEmail = '',
  defaultPassword = '',
  onSignIn,
  onRegister,
  onForgotPassword,
  onAuthenticated,
}) => {
  const [isRolledDown, setIsRolledDown] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState(defaultPassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formCardRef = useRef<HTMLDivElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  const handleToggleRollDown = () => {
    setIsRolledDown((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => {
          formCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          emailInputRef.current?.focus();
        }, 100);
      }
      return next;
    });
  };

  const handleInlineSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api.login(email, password);
      setAuthToken(res.token);
      if (onAuthenticated) {
        onAuthenticated(res.user);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setBusy(false);
    }
  };

  const handleFillDemo = () => {
    setEmail(defaultEmail);
    setPassword(defaultPassword);
    setError(null);
  };

  return (
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

        <div ref={formCardRef} className="lg:col-span-5 glass-panel rounded-md p-8 flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#d8b06c]">Authorized Portal Access</p>
              {isRolledDown && (
                <span className="text-[10px] uppercase tracking-wider text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-sm">
                  Sign In Form Active
                </span>
              )}
            </div>
            <h2 className="font-editorial text-2xl text-white">Sign In to Continue</h2>
            <p className="text-sm text-[#aeb7c0] leading-relaxed">
              Access requires verified PureRoute credentials. Click below to roll down the instant sign-in form or fill demo credentials.
            </p>
            <div className="pt-3 border-t border-[#e4cca2]/15 space-y-1.5">
              <span className="block text-[11px] uppercase tracking-[0.16em] text-[#9aa4ae]">
                Seeded Hyderabad Account
              </span>
              <p className="font-mono-tabular text-xs text-[#f3efe8] select-all">{credentialHint}</p>
            </div>
          </div>

          {/* Roll Down Sign In Toggle Button */}
          <button
            type="button"
            onClick={handleToggleRollDown}
            className="w-full inline-flex items-center justify-between px-5 py-3.5 rounded-sm btn-brass text-xs uppercase tracking-[0.14em] cursor-pointer transition-all"
          >
            <span>{isRolledDown ? 'Hide Sign In Form' : ctaLabel}</span>
            {isRolledDown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {/* Rolled Down Sign In Form with Smooth CSS Transition */}
          <div
            className={`transition-all duration-500 ease-in-out overflow-hidden ${
              isRolledDown ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
            }`}
          >
            <form onSubmit={handleInlineSignIn} className="pt-4 border-t border-[#e4cca2]/15 space-y-3.5">
              {error && (
                <div className="rounded-sm bg-rose-500/15 border border-rose-400/40 p-2.5 text-xs text-rose-200">
                  {error}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] uppercase tracking-[0.12em] text-[#a5b0ba]">Account Email</label>
                  {defaultEmail && (
                    <button
                      type="button"
                      onClick={handleFillDemo}
                      className="text-[10px] text-[#d8b06c] hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      Quick Fill Demo
                    </button>
                  )}
                </div>
                <input
                  ref={emailInputRef}
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@pureroute.in"
                  className="w-full rounded-sm classic-input px-3.5 py-2.5 text-xs font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] uppercase tracking-[0.12em] text-[#a5b0ba]">Password</label>
                  <button
                    type="button"
                    onClick={() => (onForgotPassword ? onForgotPassword(email) : onSignIn())}
                    className="text-[10px] text-[#d8b06c] hover:underline cursor-pointer"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-sm classic-input pl-3.5 pr-10 py-2.5 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9aa4ae] hover:text-[#d8b06c] p-1 cursor-pointer transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-sm btn-brass text-xs uppercase tracking-[0.14em] cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{busy ? 'Authenticating...' : 'Sign In to Portal'}</span>
              </button>

              <div className="pt-2 flex items-center justify-center gap-3 text-[11px] text-[#8e9ba6]">
                <button
                  type="button"
                  onClick={onSignIn}
                  className="hover:text-[#d8b06c] transition-colors underline cursor-pointer"
                >
                  Open Sign In Sheet
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={onRegister || onSignIn}
                  className="hover:text-[#d8b06c] transition-colors underline cursor-pointer"
                >
                  Register New Account
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
};

function PureRouteShell() {
  const [view, setView] = useState<ActiveView>('hero');
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [products, setProducts] = useState<DairyProduct[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [subscriptions, setSubscriptions] = useState<MilkSubscription[]>([]);
  const [reviews, setReviews] = useState<ProductReview[]>([]);

  // Modals
  const [modalMode, setModalMode] = useState<'auth' | 'profile' | 'force-password' | null>(null);
  const [authInitialTab, setAuthInitialTab] = useState<'signin' | 'register' | 'forgot-password' | 'reset-password'>('signin');
  const [authInitialRole, setAuthInitialRole] = useState<UserRole>('customer');

  const openAuthModal = (
    tab: 'signin' | 'register' | 'forgot-password' | 'reset-password' = 'signin',
    role: UserRole = 'customer'
  ) => {
    setAuthInitialTab(tab);
    setAuthInitialRole(role);
    setModalMode('auth');
  };

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

      // Handle direct verification link (?verifyToken=...)
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const verifyToken = urlParams.get('verifyToken');
        if (verifyToken) {
          window.history.replaceState({}, '', window.location.pathname);
          await api.verifyAgentEmail(verifyToken);
          openAuthModal('signin', 'agent');
        }
      } catch (err) {
        console.warn('Agent verify token error:', err);
      }

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
    target: 'storefront' | 'subscriptions' | 'delivery' | 'merchant' | 'admin' | 'auth' | 'register'
  ) => {
    if (target === 'auth') {
      if (currentUser) {
        setModalMode('profile');
      } else {
        openAuthModal('signin', 'customer');
      }
      return;
    }
    if (target === 'register') {
      if (currentUser) {
        setModalMode('profile');
      } else {
        openAuthModal('register', 'customer');
      }
      return;
    }
    if (target === 'delivery' && currentUser?.role !== 'agent') {
      setView('delivery');
      if (!currentUser) openAuthModal('signin', 'agent');
      return;
    }
    if (target === 'merchant' && currentUser?.role !== 'merchant' && currentUser?.role !== 'admin') {
      setView('merchant');
      if (!currentUser) openAuthModal('signin', 'merchant');
      return;
    }
    if (target === 'admin' && currentUser?.role !== 'admin') {
      setView('admin');
      if (!currentUser) openAuthModal('signin', 'admin');
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
        <WaterRippleHero currentUser={currentUser} onNavigate={handleHeroNavigate} onLogout={handleLogout} />
        {modalMode && (
          <AuthAndProfileModal
            mode={modalMode}
            currentUser={currentUser}
            initialTab={authInitialTab}
            initialRole={authInitialRole}
            onClose={() => setModalMode(null)}
            onLogout={handleLogout}
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/20 text-rose-200 text-xs uppercase tracking-wider font-medium transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openAuthModal('signin', 'customer')}
                  className="px-4 py-2 rounded-sm btn-brass text-xs uppercase tracking-[0.12em] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => openAuthModal('register', 'customer')}
                  className="px-4 py-2 rounded-sm border border-[#e4cca2]/30 text-[#f8f5ef] hover:border-[#d8b06c] hover:text-[#d8b06c] transition-colors text-xs uppercase tracking-[0.12em] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Register
                </button>
              </div>
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
            onRequireAuth={(tab) => openAuthModal(tab || 'signin', 'customer')}
            onRefreshData={() => refreshPublicAndUserData()}
            onOpenWriteReview={(productId, orderId) => {
              if (!currentUser) {
                openAuthModal('signin', 'customer');
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
              credentialHint="ravi.agent@pureroute.in / AgentHyd@2026 (or register for your instant Temporary Password)"
              ctaLabel="Sign In or Register as Delivery Agent"
              defaultEmail="ravi.agent@pureroute.in"
              defaultPassword="AgentHyd@2026"
              onSignIn={() => openAuthModal('signin', 'agent')}
              onRegister={() => openAuthModal('register', 'agent')}
              onForgotPassword={() => openAuthModal('forgot-password', 'agent')}
              onAuthenticated={(u) => handleAuthenticated(u)}
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
              defaultEmail="srinivas.farm@pureroute.in"
              defaultPassword="FarmFresh@2026"
              onSignIn={() => openAuthModal('signin', 'merchant')}
              onRegister={() => openAuthModal('register', 'merchant')}
              onForgotPassword={() => openAuthModal('forgot-password', 'merchant')}
              onAuthenticated={(u) => handleAuthenticated(u)}
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
                  detail: 'Transitioning PROCESSING orders to PROCESSED notifies the customer via Zoho Mail SMTP and dispatches FIFO Rank #1 immediately.',
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
              defaultEmail="admin@pureroute.in"
              defaultPassword="AdminHyd@2026"
              onSignIn={() => openAuthModal('signin', 'admin')}
              onForgotPassword={() => openAuthModal('forgot-password', 'admin')}
              onAuthenticated={(u) => handleAuthenticated(u)}
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
          initialTab={authInitialTab}
          initialRole={authInitialRole}
          onClose={() => setModalMode(null)}
          onLogout={handleLogout}
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
