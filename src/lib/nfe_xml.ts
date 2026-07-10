import { XMLParser } from "fast-xml-parser";
import type { ParsedNFeItem } from "@/types/nfe";

function firstTaxGroup(group: any) {
    if (!group || typeof group !== "object") return {};
    const key = Object.keys(group)[0];
    return key ? (group[key] || {}) : {};
}

function firstPisCofinsGroup(group: any) {
    if (!group || typeof group !== "object") return {};
    const key = ["PISAliq", "PISQtde", "PISNT", "PISOutr", "COFINSAliq", "COFINSQtde", "COFINSNT", "COFINSOutr"]
        .find((candidate) => group[candidate]);
    return key ? group[key] : firstTaxGroup(group);
}

export function extractItemsFromInfNFe(infNFe: any): ParsedNFeItem[] {
    let dets = infNFe?.det;
    if (dets && !Array.isArray(dets)) dets = [dets];

    return (dets || []).map((d: any): ParsedNFeItem => {
        const prod = d.prod || {};
        const icmsPayload = firstTaxGroup(d.imposto?.ICMS);
        const ipi = d.imposto?.IPI || {};
        const ipiTrib = ipi.IPITrib || {};
        const ipiNt = ipi.IPINT || {};
        const pis = firstPisCofinsGroup(d.imposto?.PIS);
        const cofins = firstPisCofinsGroup(d.imposto?.COFINS);

        return {
            codigo: String(prod.cProd || ""),
            descricao: String(prod.xProd || ""),
            ncm: String(prod.NCM || ""),
            cest: String(prod.CEST || ""),
            unidade: String(prod.uCom || "UN"),
            quantidade: Number(prod.qCom || 0),
            valor_unitario: Number(prod.vUnCom || 0),
            valor_total: Number(prod.vProd || 0),
            valor_frete: Number(prod.vFrete || 0),
            valor_seguro: Number(prod.vSeg || 0),
            valor_desconto: Number(prod.vDesc || 0),
            valor_outras_despesas: Number(prod.vOutro || 0),
            origem: String(icmsPayload.orig ?? "0"),
            cfop: String(prod.CFOP || ""),
            csosn: String(icmsPayload.CSOSN || icmsPayload.CST || "102"),
            icms_base: Number(icmsPayload.vBC || 0),
            icms_aliquota: Number(icmsPayload.pICMS || 0),
            icms_valor: Number(icmsPayload.vICMS || 0),
            icms_mod_bc: Number(icmsPayload.modBC ?? 3),
            cbenef: String(prod.cBenef || ""),
            ipi_cst: String(ipiTrib.CST || ipiNt.CST || ""),
            ipi_cenq: String(ipi.cEnq || ""),
            ipi_base: Number(ipiTrib.vBC || 0),
            ipi_aliquota: Number(ipiTrib.pIPI || 0),
            ipi_valor: Number(ipiTrib.vIPI || 0),
            pis_cst: String(pis.CST || "99"),
            pis_base: Number(pis.vBC || 0),
            pis_aliquota: Number(pis.pPIS || 0),
            pis_valor: Number(pis.vPIS || 0),
            cofins_cst: String(cofins.CST || "99"),
            cofins_base: Number(cofins.vBC || 0),
            cofins_aliquota: Number(cofins.pCOFINS || 0),
            cofins_valor: Number(cofins.vCOFINS || 0),
        };
    });
}

export async function extractItemsFromXmlContent(xmlContent: string) {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        parseTagValue: false,
        parseAttributeValue: false,
    });
    const xml = parser.parse(xmlContent);
    const nfeProc = xml.nfeProc || xml.NFe;
    const infNFe = nfeProc?.NFe?.infNFe || xml.infNFe;
    return {
        infNFe,
        items: extractItemsFromInfNFe(infNFe),
    };
}

export function participantFromOriginEmit(emit: any) {
    const end = emit?.enderEmit || {};
    return {
        nome: emit?.xNome ? String(emit.xNome) : "",
        cpf_cnpj: emit?.CNPJ || emit?.CPF ? String(emit.CNPJ || emit.CPF) : "",
        inscricao_estadual: emit?.IE ? String(emit.IE) : "",
        ind_ie_dest: emit?.IE ? "1" : "9",
        email: emit?.email ? String(emit.email) : "",
        telefone: end?.fone ? String(end.fone) : "",
        cep: end?.CEP ? String(end.CEP) : "",
        logradouro: end?.xLgr ? String(end.xLgr) : "",
        numero: end?.nro ? String(end.nro) : "",
        bairro: end?.xBairro ? String(end.xBairro) : "",
        cidade: end?.xMun ? String(end.xMun) : "",
        uf: end?.UF ? String(end.UF).toUpperCase() : "",
        codigo_municipio: end?.cMun ? String(end.cMun) : "",
    };
}

export function participantFromOriginDest(dest: any) {
    const end = dest?.enderDest || {};
    return {
        nome: dest?.xNome ? String(dest.xNome) : "",
        cpf_cnpj: dest?.CNPJ || dest?.CPF ? String(dest.CNPJ || dest.CPF) : "",
        inscricao_estadual: dest?.IE ? String(dest.IE) : "",
        ind_ie_dest: dest?.indIEDest ? String(dest.indIEDest) : dest?.IE ? "1" : "9",
        email: dest?.email ? String(dest.email) : "",
        telefone: end?.fone ? String(end.fone) : "",
        cep: end?.CEP ? String(end.CEP) : "",
        logradouro: end?.xLgr ? String(end.xLgr) : "",
        numero: end?.nro ? String(end.nro) : "",
        complemento: end?.xCpl ? String(end.xCpl) : "",
        bairro: end?.xBairro ? String(end.xBairro) : "",
        cidade: end?.xMun ? String(end.xMun) : "",
        uf: end?.UF ? String(end.UF).toUpperCase() : "",
        codigo_municipio: end?.cMun ? String(end.cMun) : "",
    };
}
