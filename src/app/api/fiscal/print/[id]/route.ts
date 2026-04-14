import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNuvemFiscalToken } from "@/lib/nuvemfiscal";

async function fetchPdfBuffer(url: string, headers?: HeadersInit) {
    const response = await fetch(url, { method: "GET", headers });
    if (!response.ok) {
        return { success: false as const, status: response.status };
    }
    const pdfArrayBuffer = await response.arrayBuffer();
    return { success: true as const, buffer: Buffer.from(pdfArrayBuffer) };
}

function buildDownloadName(invoice: any) {
    const prefix = invoice.tipo_documento === "NFCe" ? "nfce" : "nfse";
    return `${prefix}-${invoice.numero || "documento"}.pdf`;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const invoiceId = parseInt(params.id, 10);
    if (isNaN(invoiceId)) {
        return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const supabase = createAdminClient() as any;

    try {
        const { data: invoice, error } = await supabase
            .from("fiscal_invoices")
            .select("*")
            .eq("id", invoiceId)
            .single();

        if (error || !invoice) {
            console.error("[PDF Proxy] Nota não encontrada:", error);
            return NextResponse.json({ error: "Nota não encontrada" }, { status: 404 });
        }

        const download = request.nextUrl.searchParams.get("download") === "true";
        const filename = buildDownloadName(invoice);
        const disposition = download
            ? `attachment; filename="${filename}"`
            : `inline; filename="${filename}"`;

        // Tenta buscar via NuvemFiscal UUID + token
        if (invoice.nuvemfiscal_uuid) {
            const env = (invoice.environment as "production" | "homologation") || "production";
            const token = await getNuvemFiscalToken(env);

            const baseUrl = env === "production"
                ? (process.env.NUVEMFISCAL_PROD_URL || "https://api.nuvemfiscal.com.br")
                : (process.env.NUVEMFISCAL_HOM_URL || "https://api.sandbox.nuvemfiscal.com.br");

            const endpointType = invoice.tipo_documento === "NFCe" ? "nfce" : "nfse";
            const pdfUrl = `${baseUrl}/${endpointType}/${invoice.nuvemfiscal_uuid}/pdf`;

            console.log(`[PDF Proxy] Buscando via NuvemFiscal: ${pdfUrl}`);
            const result = await fetchPdfBuffer(pdfUrl, { Authorization: `Bearer ${token}` });

            if (result.success) {
                return new NextResponse(result.buffer, {
                    headers: { "Content-Type": "application/pdf", "Content-Disposition": disposition },
                });
            }
            console.warn(`[PDF Proxy] Falha NuvemFiscal (${result.status}), tentando pdf_url...`);
        }

        // Fallback: usa pdf_url armazenado
        if (invoice.pdf_url) {
            console.log(`[PDF Proxy] Fallback pdf_url: ${invoice.pdf_url}`);
            const result = await fetchPdfBuffer(invoice.pdf_url);
            if (result.success) {
                return new NextResponse(result.buffer, {
                    headers: { "Content-Type": "application/pdf", "Content-Disposition": disposition },
                });
            }
        }

        return NextResponse.json({ error: "PDF não disponível para esta nota" }, { status: 404 });
    } catch (error: any) {
        console.error("[PDF Proxy] Erro:", error);
        return NextResponse.json({ error: "Erro interno ao gerar PDF" }, { status: 500 });
    }
}
