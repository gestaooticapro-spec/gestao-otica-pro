# Instalacao Windows da Torre MB Optical

Este roteiro cobre o primeiro piloto fisico do Passo 10. Ele nao substitui a
homologacao presencial de camera, touch e segunda tela.

## Gerar o instalador

Em um Windows x64, com as dependencias instaladas:

```powershell
npm test
npm run typecheck
npm run build
npm run dist:electron
```

O instalador e criado em `dist-electron` com o nome
`Torre-MB-Optical-Setup-<versao>-x64.exe`.

O pacote de producao abre `https://gestao-otica-pro.vercel.app`. Para um teste
controlado, `TOWER_ELECTRON_URL` pode substituir essa origem. URLs remotas em
HTTP sao rejeitadas; somente localhost pode usar HTTP.

## Instalar na primeira Torre

1. Confirmar Windows atualizado, internet, camera, touch e duas telas conectadas.
2. Executar o instalador como administrador para instalar para todos os usuarios.
3. Manter a inicializacao automatica e o modo kiosk habilitados. Para manutencao
   temporaria, `TOWER_AUTO_START=0` e `TOWER_KIOSK=0` podem desabilita-los.
4. Abrir o aplicativo e registrar a identidade fisica `MBT-2026-000001` usando
   o codigo temporario de preparacao do Electron.
5. Parear o equipamento com a loja 7 usando o QR ou codigo alternativo emitido
   pelo backoffice.
6. Entrar na configuracao local com o PIN provisorio e concluir sua troca.
7. Executar e aprovar camera, touch e segunda tela no equipamento real.
8. Reiniciar o Windows e confirmar restauracao da identidade, pareamento,
   inicializacao automatica e modo kiosk.
9. Criar um atendimento de teste, cadastrar cliente, salvar medidas e confirmar
   sincronizacao. Repetir o teste com queda e retorno da internet.

## Dados locais e desinstalacao

Identidade, credencial protegida, SQLite e outbox ficam em `app.getPath('userData')`.
O desinstalador nao apaga esses dados automaticamente, evitando perda acidental
de eventos pendentes. Antes de remover definitivamente uma Torre, confirmar que
a outbox foi sincronizada e guardar o diagnostico necessario.

## Assinatura do executavel

O primeiro piloto pode ser gerado sem certificado, sujeito ao alerta do Windows
SmartScreen. Antes de distribuir para clientes, assinar o instalador e o
executavel com certificado de assinatura de codigo da empresa.

