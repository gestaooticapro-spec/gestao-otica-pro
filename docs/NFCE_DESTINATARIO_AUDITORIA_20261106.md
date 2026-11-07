# NFC-e: revisao da correcao do destinatario em 06/11/2026

## Contexto e estado

A auditoria da primeira correcao confirmou isolamento dos dados pessoais, mas
identificou falta de autorizacao na action, troca de destinatario em retomadas
`blocked_local` e limitacao do campo avulso ao tipo PF/PJ da cliente original.
O estado anterior, baseado somente em cinco testes da funcao pura, nao era
suficiente para considerar a mudanca pronta para publicacao.

As correcoes abaixo foram preparadas localmente. Nao houve publicacao, migracao,
consulta a dados reais, emissao, cancelamento ou alteracao de nota/cadastro nesta
rodada. A migracao de clientes inativos nao foi alterada.

## Correcoes

- `emitirNFCe` exige usuario autenticado e perfil no tenant informado. Perfis
  comuns precisam pertencer a loja; administradores podem operar outras lojas
  do mesmo tenant. A loja e conferida no banco antes de qualquer consulta fiscal,
  token, numeracao, recuperacao ou chamada ao provedor. Falhas bloqueiam o fluxo.
- Documento diferente, cadastro sem documento, documento avulso e ausencia de
  identificacao nao herdam nome, razao social, contato, endereco ou IE da cliente.
  O servidor monta os dados pessoais a partir do cadastro, sem confiar nos campos
  pessoais fornecidos pelo navegador.
- `GopRecoveryClient.prepare` compara o destinatario completo com o payload ja
  preparado. Alteracoes de documento, nome, contato, endereco ou identificacao
  sao recusadas antes da RPC e do envio, inclusive em `blocked_local`. A action
  apresenta o bloqueio sem gravar uma nova falha na tentativa. Correcoes de itens
  continuam possiveis com o mesmo destinatario e numero.
- O snapshot de destinatario da recuperacao e derivado de `infNFe.dest`, evitando
  substituir apenas os campos de apresentacao sem mudar o destinatario do XML.
- Preparacoes iniciais concorrentes continuam usando a verificacao de versao
  existente em `gop_recovery_prepare_v1`: uma chamada obsoleta recebe a tentativa
  atual e nao sobrescreve seu payload. A correcao esta na aplicacao; nenhuma
  definicao SQL ou permissao de RPC foi alterada.
- O campo de documento no modal aceita CPF ou CNPJ, usando validacao pelo tamanho
  do documento e mascara dinamica. Ele nao grava documentos no cadastro da venda.
- As mudancas de autorizacao e destinatario sao especificas da NFC-e; a montagem
  de NF-e/NFS-e nao foi alterada.

## Validacao e limites

`npm run typecheck` foi aprovado. A suite `npm run test:nfce-recipient` inclui os
cinco testes da funcao pura e 21 testes adicionais da action, cliente/rotina de
recuperacao e modal. A suite foi incluida em `npm test`.
Os 26 testes especificos e a suite completa `npm test` foram aprovados.

Os testes executam o codigo real com armazenamento, sessao e HTTP sinteticos.
Cobrem sessao ausente/expirada, perfil ausente, outra loja/tenant, administrador,
payload pessoal manipulado, PF/PJ, documento avulso, anonimato, JSON enviado,
snapshot, retomada recusada, correcao de item permitida, versao obsoleta, POST
ja iniciado e alternancia do modal entre documento avulso e cadastro.

Os testes do modal usam hooks/renderizacao em memoria, sem navegador visual.
A verificacao de versao foi conferida no SQL versionado e modelada no teste;
nenhum PostgreSQL ou Supabase remoto foi executado nesta rodada. Chamadas SQL
diretas com service role continuam sujeitas ao contrato SQL preexistente; a nova
protecao e aplicada pelo cliente de recuperacao da aplicacao atualizada.

Essa validacao local nao comprova as definicoes instaladas no banco, a versao
publicada nem a aceitacao real pelo provedor/SEFAZ. Nao foi emitida nota para teste.
As demais pendencias de auditoria permanecem fora do escopo.

## Conferencia real em 07/11/2026, somente leitura

O usuario relatou que o nome da Isabela permanecia no PDF e pediu comparar a
ultima emissao com o XML. Foi localizada a NFC-e 223, serie 2, registro 586,
da venda 14045 da Loja 1, por R$ 1.380,00, emitida em 07/11/2026 as 11:03:04
de Brasilia e registrada como autorizada.

O payload enviado, o snapshot fiscal, o XML processado e o PDF da Nuvem Local
contem `ISABELA ALBUQUERQUE DA SILVA` como destinataria junto do CPF final 5964.
O XML baixado pela API da Nuvem Local e identico ao XML salvo no sistema, com
protocolo de autorizacao cStat 100 e chave correspondente ao registro. O PDF foi
baixado, teve seu texto extraido e foi conferido visualmente. O cadastro atual
da Isabela continua sem CPF/CNPJ.

A hipotese de nome inserido somente na geracao do PDF foi descartada para essa
nota: o nome ja estava no payload do aplicativo e no XML autorizado. A identidade
civil do titular do CPF nao foi consultada; a identificacao como documento do
marido vem do relato do usuario. Nao foi feita consulta direta a SEFAZ.

Esta evidencia nao confirma qual versao publicada ou caminho de emissao foi
executado e nao comprova que a correcao local entrou em uso. Nenhuma nota,
cadastro, migration, configuracao ou publicacao foi alterada nesta conferencia.
