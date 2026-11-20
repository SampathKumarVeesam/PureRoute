import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { GenderOption } from '../types/domain';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

// Validate Firestore connectivity on initial boot
testConnection();

export async function signInWithGooglePopup() {
  const result = await signInWithPopup(auth, googleAuthProvider);
  const fbUser = result.user;
  const idToken = await fbUser.getIdToken();

  // Best-effort Firestore profile sync conforming strictly to firebase-blueprint.json
  if (fbUser.emailVerified && fbUser.email) {
    const userPath = `users/${fbUser.uid}`;
    try {
      const ref = doc(db, 'users', fbUser.uid);
      await setDoc(
        ref,
        {
          uid: fbUser.uid,
          email: fbUser.email,
          name: (fbUser.displayName || fbUser.email.split('@')[0]).slice(0, 120),
          phone: '+919848011223',
          gender: 'Prefer not to say',
          avatarId: 'preset:neutral-1',
          address: 'Madhapur, Hitech City, Hyderabad, TG',
          pinCode: '500081',
          role: 'customer',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: false }
      ).catch(async () => {
        // Document likely exists already; perform allowlisted partial update
        await updateDoc(ref, {
          name: (fbUser.displayName || fbUser.email!.split('@')[0]).slice(0, 120),
          updatedAt: serverTimestamp(),
        });
      });
    } catch (err) {
      // Do not block sign-in if rule check fails on pre-existing doc; log structured error
      try {
        handleFirestoreError(err, OperationType.WRITE, userPath);
      } catch {
        // Logged cleanly
      }
    }
  }

  return {
    firebaseUid: fbUser.uid,
    email: fbUser.email || '',
    name: fbUser.displayName || 'Hyderabad Customer',
    idToken,
  };
}

export async function syncProfileToFirestore(params: {
  name: string;
  phone: string;
  gender: GenderOption;
  avatarId: string;
  address: string;
  pinCode: string;
}) {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) return;
  const userPath = `users/${fbUser.uid}`;
  try {
    await updateDoc(doc(db, 'users', fbUser.uid), {
      name: params.name.slice(0, 120),
      phone: params.phone,
      gender: params.gender,
      avatarId: params.avatarId.slice(0, 128),
      address: params.address.slice(0, 300),
      pinCode: params.pinCode,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.UPDATE, userPath);
    } catch {
      // Logged cleanly
    }
  }
}

export async function syncFeedbackPreferenceToFirestore(dontAskAgain: boolean) {
  const fbUser = auth.currentUser;
  if (!fbUser || !fbUser.emailVerified) return;
  const prefPath = `feedbackPreferences/${fbUser.uid}`;
  try {
    await setDoc(
      doc(db, 'feedbackPreferences', fbUser.uid),
      {
        uid: fbUser.uid,
        dontAskAgain,
        lastPromptedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    try {
      handleFirestoreError(err, OperationType.WRITE, prefPath);
    } catch {
      // Logged cleanly
    }
  }
}

export async function signOutFirebase() {
  try {
    await firebaseSignOut(auth);
  } catch {
    // ignore if not signed in via Firebase
  }
}
