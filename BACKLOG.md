# BACKLOG - Funcionalidades Futuras

> Este arquivo contém ideias de funcionalidades a serem implementadas em sessões futuras.
> **NÃO APAGAR OU MODIFICAR** - Use apenas para adicionar novas ideias.

---

## 1. Consulta Rápida de Cliente (Histórico)

**Data da ideia:** 16/01/2026

### Problema que resolve:
Quando o cliente liga e pergunta:
- "Quantas parcelas eu já paguei e quantas eu ainda devo?"
- "Qual foi meu grau nas minhas últimas compras?"

### Funcionalidade proposta:
Um modal de consulta rápida que busca o histórico do cliente e permite enviar via WhatsApp.

### Onde colocar:
1. **Sidebar da Loja** → Junto com os itens do menu de atendimento (Vendas, Clientes, Pós-Venda, etc.)
2. **Menu do Login Operacional** → Botão ao lado da busca de cliente

### Como funcionaria:
1. **Busca por nome/CPF/telefone** → Seleciona cliente
2. **Modal com 2 abas:**
   - **💳 Financeiro:** Parcelas pagas vs pendentes, carnês ativos, valor já pago, próximo vencimento
   - **👓 Receitas:** Histórico de graus de todas as OSs (com data de cada compra)

3. **Botão "Enviar via WhatsApp"** em cada aba que formata a informação:
   - Financeiro: "Olá! Você já pagou 4 de 10 parcelas (R$ 400,00). Restam 6 parcelas de R$ 100,00. Próximo venc.: 15/02."
   - Receitas: "Seus últimos graus:\n📅 Jan/2024: OD -2.00 OE -1.75\n📅 Jun/2023: OD -1.75 OE -1.50"

### Estrutura sugerida:
```
src/
  components/
    modals/
      CustomerHistoryModal.tsx  ← Modal principal com abas
  lib/
    actions/
      customer-history.actions.ts  ← Busca clientes + histórico financeiro + receitas
```

### Dados necessários:
- **Financeiro:** Tabelas `financiamentos`, `financiamento_parcelas`, `vendas`
- **Receitas:** Tabelas `service_orders` (campos receita_*)

---

*Adicione novas ideias abaixo seguindo o mesmo formato.*
