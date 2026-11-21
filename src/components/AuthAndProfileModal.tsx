import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  ShieldCheck,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { api, setAuthToken } from '../lib/api';
import { getPresetsByGender, resolveAvatarSrc } from '../lib/avatars';
import {
  HYDERABAD_AREAS,
  formatIndianPhone,
  type GenderOption,
  type PublicUser,
  type UserRole,
} from '../types/domain';

interface AuthModalProps {
  mode: 'auth' | 'profile' | 'force-password';
  initialTab?: 'signin' | 'register';
  initialRole?: UserRole;
  currentUser: PublicUser | null;
  onClose: () => void;
  onLogout?: () => void;
  onAuthenticated: (user: PublicUser) => void;
  onProfileUpdated: (user: PublicUser) => void;
}

const GENDERS: GenderOption[] = ['Male', 'Female', 'Non-Binary', 'Prefer not to say'];

const DEMO_ACCOUNTS = [
  { label: 'Customer · Ananya Reddy', email: 'ananya@pureroute.in', pass: 'PureMilk@2026' },
  { label: 'Farm Partner · Deccan Meadows', email: 'srinivas.farm@pureroute.in', pass: 'FarmFresh@2026' },
  { label: 'Courier #1 · Ravi (FIFO #1)', email: 'ravi.agent@pureroute.in', pass: 'AgentHyd@2026' },
  { label: 'Courier #2 · Priya (Active Route)', email: 'priya.agent@pureroute.in', pass: 'AgentHyd@2026' },
  { label: 'Hub Admin · Madhapur 500081', email: 'admin@pureroute.in', pass: 'AdminHyd@2026' },
];

export const AuthAndProfileModal: React.FC<AuthModalProps> = ({
  mode,
  initialTab,
  initialRole,
  currentUser,
  onClose,
  onLogout,
  onAuthenticated,
  onProfileUpdated,
}) => {
  const [tab, setTab] = useState<'signin' | 'register'>(initialTab || 'signin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [regRole, setRegRole] = useState<UserRole>(initialRole || 'customer');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPhoneDigits, setRegPhoneDigits] = useState('98480');
  const [regGender, setRegGender] = useState<GenderOption>('Female');
  const [regAvatar, setRegAvatar] = useState<string>('preset:female-1');
  const [regAddress, setRegAddress] = useState<string>(HYDERABAD_AREAS[0].label + ', Hyderabad, TG');
  const [regPinCode, setRegPinCode] = useState<string>(HYDERABAD_AREAS[0].pinCode);
  const [regFarmName, setRegFarmName] = useState('');

  const [pendingVerifyToken, setPendingVerifyToken] = useState<string | null>(null);
  const [tempPasswordPreview, setTempPasswordPreview] = useState<string | null>(null);

  const [currPwd, setCurrPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');

  const [profName, setProfName] = useState(currentUser?.name || '');
  const [profPhoneDigits, setProfPhoneDigits] = useState(
    (currentUser?.phone || '+919848011223').replace(/^\+91/, '')
  );
  const [profGender, setProfGender] = useState<GenderOption>(currentUser?.gender || 'Prefer not to say');
  const [profAvatar, setProfAvatar] = useState(currentUser?.avatarUrl || 'preset:neutral-1');
  const [profAddress, setProfAddress] = useState(currentUser?.address || '');
  const [profPinCode, setProfPinCode] = useState(currentUser?.pinCode || '500081');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const regNameInputRef = useRef<HTMLInputElement | null>(null);
  const formSectionRef = useRef<HTMLDivElement | null>(null);
  const roleFieldsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (mode === 'auth') {
      const activeTab = initialTab || 'signin';
      setTab(activeTab);
      if (initialRole) setRegRole(initialRole);
      setError(null);
      setTimeout(() => {
        formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (activeTab === 'signin') {
          emailInputRef.current?.focus();
        } else {
          regNameInputRef.current?.focus();
        }
      }, 100);
    }
  }, [mode, initialTab, initialRole]);

  const handleGenderChange = (g: GenderOption, target: 'register' | 'profile') => {
    const presets = getPresetsByGender(g);
    if (target === 'register') {
      setRegGender(g);
      if (presets[0]) setRegAvatar(presets[0].id);
    } else {
      setProfGender(g);
      if (!profAvatar.startsWith('data:image/') && presets[0]) {
        setProfAvatar(presets[0].id);
      }
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await api.login(loginEmail, loginPassword);
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const email = prompt('Enter your Google Account email for MongoDB sign-in:', 'ananya@pureroute.in');
      if (!email) {
        setBusy(false);
        return;
      }
      const res = await api.googleLogin({
        email: email.trim(),
        name: email.split('@')[0],
        googleId: `google_${Date.now()}`,
      });
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err: any) {
      setError(err?.message || 'Google Sign-In failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setPendingVerifyToken(null);
    setTempPasswordPreview(null);
    setBusy(true);
    try {
      const formattedPhone = formatIndianPhone(regPhoneDigits);
      const res = await api.register({
        name: regName,
        email: regEmail,
        password: regRole === 'agent' ? undefined : regPassword,
        phone: formattedPhone,
        gender: regGender,
        role: regRole,
        avatarUrl: regAvatar,
        address: regAddress,
        pinCode: regPinCode,
        farmName: regRole === 'merchant' ? regFarmName : undefined,
      });

      if (res.requiresEmailVerification && res.verificationToken) {
        setPendingVerifyToken(res.verificationToken);
        setNotice(
          res.message ||
            'Step 1 complete: Verification email dispatched via Brevo HTTPS API. Verify your email below to receive your Temporary Password.'
        );
      } else if (res.token && res.user) {
        setAuthToken(res.token);
        onAuthenticated(res.user);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyAgentNow = async () => {
    if (!pendingVerifyToken) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api.verifyAgentEmail(pendingVerifyToken);
      setTempPasswordPreview(res.tempPasswordPreview);
      setLoginEmail(res.email);
      setLoginPassword(res.tempPasswordPreview);
      setNotice(
        'Step 2 complete: Email verified! Brevo dispatched your Temporary Password. Sign in now to set your permanent password.'
      );
      setPendingVerifyToken(null);
      setTab('signin');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.changePassword(currPwd, newPwd);
      onProfileUpdated(res.user);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const formattedPhone = formatIndianPhone(profPhoneDigits);
      const updated = await api.updateProfile({
        name: profName,
        phone: formattedPhone,
        gender: profGender,
        avatarUrl: profAvatar,
        address: profAddress,
        pinCode: profPinCode,
      });
      onProfileUpdated(updated);
      setNotice('Profile saved and persisted to database.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Only JPG and PNG images are supported.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Image exceeds 2MB size limit.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.uploadAvatar(file);
      setProfAvatar(res.avatarUrl);
      onProfileUpdated(res.user);
      setNotice('Custom JPG/PNG photo uploaded and persisted as validated base64 URI.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto animate-in fade-in duration-300"
    >
      <div className="glass-panel w-full max-w-xl rounded-md p-7 md:p-8 text-[#f3efe8] shadow-2xl my-auto transition-transform duration-300 transform translate-y-0 animate-in slide-in-from-top-6">
        <div className="flex items-start justify-between gap-4 pb-5 border-b border-[#e4cca2]/16">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#d8b06c]">
              PureRoute Hyderabad · Telangana (+91)
            </p>
            <h2 className="mt-1.5 font-editorial text-3xl font-medium text-[#f8f5ef]">
              {mode === 'profile'
                ? 'Account & Portrait Settings'
                : mode === 'force-password'
                  ? 'Set Permanent Password'
                  : tab === 'signin'
                    ? 'Member & Portal Sign In'
                    : 'Register New Account'}
            </h2>
          </div>
          {mode !== 'force-password' && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="p-2 rounded-sm text-[#9aa4ae] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-sm bg-rose-500/12 border border-rose-400/35 px-4 py-3 text-xs text-rose-200">
            {error}
          </div>
        )}

        {notice && (
          <div className="mt-4 rounded-sm bg-emerald-500/12 border border-emerald-400/35 px-4 py-3 text-xs text-emerald-200 space-y-2.5">
            <p>{notice}</p>
            {pendingVerifyToken && (
              <button
                type="button"
                onClick={handleVerifyAgentNow}
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-sm btn-brass text-xs cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Simulate Clicking Brevo Verification Link</span>
              </button>
            )}
            {tempPasswordPreview && (
              <p className="font-mono-tabular text-xs text-[#e7c68b]">
                Brevo Temporary Password: <strong className="text-white select-all">{tempPasswordPreview}</strong> (pre-filled)
              </p>
            )}
          </div>
        )}

        {/* FORCE PASSWORD CHANGE FOR NEWLY VERIFIED AGENTS */}
        {mode === 'force-password' && (
          <form onSubmit={handleChangePassword} className="mt-6 space-y-4">
            <div>
              <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1.5">
                Temporary Password (from Brevo Email)
              </label>
              <input
                type="password"
                required
                value={currPwd}
                onChange={(e) => setCurrPwd(e.target.value)}
                className="w-full rounded-sm classic-input px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1.5">
                New Permanent Password (min 8 characters)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                className="w-full rounded-sm classic-input px-3.5 py-2.5 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 rounded-sm btn-brass text-xs uppercase tracking-[0.12em] py-3 cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
              <span>{busy ? 'Updating...' : 'Save Permanent Password & Enter Portal'}</span>
            </button>
          </form>
        )}

        {/* UNIFIED PROFILE CUSTOMIZATION */}
        {mode === 'profile' && currentUser && (
          <form onSubmit={handleSaveProfile} className="mt-6 space-y-5">
            <div className="flex items-center gap-4 pb-4 border-b border-[#e4cca2]/14">
              <img
                src={resolveAvatarSrc(profAvatar)}
                alt={profName}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-full object-cover border border-[#d8b06c]/50 bg-[#08121c] shrink-0"
              />
              <div className="space-y-2">
                <div className="font-editorial text-xl text-[#f8f5ef]">
                  {currentUser.name}{' '}
                  <span className="font-sans text-xs uppercase tracking-wider text-[#d8b06c]">
                    · {currentUser.role}
                  </span>
                </div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                    className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-sm btn-outline-classic text-xs cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#d8b06c]" />
                    <span>Upload JPG / PNG Photo (Max 2MB)</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={profName}
                  onChange={(e) => setProfName(e.target.value)}
                  className="w-full rounded-sm classic-input px-3.5 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1.5">
                  Phone (India +91)
                </label>
                <div className="flex items-center rounded-sm classic-input overflow-hidden">
                  <span className="px-3 py-2.5 text-xs text-[#d8b06c] border-r border-[#e4cca2]/16 whitespace-nowrap font-mono-tabular">
                    🇮🇳 +91
                  </span>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    pattern="[6-9][0-9]{9}"
                    value={profPhoneDigits}
                    onChange={(e) => setProfPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="9848011223"
                    className="w-full bg-transparent px-3 py-2.5 text-sm text-[#f8f5ef] font-mono-tabular focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1.5">
                Gender (Updates Matching Portrait Presets)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {GENDERS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => handleGenderChange(g, 'profile')}
                    className={`px-3 py-2 rounded-sm text-xs border transition-colors cursor-pointer whitespace-nowrap ${
                      profGender === g
                        ? 'bg-[#d8b06c]/16 border-[#d8b06c] text-[#f8f5ef] font-medium'
                        : 'bg-white/[0.02] border-[#e4cca2]/14 text-[#9aa4ae] hover:text-white'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-2">
                Preset Portraits · {profGender}
              </label>
              <div className="flex items-center gap-3">
                {getPresetsByGender(profGender).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setProfAvatar(preset.id)}
                    className={`flex flex-col items-center gap-1.5 p-2.5 rounded-sm border transition-all cursor-pointer ${
                      profAvatar === preset.id
                        ? 'border-[#d8b06c] bg-[#d8b06c]/14'
                        : 'border-[#e4cca2]/14 bg-white/[0.02] hover:border-[#e4cca2]/35'
                    }`}
                  >
                    <img src={preset.dataUri} alt={preset.label} className="w-12 h-12 rounded-full" />
                    <span className="text-[11px] text-[#c6ced6]">{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1.5">
                  Hyderabad Address
                </label>
                <input
                  type="text"
                  value={profAddress}
                  onChange={(e) => setProfAddress(e.target.value)}
                  className="w-full rounded-sm classic-input px-3.5 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1.5">
                  PIN (500xxx)
                </label>
                <input
                  type="text"
                  maxLength={6}
                  pattern="500[0-9]{3}"
                  value={profPinCode}
                  onChange={(e) => setProfPinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full rounded-sm classic-input px-3.5 py-2.5 text-sm font-mono-tabular"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-4 border-t border-[#e4cca2]/14">
              {onLogout ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLogout();
                  }}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-sm border border-rose-500/40 text-rose-300 hover:bg-rose-500/15 hover:border-rose-400 transition-colors text-xs uppercase tracking-wider cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs text-[#9aa4ae] hover:text-white cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm btn-brass text-xs uppercase tracking-[0.12em] cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{busy ? 'Saving...' : 'Save Profile'}</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* AUTH MODE */}
        {mode === 'auth' && (
          <div ref={formSectionRef} className="mt-5">
            <div className="flex items-center gap-6 border-b border-[#e4cca2]/14">
              <button
                type="button"
                onClick={() => {
                  setTab('signin');
                  setError(null);
                  setTimeout(() => {
                    formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    emailInputRef.current?.focus();
                  }, 50);
                }}
                className={`pb-2.5 text-xs uppercase tracking-[0.14em] border-b-2 transition-colors cursor-pointer ${
                  tab === 'signin'
                    ? 'border-[#d8b06c] text-[#f8f5ef] font-semibold'
                    : 'border-transparent text-[#8f9ba6] hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('register');
                  setError(null);
                  setTimeout(() => {
                    formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    regNameInputRef.current?.focus();
                  }, 50);
                }}
                className={`pb-2.5 text-xs uppercase tracking-[0.14em] border-b-2 transition-colors cursor-pointer ${
                  tab === 'register'
                    ? 'border-[#d8b06c] text-[#f8f5ef] font-semibold'
                    : 'border-transparent text-[#8f9ba6] hover:text-white'
                }`}
              >
                Register Account
              </button>
            </div>

            {tab === 'signin' ? (
              <div className="mt-6 space-y-5">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2.5 rounded-sm bg-[#f8f5ef] text-[#081119] font-semibold text-xs uppercase tracking-[0.1em] py-3 hover:bg-white transition-colors cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-[#0b2a3c]" />
                  <span>Continue with Google OAuth 2.0 / OIDC</span>
                </button>

                <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-[#7d8892]">
                  <div className="h-px flex-1 bg-[#e4cca2]/16" />
                  <span>or email credentials</span>
                  <div className="h-px flex-1 bg-[#e4cca2]/16" />
                </div>

                <form onSubmit={handleSignIn} className="space-y-4">
                  <div>
                    <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1.5">
                      Email Address
                    </label>
                    <input
                      ref={emailInputRef}
                      type="email"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="ananya@pureroute.in"
                      className="w-full rounded-sm classic-input px-3.5 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1.5">
                      Password
                    </label>
                    <input
                      type="password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Enter password"
                      className="w-full rounded-sm classic-input px-3.5 py-2.5 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full flex items-center justify-center gap-2 rounded-sm btn-brass text-xs uppercase tracking-[0.14em] py-3 cursor-pointer"
                  >
                    <Lock className="w-4 h-4" />
                    <span>{busy ? 'Authenticating...' : 'Sign In'}</span>
                  </button>
                </form>

                {/* Seeded Role Directory */}
                <div className="pt-5 border-t border-[#e4cca2]/16">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#d8b06c] mb-3">
                    Quick-Fill Seeded Hyderabad Directory
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {DEMO_ACCOUNTS.map((acc) => (
                      <button
                        key={acc.email}
                        type="button"
                        onClick={() => {
                          setLoginEmail(acc.email);
                          setLoginPassword(acc.pass);
                        }}
                        className="text-left px-3.5 py-2.5 rounded-sm btn-outline-classic cursor-pointer"
                      >
                        <div className="text-xs font-medium text-[#f8f5ef] truncate">{acc.label}</div>
                        <div className="text-[11px] text-[#8f9ba6] font-mono-tabular truncate">{acc.email}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRegister} className="mt-6 space-y-4">
                <div>
                  <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1.5">
                    Account Role
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'customer', label: 'Customer' },
                        { id: 'merchant', label: 'Farm Partner' },
                        { id: 'agent', label: 'Delivery Agent' },
                      ] as const
                    ).map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setRegRole(r.id);
                          setTimeout(() => {
                            roleFieldsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                          }, 50);
                        }}
                        className={`px-3 py-2.5 rounded-sm text-xs border transition-colors cursor-pointer ${
                          regRole === r.id
                            ? 'bg-[#d8b06c]/16 border-[#d8b06c] text-[#f8f5ef] font-medium'
                            : 'bg-white/[0.02] border-[#e4cca2]/14 text-[#9aa4ae] hover:text-white'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div ref={roleFieldsRef}>
                  {regRole === 'agent' && (
                    <p className="text-xs text-[#e7c68b] bg-[#d8b06c]/10 border border-[#d8b06c]/30 rounded-sm px-3.5 py-2.5 leading-relaxed">
                      2-Step Verified Onboarding: Verify your email via Zoho SMTP, receive an auto-generated Temporary Password, then set a permanent password on first sign-in.
                    </p>
                  )}
                  {regRole === 'merchant' && (
                    <p className="text-xs text-[#e7c68b] bg-[#d8b06c]/10 border border-[#d8b06c]/30 rounded-sm px-3.5 py-2.5 leading-relaxed">
                      Farm Partner Portal Access: Register your Telangana dairy farm to publish certified single-origin morning harvests with Fat & SNF percentages.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1">
                      Full Name
                    </label>
                    <input
                      ref={regNameInputRef}
                      type="text"
                      required
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="Meera Krishnan"
                      className="w-full rounded-sm classic-input px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="meera@pureroute.in"
                      className="w-full rounded-sm classic-input px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1">
                      Mobile (+91)
                    </label>
                    <div className="flex items-center rounded-sm classic-input overflow-hidden">
                      <span className="px-2.5 py-2 text-xs text-[#d8b06c] border-r border-[#e4cca2]/16 font-mono-tabular whitespace-nowrap">
                        🇮🇳 +91
                      </span>
                      <input
                        type="tel"
                        required
                        maxLength={10}
                        pattern="[6-9][0-9]{9}"
                        value={regPhoneDigits}
                        onChange={(e) => setRegPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="9848077889"
                        className="w-full bg-transparent px-3 py-2 text-sm text-[#f8f5ef] font-mono-tabular focus:outline-none"
                      />
                    </div>
                  </div>

                  {regRole !== 'agent' ? (
                    <div>
                      <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1">
                        Password
                      </label>
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Min 6 characters"
                        className="w-full rounded-sm classic-input px-3 py-2 text-sm"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1">
                        Hyderabad PIN
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={6}
                        pattern="500[0-9]{3}"
                        value={regPinCode}
                        onChange={(e) => setRegPinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-full rounded-sm classic-input px-3 py-2 text-sm font-mono-tabular"
                      />
                    </div>
                  )}
                </div>

                {regRole === 'merchant' && (
                  <div>
                    <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1">
                      Dairy Farm / Cooperative Name
                    </label>
                    <input
                      type="text"
                      required
                      value={regFarmName}
                      onChange={(e) => setRegFarmName(e.target.value)}
                      placeholder="Shamirpet Heritage Dairy Farm"
                      className="w-full rounded-sm classic-input px-3 py-2 text-sm"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1.5">
                    Gender (Inclusive)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {GENDERS.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => handleGenderChange(g, 'register')}
                        className={`px-2.5 py-2 rounded-sm text-xs border transition-colors cursor-pointer whitespace-nowrap ${
                          regGender === g
                            ? 'bg-[#d8b06c]/16 border-[#d8b06c] text-[#f8f5ef] font-medium'
                            : 'bg-white/[0.02] border-[#e4cca2]/14 text-[#9aa4ae] hover:text-white'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1.5">
                    Matching Preset Portrait ({regGender})
                  </label>
                  <div className="flex items-center gap-3">
                    {getPresetsByGender(regGender).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setRegAvatar(preset.id)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-sm border transition-all cursor-pointer ${
                          regAvatar === preset.id
                            ? 'border-[#d8b06c] bg-[#d8b06c]/14'
                            : 'border-[#e4cca2]/14 bg-white/[0.02] hover:border-[#e4cca2]/35'
                        }`}
                      >
                        <img src={preset.dataUri} alt={preset.label} className="w-11 h-11 rounded-full" />
                        <span className="text-[11px] text-[#c6ced6]">{preset.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1">
                      Hyderabad Street / Locality
                    </label>
                    <input
                      type="text"
                      value={regAddress}
                      onChange={(e) => setRegAddress(e.target.value)}
                      className="w-full rounded-sm classic-input px-3 py-2 text-sm"
                    />
                  </div>
                  {regRole !== 'agent' && (
                    <div>
                      <label className="block text-[11px] uppercase tracking-[0.14em] text-[#a5b0ba] mb-1">
                        PIN (500xxx)
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={6}
                        pattern="500[0-9]{3}"
                        value={regPinCode}
                        onChange={(e) => setRegPinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-full rounded-sm classic-input px-3 py-2 text-sm font-mono-tabular"
                      />
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full flex items-center justify-center gap-2 rounded-sm btn-brass text-xs uppercase tracking-[0.14em] py-3 cursor-pointer"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>
                    {busy
                      ? 'Submitting...'
                      : regRole === 'agent'
                        ? 'Register & Send Brevo Verification Email'
                        : 'Create Account'}
                  </span>
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
