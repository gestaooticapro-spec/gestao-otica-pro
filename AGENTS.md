# Instrucoes do projeto

## Contexto obrigatorio

- Antes de analisar, alterar ou concluir qualquer tarefa, leia o `README.md` por completo.
- Trate o `README.md` como a fonte de regras operacionais e de arquitetura do projeto.
- Preserve alteracoes locais preexistentes que nao pertencam a tarefa atual.

## Implementacoes e deploy

- A primeira implementacao depois de um deploy deve abrir o proximo patch em `PENDING_RELEASE_VERSION` e registrar a mudanca em `PENDING_RELEASE_CHANGES`; implementacoes seguintes completam essa mesma versao pendente.
- Se uma implementacao pendente for removida, revertida ou substituida antes do deploy, remova ou corrija seu registro em `PENDING_RELEASE_CHANGES`; a lista deve descrever somente o que sera entregue.
- Apenas depois de um deploy concluido, incremente uma unica vez o ultimo bloco da versao, salvo solicitacao expressa para alterar a linha minor. Exemplo: `1.02.01` para `1.02.02`.
- No deploy, insira a versao pendente no inicio de `RELEASE_HISTORY`, com a data atual e as mudancas acumuladas em `PENDING_RELEASE_CHANGES`; depois limpe `PENDING_RELEASE_VERSION` e a lista pendente.
- Preserve todo o historico de deploys. O modal carrega inicialmente tres versoes e revela as anteriores progressivamente.
- O que estiver registrado em `PENDING_RELEASE_CHANGES` deve corresponder ao que sera entregue no proximo deploy.

## Validacao e entrega

- Execute a validacao adequada antes de concluir; para alteracoes TypeScript, execute `npm run typecheck`.
- Relate de forma objetiva os arquivos alterados, a validacao executada e qualquer pendencia real.
