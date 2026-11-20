import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import {
  HYDERABAD_HUB,
  type DairyProduct,
  type EmailDispatchLog,
  type MilkSubscription,
  type OrderRecord,
  type ProductReview,
  type PublicUser,
  type UserRecord,
} from '../src/types/domain.ts';
import {
  UserModel,
  ProductModel,
  OrderModel,
  SubscriptionModel,
  ReviewModel,
  EmailLogModel,
  FeedbackPrefModel,
} from './models/index.ts';

export interface DatabaseState {
  users: UserRecord[];
  products: DairyProduct[];
  orders: OrderRecord[];
  reviews: ProductReview[];
  subscriptions: MilkSubscription[];
  emailLogs: EmailDispatchLog[];
  settings: {
    fifoOfferMinutes: number;
  };
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'pureroute-store.json');

const PRODUCT_IMAGES = {
  buffalo: '/src/assets/images/product_buffalo_milk_1795152909255.jpg',
  a2Cow: '/src/assets/images/product_a2_cow_milk_1795152909986.jpg',
  curdPaneer: '/src/assets/images/product_curd_paneer_1795152909468.jpg',
  gheeChaas: '/src/assets/images/product_ghee_chaas_1795152910165.jpg',
};

function createInitialState(): DatabaseState {
  const now = new Date();
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

  const customerPass = bcrypt.hashSync('PureMilk@2026', 10);
  const merchantPass = bcrypt.hashSync('FarmFresh@2026', 10);
  const agentPass = bcrypt.hashSync('AgentHyd@2026', 10);
  const adminPass = bcrypt.hashSync('AdminHyd@2026', 10);

  const users: UserRecord[] = [
    {
      id: 'usr_customer_1',
      email: 'ananya@pureroute.in',
      passwordHash: customerPass,
      name: 'Ananya Reddy',
      phone: '+919848011223',
      gender: 'Female',
      avatarUrl: 'preset:female-1',
      role: 'customer',
      address: 'Villa 14, Road No. 36, Jubilee Hills, Hyderabad, TG',
      pinCode: '500033',
      coordinates: { lat: 17.4319, lng: 78.4071 },
      isEmailVerified: true,
      mustChangePassword: false,
      isLoggedIn: true,
      lastActiveAt: minsAgo(1),
      fifoQueueJoinedAt: null,
      hasPendingCashDeposit: false,
      pendingCashAmount: 0,
      walletBalance: 0,
      completedDeliveries: 0,
      createdAt: minsAgo(6000),
      updatedAt: minsAgo(1),
    },
    {
      id: 'usr_merchant_1',
      email: 'srinivas.farm@pureroute.in',
      passwordHash: merchantPass,
      name: 'Srinivas Rao',
      phone: '+919848022334',
      gender: 'Male',
      avatarUrl: 'preset:male-2',
      role: 'merchant',
      farmName: 'Deccan Meadows Heritage Dairy',
      merchantVerified: true,
      address: 'Survey 118, Shamshabad Pasture Belt, Hyderabad, TG',
      pinCode: '500077',
      coordinates: { lat: 17.2543, lng: 78.4281 },
      isEmailVerified: true,
      mustChangePassword: false,
      isLoggedIn: true,
      lastActiveAt: minsAgo(2),
      fifoQueueJoinedAt: null,
      hasPendingCashDeposit: false,
      pendingCashAmount: 0,
      walletBalance: 18450,
      completedDeliveries: 0,
      createdAt: minsAgo(12000),
      updatedAt: minsAgo(2),
    },
    {
      id: 'usr_agent_1',
      email: 'ravi.agent@pureroute.in',
      passwordHash: agentPass,
      name: 'Ravi Teja Kumar',
      phone: '+919848033445',
      gender: 'Male',
      avatarUrl: 'preset:male-1',
      role: 'agent',
      address: 'Ayyappa Society, Madhapur, Hyderabad, TG',
      pinCode: '500081',
      coordinates: { lat: 17.4486, lng: 78.3908 },
      currentCoordinates: { lat: 17.4462, lng: 78.3965 },
      isEmailVerified: true,
      mustChangePassword: false,
      isLoggedIn: true,
      lastActiveAt: minsAgo(1),
      fifoQueueJoinedAt: minsAgo(90),
      hasPendingCashDeposit: false,
      pendingCashAmount: 0,
      walletBalance: 1485,
      completedDeliveries: 33,
      createdAt: minsAgo(10000),
      updatedAt: minsAgo(1),
    },
    {
      id: 'usr_agent_2',
      email: 'priya.agent@pureroute.in',
      passwordHash: agentPass,
      name: 'Priya Darshini',
      phone: '+919848044556',
      gender: 'Female',
      avatarUrl: 'preset:female-2',
      role: 'agent',
      address: 'Kondapur X Roads, Hyderabad, TG',
      pinCode: '500084',
      coordinates: { lat: 17.4582, lng: 78.3689 },
      currentCoordinates: { lat: 17.4418, lng: 78.4142 },
      isEmailVerified: true,
      mustChangePassword: false,
      isLoggedIn: true,
      lastActiveAt: minsAgo(1),
      fifoQueueJoinedAt: minsAgo(60),
      hasPendingCashDeposit: false,
      pendingCashAmount: 0,
      walletBalance: 1125,
      completedDeliveries: 25,
      createdAt: minsAgo(9000),
      updatedAt: minsAgo(1),
    },
    {
      id: 'usr_agent_3',
      email: 'alex.agent@pureroute.in',
      passwordHash: agentPass,
      name: 'Alex Verma',
      phone: '+919848055667',
      gender: 'Non-Binary',
      avatarUrl: 'preset:nb-1',
      role: 'agent',
      address: 'Gachibowli Circle, Hyderabad, TG',
      pinCode: '500032',
      coordinates: { lat: 17.4401, lng: 78.3489 },
      currentCoordinates: { lat: 17.4486, lng: 78.3908 },
      isEmailVerified: true,
      mustChangePassword: false,
      isLoggedIn: true,
      lastActiveAt: minsAgo(2),
      fifoQueueJoinedAt: minsAgo(30),
      hasPendingCashDeposit: false,
      pendingCashAmount: 0,
      walletBalance: 810,
      completedDeliveries: 18,
      createdAt: minsAgo(8000),
      updatedAt: minsAgo(2),
    },
    {
      id: 'usr_agent_4',
      email: 'kiran.agent@pureroute.in',
      passwordHash: agentPass,
      name: 'Kiran Nair',
      phone: '+919848066778',
      gender: 'Prefer not to say',
      avatarUrl: 'preset:neutral-1',
      role: 'agent',
      address: 'Begumpet Station Rd, Hyderabad, TG',
      pinCode: '500016',
      coordinates: { lat: 17.4399, lng: 78.4608 },
      currentCoordinates: { lat: 17.4399, lng: 78.4608 },
      isEmailVerified: true,
      mustChangePassword: false,
      isLoggedIn: false,
      lastActiveAt: minsAgo(120),
      fifoQueueJoinedAt: null,
      hasPendingCashDeposit: false,
      pendingCashAmount: 0,
      walletBalance: 630,
      completedDeliveries: 14,
      createdAt: minsAgo(7500),
      updatedAt: minsAgo(120),
    },
    {
      id: 'usr_admin_1',
      email: 'admin@pureroute.in',
      passwordHash: adminPass,
      name: 'Vikramaditya Menon',
      phone: '+919848099999',
      gender: 'Male',
      avatarUrl: 'preset:male-3',
      role: 'admin',
      address: HYDERABAD_HUB.address,
      pinCode: HYDERABAD_HUB.pinCode,
      coordinates: { lat: HYDERABAD_HUB.lat, lng: HYDERABAD_HUB.lng },
      isEmailVerified: true,
      mustChangePassword: false,
      isLoggedIn: true,
      lastActiveAt: minsAgo(0),
      fifoQueueJoinedAt: null,
      hasPendingCashDeposit: false,
      pendingCashAmount: 0,
      walletBalance: 0,
      completedDeliveries: 0,
      createdAt: minsAgo(15000),
      updatedAt: minsAgo(0),
    },
  ];

  const products: DairyProduct[] = [
    {
      id: 101,
      merchantId: 'usr_merchant_1',
      merchantName: 'Deccan Meadows Heritage Dairy',
      name: 'Farm-Fresh Buffalo Milk',
      category: 'Buffalo Milk',
      unit: '1 Litre Glass Bottle',
      priceInr: 92,
      fatPercent: 7.4,
      snfPercent: 9.2,
      freshnessTimestamp: minsAgo(95),
      harvestNote: 'Milked 04:15 AM · Chilled to 4°C in 18 mins',
      stockQty: 64,
      imageUrl: PRODUCT_IMAGES.buffalo,
      description:
        'Single-origin Murrah buffalo milk from grass-fed Telangana pastures. Unhomogenized, zero preservatives, thick natural malai layer.',
      supportsSubscription: true,
      ratingAvg: 4.9,
      reviewCount: 42,
    },
    {
      id: 102,
      merchantId: 'usr_merchant_1',
      merchantName: 'Deccan Meadows Heritage Dairy',
      name: 'Farm-Fresh Buffalo Milk (Half)',
      category: 'Buffalo Milk',
      unit: '500 ml Glass Bottle',
      priceInr: 48,
      fatPercent: 7.4,
      snfPercent: 9.2,
      freshnessTimestamp: minsAgo(95),
      harvestNote: 'Milked 04:15 AM · Sealed sterile glass',
      stockQty: 88,
      imageUrl: PRODUCT_IMAGES.buffalo,
      description:
        'Same rich single-origin morning buffalo milk bottled in a convenient 500 ml returnable glass vessel for smaller households.',
      supportsSubscription: true,
      ratingAvg: 4.8,
      reviewCount: 29,
    },
    {
      id: 103,
      merchantId: 'usr_merchant_1',
      merchantName: 'Deccan Meadows Heritage Dairy',
      name: 'A2 Desi Gir Cow Milk',
      category: 'A2 Cow Milk',
      unit: '1 Litre Carafe',
      priceInr: 115,
      fatPercent: 4.6,
      snfPercent: 8.9,
      freshnessTimestamp: minsAgo(80),
      harvestNote: 'Milked 04:30 AM · A2 Beta-Casein Lab Tested',
      stockQty: 52,
      imageUrl: PRODUCT_IMAGES.a2Cow,
      description:
        'Pure A2 beta-casein milk from free-grazing indigenous Gir cows. Naturally light, golden-hued, and gentle on digestion.',
      supportsSubscription: true,
      ratingAvg: 4.9,
      reviewCount: 54,
    },
    {
      id: 104,
      merchantId: 'usr_merchant_1',
      merchantName: 'Deccan Meadows Heritage Dairy',
      name: 'Organic Terracotta Curd (Dahi)',
      category: 'Curd & Paneer',
      unit: '500 g Clay Pot',
      priceInr: 78,
      fatPercent: 6.2,
      snfPercent: 9.0,
      freshnessTimestamp: minsAgo(140),
      harvestNote: 'Slow-set in porous terracotta · Live probiotics',
      stockQty: 40,
      imageUrl: PRODUCT_IMAGES.curdPaneer,
      description:
        'Velvety, naturally sweet probiotic curd cultured overnight in unglazed clay pots using heirloom starter culture.',
      supportsSubscription: true,
      ratingAvg: 4.9,
      reviewCount: 31,
    },
    {
      id: 105,
      merchantId: 'usr_merchant_1',
      merchantName: 'Deccan Meadows Heritage Dairy',
      name: 'Hand-Pressed Farm Paneer',
      category: 'Curd & Paneer',
      unit: '250 g Vacuum Pack',
      priceInr: 125,
      fatPercent: 22.0,
      snfPercent: 28.5,
      freshnessTimestamp: minsAgo(60),
      harvestNote: 'Citric-coagulated 05:00 AM · Zero citric acid residue',
      stockQty: 34,
      imageUrl: PRODUCT_IMAGES.curdPaneer,
      description:
        'Cloud-soft cottage cheese hand-pressed from morning buffalo milk with organic lime whey—holds shape cleanly on high heat.',
      supportsSubscription: false,
      ratingAvg: 4.8,
      reviewCount: 24,
    },
    {
      id: 106,
      merchantId: 'usr_merchant_1',
      merchantName: 'Deccan Meadows Heritage Dairy',
      name: 'Pure Cultured A2 Cow Ghee',
      category: 'Ghee & Buttermilk',
      unit: '500 ml Crystal Jar',
      priceInr: 890,
      fatPercent: 99.6,
      snfPercent: 0.4,
      freshnessTimestamp: minsAgo(360),
      harvestNote: 'Traditional Bilona hand-churned · Small batch',
      stockQty: 19,
      imageUrl: PRODUCT_IMAGES.gheeChaas,
      description:
        'Aromatic granular ghee slow-simmered from cultured A2 Gir cow curd butter over gentle wood-ember warmth.',
      supportsSubscription: false,
      ratingAvg: 5.0,
      reviewCount: 38,
    },
    {
      id: 107,
      merchantId: 'usr_merchant_1',
      merchantName: 'Deccan Meadows Heritage Dairy',
      name: 'Spiced Farm Buttermilk (Chaas)',
      category: 'Ghee & Buttermilk',
      unit: '500 ml Frosted Bottle',
      priceInr: 42,
      fatPercent: 1.8,
      snfPercent: 7.6,
      freshnessTimestamp: minsAgo(55),
      harvestNote: 'Churned 05:20 AM · Roasted jeera & curry leaf',
      stockQty: 58,
      imageUrl: PRODUCT_IMAGES.gheeChaas,
      description:
        'Cooling Hyderabad-style spiced buttermilk hand-churned from fresh curd with toasted cumin, Himalayan pink salt, and tender curry leaves.',
      supportsSubscription: true,
      ratingAvg: 4.7,
      reviewCount: 19,
    },
  ];

  const orders: OrderRecord[] = [
    {
      id: 'ord_live_1001',
      orderNumber: 'PR-HYD-1001',
      customerId: 'usr_customer_1',
      customerName: 'Ananya Reddy',
      customerEmail: 'ananya@pureroute.in',
      customerPhone: '+919848011223',
      deliveryAddress: 'Villa 14, Road No. 36, Jubilee Hills, Hyderabad, TG',
      pinCode: '500033',
      deliveryCoordinates: { lat: 17.4319, lng: 78.4071 },
      deliverySlot: 'Morning (05:30 - 07:30 AM)',
      isSubscription: false,
      items: [
        {
          productId: 103,
          productName: 'A2 Desi Gir Cow Milk',
          unit: '1 Litre Carafe',
          quantity: 2,
          priceInr: 115,
          imageUrl: PRODUCT_IMAGES.a2Cow,
        },
        {
          productId: 104,
          productName: 'Organic Terracotta Curd (Dahi)',
          unit: '500 g Clay Pot',
          quantity: 1,
          priceInr: 78,
          imageUrl: PRODUCT_IMAGES.curdPaneer,
        },
      ],
      subtotalInr: 308,
      deliveryFeeInr: 45,
      totalInr: 353,
      paymentMethod: 'COD',
      paymentStatus: 'PENDING_COD',
      status: 'OUT_FOR_DELIVERY',
      assignedAgentId: 'usr_agent_2',
      assignedAgentName: 'Priya Darshini',
      assignedAgentPhone: '+919848044556',
      offerAssignedAt: minsAgo(18),
      offerExpiresAt: null,
      offerDurationMinutes: 3,
      rejectedAgentIds: [],
      deliveryOtp: '482916',
      otpVerifiedAt: null,
      agentLiveCoordinates: { lat: 17.4418, lng: 78.3992 },
      codMethodUsed: null,
      upiQrPayload: null,
      upiQrDataUrl: null,
      cashDepositStatus: 'NONE',
      deliveredAt: null,
      feedbackSubmitted: false,
      feedbackDontAskAgain: false,
      lastFeedbackPromptAt: null,
      createdAt: minsAgo(25),
      updatedAt: minsAgo(12),
    },
    {
      id: 'ord_proc_1002',
      orderNumber: 'PR-HYD-1002',
      customerId: 'usr_customer_1',
      customerName: 'Ananya Reddy',
      customerEmail: 'ananya@pureroute.in',
      customerPhone: '+919848011223',
      deliveryAddress: 'Plot 88, Banjara Hills Road No. 12, Hyderabad, TG',
      pinCode: '500034',
      deliveryCoordinates: { lat: 17.4126, lng: 78.4398 },
      deliverySlot: 'Evening (05:00 - 07:00 PM)',
      isSubscription: false,
      items: [
        {
          productId: 101,
          productName: 'Farm-Fresh Buffalo Milk',
          unit: '1 Litre Glass Bottle',
          quantity: 2,
          priceInr: 92,
          imageUrl: PRODUCT_IMAGES.buffalo,
        },
        {
          productId: 105,
          productName: 'Hand-Pressed Farm Paneer',
          unit: '250 g Vacuum Pack',
          quantity: 1,
          priceInr: 125,
          imageUrl: PRODUCT_IMAGES.curdPaneer,
        },
      ],
      subtotalInr: 309,
      deliveryFeeInr: 45,
      totalInr: 354,
      paymentMethod: 'PREPAID',
      paymentStatus: 'PAID',
      status: 'PROCESSING',
      assignedAgentId: null,
      assignedAgentName: null,
      assignedAgentPhone: null,
      offerAssignedAt: null,
      offerExpiresAt: null,
      offerDurationMinutes: 3,
      rejectedAgentIds: [],
      deliveryOtp: null,
      otpVerifiedAt: null,
      agentLiveCoordinates: { lat: HYDERABAD_HUB.lat, lng: HYDERABAD_HUB.lng },
      codMethodUsed: null,
      upiQrPayload: null,
      upiQrDataUrl: null,
      cashDepositStatus: 'NONE',
      deliveredAt: null,
      feedbackSubmitted: false,
      feedbackDontAskAgain: false,
      lastFeedbackPromptAt: null,
      createdAt: minsAgo(8),
      updatedAt: minsAgo(8),
    },
    {
      id: 'ord_deliv_1000',
      orderNumber: 'PR-HYD-1000',
      customerId: 'usr_customer_1',
      customerName: 'Ananya Reddy',
      customerEmail: 'ananya@pureroute.in',
      customerPhone: '+919848011223',
      deliveryAddress: 'Villa 14, Road No. 36, Jubilee Hills, Hyderabad, TG',
      pinCode: '500033',
      deliveryCoordinates: { lat: 17.4319, lng: 78.4071 },
      deliverySlot: 'Morning (05:30 - 07:30 AM)',
      isSubscription: true,
      subscriptionFrequency: 'Daily',
      items: [
        {
          productId: 101,
          productName: 'Farm-Fresh Buffalo Milk',
          unit: '1 Litre Glass Bottle',
          quantity: 1,
          priceInr: 92,
          imageUrl: PRODUCT_IMAGES.buffalo,
        },
      ],
      subtotalInr: 92,
      deliveryFeeInr: 45,
      totalInr: 137,
      paymentMethod: 'PREPAID',
      paymentStatus: 'PAID',
      status: 'DELIVERED',
      assignedAgentId: 'usr_agent_1',
      assignedAgentName: 'Ravi Teja Kumar',
      assignedAgentPhone: '+919848033445',
      offerAssignedAt: minsAgo(90),
      offerExpiresAt: null,
      offerDurationMinutes: 3,
      rejectedAgentIds: [],
      deliveryOtp: '719204',
      otpVerifiedAt: minsAgo(22),
      agentLiveCoordinates: { lat: 17.4319, lng: 78.4071 },
      codMethodUsed: null,
      upiQrPayload: null,
      upiQrDataUrl: null,
      cashDepositStatus: 'NONE',
      deliveredAt: minsAgo(22), // >15 mins ago so smart post-delivery feedback reminder activates cleanly!
      feedbackSubmitted: false,
      feedbackDontAskAgain: false,
      lastFeedbackPromptAt: null,
      createdAt: minsAgo(110),
      updatedAt: minsAgo(22),
    },
  ];

  const reviews: ProductReview[] = [
    {
      id: 'rev_1',
      orderId: 'ord_seed_prev_1',
      productId: 103,
      customerId: 'usr_customer_1',
      customerName: 'Ananya Reddy',
      customerAvatarUrl: 'preset:female-1',
      rating: 5,
      comment:
        'Arrived chilled at 6:05 AM in Jubilee Hills. Naturally sweet A2 milk with zero smell—our morning filter coffee tastes noticeably richer.',
      createdAt: minsAgo(1440),
    },
    {
      id: 'rev_2',
      orderId: 'ord_seed_prev_2',
      productId: 101,
      customerId: 'usr_customer_1',
      customerName: 'Karthik Varma',
      customerAvatarUrl: 'preset:male-1',
      rating: 5,
      comment:
        'Thick golden cream layer every single morning. Love that the sealed glass bottle is chilled right from the Madhapur hub.',
      createdAt: minsAgo(2880),
    },
  ];

  const subscriptions: MilkSubscription[] = [
    {
      id: 'sub_1',
      customerId: 'usr_customer_1',
      productId: 101,
      productName: 'Farm-Fresh Buffalo Milk',
      unit: '1 Litre Glass Bottle',
      quantity: 1,
      priceInr: 92,
      slot: 'Morning (05:30 - 07:30 AM)',
      frequency: 'Daily',
      status: 'ACTIVE',
      nextDeliveryDate: new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10),
      createdAt: minsAgo(4320),
    },
  ];

  return {
    users,
    products,
    orders,
    reviews,
    subscriptions,
    emailLogs: [],
    settings: {
      fifoOfferMinutes: Math.min(5, Math.max(2, Number(process.env.FIFO_OFFER_MINUTES) || 3)),
    },
  };
}

let state: DatabaseState | null = null;

export async function loadStateFromMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;

  try {
    const [users, products, orders, subscriptions, reviews, emailLogs] = await Promise.all([
      UserModel.find().lean(),
      ProductModel.find().lean(),
      OrderModel.find().lean(),
      SubscriptionModel.find().lean(),
      ReviewModel.find().lean(),
      EmailLogModel.find().sort({ createdAt: -1 }).limit(100).lean(),
    ]);

    if (users.length > 0 && products.length > 0) {
      if (!state) {
        state = createInitialState();
      }
      state.users = users as any[];
      state.products = products as any[];
      state.orders = orders as any[];
      state.subscriptions = subscriptions as any[];
      state.reviews = reviews as any[];
      state.emailLogs = emailLogs as any[];
      console.log('🍃 [Store] Successfully loaded database state from MongoDB Atlas (app_production)');
    }
  } catch (err: any) {
    console.warn('🍃 [Store] Note during Mongo state load:', err.message);
  }
}

export function getStore(): DatabaseState {
  if (state) return state;
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      state = JSON.parse(raw) as DatabaseState;
      return state;
    }
  } catch (err) {
    console.warn('[Store] Failed to load existing data file, recreating seed state:', err);
  }
  state = createInitialState();
  saveStore();
  return state;
}

export function saveStore(): void {
  if (!state) return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DATA_FILE);
  } catch (err: any) {
    // In read-only serverless environments, file persistence is safely skipped;
    // MongoDB Atlas provides durable cloud persistence.
  }

  // Asynchronously synchronize with MongoDB Atlas if connected
  if (mongoose.connection.readyState === 1) {
    Promise.all([
      ...state.users.map((u) => UserModel.updateOne({ id: u.id }, { $set: u }, { upsert: true })),
      ...state.products.map((p) => ProductModel.updateOne({ id: p.id }, { $set: p }, { upsert: true })),
      ...state.orders.map((o) => OrderModel.updateOne({ id: o.id }, { $set: o }, { upsert: true })),
      ...state.subscriptions.map((s) => SubscriptionModel.updateOne({ id: s.id }, { $set: s }, { upsert: true })),
      ...state.reviews.map((r) => ReviewModel.updateOne({ id: r.id }, { $set: r }, { upsert: true })),
    ]).catch((err) => {
      console.warn('🍃 [Store Sync] Warning during background MongoDB Atlas sync:', err.message);
    });
  }
}

export async function saveFeedbackPreference(userId: string, dontAskAgain: boolean): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    try {
      await FeedbackPrefModel.updateOne(
        { userId },
        { $set: { userId, dontAskAgain, updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
    } catch (err: any) {
      console.warn('🍃 [Store] Failed to save feedback preference:', err.message);
    }
  }
}

export function sanitizeUser(u: UserRecord): PublicUser {
  const { passwordHash: _p, emailVerificationToken: _t, ...rest } = u;
  return rest;
}

export function getEligibleActiveAgents(excludeIds: string[] = []): UserRecord[] {
  const store = getStore();
  const nowMs = Date.now();
  const fifteenMinsMs = 15 * 60 * 1000;

  return store.users
    .filter((u) => {
      if (u.role !== 'agent') return false;
      if (!u.isEmailVerified) return false;
      if (!u.isLoggedIn) return false;
      if (u.hasPendingCashDeposit) return false;
      if (excludeIds.includes(u.id)) return false;
      if (!u.lastActiveAt) return false;
      const lastActiveMs = new Date(u.lastActiveAt).getTime();
      if (nowMs - lastActiveMs > fifteenMinsMs) return false;
      return true;
    })
    .sort((a, b) => {
      const aTime = a.fifoQueueJoinedAt ? new Date(a.fifoQueueJoinedAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.fifoQueueJoinedAt ? new Date(b.fifoQueueJoinedAt).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
}
