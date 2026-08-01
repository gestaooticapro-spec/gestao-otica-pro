# Migração Ótica Center (Jade) — checklist de execução

## Escopo aprovado

- Criar 7.307 clientes legados elegíveis.
- Vincular 27 clientes já existentes.
- Inserir 10.947 históricos úteis de grau e descrição de serviço.
- Não criar OS artificiais.
- Não usar telefone isolado para mesclar pessoas.

## Antes da janela

- [ ] Confirmar backup recente e PITR do projeto Supabase.
- [ ] Regenerar o relatório somente leitura e conferir os 27 vínculos.
- [ ] Conferir SHA-256 do `backup.sql` no plano de carga.
- [ ] Confirmar que as lojas estão fora do sistema.
- [ ] Executar o modo simulação do importador e conferir os totais.
- [ ] Ter uma pessoa responsável para validar uma OS real após a carga.

## Durante a janela

- [ ] Aplicar somente a migração `20260801110000_customer_prescription_history.sql`.
- [ ] Confirmar que as duas tabelas e triggers foram criadas.
- [ ] Executar o importador com confirmação explícita e registrar o `batchId`.
- [ ] Conferir totais: referências, clientes criados e históricos inseridos.
- [ ] Reexecutar a prévia: ela deve indicar zero duplicidades novas.
- [ ] Abrir uma venda experimental de um cliente migrado, criar uma OS e conferir o histórico “Sistema anterior”.
- [ ] Usar uma receita legada para preencher uma OS nova e salvar normalmente.

## Critérios de parada

- Qualquer divergência entre os totais esperados e os totais gravados.
- Qualquer vínculo fora dos 27 aprovados.
- Erro de RLS, trigger ou leitura no histórico da OS.

## Retorno

- Se a carga ainda estiver em transação, executar rollback e não liberar as lojas.
- Se a carga já tiver concluído, não executar uma segunda importação manual: usar o `batchId`, o relatório e as chaves de origem para diagnosticar.
- Se necessário, restaurar usando PITR/backup conforme o procedimento do Supabase.
