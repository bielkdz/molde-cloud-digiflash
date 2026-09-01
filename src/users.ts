import type { User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
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

export type UserPermissions = {
  createFolder: boolean;
  renameItems: boolean;
  deleteItems: boolean;
  viewTrash: boolean;
};

export type UserProfile = {
  uid: string;
  name: string;
  email: string;
  photoURL: string;
  role: UserRole;
  companyId: string;
  requestedRole?: "admin" | "user";
  approvedAt?: Timestamp;
  approvedBy?: string;
  createdAt?: Timestamp;
  lastLogin?: Timestamp;
  permissions?: Partial<UserPermissions>;
};

export type EmployeeInvitation = {
  email: string;
  companyId: string;
  role: "pending";
  createdAt?: Timestamp;
  claimedBy?: string;
};

export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const profileRef = doc(db, "users", user.uid);
  const accessRef = doc(db, "settings", "access");
  const normalizedEmail = user.email?.trim().toLowerCase() || "";
  const invitationRef = normalizedEmail ? doc(db, "companyInvites", normalizedEmail) : null;
  const token = await user.getIdTokenResult();

  return runTransaction(db, async (transaction) => {
    const [accessSnapshot, profileSnapshot, invitationSnapshot] = await Promise.all([
      transaction.get(accessRef),
      transaction.get(profileRef),
      invitationRef ? transaction.get(invitationRef) : Promise.resolve(null),
    ]);
    const existing = profileSnapshot.data() as UserProfile | undefined;
    const invitation = invitationSnapshot?.data() as { companyId?: string; role?: UserRole; claimedBy?: string } | undefined;
    const canClaimOwnership = !accessSnapshot.exists()
      && user.emailVerified
      && normalizedEmail === OWNER_EMAIL;
    const isOwner = accessSnapshot.data()?.ownerUid === user.uid;
    const canClaimInvitation = Boolean(invitation?.companyId)
      && !invitation?.claimedBy
      && !isOwner;
    const needsManualApproval = existing?.role === "admin"
      && !user.emailVerified
      && invitation?.claimedBy === user.uid
      && !existing.approvedAt;
    const requestedRole: "admin" | "user" = invitation?.role === "admin" ? "admin" : "user";
    const role: UserRole = canClaimOwnership || isOwner
      ? "superadmin"
      : canClaimInvitation
        ? "pending"
        : needsManualApproval
          ? "pending"
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

    if (token.claims.email_verified === true && token.claims.email === user.email) {
      transaction.set(doc(db, "verifiedIdentities", user.uid), {
        email: user.email,
        verifiedAt: serverTimestamp(),
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
      ...(canClaimInvitation || needsManualApproval ? { requestedRole } : {}),
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

export async function changeUserRole(uid: string, role: UserRole, companyId: string, approvedBy?: string) {
  const normalizedCompanyId = companyId?.trim();
  if (!normalizedCompanyId && role !== "blocked") {
    return Promise.reject(new Error("Este cadastro não possui uma empresa válida."));
  }
  if (role === "admin") {
    const [profile, identity] = await Promise.all([
      getDoc(doc(db, "users", uid)), getDoc(doc(db, "verifiedIdentities", uid)),
    ]);
    if (!identity.exists() || identity.data().email !== profile.data()?.email) {
      throw new Error("O usuário precisa confirmar o e-mail e entrar novamente antes de ser aprovado como administrador.");
    }
  }
  return updateDoc(doc(db, "users", uid), {
    role,
    companyId: normalizedCompanyId || "",
    ...(role !== "pending" ? { requestedRole: null } : {}),
    ...(role === "admin" || role === "user" ? {
      approvedAt: serverTimestamp(),
      approvedBy: approvedBy || "administrator",
    } : {}),
  });
}

export function changeUserPermissions(uid: string, permissions: UserPermissions) {
  return updateDoc(doc(db, "users", uid), { permissions });
}

export function watchPendingApprovals(onChange: (users: UserProfile[]) => void) {
  const pendingQuery = query(collection(db, "users"), where("role", "==", "pending"));
  return onSnapshot(pendingQuery, (snapshot) => {
    onChange(snapshot.docs
      .map((item) => item.data() as UserProfile)
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)));
  });
}

export function watchEmployeeInvites(
  companyId: string,
  onChange: (invitations: EmployeeInvitation[]) => void,
) {
  const invitationsQuery = query(collection(db, "companyInvites"), where("companyId", "==", companyId));
  return onSnapshot(invitationsQuery, (snapshot) => {
    onChange(snapshot.docs
      .map((item) => item.data() as EmployeeInvitation)
      .filter((item) => item.role === "pending" && !item.claimedBy)
      .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)));
  });
}

export async function inviteEmployee(companyId: string, email: string, invitedBy: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) throw new Error("Informe o e-mail do funcionário.");
  if (normalizedEmail === OWNER_EMAIL) throw new Error("O administrador geral já possui acesso ao sistema.");
  const invitationRef = doc(db, "companyInvites", normalizedEmail);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(invitationRef);
    if (snapshot.exists()) throw new Error("Este e-mail já possui vínculo ou convite com uma empresa.");
    transaction.set(invitationRef, {
      email: normalizedEmail,
      companyId,
      role: "pending",
      invitedBy,
      createdAt: serverTimestamp(),
    });
  });
}

export function cancelEmployeeInvite(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return Promise.resolve();
  return deleteDoc(doc(db, "companyInvites", normalizedEmail));
}

export function removeUserAccess(uid: string) {
  return deleteDoc(doc(db, "users", uid));
}
