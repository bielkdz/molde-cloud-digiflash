# Molde Cloud DigiFlash

Aplicativo web para fotografar moldes no celular, salvar no OneDrive e acessar os arquivos sincronizados no computador.

## Serviços

- Firebase Authentication: login Google e e-mail/senha, com recuperação de senha.
- Cloud Firestore: empresas, usuários, permissões, convites, pastas e histórico.
- OneDrive/Microsoft Graph: armazenamento das fotografias na conta oficial da empresa.
- Firebase Hosting: hospedagem da versão definitiva.

## Funcionalidades atuais

- captura de fotos pelo celular com revisão antes do envio;
- organização por pastas e busca de arquivos;
- sincronização manual com alterações feitas pelo computador no OneDrive;
- renomeação, movimentação e exclusão de arquivos e pastas;
- histórico compartilhado por empresa;
- perfis de administrador geral, administrador da empresa e usuário;
- criação, bloqueio, remoção e restauração de empresas;
- convites e aprovação de funcionários;
- instalação como aplicativo (PWA) e consulta da interface sem conexão.

## Administração inicial

O primeiro acesso da conta proprietária configurada nas regras pode assumir com segurança o perfil de administrador geral. As regras do Firestore impedem que outro usuário conceda essa função pelo navegador.

## Desenvolvimento

1. Execute `npm install`.
2. Defina `VITE_MICROSOFT_CLIENT_ID` quando quiser substituir o aplicativo Microsoft configurado por padrão.
3. Execute `npm run dev`.

## Publicação

`npm run build` e `firebase deploy --only hosting,firestore:rules`.

Todo push na branch `main` é validado e publicado automaticamente pelo GitHub Actions no projeto Firebase `moldes-cloud-digiflash`. Pull requests executam a mesma instalação e compilação, mas não publicam.
