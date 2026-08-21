import { useEffect, useState } from "react";
import { watchCompanies, type CompanyRecord } from "./company";
import { changeUserRole, watchPendingApprovals, type UserProfile, type UserRole } from "./users";

export function GlobalApprovals({ currentUid }: { currentUid: string }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const stopUsers = watchPendingApprovals(setUsers);
    const stopCompanies = watchCompanies(setCompanies);
    return () => {
      stopUsers();
      stopCompanies();
    };
  }, []);

  async function setRole(user: UserProfile, role: UserRole) {
    setMessage("");
    try {
      await changeUserRole(user.uid, role, user.companyId, currentUid);
      setMessage(role === "blocked" ? "Cadastro recusado e bloqueado." : "Usuário autorizado com sucesso.");
    } catch {
      setMessage("Não foi possível atualizar esta autorização.");
    }
  }

  if (!users.length) return null;

  return <section className="global-approvals panel">
    <div className="panel-title">
      <div><small>ADMINISTRADOR GERAL</small><h3>Aprovações pendentes</h3></div>
      <b>{users.length}</b>
    </div>
    <p>Confira o e-mail e a empresa antes de liberar o acesso.</p>
    {message && <div className="system-notice">{message}</div>}
    <div className="approval-list">
      {users.map((user) => {
        const company = companies.find((item) => item.id === user.companyId);
        const approvedRole: UserRole = user.requestedRole === "admin" ? "admin" : "user";
        return <article key={user.uid}>
          <div className="user-avatar">{user.photoURL ? <img src={user.photoURL} alt=""/> : (user.name?.[0] || "U")}</div>
          <div className="approval-details">
            <strong>{user.name || "Usuário"}</strong>
            <small>{user.email}</small>
            <small>Empresa: {company?.name || user.companyId}</small>
          </div>
          <span className="role-badge pending">{approvedRole === "admin" ? "Administrador" : "Funcionário"}</span>
          <button className="primary" onClick={() => void setRole(user, approvedRole)}>Autorizar</button>
          <button className="danger-action" onClick={() => void setRole(user, "blocked")}>Recusar</button>
        </article>;
      })}
    </div>
  </section>;
}
