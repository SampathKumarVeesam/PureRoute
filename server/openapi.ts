export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'PureRoute / LocalMilkforYou Hyderabad API',
    version: '1.0.0',
    description:
      'Complete REST API specification for the Local Milk & Farm-Direct Dairy Marketplace (Hyderabad, Telangana +91). Covers Customer Storefront, Subscriptions, Local Dairy Merchant Portal, Delivery Agent FIFO Auto-Assignment & Privacy-Masked Dispatch, Universal OTP Confirmation, COD UPI QR & Cash Store-Deposit Lockout, Profile Avatar Upload (multipart/form-data), Smart Post-Delivery Feedback, and Admin Operations.',
    contact: {
      name: 'PureRoute Hyderabad Operations',
      email: 'dispatch@pureroute.in',
    },
  },
  servers: [
    {
      url: '/',
      description: 'Active PureRoute Server',
    },
  ],
  tags: [
    { name: 'Auth & Profiles', description: 'Email/Password, Google OIDC, 2-Step Agent Verification, Profile Customization' },
    { name: 'Uploads', description: 'Multipart/form-data JPG/PNG avatar upload (max 2MB, stored as validated base64 data URI)' },
    { name: 'Storefront & Customer', description: 'Dairy catalog, subscriptions, orders, live tracking, OTP view' },
    { name: 'Merchant Portal', description: 'Farm partner onboarding, dairy batch listing, preparation console' },
    { name: 'Delivery Agent Portal', description: 'Heartbeat presence, FIFO queue offers, privacy-masked orders, OTP/UPI QR/Cash settlement' },
    { name: 'Admin Console', description: 'Order processing, FIFO queue monitoring, manual reassignment, QR/Cash settlement approvals' },
    { name: 'Database', description: 'MongoDB Atlas connectivity, collection health, and ping latency metrics' },
    { name: 'Feedback', description: 'Smart post-delivery feedback reminders and product reviews' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: { type: 'string' },
        },
        required: ['error'],
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'ananya@pureroute.in' },
          password: { type: 'string', example: 'PureMilk@2026' },
        },
      },
      GoogleOAuthRequest: {
        type: 'object',
        required: ['email', 'name'],
        properties: {
          email: { type: 'string', format: 'email', example: 'ananya@pureroute.in' },
          name: { type: 'string', example: 'Ananya Reddy' },
          avatarUrl: { type: 'string', example: 'preset:female-1' },
          googleId: { type: 'string', example: 'google_oauth_12345' },
        },
      },
      RegisterRequest: {
        type: 'object',
        required: ['name', 'email', 'phone', 'gender', 'role'],
        properties: {
          name: { type: 'string', example: 'Meera Krishnan' },
          email: { type: 'string', format: 'email', example: 'meera.agent@pureroute.in' },
          password: { type: 'string', description: 'Required for customer/merchant; auto-generated via email verification for delivery agents.' },
          phone: { type: 'string', pattern: '^\\+91[6-9][0-9]{9}$', example: '+919848077889' },
          gender: { type: 'string', enum: ['Male', 'Female', 'Non-Binary', 'Prefer not to say'] },
          role: { type: 'string', enum: ['customer', 'merchant', 'agent'] },
          avatarUrl: { type: 'string', example: 'preset:female-1' },
          address: { type: 'string', example: 'Madhapur, Hyderabad, TG' },
          pinCode: { type: 'string', pattern: '^500[0-9]{3}$', example: '500081' },
          farmName: { type: 'string', description: 'Optional farm name for merchant role' },
        },
      },
      ChangePasswordRequest: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword: { type: 'string', minLength: 8 },
        },
      },
      ProfileUpdateRequest: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          phone: { type: 'string', pattern: '^\\+91[6-9][0-9]{9}$' },
          gender: { type: 'string', enum: ['Male', 'Female', 'Non-Binary', 'Prefer not to say'] },
          avatarUrl: { type: 'string' },
          address: { type: 'string' },
          pinCode: { type: 'string', pattern: '^500[0-9]{3}$' },
        },
      },
      PublicUser: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          phone: { type: 'string', example: '+919848011223' },
          gender: { type: 'string', enum: ['Male', 'Female', 'Non-Binary', 'Prefer not to say'] },
          avatarUrl: { type: 'string' },
          role: { type: 'string', enum: ['customer', 'merchant', 'agent', 'admin'] },
          address: { type: 'string' },
          pinCode: { type: 'string' },
          isEmailVerified: { type: 'boolean' },
          mustChangePassword: { type: 'boolean' },
          isLoggedIn: { type: 'boolean' },
          lastActiveAt: { type: 'string', format: 'date-time', nullable: true },
          fifoQueueJoinedAt: { type: 'string', format: 'date-time', nullable: true },
          hasPendingCashDeposit: { type: 'boolean' },
          pendingCashAmount: { type: 'number' },
          walletBalance: { type: 'number' },
          completedDeliveries: { type: 'integer' },
        },
      },
      DairyProduct: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 101 },
          merchantId: { type: 'string' },
          merchantName: { type: 'string' },
          name: { type: 'string', example: 'Farm-Fresh Buffalo Milk' },
          category: { type: 'string', enum: ['Buffalo Milk', 'A2 Cow Milk', 'Curd & Paneer', 'Ghee & Buttermilk'] },
          unit: { type: 'string', example: '1 Litre Glass Bottle' },
          priceInr: { type: 'number', example: 92 },
          fatPercent: { type: 'number', example: 7.4 },
          snfPercent: { type: 'number', example: 9.2 },
          freshnessTimestamp: { type: 'string', format: 'date-time' },
          harvestNote: { type: 'string' },
          stockQty: { type: 'integer' },
          imageUrl: { type: 'string' },
          description: { type: 'string' },
          supportsSubscription: { type: 'boolean' },
          ratingAvg: { type: 'number' },
          reviewCount: { type: 'integer' },
        },
      },
      CreateProductRequest: {
        type: 'object',
        required: ['name', 'category', 'unit', 'priceInr', 'fatPercent', 'snfPercent', 'stockQty'],
        properties: {
          name: { type: 'string' },
          category: { type: 'string', enum: ['Buffalo Milk', 'A2 Cow Milk', 'Curd & Paneer', 'Ghee & Buttermilk'] },
          unit: { type: 'string' },
          priceInr: { type: 'number' },
          fatPercent: { type: 'number' },
          snfPercent: { type: 'number' },
          harvestNote: { type: 'string' },
          stockQty: { type: 'integer' },
          description: { type: 'string' },
          supportsSubscription: { type: 'boolean' },
        },
      },
      CreateOrderRequest: {
        type: 'object',
        required: ['items', 'deliveryAddress', 'pinCode', 'deliverySlot', 'paymentMethod'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['productId', 'quantity'],
              properties: {
                productId: { type: 'integer', example: 101 },
                quantity: { type: 'integer', minimum: 1, example: 2 },
              },
            },
          },
          deliveryAddress: { type: 'string' },
          pinCode: { type: 'string', pattern: '^500[0-9]{3}$' },
          lat: { type: 'number', example: 17.4319 },
          lng: { type: 'number', example: 78.4071 },
          deliverySlot: { type: 'string', enum: ['Morning (05:30 - 07:30 AM)', 'Evening (05:00 - 07:00 PM)'] },
          paymentMethod: { type: 'string', enum: ['PREPAID', 'COD'] },
          isSubscription: { type: 'boolean' },
          subscriptionFrequency: { type: 'string', enum: ['Daily', 'Alternate Days', 'Weekdays'] },
        },
      },
      OrderRecord: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          orderNumber: { type: 'string', example: 'PR-HYD-1001' },
          status: {
            type: 'string',
            enum: [
              'PROCESSING',
              'PROCESSED',
              'AWAITING_AGENT_ACCEPTANCE',
              'OUT_FOR_DELIVERY',
              'COD_QR_PENDING_ADMIN',
              'DELIVERED',
              'CANCELLED',
            ],
          },
          paymentMethod: { type: 'string', enum: ['PREPAID', 'COD'] },
          totalInr: { type: 'number' },
          deliveryOtp: { type: 'string', nullable: true },
          assignedAgentName: { type: 'string', nullable: true },
          offerExpiresAt: { type: 'string', format: 'date-time', nullable: true },
          cashDepositStatus: {
            type: 'string',
            enum: ['NONE', 'PENDING_ADMIN_REQUEST', 'DEPOSIT_REQUESTED', 'AGENT_DEPOSITED', 'CONFIRMED'],
          },
        },
      },
      AgentMaskedOrder: {
        type: 'object',
        description: 'Privacy-masked view for Delivery Agents: contains Product IDs only — never product names, descriptions, or images.',
        properties: {
          id: { type: 'string' },
          orderNumber: { type: 'string' },
          customerName: { type: 'string' },
          customerPhone: { type: 'string' },
          deliveryAddress: { type: 'string' },
          pinCode: { type: 'string' },
          maskedItems: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                productId: { type: 'integer', example: 102 },
                quantity: { type: 'integer', example: 1 },
              },
            },
          },
          totalInr: { type: 'number' },
          paymentMethod: { type: 'string', enum: ['PREPAID', 'COD'] },
          status: { type: 'string' },
          offerExpiresAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      CompleteDeliveryRequest: {
        type: 'object',
        required: ['otp'],
        properties: {
          otp: { type: 'string', pattern: '^[0-9]{6}$', example: '482916' },
          codMethod: { type: 'string', enum: ['UPI_QR', 'CASH'], description: 'Required for COD orders' },
        },
      },
      FeedbackRequest: {
        type: 'object',
        required: ['orderId', 'productId', 'rating', 'comment'],
        properties: {
          orderId: { type: 'string' },
          productId: { type: 'integer' },
          rating: { type: 'integer', minimum: 1, maximum: 5 },
          comment: { type: 'string', maxLength: 500 },
        },
      },
    },
  },
  paths: {
    '/api/auth/register': {
      post: {
        tags: ['Auth & Profiles'],
        summary: 'Register Customer, Merchant, or Delivery Agent (2-step Brevo email verification for Agents)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } } },
        },
        responses: {
          '201': { description: 'User registered (Agents await email verification & temporary password)' },
          '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/auth/verify-email': {
      get: {
        tags: ['Auth & Profiles'],
        summary: 'Verify Delivery Agent email token, generate bcrypt-hashed Temporary Password, and dispatch via Brevo',
        parameters: [{ name: 'token', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Email verified and temporary password emailed' } },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth & Profiles'],
        summary: 'Authenticate with Email & Password (blocks unverified agents; adds agents to FIFO queue)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
        },
        responses: {
          '200': { description: 'Returns JWT token and user profile' },
          '401': { description: 'Invalid credentials or unverified email' },
        },
      },
    },
    '/api/auth/google': {
      post: {
        tags: ['Auth & Profiles'],
        summary: 'Google OAuth 2.0 / OIDC login session exchange',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/GoogleOAuthRequest' } } },
        },
        responses: { '200': { description: 'Returns JWT token and synced customer/admin profile' } },
      },
    },
    '/api/auth/logout': {
      post: {
        tags: ['Auth & Profiles'],
        summary: 'Log out active session (marks Delivery Agent INACTIVE and removes from FIFO queue)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Logged out' } },
      },
    },
    '/api/auth/change-password': {
      post: {
        tags: ['Auth & Profiles'],
        summary: 'Update temporary password to permanent password (clears mustChangePassword flag)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ChangePasswordRequest' } } },
        },
        responses: { '200': { description: 'Password updated' } },
      },
    },
    '/api/profile': {
      get: {
        tags: ['Auth & Profiles'],
        summary: 'Get authenticated user profile',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Current profile', content: { 'application/json': { schema: { $ref: '#/components/schemas/PublicUser' } } } },
        },
      },
      patch: {
        tags: ['Auth & Profiles'],
        summary: 'Update profile Name, +91 Phone, Gender, Preset Avatar, Address, or Hyderabad PIN',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ProfileUpdateRequest' } } },
        },
        responses: { '200': { description: 'Profile updated' } },
      },
    },
    '/api/upload/avatar': {
      post: {
        tags: ['Uploads'],
        summary: 'Upload custom profile photo (JPG/PNG only, max 2MB) persisted as validated base64 data URI',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['avatar'],
                properties: {
                  avatar: { type: 'string', format: 'binary', description: 'JPG or PNG image, max 2MB' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Avatar persisted and returned as data URI' },
          '400': { description: 'Invalid MIME type or exceeds 2MB' },
        },
      },
    },
    '/api/products': {
      get: {
        tags: ['Storefront & Customer'],
        summary: 'List all farm-fresh Hyderabad dairy products with freshness, fat/SNF, and ratings',
        responses: {
          '200': {
            description: 'Product catalog',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/DairyProduct' } } } },
          },
        },
      },
    },
    '/api/subscriptions': {
      get: {
        tags: ['Storefront & Customer'],
        summary: 'Get customer recurring morning/evening milk subscriptions',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'List of subscriptions' } },
      },
      post: {
        tags: ['Storefront & Customer'],
        summary: 'Create a recurring daily/alternate-day morning or evening milk subscription',
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: 'Subscription created' } },
      },
    },
    '/api/subscriptions/{id}/toggle': {
      patch: {
        tags: ['Storefront & Customer'],
        summary: 'Pause or resume a milk subscription',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Subscription updated' } },
      },
    },
    '/api/orders': {
      get: {
        tags: ['Storefront & Customer'],
        summary: 'List orders for authenticated Customer (includes synced 6-digit Delivery OTP once OUT_FOR_DELIVERY)',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Customer orders',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/OrderRecord' } } } },
          },
        },
      },
      post: {
        tags: ['Storefront & Customer'],
        summary: 'Place a new farm-direct dairy order (initial status: PROCESSING)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateOrderRequest' } } },
        },
        responses: { '201': { description: 'Order created in PROCESSING state' } },
      },
    },
    '/api/merchant/products': {
      get: {
        tags: ['Merchant Portal'],
        summary: 'List dairy batches belonging to authenticated Merchant',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Merchant batches' } },
      },
      post: {
        tags: ['Merchant Portal'],
        summary: 'Publish a new fresh dairy batch with fat/SNF & harvest timestamp',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateProductRequest' } } },
        },
        responses: { '201': { description: 'Batch published' } },
      },
    },
    '/api/merchant/products/{id}/stock': {
      patch: {
        tags: ['Merchant Portal'],
        summary: 'Update stock quantity and refresh harvest timestamp for a batch',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { description: 'Stock updated' } },
      },
    },
    '/api/merchant/orders': {
      get: {
        tags: ['Merchant Portal'],
        summary: 'View preparation queue for orders containing this merchant dairy batches',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Merchant preparation orders' } },
      },
    },
    '/api/agent/heartbeat': {
      post: {
        tags: ['Delivery Agent Portal'],
        summary: 'Send 60-second active presence heartbeat and optional live GPS coordinates',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Presence refreshed & FIFO rank returned' } },
      },
    },
    '/api/agent/orders': {
      get: {
        tags: ['Delivery Agent Portal'],
        summary: 'Get privacy-masked assigned/offered orders (Product IDs only — no names/descriptions/images)',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Masked orders list',
            content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/AgentMaskedOrder' } } } },
          },
        },
      },
    },
    '/api/agent/orders/{id}/accept': {
      post: {
        tags: ['Delivery Agent Portal'],
        summary: 'Accept assigned FIFO offer -> transitions to OUT_FOR_DELIVERY, generates 6-digit OTP, emails Customer',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Offer accepted; OUT_FOR_DELIVERY' } },
      },
    },
    '/api/agent/orders/{id}/reject': {
      post: {
        tags: ['Delivery Agent Portal'],
        summary: 'Reject assigned FIFO offer -> resets agent to back of FIFO queue and rotates order to next active agent',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Offer rejected and rotated' } },
      },
    },
    '/api/agent/orders/{id}/location': {
      patch: {
        tags: ['Delivery Agent Portal'],
        summary: 'Update live agent GPS coordinates along Hyderabad delivery route',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Location updated' } },
      },
    },
    '/api/agent/orders/{id}/upi-qr': {
      post: {
        tags: ['Delivery Agent Portal'],
        summary: 'Generate dynamic UPI QR code for exact ₹ COD order total',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Returns UPI deep-link and base64 QR SVG/PNG data URL' } },
      },
    },
    '/api/agent/orders/{id}/complete': {
      post: {
        tags: ['Delivery Agent Portal'],
        summary: 'Verify Universal 6-digit OTP and complete PREPAID, COD UPI QR, or COD Cash delivery (triggers Cash Store-Deposit Lockout for COD Cash)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CompleteDeliveryRequest' } } },
        },
        responses: { '200': { description: 'Delivery processed' } },
      },
    },
    '/api/agent/orders/{id}/cash-deposited': {
      post: {
        tags: ['Delivery Agent Portal'],
        summary: 'Agent marks collected COD cash as deposited at Madhapur Dairy Store (awaits Admin confirmation)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Marked AGENT_DEPOSITED' } },
      },
    },
    '/api/admin/overview': {
      get: {
        tags: ['Admin Console'],
        summary: 'Fetch full Admin Operations dashboard: orders, ACTIVE/INACTIVE agents with FIFO ranks, merchants, cash locks, email outbox',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Admin operational snapshot' } },
      },
    },
    '/api/admin/settings/fifo-minutes': {
      patch: {
        tags: ['Admin Console'],
        summary: 'Configure FIFO accept/reject countdown timer duration (2 to 5 minutes)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Timer updated' } },
      },
    },
    '/api/admin/orders/{id}/process': {
      post: {
        tags: ['Admin Console'],
        summary: 'Mark PROCESSING order as PROCESSED -> sends Brevo email and immediately triggers FIFO Auto-Assignment Engine',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Order processed and dispatched to FIFO #1 active agent' } },
      },
    },
    '/api/admin/orders/{id}/reassign': {
      post: {
        tags: ['Admin Console'],
        summary: 'Remove current auto-assigned agent and manually assign any eligible active agent with 2-5 min countdown',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Order reassigned' } },
      },
    },
    '/api/admin/orders/{id}/confirm-qr': {
      post: {
        tags: ['Admin Console'],
        summary: 'Confirm COD UPI QR payment received -> transitions to DELIVERED, credits agent wallet, emails customer',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'UPI QR confirmed' } },
      },
    },
    '/api/admin/orders/{id}/request-cash-deposit': {
      post: {
        tags: ['Admin Console'],
        summary: 'Send "Deposit Cash at Store" instruction visible on Agent & Customer portals',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Cash deposit requested' } },
      },
    },
    '/api/admin/orders/{id}/confirm-cash-deposit': {
      post: {
        tags: ['Admin Console'],
        summary: 'Confirm "Amount Deposited by Agent to Store" -> clears has_pending_cash_deposit lockout and re-enters agent in FIFO queue',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Cash deposit confirmed & agent unlocked' } },
      },
    },
    '/api/admin/merchants/{id}/verify': {
      post: {
        tags: ['Admin Console'],
        summary: 'Verify a local dairy farm partner merchant account',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Merchant verified' } },
      },
    },
    '/api/feedback/pending': {
      get: {
        tags: ['Feedback'],
        summary: 'Check for DELIVERED orders eligible for smart feedback prompt (15 mins after delivery, hourly re-prompt)',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Pending feedback prompt order or null' } },
      },
    },
    '/api/feedback/dismiss': {
      post: {
        tags: ['Feedback'],
        summary: 'Snooze reminder for 1 hour or permanently disable popups with dontAskAgain=true',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: 'Reminder preference updated' } },
      },
    },
    '/api/db/health': {
      get: {
        tags: ['Database'],
        summary: 'Check MongoDB Atlas (app_production) connection health, collections, and latency',
        responses: {
          '200': {
            description: 'Database health status',
            content: {
              'application/json': {
                example: {
                  status: 'connected',
                  database: 'app_production',
                  host: 'cluster0.3pcz0ia.mongodb.net',
                  latencyMs: 38,
                  collections: [
                    { name: 'users', count: 7 },
                    { name: 'products', count: 7 },
                    { name: 'orders', count: 3 },
                    { name: 'subscriptions', count: 1 },
                    { name: 'reviews', count: 2 },
                  ],
                },
              },
            },
          },
        },
      },
    },
    '/api/feedback/preferences': {
      post: {
        tags: ['Feedback'],
        summary: 'Save persistent user feedback preferences to MongoDB',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  dontAskAgain: { type: 'boolean', example: true },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Preferences saved to MongoDB' } },
      },
    },
    '/api/feedback': {
      get: {
        tags: ['Feedback'],
        summary: 'Fetch verified customer product reviews',
        responses: { '200': { description: 'List of reviews' } },
      },
      post: {
        tags: ['Feedback'],
        summary: 'Submit product rating & review for a delivered order',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/FeedbackRequest' } } },
        },
        responses: { '201': { description: 'Review published' } },
      },
    },
  },
};
