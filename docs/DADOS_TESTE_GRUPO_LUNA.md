# Dados de demonstração — Grupo Lune

Criados em 18/11/2026 no banco configurado pelo projeto. O inventário exato dos
IDs e dos nomes está em [DADOS_TESTE_GRUPO_LUNA.json](DADOS_TESTE_GRUPO_LUNA.json).
Não há credenciais de acesso ao banco no inventário.

- Tenant **Grupo Lune**: `1d0d4843-a0dc-4ef8-8945-4497d89bf77a`.
- Loja **Ótica Lune**: ID `11`. Tenant e loja são a estrutura do cliente e
  devem ser preservadas na passagem para produção.
- Funcionário **OPERADOR TESTE LUNE**, ID `24`, ativo e com papel de gerente:
  serve tanto para selecionar vendedor quanto para ações que exigem gerente.
  O PIN de demonstração foi definido conforme solicitado; desative ou remova o
  funcionário ao encerrar os testes, depois de revisar suas referências.
- Quatro produtos em cada tipo: armação, solar, lente oftálmica, lente de
  contato, tratamento, serviço e acessório. Os produtos físicos que controlam
  estoque começam com 10 unidades; as lentes oftálmicas, tratamentos e serviços
  foram cadastrados sem controle de estoque. Preços, custos e marca são fictícios.
- Dois fornecedores fictícios, incluindo um identificado como laboratório; um
  oftalmologista fictício; quatro clientes fictícios e o cadastro compartilhado
  **Consumidor Final**, usado pela venda expressa.
- Na criação, os clientes e contatos fictícios não tinham telefone ou documento. Recursos como
  carnê exigem que esses dados sejam preenchidos no fluxo; não usar contatos de
  terceiros para testes. Na criação, catálogo global, avaliação e emissão fiscal
  foram desativados; venda rápida, carnê e pós-venda foram habilitados. Essas
  configurações podem ter sido alteradas posteriormente; consulte a loja atual.
  Nenhum canal WhatsApp ou dado fiscal foi criado por esta operação.
- Nenhum usuário de autenticação, venda ou OS foi criado nesta preparação.

Em 18/11/2026, o nome foi corrigido de Luna para Lune na tenant, loja,
funcionário e cadastros fictícios. Os IDs permanecem iguais. O nome dos arquivos
de inventário foi preservado para manter os links existentes.

## Ao encerrar o teste

O JSON registra os IDs criados inicialmente, não os registros adicionais que o
cliente criar durante a demonstração. Antes de excluir, inventarie as vendas,
OSs, pagamentos, carnês, movimentos de estoque, históricos e outros dados de
teste criados depois, bem como seus vínculos com esses IDs. Defina e execute a
limpeza na ordem adequada após revisão: exclusões podem ser bloqueadas por
referências ou afetar históricos, e não se deve apagar dados reais. Preserve a
tenant e a loja; revise especialmente o uso de **Consumidor Final**, que pode ser
necessário para vendas expressas em produção. Não execute uma exclusão genérica
por tenant ou loja. Reavalie permissões, módulos e cadastros reais antes de
iniciar a operação.
