import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import {
  createCompany,
  removeCompany,
  restoreCompany,
  setCompanyStatus,
  verifyCompanyOneDrive,
  watchCompanies,
  watchCompany,
  type CompanyRecord,
  type CompanyStatus,
} from "./company";
import {
  cancelEmployeeInvite,
  changeUserPermissions,
  changeUserRole,
  ensureUserProfile,
  inviteEmployee,
  removeUserAccess,
  watchAllUsers,
  watchEmployeeInvites,
  watchUserProfile,
  type EmployeeInvitation,
  type UserProfile,
  type UserPermissions,
  type UserRole,
} from "./users";
import {
  connectOneDrive,
  consumeOneDriveConnectionIntent,
  consumeOneDriveRenewalNotice,
  deleteOneDriveItem,
  downloadOneDriveItem,
  ensureOneDriveFolder,
  getOneDriveAccount,
  getOneDriveStorage,
  isOneDriveConfigured,
  moveOneDriveFolderToTrash,
  moveOneDriveItem,
  oneDriveErrorMessage,
  readOneDriveSnapshot,
  renameOneDriveItem,
  restoreOneDriveFolder,
  uploadPhotoToOneDrive,
  type OneDriveStorage,
} from "./onedrive";
import {
  createFolder,
  linkFolderToOneDrive,
  migrateLegacyWorkspace,
  moveFileRecord,
  permanentlyDeleteFileRecord,
  permanentlyDeleteFolderRecord,
  registerPhoto,
  removeFileRecord,
  removeFolder,
  renameFileRecord,
  renameFolder,
  restoreFolder,
  restoreFileRecord,
  synchronizeWorkspace,
  watchDeletedFiles,
  watchDeletedFolders,
  watchFiles,
  watchFolders,
  watchHistory,
  type FileRecord,
  type FolderRecord,
  type HistoryRecord,
} from "./workspace";
import { GlobalApprovals } from "./GlobalApprovals";
import { useDialog } from "./DialogProvider";
import {
  logOperationalError,
  resolveErrorLog,
  watchErrorLogs,
  type ErrorLogRecord,
} from "./errorLog";

type Screen =
  | "dashboard"
  | "capture"
  | "files"
  | "history"
  | "search"
  | "report"
  | "errors"
  | "users"
  | "companies"
  | "settings";
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type AppNotification = {
  id: string;
  title: string;
  detail: string;
  kind: "info" | "warning" | "danger" | "success";
  createdAt: number;
  read: boolean;
};
type StorageSample = { used: number; total: number; createdAt: number };
type ConnectionTestState = {
  status: "idle" | "testing" | "success" | "error";
  message: string;
  testedAt?: Date;
};
type DemoStep = {
  screen: Screen;
  icon: string;
  eyebrow: string;
  title: string;
  detail: string;
};
const demoSteps: DemoStep[] = [
  { screen: "dashboard", icon: "home", eyebrow: "VISÃO GERAL", title: "Apresente o problema e a solução", detail: "O Molde Cloud leva a fotografia original do quadro DigiFlash, feita no celular, até o OneDrive acessível no computador." },
  { screen: "files", icon: "folder", eyebrow: "ETAPA 1", title: "Organize o trabalho em uma pasta", detail: "Crie ou escolha uma pasta com o nome do projeto. Nada é criado automaticamente durante esta demonstração." },
  { screen: "capture", icon: "camera", eyebrow: "ETAPA 2", title: "Fotografe e confira a imagem", detail: "Abra a câmera, confira a fotografia e informe a pasta e o nome do arquivo antes do envio." },
  { screen: "capture", icon: "cloud", eyebrow: "ETAPA 3", title: "Envie o original ao OneDrive", detail: "Mostre o progresso em onda e explique que a fotografia original é enviada com segurança para o OneDrive da empresa." },
  { screen: "search", icon: "search", eyebrow: "RESULTADO", title: "Localize no celular e abra no computador", detail: "Pesquise pelo nome, confirme o histórico e finalize mostrando o mesmo arquivo sincronizado na pasta do OneDrive no computador." },
];
const nav = [
  { id: "dashboard" as Screen, label: "Início", icon: "home" },
  { id: "capture" as Screen, label: "Tirar foto", icon: "camera" },
  { id: "files" as Screen, label: "Arquivos", icon: "folder" },
  { id: "history" as Screen, label: "Histórico", icon: "clock" },
  { id: "search" as Screen, label: "Localizar", icon: "search" },
];

export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [profile, setProfile] = useState<UserProfile | null>(null),
    [loading, setLoading] = useState(true),
    [splashVisible, setSplashVisible] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let unsubscribeAuth = () => {},
      unsubscribeProfile = () => {};
    let active = true,
      splashTimer = window.setTimeout(() => {
        if (active) setSplashVisible(false);
      }, 1800);
    unsubscribeAuth = onAuthStateChanged(auth, (current) => {
      unsubscribeProfile();
      setUser(current);
      setProfile(null);
      if (!current) {
        setLoading(false);
        return;
      }
      window.clearTimeout(splashTimer);
      setSplashVisible(true);
      splashTimer = window.setTimeout(() => {
        if (active) setSplashVisible(false);
      }, 2400);
      setLoading(false);
      unsubscribeProfile = watchUserProfile(current.uid, (nextProfile) => {
        if (active) setProfile(nextProfile);
      });
      void ensureUserProfile(current)
        .then((initialProfile) => {
          if (active) setProfile(initialProfile);
        })
        .catch(() => {
          if (active)
            setError(
              "Login realizado, mas não foi possível carregar sua permissão.",
            );
        });
    });
    return () => {
      active = false;
      window.clearTimeout(splashTimer);
      unsubscribeAuth();
      unsubscribeProfile();
    };
  }, []);
  if (loading || splashVisible)
    return (
      <div className="auth-screen auth-loading-screen">
        <div className="auth-card auth-loading-card">
          <span className="brand-mark">M</span>
          <h1>Molde Cloud</h1>
          <p>Preparando seu acesso...</p>
          <div className="auth-loader" />
        </div>
      </div>
    );
  if (!user) return <AuthScreen error={error} setError={setError} />;
  if (!profile)
    return (
      <AccessScreen
        title="Carregando permissão"
        message="Estamos preparando seu perfil de acesso."
        user={user}
      />
    );
  if (profile.role === "pending")
    return (
      <AccessScreen
        title="Cadastro aguardando aprovação"
        message="O administrador precisa liberar seu acesso. Esta tela será atualizada automaticamente."
        user={user}
      />
    );
  if (profile.role === "blocked")
    return (
      <AccessScreen
        title="Acesso bloqueado"
        message="Procure o administrador do Molde Cloud para revisar seu cadastro."
        user={user}
      />
    );
  return <DashboardApp user={user} profile={profile} notice={error} />;
}

function AuthScreen({
  error,
  setError,
}: {
  error: string;
  setError: (value: string) => void;
}) {
  const [mode, setMode] = useState<"login" | "register">("login"),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "register") {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );
        await updateProfile(credential.user, { displayName: name.trim() });
        await ensureUserProfile(credential.user);
        setMessage(
          "Cadastro criado. Aguarde a aprovação do administrador dentro do sistema.",
        );
      } else await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (value: any) {
      const code = value?.code;
      setError(
        code === "auth/email-already-in-use"
          ? "Este e-mail já possui cadastro."
          : code === "auth/weak-password"
            ? "Use uma senha com pelo menos 6 caracteres."
            : code === "auth/operation-not-allowed"
              ? "O login por e-mail ainda precisa ser ativado no Firebase."
              : "E-mail ou senha inválidos.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function resetPassword() {
    if (!email.trim()) {
      setError("Digite seu e-mail primeiro.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage("Enviamos o link de recuperação para seu e-mail.");
    } catch {
      setMessage("Se o cadastro existir, o link de recuperação será enviado.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <span className="brand-mark">M</span>
        <small>DIGIFLASH</small>
        <h1>Molde Cloud</h1>
        <p>
          {mode === "login"
            ? "Entre para acessar suas fotografias, pastas e histórico."
            : "Crie sua conta. O administrador aprovará seu acesso."}
        </p>
        <div className="auth-tabs">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Entrar
          </button>
          <button
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            Criar conta
          </button>
        </div>
        {error && <div className="auth-error">{error}</div>}
        {message && <div className="auth-success">{message}</div>}
        <form className="email-form" onSubmit={submit}>
          {mode === "register" && (
            <label>
              Nome
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
              />
            </label>
          )}
          <label>
            E-mail
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </label>
          <label>
            Senha
            <input
              required
              minLength={6}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </label>
          <button className="primary auth-submit" disabled={busy}>
            {busy
              ? "Aguarde..."
              : mode === "login"
                ? "Entrar com e-mail"
                : "Criar minha conta"}
          </button>
        </form>
        {mode === "login" && (
          <button
            className="forgot-password"
            disabled={busy}
            onClick={resetPassword}
          >
            Esqueci minha senha
          </button>
        )}
        <div className="auth-divider">
          <span>ou</span>
        </div>
        <button
          className="google-login"
          onClick={() => {
            setError("");
            void signInWithPopup(auth, googleProvider).catch(() =>
              setError("Não foi possível abrir o login do Google."),
            );
          }}
        >
          <b>G</b> Entrar com Google
        </button>
        <span className="auth-note">
          Sua sessão permanecerá salva neste aparelho.
        </span>
      </div>
    </div>
  );
}

function AccessScreen({
  title,
  message,
  user,
}: {
  title: string;
  message: string;
  user: User;
}) {
  return (
    <div className="auth-screen">
      <div className="auth-card access-card">
        <span className="brand-mark">M</span>
        <small>DIGIFLASH</small>
        <h2>{title}</h2>
        <p>{message}</p>
        <strong>{user.email}</strong>
        <button className="outline full" onClick={() => signOut(auth)}>
          Sair da conta
        </button>
      </div>
    </div>
  );
}

function DashboardApp({
  user,
  profile,
  notice,
}: {
  user: User;
  profile: UserProfile;
  notice: string;
}) {
  const dialog = useDialog();
  const [screen, setScreen] = useState<Screen>("dashboard"),
    [collapsed, setCollapsed] = useState(true);
  const [folders, setFolders] = useState<FolderRecord[]>([]),
    [deletedFolders, setDeletedFolders] = useState<FolderRecord[]>([]),
    [files, setFiles] = useState<FileRecord[]>([]),
    [deletedFiles, setDeletedFiles] = useState<FileRecord[]>([]),
    [history, setHistory] = useState<HistoryRecord[]>([]);
  const [folderId, setFolderId] = useState(""),
    [newFolder, setNewFolder] = useState(""),
    [showFolder, setShowFolder] = useState(false);
  const [fileName, setFileName] = useState(""),
    [photo, setPhoto] = useState<string | null>(null),
    [photoFile, setPhotoFile] = useState<File | null>(null),
    [query, setQuery] = useState("");
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [oneDriveAccount, setOneDriveAccount] = useState("");
  const [oneDriveMenuOpen, setOneDriveMenuOpen] = useState(false),
    [oneDriveStorage, setOneDriveStorage] = useState<OneDriveStorage | null>(
      null,
    ),
    [oneDriveStorageLoading, setOneDriveStorageLoading] = useState(false),
    [connectionTest, setConnectionTest] = useState<ConnectionTestState>({
      status: "idle",
      message: "Faça um teste antes da apresentação para confirmar o acesso.",
    });
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
      readLocalList<AppNotification>(
        `molde-cloud:notifications:${profile.companyId}`,
      ),
    ),
    [notificationOpen, setNotificationOpen] = useState(false),
    [updateAvailable, setUpdateAvailable] = useState(false);
  const [storageSamples, setStorageSamples] = useState<StorageSample[]>(() =>
    readLocalList<StorageSample>(`molde-cloud:storage:${profile.companyId}`),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine),
    [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
      null,
    );
  const [currentCompany, setCurrentCompany] = useState<CompanyRecord | null>(
      null,
    ),
    [profileOpen, setProfileOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null),
    [previewUrl, setPreviewUrl] = useState(""),
    [previewLoading, setPreviewLoading] = useState(false),
    [previewZoom, setPreviewZoom] = useState(1);
  const [fileSort, setFileSort] = useState<"newest" | "oldest" | "name">(
      "newest",
    ),
    [fileFolderFilter, setFileFolderFilter] = useState("all"),
    [selectedFiles, setSelectedFiles] = useState<Set<string>>(() => new Set());
  const [sentPhotosOpen, setSentPhotosOpen] = useState(false),
    [trashOpen, setTrashOpen] = useState(false),
    [folderTrashOpen, setFolderTrashOpen] = useState(false),
    [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [adminNavOpen, setAdminNavOpen] = useState(false);
  const [demoMode, setDemoMode] = useState<"commercial" | "guide">("commercial");
  const [demoPaused, setDemoPaused] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false),
    [demoStep, setDemoStep] = useState(0);
  const [healthErrors, setHealthErrors] = useState<ErrorLogRecord[]>([]);
  const [companyUsers, setCompanyUsers] = useState<UserProfile[]>([]);
  const [mobileActions, setMobileActions] = useState<
    | { type: "folder"; item: FolderRecord }
    | { type: "file"; item: FileRecord }
    | null
  >(null);
  const historyInitialized = useRef(false);
  const companyStatus: CompanyStatus = currentCompany?.status || "active";
  const managerAccess =
    profile.role === "admin" || profile.role === "superadmin";
  const canCreateFolder =
      managerAccess || profile.permissions?.createFolder !== false,
    canRenameItems =
      managerAccess || profile.permissions?.renameItems !== false,
    canDeleteItems =
      managerAccess || profile.permissions?.deleteItems !== false,
    canViewTrash = managerAccess || profile.permissions?.viewTrash !== false;
  const adminNav =
    profile.role === "superadmin"
      ? [
          { id: "settings" as Screen, label: "Configurações", icon: "building" },
          { id: "report" as Screen, label: "Relatório", icon: "chart" },
          { id: "errors" as Screen, label: "Erros", icon: "alert" },
          { id: "users" as Screen, label: "Usuários", icon: "users" },
          { id: "companies" as Screen, label: "Empresas", icon: "building" },
        ]
      : profile.role === "admin"
        ? [
            { id: "settings" as Screen, label: "Configurações", icon: "building" },
            { id: "report" as Screen, label: "Relatório", icon: "chart" },
            { id: "errors" as Screen, label: "Erros", icon: "alert" },
            { id: "users" as Screen, label: "Usuários", icon: "users" },
          ]
        : [];
  const visibleNav = [...nav, ...adminNav];
  const workspaceActor = useMemo(
    () => ({
      userId: user.uid,
      companyId: profile.companyId,
      name: profile.name || user.displayName || "Usuário",
    }),
    [user.uid, user.displayName, profile.companyId, profile.name],
  );
  function addNotification(
    title: string,
    detail: string,
    kind: AppNotification["kind"] = "info",
    stableId?: string,
  ) {
    setNotifications((current) => {
      const id = stableId || `${Date.now()}-${Math.random()}`;
      if (current.some((item) => item.id === id)) return current;
      const next = [
        { id, title, detail, kind, createdAt: Date.now(), read: false },
        ...current,
      ].slice(0, 30);
      localStorage.setItem(
        `molde-cloud:notifications:${profile.companyId}`,
        JSON.stringify(next),
      );
      return next;
    });
  }
  function recordError(operation: string, error: unknown) {
    void logOperationalError(workspaceActor, operation, error).catch(() => {});
    addNotification(
      "Operação precisa de atenção",
      `${operationLabel(operation)} não foi concluída. Consulte o painel de erros se o problema continuar.`,
      "danger",
    );
  }
  const filtered = useMemo(
    () =>
      files.filter((x) =>
        `${x.name} ${x.folderName}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [files, query],
  );
  const organizedFiles = useMemo(
    () =>
      files
        .filter(
          (item) =>
            fileFolderFilter === "all" || item.folderId === fileFolderFilter,
        )
        .sort((a, b) => {
          if (fileSort === "name")
            return a.name.localeCompare(b.name, "pt-BR", {
              sensitivity: "base",
            });
          const aTime = (a.uploadedAt ?? a.createdAt)?.toMillis() ?? 0,
            bTime = (b.uploadedAt ?? b.createdAt)?.toMillis() ?? 0;
          return fileSort === "oldest" ? aTime - bTime : bTime - aTime;
        }),
    [files, fileFolderFilter, fileSort],
  );
  const lastSynchronization = history.find(
    (item) => item.action === "workspace_synced",
  );
  useEffect(() => {
    void migrateLegacyWorkspace(user.uid, profile.companyId).catch(() =>
      setMessage(
        "Não foi possível preparar os dados compartilhados da empresa.",
      ),
    );
    const fail = (value: string) => setMessage(value);
    const stopFolders = watchFolders(profile.companyId, setFolders, fail),
      stopDeletedFolders = watchDeletedFolders(
        profile.companyId,
        setDeletedFolders,
        fail,
      ),
      stopFiles = watchFiles(profile.companyId, setFiles, fail),
      stopDeleted = watchDeletedFiles(profile.companyId, setDeletedFiles, fail),
      stopHistory = watchHistory(profile.companyId, setHistory, fail);
    return () => {
      stopFolders();
      stopDeletedFolders();
      stopFiles();
      stopDeleted();
      stopHistory();
    };
  }, [user.uid, profile.companyId]);
  useEffect(
    () => watchCompany(profile.companyId, setCurrentCompany),
    [profile.companyId],
  );
  useEffect(() => {
    if (!managerAccess) {
      setHealthErrors([]);
      setCompanyUsers([]);
      return;
    }
    const stopErrors = watchErrorLogs(
      profile.companyId,
      setHealthErrors,
      () => {},
    );
    const stopUsers = watchAllUsers(profile.companyId, setCompanyUsers);
    return () => {
      stopErrors();
      stopUsers();
    };
  }, [managerAccess, profile.companyId]);
  useEffect(() => {
    let active = true;
    void getOneDriveAccount()
      .then(async (account) => {
        if (!account || !active) return;
        const explicitConnection = consumeOneDriveConnectionIntent(
          profile.companyId,
        );
        const renewed = consumeOneDriveRenewalNotice();
        const username = account.username || account.name || "";
        const valid = await verifyCompanyOneDrive(
          profile.companyId,
          profile.role,
          username,
          explicitConnection,
        );
        if (!active) return;
        if (valid) {
          setOneDriveAccount(account.name || account.username);
          if (renewed)
            setMessage(
              "Sessão do OneDrive renovada. Clique em Sincronizar novamente.",
            );
        } else {
          setOneDriveAccount("");
          setMessage(
            profile.role === "admin" || profile.role === "superadmin"
              ? "Conecte novamente o OneDrive oficial desta empresa."
              : "Esta não é a conta OneDrive definida pelo administrador da empresa.",
          );
        }
      })
      .catch(() => {
        if (active)
          setMessage("Não foi possível restaurar a conexão com o OneDrive.");
      });
    return () => {
      active = false;
    };
  }, [profile.companyId, profile.role]);
  useEffect(() => {
    if (oneDriveAccount) void loadOneDriveStorage();
  }, [oneDriveAccount]);
  useEffect(() => {
    if (!message || busy) return;
    const timer = window.setTimeout(() => setMessage(""), 5000);
    return () => window.clearTimeout(timer);
  }, [message, busy]);
  useEffect(() => {
    const connected = () => setOnline(true),
      disconnected = () => setOnline(false),
      capture = (event: Event) => {
        event.preventDefault();
        setInstallPrompt(event as InstallPromptEvent);
      },
      installed = () => setInstallPrompt(null);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  useEffect(() => {
    if (!profileOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [profileOpen]);
  useEffect(() => {
    const reloadedForUpdate =
      sessionStorage.getItem("molde-cloud:pwa-reload") === "pending";
    if (reloadedForUpdate) {
      sessionStorage.removeItem("molde-cloud:pwa-reload");
      sessionStorage.removeItem("molde-cloud:update-ready");
      setUpdateAvailable(false);
    }
    const ready = () => {
      if (sessionStorage.getItem("molde-cloud:pwa-reload") === "pending")
        return;
      setUpdateAvailable(true);
      addNotification(
        "Nova versão disponível",
        "Atualize o Molde Cloud para usar as melhorias mais recentes.",
        "info",
        "pwa-update-ready",
      );
    };
    if (
      !reloadedForUpdate &&
      sessionStorage.getItem("molde-cloud:update-ready") === "yes"
    )
      ready();
    window.addEventListener("molde-cloud:update-ready", ready);
    return () => window.removeEventListener("molde-cloud:update-ready", ready);
  }, []);
  useEffect(() => {
    if (historyInitialized.current) return;
    historyInitialized.current = true;
    window.history.replaceState(
      { ...window.history.state, moldeCloudScreen: "dashboard" },
      "",
    );
    window.history.pushState({ moldeCloudScreen: "dashboard" }, "");
  }, []);
  useEffect(() => {
    const restoreCurrentEntry = () => {
      window.history.pushState({ moldeCloudScreen: screen }, "");
    };
    const goBackInsideApp = (event: PopStateEvent) => {
      if (demoOpen) {
        setDemoOpen(false);
        restoreCurrentEntry();
        return;
      }
      if (mobileActions) {
        setMobileActions(null);
        restoreCurrentEntry();
        return;
      }
      if (previewFile) {
        setPreviewFile(null);
        restoreCurrentEntry();
        return;
      }
      if (showFolder) {
        setShowFolder(false);
        restoreCurrentEntry();
        return;
      }
      if (profileOpen) {
        setProfileOpen(false);
        restoreCurrentEntry();
        return;
      }
      if (notificationOpen) {
        setNotificationOpen(false);
        restoreCurrentEntry();
        return;
      }
      if (oneDriveMenuOpen) {
        setOneDriveMenuOpen(false);
        restoreCurrentEntry();
        return;
      }
      if (!collapsed) {
        setCollapsed(true);
        restoreCurrentEntry();
        return;
      }

      const previous = event.state?.moldeCloudScreen as Screen | undefined;
      if (previous && previous !== screen) {
        setScreen(previous);
        setProfileOpen(false);
        setCollapsed(true);
        return;
      }

      // Keep one internal history entry on the dashboard so a single Android
      // back gesture never closes the browser/app by accident.
      if (screen === "dashboard") restoreCurrentEntry();
    };
    window.addEventListener("popstate", goBackInsideApp);
    return () => window.removeEventListener("popstate", goBackInsideApp);
  }, [
    collapsed,
    demoOpen,
    mobileActions,
    notificationOpen,
    oneDriveMenuOpen,
    previewFile,
    profileOpen,
    screen,
    showFolder,
  ]);
  useEffect(() => {
    if (!folders.some((item) => item.id === folderId))
      setFolderId(folders[0]?.id ?? "");
  }, [folders, folderId]);
  useEffect(() => {
    if (
      fileFolderFilter !== "all" &&
      !folders.some((item) => item.id === fileFolderFilter)
    )
      setFileFolderFilter("all");
  }, [folders, fileFolderFilter]);
  useEffect(() => {
    setSelectedFiles((current) => {
      const valid = new Set(
        [...current].filter((id) => files.some((file) => file.id === id)),
      );
      return valid.size === current.size ? current : valid;
    });
  }, [files]);
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo);
    },
    [photo],
  );
  useEffect(() => {
    if (!previewFile?.oneDriveItemId) {
      setPreviewUrl("");
      return;
    }
    let active = true,
      url = "";
    setPreviewLoading(true);
    setPreviewZoom(1);
    void downloadOneDriveItem(previewFile.oneDriveItemId)
      .then((blob) => {
        if (!active) return;
        url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      })
      .catch((error) => {
        if (active) setMessage(oneDriveErrorMessage(error));
      })
      .finally(() => {
        if (active) setPreviewLoading(false);
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [previewFile]);
  function choosePhoto(file?: File) {
    if (!file) return;
    if (photo) URL.revokeObjectURL(photo);
    setPhoto(URL.createObjectURL(file));
    setPhotoFile(file);
    if (!fileName) setFileName(file.name.replace(/\.[^/.]+$/, ""));
  }
  async function addFolder() {
    if (!canCreateFolder) {
      setMessage("Seu administrador não liberou a criação de pastas.");
      return;
    }
    const name = newFolder.trim();
    if (!name) return;
    if (
      folders.some(
        (item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    ) {
      setMessage("Já existe uma pasta com esse nome.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const id = await createFolder(workspaceActor, name);
      if (oneDriveAccount) {
        const remote = await ensureOneDriveFolder(name);
        await linkFolderToOneDrive(id, remote.id);
      }
      setNewFolder("");
      setShowFolder(false);
      setMessage("Pasta criada e sincronizada com sucesso.");
    } catch (error) {
      recordError("create_folder", error);
      setMessage(
        "A pasta foi criada no sistema, mas pode estar aguardando sincronização com o OneDrive.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function editFolder(folder: FolderRecord) {
    if (!canRenameItems) {
      setMessage("Seu administrador não liberou a renomeação.");
      return;
    }
    const name = (
      await dialog.prompt({
        title: "Renomear pasta",
        message: "Informe o novo nome da pasta.",
        initialValue: folder.name,
        confirmText: "Salvar nome",
      })
    )?.trim();
    if (!name || name === folder.name) return;
    if (
      folders.some(
        (item) =>
          item.id !== folder.id &&
          item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      )
    ) {
      setMessage("Já existe uma pasta com esse nome.");
      return;
    }
    setBusy(true);
    try {
      if (folder.oneDriveItemId)
        await renameOneDriveItem(folder.oneDriveItemId, name);
      await renameFolder(workspaceActor, folder, name);
      setMessage("Pasta renomeada no sistema e no OneDrive.");
    } catch (error) {
      recordError("rename_folder", error);
      setMessage(oneDriveErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function deleteFolder(folder: FolderRecord) {
    if (!canDeleteItems) {
      setMessage("Seu administrador não liberou exclusões.");
      return;
    }
    const count = files.filter((item) => item.folderId === folder.id).length;
    const confirmed = await dialog.confirm({
      title: "Mover pasta para a lixeira?",
      message: `A pasta “${folder.name}”${count ? ` e suas ${count} foto(s)` : ""} poderá ser restaurada depois.`,
      confirmText: "Mover para lixeira",
      danger: true,
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      if (folder.oneDriveItemId)
        await moveOneDriveFolderToTrash(folder.oneDriveItemId);
      await removeFolder(workspaceActor, folder);
      setMessage("Pasta movida para a lixeira e disponível para restauração.");
    } catch (error) {
      recordError("delete_folder", error);
      setMessage(oneDriveErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function restoreDeletedFolder(folder: FolderRecord) {
    if (!canViewTrash) return;
    setBusy(true);
    try {
      if (folder.oneDriveItemId)
        await restoreOneDriveFolder(folder.oneDriveItemId);
      await restoreFolder(workspaceActor, folder);
      setMessage("Pasta e fotografias restauradas com sucesso.");
    } catch (error) {
      recordError("restore_folder", error);
      setMessage(oneDriveErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function permanentlyDeleteFolder(folder: FolderRecord) {
    if (!canViewTrash || !canDeleteItems) return;
    const confirmation = await dialog.prompt({
      title: "Excluir pasta definitivamente?",
      message: `Esta ação apagará “${folder.name}” e seus arquivos. Digite EXCLUIR para confirmar.`,
      placeholder: "EXCLUIR",
      confirmText: "Excluir definitivamente",
      danger: true,
    });
    if (confirmation !== "EXCLUIR") return;
    setBusy(true);
    try {
      if (folder.oneDriveItemId)
        await deleteOneDriveItem(folder.oneDriveItemId);
      await permanentlyDeleteFolderRecord(workspaceActor, folder);
      setMessage("Pasta excluída definitivamente.");
    } catch (error) {
      recordError("permanent_delete_folder", error);
      setMessage(oneDriveErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function renameFile(file: FileRecord) {
    if (!canRenameItems) {
      setMessage("Seu administrador não liberou a renomeação.");
      return;
    }
    const name = (
      await dialog.prompt({
        title: "Renomear arquivo",
        message: "Informe o novo nome do arquivo.",
        initialValue: file.name,
        confirmText: "Salvar nome",
      })
    )?.trim();
    if (!name || name === file.name) return;
    setBusy(true);
    try {
      const remote = file.oneDriveItemId
        ? await renameOneDriveItem(file.oneDriveItemId, name)
        : undefined;
      await renameFileRecord(
        workspaceActor,
        file,
        remote?.name || name,
        remote?.webUrl,
      );
      setMessage("Arquivo renomeado com sucesso.");
    } catch (error) {
      recordError("rename_file", error);
      setMessage(oneDriveErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function moveFile(file: FileRecord) {
    const choices = folders.filter((item) => item.id !== file.folderId);
    if (!choices.length) {
      setMessage("Crie outra pasta antes de mover este arquivo.");
      return;
    }
    const targetId = await dialog.select({
      title: "Mover arquivo",
      message: `Escolha a pasta de destino para “${file.name}”.`,
      confirmText: "Mover arquivo",
      options: choices.map((item) => ({ value: item.id, label: item.name })),
    });
    if (!targetId) return;
    const target = choices.find((item) => item.id === targetId);
    if (!target) {
      setMessage(
        "Pasta não encontrada. Digite o nome exatamente como aparece na lista.",
      );
      return;
    }
    setBusy(true);
    try {
      const remote = file.oneDriveItemId
        ? await moveOneDriveItem(file.oneDriveItemId, target.name)
        : undefined;
      await moveFileRecord(workspaceActor, file, target, remote?.webUrl);
      setMessage("Arquivo movido com sucesso.");
    } catch (error) {
      recordError("move_file", error);
      setMessage(oneDriveErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function deleteFile(file: FileRecord) {
    if (!canDeleteItems) {
      setMessage("Seu administrador não liberou exclusões.");
      return;
    }
    const confirmed = await dialog.confirm({
      title: "Mover para a lixeira?",
      message: `O arquivo “${file.name}” poderá ser restaurado posteriormente.`,
      confirmText: "Mover para lixeira",
      danger: true,
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      if (file.oneDriveItemId)
        await moveOneDriveItem(file.oneDriveItemId, "Lixeira Molde Cloud");
      await removeFileRecord(workspaceActor, file);
      setMessage("Arquivo movido para a lixeira do Molde Cloud.");
    } catch (error) {
      recordError("delete_file", error);
      setMessage(oneDriveErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function restoreDeletedFile(file: FileRecord) {
    if (!canViewTrash) return;
    setBusy(true);
    try {
      const remote = file.oneDriveItemId
        ? await moveOneDriveItem(file.oneDriveItemId, file.folderName)
        : undefined;
      await restoreFileRecord(workspaceActor, file, remote?.webUrl);
      setMessage(`“${file.name}” foi restaurado para ${file.folderName}.`);
    } catch (error) {
      recordError("restore_file", error);
      setMessage(oneDriveErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function permanentlyDeleteFile(file: FileRecord) {
    if (!canViewTrash || !canDeleteItems) return;
    const confirmation = await dialog.prompt({
      title: "Excluir definitivamente?",
      message: `Esta ação não poderá ser desfeita. Digite EXCLUIR para apagar “${file.name}”.`,
      placeholder: "Digite EXCLUIR",
      confirmText: "Excluir definitivamente",
      danger: true,
    });
    if (confirmation !== "EXCLUIR") return;
    setBusy(true);
    try {
      if (file.oneDriveItemId) await deleteOneDriveItem(file.oneDriveItemId);
      await permanentlyDeleteFileRecord(file);
      setMessage("Arquivo excluído permanentemente.");
    } catch (error) {
      recordError("permanent_delete_file", error);
      setMessage(oneDriveErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  function toggleFileSelection(id: string) {
    setSelectedFiles((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllVisible() {
    setSelectedFiles((current) => {
      const visibleIds = organizedFiles.map((item) => item.id),
        allSelected =
          visibleIds.length > 0 && visibleIds.every((id) => current.has(id));
      const next = new Set(current);
      visibleIds.forEach((id) =>
        allSelected ? next.delete(id) : next.add(id),
      );
      return next;
    });
  }
  async function moveSelectedFiles() {
    const selected = files.filter((item) => selectedFiles.has(item.id));
    if (!selected.length) return;
    const targetId = await dialog.select({
      title: "Mover arquivos selecionados",
      message: `Escolha a pasta de destino para ${selected.length} arquivo(s).`,
      confirmText: "Mover arquivos",
      options: folders.map((item) => ({ value: item.id, label: item.name })),
    });
    if (!targetId) return;
    const target = folders.find((item) => item.id === targetId);
    if (!target) {
      setMessage(
        "Pasta não encontrada. Digite o nome exatamente como aparece na lista.",
      );
      return;
    }
    setBusy(true);
    let moved = 0;
    try {
      for (const file of selected) {
        if (file.folderId === target.id) continue;
        const remote = file.oneDriveItemId
          ? await moveOneDriveItem(file.oneDriveItemId, target.name)
          : undefined;
        await moveFileRecord(workspaceActor, file, target, remote?.webUrl);
        moved += 1;
      }
      setSelectedFiles(new Set());
      setMessage(`${moved} arquivo(s) movido(s) para ${target.name}.`);
    } catch (error) {
      recordError("bulk_move_files", error);
      setMessage(
        `${moved} arquivo(s) movido(s) antes da interrupção. ${oneDriveErrorMessage(error)}`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function deleteSelectedFiles() {
    if (!canDeleteItems) {
      setMessage("Seu administrador não liberou exclusões.");
      return;
    }
    const selected = files.filter((item) => selectedFiles.has(item.id));
    if (!selected.length) return;
    const confirmation = await dialog.prompt({
      title: "Excluir arquivos selecionados?",
      message: `Digite EXCLUIR ${selected.length} para mover ${selected.length} arquivo(s) para a lixeira.`,
      placeholder: `EXCLUIR ${selected.length}`,
      confirmText: "Mover para lixeira",
      danger: true,
    });
    if (confirmation !== `EXCLUIR ${selected.length}`) return;
    setBusy(true);
    let removed = 0;
    try {
      for (const file of selected) {
        if (file.oneDriveItemId)
          await moveOneDriveItem(file.oneDriveItemId, "Lixeira Molde Cloud");
        await removeFileRecord(workspaceActor, file);
        removed += 1;
      }
      setSelectedFiles(new Set());
      setMessage(`${removed} arquivo(s) movido(s) para a lixeira.`);
    } catch (error) {
      recordError("bulk_delete_files", error);
      setMessage(
        `${removed} arquivo(s) movido(s) antes da interrupção. ${oneDriveErrorMessage(error)}`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function syncOneDrive() {
    if (!oneDriveAccount) {
      setMessage("Conecte o OneDrive antes de sincronizar.");
      return;
    }
    setBusy(true);
    setMessage("Comparando pastas e arquivos com o OneDrive...");
    try {
      const snapshot = await readOneDriveSnapshot();
      const result = await synchronizeWorkspace(
        workspaceActor,
        folders,
        files,
        snapshot,
      );
      setMessage(
        `Sincronização concluída: ${result.removedFolders} pasta(s) e ${result.removedFiles} arquivo(s) removido(s); ${result.updated} atualizado(s).`,
      );
    } catch (error) {
      recordError("synchronize_onedrive", error);
      setMessage(oneDriveErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function handleOneDrive() {
    if (!isOneDriveConfigured) {
      setMessage(
        "A integração está pronta no código. Falta cadastrar o aplicativo na Microsoft para ativá-la.",
      );
      return;
    }
    setBusy(true);
    setMessage("Abrindo a autorização da Microsoft...");
    try {
      await connectOneDrive(profile.companyId);
    } catch (error) {
      recordError("connect_onedrive", error);
      setMessage(oneDriveErrorMessage(error));
      setBusy(false);
    } finally {
      setCollapsed(true);
    }
  }
  async function loadOneDriveStorage() {
    if (!oneDriveAccount || oneDriveStorageLoading) return;
    setOneDriveStorageLoading(true);
    try {
      const storage = await getOneDriveStorage();
      setOneDriveStorage(storage);
      const sample = {
        used: storage.used,
        total: storage.total,
        createdAt: Date.now(),
      };
      setStorageSamples((current) => {
        const today = new Date().toDateString();
        const next = [
          sample,
          ...current.filter(
            (item) => new Date(item.createdAt).toDateString() !== today,
          ),
        ].slice(0, 30);
        localStorage.setItem(
          `molde-cloud:storage:${profile.companyId}`,
          JSON.stringify(next),
        );
        return next;
      });
      const percentage = storage.total
        ? (storage.used / storage.total) * 100
        : 0;
      if (percentage >= 90)
        addNotification(
          "Armazenamento crítico",
          `O OneDrive está com ${percentage.toFixed(0)}% do espaço ocupado.`,
          "danger",
          `storage-90-${new Date().toDateString()}`,
        );
      else if (percentage >= 80)
        addNotification(
          "Armazenamento em atenção",
          `O OneDrive está com ${percentage.toFixed(0)}% do espaço ocupado.`,
          "warning",
          `storage-80-${new Date().toDateString()}`,
        );
    } catch (error) {
      recordError("read_onedrive_storage", error);
      setOneDriveStorage(null);
    } finally {
      setOneDriveStorageLoading(false);
    }
  }
  async function testOneDriveConnection() {
    if (!oneDriveAccount) {
      setConnectionTest({
        status: "error",
        message: "Conecte o OneDrive antes de realizar o teste.",
      });
      return;
    }
    setConnectionTest({
      status: "testing",
      message: "Consultando a conta e o armazenamento do OneDrive...",
    });
    setOneDriveStorageLoading(true);
    try {
      const storage = await getOneDriveStorage();
      const testedAt = new Date();
      setOneDriveStorage(storage);
      setConnectionTest({
        status: "success",
        message: "Conexão confirmada. O Molde Cloud consegue acessar o OneDrive.",
        testedAt,
      });
    } catch (error) {
      recordError("test_onedrive_connection", error);
      setConnectionTest({
        status: "error",
        message: oneDriveErrorMessage(error),
        testedAt: new Date(),
      });
    } finally {
      setOneDriveStorageLoading(false);
    }
  }
  async function applyPwaUpdate() {
    setUpdateAvailable(false);
    sessionStorage.removeItem("molde-cloud:update-ready");
    sessionStorage.setItem("molde-cloud:pwa-reload", "pending");
    setNotifications((current) => {
      const next = current.filter((item) => item.id !== "pwa-update-ready");
      localStorage.setItem(
        `molde-cloud:notifications:${profile.companyId}`,
        JSON.stringify(next),
      );
      return next;
    });

    const fallbackReload = window.setTimeout(
      () => window.location.reload(),
      1800,
    );
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update().catch(() => {});
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
        return;
      }
      window.clearTimeout(fallbackReload);
      window.location.reload();
    } catch {
      window.clearTimeout(fallbackReload);
      sessionStorage.removeItem("molde-cloud:pwa-reload");
      setUpdateAvailable(true);
      setMessage("Não foi possível atualizar agora. Tente novamente.");
    }
  }
  function toggleOneDriveMenu() {
    const next = !oneDriveMenuOpen;
    setOneDriveMenuOpen(next);
    setProfileOpen(false);
    setNotificationOpen(false);
    if (next && oneDriveAccount) void loadOneDriveStorage();
  }
  function toggleNotifications() {
    const nextOpen = !notificationOpen;
    setNotificationOpen(nextOpen);
    setOneDriveMenuOpen(false);
    setProfileOpen(false);
    if (nextOpen) {
      setNotifications((current) => {
        const next = current.map((item) => ({ ...item, read: true }));
        localStorage.setItem(
          `molde-cloud:notifications:${profile.companyId}`,
          JSON.stringify(next),
        );
        return next;
      });
    }
  }
  async function reconnectOneDrive() {
    setOneDriveMenuOpen(false);
    setBusy(true);
    setMessage("Reconectando sua conta do OneDrive...");
    try {
      await connectOneDrive(profile.companyId, "login");
    } catch (error) {
      recordError("reconnect_onedrive", error);
      setMessage(oneDriveErrorMessage(error));
      setBusy(false);
    }
  }
  async function savePhoto() {
    const folder = folders.find((item) => item.id === folderId);
    if (!folder || !photoFile || !fileName.trim()) return;
    if (!oneDriveAccount) {
      setMessage("Conecte o OneDrive antes de enviar a foto.");
      return;
    }
    setBusy(true);
    setUploadProgress(0);
    setMessage("Preparando o envio para o OneDrive...");
    let uploaded;
    try {
      uploaded = await uploadPhotoToOneDrive(
        folder.name,
        fileName,
        photoFile,
        setUploadProgress,
      );
    } catch (error) {
      recordError("upload_photo", error);
      setMessage(oneDriveErrorMessage(error));
      setBusy(false);
      setUploadProgress(null);
      return;
    }
    try {
      await registerPhoto(
        workspaceActor,
        folder,
        fileName,
        photoFile,
        uploaded,
      );
      setPhoto(null);
      setPhotoFile(null);
      setFileName("");
      if (inputRef.current) inputRef.current.value = "";
      setMessage("Foto enviada e registrada com sucesso no OneDrive.");
      navigateTo("files");
    } catch {
      setMessage(
        "A foto foi enviada ao OneDrive, mas o histórico não pôde ser salvo. Não envie novamente antes de conferir o OneDrive.",
      );
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  }
  async function signOutApp() {
    // Preserve the Microsoft cache so reopening Molde Cloud can restore the
    // company's verified OneDrive without asking for a new connection.
    await signOut(auth);
  }
  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  }
  function startDemo() {
    setDemoMode("commercial");
    setDemoStep(0);
    setDemoPaused(false);
    setDemoOpen(true);
    setProfileOpen(false);
    setNotificationOpen(false);
    setOneDriveMenuOpen(false);
    setCollapsed(true);
  }
  function changeDemoStep(next: number) {
    const steps = demoMode === "commercial" ? commercialSteps : demoSteps;
    if (next < 0) return;
    if (next >= steps.length) {
      setDemoOpen(false);
      setDemoPaused(false);
      return;
    }
    setDemoStep(next);
    if (demoMode === "guide") navigateTo(demoSteps[next].screen);
  }
  function showPresentationScreen(next: Screen) {
    setDemoOpen(false);
    setDemoPaused(true);
    navigateTo(next);
  }
  function navigateTo(next: Screen) {
    if (next !== screen) {
      window.history.pushState({ moldeCloudScreen: next }, "");
    }
    setScreen(next);
    setCollapsed(true);
    setProfileOpen(false);
  }
  if (
    (companyStatus === "blocked" || companyStatus === "deleted") &&
    profile.role !== "superadmin"
  )
    return (
      <AccessScreen
        title={
          companyStatus === "deleted"
            ? "Empresa removida"
            : "Empresa temporariamente bloqueada"
        }
        message="O administrador geral precisa reativar a empresa para liberar o acesso."
        user={user}
      />
    );
  return (
    <main
      className={`app-shell app-enter screen-${screen} ${collapsed ? "is-collapsed" : ""}`}
    >
      <button
        className="mobile-menu"
        onClick={() => setCollapsed(false)}
        aria-label="Abrir menu"
      >
        ☰
      </button>
      {!collapsed && (
        <button
          className="menu-overlay"
          onClick={() => setCollapsed(true)}
          aria-label="Fechar menu"
        />
      )}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">M</span>
          <span className="brand-copy">
            Molde Cloud<small>DIGIFLASH</small>
          </span>
        </div>
        <button
          className="collapse"
          onClick={() => setCollapsed(!collapsed)}
          aria-label="Recolher menu"
        >
          ‹
        </button>
        <nav>
          {nav.map((x) => (
            <button
              key={x.id}
              className={screen === x.id ? "active" : ""}
              onClick={() => navigateTo(x.id)}
            >
              <span className="nav-icon">
                <Icon name={x.icon} />
              </span>
              <span className="nav-label">{x.label}</span>
            </button>
          ))}
          {adminNav.length > 0 && (
            <div className={`admin-nav-group ${adminNavOpen ? "open" : ""}`}>
              <button
                className="admin-nav-toggle"
                onClick={() => setAdminNavOpen(!adminNavOpen)}
                aria-expanded={adminNavOpen}
              >
                <span className="nav-icon">
                  <Icon name="shield" />
                </span>
                <span className="nav-label">Administração</span>
                <b>⌄</b>
              </button>
              {adminNavOpen &&
                adminNav.map((x) => (
                  <button
                    key={x.id}
                    className={`admin-nav-item ${screen === x.id ? "active" : ""}`}
                    onClick={() => navigateTo(x.id)}
                  >
                    <span className="nav-icon">
                      <Icon name={x.icon} />
                    </span>
                    <span className="nav-label">{x.label}</span>
                  </button>
                ))}
            </div>
          )}
        </nav>
        {installPrompt && (
          <button className="install-button" onClick={() => void installApp()}>
            <span className="nav-icon">
              <Icon name="desktop" />
            </span>
            <span className="nav-label">Instalar aplicativo</span>
          </button>
        )}
        <button
          className={`onedrive-button ${oneDriveAccount ? "connected" : ""}`}
          disabled={busy || !online}
          onClick={() => void handleOneDrive()}
        >
          <span className="nav-icon">
            <Icon name="cloud" />
          </span>
          <span className="nav-label">
            {oneDriveAccount
              ? "Trocar conta OneDrive"
              : isOneDriveConfigured
                ? "Conectar OneDrive"
                : "Ativação pendente"}
          </span>
        </button>
      </aside>
      <section className="workspace">
        <header>
          <div>
            <p>DIGIFLASH</p>
            <h1>{visibleNav.find((x) => x.id === screen)?.label}</h1>
          </div>
          <div className="header-actions">
            <button
              type="button"
              className="notification-button"
              onClick={toggleNotifications}
              aria-label="Abrir notificações"
              aria-haspopup="menu"
              aria-expanded={notificationOpen}
            >
              <Icon name="bell" />
              {notifications.some((item) => !item.read) && <i />}
            </button>
            <button
              type="button"
              className={`status ${oneDriveAccount ? "ok" : ""}`}
              title={oneDriveAccount || undefined}
              onClick={toggleOneDriveMenu}
              aria-haspopup="menu"
              aria-expanded={oneDriveMenuOpen}
            >
              <i />
              {oneDriveAccount
                ? "OneDrive conectado"
                : isOneDriveConfigured
                  ? "OneDrive desconectado"
                  : "Ativação pendente"}
            </button>
            <button
              className="user-chip"
              onClick={() => {
                setOneDriveMenuOpen(false);
                setNotificationOpen(false);
                setProfileOpen(!profileOpen);
              }}
              title="Abrir perfil"
              aria-haspopup="menu"
              aria-expanded={profileOpen}
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt="" />
              ) : (
                <span>{user.displayName?.[0] || profile.name?.[0] || "U"}</span>
              )}
              <b>
                {user.displayName?.split(" ")[0] ||
                  profile.name?.split(" ")[0] ||
                  "Usuário"}
              </b>
            </button>
            {notificationOpen && (
              <>
                <button
                  className="notification-backdrop"
                  aria-label="Fechar notificações"
                  onClick={() => setNotificationOpen(false)}
                />
                <section className="notification-menu" role="menu">
                  <header>
                    <div>
                      <small>MOLDE CLOUD</small>
                      <strong>Notificações</strong>
                    </div>
                    {notifications.length > 0 && (
                      <button
                        onClick={() => {
                          setNotifications([]);
                          localStorage.removeItem(
                            `molde-cloud:notifications:${profile.companyId}`,
                          );
                        }}
                      >
                        Limpar
                      </button>
                    )}
                  </header>
                  {notifications.length ? (
                    notifications.map((item) => (
                      <article className={item.kind} key={item.id}>
                        <span>
                          {item.kind === "success"
                            ? "✓"
                            : item.kind === "danger"
                              ? "!"
                              : item.kind === "warning"
                                ? "!"
                                : "i"}
                        </span>
                        <div>
                          <strong>{item.title}</strong>
                          <p>{item.detail}</p>
                          <time>{formatDate(new Date(item.createdAt))}</time>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="empty">Nenhuma notificação no momento.</div>
                  )}
                </section>
              </>
            )}
            {oneDriveMenuOpen && (
              <>
                <button
                  className="onedrive-menu-backdrop"
                  aria-label="Fechar opções do OneDrive"
                  onClick={() => setOneDriveMenuOpen(false)}
                />
                <section className="onedrive-menu" role="menu">
                  <header>
                    <span className={oneDriveAccount ? "connected" : ""}>
                      <Icon name="cloud" />
                    </span>
                    <div>
                      <small>ONEDRIVE</small>
                      <strong>
                        {oneDriveAccount ? "Conta conectada" : "Desconectado"}
                      </strong>
                      <p>{oneDriveAccount || "Conecte a conta da empresa"}</p>
                    </div>
                  </header>
                  {oneDriveAccount && (
                    <div className="onedrive-storage">
                      <div>
                        <span>ARMAZENAMENTO</span>
                        <strong>
                          {oneDriveStorageLoading
                            ? "Consultando..."
                            : oneDriveStorage
                              ? `${formatBytes(oneDriveStorage.used)} de ${formatBytes(oneDriveStorage.total)}`
                              : "Não foi possível consultar"}
                        </strong>
                      </div>
                      {oneDriveStorage?.total ? (
                        <>
                          <div className="storage-track">
                            <i
                              style={{
                                width: `${Math.min(100, (oneDriveStorage.used / oneDriveStorage.total) * 100)}%`,
                              }}
                            />
                          </div>
                          <small>
                            {formatBytes(oneDriveStorage.remaining)} disponíveis
                          </small>
                        </>
                      ) : null}
                      {storageSamples.length > 1 && (
                        <div className="storage-history">
                          <span>ÚLTIMAS LEITURAS</span>
                          {storageSamples.slice(0, 3).map((sample) => (
                            <small key={sample.createdAt}>
                              {new Date(sample.createdAt).toLocaleDateString(
                                "pt-BR",
                              )}{" "}
                              · {formatBytes(sample.used)} usados
                            </small>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="onedrive-menu-actions">
                    {oneDriveAccount ? (
                      <>
                        <button
                          role="menuitem"
                          disabled={busy || !online}
                          onClick={() => {
                            setOneDriveMenuOpen(false);
                            void syncOneDrive();
                          }}
                        >
                          <Icon name="sync" />
                          <span>
                            <strong>Sincronizar agora</strong>
                            <small>Atualizar pastas e arquivos</small>
                          </span>
                        </button>
                        <button
                          role="menuitem"
                          disabled={busy || !online}
                          onClick={() => void reconnectOneDrive()}
                        >
                          <Icon name="restore" />
                          <span>
                            <strong>Reconectar</strong>
                            <small>Renovar a autorização desta conta</small>
                          </span>
                        </button>
                        <button
                          role="menuitem"
                          disabled={busy || !online}
                          onClick={() => {
                            setOneDriveMenuOpen(false);
                            void handleOneDrive();
                          }}
                        >
                          <Icon name="users" />
                          <span>
                            <strong>Trocar de conta</strong>
                            <small>Selecionar outro OneDrive</small>
                          </span>
                        </button>
                      </>
                    ) : (
                      <button
                        role="menuitem"
                        disabled={busy || !online}
                        onClick={() => {
                          setOneDriveMenuOpen(false);
                          void handleOneDrive();
                        }}
                      >
                        <Icon name="cloud" />
                        <span>
                          <strong>Conectar OneDrive</strong>
                          <small>Autorizar a conta da empresa</small>
                        </span>
                      </button>
                    )}
                  </div>
                </section>
              </>
            )}
            {profileOpen && (
              <>
                <button
                  className="profile-menu-backdrop"
                  aria-label="Fechar perfil"
                  onClick={() => setProfileOpen(false)}
                />
                <section className="profile-menu" role="menu">
                  <div className="profile-summary">
                    <div className="profile-avatar">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt="" />
                      ) : (
                        user.displayName?.[0] || profile.name?.[0] || "U"
                      )}
                    </div>
                    <div>
                      <strong>
                        {user.displayName || profile.name || "Usuário"}
                      </strong>
                      <span>{user.email}</span>
                      <small>{roleLabel(profile.role)}</small>
                    </div>
                  </div>
                  <div className="profile-company">
                    <small>EMPRESA</small>
                    <strong>{currentCompany?.name || profile.companyId}</strong>
                    <span>
                      {oneDriveAccount
                        ? `OneDrive conectado: ${oneDriveAccount}`
                        : currentCompany?.oneDriveAccount
                          ? `OneDrive oficial: ${currentCompany.oneDriveAccount}`
                          : "OneDrive ainda não conectado"}
                    </span>
                  </div>
                  <div className="profile-actions">
                    {managerAccess && (
                      <button role="menuitem" onClick={startDemo}>
                        <Icon name="desktop" />
                        <span>
                          <strong>Apresentação comercial</strong>
                          <small>Conheça os benefícios e veja o sistema</small>
                        </span>
                      </button>
                    )}
                    {(profile.role === "admin" ||
                      profile.role === "superadmin") && (
                      <button
                        role="menuitem"
                        onClick={() => navigateTo("users")}
                      >
                        <Icon name="users" />
                        <span>
                          <strong>Usuários</strong>
                          <small>Gerenciar acessos da empresa</small>
                        </span>
                      </button>
                    )}
                    {profile.role === "superadmin" && (
                      <button
                        role="menuitem"
                        onClick={() => navigateTo("companies")}
                      >
                        <Icon name="building" />
                        <span>
                          <strong>Empresas</strong>
                          <small>Abrir administração geral</small>
                        </span>
                      </button>
                    )}
                    <button
                      role="menuitem"
                      disabled={busy || !online}
                      onClick={() => {
                        setProfileOpen(false);
                        void handleOneDrive();
                      }}
                    >
                      <Icon name="cloud" />
                      <span>
                        <strong>
                          {oneDriveAccount
                            ? "Trocar OneDrive"
                            : "Conectar OneDrive"}
                        </strong>
                        <small>
                          {online
                            ? "Conta de arquivos da empresa"
                            : "Disponível quando a internet voltar"}
                        </small>
                      </span>
                    </button>
                    <button
                      className="profile-signout"
                      role="menuitem"
                      disabled={busy}
                      onClick={() => {
                        setProfileOpen(false);
                        void signOutApp();
                      }}
                    >
                      <span className="signout-icon">↪</span>
                      <span>
                        <strong>Sair da conta</strong>
                        <small>Encerrar esta sessão</small>
                      </span>
                    </button>
                  </div>
                </section>
              </>
            )}
          </div>
        </header>
        {!online && (
          <div className="offline-notice">
            Sem internet. Você pode consultar esta tela, mas o envio ficará
            disponível quando a conexão voltar.
          </div>
        )}
        {updateAvailable && (
          <div className="update-notice">
            <div>
              <strong>Nova versão disponível</strong>
              <small>Atualize sem perder sua sessão ou seus dados.</small>
            </div>
            <button className="primary" onClick={() => void applyPwaUpdate()}>
              <Icon name="sync" /> Atualizar agora
            </button>
          </div>
        )}
        {(notice || message) && (
          <div className="system-notice">{notice || message}</div>
        )}
        {screen === "dashboard" && (
          <Dashboard
            files={files}
            folders={folders}
            oneDriveConnected={Boolean(oneDriveAccount)}
            oneDriveStorage={oneDriveStorage}
            lastSynchronization={lastSynchronization}
            pendingErrors={
              managerAccess
                ? healthErrors.filter((item) => item.status !== "resolved")
                    .length
                : null
            }
            startDemo={managerAccess ? startDemo : undefined}
            go={navigateTo}
            openFile={setPreviewFile}
          />
        )}
        {screen === "capture" && (
          <Capture
            photo={photo}
            folderId={folderId}
            folders={folders}
            fileName={fileName}
            busy={busy}
            uploadProgress={uploadProgress}
            oneDriveConnected={Boolean(oneDriveAccount)}
            canCreateFolder={canCreateFolder}
            setFolderId={setFolderId}
            setFileName={setFileName}
            inputRef={inputRef}
            openFolder={() => setShowFolder(true)}
            connect={() => void handleOneDrive()}
            save={savePhoto}
          />
        )}
        {screen === "files" && (
          <>
            <div className="section-heading">
              <div className="files-summary">
                <p>
                  {folders.length} pasta(s) · {files.length} foto(s)
                  registrada(s)
                </p>
                <span className="last-sync">
                  <Icon name="sync" />
                  {lastSynchronization ? (
                    <>
                      Última sincronização:{" "}
                      <strong>
                        {formatDate(lastSynchronization.createdAt?.toDate())}
                      </strong>
                      {lastSynchronization.actorName && (
                        <> · {lastSynchronization.actorName}</>
                      )}
                    </>
                  ) : (
                    "Ainda não sincronizado"
                  )}
                </span>
              </div>
              <div className="heading-actions">
                <button
                  className="primary"
                  onClick={() => navigateTo("capture")}
                >
                  <Icon name="camera" /> Nova foto
                </button>
                {canCreateFolder && (
                  <button
                    className="outline"
                    onClick={() => setShowFolder(true)}
                  >
                    <Icon name="plus" /> Nova pasta
                  </button>
                )}
                <button
                  className="sync-button"
                  disabled={busy || !online || !oneDriveAccount}
                  onClick={() => void syncOneDrive()}
                >
                  <Icon name="sync" />
                  {busy ? "Sincronizando..." : "Sincronizar"}
                </button>
              </div>
            </div>
            {folders.length ? (
              <div className="folder-grid">
                {folders.map((folder) => (
                  <article
                    key={folder.id}
                    className={openFolderId === folder.id ? "is-open" : ""}
                    role="button"
                    tabIndex={0}
                    aria-expanded={openFolderId === folder.id}
                    onClick={() =>
                      setOpenFolderId((current) =>
                        current === folder.id ? null : folder.id,
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setOpenFolderId((current) =>
                          current === folder.id ? null : folder.id,
                        );
                      }
                    }}
                  >
                    <span>
                      <Icon name="folder" />
                    </span>
                    <div>
                      <strong>{folder.name}</strong>
                      <small>
                        {
                          files.filter((item) => item.folderId === folder.id)
                            .length
                        }{" "}
                        arquivo(s)
                      </small>
                    </div>
                    <div className="folder-actions">
                      {canRenameItems && (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            void editFolder(folder);
                          }}
                        >
                          <Icon name="edit" /> Editar
                        </button>
                      )}
                      {canDeleteItems && (
                        <button
                          className="danger"
                          onClick={(event) => {
                            event.stopPropagation();
                            void deleteFolder(folder);
                          }}
                        >
                          <Icon name="trash" /> Excluir
                        </button>
                      )}
                    </div>
                    <button
                      className="mobile-more-button"
                      aria-label={`Ações da pasta ${folder.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setMobileActions({ type: "folder", item: folder });
                      }}
                    >
                      <Icon name="more" />
                    </button>
                    {openFolderId === folder.id && (
                      <div className="folder-contents">
                        <small>ARQUIVOS NESTA PASTA</small>
                        {files.filter((item) => item.folderId === folder.id)
                          .length ? (
                          <ul>
                            {files
                              .filter((item) => item.folderId === folder.id)
                              .sort((a, b) =>
                                a.name.localeCompare(b.name, "pt-BR", {
                                  sensitivity: "base",
                                }),
                              )
                              .map((item) => (
                                <li key={item.id}>{item.name}</li>
                              ))}
                          </ul>
                        ) : (
                          <p>Esta pasta está vazia.</p>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <section className="panel">
                <EmptyState
                  icon="folder"
                  title="Nenhuma pasta criada"
                  detail="Crie uma pasta para organizar as fotografias antes do primeiro envio."
                  actionLabel={
                    canCreateFolder ? "Criar primeira pasta" : undefined
                  }
                  onAction={
                    canCreateFolder ? () => setShowFolder(true) : undefined
                  }
                />
              </section>
            )}
            {canViewTrash && deletedFolders.length > 0 && (
              <>
                <button
                  className={`files-disclosure trash ${folderTrashOpen ? "open" : ""}`}
                  onClick={() => setFolderTrashOpen(!folderTrashOpen)}
                >
                  <span>
                    <Icon name="trash" />
                  </span>
                  <div>
                    <strong>Lixeira de pastas</strong>
                    <small>
                      {deletedFolders.length} pasta(s) disponível(is) para
                      restauração
                    </small>
                  </div>
                  <b>⌄</b>
                </button>
                {folderTrashOpen && (
                  <section className="panel trash-files folder-trash-list">
                    {deletedFolders.map((folder) => (
                      <article key={folder.id}>
                        <div>
                          <strong>{folder.name}</strong>
                          <small>
                            Excluída por {folder.deletedByName || "usuário"} ·{" "}
                            {formatDate(folder.deletedAt?.toDate())}
                          </small>
                        </div>
                        {canDeleteItems && (
                          <button
                            className="outline"
                            disabled={busy}
                            onClick={() => void restoreDeletedFolder(folder)}
                          >
                            <Icon name="restore" /> Restaurar pasta
                          </button>
                        )}
                        {canDeleteItems && (
                          <button
                            className="danger-action"
                            disabled={busy}
                            onClick={() => void permanentlyDeleteFolder(folder)}
                          >
                            <Icon name="trash" /> Excluir definitivamente
                          </button>
                        )}
                      </article>
                    ))}
                  </section>
                )}
              </>
            )}
            <button
              className={`files-disclosure ${sentPhotosOpen ? "open" : ""}`}
              onClick={() => setSentPhotosOpen(!sentPhotosOpen)}
            >
              <span>
                <Icon name="image" />
              </span>
              <div>
                <strong>Fotos enviadas</strong>
                <small>{files.length} fotografia(s) no OneDrive</small>
              </div>
              <b>⌄</b>
            </button>
            {sentPhotosOpen && (
              <>
                <section className="organization-bar panel">
                  <label>
                    Filtrar por pasta
                    <select
                      value={fileFolderFilter}
                      onChange={(event) =>
                        setFileFolderFilter(event.target.value)
                      }
                    >
                      <option value="all">Todas as pastas</option>
                      {folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name} (
                          {
                            files.filter((item) => item.folderId === folder.id)
                              .length
                          }
                          )
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Ordenar
                    <select
                      value={fileSort}
                      onChange={(event) =>
                        setFileSort(
                          event.target.value as "newest" | "oldest" | "name",
                        )
                      }
                    >
                      <option value="newest">Mais recentes</option>
                      <option value="oldest">Mais antigos</option>
                      <option value="name">Nome de A a Z</option>
                    </select>
                  </label>
                  <div className="selection-actions">
                    <button className="outline" onClick={selectAllVisible}>
                      {organizedFiles.length > 0 &&
                      organizedFiles.every((item) => selectedFiles.has(item.id))
                        ? "Desmarcar visíveis"
                        : "Selecionar visíveis"}
                    </button>
                    {selectedFiles.size > 0 && (
                      <>
                        <strong>{selectedFiles.size} selecionada(s)</strong>
                        <button
                          className="outline"
                          disabled={busy}
                          onClick={() => void moveSelectedFiles()}
                        >
                          Mover selecionadas
                        </button>
                        {canDeleteItems && (
                          <button
                            className="danger-action"
                            disabled={busy}
                            onClick={() => void deleteSelectedFiles()}
                          >
                            Excluir selecionadas
                          </button>
                        )}
                        <button
                          className="clear-selection"
                          onClick={() => setSelectedFiles(new Set())}
                        >
                          Limpar
                        </button>
                      </>
                    )}
                  </div>
                </section>
                <section className="panel registered-files">
                  <div className="panel-title">
                    <div>
                      <small>ONEDRIVE</small>
                      <h3>{organizedFiles.length} foto(s) exibida(s)</h3>
                    </div>
                  </div>
                  {organizedFiles.length ? (
                    organizedFiles.map((item) => (
                      <FileRow
                        key={item.id}
                        item={item}
                        selected={selectedFiles.has(item.id)}
                        onSelect={() => toggleFileSelection(item.id)}
                        onOpen={() => setPreviewFile(item)}
                        actions={{
                          ...(canRenameItems
                            ? { rename: () => void renameFile(item) }
                            : {}),
                          move: () => void moveFile(item),
                          ...(canDeleteItems
                            ? { remove: () => void deleteFile(item) }
                            : {}),
                        }}
                        onMenu={() => setMobileActions({ type: "file", item })}
                      />
                    ))
                  ) : (
                    <EmptyState
                      icon="image"
                      title="Nenhuma foto encontrada"
                      detail="Altere o filtro escolhido ou envie uma nova fotografia."
                    />
                  )}
                </section>
              </>
            )}
            {canViewTrash && deletedFiles.length > 0 && (
              <>
                <button
                  className={`files-disclosure trash ${trashOpen ? "open" : ""}`}
                  onClick={() => setTrashOpen(!trashOpen)}
                >
                  <span>♻</span>
                  <div>
                    <strong>Lixeira</strong>
                    <small>
                      {deletedFiles.length} fotografia(s) excluída(s)
                    </small>
                  </div>
                  <b>⌄</b>
                </button>
                {trashOpen && (
                  <section className="panel trash-files">
                    {deletedFiles.map((item) => (
                      <article key={item.id}>
                        <div>
                          <strong>{item.name}</strong>
                          <small>
                            {item.folderName} · excluída por{" "}
                            {item.deletedByName || "usuário"}
                          </small>
                        </div>
                        {canDeleteItems && (
                          <button
                            className="outline"
                            disabled={busy}
                            onClick={() => void restoreDeletedFile(item)}
                          >
                            <Icon name="restore" /> Restaurar
                          </button>
                        )}
                        {canDeleteItems && (
                          <button
                            className="danger-action"
                            disabled={busy}
                            onClick={() => void permanentlyDeleteFile(item)}
                          >
                            <Icon name="trash" /> Excluir definitivamente
                          </button>
                        )}
                      </article>
                    ))}
                  </section>
                )}
              </>
            )}
          </>
        )}
        {screen === "history" && <HistoryList items={history} />}
        {screen === "search" && (
          <>
            <div className="search-box">
              <span>
                <Icon name="search" />
              </span>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar pasta ou arquivo..."
              />
            </div>
            <p className="result-count">{filtered.length} resultado(s)</p>
            <section className="panel">
              {filtered.length ? (
                filtered.map((x) => (
                  <FileRow
                    key={x.id}
                    item={x}
                    onOpen={() => setPreviewFile(x)}
                  />
                ))
              ) : (
                <EmptyState
                  icon="search"
                  title="Nenhum arquivo encontrado"
                  detail="Tente outro nome de pasta ou fotografia."
                />
              )}
            </section>
          </>
        )}
        {screen === "settings" && managerAccess && (
          <CompanySettings
            company={currentCompany}
            profile={profile}
            users={companyUsers}
            folderCount={folders.length}
            fileCount={files.length}
            oneDriveAccount={oneDriveAccount}
            storage={oneDriveStorage}
            storageLoading={oneDriveStorageLoading}
            lastSynchronization={lastSynchronization}
            connectionTest={connectionTest}
            busy={busy}
            online={online}
            onTest={() => void testOneDriveConnection()}
            onConnect={() => void reconnectOneDrive()}
          />
        )}
        {screen === "users" &&
          (profile.role === "admin" || profile.role === "superadmin") && (
            <UsersAdmin currentUid={user.uid} companyId={profile.companyId} />
          )}
        {screen === "report" &&
          (profile.role === "admin" || profile.role === "superadmin") && (
            <UsageReport items={history} />
          )}
        {screen === "errors" &&
          (profile.role === "admin" || profile.role === "superadmin") && (
            <ErrorPanel
              companyId={profile.companyId}
              currentUid={user.uid}
              superAdmin={profile.role === "superadmin"}
            />
          )}
        {screen === "companies" && profile.role === "superadmin" && (
          <>
            <GlobalApprovals currentUid={user.uid} />
            <CompaniesAdmin currentUid={user.uid} />
          </>
        )}
      </section>
      <input
        ref={inputRef}
        className="hidden-input"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => choosePhoto(e.target.files?.[0])}
      />
      {demoPaused && managerAccess && (
        <div className="commercial-resume" role="region" aria-label="Apresentação pausada">
          <span>Apresentação pausada · ações nesta tela são reais</span>
          <button className="outline" disabled={busy} onClick={() => { setDemoPaused(false); setDemoOpen(true); }}>Retomar apresentação</button>
          <button className="outline" onClick={() => setDemoPaused(false)}>Encerrar</button>
        </div>
      )}
      {demoOpen && managerAccess && demoMode === "commercial" && (
        <CommercialPresentation
          step={demoStep}
          onPrevious={() => changeDemoStep(demoStep - 1)}
          onNext={() => changeDemoStep(demoStep + 1)}
          onClose={() => { setDemoOpen(false); setDemoPaused(false); }}
          onScreen={showPresentationScreen}
          onGuide={() => { setDemoMode("guide"); setDemoStep(0); navigateTo("dashboard"); }}
        />
      )}
      {demoOpen && managerAccess && demoMode === "guide" && (
        <DemoTour
          step={demoStep}
          onPrevious={() => changeDemoStep(demoStep - 1)}
          onNext={() => changeDemoStep(demoStep + 1)}
          onClose={() => setDemoOpen(false)}
        />
      )}
      {screen !== "capture" && (
        <button
          className="quick-camera-button"
          onClick={() => navigateTo("capture")}
          aria-label="Tirar nova foto"
        >
          <Icon name="camera" />
          <span>Tirar foto</span>
        </button>
      )}
      {previewFile && (
        <div className="preview-backdrop" onClick={() => setPreviewFile(null)}>
          <section
            className="preview-modal"
            onClick={(event) => event.stopPropagation()}
            aria-modal="true"
            role="dialog"
            aria-label={`Visualização de ${previewFile.name}`}
          >
            <header>
              <div>
                <small>VISUALIZAÇÃO</small>
                <h2>{previewFile.name}</h2>
              </div>
              <button
                onClick={() => setPreviewFile(null)}
                aria-label="Fechar visualização"
              >
                ×
              </button>
            </header>
            <div className="preview-stage">
              {previewLoading ? (
                <div className="preview-loading">
                  <div className="auth-loader" />
                  <span>Carregando fotografia...</span>
                </div>
              ) : previewUrl ? (
                <img
                  src={previewUrl}
                  alt={previewFile.name}
                  style={{ transform: `scale(${previewZoom})` }}
                />
              ) : (
                <div className="empty">
                  Não foi possível carregar esta fotografia.
                </div>
              )}
            </div>
            <div className="preview-toolbar">
              <div className="zoom-controls">
                <button
                  disabled={previewZoom <= 0.5}
                  onClick={() =>
                    setPreviewZoom((value) => Math.max(0.5, value - 0.25))
                  }
                >
                  −
                </button>
                <strong>{Math.round(previewZoom * 100)}%</strong>
                <button
                  disabled={previewZoom >= 3}
                  onClick={() =>
                    setPreviewZoom((value) => Math.min(3, value + 0.25))
                  }
                >
                  ＋
                </button>
                <button onClick={() => setPreviewZoom(1)}>Ajustar</button>
              </div>
              {previewUrl && (
                <a
                  className="preview-download"
                  href={previewUrl}
                  download={previewFile.name}
                >
                  Baixar imagem
                </a>
              )}
            </div>
            <div className="preview-details">
              <div>
                <small>PASTA</small>
                <strong>{previewFile.folderName}</strong>
              </div>
              <div>
                <small>TAMANHO</small>
                <strong>{formatBytes(previewFile.size)}</strong>
              </div>
              <div>
                <small>DATA</small>
                <strong>
                  {formatDate(
                    previewFile.uploadedAt?.toDate() ??
                      previewFile.createdAt?.toDate(),
                  )}
                </strong>
              </div>
              <div>
                <small>RESPONSÁVEL</small>
                <strong>{previewFile.createdByName || "Não informado"}</strong>
              </div>
            </div>
            <footer>
              {canRenameItems && (
                <button onClick={() => void renameFile(previewFile)}>
                  <Icon name="edit" /> Renomear
                </button>
              )}
              <button onClick={() => void moveFile(previewFile)}>
                <Icon name="move" /> Mover
              </button>
              {canDeleteItems && (
                <button
                  className="danger"
                  onClick={() => {
                    const file = previewFile;
                    setPreviewFile(null);
                    void deleteFile(file);
                  }}
                >
                  <Icon name="trash" /> Excluir
                </button>
              )}
            </footer>
          </section>
        </div>
      )}
      {mobileActions && (
        <div
          className="action-sheet-backdrop"
          onClick={() => setMobileActions(null)}
        >
          <section
            className="action-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={`Ações de ${mobileActions.item.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="action-sheet-handle" />
            <header>
              <small>
                {mobileActions.type === "folder" ? "PASTA" : "FOTOGRAFIA"}
              </small>
              <strong>{mobileActions.item.name}</strong>
            </header>
            {mobileActions.type === "folder" ? (
              <>
                <button
                  onClick={() => {
                    setOpenFolderId(mobileActions.item.id);
                    setMobileActions(null);
                  }}
                >
                  <Icon name="folder" /> Abrir pasta
                </button>
                {canRenameItems && (
                  <button
                    onClick={() => {
                      const folder = mobileActions.item;
                      setMobileActions(null);
                      void editFolder(folder);
                    }}
                  >
                    <Icon name="edit" /> Renomear
                  </button>
                )}
                {canDeleteItems && (
                  <button
                    className="danger"
                    onClick={() => {
                      const folder = mobileActions.item;
                      setMobileActions(null);
                      void deleteFolder(folder);
                    }}
                  >
                    <Icon name="trash" /> Excluir
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setPreviewFile(mobileActions.item);
                    setMobileActions(null);
                  }}
                >
                  <Icon name="eye" /> Visualizar
                </button>
                {canRenameItems && (
                  <button
                    onClick={() => {
                      const file = mobileActions.item;
                      setMobileActions(null);
                      void renameFile(file);
                    }}
                  >
                    <Icon name="edit" /> Renomear
                  </button>
                )}
                <button
                  onClick={() => {
                    const file = mobileActions.item;
                    setMobileActions(null);
                    void moveFile(file);
                  }}
                >
                  <Icon name="move" /> Mover
                </button>
                {canDeleteItems && (
                  <button
                    className="danger"
                    onClick={() => {
                      const file = mobileActions.item;
                      setMobileActions(null);
                      void deleteFile(file);
                    }}
                  >
                    <Icon name="trash" /> Excluir
                  </button>
                )}
              </>
            )}
            <button
              className="action-sheet-cancel"
              onClick={() => setMobileActions(null)}
            >
              Cancelar
            </button>
          </section>
        </div>
      )}
      {showFolder && (
        <div className="modal-backdrop" onClick={() => setShowFolder(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setShowFolder(false)}
            >
              ×
            </button>
            <p>NOVA PASTA</p>
            <h2>Criar pasta no Molde Cloud</h2>
            <label>
              Nome da pasta
              <input
                autoFocus
                value={newFolder}
                onChange={(e) => setNewFolder(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addFolder();
                }}
                placeholder="Ex.: Moldes agosto"
              />
            </label>
            <button
              className="primary full"
              disabled={busy || !newFolder.trim()}
              onClick={() => void addFolder()}
            >
              {busy ? "Criando..." : "Criar pasta"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Dashboard({
  files,
  folders,
  oneDriveConnected,
  oneDriveStorage,
  lastSynchronization,
  pendingErrors,
  startDemo,
  go,
  openFile,
}: {
  files: FileRecord[];
  folders: FolderRecord[];
  oneDriveConnected: boolean;
  oneDriveStorage: OneDriveStorage | null;
  lastSynchronization?: HistoryRecord;
  pendingErrors: number | null;
  startDemo?: () => void;
  go: (s: Screen) => void;
  openFile: (file: FileRecord) => void;
}) {
  return (
    <div className="dashboard">
      <section className="welcome">
        <div>
          <span className="eyebrow">SEU FLUXO DE TRABALHO</span>
          <h2>
            Fotografe no celular.
            <br />
            <em>Acesse no computador.</em>
          </h2>
          <p>
            O Molde Cloud organiza a fotografia e envia o arquivo original para
            sua pasta no OneDrive.
          </p>
          <div className="welcome-actions">
            <button className="primary" onClick={() => go("capture")}>
              <Icon name="camera" /> Tirar nova foto
            </button>
            {startDemo && (
              <button className="outline demo-start-button" onClick={startDemo}>
                <Icon name="desktop" /> Iniciar apresentação
              </button>
            )}
          </div>
        </div>
        <div className="flow-art">
          <div>
            <Icon name="camera" />
            <small>CELULAR</small>
          </div>
          <span>•••</span>
          <div>
            <Icon name="cloud" />
            <small>ONEDRIVE</small>
          </div>
          <span>•••</span>
          <div>
            <Icon name="desktop" />
            <small>COMPUTADOR</small>
          </div>
        </div>
      </section>
      <div className="stats">
        <Stat
          icon="camera"
          tone="purple"
          label="FOTOS ENVIADAS"
          value={String(
            files.filter((item) => item.status === "uploaded").length,
          )}
          note="Arquivos no OneDrive"
        />
        <Stat
          icon="folder"
          tone="cyan"
          label="PASTAS"
          value={String(folders.length)}
          note="Organização do trabalho"
        />
        <Stat
          icon="cloud"
          tone={oneDriveConnected ? "green" : "amber"}
          label="ONEDRIVE"
          value={oneDriveConnected ? "Conectado" : "Desconectado"}
          note={
            oneDriveConnected ? "Pronto para enviar" : "Conecte para começar"
          }
        />
      </div>
      <SystemHealth
        oneDriveConnected={oneDriveConnected}
        storage={oneDriveStorage}
        lastSynchronization={lastSynchronization}
        pendingErrors={pendingErrors}
      />
      <div className="lower-grid">
        <section className="panel">
          <div className="panel-title">
            <div>
              <small>ATIVIDADE</small>
              <h3>Últimas fotos</h3>
            </div>
            <button onClick={() => go("history")}>Ver histórico →</button>
          </div>
          {files.length ? (
            files
              .slice(0, 3)
              .map((item) => (
                <FileRow
                  key={item.id}
                  item={item}
                  onOpen={() => openFile(item)}
                />
              ))
          ) : (
            <div className="empty">Nenhuma foto enviada.</div>
          )}
        </section>
        <section className="quick">
          <small>OUTROS ACESSOS</small>
          <h3>Continue seu trabalho</h3>
          {[
            ["folder", "Ver arquivos", "Acessar suas pastas", "files"],
            ["search", "Localizar", "Buscar foto ou pasta", "search"],
          ].map((x) => (
            <button key={x[1]} onClick={() => go(x[3] as Screen)}>
              <span>
                <Icon name={x[0]} />
              </span>
              <div>
                <strong>{x[1]}</strong>
                <small>{x[2]}</small>
              </div>
              <b>›</b>
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}
function SystemHealth({
  oneDriveConnected,
  storage,
  lastSynchronization,
  pendingErrors,
}: {
  oneDriveConnected: boolean;
  storage: OneDriveStorage | null;
  lastSynchronization?: HistoryRecord;
  pendingErrors: number | null;
}) {
  const storagePercent = storage?.total
    ? Math.round((storage.used / storage.total) * 100)
    : null;
  const requiresAttention =
    !oneDriveConnected ||
    (storagePercent !== null && storagePercent >= 90) ||
    (pendingErrors !== null && pendingErrors > 0);
  return (
    <details
      key={requiresAttention ? "attention" : "healthy"}
      className={`system-health panel ${requiresAttention ? "has-warning" : ""}`}
      open={requiresAttention || undefined}
    >
      <summary>
        <div className="health-summary-copy">
          <span>
            <Icon name={requiresAttention ? "alert" : "check"} />
          </span>
          <div>
            <small>SAÚDE DO SISTEMA</small>
            <strong>
              {requiresAttention ? "Existe algo para verificar" : "Tudo funcionando"}
            </strong>
          </div>
        </div>
        <span className={requiresAttention ? "warning" : "healthy"}>
          {requiresAttention ? "Requer atenção" : "Tudo certo"}
        </span>
        <b aria-hidden="true">⌄</b>
      </summary>
      <div className="health-grid">
        <HealthItem
          icon="cloud"
          label="OneDrive"
          value={oneDriveConnected ? "Conectado" : "Desconectado"}
          tone={oneDriveConnected ? "healthy" : "warning"}
        />
        <HealthItem
          icon="sync"
          label="Última sincronização"
          value={
            lastSynchronization
              ? formatDate(lastSynchronization.createdAt?.toDate())
              : "Ainda não realizada"
          }
          tone={lastSynchronization ? "healthy" : "neutral"}
        />
        <HealthItem
          icon="chart"
          label="Armazenamento"
          value={
            storagePercent === null
              ? "Aguardando consulta"
              : `${storagePercent}% usado`
          }
          tone={
            storagePercent !== null && storagePercent >= 90
              ? "warning"
              : "healthy"
          }
        />
        <HealthItem
          icon="alert"
          label="Erros pendentes"
          value={
            pendingErrors === null
              ? "Visível ao administrador"
              : String(pendingErrors)
          }
          tone={pendingErrors && pendingErrors > 0 ? "warning" : "healthy"}
        />
      </div>
    </details>
  );
}
function HealthItem({
  icon,
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <article className={tone}>
      <span>
        <Icon name={icon} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </article>
  );
}
function Stat({
  icon,
  tone,
  label,
  value,
  note,
}: {
  icon: string;
  tone: string;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article>
      <span className={`stat-icon ${tone}`}>
        <Icon name={icon} />
      </span>
      <div>
        <small>{label}</small>
        <strong className={value.length > 4 ? "status-word" : ""}>
          {value}
        </strong>
        <p>{note}</p>
      </div>
    </article>
  );
}
type CaptureProps = {
  photo: string | null;
  folderId: string;
  folders: FolderRecord[];
  fileName: string;
  busy: boolean;
  uploadProgress: number | null;
  oneDriveConnected: boolean;
  canCreateFolder: boolean;
  setFolderId: (value: string) => void;
  setFileName: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  openFolder: () => void;
  connect: () => void;
  save: () => Promise<void>;
};
function Capture(p: CaptureProps) {
  const [step, setStep] = useState<"photo" | "details" | "confirm">("photo");
  useEffect(() => {
    if (!p.photo) setStep("photo");
  }, [p.photo]);
  const stepNumber = step === "photo" ? 1 : step === "details" ? 2 : 3,
    folderName = p.folders.find((folder) => folder.id === p.folderId)?.name;
  return (
    <section className="capture-card">
      <div className="capture-steps">
        {["Foto", "Detalhes", "Enviar"].map((label, index) => (
          <div
            key={label}
            className={`capture-step ${index + 1 <= stepNumber ? "active" : ""}`}
          >
            <b>{index + 1}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      {!p.oneDriveConnected && (
        <div className="onedrive-callout">
          <div>
            <strong>Conecte o OneDrive para enviar fotografias</strong>
            <small>
              O arquivo será salvo na pasta “Molde Cloud DigiFlash”.
            </small>
          </div>
          <button className="outline" onClick={p.connect}>
            Conectar OneDrive
          </button>
        </div>
      )}
      {step === "photo" && (
        <>
          {p.photo ? (
            <div className="camera-area has-photo">
              <img src={p.photo} alt="Foto escolhida" />
            </div>
          ) : (
            <button
              className="camera-area"
              onClick={() => p.inputRef.current?.click()}
            >
              <span className="camera-icon">
                <Icon name="camera" />
              </span>
              <strong>Fotografar o quadro</strong>
              <small>
                Use a câmera traseira e mantenha o celular paralelo ao quadro.
              </small>
              <b>Abrir câmera</b>
            </button>
          )}
          <div className="capture-actions">
            {p.photo && (
              <>
                <button
                  className="outline"
                  onClick={() => p.inputRef.current?.click()}
                >
                  Refazer foto
                </button>
                <button className="primary" onClick={() => setStep("details")}>
                  Usar esta foto
                </button>
              </>
            )}
          </div>
        </>
      )}
      {step === "details" && (
        <>
          <div className="capture-thumbnail">
            <img src={p.photo || ""} alt="Foto escolhida" />
            <span>Foto pronta para organizar</span>
          </div>
          <div className="form-grid">
            <label>
              Pasta
              <select
                value={p.folderId}
                onChange={(e) => p.setFolderId(e.target.value)}
              >
                <option value="">Selecione uma pasta</option>
                {p.folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>
            {p.canCreateFolder && (
              <button className="outline" onClick={p.openFolder}>
                ＋ Criar pasta
              </button>
            )}
            <label>
              Nome do arquivo
              <input
                value={p.fileName}
                onChange={(e) => p.setFileName(e.target.value)}
                placeholder="Ex.: frente tamanho M"
              />
            </label>
          </div>
          <div className="capture-footer">
            <button className="outline" onClick={() => setStep("photo")}>
              Voltar
            </button>
            <button
              className="primary"
              disabled={!p.fileName.trim() || !p.folderId}
              onClick={() => setStep("confirm")}
            >
              Revisar envio
            </button>
          </div>
        </>
      )}
      {step === "confirm" && (
        <>
          <div className="capture-review">
            <img src={p.photo || ""} alt="Foto para envio" />
            <div>
              <small>PASTA</small>
              <strong>{folderName}</strong>
              <small>ARQUIVO</small>
              <strong>{p.fileName.trim()}</strong>
            </div>
          </div>
          {p.busy && (
            <div className="upload-progress" aria-live="polite">
              <div>
                <span>Enviando ao OneDrive</span>
                <b>{p.uploadProgress ?? 0}%</b>
              </div>
              <div
                className="upload-wave-track"
                role="progressbar"
                aria-label="Progresso do envio ao OneDrive"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={p.uploadProgress ?? 0}
              >
                <span
                  className="upload-wave-fill"
                  style={{
                    width: `${Math.max(
                      2,
                      Math.min(100, p.uploadProgress ?? 0),
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}
          <div className="capture-footer">
            <button
              className="outline"
              disabled={p.busy}
              onClick={() => setStep("details")}
            >
              Corrigir
            </button>
            <button
              className="primary"
              disabled={p.busy || !p.oneDriveConnected}
              onClick={() => void p.save()}
            >
              {p.busy
                ? `Enviando ${p.uploadProgress ?? 0}%`
                : "Enviar ao OneDrive"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
function DemoVisual({ step }: { step: number }) {
  if (step === 0)
    return (
      <div className="demo-visual demo-visual-flow" aria-label="Fluxo do celular para o computador">
        <div><Icon name="camera" /><small>CELULAR</small></div>
        <span>→</span>
        <div><Icon name="cloud" /><small>ONEDRIVE</small></div>
        <span>→</span>
        <div><Icon name="desktop" /><small>COMPUTADOR</small></div>
      </div>
    );
  if (step === 1)
    return (
      <div className="demo-visual demo-visual-folder" aria-label="Organização das fotografias em pastas">
        <div className="demo-folder-main"><Icon name="folder" /><strong>Projeto</strong></div>
        <div className="demo-folder-files">
          <span><Icon name="image" /> Frente</span>
          <span><Icon name="image" /> Costas</span>
          <span><Icon name="image" /> Detalhes</span>
        </div>
      </div>
    );
  if (step === 2)
    return (
      <div className="demo-visual demo-visual-camera" aria-label="Captura da fotografia pelo celular">
        <div className="demo-phone">
          <span className="demo-phone-camera"><Icon name="camera" /></span>
          <i /><i /><i /><i />
        </div>
        <div><strong>Fotografe</strong><small>Confira antes de enviar</small></div>
      </div>
    );
  if (step === 3)
    return (
      <div className="demo-visual demo-visual-upload" aria-label="Envio seguro ao OneDrive">
        <div className="demo-upload-file"><Icon name="image" /></div>
        <div className="demo-upload-route"><i /><i /><i /></div>
        <div className="demo-upload-cloud"><Icon name="cloud" /><strong>OneDrive</strong></div>
        <div className="demo-upload-progress"><span /><b>Enviando com segurança</b></div>
      </div>
    );
  return (
    <div className="demo-visual demo-visual-search" aria-label="Arquivo localizado no celular e no computador">
      <div className="demo-search-box"><Icon name="search" /><span>Molde camisa</span></div>
      <div className="demo-search-result"><Icon name="image" /><div><strong>Molde camisa</strong><small>Arquivo encontrado</small></div><b>✓</b></div>
      <Icon name="desktop" />
    </div>
  );
}


const commercialSteps: {
  chapter: string; title: string; detail: string;
  points: string[]; visual: number; screen: Screen; action: string;
}[] = [
  {
    chapter: "01 / O DESAFIO",
    title: "A foto está pronta. O trabalho ainda não.",
    detail: "Entre fotografar o molde e abrir a imagem no computador, arquivos podem se perder entre mensagens, transferências e pastas sem padrão.",
    points: ["Fotos dispersas no celular", "Transferências manuais a cada trabalho", "Tempo gasto procurando o arquivo certo"],
    visual: 1, screen: "files", action: "Ver organização de arquivos",
  },
  {
    chapter: "02 / A SOLUÇÃO",
    title: "Do quadro ao computador. Um fluxo organizado.",
    detail: "O Molde Cloud conecta a captura no celular à pasta da empresa no OneDrive. A imagem chega ao lugar onde o trabalho continua.",
    points: ["Pasta e nome definidos antes do envio", "Fotografia original no OneDrive", "Acesso no PC com o OneDrive configurado"],
    visual: 0, screen: "dashboard", action: "Conhecer a tela inicial",
  },
  {
    chapter: "03 / O PRODUTO",
    title: "Fotografe. Confira. Envie.",
    detail: "Uma sequência guiada para escolher a imagem, organizar o arquivo e acompanhar o envio — sem depender de conversas para transportar as fotos.",
    points: ["Conferência antes de enviar", "Progresso visível durante o envio", "Pesquisa e visualização dos arquivos"],
    visual: 2, screen: "capture", action: "Ver a captura real",
  },
  {
    chapter: "04 / A EMPRESA",
    title: "Organização também é controle.",
    detail: "A empresa reúne sua equipe, seus registros e sua conta oficial do OneDrive em um ambiente de trabalho próprio.",
    points: ["Aprovação e permissões de usuários", "Histórico de atividades", "Configurações e teste da conexão"],
    visual: 3, screen: "settings", action: "Ver configurações reais",
  },
  {
    chapter: "05 / EXPERIÊNCIA REAL",
    title: "Um piloto dentro da rotina.",
    detail: "O sistema já está em uso individual em uma empresa. O retorno inicial relatado é positivo, com acompanhamento contínuo da operação.",
    points: ["Uso real, não apenas uma ideia", "Ajustes a partir da experiência no celular", "Ainda sem métricas de economia de tempo"],
    visual: 4, screen: "history", action: "Ver histórico real",
  },
  {
    chapter: "06 / NA PRÁTICA",
    title: "Veja o arquivo chegar ao computador.",
    detail: "A demonstração final acompanha um trabalho completo: escolher a pasta, fotografar, enviar e abrir a imagem no computador.",
    points: ["Internet e OneDrive conectados", "Uma fotografia autorizada para demonstrar", "A mesma conta sincronizada no computador"],
    visual: 0, screen: "capture", action: "Começar demonstração ao vivo",
  },
];

function CommercialPresentation({ step, onPrevious, onNext, onClose, onScreen, onGuide }: {
  step: number; onPrevious: () => void; onNext: () => void;
  onClose: () => void; onScreen: (screen: Screen) => void; onGuide: () => void;
}) {
  const current = commercialSteps[step];
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <section ref={panelRef} className="commercial-deck" role="dialog" aria-modal="true"
      aria-label="Apresentação comercial do Molde Cloud"
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); onClose(); }
        if (event.key === "ArrowRight") { event.preventDefault(); onNext(); }
        if (event.key === "ArrowLeft") { event.preventDefault(); onPrevious(); }
        if (event.key === "Tab") {
          const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || []);
          const first = buttons[0], last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <header className="commercial-header">
        <div><strong>MOLDE CLOUD</strong><span>Do celular ao computador</span></div>
        <div className="commercial-header-actions">
          <button className="outline" onClick={onGuide}>Como usar</button>
          <button ref={closeRef} className="outline" onClick={onClose} aria-label="Fechar apresentação">Fechar ×</button>
        </div>
      </header>
      <div className="commercial-body" key={step}>
        <div className="commercial-copy">
          <small>{current.chapter}</small>
          <h2>{current.title}</h2>
          <p>{current.detail}</p>
          <ul>{current.points.map(point => <li key={point}>{point}</li>)}</ul>
          <button className="primary" onClick={() => onScreen(current.screen)}>{current.action} →</button>
          <span className="commercial-live-note">Abre o sistema real. Dados da empresa poderão aparecer; ações não são simuladas.</span>
        </div>
        <div className="commercial-media">
          {step === 3 ? (
            <div className="commercial-control" role="img" aria-label="Controle da empresa: equipe, histórico e OneDrive">
              <Icon name="shield" /><strong>Sua empresa no controle</strong>
              <div><span><Icon name="users" />Equipe</span><span><Icon name="clock" />Histórico</span><span><Icon name="cloud" />OneDrive</span></div>
            </div>
          ) : <DemoVisual step={current.visual} />}
          <p>{step === 4 ? "Experiência inicial relatada pelo responsável pelo piloto." : "Ilustração do fluxo · explore a tela real pelo botão ao lado."}</p>
        </div>
      </div>
      <footer className="commercial-footer">
        <button className="outline" disabled={step === 0} onClick={onPrevious}>← Voltar</button>
        <div className="commercial-page" aria-live="polite"><strong>{step + 1} / {commercialSteps.length}</strong><span>{current.chapter.split(" / ")[1]}</span></div>
        <button className="primary" onClick={onNext}>{step === commercialSteps.length - 1 ? "Concluir" : "Próximo →"}</button>
      </footer>
    </section>
  );
}

function DemoTour({
  step,
  onPrevious,
  onNext,
  onClose,
}: {
  step: number;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const current = demoSteps[step];
  const last = step === demoSteps.length - 1;
  return (
    <div className="demo-tour-backdrop" role="presentation">
      <section className="demo-tour" role="dialog" aria-modal="true" aria-label="Como usar o Molde Cloud">
        <header>
          <div className="demo-tour-icon"><Icon name={current.icon} /></div>
          <div><small>{current.eyebrow}</small><strong>Como usar</strong></div>
          <button className="demo-tour-close" onClick={onClose} aria-label="Encerrar demonstração">×</button>
        </header>
        <div className="demo-tour-progress" aria-label={`Etapa ${step + 1} de ${demoSteps.length}`}>
          {demoSteps.map((item, index) => <i key={item.title} className={index <= step ? "active" : ""} />)}
        </div>
        <DemoVisual step={step} />
        <div className="demo-tour-copy">
          <span>Etapa {step + 1} de {demoSteps.length}</span>
          <h2>{current.title}</h2>
          <p>{current.detail}</p>
          <em>Este guia não cria, altera nem envia nenhum arquivo.</em>
        </div>
        <footer>
          <button className="outline" disabled={step === 0} onClick={onPrevious}>Voltar</button>
          <button className="primary" onClick={onNext}>{last ? "Concluir apresentação" : "Próxima etapa"}</button>
        </footer>
      </section>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  detail,
  actionLabel,
  onAction,
}: {
  icon: string;
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <span>
        <Icon name={icon} />
      </span>
      <strong>{title}</strong>
      <p>{detail}</p>
      {actionLabel && onAction && (
        <button className="outline" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
function CompanySettings({
  company,
  profile,
  users,
  folderCount,
  fileCount,
  oneDriveAccount,
  storage,
  storageLoading,
  lastSynchronization,
  connectionTest,
  busy,
  online,
  onTest,
  onConnect,
}: {
  company: CompanyRecord | null;
  profile: UserProfile;
  users: UserProfile[];
  folderCount: number;
  fileCount: number;
  oneDriveAccount: string;
  storage: OneDriveStorage | null;
  storageLoading: boolean;
  lastSynchronization?: HistoryRecord;
  connectionTest: ConnectionTestState;
  busy: boolean;
  online: boolean;
  onTest: () => void;
  onConnect: () => void;
}) {
  const storagePercentage =
    storage?.total ? Math.min(100, (storage.used / storage.total) * 100) : 0;
  const officialAccount = company?.oneDriveAccount || "Ainda não definida";
  const connected = Boolean(oneDriveAccount);
  return (
    <section className="company-settings">
      <div className="settings-intro">
        <div className="settings-company-mark">
          <Icon name="building" />
        </div>
        <div>
          <small>CONFIGURAÇÕES DA EMPRESA</small>
          <h2>{company?.name || "Empresa"}</h2>
          <p>Visão geral da operação e da conexão usada pelo Molde Cloud.</p>
        </div>
        <span className={`settings-status ${company?.status === "active" ? "active" : ""}`}>
          {company?.status === "active" ? "Empresa ativa" : "Atenção necessária"}
        </span>
      </div>

      <div className="settings-metrics">
        <article><Icon name="users" /><div><strong>{users.length}</strong><span>Usuários</span></div></article>
        <article><Icon name="folder" /><div><strong>{folderCount}</strong><span>Pastas</span></div></article>
        <article><Icon name="image" /><div><strong>{fileCount}</strong><span>Fotografias</span></div></article>
        <article><Icon name="cloud" /><div><strong>{storage ? `${storagePercentage.toFixed(0)}%` : "—"}</strong><span>OneDrive usado</span></div></article>
      </div>

      <div className="settings-grid">
        <section className="panel settings-connection">
          <div className="settings-section-title">
            <div>
              <small>ONEDRIVE OFICIAL</small>
              <h3>Conexão da empresa</h3>
            </div>
            <span className={connected ? "connected" : "disconnected"}>
              <i />{connected ? "Conectado" : "Desconectado"}
            </span>
          </div>
          <dl>
            <div><dt>Conta oficial</dt><dd>{officialAccount}</dd></div>
            <div><dt>Sessão conectada</dt><dd>{oneDriveAccount || "Nenhuma conta conectada"}</dd></div>
            <div><dt>Armazenamento</dt><dd>{storage ? `${formatBytes(storage.used)} de ${formatBytes(storage.total)}` : storageLoading ? "Consultando..." : "Teste a conexão para consultar"}</dd></div>
            <div><dt>Última sincronização</dt><dd>{lastSynchronization ? formatDate(lastSynchronization.createdAt?.toDate()) : "Ainda não realizada"}</dd></div>
          </dl>
          {storage && (
            <div className="settings-storage" aria-label={`${storagePercentage.toFixed(0)}% do armazenamento utilizado`}>
              <span style={{ width: `${storagePercentage}%` }} />
            </div>
          )}
          <div className={`connection-result ${connectionTest.status}`} aria-live="polite">
            <Icon name={connectionTest.status === "success" ? "shield" : connectionTest.status === "error" ? "alert" : "sync"} />
            <div>
              <strong>{connectionTest.status === "testing" ? "Testando conexão" : connectionTest.status === "success" ? "Conexão saudável" : connectionTest.status === "error" ? "Não foi possível confirmar" : "Verificação recomendada"}</strong>
              <span>{connectionTest.message}{connectionTest.testedAt ? ` · ${formatDate(connectionTest.testedAt)}` : ""}</span>
            </div>
          </div>
          <div className="settings-actions">
            <button className="primary" disabled={busy || storageLoading || !online} onClick={onTest}>
              <Icon name="sync" /> {storageLoading ? "Testando..." : "Testar conexão"}
            </button>
            <button className="outline" disabled={busy || !online} onClick={onConnect}>
              <Icon name="cloud" /> {connected ? "Trocar OneDrive" : "Conectar OneDrive"}
            </button>
          </div>
        </section>

        <section className="panel settings-details">
          <div className="settings-section-title">
            <div><small>CADASTRO</small><h3>Dados da empresa</h3></div>
          </div>
          <dl>
            <div><dt>Administrador</dt><dd>{company?.adminEmail || profile.email}</dd></div>
            <div><dt>Sua permissão</dt><dd>{profile.role === "superadmin" ? "Administrador geral" : "Administrador da empresa"}</dd></div>
            <div><dt>Criada em</dt><dd>{company?.createdAt ? formatDate(company.createdAt.toDate()) : "Data não disponível"}</dd></div>
            <div><dt>Identificador</dt><dd className="settings-company-id">{company?.id || profile.companyId}</dd></div>
          </dl>
          <p className="settings-note">A troca do OneDrive altera a conta oficial usada por toda a empresa. Faça essa ação somente quando necessário.</p>
        </section>
      </div>
    </section>
  );
}

function HistoryList({ items }: { items: HistoryRecord[] }) {
  return (
    <section className="panel list-panel">
      <div className="panel-title">
        <div>
          <small>ATIVIDADE</small>
          <h3>Histórico real</h3>
        </div>
      </div>
      {items.length ? (
        items.map((item) => (
          <div className="history-row" key={item.id}>
            <span className="file-icon">
              <Icon
                name={
                  item.action === "photo_registered" ||
                  item.action === "photo_uploaded"
                    ? "image"
                    : "folder"
                }
              />
            </span>
            <div>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </div>
            <time>{formatDate(item.createdAt?.toDate())}</time>
          </div>
        ))
      ) : (
        <EmptyState
          icon="clock"
          title="Nenhuma atividade registrada"
          detail="As ações da equipe aparecerão aqui automaticamente."
        />
      )}
    </section>
  );
}
function FileRow({
  item,
  selected,
  onSelect,
  onOpen,
  actions,
  onMenu,
}: {
  item: FileRecord;
  selected?: boolean;
  onSelect?: () => void;
  onOpen?: () => void;
  actions?: { rename?: () => void; move?: () => void; remove?: () => void };
  onMenu?: () => void;
}) {
  return (
    <div className={`file-row ${selected ? "is-selected" : ""}`}>
      {onSelect && (
        <label className="file-select" title="Selecionar arquivo">
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={onSelect}
          />
          <span />
        </label>
      )}
      <span className="file-icon">
        <Icon name="image" />
      </span>
      <div>
        <strong>{item.name}</strong>
        <small>{item.folderName}</small>
      </div>
      <span>{formatBytes(item.size)}</span>
      <time>
        {formatDate(item.uploadedAt?.toDate() ?? item.createdAt?.toDate())}
      </time>
      <b
        className={
          item.status === "uploaded" ? "uploaded-mark" : "pending-mark"
        }
        title={
          item.status === "uploaded"
            ? "Enviado ao OneDrive"
            : "Aguardando OneDrive"
        }
      >
        {item.status === "uploaded" ? "✓" : "…"}
      </b>
      {onOpen && (
        <button className="file-open" onClick={onOpen}>
          <Icon name="eye" /> Visualizar
        </button>
      )}
      {actions && (actions.rename || actions.move || actions.remove) && (
        <div className="file-actions">
          {actions.rename && (
            <button onClick={actions.rename}>
              <Icon name="edit" /> Renomear
            </button>
          )}
          {actions.move && (
            <button onClick={actions.move}>
              <Icon name="move" /> Mover
            </button>
          )}
          {actions.remove && (
            <button className="danger" onClick={actions.remove}>
              <Icon name="trash" /> Excluir
            </button>
          )}
        </div>
      )}
      {onMenu && (
        <button
          className="mobile-more-button file-more-button"
          aria-label={`Ações de ${item.name}`}
          onClick={onMenu}
        >
          <Icon name="more" />
        </button>
      )}
    </div>
  );
}
function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 MB";
  const gigabytes = value / 1024 ** 3;
  if (gigabytes >= 1)
    return `${gigabytes.toLocaleString("pt-BR", { maximumFractionDigits: gigabytes >= 100 ? 0 : 1 })} GB`;
  return `${(value / 1024 ** 2).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}
function readLocalList<T>(key: string): T[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}
function formatDate(value?: Date) {
  return value
    ? value.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "Agora";
}
function UsageReport({ items }: { items: HistoryRecord[] }) {
  const [period, setPeriod] = useState<"7" | "30" | "all">("30");
  const cutoff =
    period === "all" ? 0 : Date.now() - Number(period) * 24 * 60 * 60 * 1000;
  const selected = items.filter(
    (item) => (item.createdAt?.toMillis() ?? 0) >= cutoff,
  );
  const uploads = selected.filter(
      (item) => item.action === "photo_uploaded",
    ).length,
    foldersCreated = selected.filter(
      (item) => item.action === "folder_created",
    ).length,
    synchronizations = selected.filter(
      (item) => item.action === "workspace_synced",
    ).length;
  const actors = [
    ...new Set(selected.map((item) => item.actorName || "Usuário")),
  ]
    .map((name) => {
      const own = selected.filter(
        (item) => (item.actorName || "Usuário") === name,
      );
      return {
        name,
        uploads: own.filter((item) => item.action === "photo_uploaded").length,
        folders: own.filter((item) => item.action === "folder_created").length,
        syncs: own.filter((item) => item.action === "workspace_synced").length,
        total: own.length,
      };
    })
    .sort((a, b) => b.total - a.total);
  return (
    <section className="usage-report">
      <div className="report-toolbar">
        <div>
          <small>PROJETO PILOTO</small>
          <h2>Uso do sistema</h2>
          <p>Acompanhamento leve baseado nas atividades já registradas.</p>
        </div>
        <label>
          Período
          <select
            value={period}
            onChange={(event) =>
              setPeriod(event.target.value as "7" | "30" | "all")
            }
          >
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="all">Todo o período</option>
          </select>
        </label>
      </div>
      <div className="report-summary stats">
        <Stat
          icon="camera"
          tone="purple"
          label="FOTOS ENVIADAS"
          value={String(uploads)}
          note="Arquivos enviados no período"
        />
        <Stat
          icon="folder"
          tone="cyan"
          label="PASTAS CRIADAS"
          value={String(foldersCreated)}
          note="Novas organizações"
        />
        <Stat
          icon="sync"
          tone="green"
          label="SINCRONIZAÇÕES"
          value={String(synchronizations)}
          note="Conferências com o OneDrive"
        />
        <Stat
          icon="users"
          tone="amber"
          label="USUÁRIOS ATIVOS"
          value={String(actors.length)}
          note={`${selected.length} atividade(s) registrada(s)`}
        />
      </div>
      <section className="panel report-users">
        <div className="panel-title">
          <div>
            <small>EQUIPE</small>
            <h3>Atividade por usuário</h3>
          </div>
        </div>
        {actors.length ? (
          <>
            <div className="report-users-heading">
              <span>Usuário</span>
              <span>Fotos</span>
              <span>Pastas</span>
              <span>Sincronizações</span>
              <span>Total</span>
            </div>
            {actors.map((actor) => (
              <article key={actor.name}>
                <div className="report-user-name">
                  <span>{actor.name.charAt(0).toUpperCase()}</span>
                  <strong>{actor.name}</strong>
                </div>
                <b data-label="Fotos">{actor.uploads}</b>
                <b data-label="Pastas">{actor.folders}</b>
                <b data-label="Sincronizações">{actor.syncs}</b>
                <strong data-label="Total">{actor.total}</strong>
              </article>
            ))}
          </>
        ) : (
          <EmptyState
            icon="chart"
            title="Ainda não há atividade neste período"
            detail="Quando a equipe enviar fotos ou sincronizar o OneDrive, os números aparecerão aqui."
          />
        )}
      </section>
      <div className="report-note">
        <Icon name="shield" />
        <span>
          <strong>Relatório leve</strong>
          <small>
            Nenhuma foto é copiada. Os números usam somente o histórico de
            operações do Molde Cloud.
          </small>
        </span>
      </div>
    </section>
  );
}

function ErrorPanel({
  companyId,
  currentUid,
  superAdmin,
}: {
  companyId: string;
  currentUid: string;
  superAdmin: boolean;
}) {
  const dialog = useDialog();
  const [items, setItems] = useState<ErrorLogRecord[]>([]),
    [query, setQuery] = useState(""),
    [statusFilter, setStatusFilter] = useState("all"),
    [operationFilter, setOperationFilter] = useState("all"),
    [periodFilter, setPeriodFilter] = useState("7"),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState("");
  useEffect(
    () =>
      watchErrorLogs(
        superAdmin ? null : companyId,
        (records) => {
          setItems(records);
          setLoading(false);
        },
        (error) => {
          setMessage(error);
          setLoading(false);
        },
      ),
    [companyId, superAdmin],
  );
  const now = Date.now(),
    sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const recentItems = items.filter(
    (item) => (item.createdAt?.toMillis() ?? now) >= sevenDaysAgo,
  );
  const occurrenceCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of recentItems) {
      const key = `${item.operation}:${item.code}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [recentItems]);
  const operations = [...new Set(items.map((item) => item.operation))].sort();
  const filteredItems = items.filter((item) => {
    const created = item.createdAt?.toMillis() ?? now;
    const periodStart =
      periodFilter === "today"
        ? new Date().setHours(0, 0, 0, 0)
        : periodFilter === "7"
          ? sevenDaysAgo
          : 0;
    const resolved = item.status === "resolved";
    const recurrent =
      !resolved &&
      (occurrenceCounts.get(`${item.operation}:${item.code}`) ?? 0) > 1;
    const calculatedStatus = resolved
      ? "resolved"
      : recurrent
        ? "recurrent"
        : "pending";
    return (
      created >= periodStart &&
      (statusFilter === "all" || statusFilter === calculatedStatus) &&
      (operationFilter === "all" || item.operation === operationFilter) &&
      `${operationLabel(item.operation)} ${item.code} ${item.actorName} ${item.companyId}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  });
  async function showDetails(item: ErrorLogRecord) {
    const resolved = item.status === "resolved";
    const shouldResolve = await dialog.confirm({
      title: operationLabel(item.operation),
      message: [
        `Código: ${item.code}`,
        `Empresa: ${item.companyId}`,
        `Usuário: ${item.actorName || "Não identificado"}`,
        `Registrado: ${formatDate(item.createdAt?.toDate())}`,
        resolved
          ? `Resolvido: ${formatDate(item.resolvedAt?.toDate())}`
          : "Nenhuma foto ou conteúdo foi armazenado.",
      ].join("\n"),
      confirmText: resolved ? "Fechar" : "Marcar como resolvido",
      cancelText: resolved ? "Voltar" : "Cancelar",
    });
    if (!shouldResolve || resolved) return;
    try {
      await resolveErrorLog(item.id, currentUid);
      setMessage("Registro marcado como resolvido.");
    } catch {
      setMessage("Não foi possível atualizar este registro.");
    }
  }
  return (
    <section className="error-panel-page">
      {message && <div className="system-notice">{message}</div>}
      <div className="error-summary-grid">
        <article className="pending">
          <span>
            <Icon name="alert" />
          </span>
          <div>
            <small>ERROS HOJE</small>
            <strong>
              {
                items.filter(
                  (item) =>
                    (item.createdAt?.toDate().toDateString() ?? "") ===
                    new Date().toDateString(),
                ).length
              }
            </strong>
          </div>
        </article>
        <article className="recurrent">
          <span>
            <Icon name="clock" />
          </span>
          <div>
            <small>ÚLTIMOS 7 DIAS</small>
            <strong>{recentItems.length}</strong>
          </div>
        </article>
        <article className="resolved">
          <span>✓</span>
          <div>
            <small>RESOLVIDOS</small>
            <strong>
              {items.filter((item) => item.status === "resolved").length}
            </strong>
          </div>
        </article>
      </div>
      <section className="panel error-records">
        <div className="error-records-heading">
          <div>
            <small>ADMINISTRAÇÃO</small>
            <h2>Registros técnicos</h2>
          </div>
          <button
            className="outline"
            onClick={() => setMessage("Painel atualizado em tempo real.")}
          >
            <Icon name="sync" /> Atualizar
          </button>
        </div>
        <div className="error-filters">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filtrar por situação"
          >
            <option value="all">Todos os status</option>
            <option value="pending">Pendentes</option>
            <option value="recurrent">Recorrentes</option>
            <option value="resolved">Resolvidos</option>
          </select>
          <select
            value={operationFilter}
            onChange={(event) => setOperationFilter(event.target.value)}
            aria-label="Filtrar por operação"
          >
            <option value="all">Todas as operações</option>
            {operations.map((operation) => (
              <option key={operation} value={operation}>
                {operationLabel(operation)}
              </option>
            ))}
          </select>
          <select
            value={periodFilter}
            onChange={(event) => setPeriodFilter(event.target.value)}
            aria-label="Filtrar por período"
          >
            <option value="today">Hoje</option>
            <option value="7">Últimos 7 dias</option>
            <option value="all">Todo o período</option>
          </select>
          <label className="error-search">
            <Icon name="search" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Pesquisar..."
            />
          </label>
        </div>
        <div className="error-table-heading">
          <span>Status</span>
          <span>Operação</span>
          <span>Código</span>
          <span>Empresa</span>
          <span>Usuário</span>
          <span>Data / hora</span>
          <span>Ação</span>
        </div>
        {loading ? (
          <div className="empty">Carregando registros...</div>
        ) : filteredItems.length ? (
          filteredItems.map((item) => {
            const resolved = item.status === "resolved";
            const recurrent =
              !resolved &&
              (occurrenceCounts.get(`${item.operation}:${item.code}`) ?? 0) > 1;
            const status = resolved
              ? "resolved"
              : recurrent
                ? "recurrent"
                : "pending";
            return (
              <article className="error-row" key={item.id}>
                <span className={`error-status ${status}`}>
                  {status === "resolved"
                    ? "Resolvido"
                    : status === "recurrent"
                      ? "Recorrente"
                      : "Pendente"}
                </span>
                <strong data-label="Operação">
                  {operationLabel(item.operation)}
                </strong>
                <code data-label="Código">{item.code}</code>
                <span data-label="Empresa">{item.companyId}</span>
                <span data-label="Usuário">{item.actorName || "Usuário"}</span>
                <time data-label="Data / hora">
                  {formatDate(item.createdAt?.toDate())}
                </time>
                <button
                  className="outline"
                  onClick={() => void showDetails(item)}
                >
                  Ver detalhes
                </button>
              </article>
            );
          })
        ) : (
          <div className="empty">Nenhum registro encontrado.</div>
        )}
        <footer className="error-privacy">
          <span>i</span> Somente informações técnicas. Fotos e conteúdos não são
          armazenados.
        </footer>
      </section>
    </section>
  );
}
function operationLabel(operation: string) {
  const labels: Record<string, string> = {
    synchronize_onedrive: "Sincronização do OneDrive",
    connect_onedrive: "Conexão do OneDrive",
    reconnect_onedrive: "Reconexão do OneDrive",
    read_onedrive_storage: "Consulta de armazenamento",
    upload_photo: "Envio de fotografia",
    create_folder: "Criação de pasta",
    rename_folder: "Renomeação de pasta",
    delete_folder: "Exclusão de pasta",
    rename_file: "Renomeação de arquivo",
    move_file: "Movimentação de arquivo",
    delete_file: "Exclusão de arquivo",
    restore_file: "Restauração de arquivo",
    permanent_delete_file: "Exclusão definitiva",
    bulk_move_files: "Movimentação em lote",
    bulk_delete_files: "Exclusão em lote",
  };
  return labels[operation] ?? operation.replaceAll("_", " ");
}
function UsersAdmin({
  currentUid,
  companyId,
}: {
  currentUid: string;
  companyId: string;
}) {
  const dialog = useDialog();
  const [users, setUsers] = useState<UserProfile[]>([]),
    [invitations, setInvitations] = useState<EmployeeInvitation[]>([]),
    [email, setEmail] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [permissionUserId, setPermissionUserId] = useState<string | null>(null);
  const defaultPermissions: UserPermissions = {
    createFolder: true,
    renameItems: true,
    deleteItems: true,
    viewTrash: true,
  };
  useEffect(() => {
    const stopUsers = watchAllUsers(companyId, setUsers),
      stopInvites = watchEmployeeInvites(companyId, setInvitations);
    return () => {
      stopUsers();
      stopInvites();
    };
  }, [companyId]);
  async function submitInvite(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await inviteEmployee(companyId, email, currentUid);
      setEmail("");
      setMessage(
        "Convite criado. Use o botão Enviar e-mail para encaminhar o acesso ao funcionário.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível criar o convite.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function cancelInvite(invitation: EmployeeInvitation) {
    const confirmed = await dialog.confirm({
      title: "Cancelar convite?",
      message: `O convite enviado para ${invitation.email} será cancelado.`,
      confirmText: "Cancelar convite",
      danger: true,
    });
    if (!confirmed) return;
    setMessage("");
    try {
      await cancelEmployeeInvite(invitation.email);
      setMessage("Convite cancelado.");
    } catch {
      setMessage("Não foi possível cancelar o convite.");
    }
  }
  async function setRole(uid: string, role: UserRole) {
    setMessage("");
    try {
      await changeUserRole(uid, role, companyId, currentUid);
      setMessage("Permissão atualizada com sucesso.");
    } catch {
      setMessage("Não foi possível atualizar esta permissão.");
    }
  }
  async function setDetailedPermission(
    item: UserProfile,
    key: keyof UserPermissions,
    allowed: boolean,
  ) {
    setMessage("");
    setBusy(true);
    try {
      await changeUserPermissions(item.uid, {
        ...defaultPermissions,
        ...item.permissions,
        [key]: allowed,
      });
      setMessage("Ações permitidas atualizadas.");
    } catch {
      setMessage("Não foi possível atualizar as ações deste usuário.");
    } finally {
      setBusy(false);
    }
  }
  async function removeUser(item: UserProfile) {
    const confirmation = await dialog.prompt({
      title: "Remover acesso?",
      message: `Digite REMOVER para retirar o acesso de ${item.name || item.email}.`,
      placeholder: "Digite REMOVER",
      confirmText: "Remover acesso",
      danger: true,
    });
    if (confirmation !== "REMOVER") return;
    setMessage("");
    try {
      await removeUserAccess(item.uid);
      setMessage("Acesso do usuário removido com sucesso.");
    } catch {
      setMessage("Não foi possível remover este usuário.");
    }
  }
  return (
    <section className="users-panel">
      <div className="section-heading">
        <div>
          <p>{users.length} usuário(s) da empresa</p>
          <h2>Controle de acesso compartilhado</h2>
        </div>
      </div>
      {message && <div className="system-notice">{message}</div>}
      <form className="invite-form panel" onSubmit={submitInvite}>
        <div>
          <small>NOVO FUNCIONÁRIO</small>
          <h3>Convidar por e-mail</h3>
          <p>
            Depois do primeiro acesso, aprove a permissão na lista de usuários.
          </p>
        </div>
        <label>
          E-mail do funcionário
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="funcionario@empresa.com"
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Convidando..." : "Criar convite"}
        </button>
      </form>
      {invitations.length > 0 && (
        <div className="pending-invites">
          <h3>Convites aguardando acesso</h3>
          {invitations.map((invitation) => {
            const subject = encodeURIComponent("Convite para o Molde Cloud");
            const body = encodeURIComponent(
              "Você foi convidado para acessar o Molde Cloud da empresa. Crie sua conta usando este mesmo e-mail: https://moldes-cloud-digiflash.web.app/",
            );
            return (
              <article key={invitation.email}>
                <div>
                  <strong>{invitation.email}</strong>
                  <small>O funcionário ainda não entrou no sistema.</small>
                </div>
                <a
                  className="outline invite-email"
                  href={`mailto:${invitation.email}?subject=${subject}&body=${body}`}
                >
                  Enviar e-mail
                </a>
                <button
                  className="danger-action"
                  onClick={() => void cancelInvite(invitation)}
                >
                  Cancelar
                </button>
              </article>
            );
          })}
        </div>
      )}
      <div className="users-list">
        {users.map((item) => (
          <article key={item.uid}>
            <div className="user-avatar">
              {item.photoURL ? (
                <img src={item.photoURL} alt="" />
              ) : (
                item.name?.[0] || "U"
              )}
            </div>
            <div className="user-details">
              <strong>
                {item.name || "Usuário"}
                {item.uid === currentUid && <small> VOCÊ</small>}
              </strong>
              <span>{item.email}</span>
            </div>
            <span className={`role-badge ${item.role}`}>
              {roleLabel(item.role)}
            </span>
            <select
              aria-label={`Permissão de ${item.name}`}
              value={item.role}
              disabled={
                item.role === "superadmin" ||
                (item.uid === currentUid && item.role === "admin")
              }
              onChange={(event) =>
                void setRole(item.uid, event.target.value as UserRole)
              }
            >
              <option value="superadmin" disabled>
                Administrador geral
              </option>
              <option value="pending">Aguardando</option>
              <option value="user">Usuário</option>
              <option value="admin">Administrador</option>
              <option value="blocked">Bloqueado</option>
            </select>
            {item.uid !== currentUid && item.role !== "superadmin" && (
              <button
                className="remove-user"
                onClick={() => void removeUser(item)}
              >
                Remover acesso
              </button>
            )}
            {item.role === "user" && (
              <>
                <button
                  className="permission-toggle"
                  aria-expanded={permissionUserId === item.uid}
                  onClick={() =>
                    setPermissionUserId((current) =>
                      current === item.uid ? null : item.uid,
                    )
                  }
                >
                  Ajustar ações {permissionUserId === item.uid ? "⌃" : "⌄"}
                </button>
                {permissionUserId === item.uid && (
                  <div className="user-permission-grid">
                    {(
                      [
                        ["createFolder", "Criar pastas"],
                        ["renameItems", "Renomear itens"],
                        ["deleteItems", "Excluir itens"],
                        ["viewTrash", "Ver lixeira"],
                      ] as [keyof UserPermissions, string][]
                    ).map(([key, label]) => (
                      <label key={key}>
                        <input
                          type="checkbox"
                          disabled={busy}
                          checked={item.permissions?.[key] !== false}
                          onChange={(event) =>
                            void setDetailedPermission(
                              item,
                              key,
                              event.target.checked,
                            )
                          }
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
function CompaniesAdmin({ currentUid }: { currentUid: string }) {
  const dialog = useDialog();
  const [companies, setCompanies] = useState<CompanyRecord[]>([]),
    [name, setName] = useState(""),
    [adminEmail, setAdminEmail] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [showRemoved, setShowRemoved] = useState(false);
  useEffect(() => watchCompanies(setCompanies, setMessage), []);
  const visibleCompanies = companies.filter(
      (company) => company.status !== "deleted",
    ),
    removedCompanies = companies.filter(
      (company) => company.status === "deleted",
    );
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await createCompany(name, adminEmail, currentUid);
      setName("");
      setAdminEmail("");
      setMessage("Empresa criada e administrador definido com sucesso.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível criar a empresa.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function toggle(company: CompanyRecord) {
    setMessage("");
    try {
      await setCompanyStatus(
        company.id,
        company.status === "active" ? "blocked" : "active",
      );
      setMessage(
        company.status === "active"
          ? "Empresa bloqueada."
          : "Empresa reativada.",
      );
    } catch {
      setMessage("Não foi possível alterar a empresa.");
    }
  }
  async function remove(company: CompanyRecord) {
    const confirmation = await dialog.prompt({
      title: "Remover empresa?",
      message: `Os dados serão preservados temporariamente. Digite exatamente: ${company.name}`,
      placeholder: company.name,
      confirmText: "Remover empresa",
      danger: true,
    });
    if (confirmation?.trim() !== company.name) {
      if (confirmation !== null)
        setMessage("O nome digitado não corresponde à empresa.");
      return;
    }
    setMessage("");
    try {
      await removeCompany(company.id, currentUid);
      setMessage(
        "Empresa removida. Os dados e arquivos foram preservados para recuperação.",
      );
    } catch {
      setMessage("Não foi possível remover a empresa.");
    }
  }
  async function restore(company: CompanyRecord) {
    setMessage("");
    try {
      await restoreCompany(company.id);
      setMessage("Empresa restaurada com sucesso.");
    } catch {
      setMessage("Não foi possível restaurar a empresa.");
    }
  }
  return (
    <section className="companies-panel">
      <div className="section-heading">
        <div>
          <p>{visibleCompanies.length} empresa(s) ativa(s) ou bloqueada(s)</p>
          <h2>Administração geral</h2>
        </div>
        {removedCompanies.length > 0 && (
          <button
            className="outline"
            onClick={() => setShowRemoved(!showRemoved)}
          >
            {showRemoved
              ? "Ocultar removidas"
              : `Ver removidas (${removedCompanies.length})`}
          </button>
        )}
      </div>
      {message && <div className="system-notice">{message}</div>}
      <form className="company-form panel" onSubmit={submit}>
        <div>
          <small>NOVA EMPRESA</small>
          <h3>Cadastrar empresa e administrador</h3>
          <p className="password-guidance">
            O administrador criará a própria senha pelo convite. O Molde Cloud
            nunca armazena senhas.
          </p>
        </div>
        <label>
          Nome da empresa
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Confecções Modelo"
          />
        </label>
        <label>
          E-mail do administrador
          <input
            required
            type="email"
            value={adminEmail}
            onChange={(event) => setAdminEmail(event.target.value)}
            placeholder="administrador@empresa.com"
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Criando..." : "Criar empresa"}
        </button>
      </form>
      <div className="companies-list">
        {visibleCompanies.map((company) => (
          <article key={company.id}>
            <span className="company-icon">
              <Icon name="building" />
            </span>
            <div className="company-details">
              <strong>{company.name}</strong>
              <small>Administrador: {company.adminEmail}</small>
              <small>
                OneDrive: {company.oneDriveAccount || "aguardando conexão"}
              </small>
            </div>
            <span className={`company-status ${company.status}`}>
              {company.status === "active" ? "Ativa" : "Bloqueada"}
            </span>
            <div className="company-actions">
              <button
                className={
                  company.status === "active" ? "danger-action" : "outline"
                }
                onClick={() => void toggle(company)}
              >
                {company.status === "active" ? "Bloquear" : "Reativar"}
              </button>
              <button
                className="remove-action"
                onClick={() => void remove(company)}
              >
                Remover
              </button>
            </div>
          </article>
        ))}
      </div>
      {showRemoved && removedCompanies.length > 0 && (
        <section className="removed-companies">
          <h3>Empresas removidas</h3>
          <div className="companies-list">
            {removedCompanies.map((company) => (
              <article key={company.id}>
                <span className="company-icon">
                  <Icon name="building" />
                </span>
                <div className="company-details">
                  <strong>{company.name}</strong>
                  <small>Administrador: {company.adminEmail}</small>
                  <small>Dados e arquivos preservados</small>
                </div>
                <span className="company-status deleted">Removida</span>
                <button
                  className="outline"
                  onClick={() => void restore(company)}
                >
                  Restaurar
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
function roleLabel(role: UserRole) {
  return role === "superadmin"
    ? "Administrador geral"
    : role === "admin"
      ? "Administrador"
      : role === "user"
        ? "Liberado"
        : role === "blocked"
          ? "Bloqueado"
          : "Aguardando";
}
function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    home: (
      <>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V21h14V9.5M9 21v-7h6v7" />
      </>
    ),
    camera: (
      <>
        <path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v10H2V9a2 2 0 0 1 2-2Z" />
        <circle cx="12" cy="13" r="4" />
      </>
    ),
    folder: <path d="M2 6h8l2 2h10v11H2Z" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6l4 2" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="7" />
        <path d="m16 16 5 5" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    building: (
      <>
        <path d="M4 21V4h11v17M15 9h5v12M8 8h3M8 12h3M8 16h3M18 13h.01M18 17h.01M2 21h20" />
      </>
    ),
    cloud: <path d="M7 19h11a4 4 0 0 0 .5-8A7 7 0 0 0 5 9.5 5 5 0 0 0 7 19Z" />,
    alert: (
      <>
        <path d="M12 3 2.8 20h18.4Z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    chart: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    desktop: (
      <>
        <rect x="2" y="4" width="20" height="14" rx="2" />
        <path d="M8 22h8M12 18v4" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m3 17 5-5 4 4 3-3 6 6" />
      </>
    ),
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
      </>
    ),
    move: (
      <>
        <path d="M5 9V5h4M19 15v4h-4M5 5l6 6M19 19l-6-6" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14" />
        <path d="M10 11v6M14 11v6" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    sync: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6.1 9A7 7 0 0 1 18.5 6.5L20 12M4 12l1.5 5.5A7 7 0 0 0 17.9 15" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    restore: (
      <>
        <path d="M4 4v6h6" />
        <path d="M5.5 15a8 8 0 1 0 .5-8.5L4 10" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
