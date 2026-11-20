# PureRoute / LocalMilkforYou — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Owner-Isolated PII (`/users/{userId}`)**: Only the authenticated owner (`request.auth.uid == userId`) or a verified Admin can read their user document. No blanket `isSignedIn()` reads or collection listing is allowed.
2. **No Self-Escalation**: On create, `/users/{userId}` MUST set `role == 'customer'`. On update, `role`, `uid`, and `createdAt` are strictly immutable for non-admins.
3. **Hyderabad Phone & PIN Integrity**: `phone` must match `^\+91[6-9][0-9]{9}$`, and optional `pinCode` must match `^500[0-9]{3}$`.
4. **Verified Identity**: All writes require `request.auth.token.email_verified == true`.
5. **Temporal Integrity**: `createdAt == request.time` on create; `updatedAt == request.time` on create and update.
6. **Admin Registry Lockdown (`/admins/{adminId}`)**: Client writes are strictly denied (`if false`); reads are limited to the admin themselves.
7. **Feedback Preferences (`/feedbackPreferences/{userId}`)**: Strictly owner-isolated with allowlisted keys and server timestamp enforcement.

## 2. The Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Identity Spoofing**: Creating `/users/victimUid` as `attackerUid` with `uid: "victimUid"`.
2. **Role Privilege Escalation (Create)**: Creating `/users/attackerUid` with `role: "admin"`.
3. **Role Privilege Escalation (Update)**: Updating own `/users/attackerUid` to change `role: "admin"`.
4. **Shadow Field Injection**: Creating `/users/attackerUid` with extra field `isVerified: true`.
5. **PII Blanket Get**: Reading `/users/otherUserUid` as non-admin `attackerUid`.
6. **Collection Scraping (List)**: Listing `/users` as a regular customer.
7. **ID Poisoning**: Creating `/users/` with a 500-character invalid document ID containing slashes/spaces.
8. **Unverified Email Spoofing**: Admin email claim with `email_verified: false`.
9. **Client Timestamp Forgery**: Creating `/users/uid` with backdated `createdAt` instead of `request.time`.
10. **Immutable Field Tampering**: Updating `createdAt` or `uid` on an existing `/users/uid` document.
11. **Value Poisoning (Oversized String)**: Updating `name` with a 5000-character string exceeding `maxLength: 120`.
12. **Admin Registry Tampering**: Creating `/admins/attackerUid` from client SDK.
