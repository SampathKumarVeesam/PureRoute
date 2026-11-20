export type UserRole = 'customer' | 'merchant' | 'agent' | 'admin';

export type GenderOption = 'Male' | 'Female' | 'Non-Binary' | 'Prefer not to say';

export type DeliverySlot = 'Morning (05:30 - 07:30 AM)' | 'Evening (05:00 - 07:00 PM)';

export type PaymentMethod = 'PREPAID' | 'COD';

export type OrderStatus =
  | 'PROCESSING'
  | 'PROCESSED'
  | 'AWAITING_AGENT_ACCEPTANCE'
  | 'OUT_FOR_DELIVERY'
  | 'COD_QR_PENDING_ADMIN'
  | 'DELIVERED'
  | 'CANCELLED';

export type CashDepositStatus =
  | 'NONE'
  | 'PENDING_ADMIN_REQUEST'
  | 'DEPOSIT_REQUESTED'
  | 'AGENT_DEPOSITED'
  | 'CONFIRMED';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface UserRecord {
  id: string;
  googleId?: string;
  email: string;
  passwordHash: string;
  name: string;
  phone: string; // Strictly +91XXXXXXXXXX
  gender: GenderOption;
  avatarUrl: string; // Preset avatar ID or base64 data:image/jpeg|png URI
  role: UserRole;
  address: string;
  pinCode: string; // Hyderabad 500xxx
  coordinates: Coordinates;
  // Email verification & 2-step agent onboarding
  isEmailVerified: boolean;
  emailVerificationToken?: string | null;
  mustChangePassword: boolean;
  // Merchant fields
  farmName?: string;
  merchantVerified?: boolean;
  // Delivery Agent FIFO & Settlement fields
  isLoggedIn: boolean;
  lastActiveAt: string | null;
  fifoQueueJoinedAt: string | null;
  hasPendingCashDeposit: boolean;
  pendingCashAmount: number;
  walletBalance: number;
  completedDeliveries: number;
  currentCoordinates?: Coordinates;
  createdAt: string;
  updatedAt: string;
}

export type PublicUser = Omit<UserRecord, 'passwordHash' | 'emailVerificationToken'>;

export interface DairyProduct {
  id: number; // Numeric Product ID (#101, #102...) for privacy-masked agent display
  merchantId: string;
  merchantName: string;
  name: string;
  category: 'Buffalo Milk' | 'A2 Cow Milk' | 'Curd & Paneer' | 'Ghee & Buttermilk';
  unit: string;
  priceInr: number;
  fatPercent: number;
  snfPercent: number;
  freshnessTimestamp: string;
  harvestNote: string;
  stockQty: number;
  imageUrl: string;
  description: string;
  supportsSubscription: boolean;
  ratingAvg: number;
  reviewCount: number;
}

export interface OrderItem {
  productId: number;
  productName: string;
  unit: string;
  quantity: number;
  priceInr: number;
  imageUrl: string;
}

export interface OrderRecord {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryAddress: string;
  pinCode: string;
  deliveryCoordinates: Coordinates;
  deliverySlot: DeliverySlot;
  isSubscription: boolean;
  subscriptionFrequency?: 'Daily' | 'Alternate Days' | 'Weekdays';
  items: OrderItem[];
  subtotalInr: number;
  deliveryFeeInr: number;
  totalInr: number;
  paymentMethod: PaymentMethod;
  paymentStatus: 'PAID' | 'PENDING_COD' | 'QR_PAID_AWAITING_ADMIN' | 'CASH_COLLECTED';
  status: OrderStatus;
  // FIFO Assignment & Countdown
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  assignedAgentPhone: string | null;
  offerAssignedAt: string | null;
  offerExpiresAt: string | null;
  offerDurationMinutes: number;
  rejectedAgentIds: string[];
  // Live Tracking & Universal OTP
  deliveryOtp: string | null;
  otpVerifiedAt: string | null;
  agentLiveCoordinates: Coordinates;
  // COD UPI QR & Cash Store Deposit Lockout
  codMethodUsed?: 'UPI_QR' | 'CASH' | null;
  upiQrPayload?: string | null;
  upiQrDataUrl?: string | null;
  cashDepositStatus: CashDepositStatus;
  // Feedback Reminder Loop
  deliveredAt: string | null;
  feedbackSubmitted: boolean;
  feedbackDontAskAgain: boolean;
  lastFeedbackPromptAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Privacy-masked order returned strictly to Delivery Agents (NO product names, descriptions, or images!)
export interface AgentMaskedOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  pinCode: string;
  deliveryCoordinates: Coordinates;
  deliverySlot: DeliverySlot;
  maskedItems: { productId: number; quantity: number }[];
  totalInr: number;
  deliveryFeeInr: number;
  paymentMethod: PaymentMethod;
  paymentStatus: OrderRecord['paymentStatus'];
  status: OrderStatus;
  offerAssignedAt: string | null;
  offerExpiresAt: string | null;
  agentLiveCoordinates: Coordinates;
  codMethodUsed?: 'UPI_QR' | 'CASH' | null;
  upiQrDataUrl?: string | null;
  cashDepositStatus: CashDepositStatus;
  otpVerifiedAt: string | null;
  createdAt: string;
}

export interface ProductReview {
  id: string;
  orderId: string;
  productId: number;
  customerId: string;
  customerName: string;
  customerAvatarUrl: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface MilkSubscription {
  id: string;
  customerId: string;
  productId: number;
  productName: string;
  unit: string;
  quantity: number;
  priceInr: number;
  slot: DeliverySlot;
  frequency: 'Daily' | 'Alternate Days' | 'Weekdays';
  status: 'ACTIVE' | 'PAUSED';
  nextDeliveryDate: string;
  createdAt: string;
}

export interface EmailDispatchLog {
  id: string;
  toEmail: string;
  toName: string;
  subject: string;
  htmlContent: string;
  provider: 'BREVO_LIVE' | 'BREVO_SANDBOX_OUTBOX';
  statusCode: number;
  sentAt: string;
  meta?: Record<string, string>;
}

export const HYDERABAD_HUB = {
  name: 'Hitech City / Madhapur Dairy Hub',
  address: 'Plot 42, Image Gardens Road, Madhapur, Hitech City, Hyderabad, Telangana 500081',
  pinCode: '500081',
  lat: 17.4486,
  lng: 78.3908,
} as const;

export const HYDERABAD_AREAS = [
  { label: 'Madhapur / Hitech City', pinCode: '500081', lat: 17.4486, lng: 78.3908 },
  { label: 'Jubilee Hills Road No. 36', pinCode: '500033', lat: 17.4319, lng: 78.4071 },
  { label: 'Banjara Hills Road No. 12', pinCode: '500034', lat: 17.4126, lng: 78.4398 },
  { label: 'Gachibowli Financial District', pinCode: '500032', lat: 17.4401, lng: 78.3489 },
  { label: 'Kondapur Botanical Garden Rd', pinCode: '500084', lat: 17.4622, lng: 78.3568 },
  { label: 'Begumpet Greenlands', pinCode: '500016', lat: 17.4399, lng: 78.4608 },
] as const;

export function formatIndianPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const ten = digits.length >= 10 ? digits.slice(-10) : digits;
  return `+91${ten}`;
}

export function isValidIndianPhone(phone: string): boolean {
  return /^\+91[6-9]\d{9}$/.test(phone);
}

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}
