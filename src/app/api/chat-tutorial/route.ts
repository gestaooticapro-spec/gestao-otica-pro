import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Configurar a IA com a chave do .env
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    // 1. Caminho do arquivo na raiz do projeto
    const filePath = path.join(process.cwd(), 'PROJETO_COMPLETO_PARA_IA.txt'); 
    
    if (!fs.existsSync(filePath)) {
        return NextResponse.json({ reply: "Erro: Arquivo de contexto não encontrado na raiz." });
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');

    // 2. USAR MODELO ESTÁVEL (gemini-1.5-flash)
    // O Flash é muito mais barato e tem limites de cota maiores que o Pro
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
    });

    // 3. PROMPT OTIMIZADO
    // Instruímos a IA a ser breve para economizar tokens de saída
    const promptFinal = `
      Você é o suporte técnico do sistema Gestão Ótica Pro.
      Baseie sua resposta EXCLUSIVAMENTE no código abaixo.
      Se não encontrar no código, diga que não sabe.
      Seja direto e use nomes literais de botões e menus.

      CÓDIGO FONTE:
      ${fileContent}

      PERGUNTA DO USUÁRIO:
      ${message}
    `;

    // 4. CHAMADA SIMPLES (Gasta menos recursos que abrir um chat de longa duração)
    const result = await model.generateContent(promptFinal);
    const response = result.response.text();

    return NextResponse.json({ reply: response });

  } catch (error: any) {
    console.error("ERRO GEMINI API:", error);

    // Se o erro for de cota (429)
    if (error.status === 429) {
        return NextResponse.json({ 
            reply: "A IA está processando muitas informações agora (limite de cota). Aguarde 10 segundos e tente novamente." 
        }, { status: 200 }); // Retornamos 200 para o front não quebrar
    }

    return NextResponse.json({ reply: "Desculpe, tive um problema ao ler o código agora." }, { status: 500 });
  }
}