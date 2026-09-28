# Atualização visual do WiseBudget

A linguagem visual combina marfim, verde profundo e apontamentos dourados, tipografia Inter/Outfit, mais espaço entre secções e hierarquia clara para valores financeiros.

## Âmbito

- Camada visual em `public/refined.css`, carregada depois dos estilos existentes e incluída no precache.
- Dashboard com introdução, atalho para a rota existente de novo movimento, indicadores maiores e destaque do saldo.
- Cabeçalho, navegação flutuante, cartões, botões, formulários, tabelas, login, modais e WiseChat com tratamento consistente.
- Novos valores de apresentação em `DEFAULT_THEME`; cores e imagem já guardadas pelo utilizador continuam a prevalecer. Não há migração nem regravação de preferências nesta entrega.
- Estilos limitados ao ecrã para preservar a apresentação de impressão. Foco de teclado visível e respeito por movimento reduzido.

Não foram alterados cálculos, importadores, autenticação, permissões ou contratos de dados nesta entrega visual. As alterações funcionais das entregas anteriores continuam no diretório de trabalho.

## Verificação

Pré-visualizações estáticas feitas com o HTML real, sem autenticação e com valores fictícios. Dashboard verificado a 1440 px; dashboard, login e novo movimento a 390 px. Não foi observado overflow horizontal da página nessas larguras. Carrosséis mantêm o seu deslocamento interno. Esta revisão visual não substitui teste autenticado com dados e personalizações reais.

Os 11 testes locais existentes passaram com `node --test --experimental-test-isolation=none`. Não houve deploy. Capturas e perfis temporários de inspeção ficam fora do controlo de versões em `tmp/design-review/`.
