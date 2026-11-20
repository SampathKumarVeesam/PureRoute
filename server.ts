import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import QRCode from 'qrcode';
import swaggerUi from 'swagger-ui-express';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import {
  HYDERABAD_HUB,
  formatIndianPhone,
  isValidIndianPhone,
  type AgentMaskedOrder,
  type OrderRecord,
  type UserRecord,
  type UserRole,
} from './src/types/domain.ts';
import { getEligibleActiveAgents, getStore, sanitizeUser, saveStore } from './server/store.ts';
import { sendBrevoTransactionalEmail } from './server/brevo.ts';
import { openApiSpec } from './server/openapi.ts';

dotenv.config();

const PORT = 3000;
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
    // STRICT PRIVACY MASKING: Product IDs & quantity ONLY. Never names, descriptions, or images!
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

// FIFO Active-Agent Auto-Assignment Engine
function assignOrderToNextFifoAgent(order: OrderRecord, preferredAgentId?: string): UserRecord | null {
  const store = getStore();
  const eligible = getEligibleActiveAgents(order.rejectedAgentIds);

  let chosen: UserRecord | undefined;
  if (preferredAgentId) {
    chosen = eligible.find((a) => a.id === preferredAgentId);
    if (!chosen) {
      // Allow admin reassignment even if agent was previously rejected, provided they are eligible & unlocked
      chosen = getEligibleActiveAgents([]).find((a) => a.id === preferredAgentId);
    }
  } else {
    chosen = eligible[0];
    // If everyone rejected once, wrap around to eligible pool cleanly
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

// 15-Second Background Watcher for Expired FIFO Offers
function startFifoExpirationWatcher() {
  setInterval(() => {
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
              // Reset fifo_queue_joined_at to NOW() -> pushes agent to the very back of FIFO queue
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
  }, 15_000);
}

// Auth Middleware
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

// Multer configuration for JPG/PNG max 2MB Avatar Upload
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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // Initialize seed store on startup
  getStore();
  startFifoExpirationWatcher();

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

  // Health & Public Email Sandbox Outbox (for testing 2-step verification & OTPs)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', hub: HYDERABAD_HUB.name, timestamp: new Date().toISOString() });
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
        // 2-Step Email-Verified Temporary Password Onboarding for Delivery Agents
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
          address: String(address || 'Madhapur, Hyderabad, TG').trim(),
          pinCode: cleanPin,
          coordinates: { lat: HYDERABAD_HUB.lat, lng: HYDERABAD_HUB.lng },
          currentCoordinates: { lat: HYDERABAD_HUB.lat, lng: HYDERABAD_HUB.lng },
          isEmailVerified: false,
          emailVerificationToken: verificationToken,
          mustChangePassword: true,
          isLoggedIn: false,
          lastActiveAt: null,
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

        const baseUrl = process.env.APP_URL || `http://localhost:${PORT}`;
        const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${verificationToken}`;

        await sendBrevoTransactionalEmail(
          {
            toEmail: newAgent.email,
            toName: newAgent.name,
            subject: 'Verify your PureRoute Hyderabad Delivery Agent Account',
            htmlContent: `
              <h2>Welcome to PureRoute Delivery Fleet, ${newAgent.name}</h2>
              <p>Step 1 of 2: Please verify your email address to receive your one-time Temporary Password.</p>
              <p><a href="${verifyUrl}">Verify Email Address</a></p>
              <p>Verification Token: <strong>${verificationToken}</strong></p>
            `,
            meta: { type: 'AGENT_EMAIL_VERIFICATION', verificationToken, email: newAgent.email },
          },
          recordEmail
        );

        return res.status(201).json({
          message:
            'Agent registered! Step 1: Please verify your email via the Brevo verification email to receive your Temporary Password.',
          requiresEmailVerification: true,
          verificationToken,
          user: sanitizeUser(newAgent),
        });
      }

      // Customer or Merchant Registration
      if (!password || String(password).length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      }

      const newUser: UserRecord = {
        id: `usr_${validRole}_${crypto.randomBytes(4).toString('hex')}`,
        email: cleanEmail,
        passwordHash: bcrypt.hashSync(String(password), 10),
        name: String(name).trim(),
        phone: formattedPhone,
        gender: validGender,
        avatarUrl: avatarUrl || 'preset:neutral-1',
        role: validRole,
        farmName: validRole === 'merchant' ? String(farmName || `${String(name).trim()} Dairy Farm`) : undefined,
        merchantVerified: validRole === 'merchant' ? false : undefined,
        address: String(address || 'Jubilee Hills, Hyderabad, TG').trim(),
        pinCode: cleanPin,
        coordinates: { lat: 17.4319, lng: 78.4071 },
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

      store.users.push(newUser);
      saveStore();

      await sendBrevoTransactionalEmail(
        {
          toEmail: newUser.email,
          toName: newUser.name,
          subject: `Welcome to PureRoute LocalMilkforYou Hyderabad`,
          htmlContent: `<p>Namaste ${newUser.name}, your ${validRole} account on PureRoute Hyderabad is active.</p>`,
          meta: { type: 'WELCOME', role: validRole },
        },
        recordEmail
      );

      const token = signToken(newUser);
      res.status(201).json({ token, user: sanitizeUser(newUser) });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Registration failed' });
    }
  });

  app.get('/api/auth/verify-email', async (req: Request, res: Response) => {
    const token = String(req.query.token || '').trim();
    if (!token) {
      return res.status(400).json({ error: 'Missing verification token.' });
    }
    const store = getStore();
    const user = store.users.find((u) => u.emailVerificationToken === token);
    if (!user) {
      return res.status(404).json({ error: 'Invalid or expired verification token.' });
    }

    const tempPassword = generateTempPassword();
    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    user.passwordHash = bcrypt.hashSync(tempPassword, 10);
    user.mustChangePassword = true;
    user.updatedAt = new Date().toISOString();
    saveStore();

    await sendBrevoTransactionalEmail(
      {
        toEmail: user.email,
        toName: user.name,
        subject: 'Your PureRoute Delivery Agent Temporary Password',
        htmlContent: `
          <h2>Email Verified Successfully</h2>
          <p>Hi ${user.name}, your email is verified. Use this Temporary Password for your first login:</p>
          <p style="font-size:20px;font-weight:bold;letter-spacing:2px;">${tempPassword}</p>
          <p>You will be prompted to set a permanent password right after signing in.</p>
        `,
        meta: { type: 'AGENT_TEMP_PASSWORD', tempPassword, email: user.email },
      },
      recordEmail
    );

    res.json({
      message: 'Email verified! A Temporary Password has been sent via Brevo HTTPS API.',
      email: user.email,
      tempPasswordPreview: tempPassword,
    });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const store = getStore();
    const user = store.users.find((u) => u.email.toLowerCase() === cleanEmail);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (!user.isEmailVerified) {
      return res.status(403).json({
        error: 'Login blocked: Please verify your email first to receive your Temporary Password.',
        requiresEmailVerification: true,
      });
    }
    if (!bcrypt.compareSync(String(password || ''), user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const now = new Date().toISOString();
    user.isLoggedIn = true;
    user.lastActiveAt = now;
    if (user.role === 'agent' && !user.fifoQueueJoinedAt) {
      user.fifoQueueJoinedAt = now;
    }
    user.updatedAt = now;
    saveStore();

    const token = signToken(user);
    res.json({ token, user: sanitizeUser(user) });
  });

  app.post('/api/auth/google', (req: Request, res: Response) => {
    const { firebaseUid, email, name, avatarUrl } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!firebaseUid || !cleanEmail) {
      return res.status(400).json({ error: 'Missing Google OIDC identity fields.' });
    }

    const store = getStore();
    let user = store.users.find((u) => u.firebaseUid === firebaseUid || u.email.toLowerCase() === cleanEmail);
    const now = new Date().toISOString();

    if (!user) {
      const assignedRole: UserRole = cleanEmail === 'learnwithai951@gmail.com' ? 'admin' : 'customer';
      user = {
        id: `usr_google_${crypto.randomBytes(4).toString('hex')}`,
        firebaseUid: String(firebaseUid),
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
      user.firebaseUid = String(firebaseUid);
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
    res.json({ message: 'Signed out cleanly.' });
  });

  app.post('/api/auth/change-password', requireAuth(), (req: AuthedRequest, res: Response) => {
    const { currentPassword, newPassword } = req.body || {};
    const user = req.currentUser!;
    if (!bcrypt.compareSync(String(currentPassword || ''), user.passwordHash)) {
      return res.status(400).json({ error: 'Current/temporary password is incorrect.' });
    }
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: 'New permanent password must be at least 8 characters.' });
    }
    user.passwordHash = bcrypt.hashSync(String(newPassword), 10);
    user.mustChangePassword = false;
    user.updatedAt = new Date().toISOString();
    saveStore();
    res.json({ message: 'Permanent password updated successfully.', user: sanitizeUser(user) });
  });

  app.get('/api/profile', requireAuth(), (req: AuthedRequest, res: Response) => {
    res.json(sanitizeUser(req.currentUser!));
  });

  app.patch('/api/profile', requireAuth(), (req: AuthedRequest, res: Response) => {
    const user = req.currentUser!;
    const { name, phone, gender, avatarUrl, address, pinCode } = req.body || {};

    if (name !== undefined) {
      if (String(name).trim().length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters.' });
      }
      user.name = String(name).trim();
    }
    if (phone !== undefined) {
      const formatted = formatIndianPhone(String(phone));
      if (!isValidIndianPhone(formatted)) {
        return res.status(400).json({ error: 'Phone must be a valid Indian +91 10-digit mobile number.' });
      }
      user.phone = formatted;
    }
    if (gender !== undefined && ['Male', 'Female', 'Non-Binary', 'Prefer not to say'].includes(gender)) {
      user.gender = gender;
    }
    if (avatarUrl !== undefined) {
      const val = String(avatarUrl);
      const isPreset = val.startsWith('preset:');
      const isSafeDataUri = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(val) && val.length <= 2_900_000;
      if (!isPreset && !isSafeDataUri) {
        return res.status(400).json({ error: 'Avatar must be a preset avatar or a validated JPG/PNG base64 image.' });
      }
      user.avatarUrl = val;
    }
    if (address !== undefined) {
      user.address = String(address).trim().slice(0, 300);
    }
    if (pinCode !== undefined) {
      if (!/^500\d{3}$/.test(String(pinCode))) {
        return res.status(400).json({ error: 'Please enter a valid Hyderabad PIN code (500xxx).' });
      }
      user.pinCode = String(pinCode);
    }

    user.updatedAt = new Date().toISOString();
    saveStore();
    res.json(sanitizeUser(user));
  });

  app.post('/api/upload/avatar', requireAuth(), (req: AuthedRequest, res: Response) => {
    avatarUpload.single('avatar')(req, res, (err: any) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Invalid image upload. Only JPG/PNG up to 2MB allowed.' });
      }
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No image file provided under field "avatar".' });
      }
      // Verify magic bytes for JPEG (FF D8 FF) or PNG (89 50 4E 47)
      const isJpeg = file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
      const isPng =
        file.buffer[0] === 0x89 && file.buffer[1] === 0x50 && file.buffer[2] === 0x4e && file.buffer[3] === 0x47;
      if (!isJpeg && !isPng) {
        return res.status(400).json({ error: 'File signature validation failed. Only real JPG or PNG images accepted.' });
      }

      const mime = isPng ? 'image/png' : 'image/jpeg';
      const dataUri = `data:${mime};base64,${file.buffer.toString('base64')}`;
      const user = req.currentUser!;
      user.avatarUrl = dataUri;
      user.updatedAt = new Date().toISOString();
      saveStore();
      res.json({ avatarUrl: dataUri, user: sanitizeUser(user) });
    });
  });

  // ==========================================
  // STOREFRONT & CUSTOMER ROUTES
  // ==========================================
  app.get('/api/products', (_req, res) => {
    const store = getStore();
    res.json(store.products);
  });

  app.get('/api/subscriptions', requireAuth(['customer', 'admin']), (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const list =
      req.currentUser!.role === 'admin'
        ? store.subscriptions
        : store.subscriptions.filter((s) => s.customerId === req.currentUser!.id);
    res.json(list);
  });

  app.post('/api/subscriptions', requireAuth(['customer', 'admin']), (req: AuthedRequest, res: Response) => {
    const { productId, quantity, slot, frequency } = req.body || {};
    const store = getStore();
    const product = store.products.find((p) => p.id === Number(productId));
    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    const sub = {
      id: `sub_${crypto.randomBytes(4).toString('hex')}`,
      customerId: req.currentUser!.id,
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      quantity: Math.max(1, Number(quantity) || 1),
      priceInr: product.priceInr,
      slot:
        slot === 'Evening (05:00 - 07:00 PM)'
          ? ('Evening (05:00 - 07:00 PM)' as const)
          : ('Morning (05:30 - 07:30 AM)' as const),
      frequency: (['Daily', 'Alternate Days', 'Weekdays'].includes(frequency) ? frequency : 'Daily') as
        | 'Daily'
        | 'Alternate Days'
        | 'Weekdays',
      status: 'ACTIVE' as const,
      nextDeliveryDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    };
    store.subscriptions.unshift(sub);
    saveStore();
    res.status(201).json(sub);
  });

  app.patch('/api/subscriptions/:id/toggle', requireAuth(['customer', 'admin']), (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const sub = store.subscriptions.find((s) => s.id === req.params.id && s.customerId === req.currentUser!.id);
    if (!sub) return res.status(404).json({ error: 'Subscription not found.' });
    sub.status = sub.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    saveStore();
    res.json(sub);
  });

  app.get('/api/orders', requireAuth(['customer', 'admin']), (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const orders =
      req.currentUser!.role === 'admin'
        ? store.orders
        : store.orders.filter((o) => o.customerId === req.currentUser!.id);
    res.json(orders);
  });

  app.post('/api/orders', requireAuth(['customer', 'admin']), async (req: AuthedRequest, res: Response) => {
    const { items, deliveryAddress, pinCode, lat, lng, deliverySlot, paymentMethod, isSubscription, subscriptionFrequency } =
      req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Cart is empty.' });
    }
    const cleanPin = String(pinCode || req.currentUser!.pinCode || '500081');
    if (!/^500\d{3}$/.test(cleanPin)) {
      return res.status(400).json({ error: 'Delivery is currently available across Hyderabad PIN codes (500xxx).' });
    }

    const store = getStore();
    const resolvedItems = [];
    let subtotal = 0;

    for (const rawItem of items) {
      const product = store.products.find((p) => p.id === Number(rawItem.productId));
      const qty = Math.max(1, Number(rawItem.quantity) || 1);
      if (!product) {
        return res.status(404).json({ error: `Product #${rawItem.productId} not found.` });
      }
      if (product.stockQty < qty) {
        return res.status(400).json({ error: `Insufficient stock for ${product.name}.` });
      }
      product.stockQty -= qty;
      subtotal += product.priceInr * qty;
      resolvedItems.push({
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        quantity: qty,
        priceInr: product.priceInr,
        imageUrl: product.imageUrl,
      });
    }

    const method = paymentMethod === 'COD' ? 'COD' : 'PREPAID';
    const now = new Date().toISOString();
    const orderNumber = `PR-HYD-${1003 + store.orders.length}`;
    const user = req.currentUser!;

    const order: OrderRecord = {
      id: `ord_${crypto.randomBytes(5).toString('hex')}`,
      orderNumber,
      customerId: user.id,
      customerName: user.name,
      customerEmail: user.email,
      customerPhone: user.phone,
      deliveryAddress: String(deliveryAddress || user.address).trim(),
      pinCode: cleanPin,
      deliveryCoordinates: {
        lat: Number(lat) || user.coordinates.lat || 17.4319,
        lng: Number(lng) || user.coordinates.lng || 78.4071,
      },
      deliverySlot:
        deliverySlot === 'Evening (05:00 - 07:00 PM)'
          ? 'Evening (05:00 - 07:00 PM)'
          : 'Morning (05:30 - 07:30 AM)',
      isSubscription: Boolean(isSubscription),
      subscriptionFrequency: isSubscription ? subscriptionFrequency || 'Daily' : undefined,
      items: resolvedItems,
      subtotalInr: subtotal,
      deliveryFeeInr: DELIVERY_FEE_INR,
      totalInr: subtotal + DELIVERY_FEE_INR,
      paymentMethod: method,
      paymentStatus: method === 'PREPAID' ? 'PAID' : 'PENDING_COD',
      status: 'PROCESSING',
      assignedAgentId: null,
      assignedAgentName: null,
      assignedAgentPhone: null,
      offerAssignedAt: null,
      offerExpiresAt: null,
      offerDurationMinutes: store.settings.fifoOfferMinutes,
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

    store.orders.unshift(order);
    saveStore();

    await sendBrevoTransactionalEmail(
      {
        toEmail: order.customerEmail,
        toName: order.customerName,
        subject: `Order ${order.orderNumber} Received — PureRoute Hyderabad`,
        htmlContent: `<p>Hi ${order.customerName}, your farm-direct dairy order <strong>${order.orderNumber}</strong> (₹${order.totalInr}) is in <strong>PROCESSING</strong> at our Madhapur Dairy Hub.</p>`,
        meta: { type: 'ORDER_PLACED', orderNumber: order.orderNumber },
      },
      recordEmail
    );

    res.status(201).json(order);
  });

  // ==========================================
  // MERCHANT PORTAL ROUTES
  // ==========================================
  app.get('/api/merchant/products', requireAuth(['merchant', 'admin']), (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const list =
      req.currentUser!.role === 'admin'
        ? store.products
        : store.products.filter((p) => p.merchantId === req.currentUser!.id);
    res.json(list);
  });

  app.post('/api/merchant/products', requireAuth(['merchant', 'admin']), (req: AuthedRequest, res: Response) => {
    const { name, category, unit, priceInr, fatPercent, snfPercent, harvestNote, stockQty, description, supportsSubscription } =
      req.body || {};
    if (!name || !priceInr) {
      return res.status(400).json({ error: 'Product name and price in INR are required.' });
    }
    const store = getStore();
    const nextId = store.products.reduce((max, p) => Math.max(max, p.id), 100) + 1;
    const cat = ['Buffalo Milk', 'A2 Cow Milk', 'Curd & Paneer', 'Ghee & Buttermilk'].includes(category)
      ? category
      : 'Buffalo Milk';
    const defaultImg =
      cat === 'A2 Cow Milk'
        ? '/src/assets/images/product_a2_cow_milk_1795152909986.jpg'
        : cat === 'Curd & Paneer'
          ? '/src/assets/images/product_curd_paneer_1795152909468.jpg'
          : cat === 'Ghee & Buttermilk'
            ? '/src/assets/images/product_ghee_chaas_1795152910165.jpg'
            : '/src/assets/images/product_buffalo_milk_1795152909255.jpg';

    const product = {
      id: nextId,
      merchantId: req.currentUser!.id,
      merchantName: req.currentUser!.farmName || req.currentUser!.name,
      name: String(name).trim(),
      category: cat,
      unit: String(unit || '1 Litre Glass Bottle').trim(),
      priceInr: Math.max(10, Number(priceInr)),
      fatPercent: Number(fatPercent) || 6.5,
      snfPercent: Number(snfPercent) || 8.8,
      freshnessTimestamp: new Date().toISOString(),
      harvestNote: String(harvestNote || 'Fresh morning batch chilled to 4°C').trim(),
      stockQty: Math.max(1, Number(stockQty) || 25),
      imageUrl: defaultImg,
      description: String(description || 'Farm-direct local Hyderabad dairy batch.').trim(),
      supportsSubscription: Boolean(supportsSubscription ?? true),
      ratingAvg: 5.0,
      reviewCount: 0,
    };
    store.products.unshift(product);
    saveStore();
    res.status(201).json(product);
  });

  app.patch('/api/merchant/products/:id/stock', requireAuth(['merchant', 'admin']), (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const product = store.products.find((p) => p.id === Number(req.params.id));
    if (!product) return res.status(404).json({ error: 'Batch not found.' });
    if (req.currentUser!.role !== 'admin' && product.merchantId !== req.currentUser!.id) {
      return res.status(403).json({ error: 'Not authorized for this batch.' });
    }
    product.stockQty = Math.max(0, Number(req.body?.stockQty ?? product.stockQty));
    product.freshnessTimestamp = new Date().toISOString();
    if (req.body?.harvestNote) product.harvestNote = String(req.body.harvestNote);
    saveStore();
    res.json(product);
  });

  app.get('/api/merchant/orders', requireAuth(['merchant', 'admin']), (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const myProductIds = new Set(
      store.products
        .filter((p) => req.currentUser!.role === 'admin' || p.merchantId === req.currentUser!.id)
        .map((p) => p.id)
    );
    const relevant = store.orders.filter((o) => o.items.some((i) => myProductIds.has(i.productId)));
    res.json(relevant);
  });

  // ==========================================
  // DELIVERY AGENT PORTAL ROUTES (PRIVACY-MASKED)
  // ==========================================
  app.post('/api/agent/heartbeat', requireAuth(['agent']), (req: AuthedRequest, res: Response) => {
    const agent = req.currentUser!;
    const now = new Date().toISOString();
    agent.isLoggedIn = true;
    agent.lastActiveAt = now;
    if (!agent.fifoQueueJoinedAt && !agent.hasPendingCashDeposit) {
      agent.fifoQueueJoinedAt = now;
    }
    if (req.body?.lat && req.body?.lng) {
      agent.currentCoordinates = { lat: Number(req.body.lat), lng: Number(req.body.lng) };
    }
    agent.updatedAt = now;
    saveStore();

    const queue = getEligibleActiveAgents([]);
    const rank = queue.findIndex((a) => a.id === agent.id) + 1;

    res.json({
      isLoggedIn: agent.isLoggedIn,
      lastActiveAt: agent.lastActiveAt,
      fifoQueueRank: rank > 0 ? rank : null,
      hasPendingCashDeposit: agent.hasPendingCashDeposit,
      pendingCashAmount: agent.pendingCashAmount,
      walletBalance: agent.walletBalance,
    });
  });

  app.get('/api/agent/orders', requireAuth(['agent']), (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const agent = req.currentUser!;
    const myOrders = store.orders
      .filter((o) => o.assignedAgentId === agent.id)
      .map((o) => toAgentMaskedOrder(o));

    const queue = getEligibleActiveAgents([]);
    const rank = queue.findIndex((a) => a.id === agent.id) + 1;

    res.json({
      agent: sanitizeUser(agent),
      fifoQueueRank: rank > 0 ? rank : null,
      totalActiveQueue: queue.length,
      orders: myOrders,
    });
  });

  app.post('/api/agent/orders/:id/accept', requireAuth(['agent']), async (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const agent = req.currentUser!;
    const order = store.orders.find((o) => o.id === req.params.id && o.assignedAgentId === agent.id);
    if (!order) return res.status(404).json({ error: 'Assigned order not found.' });
    if (order.status !== 'AWAITING_AGENT_ACCEPTANCE') {
      return res.status(400).json({ error: `Cannot accept order in status ${order.status}.` });
    }
    if (agent.hasPendingCashDeposit) {
      return res.status(403).json({ error: 'Cash deposit lockout active. Deposit pending cash at Madhapur store first.' });
    }

    const otp = generateSixDigitOtp();
    order.status = 'OUT_FOR_DELIVERY';
    order.deliveryOtp = otp;
    order.offerExpiresAt = null;
    order.agentLiveCoordinates = { lat: HYDERABAD_HUB.lat, lng: HYDERABAD_HUB.lng };
    order.updatedAt = new Date().toISOString();
    saveStore();

    await sendBrevoTransactionalEmail(
      {
        toEmail: order.customerEmail,
        toName: order.customerName,
        subject: `Out for Delivery! Your 6-Digit OTP for ${order.orderNumber} is ${otp}`,
        htmlContent: `
          <h2>Your Fresh Dairy Order is Out for Delivery</h2>
          <p>Delivery Agent <strong>${agent.name}</strong> (${agent.phone}) is en route from Madhapur Dairy Hub.</p>
          <p>Share this Universal Delivery OTP at your doorstep:</p>
          <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${otp}</p>
        `,
        meta: { type: 'DELIVERY_OTP', orderNumber: order.orderNumber, otp },
      },
      recordEmail
    );

    res.json({ message: 'Order accepted! Now OUT_FOR_DELIVERY.', order: toAgentMaskedOrder(order) });
  });

  app.post('/api/agent/orders/:id/reject', requireAuth(['agent']), (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const agent = req.currentUser!;
    const order = store.orders.find((o) => o.id === req.params.id && o.assignedAgentId === agent.id);
    if (!order) return res.status(404).json({ error: 'Assigned offer not found.' });
    if (order.status !== 'AWAITING_AGENT_ACCEPTANCE') {
      return res.status(400).json({ error: 'Only pending offers can be rejected.' });
    }

    // Back-of-FIFO-Queue Rotation
    agent.fifoQueueJoinedAt = new Date().toISOString();
    agent.updatedAt = new Date().toISOString();
    if (!order.rejectedAgentIds.includes(agent.id)) {
      order.rejectedAgentIds.push(agent.id);
    }

    const nextAgent = assignOrderToNextFifoAgent(order);
    res.json({
      message: nextAgent
        ? `Offer rejected. You moved to the back of the FIFO queue; order rotated to ${nextAgent.name}.`
        : 'Offer rejected. You moved to the back of the FIFO queue; order awaits next active agent.',
    });
  });

  app.patch('/api/agent/orders/:id/location', requireAuth(['agent']), (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const agent = req.currentUser!;
    const order = store.orders.find((o) => o.id === req.params.id && o.assignedAgentId === agent.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: 'Valid lat and lng coordinates required.' });
    }
    order.agentLiveCoordinates = { lat, lng };
    agent.currentCoordinates = { lat, lng };
    order.updatedAt = new Date().toISOString();
    saveStore();
    res.json({ agentLiveCoordinates: order.agentLiveCoordinates });
  });

  app.post('/api/agent/orders/:id/upi-qr', requireAuth(['agent']), async (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const agent = req.currentUser!;
    const order = store.orders.find((o) => o.id === req.params.id && o.assignedAgentId === agent.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.paymentMethod !== 'COD') {
      return res.status(400).json({ error: 'UPI QR is only generated for COD orders.' });
    }

    const vpa = process.env.UPI_MERCHANT_VPA || 'pureroute.hyd@icici';
    const merchantName = encodeURIComponent(process.env.UPI_MERCHANT_NAME || 'PureRoute Dairy Hyderabad');
    const note = encodeURIComponent(`Order ${order.orderNumber}`);
    const upiUri = `upi://pay?pa=${vpa}&pn=${merchantName}&am=${order.totalInr.toFixed(2)}&cu=INR&tn=${note}`;
    const dataUrl = await QRCode.toDataURL(upiUri, {
      width: 280,
      margin: 2,
      color: { dark: '#07111a', light: '#ffffff' },
    });

    order.upiQrPayload = upiUri;
    order.upiQrDataUrl = dataUrl;
    order.updatedAt = new Date().toISOString();
    saveStore();

    res.json({ upiUri, upiQrDataUrl: dataUrl, amountInr: order.totalInr });
  });

  app.post('/api/agent/orders/:id/complete', requireAuth(['agent']), async (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const agent = req.currentUser!;
    const order = store.orders.find((o) => o.id === req.params.id && o.assignedAgentId === agent.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.status !== 'OUT_FOR_DELIVERY') {
      return res.status(400).json({ error: `Order is in ${order.status} status.` });
    }

    const submittedOtp = String(req.body?.otp || '').trim();
    if (!order.deliveryOtp || submittedOtp !== order.deliveryOtp) {
      return res.status(400).json({ error: 'Invalid 6-digit Delivery OTP. Please verify the OTP from the customer.' });
    }

    const now = new Date().toISOString();
    order.otpVerifiedAt = now;
    order.agentLiveCoordinates = { ...order.deliveryCoordinates };

    if (order.paymentMethod === 'PREPAID') {
      order.status = 'DELIVERED';
      order.deliveredAt = now;
      agent.walletBalance += order.deliveryFeeInr;
      agent.completedDeliveries += 1;
      order.updatedAt = now;
      saveStore();

      await sendBrevoTransactionalEmail(
        {
          toEmail: order.customerEmail,
          toName: order.customerName,
          subject: `Delivered: PureRoute Order ${order.orderNumber}`,
          htmlContent: `<p>Hi ${order.customerName}, your prepaid dairy order <strong>${order.orderNumber}</strong> has been delivered cleanly with OTP confirmation.</p>`,
          meta: { type: 'ORDER_DELIVERED', orderNumber: order.orderNumber },
        },
        recordEmail
      );

      return res.json({
        message: `PREPAID order delivered! ₹${order.deliveryFeeInr} delivery fee credited to your wallet.`,
        order: toAgentMaskedOrder(order),
        agent: sanitizeUser(agent),
      });
    }

    // COD Order
    const codMethod = req.body?.codMethod;
    if (codMethod === 'UPI_QR') {
      order.codMethodUsed = 'UPI_QR';
      order.paymentStatus = 'QR_PAID_AWAITING_ADMIN';
      order.status = 'COD_QR_PENDING_ADMIN';
      order.updatedAt = now;
      saveStore();

      return res.json({
        message: 'OTP verified & UPI QR marked paid! Awaiting Admin confirmation of QR Amount Received.',
        order: toAgentMaskedOrder(order),
        agent: sanitizeUser(agent),
      });
    }

    if (codMethod === 'CASH') {
      order.codMethodUsed = 'CASH';
      order.paymentStatus = 'CASH_COLLECTED';
      order.status = 'DELIVERED';
      order.deliveredAt = now;
      order.cashDepositStatus = 'PENDING_ADMIN_REQUEST';
      order.updatedAt = now;

      // Cash & Store Deposit Lockout: immediately lock agent from all new FIFO & manual orders
      agent.hasPendingCashDeposit = true;
      agent.pendingCashAmount += order.totalInr;
      agent.completedDeliveries += 1;
      agent.walletBalance += order.deliveryFeeInr;
      agent.updatedAt = now;
      saveStore();

      await sendBrevoTransactionalEmail(
        {
          toEmail: order.customerEmail,
          toName: order.customerName,
          subject: `Delivered (COD Cash): PureRoute Order ${order.orderNumber}`,
          htmlContent: `<p>Hi ${order.customerName}, your COD order <strong>${order.orderNumber}</strong> (₹${order.totalInr} collected in cash) has been delivered with OTP confirmation.</p>`,
          meta: { type: 'ORDER_DELIVERED_COD_CASH', orderNumber: order.orderNumber },
        },
        recordEmail
      );

      return res.json({
        message: `COD Cash (₹${order.totalInr}) collected & delivered! Cash Deposit Lockout is now active until you deposit cash at the Madhapur Dairy Store and Admin confirms.`,
        order: toAgentMaskedOrder(order),
        agent: sanitizeUser(agent),
      });
    }

    return res.status(400).json({ error: 'For COD orders, please choose UPI_QR or CASH settlement.' });
  });

  app.post('/api/agent/orders/:id/cash-deposited', requireAuth(['agent']), (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const agent = req.currentUser!;
    const order = store.orders.find((o) => o.id === req.params.id && o.assignedAgentId === agent.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.cashDepositStatus !== 'DEPOSIT_REQUESTED' && order.cashDepositStatus !== 'PENDING_ADMIN_REQUEST') {
      return res.status(400).json({ error: 'Order is not awaiting cash store deposit.' });
    }
    order.cashDepositStatus = 'AGENT_DEPOSITED';
    order.updatedAt = new Date().toISOString();
    saveStore();
    res.json({
      message: 'Marked "Cash Deposited in Store". Awaiting Admin confirmation to unlock FIFO queue.',
      order: toAgentMaskedOrder(order),
    });
  });

  // ==========================================
  // ADMIN CONSOLE ROUTES
  // ==========================================
  app.get('/api/admin/overview', requireAuth(['admin']), (_req, res) => {
    const store = getStore();
    const nowMs = Date.now();
    const fifteenMinsMs = 15 * 60 * 1000;
    const eligibleQueue = getEligibleActiveAgents([]);

    const agents = store.users
      .filter((u) => u.role === 'agent')
      .map((u) => {
        const freshHeartbeat = u.lastActiveAt ? nowMs - new Date(u.lastActiveAt).getTime() <= fifteenMinsMs : false;
        const isActive = u.isLoggedIn && freshHeartbeat && u.isEmailVerified;
        const fifoRank = eligibleQueue.findIndex((e) => e.id === u.id) + 1;
        return {
          ...sanitizeUser(u),
          presenceStatus: isActive ? 'ACTIVE' : 'INACTIVE',
          fifoQueueRank: fifoRank > 0 ? fifoRank : null,
          isEligibleForDispatch: fifoRank > 0,
        };
      })
      .sort((a, b) => (a.fifoQueueRank || 999) - (b.fifoQueueRank || 999));

    const merchants = store.users.filter((u) => u.role === 'merchant').map(sanitizeUser);

    res.json({
      settings: store.settings,
      orders: store.orders,
      agents,
      merchants,
      emailLogs: store.emailLogs.slice(0, 25),
      stats: {
        totalOrders: store.orders.length,
        processingCount: store.orders.filter((o) => o.status === 'PROCESSING').length,
        outForDeliveryCount: store.orders.filter((o) => o.status === 'OUT_FOR_DELIVERY').length,
        activeAgentsCount: agents.filter((a) => a.presenceStatus === 'ACTIVE').length,
        cashLockedAgentsCount: agents.filter((a) => a.hasPendingCashDeposit).length,
        pendingQrConfirmCount: store.orders.filter((o) => o.status === 'COD_QR_PENDING_ADMIN').length,
      },
    });
  });

  app.patch('/api/admin/settings/fifo-minutes', requireAuth(['admin']), (req: AuthedRequest, res: Response) => {
    const mins = Number(req.body?.minutes);
    if (Number.isNaN(mins) || mins < 2 || mins > 5) {
      return res.status(400).json({ error: 'FIFO accept/reject timer must be between 2 and 5 minutes.' });
    }
    const store = getStore();
    store.settings.fifoOfferMinutes = mins;
    saveStore();
    res.json(store.settings);
  });

  app.post('/api/admin/orders/:id/process', requireAuth(['admin']), async (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const order = store.orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.status !== 'PROCESSING' && order.status !== 'PROCESSED') {
      return res.status(400).json({ error: `Order is already in ${order.status} status.` });
    }

    order.status = 'PROCESSED';
    order.updatedAt = new Date().toISOString();
    saveStore();

    await sendBrevoTransactionalEmail(
      {
        toEmail: order.customerEmail,
        toName: order.customerName,
        subject: `Order ${order.orderNumber} Processed & Packed at Madhapur Dairy Hub`,
        htmlContent: `<p>Hi ${order.customerName}, your PureRoute order <strong>${order.orderNumber}</strong> has been marked <strong>PROCESSED</strong> and dispatched to our active FIFO delivery queue.</p>`,
        meta: { type: 'ORDER_PROCESSED', orderNumber: order.orderNumber },
      },
      recordEmail
    );

    const assignedAgent = assignOrderToNextFifoAgent(order);
    res.json({
      message: assignedAgent
        ? `Order marked PROCESSED, customer emailed via Brevo, and auto-assigned to FIFO #1 agent ${assignedAgent.name} (${store.settings.fifoOfferMinutes}m timer).`
        : 'Order marked PROCESSED and customer emailed, but no active unlocked agents are online right now.',
      order,
    });
  });

  app.post('/api/admin/orders/:id/reassign', requireAuth(['admin']), (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const order = store.orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const { agentId } = req.body || {};
    if (!agentId) {
      // Remove current auto-assigned agent and leave in PROCESSED
      order.assignedAgentId = null;
      order.assignedAgentName = null;
      order.assignedAgentPhone = null;
      order.offerAssignedAt = null;
      order.offerExpiresAt = null;
      order.status = 'PROCESSED';
      order.updatedAt = new Date().toISOString();
      saveStore();
      return res.json({ message: 'Assigned agent removed. Order returned to PROCESSED.', order });
    }

    const eligible = getEligibleActiveAgents([]);
    const target = eligible.find((a) => a.id === agentId);
    if (!target) {
      return res.status(400).json({ error: 'Selected agent is not currently active, verified, or unlocked.' });
    }

    const assigned = assignOrderToNextFifoAgent(order, target.id);
    res.json({
      message: `Order manually reassigned to ${assigned?.name} with a ${store.settings.fifoOfferMinutes}-minute accept/reject countdown.`,
      order,
    });
  });

  app.post('/api/admin/orders/:id/confirm-qr', requireAuth(['admin']), async (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const order = store.orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.status !== 'COD_QR_PENDING_ADMIN') {
      return res.status(400).json({ error: 'Order is not awaiting UPI QR confirmation.' });
    }

    const now = new Date().toISOString();
    order.status = 'DELIVERED';
    order.paymentStatus = 'PAID';
    order.deliveredAt = now;
    order.updatedAt = now;

    const agent = store.users.find((u) => u.id === order.assignedAgentId);
    if (agent) {
      agent.walletBalance += order.deliveryFeeInr;
      agent.completedDeliveries += 1;
      agent.updatedAt = now;
    }
    saveStore();

    await sendBrevoTransactionalEmail(
      {
        toEmail: order.customerEmail,
        toName: order.customerName,
        subject: `UPI QR Payment Confirmed & Order ${order.orderNumber} Delivered`,
        htmlContent: `<p>Hi ${order.customerName}, we confirmed receipt of ₹${order.totalInr} via UPI QR. Order <strong>${order.orderNumber}</strong> is now marked <strong>DELIVERED</strong>.</p>`,
        meta: { type: 'QR_CONFIRMED_DELIVERED', orderNumber: order.orderNumber },
      },
      recordEmail
    );

    res.json({ message: 'QR Amount Received confirmed! Order DELIVERED and agent wallet credited.', order });
  });

  app.post('/api/admin/orders/:id/request-cash-deposit', requireAuth(['admin']), (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const order = store.orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (order.cashDepositStatus !== 'PENDING_ADMIN_REQUEST') {
      return res.status(400).json({ error: 'Order is not awaiting a Deposit Cash at Store notice.' });
    }
    order.cashDepositStatus = 'DEPOSIT_REQUESTED';
    order.updatedAt = new Date().toISOString();
    saveStore();
    res.json({ message: '"Deposit Cash at Store" status sent to Agent & Customer portals.', order });
  });

  app.post('/api/admin/orders/:id/confirm-cash-deposit', requireAuth(['admin']), (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const order = store.orders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    const now = new Date().toISOString();
    order.cashDepositStatus = 'CONFIRMED';
    order.paymentStatus = 'PAID';
    order.updatedAt = now;

    const agent = store.users.find((u) => u.id === order.assignedAgentId);
    if (agent) {
      agent.pendingCashAmount = Math.max(0, agent.pendingCashAmount - order.totalInr);
      const stillHasUnconfirmedCash = store.orders.some(
        (o) => o.assignedAgentId === agent.id && o.cashDepositStatus !== 'NONE' && o.cashDepositStatus !== 'CONFIRMED'
      );
      if (!stillHasUnconfirmedCash) {
        agent.hasPendingCashDeposit = false;
        agent.pendingCashAmount = 0;
        if (agent.isLoggedIn) {
          agent.fifoQueueJoinedAt = now;
        }
      }
      agent.updatedAt = now;
    }
    saveStore();
    res.json({
      message: 'Amount Deposited by Agent to Store confirmed! Agent cash lockout cleared and returned to FIFO queue.',
      order,
    });
  });

  app.post('/api/admin/merchants/:id/verify', requireAuth(['admin']), (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const merchant = store.users.find((u) => u.id === req.params.id && u.role === 'merchant');
    if (!merchant) return res.status(404).json({ error: 'Merchant not found.' });
    merchant.merchantVerified = true;
    merchant.updatedAt = new Date().toISOString();
    saveStore();
    res.json({ message: `${merchant.farmName || merchant.name} verified as a PureRoute Farm Partner.`, merchant: sanitizeUser(merchant) });
  });

  // ==========================================
  // SMART POST-DELIVERY FEEDBACK LOOP
  // ==========================================
  app.get('/api/feedback/pending', requireAuth(['customer', 'admin']), (req: AuthedRequest, res: Response) => {
    const store = getStore();
    const nowMs = Date.now();
    const fifteenMinsMs = 15 * 60 * 1000;
    const oneHourMs = 60 * 60 * 1000;

    const eligible = store.orders.find((o) => {
      if (o.customerId !== req.currentUser!.id) return false;
      if (o.status !== 'DELIVERED' || !o.deliveredAt) return false;
      if (o.feedbackSubmitted || o.feedbackDontAskAgain) return false;
      const deliveredMs = new Date(o.deliveredAt).getTime();
      if (nowMs - deliveredMs < fifteenMinsMs) return false;
      if (o.lastFeedbackPromptAt) {
        const lastPromptMs = new Date(o.lastFeedbackPromptAt).getTime();
        if (nowMs - lastPromptMs < oneHourMs) return false;
      }
      return true;
    });

    res.json({ pendingOrder: eligible || null });
  });

  app.post('/api/feedback/dismiss', requireAuth(['customer', 'admin']), (req: AuthedRequest, res: Response) => {
    const { orderId, dontAskAgain } = req.body || {};
    const store = getStore();
    const order = store.orders.find((o) => o.id === orderId && o.customerId === req.currentUser!.id);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    order.lastFeedbackPromptAt = new Date().toISOString();
    if (dontAskAgain) {
      order.feedbackDontAskAgain = true;
    }
    order.updatedAt = new Date().toISOString();
    saveStore();
    res.json({ message: dontAskAgain ? 'Feedback popups disabled for this order.' : 'Will remind again in 1 hour.' });
  });

  app.get('/api/feedback', (_req, res) => {
    const store = getStore();
    res.json(store.reviews);
  });

  app.post('/api/feedback', requireAuth(['customer', 'admin']), (req: AuthedRequest, res: Response) => {
    const { orderId, productId, rating, comment } = req.body || {};
    const numericRating = Math.min(5, Math.max(1, Number(rating) || 5));
    const store = getStore();
    const order = store.orders.find((o) => o.id === orderId && o.customerId === req.currentUser!.id);
    const product = store.products.find((p) => p.id === Number(productId));

    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const review = {
      id: `rev_${crypto.randomBytes(4).toString('hex')}`,
      orderId: order?.id || 'direct_review',
      productId: product.id,
      customerId: req.currentUser!.id,
      customerName: req.currentUser!.name,
      customerAvatarUrl: req.currentUser!.avatarUrl,
      rating: numericRating,
      comment: String(comment || 'Fresh and pure morning dairy!').trim().slice(0, 500),
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
  // VITE / STATIC CLIENT SERVING
  // ==========================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PureRoute LocalMilkforYou Hyderabad running on http://0.0.0.0:${PORT}`);
    console.log(`OpenAPI 3.0 Swagger UI available at http://0.0.0.0:${PORT}/api-docs`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
