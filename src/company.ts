import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import type { UserRole } from "./users";

export async function verifyCompanyOneDrive(companyId: string, role: UserRole, username: string) {
  const normalized = username.trim().toLowerCase();
  if (!normalized) return false;
  const companyRef = doc(db, "companies", companyId);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(companyRef);
    const registered = String(snapshot.data()?.oneDriveAccount || "").trim().toLowerCase();

    if (!snapshot.exists() || !registered) {
      if (role !== "admin") return false;
      transaction.set(companyRef, {
        name: companyId === "rosa-atelie" ? "Rosa Ateliê" : companyId,
        oneDriveAccount: normalized,
        updatedAt: serverTimestamp(),
        ...(!snapshot.exists() ? { createdAt: serverTimestamp() } : {}),
      }, { merge: true });
      return true;
    }

    return registered === normalized;
  });
}
