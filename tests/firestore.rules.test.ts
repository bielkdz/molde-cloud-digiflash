import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

let environment: RulesTestEnvironment;

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-molde-cloud",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });

  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "companies", "company-a"), {
        name: "Empresa A",
        status: "active",
        adminEmail: "admin-a@example.com",
      }),
      setDoc(doc(db, "companies", "company-b"), {
        name: "Empresa B",
        status: "active",
        adminEmail: "admin-b@example.com",
      }),
      setDoc(doc(db, "users", "user-a"), {
        uid: "user-a",
        email: "user-a@example.com",
        role: "user",
        companyId: "company-a",
      }),
      setDoc(doc(db, "users", "admin-a"), {
        uid: "admin-a",
        email: "admin-a@example.com",
        role: "admin",
        companyId: "company-a",
      }),
      setDoc(doc(db, "users", "user-b"), {
        uid: "user-b",
        email: "user-b@example.com",
        role: "user",
        companyId: "company-b",
      }),
      setDoc(doc(db, "users", "pending"), {
        uid: "pending",
        email: "pending@example.com",
        role: "pending",
        companyId: "company-a",
      }),
      setDoc(doc(db, "files", "file-a"), {
        companyId: "company-a",
        userId: "user-a",
        name: "arquivo-a.jpg",
      }),
      setDoc(doc(db, "files", "file-b"), {
        companyId: "company-b",
        userId: "user-b",
        name: "arquivo-b.jpg",
      }),
    ]);
  });
});

afterAll(async () => environment.cleanup());

describe("isolamento entre empresas", () => {
  it("permite que o usuário leia um arquivo da própria empresa", async () => {
    const db = environment.authenticatedContext("user-a").firestore();
    await assertSucceeds(getDoc(doc(db, "files", "file-a")));
  });

  it("bloqueia arquivo pertencente a outra empresa", async () => {
    const db = environment.authenticatedContext("user-a").firestore();
    await assertFails(getDoc(doc(db, "files", "file-b")));
  });

  it("impede transferir um registro alterando companyId ou userId", async () => {
    const db = environment.authenticatedContext("user-a").firestore();
    await assertFails(
      updateDoc(doc(db, "files", "file-a"), { companyId: "company-b" }),
    );
    await assertFails(
      updateDoc(doc(db, "files", "file-a"), { userId: "user-b" }),
    );
  });

  it("impede administrador de acessar usuário de outra empresa", async () => {
    const db = environment.authenticatedContext("admin-a").firestore();
    await assertFails(getDoc(doc(db, "users", "user-b")));
  });

  it("bloqueia dados para cadastro ainda pendente", async () => {
    const db = environment.authenticatedContext("pending").firestore();
    await assertFails(getDoc(doc(db, "files", "file-a")));
  });
});

describe("registro técnico seguro", () => {
  it("aceita somente os campos técnicos permitidos", async () => {
    const db = environment.authenticatedContext("user-a").firestore();
    await assertSucceeds(
      addDoc(collection(db, "errorLogs"), {
        companyId: "company-a",
        userId: "user-a",
        actorName: "Usuário A",
        operation: "synchronize_onedrive",
        code: "onedrive/403",
        createdAt: serverTimestamp(),
      }),
    );
    await assertFails(
      addDoc(collection(db, "errorLogs"), {
        companyId: "company-a",
        userId: "user-a",
        actorName: "Usuário A",
        operation: "upload_photo",
        code: "error",
        fileContent: "conteúdo proibido",
        createdAt: serverTimestamp(),
      }),
    );
  });
});
