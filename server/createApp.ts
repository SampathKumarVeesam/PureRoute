import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import QRCode from 'qrcode';
import swaggerUi from 'swagger-ui-express';
import dotenv from 'dotenv';
import {
  HYDERABAD_HUB,
  formatIndianPhone,
  isValidIndianPhone,
  type AgentMaskedOrder,
  type MilkSubscription,
  type OrderRecord,
  type UserRecord,
  type UserRole,
} from '../src/types/domain.ts';
import {
  getEligibleActiveAgents,
  getStore,
  loadStateFromMongo,
  sanitizeUser,
  saveFeedbackPreference,
  saveStore,
} from './store.ts';
import { connectToDatabase, getDatabaseHealth, seedDatabaseIfEmpty } from './database.ts';
import {
  sendTransactionalEmail,
  sendBrevoTransactionalEmail,
  templateWelcomeUser,
  templateOrderPlacedCustomer,
  templateMerchantOrderAlert,
  templateOrderDispatched,
  templateOrderDelivered,
} from './email.ts';
import { openApiSpec } from './openapi.ts';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'pureroute-hyd-localmilk-jwt-secret-2026';
const DELIVERY_FEE_INR = 45;

interface JwtPayload {
  userId: string;
  role: UserRole;
  email: string;
}

interface AuthedRequest extends Request {
  auth?: JwtPayload;
  currentUser?: UserRecord;
}

function signToken(user: UserRecord): string {
  return jwt.sign({ userId: user.id, role: user.role, email: user.email } satisfies JwtPayload, JWT_SECRET, {
    expiresIn: '7d',
  });
}

function generateSixDigitOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$';
  let pwd = 'Pr@';
  for (let i = 0; i < 7; i++) {
    pwd += chars[crypto.randomInt(0, chars.length)];
  }
  return pwd;
}

function toAgentMaskedOrder(order: OrderRecord): AgentMaskedOrder {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    deliveryAddress: order.deliveryAddress,
    pinCode: order.pinCode,
    deliveryCoordinates: order.deliveryCoordinates,
    deliverySlot: order.deliverySlot,
    maskedItems: order.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    })),
    totalInr: order.totalInr,
    deliveryFeeInr: order.deliveryFeeInr,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    status: order.status,
    offerAssignedAt: order.offerAssignedAt,
    offerExpiresAt: order.offerExpiresAt,
    agentLiveCoordinates: order.agentLiveCoordinates,
    codMethodUsed: order.codMethodUsed ?? null,
    upiQrDataUrl: order.upiQrDataUrl ?? null,
    cashDepositStatus: order.cashDepositStatus,
    otpVerifiedAt: order.otpVerifiedAt,
    createdAt: order.createdAt,
  };
}

function recordEmail(log: ReturnType<typeof getStore>['emailLogs'][number]) {
  const store = getStore();
  store.emailLogs.unshift(log);
  if (store.emailLogs.length > 60) {
    store.emailLogs = store.emailLogs.slice(0, 60);
  }
  saveStore();
}

export function assignOrderToNextFifoAgent(order: OrderRecord, preferredAgentId?: string): UserRecord | null {
  const store = getStore();
  const eligible = getEligibleActiveAgents(order.rejectedAgentIds);

  let chosen: UserRecord | undefined;
  if (preferredAgentId) {
    chosen = eligible.find((a) => a.id === preferredAgentId);
    if (!chosen) {
      chosen = getEligibleActiveAgents([]).find((a) => a.id === preferredAgentId);
    }
  } else {
    chosen = eligible[0];
    if (!chosen) {
      const allEligible = getEligibleActiveAgents([]);
      if (allEligible.length > 0) {
        order.rejectedAgentIds = [];
        chosen = allEligible[0];
      }
    }
  }

  if (!chosen) {
    order.assignedAgentId = null;
    order.assignedAgentName = null;
    order.assignedAgentPhone = null;
    order.offerAssignedAt = null;
    order.offerExpiresAt = null;
    order.status = 'PROCESSED';
    order.updatedAt = new Date().toISOString();
    saveStore();
    return null;
  }

  const minutes = Math.min(5, Math.max(2, store.settings.fifoOfferMinutes || 3));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + minutes * 60_000);

  order.assignedAgentId = chosen.id;
  order.assignedAgentName = chosen.name;
  order.assignedAgentPhone = chosen.phone;
  order.offerAssignedAt = now.toISOString();
  order.offerExpiresAt = expiresAt.toISOString();
  order.offerDurationMinutes = minutes;
  order.status = 'AWAITING_AGENT_ACCEPTANCE';
  order.updatedAt = now.toISOString();
  saveStore();
  return chosen;
}

export function checkAndExpireFifoOrders(): void {
  const store = getStore();
  const nowMs = Date.now();
  let changed = false;

  for (const order of store.orders) {
    if (order.status === 'AWAITING_AGENT_ACCEPTANCE' && order.offerExpiresAt) {
      const expMs = new Date(order.offerExpiresAt).getTime();
      if (nowMs >= expMs) {
        const timedOutAgentId = order.assignedAgentId;
        if (timedOutAgentId) {
          const agent = store.users.find((u) => u.id === timedOutAgentId);
          if (agent) {
            agent.fifoQueueJoinedAt = new Date().toISOString();
            agent.updatedAt = new Date().toISOString();
          }
          if (!order.rejectedAgentIds.includes(timedOutAgentId)) {
            order.rejectedAgentIds.push(timedOutAgentId);
          }
        }
        assignOrderToNextFifoAgent(order);
        changed = true;
      }
    }
  }

  if (changed) {
    saveStore();
  }
}

export function startFifoExpirationWatcher(): NodeJS.Timeout {
  return setInterval(checkAndExpireFifoOrders, 15_000);
}

function optionalAuth(req: AuthedRequest): UserRecord | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const store = getStore();
    return store.users.find((u) => u.id === payload.userId) || null;
  } catch {
    return null;
  }
}

function requireAuth(roles?: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.slice(7);
    try {
      const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
      const store = getStore();
      const user = store.users.find((u) => u.id === payload.userId);
      if (!user) {
        return res.status(401).json({ error: 'Account not found' });
      }
      if (roles && !roles.includes(user.role)) {
        return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
      }
      req.auth = payload;
      req.currentUser = user;
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired session token' });
    }
  };
}

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
      cb(null, true);
    } else {
      cb(new Error('Only JPG and PNG images up to 2MB are allowed.'));
    }
  },
});

let dbReadyPromise: Promise<void> | null = null;
export async function ensureDbReady(): Promise<void> {
  if (dbReadyPromise) return dbReadyPromise;
  dbReadyPromise = (async () => {
    try {
      const conn = await connectToDatabase();
      if (conn) {
        const store = getStore();
        await seedDatabaseIfEmpty({
          users: store.users,
          products: store.products,
          orders: store.orders,
          subscriptions: store.subscriptions,
          reviews: store.reviews,
        });
        await loadStateFromMongo();
      }
    } catch (err: any) {
      console.warn('🍃 [Database Ready Check]:', err.message);
    }
  })();
  return dbReadyPromise;
}

export function createApp(): express.Application {
  const app = express();

  // CORS Middleware
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json({ limit: '4mb' }));

  // Initialize seed store
  getStore();

  // OpenAPI 3.0 Swagger Documentation
  app.get('/api/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      customSiteTitle: 'PureRoute LocalMilkforYou — OpenAPI 3.0 Swagger',
    })
  );

  // Health & Public Email Sandbox Outbox
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', hub: HYDERABAD_HUB.name, timestamp: new Date().toISOString() });
  });

  app.get(['/api/db/health', '/api/db/status'], async (_req: Request, res: Response) => {
    const health = await getDatabaseHealth();
    res.json(health);
  });

  app.get('/api/outbox', (_req, res) => {
    const store = getStore();
    res.json(store.emailLogs.slice(0, 20));
  });

  // ==========================================
  // AUTH & PROFILE ROUTES
  // ==========================================
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const { name, email, password, phone, gender, role, avatarUrl, address, pinCode, farmName } = req.body || {};
      const cleanEmail = String(email || '').trim().toLowerCase();
      const formattedPhone = formatIndianPhone(String(phone || ''));

      if (!name || String(name).trim().length < 2) {
        return res.status(400).json({ error: 'Please provide your full name.' });
      }
      if (!cleanEmail || !cleanEmail.includes('@')) {
        return res.status(400).json({ error: 'Please provide a valid email address.' });
      }
      if (!isValidIndianPhone(formattedPhone)) {
        return res.status(400).json({ error: 'Phone must be a valid 10-digit Indian mobile number (+91).' });
      }

      const validRole: UserRole = ['customer', 'merchant', 'agent'].includes(role) ? role : 'customer';
      const validGender = ['Male', 'Female', 'Non-Binary', 'Prefer not to say'].includes(gender)
        ? gender
        : 'Prefer not to say';

      const store = getStore();
      if (store.users.some((u) => u.email.toLowerCase() === cleanEmail)) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }

      const now = new Date().toISOString();
      const cleanPin = /^500\d{3}$/.test(String(pinCode || '')) ? String(pinCode) : '500081';

      if (validRole === 'agent') {
        const verificationToken = crypto.randomBytes(20).toString('hex');
        const placeholderHash = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

        const newAgent: UserRecord = {
          id: `usr_agent_${crypto.randomBytes(4).toString('hex')}`,
          email: cleanEmail,
          passwordHash: placeholderHash,
          name: String(name).trim(),
          phone: formattedPhone,
          gender: validGender,
          avatarUrl: avatarUrl || 'preset:neutral-1',
          role: 'agent',
          address: address || 'Hyderabad Hub Depot, Madhapur, Hyderabad, TG',
          pinCode: cleanPin,
          coordinates: { lat: HYDERABAD_HUB.lat, lng: HYDERABAD_HUB.lng },
          currentCoordinates: { lat: HYDERABAD_HUB.lat, lng: HYDERABAD_HUB.lng },
          isEmailVerified: false,
          emailVerificationToken: verificationToken,
          mustChangePassword: true,
          isLoggedIn: false,
          lastActiveAt: now,
          fifoQueueJoinedAt: null,
          hasPendingCashDeposit: false,
          pendingCashAmount: 0,
          walletBalance: 0,
          completedDeliveries: 0,
          createdAt: now,
          updatedAt: now,
        };
        store.users.push(newAgent);
        saveStore();

        const verifyUrl = `${process.env.APP_URL || 'http://localhost:3000'}?verifyToken=${verificationToken}`;
        await sendBrevoTransactionalEmail(
          {
            toEmail: cleanEmail,
            toName: newAgent.name,
            subject: 'PureRoute Hyderabad — Verify Your Agent Account',
            htmlContent: `
              <div style="font-family: sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e4cca2; border-radius: 8px;">
                <h2 style="color: #0b2a3c; margin-top: 0;">Welcome to PureRoute Fleet, ${newAgent.name}!</h2>
                <p>Your delivery agent registration for the Hyderabad Dairy Network has been received.</p>
                <p>Please click below to verify your email. Once verified, your temporary login password will be generated.</p>
                <div style="margin: 28px 0;">
                  <a href="${verifyUrl}" style="background-color: #d8b06c; color: #081119; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 4px; display: inline-block;">
                    Verify Agent Account
                  </a>
                </div>
                <p style="font-size: 12px; color: #64748b;">Or paste this URL in your browser: ${verifyUrl}</p>
              </div>
            `,
          },
          recordEmail
        );

        return res.status(201).json({
          message: 'Agent registered successfully. Verification email sent.',
          requiresEmailVerification: true,
          verificationTokenForTesting: verificationToken,
          user: sanitizeUser(newAgent),
        });
      }

      if (!password || String(password).length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      }

      const passwordHash = bcrypt.hashSync(String(password), 10);
      const newUser: UserRecord = {
        id: `usr_${validRole}_${crypto.randomBytes(4).toString('hex')}`,
        email: cleanEmail,
        passwordHash,
        name: String(name).trim(),
        phone: formattedPhone,
        gender: validGender,
        avatarUrl: avatarUrl || (validGender === 'Female' ? 'preset:female-1' : 'preset:male-1'),
        role: validRole,
        address: address || 'Hyderabad, TG',
        pinCode: cleanPin,
        coordinates: { lat: HYDERABAD_HUB.lat, lng: HYDERABAD_HUB.lng },
        isEmailVerified: true,
        mustChangePassword: false,
        isLoggedIn: true,
        lastActiveAt: now,
        fifoQueueJoinedAt: null,
        hasPendingCashDeposit: false,
        pendingCashAmount: 0,
        walletBalance: 0,
        completedDeliveries: 0,
        createdAt: now,
        updatedAt: now,
        farmName: validRole === 'merchant' ? farmName || 'Deccan Pastoral Farm' : undefined,
        merchantVerified: validRole === 'merchant' ? false : undefined,
      };

      store.users.push(newUser);
      saveStore();

      // Dispatch welcome notification via Zoho SMTP
      sendTransactionalEmail(
        {
          toEmail: cleanEmail,
          toName: newUser.name,
          subject: `Welcome to PureRoute LocalMilk Hyderabad, ${newUser.name}!`,
          htmlContent: templateWelcomeUser(newUser.name, validRole, cleanEmail),
        },
        recordEmail
      ).catch((e) => console.warn('Welcome email error:', e));

      const token = signToken(newUser);
      return res.status(201).json({
        message: 'Account created successfully',
        token,
        user: sanitizeUser(newUser),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Internal registration error' });
    }
  });

  app.get('/api/auth/verify-email', async (req: Request, res: Response) => {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ error: 'Verification token required' });
    }

    const store = getStore();
    const agent = store.users.find((u) => u.emailVerificationToken === String(token));
    if (!agent) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    const tempPassword = generateTempPassword();
    agent.passwordHash = bcrypt.hashSync(tempPassword, 10);
    agent.isEmailVerified = true;
    agent.emailVerificationToken = null;
    agent.mustChangePassword = true;
    agent.updatedAt = new Date().toISOString();
    saveStore();

    const now = new Date().toISOString();
    await sendBrevoTransactionalEmail(
      {
        toEmail: agent.email,
        toName: agent.name,
        subject: 'PureRoute Hyderabad — Your Temporary Login Password',
        htmlContent: `
          <div style="font-family: sans-serif; max-width: 580px; margin: 0 auto; padding: 24px; border: 1px solid #e4cca2; border-radius: 8px;">
            <h2 style="color: #0b2a3c;">Email Verified Successfully!</h2>
            <p>Hi ${agent.name}, your email has been verified. Use this temporary password for your first login:</p>
            <div style="margin: 20px 0; padding: 14px 20px; background-color: #f1f5f9; border-left: 4px solid #d8b06c; font-family: monospace; font-size: 18px; font-weight: bold; letter-spacing: 2px;">
              ${tempPassword}
            </div>
            <p style="color: #64748b; font-size: 13px;">For security, you will be required to choose a permanent password immediately upon your first sign in.</p>
          </div>
        `,
      },
      recordEmail
    );

    res.json({
      message: 'Email verified. Temporary password dispatched via email.',
      email: agent.email,
      tempPasswordPreview: tempPassword,
    });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanEmail || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const store = getStore();
    const user = store.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const ok = bcrypt.compareSync(String(password), user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.role === 'agent' && !user.isEmailVerified) {
      return res.status(403).json({
        error: 'Email verification pending. Please click the link sent to your inbox to receive your temporary password.',
        requiresEmailVerification: true,
      });
    }

    const now = new Date().toISOString();
    user.isLoggedIn = true;
    user.lastActiveAt = now;
    user.updatedAt = now;
    if (user.role === 'agent' && !user.hasPendingCashDeposit) {
      if (!user.fifoQueueJoinedAt) {
        user.fifoQueueJoinedAt = now;
      }
    }
    saveStore();

    const token = signToken(user);
    res.json({ token, user: sanitizeUser(user) });
  });

  app.post('/api/auth/google', (req: Request, res: Response) => {
    const { email, name, avatarUrl, googleId } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return res.status(400).json({ error: 'Missing email address for Google sign-in.' });
    }

    const store = getStore();
    let user = store.users.find(
      (u) => (googleId && u.googleId === googleId) || u.email.toLowerCase() === cleanEmail
    );
    const now = new Date().toISOString();

    if (!user) {
      const assignedRole: UserRole = cleanEmail === 'learnwithai951@gmail.com' ? 'admin' : 'customer';
      user = {
        id: `usr_google_${crypto.randomBytes(4).toString('hex')}`,
        googleId: googleId ? String(googleId) : undefined,
        email: cleanEmail,
        passwordHash: bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10),
        name: String(name || cleanEmail.split('@')[0]),
        phone: '+919848011223',
        gender: 'Prefer not to say',
        avatarUrl: avatarUrl || 'preset:neutral-1',
        role: assignedRole,
        address: 'Madhapur, Hitech City, Hyderabad, TG',
        pinCode: '500081',
        coordinates: { lat: HYDERABAD_HUB.lat, lng: HYDERABAD_HUB.lng },
        isEmailVerified: true,
        mustChangePassword: false,
        isLoggedIn: true,
        lastActiveAt: now,
        fifoQueueJoinedAt: null,
        hasPendingCashDeposit: false,
        pendingCashAmount: 0,
        walletBalance: 0,
        completedDeliveries: 0,
        createdAt: now,
        updatedAt: now,
      };
      store.users.push(user);
    } else {
      if (googleId) user.googleId = String(googleId);
      user.isLoggedIn = true;
      user.lastActiveAt = now;
      user.updatedAt = now;
    }
    saveStore();

    const token = signToken(user);
    res.json({ token, user: sanitizeUser(user) });
  });

  app.post('/api/auth/logout', requireAuth(), (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    user.isLoggedIn = false;
    if (user.role === 'agent') {
      user.fifoQueueJoinedAt = null;
    }
    user.updatedAt = new Date().toISOString();
    saveStore();
    res.json({ message: 'Logged out successfully' });
  });

  app.post('/api/auth/change-password', requireAuth(), (req: AuthedRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body || {};
    const user = req.currentUser!;

    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    if (!user.mustChangePassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Current password required' });
      }
      const ok = bcrypt.compareSync(String(currentPassword), user.passwordHash);
      if (!ok) {
        return res.status(401).json({ error: 'Incorrect current password' });
      }
    }

    user.passwordHash = bcrypt.hashSync(String(newPassword), 10);
    user.mustChangePassword = false;
    user.updatedAt = new Date().toISOString();
    saveStore();

    res.json({ message: 'Password updated successfully', user: sanitizeUser(user) });
  });

  app.get('/api/profile', requireAuth(), (req: AuthedRequest, res: Response) => {
    res.json(sanitizeUser(req.currentUser!));
  });

  app.patch('/api/profile', requireAuth(), (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const { name, phone, gender, avatarUrl, address, pinCode, coordinates } = req.body || {};

    if (name) user.name = String(name).trim();
    if (phone) {
      const formatted = formatIndianPhone(String(phone));
      if (!isValidIndianPhone(formatted)) {
        return res.status(400).json({ error: 'Phone must be a valid 10-digit Indian mobile number (+91)' });
      }
      user.phone = formatted;
    }
    if (gender && ['Male', 'Female', 'Non-Binary', 'Prefer not to say'].includes(gender)) {
      user.gender = gender;
    }
    if (avatarUrl) {
      user.avatarUrl = String(avatarUrl);
    }
    if (address !== undefined) user.address = String(address);
    if (pinCode && /^500\d{3}$/.test(String(pinCode))) {
      user.pinCode = String(pinCode);
    }
    if (coordinates && typeof coordinates.lat === 'number' && typeof coordinates.lng === 'number') {
      user.coordinates = coordinates;
    }

    user.updatedAt = new Date().toISOString();
    saveStore();
    res.json(sanitizeUser(user));
  });

  app.post(
    '/api/upload/avatar',
    requireAuth(),
    avatarUpload.single('avatar'),
    (req: AuthedRequest, res: Response) => {
      if (!req.file) {
        return res.status(400).json({ error: 'Please select a JPG or PNG file (max 2MB).' });
      }
      const mime = req.file.mimetype;
      const b64 = req.file.buffer.toString('base64');
      const dataUri = `data:${mime};base64,${b64}`;

      const user = req.currentUser!;
      user.avatarUrl = dataUri;
      user.updatedAt = new Date().toISOString();
      saveStore();

      res.json({
        message: 'Avatar uploaded and saved successfully',
        avatarUrl: dataUri,
        user: sanitizeUser(user),
      });
    }
  );

  // ==========================================
  // STOREFRONT & CATALOG ROUTES
  // ==========================================
  app.get('/api/products', (_req: Request, res: Response) => {
    const store = getStore();
    res.json(store.products);
  });

  app.get('/api/products/:id', (req: Request, res: Response) => {
    const store = getStore();
    const prod = store.products.find((p) => p.id === Number(req.params.id));
    if (!prod) return res.status(404).json({ error: 'Product not found' });
    res.json(prod);
  });

  app.get('/api/subscriptions', (req: AuthedRequest, res: Response) => {
    const user = optionalAuth(req);
    if (!user) {
      return res.json([]);
    }
    const store = getStore();
    const subs = store.subscriptions.filter((s) => s.customerId === user.id);
    res.json(subs);
  });

  app.post('/api/subscriptions', requireAuth(['customer']), (req: AuthedRequest, res: Response) => {
    const { productId, quantity, slot, frequency } = req.body || {};
    const store = getStore();
    const product = store.products.find((p) => p.id === Number(productId));
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const now = new Date();
    const nextDate = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
    const newSub: MilkSubscription = {
      id: `sub_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      customerId: req.currentUser!.id,
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      quantity: Math.max(1, Number(quantity) || 1),
      priceInr: product.priceInr,
      slot: slot || 'Morning (05:30 - 07:30 AM)',
      frequency: frequency || 'Daily',
      status: 'ACTIVE',
      nextDeliveryDate: nextDate,
      createdAt: now.toISOString(),
    };

    store.subscriptions.unshift(newSub);
    saveStore();
    res.status(201).json(newSub);
  });

  app.patch(['/api/subscriptions/:id', '/api/subscriptions/:id/toggle'], requireAuth(['customer']), (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const sub = store.subscriptions.find((s) => s.id === req.params.id && s.customerId === req.currentUser!.id);
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });

    const { status, quantity, slot } = req.body || {};
    if (req.path.endsWith('/toggle')) {
      sub.status = sub.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    } else if (status && ['ACTIVE', 'PAUSED'].includes(status)) {
      sub.status = status;
    }
    if (quantity) sub.quantity = Math.max(1, Number(quantity));
    if (slot) sub.slot = slot;

    saveStore();
    res.json(sub);
  });

  app.get(['/api/orders', '/api/orders/my-orders'], (req: AuthedRequest, res: Response) => {
    const user = optionalAuth(req);
    if (!user) {
      return res.json([]);
    }
    const store = getStore();
    if (user.role === 'admin') {
      return res.json(store.orders);
    }
    const orders = store.orders.filter((o) => o.customerId === user.id);
    res.json(orders);
  });

  app.post(['/api/orders', '/api/orders/checkout'], requireAuth(['customer', 'admin']), async (req: AuthedRequest, res: Response) => {
    try {
      const user = req.currentUser!;
      const { items, paymentMethod, deliveryAddress, pinCode, deliverySlot, isSubscription, subscriptionFrequency } =
        req.body || {};

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Cart is empty' });
      }

      const store = getStore();
      let subtotal = 0;
      const orderItems: OrderRecord['items'] = [];

      for (const item of items) {
        const prod = store.products.find((p) => p.id === Number(item.productId));
        if (!prod) {
          return res.status(400).json({ error: `Product ID #${item.productId} does not exist.` });
        }
        const qty = Math.max(1, Number(item.quantity) || 1);
        subtotal += prod.priceInr * qty;
        orderItems.push({
          productId: prod.id,
          productName: prod.name,
          unit: prod.unit,
          quantity: qty,
          priceInr: prod.priceInr,
          imageUrl: prod.imageUrl,
        });
      }

      const totalInr = subtotal + DELIVERY_FEE_INR;
      const cleanAddress = String(deliveryAddress || user.address || 'Madhapur, Hyderabad, TG');
      const cleanPin = /^500\d{3}$/.test(String(pinCode || user.pinCode))
        ? String(pinCode || user.pinCode)
        : '500081';

      const now = new Date().toISOString();
      const orderNum = `PR-HYD-${Math.floor(1000 + Math.random() * 9000)}`;
      const orderId = `ord_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

      const newOrder: OrderRecord = {
        id: orderId,
        orderNumber: orderNum,
        customerId: user.id,
        customerName: user.name,
        customerEmail: user.email,
        customerPhone: user.phone,
        deliveryAddress: cleanAddress,
        pinCode: cleanPin,
        deliveryCoordinates: user.coordinates || { lat: 17.4486, lng: 78.3908 },
        deliverySlot: deliverySlot || 'Morning (05:30 - 07:30 AM)',
        isSubscription: Boolean(isSubscription),
        subscriptionFrequency: subscriptionFrequency || 'Daily',
        items: orderItems,
        subtotalInr: subtotal,
        deliveryFeeInr: DELIVERY_FEE_INR,
        totalInr,
        paymentMethod: paymentMethod === 'COD' ? 'COD' : 'PREPAID',
        paymentStatus: paymentMethod === 'COD' ? 'PENDING_COD' : 'PAID',
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
        createdAt: now,
        updatedAt: now,
      };

      store.orders.unshift(newOrder);
      saveStore();

      // Dispatch order confirmation to customer via Zoho SMTP
      sendTransactionalEmail(
        {
          toEmail: user.email,
          toName: user.name,
          subject: `PureRoute Order #${newOrder.orderNumber} Confirmed (Doorstep OTP: ${newOrder.deliveryOtp})`,
          htmlContent: templateOrderPlacedCustomer(newOrder),
        },
        recordEmail
      ).catch((e) => console.warn('Customer order email error:', e));

      // Dispatch real-time reservation alert to active Farm Partners / Merchants
      const merchants = store.users.filter((u) => u.role === 'merchant');
      for (const m of merchants) {
        sendTransactionalEmail(
          {
            toEmail: m.email,
            toName: m.name,
            subject: `[PureRoute Farm Alert] New Milk Order #${newOrder.orderNumber} Reserved`,
            htmlContent: templateMerchantOrderAlert(newOrder, m.name),
          },
          recordEmail
        ).catch((e) => console.warn('Merchant order alert error:', e));
      }

      res.status(201).json(newOrder);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Checkout failed' });
    }
  });

  // ==========================================
  // FEEDBACK ROUTES
  // ==========================================
  app.post('/api/feedback/preferences', requireAuth(), async (req: AuthedRequest, res: Response) => {
    const { dontAskAgain } = req.body || {};
    const userId = req.currentUser!.id;
    await saveFeedbackPreference(userId, Boolean(dontAskAgain));
    res.json({ success: true, userId, dontAskAgain: Boolean(dontAskAgain) });
  });

  app.get('/api/feedback', (_req: Request, res: Response) => {
    const store = getStore();
    res.json(store.reviews);
  });

  app.get('/api/feedback/pending', requireAuth(['customer']), (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const user = req.currentUser!;
    const nowMs = Date.now();
    const fifteenMinsMs = 15 * 60 * 1000;
    const oneHourMs = 60 * 60 * 1000;

    const eligible = store.orders.find((o) => {
      if (o.customerId !== user.id) return false;
      if (o.status !== 'DELIVERED') return false;
      if (o.feedbackSubmitted) return false;
      if (o.feedbackDontAskAgain) return false;
      if (!o.deliveredAt) return false;

      const delMs = new Date(o.deliveredAt).getTime();
      if (nowMs - delMs < fifteenMinsMs) return false;
      if (o.lastFeedbackPromptAt) {
        const lastPromptMs = new Date(o.lastFeedbackPromptAt).getTime();
        if (nowMs - lastPromptMs < oneHourMs) return false;
      }
      return true;
    });

    if (eligible) {
      eligible.lastFeedbackPromptAt = new Date().toISOString();
      saveStore();
    }
    res.json(eligible || null);
  });

  app.post('/api/feedback/dismiss', requireAuth(['customer']), (req: AuthedRequest, res: Response) => {
    const { orderId, dontAskAgain } = req.body || {};
    const store = getStore();
    const order = store.orders.find((o) => o.id === orderId && o.customerId === req.currentUser!.id);
    if (order) {
      order.lastFeedbackPromptAt = new Date().toISOString();
      if (dontAskAgain) {
        order.feedbackDontAskAgain = true;
      }
      saveStore();
    }
    res.json({ success: true });
  });

  app.post('/api/feedback', requireAuth(['customer']), (req: AuthedRequest, res: Response) => {
    const { orderId, productId, rating, comment } = req.body || {};
    const user = req.currentUser!;
    const store = getStore();

    const product = store.products.find((p) => p.id === Number(productId));
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const order = store.orders.find((o) => o.id === orderId && o.customerId === user.id);

    const review = {
      id: `rev_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,
      orderId: orderId || 'direct_review',
      productId: product.id,
      customerId: user.id,
      customerName: user.name,
      customerAvatarUrl: user.avatarUrl,
      rating: Math.min(5, Math.max(1, Number(rating) || 5)),
      comment: String(comment || 'Chilled and fresh!'),
      createdAt: new Date().toISOString(),
    };

    store.reviews.unshift(review);
    const prodReviews = store.reviews.filter((r) => r.productId === product.id);
    product.reviewCount = prodReviews.length;
    product.ratingAvg = Number(
      (prodReviews.reduce((acc, r) => acc + r.rating, 0) / Math.max(1, prodReviews.length)).toFixed(1)
    );

    if (order) {
      order.feedbackSubmitted = true;
      order.updatedAt = new Date().toISOString();
    }
    saveStore();
    res.status(201).json(review);
  });

  // ==========================================
  // DELIVERY AGENT PORTAL ROUTES
  // ==========================================
  app.post('/api/agent/heartbeat', requireAuth(['agent']), (req: AuthedRequest, res: Response) => {
    const agent = req.currentUser!;
    const { coordinates } = req.body || {};
    const now = new Date().toISOString();

    agent.lastActiveAt = now;
    agent.isLoggedIn = true;
    if (coordinates && typeof coordinates.lat === 'number' && typeof coordinates.lng === 'number') {
      agent.currentCoordinates = coordinates;
    }
    if (!agent.hasPendingCashDeposit && !agent.fifoQueueJoinedAt) {
      agent.fifoQueueJoinedAt = now;
    }
    agent.updatedAt = now;
    saveStore();

    checkAndExpireFifoOrders();

    const store = getStore();
    const assignedOrder = store.orders.find(
      (o) =>
        o.assignedAgentId === agent.id &&
        ['AWAITING_AGENT_ACCEPTANCE', 'OUT_FOR_DELIVERY', 'COD_QR_PENDING_ADMIN'].includes(o.status)
    );

    res.json({
      status: 'active',
      agentId: agent.id,
      hasPendingCashDeposit: agent.hasPendingCashDeposit,
      pendingCashAmount: agent.pendingCashAmount,
      fifoQueueJoinedAt: agent.fifoQueueJoinedAt,
      assignedOrder: assignedOrder ? toAgentMaskedOrder(assignedOrder) : null,
    });
  });

  app.get('/api/agent/orders', requireAuth(['agent']), (req: AuthedRequest, res: Response) => {
    const store = getStore();
    checkAndExpireFifoOrders();

    const agent = req.currentUser!;
    const activeOrder = store.orders.find(
      (o) =>
        o.assignedAgentId === agent.id &&
        ['AWAITING_AGENT_ACCEPTANCE', 'OUT_FOR_DELIVERY', 'COD_QR_PENDING_ADMIN'].includes(o.status)
    );

    res.json({
      activeOrder: activeOrder ? toAgentMaskedOrder(activeOrder) : null,
      hasPendingCashDeposit: agent.hasPendingCashDeposit,
      pendingCashAmount: agent.pendingCashAmount,
    });
  });

  app.post('/api/agent/orders/:id/accept', requireAuth(['agent']), async (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const agent = req.currentUser!;
    const order = store.orders.find((o) => o.id === req.params.id);

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.assignedAgentId !== agent.id) {
      return res.status(403).json({ error: 'This order offer has been reassigned.' });
    }
    if (order.status !== 'AWAITING_AGENT_ACCEPTANCE') {
      return res.status(400).json({ error: `Cannot accept order in status: ${order.status}` });
    }

    const otp = generateSixDigitOtp();
    const now = new Date().toISOString();

    order.status = 'OUT_FOR_DELIVERY';
    order.deliveryOtp = otp;
    order.offerExpiresAt = null;
    order.updatedAt = now;
    saveStore();

    await sendTransactionalEmail(
      {
        toEmail: order.customerEmail,
        toName: order.customerName,
        subject: `Out for Delivery! OTP: ${otp} — ${order.orderNumber}`,
        htmlContent: templateOrderDispatched(order, agent.name, agent.phone),
      },
      recordEmail
    );

    res.json(toAgentMaskedOrder(order));
  });

  app.post('/api/agent/orders/:id/reject', requireAuth(['agent']), (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const agent = req.currentUser!;
    const order = store.orders.find((o) => o.id === req.params.id);

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.assignedAgentId !== agent.id) {
      return res.status(403).json({ error: 'Not authorized for this order offer.' });
    }

    agent.fifoQueueJoinedAt = new Date().toISOString();
    agent.updatedAt = new Date().toISOString();

    if (!order.rejectedAgentIds.includes(agent.id)) {
      order.rejectedAgentIds.push(agent.id);
    }

    assignOrderToNextFifoAgent(order);
    saveStore();

    res.json({ message: 'Offer rejected. Order rotated to next available courier.' });
  });

  app.post('/api/agent/orders/:id/verify-otp', requireAuth(['agent']), (req: AuthedRequest, res: Response) => {
    const { otp, paymentType } = req.body || {};
    const store = getStore();
    const agent = req.currentUser!;
    const order = store.orders.find((o) => o.id === req.params.id);

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.assignedAgentId !== agent.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (order.status !== 'OUT_FOR_DELIVERY') {
      return res.status(400).json({ error: 'Order must be OUT_FOR_DELIVERY to complete.' });
    }
    if (String(otp).trim() !== String(order.deliveryOtp)) {
      return res.status(400).json({ error: 'Invalid 6-digit Delivery OTP.' });
    }

    const now = new Date().toISOString();
    order.otpVerifiedAt = now;
    order.deliveredAt = now;
    order.status = 'DELIVERED';
    order.updatedAt = now;

    if (order.paymentMethod === 'COD' && paymentType === 'CASH') {
      order.codMethodUsed = 'CASH';
      order.paymentStatus = 'CASH_COLLECTED';
      order.cashDepositStatus = 'PENDING_ADMIN_REQUEST';

      agent.hasPendingCashDeposit = true;
      agent.pendingCashAmount += order.totalInr;
      agent.fifoQueueJoinedAt = null;
    } else {
      order.paymentStatus = 'PAID';
      agent.walletBalance += 45;
      agent.fifoQueueJoinedAt = now;
    }

    agent.completedDeliveries += 1;
    agent.updatedAt = now;
    saveStore();

    // Dispatch delivery completion notification with Zoho SMTP
    sendTransactionalEmail(
      {
        toEmail: order.customerEmail,
        toName: order.customerName,
        subject: `Order Delivered Successfully! #${order.orderNumber}`,
        htmlContent: templateOrderDelivered(order),
      },
      recordEmail
    ).catch((e) => console.warn('Delivery email error:', e));

    res.json({
      message: 'Delivery completed successfully.',
      order: toAgentMaskedOrder(order),
      agentStatus: {
        hasPendingCashDeposit: agent.hasPendingCashDeposit,
        pendingCashAmount: agent.pendingCashAmount,
      },
    });
  });

  app.post('/api/agent/orders/:id/generate-upi-qr', requireAuth(['agent']), async (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const order = store.orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const merchantVpa = process.env.UPI_MERCHANT_VPA || 'pureroute.hyd@icici';
    const merchantName = encodeURIComponent(process.env.UPI_MERCHANT_NAME || 'PureRoute Dairy Hyderabad');
    const upiPayload = `upi://pay?pa=${merchantVpa}&pn=${merchantName}&am=${order.totalInr}&cu=INR&tn=PureRoute-${order.orderNumber}`;

    const qrDataUrl = await QRCode.toDataURL(upiPayload, {
      margin: 1,
      width: 320,
      color: { dark: '#081119', light: '#f8f5ef' },
    });

    order.upiQrPayload = upiPayload;
    order.upiQrDataUrl = qrDataUrl;
    order.codMethodUsed = 'UPI_QR';
    order.updatedAt = new Date().toISOString();
    saveStore();

    res.json({ upiPayload, qrDataUrl });
  });

  app.post('/api/agent/orders/:id/mark-qr-paid', requireAuth(['agent']), (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const order = store.orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    order.status = 'COD_QR_PENDING_ADMIN';
    order.paymentStatus = 'QR_PAID_AWAITING_ADMIN';
    order.updatedAt = new Date().toISOString();
    saveStore();

    res.json(toAgentMaskedOrder(order));
  });

  app.post('/api/agent/cash-deposit-store', requireAuth(['agent']), (req: AuthedRequest, res: Response) => {
    const agent = req.currentUser!;
    if (!agent.hasPendingCashDeposit) {
      return res.status(400).json({ error: 'No pending cash deposit to report.' });
    }

    const store = getStore();
    const orders = store.orders.filter(
      (o) => o.assignedAgentId === agent.id && o.cashDepositStatus === 'DEPOSIT_REQUESTED'
    );
    for (const o of orders) {
      o.cashDepositStatus = 'AGENT_DEPOSITED';
      o.updatedAt = new Date().toISOString();
    }

    saveStore();
    res.json({ message: 'Marked cash deposited at store. Waiting for Admin verification.' });
  });

  // ==========================================
  // MERCHANT PORTAL ROUTES
  // ==========================================
  app.get('/api/merchant/products', requireAuth(['merchant', 'admin']), (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const prods =
      req.currentUser!.role === 'admin'
        ? store.products
        : store.products.filter((p) => p.merchantId === req.currentUser!.id);
    res.json(prods);
  });

  app.post('/api/merchant/products', requireAuth(['merchant']), (req: AuthedRequest, res: Response) => {
    const merchant = req.currentUser!;
    const { name, category, unit, priceInr, fatPercent, snfPercent, harvestNote, stockQty, description, imageUrl } =
      req.body || {};

    if (!name || !priceInr || !fatPercent || !snfPercent) {
      return res.status(400).json({ error: 'Name, price, fat%, and SNF% are required.' });
    }

    const store = getStore();
    const nextId = Math.max(...store.products.map((p) => p.id), 100) + 1;

    const newProduct = {
      id: nextId,
      merchantId: merchant.id,
      merchantName: merchant.farmName || merchant.name,
      name: String(name),
      category: category || 'Buffalo Milk',
      unit: unit || '1 Litre Glass Bottle',
      priceInr: Number(priceInr),
      fatPercent: Number(fatPercent),
      snfPercent: Number(snfPercent),
      freshnessTimestamp: new Date().toISOString(),
      harvestNote: harvestNote || 'Milked fresh this morning',
      stockQty: Math.max(0, Number(stockQty) || 50),
      imageUrl: imageUrl || '/src/assets/images/product_buffalo_milk_1795152909255.jpg',
      description: description || 'Fresh farm-direct dairy batch.',
      supportsSubscription: true,
      ratingAvg: 5.0,
      reviewCount: 0,
    };

    store.products.unshift(newProduct);
    saveStore();
    res.status(201).json(newProduct);
  });

  app.patch('/api/merchant/products/:id', requireAuth(['merchant', 'admin']), (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const prod = store.products.find((p) => p.id === Number(req.params.id));
    if (!prod) return res.status(404).json({ error: 'Product not found' });
    if (req.currentUser!.role !== 'admin' && prod.merchantId !== req.currentUser!.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { stockQty, priceInr, harvestNote, fatPercent, snfPercent } = req.body || {};
    if (stockQty !== undefined) prod.stockQty = Math.max(0, Number(stockQty));
    if (priceInr !== undefined) prod.priceInr = Number(priceInr);
    if (harvestNote) prod.harvestNote = String(harvestNote);
    if (fatPercent !== undefined) prod.fatPercent = Number(fatPercent);
    if (snfPercent !== undefined) prod.snfPercent = Number(snfPercent);

    saveStore();
    res.json(prod);
  });

  // ==========================================
  // ADMIN CONSOLE ROUTES
  // ==========================================
  app.get('/api/admin/orders', requireAuth(['admin']), (_req: Request, res: Response) => {
    const store = getStore();
    checkAndExpireFifoOrders();
    res.json(store.orders);
  });

  app.get('/api/admin/agents', requireAuth(['admin']), (_req: Request, res: Response) => {
    const store = getStore();
    const agents = store.users.filter((u) => u.role === 'agent').map(sanitizeUser);
    res.json(agents);
  });

  app.post('/api/admin/orders/:id/process', requireAuth(['admin']), async (req: Request, res: Response) => {
    const store = getStore();
    const order = store.orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    order.status = 'PROCESSED';
    order.updatedAt = new Date().toISOString();

    const assigned = assignOrderToNextFifoAgent(order);
    saveStore();

    if (assigned) {
      await sendTransactionalEmail(
        {
          toEmail: assigned.email,
          toName: assigned.name,
          subject: `New PureRoute Order Offer: ${order.orderNumber}`,
          htmlContent: `<p>New order offer #${order.orderNumber} in Hyderabad. Please accept within ${order.offerDurationMinutes || 3} minutes.</p>`,
        },
        recordEmail
      );
    }

    res.json({ order, assignedAgent: assigned ? sanitizeUser(assigned) : null });
  });

  app.post('/api/admin/orders/:id/reassign', requireAuth(['admin']), (req: Request, res: Response) => {
    const { agentId } = req.body || {};
    const store = getStore();
    const order = store.orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const assigned = assignOrderToNextFifoAgent(order, agentId);
    if (!assigned) {
      return res.status(400).json({ error: 'Selected courier is unavailable or locked.' });
    }

    res.json({ order, assignedAgent: sanitizeUser(assigned) });
  });

  app.post('/api/admin/orders/:id/confirm-qr-payment', requireAuth(['admin']), (req: Request, res: Response) => {
    const store = getStore();
    const order = store.orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const now = new Date().toISOString();
    order.status = 'DELIVERED';
    order.paymentStatus = 'PAID';
    order.deliveredAt = now;
    order.updatedAt = now;

    if (order.assignedAgentId) {
      const agent = store.users.find((u) => u.id === order.assignedAgentId);
      if (agent) {
        agent.walletBalance += 45;
        agent.completedDeliveries += 1;
        if (!agent.hasPendingCashDeposit) {
          agent.fifoQueueJoinedAt = now;
        }
        agent.updatedAt = now;
      }
    }

    saveStore();
    res.json({ message: 'QR payment confirmed by Admin.', order });
  });

  app.post('/api/admin/orders/:id/request-cash-deposit', requireAuth(['admin']), (req: Request, res: Response) => {
    const store = getStore();
    const order = store.orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    order.cashDepositStatus = 'DEPOSIT_REQUESTED';
    order.updatedAt = new Date().toISOString();
    saveStore();

    res.json({ message: 'Sent Cash Deposit Request to Agent.', order });
  });

  app.post('/api/admin/orders/:id/confirm-cash-deposit', requireAuth(['admin']), (req: Request, res: Response) => {
    const store = getStore();
    const order = store.orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    order.cashDepositStatus = 'CONFIRMED';
    order.updatedAt = new Date().toISOString();

    if (order.assignedAgentId) {
      const agent = store.users.find((u) => u.id === order.assignedAgentId);
      if (agent) {
        agent.pendingCashAmount = Math.max(0, agent.pendingCashAmount - order.totalInr);
        if (agent.pendingCashAmount === 0) {
          agent.hasPendingCashDeposit = false;
          agent.fifoQueueJoinedAt = new Date().toISOString();
        }
        agent.walletBalance += 45;
        agent.updatedAt = new Date().toISOString();
      }
    }

    saveStore();
    res.json({ message: 'Cash deposit confirmed. Courier lockout cleared.', order });
  });

  return app;
}
