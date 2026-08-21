import type { User } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

const OWNER_EMAIL = "bielcosta3101@gmail.com";

export type UserRole = "admin" | "user" | "pending" | "blocked";

export type UserProfile = {
  uid: string;
  name: string;
  email: string;
  photoURL: string;
  role: UserRole;
  createdAt?: Timestamp;
  lastLogin?: Timestamp;
};

export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const profileRef = doc(db, "users", user.uid);
  const accessRef = doc(db, "settings", "access");

  return runTransaction(db, async (transaction) => {
    const [accessSnapshot, profileSnapshot] = await Promise.all([
      transaction.get(accessRef),
      transaction.get(profileRef),
    ]);
    const existing = profileSnapshot.data() as UserProfile | undefined;
    const canClaimOwnership = !accessSnapshot.exists()
      && user.emailVerified
      && user.email?.toLowerCase() === OWNER_EMAIL;
    const role: UserRole = canClaimOwnership ? "admin" : existing?.role ?? "pending";

    if (canClaimOwnership) {
      transaction.set(accessRef, {
        ownerUid: user.uid,
        ownerEmail: OWNER_EMAIL,
        createdAt: serverTimestamp(),
      });
    }

    const profile = {
      uid: user.uid,
      name: user.displayName || existing?.name || "Usuário",
      email: user.email || existing?.email || "",
      photoURL: user.photoURL || existing?.photoURL || "",
      role,
      lastLogin: serverTimestamp(),
      ...(profileSnapshot.exists() ? {} : { createdAt: serverTimestamp() }),
    };
    transaction.set(profileRef, profile, { merge: true });
    return { ...existing, ...profile, role } as UserProfile;
  });
}

export function watchUserProfile(uid: string, onChange: (profile: UserProfile) => void) {
  return onSnapshot(doc(db, "users", uid), (snapshot) => {
    if (snapshot.exists()) onChange(snapshot.data() as UserProfile);
  });
}

export function watchAllUsers(onChange: (users: UserProfile[]) => void) {
  const usersQuery = query(collection(db, "users"), orderBy("createdAt", "desc"));
  return onSnapshot(usersQuery, (snapshot) => {
    onChange(snapshot.docs.map((item) => item.data() as UserProfile));
  });
}

export function changeUserRole(uid: string, role: UserRole) {
  return updateDoc(doc(db, "users", uid), { role });
}
