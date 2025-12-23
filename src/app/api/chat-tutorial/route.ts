import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getManagerKPIs, getSalesDetails, getTopCustomers, getRecentSales, getTopProducts } from "@/lib/actions/dashboard.actions";
import { fetchCatalogItems } from "@/lib/actions/catalog.actions";
import { getResumoCaixa } from "@/lib/actions/cashflow.actions";
import { getCustomerProfile } from "@/lib/actions/customer.actions";
import { getLowStockProducts } from "@/lib/actions/stock.actions";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

// --- DEFINIÇÃO DAS FERRAMENTAS (TOOLS) ---
const tools = [
  {
    functionDeclarations: [
      {
        name: "get_sales_metrics",
        description: "Obtém métricas de vendas, faturamento, estoque e detalhamento por forma de pagamento (Pix, Cartão, etc).",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            period: {
              type: SchemaType.STRING,
              description: "Período de análise (hoje, mes). Opcional, traz ambos por padrão.",
            },
          },
          required: [],
        },
      },
      {
        name: "check_product_stock",
        description: "Busca produtos no catálogo para verificar preço e estoque.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: {
              type: SchemaType.STRING,
              description: "Nome do produto, código de barras ou referência para buscar.",
            },
            category: {
              type: SchemaType.STRING,
              description: "Categoria do produto (lentes, armacoes, produtos_gerais). Se não souber, use 'produtos_gerais'.",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_cash_flow",
        description: "Obtém o resumo financeiro do caixa atual (entradas, saídas, saldo).",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {}, // Sem parâmetros, pega o caixa atual
        },
      },
      {
        name: "get_customer_profile",
        description: "Busca perfil do cliente, histórico de compras e total gasto.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: {
              type: SchemaType.STRING,
              description: "Nome do cliente ou CPF (apenas números).",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_top_customers",
        description: "Retorna o ranking dos 5 melhores clientes do mês atual por volume de compras.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {}, // Sem parâmetros
        },
      },
      {
        name: "get_low_stock_products",
        description: "Lista produtos com estoque baixo (critico) na loja.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {}, // Sem parâmetros
        },
      },
      {
        name: "get_recent_sales",
        description: "Retorna as últimas vendas realizadas hoje.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {}, // Sem parâmetros
        },
      },
      {
        name: "get_top_products",
        description: "Retorna os produtos mais vendidos (ranking) no período.",
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            period: {
              type: SchemaType.STRING,
              description: "Período de análise (hoje, mes, ano). Default: mes.",
            },
          },
          required: [],
        },
      },
    ],
  },
];

export async function POST(req: Request) {
  try {
    const { message, storeId } = await req.json();

    // 1. Contexto do Tutorial (Arquivo de texto)
    const filePath = path.join(process.cwd(), 'PROJETO_COMPLETO_PARA_IA.txt');
    let fileContent = "";
    if (fs.existsSync(filePath)) {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    }

    // 2. Modelo com Tools
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      tools: tools as any,
    });

    // 3. Prompt do Sistema (Híbrido: Tutorial + Consultor)
    const systemPrompt = `
      Você é o Consultor Inteligente e Suporte Técnico do sistema Gestão Ótica Pro.
      
      SEU PAPEL:
      1. AJUDAR COM O SISTEMA: Use o contexto do código abaixo para ensinar como usar o sistema.
      2. ANALISAR DADOS: Se o usuário perguntar sobre vendas, faturamento, estoque, financeiro ou CLIENTES, USE AS FERRAMENTAS.
      
      REGRAS PARA DADOS:
      - NUNCA invente números. Se a ferramenta não retornar, diga que não sabe.
      - Ao receber os dados, seja analítico. Ex: "Seu ticket médio está em R$ X, o que é bom/ruim..."
      - Se o 'storeId' não for fornecido e precisarem de dados, peça para o usuário acessar via Dashboard da Loja.
      - Se perguntarem sobre PAGAMENTOS ESPECÍFICOS (Pix, Cartão, Dinheiro), use a ferramenta 'get_sales_metrics'.
      - Se perguntarem sobre um CLIENTE ESPECÍFICO, use 'get_customer_profile'.
      - Se perguntarem sobre MELHORES CLIENTES ou RANKING, use 'get_top_customers'.
      - Se perguntarem sobre ESTOQUE BAIXO ou ACABANDO, use 'get_low_stock_products'.
      - Se perguntarem sobre VENDAS RECENTES ou O QUE VENDEU HOJE, use 'get_recent_sales'.
      - Se perguntarem sobre PRODUTOS MAIS VENDIDOS, use 'get_top_products'.

      CONTEXTO DO CÓDIGO (TUTORIAL):
      ${fileContent.slice(0, 20000)} // Limitando para economizar tokens se necessário
    `;

    // 4. Iniciar Chat
    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: systemPrompt }],
        },
        {
          role: "model",
          parts: [{ text: "Entendido. Estou pronto para atuar como suporte técnico e consultor de negócios." }],
        },
      ],
    });

    // 5. Enviar mensagem do usuário
    let result = await chat.sendMessage(message);
    let response = result.response;
    let text = response.text();

    // 6. Loop de Function Calling
    // O Gemini pode retornar uma chamada de função (functionCall) em vez de texto
    const functionCalls = response.functionCalls();

    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0]; // Pegamos a primeira chamada
      const args = call.args as any;

      if (!storeId) {
        const errorResponse = "ERRO: storeId não fornecido. O usuário precisa estar logado em uma loja.";
        result = await chat.sendMessage([
          {
            functionResponse: {
              name: call.name,
              response: { error: errorResponse }
            }
          }
        ]);
      } else {
        let functionResult: any = { error: "Função não encontrada" };

        // --- EXECUÇÃO DAS FERRAMENTAS ---
        if (call.name === "get_sales_metrics") {
          console.log(`[IA] Chamando getManagerKPIs para loja ${storeId}`);
          const kpis = await getManagerKPIs(storeId);

          // Busca detalhamento (default para 'mes' se não especificado)
          const periodo = (args.period === 'hoje') ? 'hoje' : 'mes';
          const details = await getSalesDetails(storeId, periodo);

          functionResult = {
            faturamentoDia: kpis.faturamentoDia,
            faturamentoMes: kpis.faturamentoMes,
            ticketMedio: kpis.ticketMedio,
            qtdVendasDia: kpis.qtdVendasDia,
            estoqueCritico: kpis.estoqueCritico,
            detalhamentoPagamentos: details.detalhamento,
            periodoDetalhamento: details.periodo
          };
        }

        else if (call.name === "check_product_stock") {
          console.log(`[IA] Buscando produto '${args.query}' na categoria '${args.category || 'produtos_gerais'}'`);
          const items = await fetchCatalogItems(storeId, args.category || 'produtos_gerais', args.query);
          functionResult = { produtos_encontrados: items.slice(0, 5) }; // Limita a 5 para não estourar tokens
        }

        else if (call.name === "get_cash_flow") {
          console.log(`[IA] Buscando fluxo de caixa para loja ${storeId}`);
          const resumo = await getResumoCaixa(storeId);
          if (resumo) {
            functionResult = {
              saldo_atual_gaveta: resumo.totais.saldo_esperado_dinheiro,
              saldo_acumulado_geral: resumo.totais.saldo_geral_acumulado,
              vendas_hoje: resumo.vendas,
              entradas_manuais: resumo.totais.entradas_manuais,
              saidas_manuais: resumo.totais.saidas_manuais
            };
          } else {
            functionResult = { aviso: "Caixa está fechado ou não foi aberto hoje." };
          }
        }

        else if (call.name === "get_customer_profile") {
          console.log(`[IA] Buscando cliente '${args.query}'`);
          const profile = await getCustomerProfile(storeId, args.query);
          functionResult = profile || { aviso: "Cliente não encontrado." };
        }

        else if (call.name === "get_top_customers") {
          console.log(`[IA] Buscando top clientes para loja ${storeId}`);
          const ranking = await getTopCustomers(storeId);
          functionResult = { ranking_top_5: ranking };
        }

        else if (call.name === "get_low_stock_products") {
          console.log(`[IA] Buscando produtos com estoque baixo para loja ${storeId}`);
          const lowStock = await getLowStockProducts(storeId);
          functionResult = { produtos_criticos: lowStock };
        }

        else if (call.name === "get_recent_sales") {
          console.log(`[IA] Buscando vendas recentes para loja ${storeId}`);
          const recentSales = await getRecentSales(storeId);
          functionResult = { ultimas_vendas: recentSales };
        }

        else if (call.name === "get_top_products") {
          console.log(`[IA] Buscando produtos mais vendidos (${args.period || 'mes'}) para loja ${storeId}`);
          const topProducts = await getTopProducts(storeId, args.period || 'mes');
          functionResult = { ranking_produtos: topProducts };
        }

        // Devolve o resultado para a IA
        result = await chat.sendMessage([
          {
            functionResponse: {
              name: call.name,
              response: functionResult
            }
          }
        ]);
      }

      // Pega a resposta final após a IA processar os dados
      response = result.response;
      text = response.text();
    }

    return NextResponse.json({ reply: text });

  } catch (error: any) {
    console.error("ERRO GEMINI API:", error);
    if (error.status === 429) {
      return NextResponse.json({ reply: "Muitas requisições. Tente novamente em alguns segundos." });
    }
    return NextResponse.json({ reply: "Desculpe, tive um problema técnico ao processar sua solicitação." }, { status: 500 });
  }
}