# Assistente Fiscal Multiapp — Plano Futuro

## Visão

Criar um serviço independente de IA para ajudar usuários a emitir NF-e, principalmente em cenários difíceis:

- devolução;
- remessa em garantia;
- remessa para conserto;
- retorno de remessa;
- substituição de produtos;
- referência à NF-e de origem;
- conflitos entre natureza da operação, CFOP, finalidade e tributação.

O serviço será reutilizado por vários sistemas em produção, como Autoelétrica, Gestão Ótica e futuros produtos, sem duplicar a conversa ou a lógica de orientação fiscal.

## Princípio central

A IA conversa, coleta contexto, explica e monta um rascunho. Ela não deve inventar dados fiscais nem emitir uma nota sem confirmação humana.

O serviço central será responsável pela interpretação e orquestração. Cada sistema continuará responsável por seus próprios dados, permissões, cadastros e chamada final de emissão.

## Arquitetura proposta

```text
Sistema Autoelétrica ─┐
Sistema Ótica ────────┼──> API do Assistente Fiscal
Outro sistema ───────┘              │
                                    ├── Motor conversacional/IA
                                    ├── Estado da sessão
                                    ├── Regras e validadores fiscais
                                    └── Adaptador do sistema consumidor
                                              │
                                              └── nuvem-local-fiscal
```

Repositório sugerido: `fiscal-ai-assistant`.

## Fluxo de uma sessão

1. O usuário clica em **Assistente para emissão de NF-e**.
2. O sistema identifica a empresa, loja, usuário e contexto disponível.
3. A IA classifica a operação: venda, devolução, garantia, conserto, retorno ou outro cenário.
4. O assistente faz perguntas curtas, uma por vez.
5. O serviço consulta clientes, produtos, vendas, OS e notas de origem por funções autorizadas.
6. Se faltar cadastro, o assistente orienta o usuário e oferece abrir o cadastro correto.
7. O serviço monta um rascunho de NF-e.
8. Validadores determinísticos revisam os campos críticos.
9. A IA explica pendências em linguagem simples.
10. O usuário confirma o resumo final.
11. O sistema consumidor envia o payload aprovado para a emissão.
12. O resultado da SEFAZ é apresentado ao usuário, com explicação de rejeições quando houver.

## Exemplo de conversa

```text
Usuário: Preciso mandar um alternador com defeito para a garantia.

Assistente: Entendi. Ele vai para o fornecedor que vendeu a peça? Você está cobrando algo nesta remessa?

Usuário: Vai para o fornecedor e não vou cobrar agora.

Assistente: Encontrei a OS do Corolla do cliente Joaquim e a NF-e original do alternador. É essa peça que será enviada?

Usuário: Sim.

Assistente: O fornecedor vai consertar a mesma peça ou ainda vai analisar o defeito?

Usuário: Ainda vai analisar.

Assistente: Então vou preparar uma remessa em garantia para análise, sem afirmar substituição. O produto está sem CFOP específico para esta operação; posso aplicar a regra fiscal configurada para remessas em garantia?

Usuário: Pode.

Assistente: Rascunho pronto. Confira destinatário, produto, quantidade, valor, NF-e de origem e CFOP. Posso enviar para emissão?
```

## Contrato da API central

Endpoints iniciais:

```text
POST /v1/sessions
POST /v1/sessions/:id/messages
GET  /v1/sessions/:id
GET  /v1/sessions/:id/draft
POST /v1/sessions/:id/validate
POST /v1/sessions/:id/confirm
POST /v1/sessions/:id/cancel
```

Exemplo de resposta:

```json
{
  "message": "Encontrei a nota de venda original e preparei uma remessa em garantia para análise.",
  "state": "awaiting_confirmation",
  "draft": {
    "document_type": "NFE",
    "operation": "remessa_garantia",
    "customer_id": 123,
    "source_invoice_id": 3421,
    "items": []
  },
  "pending_fields": [],
  "warnings": [],
  "actions": ["validate_draft", "confirm_emission"]
}
```

## Adaptador de cada sistema

Cada aplicação consumidora terá um pequeno adaptador para expor funções locais ao assistente:

```text
GET  /integration/customers/search
GET  /integration/products/search
GET  /integration/service-orders/:id
GET  /integration/invoices/:id
GET  /integration/invoices/source-candidates
POST /integration/products
POST /integration/customers
POST /integration/invoices/draft
POST /integration/invoices/emit
```

O assistente não deve acessar diretamente todos os bancos. O sistema local mantém o controle das credenciais e executa as operações autorizadas.

## Regras de segurança

- Nunca emitir automaticamente sem confirmação explícita.
- Nunca inventar NCM, CFOP, CST, CSOSN, alíquotas ou dados do destinatário.
- Separar sugestão da IA de validação fiscal determinística.
- Exigir NF-e de origem quando o cenário exigir referência.
- Registrar auditoria de perguntas, respostas, rascunhos, validações e confirmações.
- Usar idempotência para impedir emissão duplicada.
- Isolar dados por empresa, loja e usuário.
- Permitir revisão manual e encaminhamento ao contador.
- Versionar o contrato da API e os adaptadores.

## Papel dos modelos

O provedor de IA deve ser substituível. A camada de negócio não pode depender de um único fornecedor.

Possível estratégia:

- modelo barato para classificação e coleta de dados;
- modelo mais forte apenas para casos ambíguos ou rejeições difíceis;
- regras determinísticas para validação fiscal;
- fallback entre provedores quando houver indisponibilidade;
- logs de custo, latência, modelo e resultado.

## Tutorial guiado

Depois do MVP conversacional, o mesmo estado da sessão pode alimentar um modo tutorial:

- destacar o menu correto;
- apontar o campo que precisa ser preenchido;
- explicar por que o campo é necessário;
- validar o que o usuário digitou;
- avançar somente quando o passo estiver correto.

O tutorial deve ser uma camada de interface sobre o mesmo rascunho e as mesmas validações da API, não uma segunda lógica fiscal.

## MVP recomendado

Começar com apenas três cenários de NF-e:

1. remessa em garantia;
2. remessa para conserto;
3. devolução vinculada a uma NF-e de origem.

O primeiro sistema-piloto deve ser a Autoelétrica, porque o fluxo de peças, veículos, OS e garantia é concreto e fácil de validar com usuários reais.

### Fora do primeiro MVP

- emissão autônoma;
- cobertura de todos os CFOPs;
- NFS-e e NFC-e;
- treinamento fiscal genérico para qualquer empresa;
- tutorial visual completo;
- acesso direto e irrestrito aos bancos dos sistemas.

## Critérios de sucesso

- Usuário consegue montar uma NF-e complexa sem conhecer todos os campos técnicos.
- O assistente reduz erros de operação e de referência à nota de origem.
- O usuário entende por que uma informação está pendente.
- Nenhuma nota é emitida sem confirmação.
- O mesmo núcleo atende pelo menos dois sistemas sem duplicação de lógica.
- Toda emissão pode ser auditada e reproduzida.

## Roadmap sugerido

### Fase 1 — Descoberta e contrato

- mapear os payloads aceitos pela `nuvem-local-fiscal`;
- listar cenários reais de NF-e;
- definir contrato da API;
- escolher o primeiro adaptador.

### Fase 2 — Motor de sessão

- estados da conversa;
- perguntas e respostas;
- persistência da sessão;
- autenticação e isolamento por empresa.

### Fase 3 — NF-e de garantia/conserto

- consulta de cliente, produto, OS e NF-e de origem;
- montagem do rascunho;
- validações determinísticas;
- confirmação e emissão.

### Fase 4 — Rejeições e devoluções

- interpretar rejeições da SEFAZ;
- sugerir correções permitidas;
- adicionar devolução e retorno de remessa.

### Fase 5 — Segundo sistema e tutorial

- criar novo adaptador;
- validar que o núcleo é realmente reutilizável;
- adicionar orientação visual nas telas.

## Decisão arquitetural

A IA fiscal deve nascer como um produto de integração separado, com API versionada e adaptadores por sistema. Isso permite evoluir o assistente uma vez e disponibilizar a melhoria para todos os programas, mantendo a emissão e os dados sob controle de cada aplicação.
