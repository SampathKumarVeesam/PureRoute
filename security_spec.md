# PureRoute / LocalMilkforYou — MongoDB Security Specification & Threat Model

## 1. Data Invariants & Authorization Boundaries
1. **Owner-Isolated User Data (`users` collection)**: Only the authenticated user (`req.currentUser.id == userId`) or an Operations Admin (`role == 'admin'`) can view their complete profile document.
2. **No Role Escalation**: On registration, `role` is strictly locked to `'customer'`. Client profile update requests cannot mutate `role`, `id`, `email`, or `createdAt`.
3. **Hyderabad Phone & PIN Integrity**: `phone` must match `^\+91[6-9][0-9]{9}$`, and `pinCode` must match `^500[0-9]{3}$`.
4. **Verified Identity**: Agent onboarding strictly enforces Brevo 2-step email verification before activating agent status.
5. **Strict Delivery Privacy Masking**: Delivery agents can NEVER access customer product names, descriptions, or images. Queries return `AgentMaskedOrder` with numeric product IDs and quantities only.
6. **Universal OTP Enforced Completion**: Transitioning an order to `DELIVERED` requires exact validation of the cryptographically generated 6-digit delivery OTP.
7. **Cash-on-Delivery Anti-Theft Lockout**: Any cash collected immediately locks the agent's account (`hasPendingCashDeposit: true`), barring them from receiving any new FIFO offers until cash is verified by an Admin at the Madhapur hub.
8. **Feedback Preferences Isolation**: Customer preference flags (`dontAskAgain`) are persisted under `feedback_preferences` keyed strictly by user ID.

## 2. Adversarial Vectors Mitigation Matrix
1. **Identity Spoofing**: JWT Bearer verification cryptographically binds requests to authenticated user IDs.
2. **Role Privilege Escalation**: Registration endpoints hardcode role assignment; role mutation is ignored in profile update schemas.
3. **Shadow Field Injection**: Mongoose schemas operate in `strict: true` mode, stripping unrecognized attributes.
4. **PII Scraping**: Public user listings are disabled; customer orders are accessible only by the order's owner or administrative dispatch.
5. **ID Poisoning & Path Traversal**: Request parameters and ObjectIds are sanitized; invalid formats return `400 Bad Request`.
6. **Timestamp Forgery**: Server assigns timestamps using authoritative `new Date().toISOString()`.
7. **Payload Size Poisoning**: Maximum string lengths are bounded and validated; JSON body parsing is restricted.
