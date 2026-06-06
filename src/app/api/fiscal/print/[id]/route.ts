import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNuvemFiscalToken } from "@/lib/nuvemfiscal";

async function fetchFileBuffer(url: string, headers?: HeadersInit) {
    const response = await fetch(url, { method: "GET", headers });
    if (!response.ok) {
        return { success: false as const, status: response.status };
    }
    const arrayBuffer = await response.arrayBuffer();
    return { success: true as const, buffer: Buffer.from(arrayBuffer) };
}

function getFiscalEndpointType(tipoDocumento?: string | null) {
    if (tipoDocumento === "NFCe") return "nfce";
    if (tipoDocumento === "NFe") return "nfe";
    return "nfse";
}

function buildDownloadName(invoice: any, extension: "pdf" | "xml") {
    const prefix = invoice.direction === "entry"
        ? "nfe-entrada"
        : invoice.tipo_documento === "NFCe"
            ? "nfce"
            : invoice.tipo_documento === "NFe"
                ? "nfe"
                : "nfse";

    return `${prefix}-${invoice.numero || "documento"}.${extension}`;
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
    const invoiceId = parseInt(params.id, 10);
    if (isNaN(invoiceId)) {
        return NextResponse.json({ error: "ID invalido" }, { status: 400 });
    }

    const supabase = createAdminClient() as any;

    try {
        const { data: invoice, error } = await supabase
            .from("fiscal_invoices")
            .select("*")
            .eq("id", invoiceId)
            .single();

        if (error || !invoice) {
            console.error("[Fiscal Print] Nota nao encontrada:", error);
            return NextResponse.json({ error: "Nota nao encontrada" }, { status: 404 });
        }

        const download = request.nextUrl.searchParams.get("download") === "true";
        const format = request.nextUrl.searchParams.get("format");
        const pdfDisposition = download
            ? `attachment; filename="${buildDownloadName(invoice, "pdf")}"`
            : `inline; filename="${buildDownloadName(invoice, "pdf")}"`;
        const xmlDisposition = download
            ? `attachment; filename="${buildDownloadName(invoice, "xml")}"`
            : `inline; filename="${buildDownloadName(invoice, "xml")}"`;

        if (format === "xml" || invoice.direction === "entry") {
            if (invoice.xml_content) {
                return new NextResponse(invoice.xml_content, {
                    headers: {
                        "Content-Type": "application/xml; charset=utf-8",
                        "Content-Disposition": xmlDisposition,
                    },
                });
            }

            if (invoice.xml_url) {
                const xmlResponse = await fetch(invoice.xml_url);
                if (xmlResponse.ok) {
                    const xmlContent = await xmlResponse.text();
                    await supabase
                        .from("fiscal_invoices")
                        .update({ xml_content: xmlContent })
                        .eq("id", invoice.id);

                    return new NextResponse(xmlContent, {
                        headers: {
                            "Content-Type": "application/xml; charset=utf-8",
                            "Content-Disposition": xmlDisposition,
                        },
                    });
                }
            }
        }

        const env = (invoice.environment as "production" | "homologation") || "production";
        const baseUrl = env === "production"
            ? (process.env.NUVEMFISCAL_PROD_URL || "https://api.nuvemfiscal.com.br")
            : (process.env.NUVEMFISCAL_HOM_URL || "https://api.sandbox.nuvemfiscal.com.br");
        const endpointType = getFiscalEndpointType(invoice.tipo_documento);

        if (invoice.nuvemfiscal_uuid) {
            const token = await getNuvemFiscalToken(env);

            if (format === "xml") {
                const xmlUrl = `${baseUrl}/${endpointType}/${invoice.nuvemfiscal_uuid}/xml`;
                const xmlResponse = await fetch(xmlUrl, {
                    method: "GET",
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (!xmlResponse.ok) {
                    return NextResponse.json({ error: "Falha ao obter XML da NuvemFiscal" }, { status: xmlResponse.status });
                }

                const xmlContent = await xmlResponse.text();
                await supabase
                    .from("fiscal_invoices")
                    .update({
                        xml_content: xmlContent,
                        xml_url: invoice.xml_url || xmlUrl,
                    })
                    .eq("id", invoice.id);

                return new NextResponse(xmlContent, {
                    headers: {
                        "Content-Type": "application/xml; charset=utf-8",
                        "Content-Disposition": xmlDisposition,
                    },
                });
            }

            const pdfUrl = `${baseUrl}/${endpointType}/${invoice.nuvemfiscal_uuid}/pdf`;
            console.log(`[Fiscal Print] Buscando via NuvemFiscal: ${pdfUrl}`);
            const result = await fetchFileBuffer(pdfUrl, { Authorization: `Bearer ${token}` });

            if (result.success) {
                return new NextResponse(result.buffer, {
                    headers: { "Content-Type": "application/pdf", "Content-Disposition": pdfDisposition },
                });
            }

            console.warn(`[Fiscal Print] Falha NuvemFiscal (${result.status}), tentando pdf_url...`);
        }

        if (invoice.pdf_url) {
            const result = await fetchFileBuffer(invoice.pdf_url);
            if (result.success) {
                return new NextResponse(result.buffer, {
                    headers: { "Content-Type": "application/pdf", "Content-Disposition": pdfDisposition },
                });
            }
        }

        return NextResponse.json({ error: "Documento nao disponivel para esta nota" }, { status: 404 });
    } catch (error: any) {
        console.error("[Fiscal Print] Erro:", error);
        return NextResponse.json({ error: "Erro interno ao gerar documento" }, { status: 500 });
    }
}
