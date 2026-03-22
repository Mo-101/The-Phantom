import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
export type { User as FirebaseUser } from 'firebase/auth';
export {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit,
  Timestamp,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';

const firebaseConfig = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'gen-lang-client-0501229852',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '1:904789286214:web:f6cb14da871569ed075947',
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyD1pBcI8kkz7RHMMQ_5fseNO6kRROFvrfQ',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'gen-lang-client-0501229852.firebaseapp.com',
  storageBucket: 'gen-lang-client-0501229852.firebasestorage.app',
  messagingSenderId: '904789286214',
  firestoreDatabaseId: 'ai-studio-9a3eaac8-2cdd-43b1-9a17-2a61841efddd',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { app, db, auth, googleProvider };

// Error handling
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const msg = error instanceof Error ? error.message : String(error);
  const errInfo = {
    error: msg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
