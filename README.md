# Molde Cloud DigiFlash

Aplicativo web para fotografar moldes no celular, salvar no OneDrive e acessar os arquivos sincronizados no computador.

## Serviços

- Firebase Authentication: login Google e, futuramente, e-mail/senha.
- Cloud Firestore: usuários, funções e histórico.
- OneDrive/Microsoft Graph: armazenamento das fotografias.
- Firebase Hosting: hospedagem da versão definitiva.

## Primeira administração

Após o primeiro login Google, copie o UID exibido no Firebase Authentication e crie manualmente o documento `admins/{UID}` no Firestore com `active: true`. As regras impedem que o navegador conceda a função de administrador sozinho.

## Desenvolvimento

`npm install` e `npm run dev`.

## Publicação

`npm run build` e `firebase deploy --only hosting,firestore:rules`.
