---
description: Como atualizar e fazer deploy da aplicação para a Firebase
---

Este workflow descreve os passos para enviar alterações para a produção.

1. **Testar Localmente**
   Certifica-te que as alterações funcionam no teu computador.

   ```bash
   npm run dev
   ```

   (Acede a http://127.0.0.1:5500 para testar. Prime `Ctrl+C` no terminal para parar quando terminares.)

2. **Guardar no Git (Recomendado)**
   É boa prática guardar o código antes de enviar.

   ```bash
   git add .
   git commit -m "Descreve aqui as tuas alterações"
   git push origin main
   ```

3. **Fazer Deploy para a Firebase**
   Este comando envia a pasta `public` para o projeto configurado (`wisebudget-financaspessoais`).

   ```bash
   firebase deploy
   ```

   **Dica:** Se só alteraste ficheiros estáticos (HTML/CSS/JS) e queres ser mais rápido, podes usar:

   ```bash
   firebase deploy --only hosting
   ```

4. **Modo Automático (Recomendado)**
   Podes fazer tudo isto de uma vez correndo o script:
   ```powershell
   .\deploy.bat
   ```
   (Vai pedir-te a mensagem de commit e faz o resto sozinho)
