import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "firebase/auth";
import {
 createUserWithEmailAndPassword,
 getRedirectResult,
 onAuthStateChanged,
 reload,
 sendEmailVerification,
 sendPasswordResetEmail,
 signInWithEmailAndPassword,
 signInWithPopup,
 signOut,
 updateProfile,
} from "firebase/auth";
import { auth, googleProvider } from "./firebase";
import { changeUserRole, ensureUserProfile, watchAllUsers, watchUserProfile, type UserProfile, type UserRole } from "./users";

type Screen="dashboard"|"capture"|"files"|"history"|"search"|"users";
const nav=[{id:"dashboard" as Screen,label:"Início",icon:"home"},{id:"capture" as Screen,label:"Tirar foto",icon:"camera"},{id:"files" as Screen,label:"Arquivos",icon:"folder"},{id:"history" as Screen,label:"Histórico",icon:"clock"},{id:"search" as Screen,label:"Localizar",icon:"search"}];
const recent=[{name:"frente_tamanho_M.jpg",folder:"Vestido longo",time:"Hoje, 14:32",size:"3,2 MB"},{name:"manga_direita.jpg",folder:"Camisa social",time:"Ontem, 16:08",size:"2,8 MB"},{name:"costas.jpg",folder:"Calça feminina",time:"18 ago, 09:41",size:"4,1 MB"}];

export default function App(){
 const [user,setUser]=useState<User|null>(null),[profile,setProfile]=useState<UserProfile|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{
  let unsubscribeAuth=()=>{},unsubscribeProfile=()=>{};
  let active=true;
  async function restoreLogin(){
   try{
    // Consuming the result is required when Google sends the browser back to
    // the app. Only subscribe after this settles so the login screen does not
    // flash between the redirect and Firebase restoring the current user.
    await getRedirectResult(auth);
   }catch{
    if(active)setError("Não foi possível concluir o login do Google. Tente novamente.");
   }
   if(!active)return;
   unsubscribeAuth=onAuthStateChanged(auth,async(current)=>{
    unsubscribeProfile();setUser(current);setProfile(null);
    if(!current){setLoading(false);return}
    try{
     const initialProfile=await ensureUserProfile(current);
     if(!active)return;
     setProfile(initialProfile);
     unsubscribeProfile=watchUserProfile(current.uid,setProfile);
    }catch{setError("Login realizado, mas não foi possível carregar sua permissão.")}
    finally{if(active)setLoading(false)}
   });
  }
  void restoreLogin();
  return()=>{active=false;unsubscribeAuth();unsubscribeProfile()};
 },[]);
 if(loading)return <div className="auth-screen"><div className="auth-card"><span className="brand-mark">M</span><h1>Molde Cloud</h1><p>Preparando seu acesso...</p><div className="auth-loader"/></div></div>;
 if(!user)return <AuthScreen error={error} setError={setError}/>;
 if(!profile)return <AccessScreen title="Carregando permissão" message="Estamos preparando seu perfil de acesso." user={user}/>;
 if(user.providerData.some(item=>item.providerId==="password")&&!user.emailVerified)return <VerifyEmailScreen user={user}/>;
 if(profile.role==="pending")return <AccessScreen title="Cadastro aguardando aprovação" message="O administrador precisa liberar seu acesso. Esta tela será atualizada automaticamente." user={user}/>;
 if(profile.role==="blocked")return <AccessScreen title="Acesso bloqueado" message="Procure o administrador do Molde Cloud para revisar seu cadastro." user={user}/>;
 return <DashboardApp user={user} profile={profile} notice={error}/>;
}

function AuthScreen({error,setError}:{error:string;setError:(value:string)=>void}){
 const [mode,setMode]=useState<"login"|"register">("login"),[name,setName]=useState(""),[email,setEmail]=useState(""),[password,setPassword]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function submit(event:React.FormEvent){event.preventDefault();setBusy(true);setError("");setMessage("");try{if(mode==="register"){const credential=await createUserWithEmailAndPassword(auth,email.trim(),password);await updateProfile(credential.user,{displayName:name.trim()});await ensureUserProfile(credential.user);await sendEmailVerification(credential.user);setMessage("Cadastro criado. Enviamos a confirmação para seu e-mail.")}else await signInWithEmailAndPassword(auth,email.trim(),password)}catch(value:any){const code=value?.code;setError(code==="auth/email-already-in-use"?"Este e-mail já possui cadastro.":code==="auth/weak-password"?"Use uma senha com pelo menos 6 caracteres.":code==="auth/operation-not-allowed"?"O login por e-mail ainda precisa ser ativado no Firebase.":"E-mail ou senha inválidos.")}finally{setBusy(false)}}
 async function resetPassword(){if(!email.trim()){setError("Digite seu e-mail primeiro.");return}setBusy(true);setError("");try{await sendPasswordResetEmail(auth,email.trim());setMessage("Enviamos o link de recuperação para seu e-mail.")}catch{setMessage("Se o cadastro existir, o link de recuperação será enviado.")}finally{setBusy(false)}}
 return <div className="auth-screen"><div className="auth-card"><span className="brand-mark">M</span><small>DIGIFLASH</small><h1>Molde Cloud</h1><p>{mode==="login"?"Entre para acessar suas fotografias, pastas e histórico.":"Crie sua conta. O administrador aprovará seu acesso."}</p><div className="auth-tabs"><button className={mode==="login"?"active":""} onClick={()=>setMode("login")}>Entrar</button><button className={mode==="register"?"active":""} onClick={()=>setMode("register")}>Criar conta</button></div>{error&&<div className="auth-error">{error}</div>}{message&&<div className="auth-success">{message}</div>}<form className="email-form" onSubmit={submit}>{mode==="register"&&<label>Nome<input required value={name} onChange={event=>setName(event.target.value)} autoComplete="name"/></label>}<label>E-mail<input required type="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="email"/></label><label>Senha<input required minLength={6} type="password" value={password} onChange={event=>setPassword(event.target.value)} autoComplete={mode==="login"?"current-password":"new-password"}/></label><button className="primary auth-submit" disabled={busy}>{busy?"Aguarde...":mode==="login"?"Entrar com e-mail":"Criar minha conta"}</button></form>{mode==="login"&&<button className="forgot-password" disabled={busy} onClick={resetPassword}>Esqueci minha senha</button>}<div className="auth-divider"><span>ou</span></div><button className="google-login" onClick={()=>{setError("");void signInWithPopup(auth,googleProvider).catch(()=>setError("Não foi possível abrir o login do Google."))}}><b>G</b> Entrar com Google</button><span className="auth-note">Sua sessão permanecerá salva neste aparelho.</span></div></div>
}

function AccessScreen({title,message,user}:{title:string;message:string;user:User}){return <div className="auth-screen"><div className="auth-card access-card"><span className="brand-mark">M</span><small>DIGIFLASH</small><h2>{title}</h2><p>{message}</p><strong>{user.email}</strong><button className="outline full" onClick={()=>signOut(auth)}>Sair da conta</button></div></div>}

function VerifyEmailScreen({user}:{user:User}){const [message,setMessage]=useState("");async function check(){await reload(user);if(user.emailVerified)window.location.reload();else setMessage("O e-mail ainda não foi confirmado.")}return <div className="auth-screen"><div className="auth-card access-card"><span className="brand-mark">M</span><small>DIGIFLASH</small><h2>Confirme seu e-mail</h2><p>Enviamos um link para <strong>{user.email}</strong>. Abra o link e depois volte aqui.</p>{message&&<div className="auth-error">{message}</div>}<button className="primary full" onClick={check}>Já confirmei</button><button className="forgot-password" onClick={()=>void sendEmailVerification(user).then(()=>setMessage("Novo e-mail enviado."))}>Enviar novamente</button><button className="outline full" onClick={()=>signOut(auth)}>Sair da conta</button></div></div>}

function DashboardApp({user,profile,notice}:{user:User;profile:UserProfile;notice:string}){
 const [screen,setScreen]=useState<Screen>("dashboard"),[collapsed,setCollapsed]=useState(true),[connected,setConnected]=useState(false);
 const [folders,setFolders]=useState(["Vestido longo","Calça feminina","Camisa social"]),[folder,setFolder]=useState("Vestido longo"),[newFolder,setNewFolder]=useState(""),[showFolder,setShowFolder]=useState(false);
 const [fileName,setFileName]=useState(""),[photo,setPhoto]=useState<string|null>(null),[query,setQuery]=useState(""); const inputRef=useRef<HTMLInputElement>(null);
 const visibleNav=profile.role==="admin"?[...nav,{id:"users" as Screen,label:"Usuários",icon:"users"}]:nav;
 const filtered=useMemo(()=>recent.filter(x=>`${x.name} ${x.folder}`.toLowerCase().includes(query.toLowerCase())),[query]);
 function choosePhoto(file?:File){if(!file)return;setPhoto(URL.createObjectURL(file));if(!fileName)setFileName(file.name.replace(/\.[^/.]+$/, ""));}
 function createFolder(){const v=newFolder.trim();if(!v||folders.includes(v))return;setFolders([...folders,v]);setFolder(v);setNewFolder("");setShowFolder(false)}
 function navigateTo(next:Screen){setScreen(next);setCollapsed(true)}
 return <main className={`app-shell ${collapsed?"is-collapsed":""}`}>
  <button className="mobile-menu" onClick={()=>setCollapsed(false)} aria-label="Abrir menu">☰</button>
  {!collapsed&&<button className="menu-overlay" onClick={()=>setCollapsed(true)} aria-label="Fechar menu"/>}
  <aside className="sidebar"><div className="brand"><span className="brand-mark">M</span><span className="brand-copy">Molde Cloud<small>DIGIFLASH</small></span></div><button className="collapse" onClick={()=>setCollapsed(!collapsed)} aria-label="Recolher menu">‹</button><nav>{visibleNav.map(x=><button key={x.id} className={screen===x.id?"active":""} onClick={()=>navigateTo(x.id)}><span className="nav-icon"><Icon name={x.icon}/></span><span className="nav-label">{x.label}</span></button>)}</nav><button className={`onedrive-button ${connected?"connected":""}`} onClick={()=>{setConnected(!connected);setCollapsed(true)}}><span className="nav-icon"><Icon name="cloud"/></span><span className="nav-label">{connected?"OneDrive conectado":"Conectar OneDrive"}</span></button></aside>
  <section className="workspace"><header><div><p>DIGIFLASH</p><h1>{visibleNav.find(x=>x.id===screen)?.label}</h1></div><div className="header-actions"><div className={`status ${connected?"ok":""}`}><i/>{connected?"OneDrive conectado":"Modo demonstração"}</div><button className="user-chip" onClick={()=>signOut(auth)} title="Sair da conta">{user.photoURL?<img src={user.photoURL} alt=""/>:<span>{user.displayName?.[0]||"U"}</span>}<b>{user.displayName?.split(" ")[0]||"Usuário"}</b></button></div></header>{notice&&<div className="system-notice">{notice}</div>}
   {screen==="dashboard"&&<Dashboard connected={connected} go={setScreen}/>} 
   {screen==="capture"&&<Capture photo={photo} folder={folder} folders={folders} fileName={fileName} setFolder={setFolder} setFileName={setFileName} inputRef={inputRef} openFolder={()=>setShowFolder(true)} connected={connected}/>} 
   {screen==="files"&&<><div className="section-heading"><p>{folders.length} pastas disponíveis</p><button className="primary" onClick={()=>setScreen("capture")}>＋ Nova foto</button></div><div className="folder-grid">{folders.map(f=><article key={f}><span><Icon name="folder"/></span><div><strong>{f}</strong><small>1 arquivo</small></div><b>›</b></article>)}</div></>}
   {screen==="history"&&<List items={recent}/>} 
   {screen==="search"&&<><div className="search-box"><span><Icon name="search"/></span><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar pasta ou arquivo..."/></div><p className="result-count">{filtered.length} resultado(s)</p><section className="panel">{filtered.length?filtered.map(x=><FileRow key={x.name} item={x}/>):<div className="empty">Nenhum arquivo encontrado.</div>}</section></>}
   {screen==="users"&&profile.role==="admin"&&<UsersAdmin currentUid={user.uid}/>}
  </section>
  <input ref={inputRef} className="hidden-input" type="file" accept="image/*" capture="environment" onChange={e=>choosePhoto(e.target.files?.[0])}/>
  {showFolder&&<div className="modal-backdrop" onClick={()=>setShowFolder(false)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setShowFolder(false)}>×</button><p>NOVA PASTA</p><h2>Criar pasta no OneDrive</h2><label>Nome da pasta<input autoFocus value={newFolder} onChange={e=>setNewFolder(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createFolder()} placeholder="Ex.: Moldes agosto"/></label><button className="primary full" onClick={createFolder}>Criar pasta</button></div></div>}
 </main>
}

function Dashboard({connected,go}:{connected:boolean;go:(s:Screen)=>void}){return <div className="dashboard"><section className="welcome"><div><span className="eyebrow">SEU FLUXO DE TRABALHO</span><h2>Fotografe no celular.<br/><em>Acesse no computador.</em></h2><p>Envie suas fotos direto para o OneDrive e encontre tudo pronto para usar no DigiFlash.</p><button className="primary" onClick={()=>go("capture")}><Icon name="camera"/> Tirar nova foto</button></div><div className="flow-art"><div><Icon name="camera"/><small>CELULAR</small></div><span>•••</span><div><Icon name="cloud"/><small>ONEDRIVE</small></div><span>•••</span><div><Icon name="desktop"/><small>COMPUTADOR</small></div></div></section><div className="stats"><Stat icon="camera" tone="purple" label="FOTOS ENVIADAS" value="24" note="+5 esta semana"/><Stat icon="folder" tone="cyan" label="PASTAS" value="3" note="No OneDrive"/><Stat icon="cloud" tone={connected?"green":"amber"} label="ONEDRIVE" value={connected?"Conectado":"Desconectado"} note={connected?"Sincronização ativa":"Conecte para enviar"}/></div><div className="lower-grid"><section className="panel"><div className="panel-title"><div><small>ATIVIDADE</small><h3>Últimos envios</h3></div><button onClick={()=>go("history")}>Ver histórico →</button></div>{recent.map(x=><FileRow key={x.name} item={x}/>)}</section><section className="quick"><small>ACESSO RÁPIDO</small><h3>O que deseja fazer?</h3>{[["camera","Tirar foto","Abrir câmera traseira","capture"],["folder","Ver arquivos","Acessar suas pastas","files"],["search","Localizar","Buscar foto ou pasta","search"]].map(x=><button key={x[1]} onClick={()=>go(x[3] as Screen)}><span><Icon name={x[0]}/></span><div><strong>{x[1]}</strong><small>{x[2]}</small></div><b>›</b></button>)}</section></div></div>}
function Stat({icon,tone,label,value,note}:{icon:string;tone:string;label:string;value:string;note:string}){return <article><span className={`stat-icon ${tone}`}><Icon name={icon}/></span><div><small>{label}</small><strong className={value.length>4?"status-word":""}>{value}</strong><p>{note}</p></div></article>}
function Capture(p:any){return <section className="capture-card"><button className={`camera-area ${p.photo?"has-photo":""}`} onClick={()=>p.inputRef.current?.click()}>{p.photo?<img src={p.photo} alt="Foto escolhida"/>:<><span className="camera-icon"><Icon name="camera"/></span><strong>Fotografar o quadro</strong><small>Use a câmera traseira e mantenha o celular paralelo ao quadro.</small><b>Abrir câmera</b></>}</button><div className="form-grid"><label>Pasta<select value={p.folder} onChange={(e:any)=>p.setFolder(e.target.value)}>{p.folders.map((f:string)=><option key={f}>{f}</option>)}</select></label><button className="outline" onClick={p.openFolder}>＋ Criar pasta</button><label>Nome do arquivo<input value={p.fileName} onChange={(e:any)=>p.setFileName(e.target.value)} placeholder="Ex.: frente tamanho M"/></label></div><div className="capture-footer"><span>JPG ou PNG · a foto permanece no aparelho até o envio</span><button className="primary" disabled={!p.photo||!p.fileName}>{p.connected?"Salvar no OneDrive":"Preparar demonstração"}</button></div></section>}
function List({items}:{items:typeof recent}){return <section className="panel list-panel"><div className="panel-title"><div><small>ATIVIDADE</small><h3>Envios recentes</h3></div></div>{items.map(x=><FileRow key={x.name} item={x}/>)}</section>}
function FileRow({item}:{item:typeof recent[number]}){return <div className="file-row"><span className="file-icon"><Icon name="image"/></span><div><strong>{item.name}</strong><small>{item.folder}</small></div><span>{item.size}</span><time>{item.time}</time><b>✓</b></div>}
function UsersAdmin({currentUid}:{currentUid:string}){const [users,setUsers]=useState<UserProfile[]>([]),[message,setMessage]=useState("");useEffect(()=>watchAllUsers(setUsers),[]);async function setRole(uid:string,role:UserRole){setMessage("");try{await changeUserRole(uid,role);setMessage("Permissão atualizada com sucesso.")}catch{setMessage("Não foi possível atualizar esta permissão.")}}return <section className="users-panel"><div className="section-heading"><div><p>{users.length} usuário(s) cadastrado(s)</p><h2>Controle de acesso</h2></div></div>{message&&<div className="system-notice">{message}</div>}<div className="users-list">{users.map(item=><article key={item.uid}><div className="user-avatar">{item.photoURL?<img src={item.photoURL} alt=""/>:(item.name?.[0]||"U")}</div><div className="user-details"><strong>{item.name||"Usuário"}{item.uid===currentUid&&<small> VOCÊ</small>}</strong><span>{item.email}</span></div><span className={`role-badge ${item.role}`}>{roleLabel(item.role)}</span><select aria-label={`Permissão de ${item.name}`} value={item.role} disabled={item.uid===currentUid&&item.role==="admin"} onChange={event=>void setRole(item.uid,event.target.value as UserRole)}><option value="pending">Aguardando</option><option value="user">Usuário</option><option value="admin">Administrador</option><option value="blocked">Bloqueado</option></select></article>)}</div></section>}
function roleLabel(role:UserRole){return role==="admin"?"Administrador":role==="user"?"Liberado":role==="blocked"?"Bloqueado":"Aguardando"}
function Icon({name}:{name:string}){const paths:Record<string,React.ReactNode>={home:<><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5M9 21v-7h6v7"/></>,camera:<><path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v10H2V9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="4"/></>,folder:<path d="M2 6h8l2 2h10v11H2Z"/>,clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></>,search:<><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></>,users:<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,cloud:<path d="M7 19h11a4 4 0 0 0 .5-8A7 7 0 0 0 5 9.5 5 5 0 0 0 7 19Z"/>,desktop:<><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 22h8M12 18v4"/></>,image:<><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m3 17 5-5 4 4 3-3 6 6"/></>};return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>}
