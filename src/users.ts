import type { User } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";

const OWNER_EMAIL = "bielcosta3101@gmail.com";
export const DEFAULT_COMPANY_ID = "rosa-atelie";

export type UserRole = "superadmin" | "admin" | "user" | "pending" | "blocked";

export type UserProfile = {
  uid: string;
  name: string;
  email: string;
  photoURL: string;
  role: UserRole;
  companyId: string;
  createdAt?: Timestamp;
  lastLogin?: Timestamp;
};

export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const profileRef = doc(db, "users", user.uid);
  const accessRef = doc(db, "settings", "access");
  const normalizedEmail = user.email?.trim().toLowerCase() || "";
  const invitationRef = normalizedEmail ? doc(db, "companyInvites", normalizedEmail) : null;

  return runTransaction(db, async (transaction) => {
    const [accessSnapshot, profileSnapshot, invitationSnapshot] = await Promise.all([
      transaction.get(accessRef),
      transaction.get(profileRef),
      invitationRef ? transaction.get(invitationRef) : Promise.resolve(null),
    ]);
    const existing = profileSnapshot.data() as UserProfile | undefined;
    const invitation = invitationSnapshot?.data() as { companyId?: string; claimedBy?: string } | undefined;
    const canClaimOwnership = !accessSnapshot.exists()
      && user.emailVerified
      && normalizedEmail === OWNER_EMAIL;
    const isOwner = accessSnapshot.data()?.ownerUid === user.uid;
    const canClaimInvitation = Boolean(invitation?.companyId)
      && (!invitation?.claimedBy || invitation.claimedBy === user.uid);
    const role: UserRole = canClaimOwnership || isOwner
      ? "superadmin"
      : canClaimInvitation
        ? "admin"
        : existing?.role ?? "pending";
    const companyId = canClaimOwnership || isOwner
      ? DEFAULT_COMPANY_ID
      : canClaimInvitation
        ? String(invitation?.companyId)
        : existing?.companyId || DEFAULT_COMPANY_ID;

    if (canClaimOwnership) {
      transaction.set(accessRef, {
        ownerUid: user.uid,
        ownerEmail: OWNER_EMAIL,
        createdAt: serverTimestamp(),
      });
    }

    if (canClaimInvitation && invitationRef) {
      transaction.set(invitationRef, {
        claimedBy: user.uid,
        claimedAt: serverTimestamp(),
      }, { merge: true });
    }

    const profile = {
      uid: user.uid,
      name: user.displayName || existing?.name || "Usuário",
      email: user.email || existing?.email || "",
      photoURL: user.photoURL || existing?.photoURL || "",
      role,
      companyId,
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

export function watchAllUsers(companyId: string, onChange: (users: UserProfile[]) => void) {
  const usersQuery = query(collection(db, "users"), where("companyId", "==", companyId));
  return onSnapshot(usersQuery, (snapshot) => {
    onChange(snapshot.docs.map((item) => item.data() as UserProfile).sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)));
  });
}

export function changeUserRole(uid: string, role: UserRole, companyId: string) {
  return updateDoc(doc(db, "users", uid), { role, companyId });
}
