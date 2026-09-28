# Plano de melhorias compatível com o projeto

Revisão local de 28/09/2026. O caderno de 12 semanas é uma orientação de prioridades; não deve substituir funcionalidades existentes nem ser aplicado como uma migração única. A análise do código e dos scripts SQL não certifica o estado do Supabase ou da aplicação publicada.

## Conflitos e decisões

| Área do caderno | Evidência no projeto / risco | Ajuste necessário e critério de aceitação |
| --- | --- | --- |
| RLS apenas por utilizador | `db/shared_households.sql` implementa partilha por household ativa; `user_id` identifica também o autor. Restringir tudo ao autor quebra a conta familiar. | Testar dois membros da mesma household com acesso permitido e um terceiro externo com acesso negado. Testar SELECT/INSERT/UPDATE/DELETE, troca de household, referências a contas de outra household e acesso anónimo. Preservar papéis e convites. |
| Definições e categorias | O final de `shared_households.sql` repõe `user_settings` por utilizador; categorias de sistema são partilhadas para leitura. | Manter preferências pessoais isoladas, categorias de sistema legíveis conforme a política acordada e sem escrita por membros. Incluir profiles, storage, tutoriais, convites e push na auditoria. Não reaplicar scripts históricos indiscriminadamente. |
| Gemini fora do frontend | `ai-chat.js` e `settings.js` chamam Gemini; definições e relatórios usam a mesma chave local/metadados. | Migrar chat **e relatórios** para backend autenticado, validar household, minimizar contexto e limitar pedidos/custos. Só retirar os leitores antigos e limpar chaves após verificar ambos os fluxos em teste. Rodar/revogar chaves expostas; não copiar chaves pessoais para um segredo global. O risco atual permanece aberto até essa migração. |
| Cinco áreas de navegação | O router tem saúde, categorias, tutoriais administrativos e aliases `#/movimentos` e `#/metas`. WiseChat e links podem depender deles. | Simplificar entradas visíveis mantendo rotas, aliases e acesso secundário. Testar links diretos, voltar, permissões de tutoriais e comandos de navegação. |
| Dashboard e formulário | Existem preferências, transferências, poupanças, recorrência e projeções. | Recolher secções sem eliminar cálculos ou campos. Preservar valores ocultos ao editar. Distinguir saldo real de projeções e movimentos pendentes. Comparar resultados antes/depois com os mesmos dados. |
| Uploads | Importador já deteta assinatura PDF e tem tratamento específico Android; CSV/XLSX usam caminhos diferentes. | Validar tamanho antes da leitura, páginas após abertura, extensão e conteúdo em conjunto. MIME vazio/genérico exige verificação de conteúdo, não rejeição automática. CSV não tem assinatura binária universal. Testar PDF com texto/digitalizado, corrompidos, template WiseBudget, CSV bancário, XLSX e Android. Não prometer OCR. |
| Desfazer importação | Apagar por data/descrição pode atingir movimentos legítimos ou editados por outro membro. | Só disponibilizar undo com identificação exata do lote e política explícita para alterações posteriores. Manter pré-visualização e confirmação. |
| Build e divisão de módulos | SPA usa imports nativos, caminhos relativos, base path, bibliotecas globais/CDN e versões no SW/index. Refatoração já consta de `TODO.md`. | Primeiro validar imports e fluxos existentes; depois extrair um domínio por vez. Bundling exige equivalência de assets, workers PDF, importação dinâmica e atualização PWA. Não trocar pipeline simultaneamente com modelo de dados. |
| Modais e mensagens | `public/src/lib/ui.js` já existe e é usado em vários ecrãs. | Reutilizar Toast/Modal; ao substituir `confirm`, aguardar a decisão assíncrona e testar cancelamento. |
| CSP, permissões e 404 | Hosting reescreve tudo para index; existem dependências externas, estilos/scripts e workers. | Inventariar origens e recursos antes de impor CSP. Experimentar em ambiente de teste/report-only; validar login, confirmação/recuperação, PDF, gráficos, imagens, push e IA. Não bloquear futura câmara QR indiscriminadamente. Corrigir fallback de assets sem quebrar entradas de autenticação ou base path. |
| Service worker | Faltavam saúde, tutoriais e dependências locais; instalação ocultava falhas; ativação apagava caches alheias. | Correções locais nesta revisão. Falha no precache impede ativação; caches de outras aplicações são preservadas. Cache de UI não equivale a dados offline: dependências CDN e backend continuam a precisar de rede. |
| Relatórios, notificações e tema em fases futuras | `functions/index.js` já contém relatórios PDF/email; notificações e personalização já existem. | Classificar como manutenção do que existe. Adiar expansão não significa retirar serviços ou preferências. Testar consentimento, desligar push, destinatários e consistência de totais. |
| Observabilidade e privacidade | Eventos e erros podem incluir conteúdo financeiro, tokens ou descrições. | Instrumentar resultados agregados e versão com redação de dados. Documentar fornecedores, exportação, eliminação e retenção conforme comportamento real. Não prometer eliminação completa antes de testar storage e serviços associados. |

## Sequência de execução revista

1. **Semana 1:** inventariar ambientes e migrações efetivamente aplicadas; usar dados sintéticos em teste. Consolidar pendências do `TODO.md`, recolher baseline dos fluxos e preparar backup com ensaio de restauro. Congelar expansão, mantendo correções em curso.
2. **Semanas 1–3 (P0):** migração completa da IA, auditoria RLS compatível com households, login/acessibilidade, validação de ficheiros, observabilidade sem dados sensíveis. Cada entrega tem teste e reversão próprios.
3. **Semanas 2–5:** fechar regressões CSV/PDF/imports já pendentes, validar PWA e depois dividir módulos/build. Aplicar headers após inventário de dependências.
4. **Semanas 4–7:** simplificar apresentação sem retirar acesso, preferências ou campos. Medir o fluxo de adicionar movimento com utilizadores e dados representativos.
5. **Semanas 6–10:** melhorar importação e clareza dos conceitos; conservar relatórios/email/push existentes. QR, undo e IA avançada dependem de critérios próprios de aceitação.
6. **Semanas 10–12:** execução integral da matriz abaixo em teste, restauro e reversão ensaiados; publicação apenas com evidência. Datas são estimativas dependentes destes critérios.

## Backlog único desta revisão

| Prioridade | Problema / impacto | Frequência conhecida | Estado |
| --- | --- | --- | --- |
| Crítico | RLS literal do caderno quebraria partilha familiar | Sempre que aplicado dessa forma | Plano corrigido; testes RLS reais pendentes |
| Crítico | Chave Gemini acessível no cliente em dois fluxos | Quando IA é utilizada/configurada | Migração backend pendente |
| Importante | Instalação SW incompleta podia ativar; caches alheias apagadas | Falha de rede/asset e ativação | Corrigido localmente; ensaio browser pendente |
| Importante | Regressões CSV, PDF e imports já assinaladas em TODO | Não medida | Pendente; manter prioridade |
| Importante | CSP/404, uploads, acessibilidade e logs sem validação integral | Não medida | Inventário e testes pendentes |
| Melhoria | Dashboard/formulário e módulos grandes | Uso normal | Incremental após baseline |
| Adiar | QR, expansão IA, cenários e novas automações | Não aplicável | Dependentes da estabilização |

## Matriz de não regressão antes de publicar

- Registo, confirmação de email, login, logout e recuperação: sessão correta, mensagens acessíveis e retorno à aplicação.
- Criar/editar/apagar receitas, despesas, transferências e poupanças: contas, categorias, datas e saldos coerentes; cancelamento sem escrita.
- Household: owner convida, membro adere e edita dados comuns, externo é bloqueado; configurações pessoais não passam para outro membro. Rejeitar convites inválidos/expirados e auto-adesão.
- Importar PDF/CSV/XLSX: pré-visualização, duplicados, correções, confirmação e totais; ficheiro inválido não grava dados.
- Dashboard, saúde, objetivos e carteiras: mesmos resultados com fixtures iguais; filtros, preferências e rotas antigas preservados.
- Exportação e relatórios PDF/email: totais iguais aos da aplicação e destinatário correto. Chat e análise de relatórios funcionam após migração da IA.
- PWA: instalar, abrir rotas, desligar rede, falhar atualização e voltar a ligar; versão anterior continua utilizável após instalação rejeitada. Testar atualização com separadores abertos. Nunca indicar sucesso de gravação não confirmada pelo backend.
- Tema, tutoriais e notificações: permissões, imagens, consentimento e desligar preservados.

Os testes locais em `tests/service-worker.test.js` cobrem assets/rotas/imports locais, falha de instalação, limpeza de caches, base path e exclusão de pedidos de dados/escrita. São testes com mocks, não testes E2E nem auditoria RLS. Não comprovam consistência entre versões de assets, disponibilidade CDN ou fluxos autenticados.

Validação desta revisão: 5/5 testes aprovados com `node --test --experimental-test-isolation=none`, sintaxe de `public/sw.js` e `git diff --check` aprovados. Neste ambiente, `npm test` encontrou `spawn EPERM` ao tentar criar o processo isolado; a opção indicada permite executar a mesma suite sem subprocessos. A estratégia existente de atualização de assets em background permanece e exige ensaio entre versões; esta alteração não resolve por si só possíveis misturas de versões.

## Âmbito e reversão

### Segunda entrega: validação de importações

Após indicação do utilizador de que o fluxo em browser parece correto, foram acrescentados limites de 20 MB por ficheiro e 200 páginas por PDF, validação de extensão/MIME (aceitando MIME vazio ou genérico), assinaturas PDF/ZIP e rejeição de CSV binário/HTML. Os limites são apresentados no ecrã. O processador PDF é libertado mesmo em caso de erro. Foi removido o log com o texto integral dos extratos e corrigida a chamada a `getXLSX`, anteriormente não importada em settings. XLSX fora do template recebe uma mensagem explícita para exportar como CSV, em vez de enviar conteúdo binário ao leitor de texto.

Validação acumulada: 11 testes locais aprovados, incluindo erros de PDF e libertação de recursos, com `node --test --experimental-test-isolation=none`. Falta repetir o ensaio em browser com ficheiros representativos após esta entrega. A assinatura ZIP é apenas uma verificação inicial; o parser valida o workbook. Estes limites não garantem um teto de memória após descompressão XLSX, não validam todos os casos de ficheiros malformados e não substituem validação no backend se futuramente forem enviados ficheiros. CSV UTF-16 com bytes nulos pede conversão para UTF-8. A proteção de uploads do plano fica parcialmente concluída.

### Primeira entrega

Nesta revisão só se altera o precache/ciclo de instalação/limpeza do SW, adicionam-se testes sem dependências e liga-se esta revisão à documentação. Não foram executadas migrações, limpas chaves, alteradas rotas ou publicado o projeto. Reverter o patch do SW e publicar pelo processo habitual permite recuar a alteração; o script existente incrementa a versão. Antes de publicar, executar testes locais e o ensaio PWA em browser. `npm run deploy` também faz commit/push e publicação, pelo que não serve como comando de validação.
