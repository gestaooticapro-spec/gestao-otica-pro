# WhatsApp Manual Via VPS

## Objetivo

Registrar a trilha combinada para reduzir o uso de `wa.me`/Chrome nas telas do sistema, aproveitando o canal WhatsApp da loja quando ele estiver configurado e conectado via VPS/Evolution.

## Direcao Geral

- Criar uma trilha unica de envio manual de WhatsApp dentro do app.
- Os botoes deixam de decidir localmente entre `window.open` e outras variacoes.
- A decisao passa a acontecer em uma camada central, sempre considerando o `storeId`.

## Regra Por Loja

- Se a loja tiver WhatsApp via VPS habilitado e conectado, o botao envia pela trilha interna.
- Se a loja nao tiver esse canal habilitado, o botao continua funcionando no modo atual, abrindo o WhatsApp externo.
- Isso permite rollout gradual sem quebrar lojas que ainda nao usam o canal da VPS.

## Ideia De Implementacao

- Centralizar o disparo manual em uma action/helper unica.
- Essa camada deve:
  - validar `storeId`
  - checar configuracao/canal da loja
  - decidir entre envio interno ou fallback externo
  - padronizar retorno de sucesso/erro para a interface
- Reaproveitar a base ja existente de envio manual real pelo canal Evolution/VPS.

## Fallback A Decidir

Ainda precisamos escolher a politica padrao:

- `automatico`: tenta VPS; se nao der, abre WhatsApp externo
- `estrito`: so envia pela VPS; se nao der, mostra erro
- `manual`: sempre abre WhatsApp externo

## PDF E Documentos

Existe uma segunda frente ligada a essa trilha:

- avaliar envio de recibo, DANFE e outros documentos por WhatsApp
- decidir se o primeiro passo sera:
  - envio de link
  - envio de PDF real como anexo

## Situacao Atual

- Hoje a trilha da VPS encontrada no projeto envia texto.
- O projeto ja possui infraestrutura para canal por loja e envio manual real.
- O envio de PDF/anexo ainda nao esta fechado nesta trilha.

## Proximo Passo Sugerido

- definir a camada unica de envio manual por `storeId`
- decidir a politica de fallback
- decidir se PDF entra como link primeiro ou como anexo real
