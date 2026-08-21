import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
  where,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import type { UserRole } from "./users";

export type CompanyStatus = "active" | "blocked" | "deleted";

export type CompanyRecord = {
  id: string;
  name: string;
  adminEmail: string;
  status: CompanyStatus;
  oneDriveAccount?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  deletedAt?: Timestamp;
};

export function watchCompanies(
  onChange: (companies: CompanyRecord[]) => void,
  onError?: (message: string) => void,
) {
  const companiesQuery = query(collection(db, "companies"), orderBy("createdAt", "desc"));
  return onSnapshot(companiesQuery, (snapshot) => {
    const companies = snapshot.docs.map((item) => ({
      id: item.id,
      status: "active",
      adminEmail: "",
      ...item.data(),
    }) as CompanyRecord);
    const cutoff = Date.now() - REMOVED_COMPANY_RETENTION_MS;
    const visible = companies.filter((company) => company.status !== "deleted" || (company.deletedAt?.toMillis() ?? Number.POSITIVE_INFINITY) > cutoff);
    onChange(visible);
    void purgeExpiredCompanies(companies).catch(() => onError?.("Não foi possível concluir a limpeza das empresas antigas."));
  }, () => onError?.("Não foi possível carregar as empresas."));
}

export function watchCompany(companyId: string, onChange: (company: CompanyRecord | null) => void) {
  return onSnapshot(doc(db, "companies", companyId), (snapshot) => {
    onChange(snapshot.exists() ? ({
      id: snapshot.id,
      status: "active",
      adminEmail: "",
      ...snapshot.data(),
    }) as CompanyRecord : null);
  });
}

export async function createCompany(name: string, adminEmail: string, createdBy: string) {
  const cleanName = name.trim();
  const normalizedEmail = adminEmail.trim().toLowerCase();
  if (!cleanName || !normalizedEmail) throw new Error("Dados da empresa incompletos.");
  if (normalizedEmail === "bielcosta3101@gmail.com") {
    throw new Error("O administrador geral não pode ser transferido para outra empresa.");
  }

  const companyRef = doc(collection(db, "companies"));
  const invitationRef = doc(db, "companyInvites", normalizedEmail);

  await runTransaction(db, async (transaction) => {
    const invitationSnapshot = await transaction.get(invitationRef);
    if (invitationSnapshot.exists()) {
      throw new Error("Este e-mail já administra uma empresa.");
    }

    transaction.set(companyRef, {
      name: cleanName,
      adminEmail: normalizedEmail,
      status: "active",
      createdBy,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.set(invitationRef, {
      email: normalizedEmail,
      companyId: companyRef.id,
      companyName: cleanName,
      role: "admin",
      createdBy,
      createdAt: serverTimestamp(),
    });
  });

  const registeredUsers = await getDocs(query(collection(db, "users"), where("email", "==", normalizedEmail)));
  await Promise.all(registeredUsers.docs.map(async (userSnapshot) => {
    await updateDoc(userSnapshot.ref, {
      companyId: companyRef.id,
      role: "admin",
      approvedBy: createdBy,
      approvedAt: serverTimestamp(),
    });
    await updateDoc(invitationRef, { claimedBy: userSnapshot.id, claimedAt: serverTimestamp() });
  }));
}

export function setCompanyStatus(companyId: string, status: CompanyStatus) {
  return updateDoc(doc(db, "companies", companyId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export function removeCompany(companyId: string, deletedBy: string) {
  return updateDoc(doc(db, "companies", companyId), {
    status: "deleted",
    deletedBy,
    deletedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function restoreCompany(companyId: string) {
  return updateDoc(doc(db, "companies", companyId), {
    status: "active",
    restoredAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

const REMOVED_COMPANY_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const purgingCompanyIds = new Set<string>();

export async function purgeExpiredCompanies(companies: CompanyRecord[]) {
  const cutoff = Date.now() - REMOVED_COMPANY_RETENTION_MS;
  const expired = companies.filter((company) => company.status === "deleted" && (company.deletedAt?.toMillis() ?? Number.POSITIVE_INFINITY) <= cutoff);

  for (const company of expired) {
    if (purgingCompanyIds.has(company.id)) continue;
    purgingCompanyIds.add(company.id);
    try {
      const [invitations, users] = await Promise.all([
        getDocs(query(collection(db, "companyInvites"), where("companyId", "==", company.id))),
        getDocs(query(collection(db, "users"), where("companyId", "==", company.id))),
      ]);
      const batch = writeBatch(db);
      invitations.docs.forEach((invitation) => batch.delete(invitation.ref));
      users.docs.forEach((user) => batch.update(user.ref, {
        role: "blocked",
        companyId: "",
        requestedRole: null,
        companyReleasedAt: serverTimestamp(),
      }));
      batch.delete(doc(db, "companies", company.id));
      await batch.commit();
    } finally {
      purgingCompanyIds.delete(company.id);
    }
  }

  return expired.length;
}

export async function verifyCompanyOneDrive(companyId: string, role: UserRole, username: string, explicitConnection = false) {
  const normalized = username.trim().toLowerCase();
  if (!normalized) return false;
  const companyRef = doc(db, "companies", companyId);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(companyRef);
    const registered = String(snapshot.data()?.oneDriveAccount || "").trim().toLowerCase();

    if (!snapshot.exists()) {
      if (role !== "superadmin") return false;
      transaction.set(companyRef, {
        name: companyId === "rosa-atelie" ? "Rosa Ateliê" : companyId,
        adminEmail: companyId === "rosa-atelie" ? "bielcosta3101@gmail.com" : normalized,
        status: "active",
        oneDriveAccount: normalized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return true;
    }

    if (!registered) {
      if (!explicitConnection || (role !== "admin" && role !== "superadmin")) return false;
      transaction.update(companyRef, {
        oneDriveAccount: normalized,
        updatedAt: serverTimestamp(),
        ...(role === "superadmin" && companyId === "rosa-atelie" ? {
          name: "Rosa Ateliê",
          adminEmail: "bielcosta3101@gmail.com",
          status: "active",
        } : {}),
      });
      return true;
    }

    if (explicitConnection && (role === "admin" || role === "superadmin") && registered !== normalized) {
      transaction.update(companyRef, {
        oneDriveAccount: normalized,
        updatedAt: serverTimestamp(),
      });
      return true;
    }

    if (role === "superadmin" && companyId === "rosa-atelie" && (
      snapshot.data()?.name !== "Rosa Ateliê"
      || snapshot.data()?.adminEmail !== "bielcosta3101@gmail.com"
      || !snapshot.data()?.status
    )) {
      transaction.update(companyRef, {
        name: "Rosa Ateliê",
        adminEmail: "bielcosta3101@gmail.com",
        ...(!snapshot.data()?.status ? { status: "active" } : {}),
        updatedAt: serverTimestamp(),
      });
    }

    return registered === normalized;
  });
}
