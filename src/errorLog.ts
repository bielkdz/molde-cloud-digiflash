import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import type { WorkspaceActor } from "./workspace";

export type ErrorLogRecord = {
  id: string;
  companyId: string;
  userId: string;
  actorName: string;
  operation: string;
  code: string;
  status?: "pending" | "resolved";
  createdAt?: Timestamp;
  resolvedAt?: Timestamp;
  resolvedBy?: string;
};

export function safeErrorCode(error: unknown) {
  if (typeof error === "object" && error && "errorCode" in error) {
    const code = String(error.errorCode || "").trim();
    if (code) return code.slice(0, 80);
  }
  if (error instanceof Error) {
    const knownCode = error.message.split(":", 1)[0].trim();
    if (/^[a-z0-9/_-]+$/i.test(knownCode)) return knownCode.slice(0, 80);
    return error.name.slice(0, 80) || "Error";
  }
  return "unknown_error";
}

export async function logOperationalError(
  actor: WorkspaceActor,
  operation: string,
  error: unknown,
) {
  await addDoc(collection(db, "errorLogs"), {
    companyId: actor.companyId,
    userId: actor.userId,
    actorName: actor.name,
    operation: operation.slice(0, 80),
    code: safeErrorCode(error),
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

export function watchErrorLogs(
  companyId: string | null,
  callback: (items: ErrorLogRecord[]) => void,
  onError: (message: string) => void,
) {
  const source = companyId
    ? query(collection(db, "errorLogs"), where("companyId", "==", companyId))
    : collection(db, "errorLogs");
  return onSnapshot(
    source,
    (snapshot) =>
      callback(
        snapshot.docs
          .map((item) => ({
            id: item.id,
            ...(item.data() as Omit<ErrorLogRecord, "id">),
          }))
          .sort(
            (a, b) =>
              (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0),
          ),
      ),
    () => onError("Não foi possível carregar os registros técnicos."),
  );
}

export async function resolveErrorLog(id: string, userId: string) {
  await updateDoc(doc(db, "errorLogs", id), {
    status: "resolved",
    resolvedAt: serverTimestamp(),
    resolvedBy: userId,
  });
}
