# Politica de historico e versoes

Estas regras sao obrigatorias para qualquer alteracao em `src/lib/release-history.ts`.

## Autorizacao

- A autorizacao literal do usuario: **"mude a versao"** e exigida somente para fechar uma versao e mover seus textos para `RELEASE_HISTORY`.
- Atualizar `PENDING_RELEASE_VERSION` e `PENDING_RELEASE_CHANGES` faz parte do trabalho normal de cada alteracao aprovada e deve acompanhar as mudancas feitas na versao pendente.
- Confirmar deploy, publicar na `main`, fazer commit, validar localmente ou receber um "sim" para outra tarefa nao autoriza mover textos para `RELEASE_HISTORY`.
- O numero da versao pendente deve permanecer o mesmo enquanto a versao atual ainda nao foi fechada.

## Conteudo permitido

- `PENDING_RELEASE_CHANGES` e `RELEASE_HISTORY` devem conter somente mudancas que o usuario final possa perceber.
- Nunca registrar detalhes internos de arquitetura, nomes de catalogos, familias, fornecedores, geometrias, implementacoes da Torre, prompts, chaves, infraestrutura ou diagnosticos tecnicos.
- Se uma mudanca tiver informacao interna, omitir essa informacao do historico mesmo que a implementacao seja publicada.
- Antes de fechar uma versao, mostrar ao usuario a lista completa dos textos e aguardar auditoria e autorizacao expressa.

## Fechamento autorizado

Somente depois de **"mude a versao"**:

1. inserir a versao pendente no inicio de `RELEASE_HISTORY`, com a data do deploy e os textos aprovados;
2. limpar `PENDING_RELEASE_VERSION` e `PENDING_RELEASE_CHANGES`;
3. preservar todo o historico anterior;
4. validar o arquivo e publicar a alteracao.

Antes desse comando, nao inserir a versao pendente em `RELEASE_HISTORY`. Durante esse periodo, e permitido e obrigatorio corrigir, incluir ou remover textos de `PENDING_RELEASE_CHANGES` para que eles correspondam ao que sera entregue.
