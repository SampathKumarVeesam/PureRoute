import type {
  AgentMaskedOrder,
  DairyProduct,
  EmailDispatchLog,
  GenderOption,
  MilkSubscription,
  OrderRecord,
  ProductReview,
  PublicUser,
  UserRole,
} from '../types/domain';

let authToken: string | null =
  typeof window !== 'undefined'
    ? sessionStorage.getItem('pureroute_jwt') || localStorage.getItem('pureroute_jwt')
    : null;

export function setAuthToken(token: string | null) {
  authToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      sessionStorage.setItem('pureroute_jwt', token);
      localStorage.setItem('pureroute_jwt', token);
    } else {
      sessionStorage.removeItem('pureroute_jwt');
      localStorage.removeItem('pureroute_jwt');
    }
  }
}

export function getAuthToken(): string | null {
  return authToken;
}

function getBaseUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  if (
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    return 'https://pureroute.onrender.com';
  }
  return '';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  const baseUrl = getBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = path.startsWith('http') ? path : baseUrl ? `${baseUrl}${cleanPath}` : cleanPath;

  const res = await fetch(url, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      setAuthToken(null);
    }
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  // Auth & Profile
  login: (email: string, password: string) =>
    request<{ token: string; user: PublicUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (payload: {
    name: string;
    email: string;
    password?: string;
    phone: string;
    gender: GenderOption;
    role: UserRole;
    avatarUrl: string;
    address: string;
    pinCode: string;
    farmName?: string;
  }) =>
    request<{
      token?: string;
      user: PublicUser;
      message?: string;
      requiresEmailVerification?: boolean;
      verificationToken?: string;
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  verifyAgentEmail: (token: string) =>
    request<{ message: string; email: string; tempPasswordPreview: string }>(
      `/api/auth/verify-email?token=${encodeURIComponent(token)}`
    ),

  googleLogin: (payload: { email: string; name: string; avatarUrl?: string; googleId?: string }) =>
    request<{ token: string; user: PublicUser }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getDbHealth: () =>
    request<{
      status: 'connected' | 'connecting' | 'disconnected';
      database: string;
      host: string;
      collections?: { name: string; count: number }[];
      latencyMs?: number;
      error?: string;
    }>('/api/db/health'),

  saveFeedbackPreferences: (dontAskAgain: boolean) =>
    request<{ success: boolean }>('/api/feedback/preferences', {
      method: 'POST',
      body: JSON.stringify({ dontAskAgain }),
    }),

  logout: () => request<{ message: string }>('/api/auth/logout', { method: 'POST' }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string; user: PublicUser }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  forgotPassword: (email: string) =>
    request<{ message: string; email: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (payload: { email: string; otp: string; newPassword: string }) =>
    request<{ message: string; token: string; user: PublicUser }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getProfile: () => request<PublicUser>('/api/profile'),

  updateProfile: (payload: {
    name?: string;
    phone?: string;
    gender?: GenderOption;
    avatarUrl?: string;
    address?: string;
    pinCode?: string;
  }) =>
    request<PublicUser>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('avatar', file);
    return request<{ avatarUrl: string; user: PublicUser }>('/api/upload/avatar', {
      method: 'POST',
      body: form,
    });
  },

  // Catalog & Customer
  getProducts: () => request<DairyProduct[]>('/api/products'),
  getOrders: () => request<OrderRecord[]>('/api/orders'),
  createOrder: (payload: {
    items: { productId: number; quantity: number }[];
    deliveryAddress: string;
    pinCode: string;
    lat: number;
    lng: number;
    deliverySlot: string;
    paymentMethod: 'PREPAID' | 'COD';
    isSubscription?: boolean;
    subscriptionFrequency?: string;
  }) =>
    request<OrderRecord>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSubscriptions: () => request<MilkSubscription[]>('/api/subscriptions'),
  createSubscription: (payload: {
    productId: number;
    quantity: number;
    slot: string;
    frequency: string;
  }) =>
    request<MilkSubscription>('/api/subscriptions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  toggleSubscription: (id: string) =>
    request<MilkSubscription>(`/api/subscriptions/${id}/toggle`, { method: 'PATCH' }),

  // Merchant Portal
  getMerchantProducts: () => request<DairyProduct[]>('/api/merchant/products'),
  createMerchantProduct: (payload: {
    name: string;
    category: string;
    unit: string;
    priceInr: number;
    fatPercent: number;
    snfPercent: number;
    harvestNote: string;
    stockQty: number;
    description: string;
    supportsSubscription: boolean;
  }) =>
    request<DairyProduct>('/api/merchant/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateMerchantStock: (id: number, stockQty: number, harvestNote?: string) =>
    request<DairyProduct>(`/api/merchant/products/${id}/stock`, {
      method: 'PATCH',
      body: JSON.stringify({ stockQty, harvestNote }),
    }),
  getMerchantOrders: () => request<OrderRecord[]>('/api/merchant/orders'),

  // Delivery Agent Portal
  agentHeartbeat: (coords?: { lat: number; lng: number }) =>
    request<{
      isLoggedIn: boolean;
      lastActiveAt: string;
      fifoQueueRank: number | null;
      hasPendingCashDeposit: boolean;
      pendingCashAmount: number;
      walletBalance: number;
    }>('/api/agent/heartbeat', {
      method: 'POST',
      body: JSON.stringify(coords || {}),
    }),
  getAgentOrders: () =>
    request<{
      agent: PublicUser;
      fifoQueueRank: number | null;
      totalActiveQueue: number;
      orders: AgentMaskedOrder[];
    }>('/api/agent/orders'),
  agentAcceptOrder: (id: string) =>
    request<{ message: string; order: AgentMaskedOrder }>(`/api/agent/orders/${id}/accept`, {
      method: 'POST',
    }),
  agentRejectOrder: (id: string) =>
    request<{ message: string }>(`/api/agent/orders/${id}/reject`, {
      method: 'POST',
    }),
  agentUpdateLocation: (id: string, lat: number, lng: number) =>
    request<{ agentLiveCoordinates: { lat: number; lng: number } }>(`/api/agent/orders/${id}/location`, {
      method: 'PATCH',
      body: JSON.stringify({ lat, lng }),
    }),
  agentGenerateUpiQr: (id: string) =>
    request<{ upiUri: string; upiQrDataUrl: string; amountInr: number }>(`/api/agent/orders/${id}/upi-qr`, {
      method: 'POST',
    }),
  agentCompleteOrder: (id: string, otp: string, codMethod?: 'UPI_QR' | 'CASH') =>
    request<{ message: string; order: AgentMaskedOrder; agent: PublicUser }>(
      `/api/agent/orders/${id}/complete`,
      {
        method: 'POST',
        body: JSON.stringify({ otp, codMethod }),
      }
    ),
  agentMarkCashDeposited: (id: string) =>
    request<{ message: string; order: AgentMaskedOrder }>(`/api/agent/orders/${id}/cash-deposited`, {
      method: 'POST',
    }),

  // Admin Console
  getAdminOverview: () =>
    request<{
      settings: { fifoOfferMinutes: number };
      orders: OrderRecord[];
      agents: (PublicUser & {
        presenceStatus: 'ACTIVE' | 'INACTIVE';
        fifoQueueRank: number | null;
        isEligibleForDispatch: boolean;
      })[];
      merchants: PublicUser[];
      emailLogs: EmailDispatchLog[];
      stats: {
        totalOrders: number;
        processingCount: number;
        outForDeliveryCount: number;
        activeAgentsCount: number;
        cashLockedAgentsCount: number;
        pendingQrConfirmCount: number;
      };
    }>('/api/admin/overview'),
  setFifoMinutes: (minutes: number) =>
    request<{ fifoOfferMinutes: number }>('/api/admin/settings/fifo-minutes', {
      method: 'PATCH',
      body: JSON.stringify({ minutes }),
    }),
  adminProcessOrder: (id: string) =>
    request<{ message: string; order: OrderRecord }>(`/api/admin/orders/${id}/process`, {
      method: 'POST',
    }),
  adminReassignOrder: (id: string, agentId: string | null) =>
    request<{ message: string; order: OrderRecord }>(`/api/admin/orders/${id}/reassign`, {
      method: 'POST',
      body: JSON.stringify({ agentId }),
    }),
  adminConfirmQr: (id: string) =>
    request<{ message: string; order: OrderRecord }>(`/api/admin/orders/${id}/confirm-qr`, {
      method: 'POST',
    }),
  adminRequestCashDeposit: (id: string) =>
    request<{ message: string; order: OrderRecord }>(`/api/admin/orders/${id}/request-cash-deposit`, {
      method: 'POST',
    }),
  adminConfirmCashDeposit: (id: string) =>
    request<{ message: string; order: OrderRecord }>(`/api/admin/orders/${id}/confirm-cash-deposit`, {
      method: 'POST',
    }),
  adminVerifyMerchant: (id: string) =>
    request<{ message: string; merchant: PublicUser }>(`/api/admin/merchants/${id}/verify`, {
      method: 'POST',
    }),

  // Feedback & Outbox
  getReviews: () => request<ProductReview[]>('/api/feedback'),
  getPendingFeedback: () => request<{ pendingOrder: OrderRecord | null }>('/api/feedback/pending'),
  dismissFeedback: (orderId: string, dontAskAgain: boolean) =>
    request<{ message: string }>('/api/feedback/dismiss', {
      method: 'POST',
      body: JSON.stringify({ orderId, dontAskAgain }),
    }),
  submitFeedback: (payload: { orderId: string; productId: number; rating: number; comment: string }) =>
    request<ProductReview>('/api/feedback', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getOutbox: () => request<EmailDispatchLog[]>('/api/outbox'),
};
