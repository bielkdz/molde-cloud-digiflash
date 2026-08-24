import { useEffect, useState } from "react";
import {
  createCompanyForPendingUser,
  watchCompanies,
  type CompanyRecord,
} from "./company";
import {
  changeUserRole,
  watchPendingApprovals,
  type UserProfile,
} from "./users";

type ApprovalChoice = {
  type: "company" | "user";
  companyId: string;
  companyName: string;
};

export function GlobalApprovals({ currentUid }: { currentUid: string }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [message, setMessage] = useState("");
  const [busyUid, setBusyUid] = useState("");
  const [choices, setChoices] = useState<Record<string, ApprovalChoice>>({});

  useEffect(() => {
    const stopUsers = watchPendingApprovals(setUsers);
    const stopCompanies = watchCompanies(setCompanies);
    return () => {
      stopUsers();
      stopCompanies();
    };
  }, []);

  function choiceFor(user: UserProfile): ApprovalChoice {
    const availableCompanies = companies.filter(
      (company) => company.status !== "deleted",
    );
    const invitedCompany = availableCompanies.find(
      (company) =>
        company.id === user.companyId ||
        company.adminEmail.toLowerCase() === user.email.toLowerCase(),
    );
    return (
      choices[user.uid] || {
        type: user.requestedRole === "admin" ? "company" : "user",
        companyId: invitedCompany?.id || availableCompanies[0]?.id || "",
        companyName: "",
      }
    );
  }

  function updateChoice(user: UserProfile, patch: Partial<ApprovalChoice>) {
    setChoices((current) => ({
      ...current,
      [user.uid]: { ...choiceFor(user), ...patch },
    }));
  }

  async function reject(user: UserProfile) {
    setMessage("");
    setBusyUid(user.uid);
    try {
      await changeUserRole(user.uid, "blocked", user.companyId, currentUid);
      setMessage("Cadastro recusado e bloqueado.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível recusar este cadastro.",
      );
    } finally {
      setBusyUid("");
    }
  }

  async function authorize(user: UserProfile) {
    const choice = choiceFor(user);
    const invitedCompany = companies.find(
      (company) =>
        company.status !== "deleted" &&
        (company.id === user.companyId ||
          company.adminEmail.toLowerCase() === user.email.toLowerCase()),
    );
    setMessage("");
    setBusyUid(user.uid);
    try {
      if (choice.type === "company") {
        if (invitedCompany && user.requestedRole === "admin") {
          await changeUserRole(
            user.uid,
            "admin",
            invitedCompany.id,
            currentUid,
          );
          setMessage(
            `${user.name || "Administrador"} foi autorizado na empresa ${invitedCompany.name}.`,
          );
        } else {
          await createCompanyForPendingUser(
            user.uid,
            choice.companyName,
            user.email,
            currentUid,
          );
          setMessage(
            `Empresa ${choice.companyName.trim()} criada e administrador autorizado.`,
          );
        }
      } else {
        const target = companies.find(
          (company) =>
            company.id === choice.companyId && company.status !== "deleted",
        );
        if (!target) throw new Error("Selecione uma empresa válida.");
        await changeUserRole(user.uid, "user", target.id, currentUid);
        setMessage(
          `${user.name || "Usuário"} foi vinculado à empresa ${target.name}.`,
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível concluir esta autorização.",
      );
    } finally {
      setBusyUid("");
    }
  }

  if (!users.length) return null;

  return (
    <section className="global-approvals panel">
      <div className="panel-title">
        <div>
          <small>ADMINISTRADOR GERAL</small>
          <h3>Aprovações pendentes</h3>
        </div>
        <b>{users.length}</b>
      </div>
      <p>Confira o e-mail e a empresa antes de liberar o acesso.</p>
      {message && <div className="system-notice">{message}</div>}
      <div className="approval-list">
        {users.map((user) => {
          const choice = choiceFor(user);
          const availableCompanies = companies.filter(
            (company) => company.status !== "deleted",
          );
          const invitedCompany = availableCompanies.find(
            (company) =>
              company.id === user.companyId ||
              company.adminEmail.toLowerCase() === user.email.toLowerCase(),
          );
          const canAuthorize =
            choice.type === "user"
              ? Boolean(choice.companyId)
              : Boolean(
                  (invitedCompany && user.requestedRole === "admin") ||
                    choice.companyName.trim(),
                );
          return (
            <article key={user.uid}>
              <div className="user-avatar">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="" />
                ) : (
                  user.name?.[0] || "U"
                )}
              </div>
              <div className="approval-details">
                <strong>{user.name || "Usuário"}</strong>
                <small>{user.email}</small>
                <small>
                  Solicitação:{" "}
                  {user.requestedRole === "admin"
                    ? "administrar empresa"
                    : "acesso ao sistema"}
                </small>
              </div>
              <div className="approval-controls">
                <label>
                  Autorizar como
                  <select
                    value={choice.type}
                    onChange={(event) =>
                      updateChoice(user, {
                        type: event.target.value as "company" | "user",
                      })
                    }
                  >
                    <option value="company">Empresa</option>
                    <option value="user">Usuário de uma empresa</option>
                  </select>
                </label>
                {choice.type === "user" ? (
                  <label>
                    Vincular à empresa
                    <select
                      value={choice.companyId}
                      onChange={(event) =>
                        updateChoice(user, { companyId: event.target.value })
                      }
                    >
                      <option value="">Selecione</option>
                      {availableCompanies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : invitedCompany && user.requestedRole === "admin" ? (
                  <div className="approval-company-ready">
                    <small>EMPRESA JÁ CADASTRADA</small>
                    <strong>{invitedCompany.name}</strong>
                  </div>
                ) : (
                  <label>
                    Nome da nova empresa
                    <input
                      value={choice.companyName}
                      onChange={(event) =>
                        updateChoice(user, { companyName: event.target.value })
                      }
                      placeholder="Ex.: Confecções Modelo"
                    />
                  </label>
                )}
              </div>
              <div className="approval-buttons">
                <button
                  className="primary"
                  disabled={!canAuthorize || Boolean(busyUid)}
                  onClick={() => void authorize(user)}
                >
                  {busyUid === user.uid ? "Autorizando..." : "Autorizar"}
                </button>
                <button
                  className="danger-action"
                  disabled={Boolean(busyUid)}
                  onClick={() => void reject(user)}
                >
                  Recusar
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
