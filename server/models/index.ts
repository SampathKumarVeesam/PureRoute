import mongoose, { Schema, type Document, type Model } from 'mongoose';
import type {
  CashDepositStatus,
  DeliverySlot,
  GenderOption,
  OrderStatus,
  PaymentMethod,
  UserRole,
} from '../../src/types/domain.ts';

// ----------------- Base Transform Helper -----------------
function baseTransform(_doc: any, ret: any) {
  if (ret._id && !ret.id) {
    ret.id = ret._id.toString();
  }
  delete ret._id;
  delete ret.__v;
  if ('passwordHash' in ret) {
    delete ret.passwordHash;
  }
  return ret;
}

const schemaOptions = {
  timestamps: true,
  toJSON: { transform: baseTransform, virtuals: true },
  toObject: { transform: baseTransform, virtuals: true },
};

// ----------------- 1. User Model (collection: 'users') -----------------
export interface IUserDocument extends Document {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  phone: string;
  gender: GenderOption;
  avatarUrl: string;
  role: UserRole;
  address: string;
  pinCode: string;
  coordinates: { lat: number; lng: number };
  currentCoordinates?: { lat: number; lng: number };
  isEmailVerified: boolean;
  emailVerificationToken?: string | null;
  resetPasswordOtp?: string | null;
  resetPasswordExpires?: string | null;
  mustChangePassword: boolean;
  farmName?: string;
  merchantVerified?: boolean;
  isLoggedIn: boolean;
  lastActiveAt?: string;
  fifoQueueJoinedAt?: string | null;
  hasPendingCashDeposit: boolean;
  pendingCashAmount: number;
  walletBalance: number;
  completedDeliveries: number;
  googleId?: string;
  createdAt: string;
  updatedAt: string;
}

const userSchema = new Schema<IUserDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Non-Binary', 'Prefer not to say'],
      default: 'Prefer not to say',
    },
    avatarUrl: { type: String, default: 'preset:neutral-1' },
    role: {
      type: String,
      enum: ['customer', 'merchant', 'agent', 'admin'],
      default: 'customer',
      index: true,
    },
    address: { type: String, default: '' },
    pinCode: { type: String, default: '' },
    coordinates: {
      lat: { type: Number, default: 17.4486 },
      lng: { type: Number, default: 78.3908 },
    },
    currentCoordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
    isEmailVerified: { type: Boolean, default: true },
    emailVerificationToken: { type: String, default: null },
    resetPasswordOtp: { type: String, default: null },
    resetPasswordExpires: { type: String, default: null },
    mustChangePassword: { type: Boolean, default: false },
    farmName: { type: String },
    merchantVerified: { type: Boolean, default: false },
    isLoggedIn: { type: Boolean, default: false },
    lastActiveAt: { type: String },
    fifoQueueJoinedAt: { type: String, default: null },
    hasPendingCashDeposit: { type: Boolean, default: false },
    pendingCashAmount: { type: Number, default: 0 },
    walletBalance: { type: Number, default: 0 },
    completedDeliveries: { type: Number, default: 0 },
    googleId: { type: String },
    createdAt: { type: String },
    updatedAt: { type: String },
  },
  { ...schemaOptions, collection: 'users' }
);

// ----------------- 2. Product Model (collection: 'products') -----------------
export interface IProductDocument extends Document {
  id: number;
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

const productSchema = new Schema<IProductDocument>(
  {
    id: { type: Number, required: true, unique: true, index: true },
    merchantId: { type: String, required: true, index: true },
    merchantName: { type: String, required: true },
    name: { type: String, required: true },
    category: {
      type: String,
      enum: ['Buffalo Milk', 'A2 Cow Milk', 'Curd & Paneer', 'Ghee & Buttermilk'],
      required: true,
    },
    unit: { type: String, required: true },
    priceInr: { type: Number, required: true, min: 0 },
    fatPercent: { type: Number, required: true },
    snfPercent: { type: Number, required: true },
    freshnessTimestamp: { type: String, required: true },
    harvestNote: { type: String, default: '' },
    stockQty: { type: Number, default: 0, min: 0 },
    imageUrl: { type: String, required: true },
    description: { type: String, default: '' },
    supportsSubscription: { type: Boolean, default: true },
    ratingAvg: { type: Number, default: 5.0 },
    reviewCount: { type: Number, default: 0 },
  },
  { ...schemaOptions, collection: 'products' }
);

// ----------------- 3. Order Model (collection: 'orders') -----------------
export interface IOrderDocument extends Document {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryAddress: string;
  pinCode: string;
  deliveryCoordinates: { lat: number; lng: number };
  deliverySlot: DeliverySlot;
  isSubscription: boolean;
  subscriptionFrequency?: 'Daily' | 'Alternate Days' | 'Weekdays';
  items: Array<{
    productId: number;
    productName: string;
    unit: string;
    quantity: number;
    priceInr: number;
    imageUrl: string;
  }>;
  subtotalInr: number;
  deliveryFeeInr: number;
  totalInr: number;
  paymentMethod: PaymentMethod;
  paymentStatus: 'PAID' | 'PENDING_COD' | 'QR_PAID_AWAITING_ADMIN' | 'CASH_COLLECTED';
  status: OrderStatus;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  assignedAgentPhone: string | null;
  offerAssignedAt: string | null;
  offerExpiresAt: string | null;
  offerDurationMinutes: number;
  rejectedAgentIds: string[];
  deliveryOtp: string | null;
  otpVerifiedAt: string | null;
  agentLiveCoordinates: { lat: number; lng: number };
  codMethodUsed?: 'UPI_QR' | 'CASH' | null;
  upiQrPayload?: string | null;
  upiQrDataUrl?: string | null;
  cashDepositStatus: CashDepositStatus;
  deliveredAt: string | null;
  feedbackSubmitted: boolean;
  feedbackDontAskAgain: boolean;
  lastFeedbackPromptAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const orderSchema = new Schema<IOrderDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    orderNumber: { type: String, required: true, unique: true, index: true },
    customerId: { type: String, required: true, index: true },
    customerName: { type: String, required: true },
    customerEmail: { type: String, default: '' },
    customerPhone: { type: String, required: true },
    deliveryAddress: { type: String, required: true },
    pinCode: { type: String, required: true },
    deliveryCoordinates: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    deliverySlot: {
      type: String,
      enum: ['Morning (05:30 - 07:30 AM)', 'Evening (05:00 - 07:00 PM)'],
      required: true,
    },
    isSubscription: { type: Boolean, default: false },
    subscriptionFrequency: { type: String },
    items: [
      {
        productId: { type: Number, required: true },
        productName: { type: String, required: true },
        unit: { type: String, default: '1 Litre' },
        quantity: { type: Number, required: true, min: 1 },
        priceInr: { type: Number, required: true },
        imageUrl: { type: String, default: '' },
      },
    ],
    subtotalInr: { type: Number, default: 0 },
    deliveryFeeInr: { type: Number, default: 45 },
    totalInr: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['PREPAID', 'COD'], required: true },
    paymentStatus: {
      type: String,
      enum: ['PAID', 'PENDING_COD', 'QR_PAID_AWAITING_ADMIN', 'CASH_COLLECTED'],
      default: 'PENDING_COD',
    },
    status: {
      type: String,
      enum: [
        'PROCESSING',
        'PROCESSED',
        'AWAITING_AGENT_ACCEPTANCE',
        'OUT_FOR_DELIVERY',
        'COD_QR_PENDING_ADMIN',
        'DELIVERED',
        'CANCELLED',
      ],
      default: 'PROCESSING',
      index: true,
    },
    assignedAgentId: { type: String, default: null, index: true },
    assignedAgentName: { type: String, default: null },
    assignedAgentPhone: { type: String, default: null },
    offerAssignedAt: { type: String, default: null },
    offerExpiresAt: { type: String, default: null },
    offerDurationMinutes: { type: Number, default: 3 },
    rejectedAgentIds: { type: [String], default: [] },
    deliveryOtp: { type: String, default: null },
    otpVerifiedAt: { type: String, default: null },
    agentLiveCoordinates: {
      lat: { type: Number, default: 17.4486 },
      lng: { type: Number, default: 78.3908 },
    },
    codMethodUsed: { type: String, enum: ['UPI_QR', 'CASH', null], default: null },
    upiQrPayload: { type: String, default: null },
    upiQrDataUrl: { type: String, default: null },
    cashDepositStatus: {
      type: String,
      enum: ['NONE', 'PENDING_ADMIN_REQUEST', 'DEPOSIT_REQUESTED', 'AGENT_DEPOSITED', 'CONFIRMED'],
      default: 'NONE',
    },
    deliveredAt: { type: String, default: null },
    feedbackSubmitted: { type: Boolean, default: false },
    feedbackDontAskAgain: { type: Boolean, default: false },
    lastFeedbackPromptAt: { type: String, default: null },
    createdAt: { type: String },
    updatedAt: { type: String },
  },
  { ...schemaOptions, collection: 'orders' }
);

// ----------------- 4. Subscription Model (collection: 'subscriptions') -----------------
export interface ISubscriptionDocument extends Document {
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

const subscriptionSchema = new Schema<ISubscriptionDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    customerId: { type: String, required: true, index: true },
    productId: { type: Number, required: true },
    productName: { type: String, required: true },
    unit: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    priceInr: { type: Number, required: true },
    slot: {
      type: String,
      enum: ['Morning (05:30 - 07:30 AM)', 'Evening (05:00 - 07:00 PM)'],
      required: true,
    },
    frequency: { type: String, enum: ['Daily', 'Alternate Days', 'Weekdays'], default: 'Daily' },
    status: { type: String, enum: ['ACTIVE', 'PAUSED'], default: 'ACTIVE', index: true },
    nextDeliveryDate: { type: String, required: true },
    createdAt: { type: String },
  },
  { ...schemaOptions, collection: 'subscriptions' }
);

// ----------------- 5. Review Model (collection: 'reviews') -----------------
export interface IReviewDocument extends Document {
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

const reviewSchema = new Schema<IReviewDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    orderId: { type: String, required: true },
    productId: { type: Number, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    customerName: { type: String, required: true },
    customerAvatarUrl: { type: String, default: 'preset:neutral-1' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
    createdAt: { type: String },
  },
  { ...schemaOptions, collection: 'reviews' }
);

// ----------------- 6. Email Log Model (collection: 'email_logs') -----------------
export interface IEmailLogDocument extends Document {
  id: string;
  toEmail: string;
  toName: string;
  subject: string;
  htmlContent: string;
  provider: 'BREVO_LIVE' | 'BREVO_SANDBOX_OUTBOX';
  statusCode: number;
  error?: string;
  timestamp: string;
}

const emailLogSchema = new Schema<IEmailLogDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    toEmail: { type: String, required: true },
    toName: { type: String, required: true },
    subject: { type: String, required: true },
    htmlContent: { type: String, default: '' },
    provider: { type: String, enum: ['BREVO_LIVE', 'BREVO_SANDBOX_OUTBOX'], required: true },
    statusCode: { type: Number, default: 200 },
    error: { type: String },
    timestamp: { type: String, required: true },
  },
  { ...schemaOptions, collection: 'email_logs' }
);

// ----------------- 7. Feedback Preference Model (collection: 'feedback_preferences') -----------------
export interface IFeedbackPrefDocument extends Document {
  userId: string;
  dontAskAgain: boolean;
  updatedAt: string;
}

const feedbackPrefSchema = new Schema<IFeedbackPrefDocument>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    dontAskAgain: { type: Boolean, default: false },
    updatedAt: { type: String },
  },
  { ...schemaOptions, collection: 'feedback_preferences' }
);

// ----------------- Export Mongoose Models -----------------
export const UserModel: Model<IUserDocument> =
  mongoose.models.User || mongoose.model<IUserDocument>('User', userSchema);

export const ProductModel: Model<IProductDocument> =
  mongoose.models.Product || mongoose.model<IProductDocument>('Product', productSchema);

export const OrderModel: Model<IOrderDocument> =
  mongoose.models.Order || mongoose.model<IOrderDocument>('Order', orderSchema);

export const SubscriptionModel: Model<ISubscriptionDocument> =
  mongoose.models.Subscription || mongoose.model<ISubscriptionDocument>('Subscription', subscriptionSchema);

export const ReviewModel: Model<IReviewDocument> =
  mongoose.models.Review || mongoose.model<IReviewDocument>('Review', reviewSchema);

export const EmailLogModel: Model<IEmailLogDocument> =
  mongoose.models.EmailLog || mongoose.model<IEmailLogDocument>('EmailLog', emailLogSchema);

export const FeedbackPrefModel: Model<IFeedbackPrefDocument> =
  mongoose.models.FeedbackPref || mongoose.model<IFeedbackPrefDocument>('FeedbackPref', feedbackPrefSchema);
