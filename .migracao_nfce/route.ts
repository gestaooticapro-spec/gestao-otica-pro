import { createClient } from "@/src/utils/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    try {
        // 1. Validação de Segurança
        const authHeader = request.headers.get('authorization');
        const webhookSecret = process.env.NUVEMFISCAL_WEBHOOK_SECRET;

        if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
            console.warn("[Webhook] Tentativa não autorizada.");
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        console.log("[Webhook NuvemFiscal] Recebido:", JSON.stringify(body, null, 2));

        // Estrutura esperada do Webhook da Nuvem Fiscal (exemplo genérico, ajustar conforme doc real)
        // Geralmente vem: { id: "...", status: "autorizado", ... } ou dentro de um objeto "data"

        const nuvemFiscalId = body.id || body.data?.id;
        const statusNuvem = body.status || body.data?.status;
        const motivo = body.motivo_status || body.data?.motivo_status;

        if (!nuvemFiscalId) {
            return NextResponse.json({ message: "ID não encontrado no payload" }, { status: 400 });
        }

        const supabase = createClient();

        // 2. Mapear Status
        let novoStatus = 'processing';
        let errorMessage = null;

        if (statusNuvem === 'autorizado') novoStatus = 'authorized';
        else if (['erro', 'rejeitado', 'negado'].includes(statusNuvem)) {
            novoStatus = 'error';
            errorMessage = motivo || "Erro reportado via Webhook";
        }
        else if (statusNuvem === 'cancelado') novoStatus = 'cancelled';
        else {
            // Status desconhecido ou intermediário, ignorar ou manter processing
            console.log("[Webhook] Status ignorado:", statusNuvem);
            return NextResponse.json({ message: "Status ignorado" });
        }

        // 3. Atualizar Banco
        const { error } = await supabase
            .from("fiscal_invoices")
            .update({
                status: novoStatus,
                error_message: errorMessage,
                // Se o webhook trouxer URL do PDF/XML, atualizar também
                pdf_url: body.pdf_url || body.data?.pdf_url,
                xml_url: body.xml_url || body.data?.xml_url,
                numero: body.numero || body.data?.numero,
                serie: body.serie || body.data?.serie,
                chave_acesso: body.chave || body.data?.chave
            })
            .eq("nuvemfiscal_uuid", nuvemFiscalId);

        if (error) {
            console.error("[Webhook] Erro ao atualizar banco:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ message: "Status atualizado com sucesso" });

    } catch (error: any) {
        console.error("[Webhook] Erro interno:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
