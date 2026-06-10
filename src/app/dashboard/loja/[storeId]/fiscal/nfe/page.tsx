"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
    AlertCircle,
    AlertTriangle,
    ArrowLeft,
    CheckCircle,
    ChevronLeft,
    ChevronRight,
    Copy,
    FileCheck2,
    FileText,
    Gift,
    Loader2,
    MapPin,
    Repeat2,
    RotateCcw,
    Search,
    Send,
    ShieldCheck,
    Sparkles,
    Trash2,
    Truck,
    Warehouse,
} from "lucide-react";
import ModuleDisabledState from "@/components/modules/ModuleDisabledState";
import { useStoreModules } from "@/lib/contexts/StoreModulesContext";
import { getAuthorizedDepositTransferOriginAction, getAuthorizedShipmentOriginAction, getImportedDemonstrationOriginAction, getImportedNFeOriginAction, getNFeInvoiceWithItemsAction, getPendingSales, getProductFiscalData, getSaleData, getTenantTransferStoreAction, listAuthorizedDepositTransferOriginsAction, listAuthorizedShipmentOriginsAction, listImportedDemonstrationOriginsAction, listImportedNFeOriginsAction, listTenantTransferStoresAction, saveMissingProductNcmAction, saveNFeCustomerParticipantAction, searchCloneableNFeInvoicesAction, searchNFeParticipantsAction, searchProducts, type ParsedNFeItem } from "@/lib/actions/fiscal-db.actions";
import { emitirNFe } from "@/lib/actions/fiscal-nfe.actions";
import { auditarNFeAssistidaComIaAction, type FiscalAuditPayload, type FiscalAuditUiResult } from "@/lib/actions/fiscal-ai-audit.actions";
import { getStoreProfile } from "@/lib/actions/store.actions";
import { participantFromOriginDest } from "@/lib/nfe_xml";

type StepId = "operation" | "participant" | "items" | "transport" | "review";
type OperationGroup = "sale" | "return" | "shipment" | "transfer" | "bonus" | "advanced";

type PendingSale = {
    id: number;
    client_id: number;
    created_at: string;
    total: number;
    status: string;
    clients: { nome: string; cpf_cnpj?: string } | null;
};

type SaleCustomerData = {
    full_name?: string | null;
    cpf?: string | null;
    email?: string | null;
    rua?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    uf?: string | null;
    cep?: string | null;
    codigo_municipio_ibge?: string | null;
    inscricao_estadual?: string | null;
};

type SaleItemData = {
    product_id?: number | null;
    quantidade?: number | string | null;
    valor_unitario?: number | string | null;
    valor_total_item?: number | string | null;
    descricao?: string | null;
};

type SaleDataForNFe = {
    customers?: SaleCustomerData | SaleCustomerData[] | null;
    venda_itens?: SaleItemData[] | null;
} | null;

type CustomerForm = {
    nome: string;
    cpfCnpj: string;
    email: string;
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    uf: string;
    cep: string;
    codigoMunicipioIbge: string;
    inscricaoEstadual: string;
};

type ParticipantMode = "search" | "manual";

type ParticipantResult = {
    id: number;
    full_name: string;
    cpf: string | null;
    email: string | null;
    phone: string | null;
    fone_movel: string | null;
    rua: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
    uf: string | null;
    cep: string | null;
    codigo_municipio_ibge: string | null;
    inscricao_estadual: string | null;
};

type NFeItemForm = {
    productId?: number;
    maxQuantity?: number;
    codigo: string;
    descricao: string;
    ncm: string;
    cest?: string;
    cfop: string;
    unidade: string;
    quantidade: number;
    valorUnitario: number;
    valorTotal: number;
    origem?: number;
    csosn?: string;
    cbenef?: string;
    ipiCst?: string;
    ipiCEnq?: string;
    ipiBase?: number;
    ipiAliquota?: number;
    ipiValor?: number;
    pisCst?: string;
    pisBase?: number;
    pisAliquota?: number;
    pisValor?: number;
    cofinsCst?: string;
    cofinsBase?: number;
    cofinsAliquota?: number;
    cofinsValor?: number;
};

type ImportedNFeOrigin = {
    id: number;
    accessKey: string;
    number: string | null;
    series: string | null;
    importedAt: string;
    issuerName: string | null;
    issuerCnpj: string | null;
    issuedAt: string | null;
    total: number | null;
    xmlAvailable: boolean;
};

type ShipmentOrigin = {
    id: number;
    accessKey: string;
    number: string | null;
    series: string | null;
    issuedAt: string | null;
    recipientName: string | null;
    recipientCnpj: string | null;
    total: number | null;
};

type TransferStore = {
    id: number;
    name: string;
    razao_social: string | null;
    cnpj: string | null;
    state: string | null;
    city: string | null;
};

type NcmSuggestion = {
    code: string;
    description: string;
    confidence: number;
};

type NcmAiStatus = {
    itemIndex: number;
    label: string;
    tone: "green" | "yellow" | "red";
    confidence?: number;
};

type NcmApiResponse = {
    error?: string;
    recommendation?: string | null;
    confidence?: number;
    needs_review?: boolean;
    options?: NcmSuggestion[];
};

type ViaCepResponse = {
    erro?: boolean;
    logradouro?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
    ibge?: string;
};

type ProductSearchResult = {
    id: number | string;
    nome: string;
    preco_venda?: number | string | null;
    ncm?: string | null;
    cfop?: string | null;
    unidade?: string | null;
};

type CloneInvoiceSummary = {
    id: number;
    numero: string | null;
    serie: string | null;
    status: string | null;
    environment: string | null;
    destinatario_nome: string | null;
    destinatario_cnpj: string | null;
    valor_total: number | null;
    data_emissao: string | null;
    chave_acesso: string | null;
    payload_json?: {
        infNFe?: Record<string, unknown>;
    } | null;
};

const STEPS: { id: StepId; label: string }[] = [
    { id: "operation", label: "Operação" },
    { id: "participant", label: "Participante" },
    { id: "items", label: "Itens" },
    { id: "transport", label: "Transporte" },
    { id: "review", label: "Revisão" },
];

const OPERATIONS: {
    id: OperationGroup;
    title: string;
    subtitle: string;
    icon: typeof FileText;
    purposes: string[];
    enabled: boolean;
}[] = [
    {
        id: "sale",
        title: "Venda",
        subtitle: "Venda comum ou NF-e avulsa de mercadoria",
        icon: FileCheck2,
        purposes: ["Venda comum"],
        enabled: true,
    },
    {
        id: "return",
        title: "Devolução",
        subtitle: "Devolução com nota de origem",
        icon: RotateCcw,
        purposes: ["Devolucao de compra", "Devolucao de venda"],
        enabled: true,
    },
    {
        id: "shipment",
        title: "Remessa/Retorno",
        subtitle: "Conserto, garantia, demonstração",
        icon: Repeat2,
        purposes: ["Remessa para conserto", "Retorno de conserto", "Remessa em garantia", "Retorno de garantia", "Remessa para demonstracao", "Retorno de demonstracao"],
        enabled: true,
    },
    {
        id: "transfer",
        title: "Transferência",
        subtitle: "Entre filiais ou depositos",
        icon: Warehouse,
        purposes: ["Transferencia entre filiais", "Transferencia para deposito", "Retorno de deposito"],
        enabled: true,
    },
    {
        id: "bonus",
        title: "Bonificação/Doação",
        subtitle: "Bonificação, brinde ou doação",
        icon: Gift,
        purposes: ["Bonificacao", "Brinde", "Doacao"],
        enabled: true,
    },
    {
        id: "advanced",
        title: "Outra operação",
        subtitle: "Modo assistido com contador",
        icon: ShieldCheck,
        purposes: ["Operacao avancada"],
        enabled: true,
    },
];

const UNIT_OPTIONS = ["UN", "PC", "PAR", "CX", "JG", "KIT", "M", "M2", "M3", "KG", "G", "L", "ML"];

const emptyCustomerForm: CustomerForm = {
    nome: "",
    cpfCnpj: "",
    email: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
    cep: "",
    codigoMunicipioIbge: "",
    inscricaoEstadual: "",
};

const emptyItem: NFeItemForm = {
    codigo: "1",
    descricao: "",
    ncm: "",
    cest: "",
    cfop: "5102",
    unidade: "UN",
    quantidade: 1,
    valorUnitario: 0,
    valorTotal: 0,
    origem: 0,
    csosn: "102",
    cbenef: "",
    ipiCst: "",
    ipiCEnq: "999",
    ipiBase: 0,
    ipiAliquota: 0,
    ipiValor: 0,
    pisCst: "99",
    pisBase: 0,
    pisAliquota: 0,
    pisValor: 0,
    cofinsCst: "99",
    cofinsBase: 0,
    cofinsAliquota: 0,
    cofinsValor: 0,
};

function onlyDigits(value: string) {
    return value.replace(/\D/g, "");
}

function money(value?: number | null) {
    return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function purposeLabel(value: string) {
    const labels: Record<string, string> = {
        "Devolucao de compra": "Devolução de compra",
        "Devolucao de venda": "Devolução de venda",
        "Remessa para demonstracao": "Remessa para demonstração",
        "Retorno de demonstracao": "Retorno de demonstração",
        "Transferencia entre filiais": "Transferência entre filiais",
        "Transferencia para deposito": "Transferência para depósito",
        "Retorno de deposito": "Retorno de depósito",
        Bonificacao: "Bonificação",
        Doacao: "Doação",
        "Operacao avancada": "Operação avançada",
    };
    return labels[value] || value;
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function firstRecord(value: unknown): Record<string, unknown> {
    return Array.isArray(value) ? asRecord(value[0]) : asRecord(value);
}

function normalizeFiscalText(value: unknown) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
}

function inferCloneOperation(infNFe: Record<string, unknown>): {
    operation: OperationGroup;
    purpose: string;
    nature: string;
    tipoNFe: 0 | 1;
    finalidadeNFe: 1 | 2 | 3 | 4;
} {
    const ide = asRecord(infNFe.ide);
    const nature = String(ide.natOp || "");
    const normalizedNature = normalizeFiscalText(nature);
    const tipoNFe = Number(ide.tpNF) === 0 ? 0 : 1;
    const rawFinalidade = Number(ide.finNFe);
    const finalidadeNFe = [1, 2, 3, 4].includes(rawFinalidade)
        ? rawFinalidade as 1 | 2 | 3 | 4
        : 1;

    if (normalizedNature.includes("VENDA")) {
        return { operation: "sale", purpose: "Venda comum", nature, tipoNFe, finalidadeNFe };
    }
    if (normalizedNature.includes("BONIFIC")) {
        return { operation: "bonus", purpose: "Bonificacao", nature, tipoNFe, finalidadeNFe };
    }
    if (normalizedNature.includes("BRINDE")) {
        return { operation: "bonus", purpose: "Brinde", nature, tipoNFe, finalidadeNFe };
    }
    if (normalizedNature.includes("DOAC")) {
        return { operation: "bonus", purpose: "Doacao", nature, tipoNFe, finalidadeNFe };
    }
    if (normalizedNature.includes("REMESSA") && !normalizedNature.includes("RETORNO")) {
        if (normalizedNature.includes("CONSERTO")) {
            return { operation: "shipment", purpose: "Remessa para conserto", nature, tipoNFe, finalidadeNFe };
        }
        if (normalizedNature.includes("GARANT")) {
            return { operation: "shipment", purpose: "Remessa em garantia", nature, tipoNFe, finalidadeNFe };
        }
        if (normalizedNature.includes("DEMONSTR")) {
            return { operation: "shipment", purpose: "Remessa para demonstracao", nature, tipoNFe, finalidadeNFe };
        }
    }

    // Retornos, devolucoes e transferências dependem de uma nova origem/destino.
    return {
        operation: "advanced",
        purpose: "Operacao avancada",
        nature,
        tipoNFe,
        finalidadeNFe,
    };
}

function cloneDraftItem(item: ParsedNFeItem, index: number): NFeItemForm {
    return {
        codigo: item.codigo || String(index + 1),
        descricao: item.descricao || "",
        ncm: onlyDigits(item.ncm || "").slice(0, 8),
        cest: onlyDigits(item.cest || "").slice(0, 7),
        cfop: onlyDigits(item.cfop || "").slice(0, 4),
        unidade: item.unidade || "UN",
        quantidade: Number(item.quantidade || 1),
        valorUnitario: Number(item.valor_unitario || 0),
        valorTotal: Number(item.valor_total || 0),
        origem: Number(item.origem || 0),
        csosn: item.csosn || "102",
        cbenef: item.cbenef || "",
        ipiCst: item.ipi_cst || "",
        ipiCEnq: item.ipi_cenq || "999",
        ipiBase: Number(item.ipi_base || 0),
        ipiAliquota: Number(item.ipi_aliquota || 0),
        ipiValor: Number(item.ipi_valor || 0),
        pisCst: item.pis_cst || "99",
        pisBase: Number(item.pis_base || 0),
        pisAliquota: Number(item.pis_aliquota || 0),
        pisValor: Number(item.pis_valor || 0),
        cofinsCst: item.cofins_cst || "99",
        cofinsBase: Number(item.cofins_base || 0),
        cofinsAliquota: Number(item.cofins_aliquota || 0),
        cofinsValor: Number(item.cofins_valor || 0),
    };
}

function customerFormFromSale(saleData: SaleDataForNFe, fallbackSale: PendingSale): CustomerForm {
    const customer = Array.isArray(saleData?.customers) ? saleData.customers[0] : saleData?.customers;
    return {
        nome: customer?.full_name || fallbackSale.clients?.nome || "",
        cpfCnpj: customer?.cpf || fallbackSale.clients?.cpf_cnpj || "",
        email: customer?.email || "",
        logradouro: customer?.rua || "",
        numero: customer?.numero || "",
        complemento: customer?.complemento || "",
        bairro: customer?.bairro || "",
        cidade: customer?.cidade || "",
        uf: customer?.uf || "",
        cep: customer?.cep || "",
        codigoMunicipioIbge: customer?.codigo_municipio_ibge || "",
        inscricaoEstadual: customer?.inscricao_estadual || "",
    };
}

function customerFormFromParticipant(participant: ParticipantResult): CustomerForm {
    return {
        nome: participant.full_name || "",
        cpfCnpj: participant.cpf || "",
        email: participant.email || "",
        logradouro: participant.rua || "",
        numero: participant.numero || "",
        complemento: participant.complemento || "",
        bairro: participant.bairro || "",
        cidade: participant.cidade || "",
        uf: participant.uf || "",
        cep: participant.cep || "",
        codigoMunicipioIbge: participant.codigo_municipio_ibge || "",
        inscricaoEstadual: participant.inscricao_estadual || "",
    };
}

export default function EmitirNFePage({ params }: { params: { storeId: string } }) {
    const storeId = Number(params.storeId);
    const modules = useStoreModules();
    const router = useRouter();
    const searchParams = useSearchParams();
    const environment = searchParams.get("env") === "production" ? "production" : "homologation";
    const environmentLabel = environment === "production" ? "produção" : "homologação";

    const [step, setStep] = useState<StepId>("operation");
    const [operation, setOperation] = useState<OperationGroup>("sale");
    const [purpose, setPurpose] = useState("Venda comum");
    const [saleModalOpen, setSaleModalOpen] = useState(false);
    const [cloneModalOpen, setCloneModalOpen] = useState(false);
    const [cloneSearch, setCloneSearch] = useState("");
    const [cloneStatus, setCloneStatus] = useState<"authorized" | "error" | "rejected" | "all">("authorized");
    const [cloneResults, setCloneResults] = useState<CloneInvoiceSummary[]>([]);
    const [cloneLoading, setCloneLoading] = useState(false);
    const [cloneApplyingId, setCloneApplyingId] = useState<number | null>(null);
    const [clonedFrom, setClonedFrom] = useState<CloneInvoiceSummary | null>(null);
    const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
    const [loadingSales, setLoadingSales] = useState(true);
    const [saleSearch, setSaleSearch] = useState("");
    const [selectedSale, setSelectedSale] = useState<PendingSale | null>(null);
    const [loadingSaleData, setLoadingSaleData] = useState(false);
    const [saleApplyingId, setSaleApplyingId] = useState<number | null>(null);
    const [importedOrigins, setImportedOrigins] = useState<ImportedNFeOrigin[]>([]);
    const [selectedOrigin, setSelectedOrigin] = useState<ImportedNFeOrigin | null>(null);
    const [loadingOriginKey, setLoadingOriginKey] = useState<string | null>(null);
    const [consertoOrigins, setConsertoOrigins] = useState<ShipmentOrigin[]>([]);
    const [garantiaOrigins, setGarantiaOrigins] = useState<ShipmentOrigin[]>([]);
    const [demonstrationOrigins, setDemonstrationOrigins] = useState<ShipmentOrigin[]>([]);
    const [selectedShipmentOrigin, setSelectedShipmentOrigin] = useState<ShipmentOrigin | null>(null);
    const [transferStores, setTransferStores] = useState<TransferStore[]>([]);
    const [selectedTransferStore, setSelectedTransferStore] = useState<TransferStore | null>(null);
    const [depositTransferOrigins, setDepositTransferOrigins] = useState<ShipmentOrigin[]>([]);
    const [selectedDepositTransferOrigin, setSelectedDepositTransferOrigin] = useState<ShipmentOrigin | null>(null);
    const [customerForm, setCustomerForm] = useState<CustomerForm>(emptyCustomerForm);
    const [participantMode, setParticipantMode] = useState<ParticipantMode>("search");
    const [participantSearch, setParticipantSearch] = useState("");
    const [participantResults, setParticipantResults] = useState<ParticipantResult[]>([]);
    const [participantLoading, setParticipantLoading] = useState(false);
    const [hideParticipantResults, setHideParticipantResults] = useState(false);
    const [selectedParticipantId, setSelectedParticipantId] = useState<number | null>(null);
    const [participantSaveState, setParticipantSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [participantSaveMessage, setParticipantSaveMessage] = useState("");
    const [participantDirty, setParticipantDirty] = useState(false);
    const [cepLoading, setCepLoading] = useState(false);
    const [items, setItems] = useState<NFeItemForm[]>([{ ...emptyItem }]);
    const [paymentMethod, setPaymentMethod] = useState("01");
    const [advancedNature, setAdvancedNature] = useState("");
    const [advancedTpNF, setAdvancedTpNF] = useState<0 | 1>(1);
    const [advancedFinNFe, setAdvancedFinNFe] = useState<1 | 2 | 3 | 4>(1);
    const [referencedKey, setReferencedKey] = useState("");
    const [advancedOriginPanelOpen, setAdvancedOriginPanelOpen] = useState(false);
    const [modFrete, setModFrete] = useState(9);
    const [carrierName, setCarrierName] = useState("");
    const [carrierDoc, setCarrierDoc] = useState("");
    const [volumes, setVolumes] = useState(0);
    const [indPres, setIndPres] = useState(9);
    const [indIntermed, setIndIntermed] = useState<0 | 1>(0);
    const [indFinal, setIndFinal] = useState<0 | 1>(1);
    const [intermediadorCnpj, setIntermediadorCnpj] = useState("");
    const [intermediadorId, setIntermediadorId] = useState("");
    const [valorFrete, setValorFrete] = useState(0);
    const [valorSeguro, setValorSeguro] = useState(0);
    const [valorDesconto, setValorDesconto] = useState(0);
    const [valorOutrasDespesas, setValorOutrasDespesas] = useState(0);
    const [infCpl, setInfCpl] = useState("");
    const [infAdFisco, setInfAdFisco] = useState("");
    const [aiAudit, setAiAudit] = useState<FiscalAuditUiResult | null>(null);
    const [aiAuditLoading, setAiAuditLoading] = useState(false);
    const [aiAuditAttempt, setAiAuditAttempt] = useState<number | null>(null);
    const [advancedAuditConfirmed, setAdvancedAuditConfirmed] = useState(false);
    const [auditFingerprint, setAuditFingerprint] = useState("");
    const [emitting, setEmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [storeUf, setStoreUf] = useState("");
    const [ncmAiLoadingIndex, setNcmAiLoadingIndex] = useState<number | null>(null);
    const [ncmAiStatus, setNcmAiStatus] = useState<NcmAiStatus | null>(null);
    const [ncmOptions, setNcmOptions] = useState<{ itemIndex: number; options: NcmSuggestion[] } | null>(null);

    useEffect(() => {
        if (!storeId || !modules.fiscal) return;

        async function loadInitialData() {
            setLoadingSales(true);
            try {
                const [sales, store, origins, conserto, garantia, demonstrations, siblingStores, depositOrigins] = await Promise.all([
                    getPendingSales(storeId, environment),
                    getStoreProfile(storeId),
                    listImportedNFeOriginsAction(storeId),
                    listAuthorizedShipmentOriginsAction({ storeId, kind: "conserto", environment }),
                    listAuthorizedShipmentOriginsAction({ storeId, kind: "garantia", environment }),
                    listImportedDemonstrationOriginsAction(storeId),
                    listTenantTransferStoresAction(storeId),
                    listAuthorizedDepositTransferOriginsAction(storeId),
                ]);
                setPendingSales(Array.isArray(sales) ? sales as unknown as PendingSale[] : []);
                setStoreUf(String(store?.state || "").toUpperCase());
                setImportedOrigins(Array.isArray(origins) ? origins as ImportedNFeOrigin[] : []);
                setConsertoOrigins(Array.isArray(conserto) ? conserto as ShipmentOrigin[] : []);
                setGarantiaOrigins(Array.isArray(garantia) ? garantia as ShipmentOrigin[] : []);
                setDemonstrationOrigins(Array.isArray(demonstrations) ? demonstrations as ShipmentOrigin[] : []);
                setTransferStores(Array.isArray(siblingStores) ? siblingStores as TransferStore[] : []);
                setDepositTransferOrigins(Array.isArray(depositOrigins) ? depositOrigins as ShipmentOrigin[] : []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoadingSales(false);
            }
        }

        void loadInitialData();
    }, [storeId, modules.fiscal, environment]);

    useEffect(() => {
        if (participantMode !== "search") return;

        const timer = setTimeout(async () => {
            if (hideParticipantResults) {
                setParticipantResults([]);
                return;
            }

            if (participantSearch.trim().length < 2) {
                setParticipantResults([]);
                return;
            }

            setParticipantLoading(true);
            const data = await searchNFeParticipantsAction({ storeId, query: participantSearch });
            setParticipantResults(data as ParticipantResult[]);
            setParticipantLoading(false);
        }, 350);

        return () => clearTimeout(timer);
    }, [hideParticipantResults, participantMode, participantSearch, storeId]);

    useEffect(() => {
        if (!cloneModalOpen) return;

        let cancelled = false;
        const timer = setTimeout(async () => {
            setCloneLoading(true);
            try {
                const data = await searchCloneableNFeInvoicesAction({
                    storeId,
                    environment,
                    query: cloneSearch,
                    status: cloneStatus,
                });
                if (!cancelled) setCloneResults(data as CloneInvoiceSummary[]);
            } finally {
                if (!cancelled) setCloneLoading(false);
            }
        }, 300);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [cloneModalOpen, cloneSearch, cloneStatus, environment, storeId]);

    function resetToManual() {
        setClonedFrom(null);
        setSelectedSale(null);
        setSelectedOrigin(null);
        setSelectedShipmentOrigin(null);
        setSelectedTransferStore(null);
        setSelectedDepositTransferOrigin(null);
        setSelectedParticipantId(null);
        setParticipantMode("manual");
        setCustomerForm(emptyCustomerForm);
        setParticipantDirty(false);
        setParticipantSaveState("idle");
        setParticipantSaveMessage("");
        setItems([{ ...emptyItem }]);
        setError(null);
        setSuccess(null);
    }

    async function applyCloneInvoice(invoice: CloneInvoiceSummary) {
        setCloneApplyingId(invoice.id);
        setError(null);
        setSuccess(null);

        try {
            const result = await getNFeInvoiceWithItemsAction({
                storeId,
                invoiceId: invoice.id,
            });
            if (!result.success || !result.invoice || !result.infNFe) {
                setError(result.error || "Não foi possível ler os dados da NF-e selecionada.");
                return;
            }

            const infNFe = asRecord(result.infNFe);
            const participant = participantFromOriginDest(infNFe.dest);
            const inferred = inferCloneOperation(infNFe);
            const transp = asRecord(infNFe.transp);
            const carrier = asRecord(transp.transporta);
            const volume = firstRecord(transp.vol);
            const total = asRecord(asRecord(infNFe.total).ICMSTot);
            const payment = firstRecord(asRecord(infNFe.pag).detPag);
            const intermediary = asRecord(infNFe.infIntermed);
            const additional = asRecord(infNFe.infAdic);
            const ide = asRecord(infNFe.ide);

            setOperation(inferred.operation);
            setPurpose(inferred.purpose);
            setAdvancedNature(inferred.nature);
            setAdvancedTpNF(inferred.tipoNFe);
            setAdvancedFinNFe(inferred.finalidadeNFe);
            setReferencedKey("");
            setAdvancedOriginPanelOpen(false);

            setSelectedSale(null);
            setSelectedOrigin(null);
            setSelectedShipmentOrigin(null);
            setSelectedTransferStore(null);
            setSelectedDepositTransferOrigin(null);
            setSelectedParticipantId(null);
            setParticipantMode("manual");
            setCustomerForm({
                nome: participant.nome,
                cpfCnpj: participant.cpf_cnpj,
                email: participant.email,
                logradouro: participant.logradouro,
                numero: participant.numero,
                complemento: participant.complemento,
                bairro: participant.bairro,
                cidade: participant.cidade,
                uf: participant.uf,
                cep: participant.cep,
                codigoMunicipioIbge: participant.codigo_municipio,
                inscricaoEstadual: participant.inscricao_estadual,
            });
            setParticipantDirty(false);
            setParticipantSaveState("idle");
            setParticipantSaveMessage("");

            const clonedItems = (result.items || []).map((item: ParsedNFeItem, index: number) => cloneDraftItem(item, index));
            setItems(clonedItems.length > 0 ? clonedItems : [{ ...emptyItem }]);

            setModFrete(Number(transp.modFrete ?? 9));
            setCarrierName(String(carrier.xNome || ""));
            setCarrierDoc(String(carrier.CNPJ || carrier.CPF || ""));
            setVolumes(Number(volume.qVol || 0));
            setIndPres(Number(ide.indPres ?? 9));
            setIndIntermed(Number(ide.indIntermed ?? 0) === 1 ? 1 : 0);
            setIndFinal(Number(ide.indFinal ?? 1) === 0 ? 0 : 1);
            setIntermediadorCnpj(String(intermediary.CNPJ || ""));
            setIntermediadorId(String(intermediary.idCadIntTran || ""));
            setPaymentMethod(String(payment.tPag || (inferred.operation === "sale" ? "01" : "90")));
            setValorFrete(Number(total.vFrete || 0));
            setValorSeguro(Number(total.vSeg || 0));
            setValorDesconto(Number(total.vDesc || 0));
            setValorOutrasDespesas(Number(total.vOutro || 0));
            setInfCpl(String(additional.infCpl || ""));
            setInfAdFisco(String(additional.infAdFisco || ""));

            setAiAudit(null);
            setAuditFingerprint("");
            setAdvancedAuditConfirmed(false);
            setClonedFrom(invoice);
            setCloneModalOpen(false);
            setStep("review");
        } finally {
            setCloneApplyingId(null);
        }
    }

    async function selectTransferStore(store: TransferStore) {
        setLoadingOriginKey(`store-${store.id}`);
        setError(null);
        setSuccess(null);

        const result = await getTenantTransferStoreAction({
            storeId,
            destinationStoreId: store.id,
        });

        setLoadingOriginKey(null);
        if (!result.success || !result.participant) {
            setError(result.error || "Não foi possível carregar a filial de destino.");
            return;
        }

        setSelectedTransferStore(store);
        setSelectedDepositTransferOrigin(null);
        setSelectedOrigin(null);
        setSelectedShipmentOrigin(null);
        setSelectedSale(null);
        setSelectedParticipantId(null);
        setParticipantMode("manual");
        setCustomerForm({
            nome: result.participant.nome,
            cpfCnpj: result.participant.cpf_cnpj,
            email: result.participant.email,
            logradouro: result.participant.logradouro,
            numero: result.participant.numero,
            complemento: "",
            bairro: result.participant.bairro,
            cidade: result.participant.cidade,
            uf: result.participant.uf,
            cep: result.participant.cep,
            codigoMunicipioIbge: result.participant.codigo_municipio,
            inscricaoEstadual: result.participant.inscricao_estadual,
        });
        setParticipantDirty(false);
        setParticipantSaveState("idle");
        setParticipantSaveMessage("");
    }

    async function selectDepositTransferOrigin(origin: ShipmentOrigin) {
        setLoadingOriginKey(origin.accessKey);
        setError(null);
        setSuccess(null);

        const result = await getAuthorizedDepositTransferOriginAction({
            storeId,
            accessKey: origin.accessKey,
        });

        setLoadingOriginKey(null);
        if (!result.success || !result.participant || !result.items) {
            setError(result.error || "Não foi possível carregar a transferência para deposito.");
            return;
        }

        setSelectedDepositTransferOrigin(origin);
        setSelectedTransferStore(null);
        setSelectedOrigin(null);
        setSelectedShipmentOrigin(null);
        setSelectedSale(null);
        setSelectedParticipantId(null);
        setParticipantMode("manual");
        setCustomerForm({
            nome: result.participant.nome,
            cpfCnpj: result.participant.cpf_cnpj,
            email: result.participant.email,
            logradouro: result.participant.logradouro,
            numero: result.participant.numero,
            complemento: "",
            bairro: result.participant.bairro,
            cidade: result.participant.cidade,
            uf: result.participant.uf,
            cep: result.participant.cep,
            codigoMunicipioIbge: result.participant.codigo_municipio,
            inscricaoEstadual: result.participant.inscricao_estadual,
        });
        setParticipantDirty(false);
        setParticipantSaveState("idle");
        setParticipantSaveMessage("");
        setItems(result.items.map((item) => ({
            codigo: item.codigo,
            descricao: item.descricao,
            ncm: item.ncm,
            cfop: storeUf && result.participant.uf && storeUf !== result.participant.uf ? "6906" : "5906",
            unidade: item.unidade,
            quantidade: item.quantidade,
            maxQuantity: item.quantidade,
            valorUnitario: item.valor_unitario,
            valorTotal: item.valor_total,
        })));
        setStep("participant");
    }

    async function selectShipmentOrigin(origin: ShipmentOrigin) {
        const kind = purpose === "Retorno de garantia" ? "garantia" : "conserto";
        setLoadingOriginKey(origin.accessKey);
        setError(null);
        setSuccess(null);

        const result = await getAuthorizedShipmentOriginAction({
            storeId,
            accessKey: origin.accessKey,
            kind,
            environment,
        });

        setLoadingOriginKey(null);
        if (!result.success || !result.participant || !result.items) {
            setError(result.error || "Não foi possível carregar a remessa autorizada.");
            return;
        }

        setSelectedShipmentOrigin(origin);
        setSelectedOrigin(null);
        setSelectedSale(null);
        setSelectedParticipantId(null);
        setParticipantMode("manual");
        setCustomerForm({
            nome: result.participant.nome,
            cpfCnpj: result.participant.cpf_cnpj,
            email: result.participant.email,
            logradouro: result.participant.logradouro,
            numero: result.participant.numero,
            complemento: result.participant.complemento,
            bairro: result.participant.bairro,
            cidade: result.participant.cidade,
            uf: result.participant.uf,
            cep: result.participant.cep,
            codigoMunicipioIbge: result.participant.codigo_municipio,
            inscricaoEstadual: result.participant.inscricao_estadual,
        });
        setParticipantDirty(false);
        setParticipantSaveState("idle");
        setParticipantSaveMessage("");
        setItems(result.items.map((item) => ({
            codigo: item.codigo,
            descricao: item.descricao,
            ncm: item.ncm,
            cfop: storeUf && result.participant.uf && storeUf !== result.participant.uf ? "6916" : "5916",
            unidade: item.unidade,
            quantidade: item.quantidade,
            maxQuantity: item.quantidade,
            valorUnitario: item.valor_unitario,
            valorTotal: item.valor_total,
        })));
        setStep("participant");
    }

    async function selectDemonstrationOrigin(origin: ShipmentOrigin) {
        setLoadingOriginKey(origin.accessKey);
        setError(null);
        setSuccess(null);

        const result = await getImportedDemonstrationOriginAction({
            storeId,
            accessKey: origin.accessKey,
        });

        setLoadingOriginKey(null);
        if (!result.success || !result.participant || !result.items) {
            setError(result.error || "Não foi possível carregar a remessa de demonstração importada.");
            return;
        }

        setSelectedShipmentOrigin(origin);
        setSelectedOrigin(null);
        setSelectedSale(null);
        setSelectedParticipantId(null);
        setParticipantMode("manual");
        setCustomerForm({
            nome: result.participant.nome,
            cpfCnpj: result.participant.cpf_cnpj,
            email: result.participant.email,
            logradouro: result.participant.logradouro,
            numero: result.participant.numero,
            complemento: "",
            bairro: result.participant.bairro,
            cidade: result.participant.cidade,
            uf: result.participant.uf,
            cep: result.participant.cep,
            codigoMunicipioIbge: result.participant.codigo_municipio,
            inscricaoEstadual: result.participant.inscricao_estadual,
        });
        setParticipantDirty(false);
        setParticipantSaveState("idle");
        setParticipantSaveMessage("");
        setItems(result.items.map((item) => ({
            codigo: item.codigo,
            descricao: item.descricao,
            ncm: item.ncm,
            cfop: storeUf && result.participant.uf && storeUf !== result.participant.uf ? "6913" : "5913",
            unidade: item.unidade,
            quantidade: item.quantidade,
            maxQuantity: item.quantidade,
            valorUnitario: item.valor_unitario,
            valorTotal: item.valor_total,
        })));
        setStep("participant");
    }

    async function selectImportedOrigin(origin: ImportedNFeOrigin) {
        setLoadingOriginKey(origin.accessKey);
        setError(null);
        setSuccess(null);

        const result = await getImportedNFeOriginAction({
            storeId,
            accessKey: origin.accessKey,
        });

        setLoadingOriginKey(null);
        if (!result.success || !result.participant || !result.items) {
            setError(result.error || "Não foi possível carregar a NF-e importada.");
            return;
        }

        setSelectedOrigin(origin);
        setSelectedSale(null);
        setSelectedParticipantId(null);
        setParticipantMode("manual");
        setCustomerForm({
            nome: result.participant.nome,
            cpfCnpj: result.participant.cpf_cnpj,
            email: result.participant.email,
            logradouro: result.participant.logradouro,
            numero: result.participant.numero,
            complemento: "",
            bairro: result.participant.bairro,
            cidade: result.participant.cidade,
            uf: result.participant.uf,
            cep: result.participant.cep,
            codigoMunicipioIbge: result.participant.codigo_municipio,
            inscricaoEstadual: result.participant.inscricao_estadual,
        });
        setParticipantDirty(false);
        setParticipantSaveState("idle");
        setParticipantSaveMessage("");
        setItems(result.items.map((item) => ({
            codigo: item.codigo,
            descricao: item.descricao,
            ncm: item.ncm,
            cfop: storeUf && result.participant.uf && storeUf !== result.participant.uf ? "6202" : "5202",
            unidade: item.unidade,
            quantidade: item.quantidade,
            maxQuantity: item.quantidade,
            valorUnitario: item.valor_unitario,
            valorTotal: item.valor_total,
        })));
        setStep("participant");
    }

    async function importSale(sale: PendingSale) {
        setSaleApplyingId(sale.id);
        setOperation("sale");
        setPurpose("Venda comum");
        setClonedFrom(null);
        setSelectedSale(sale);
        setError(null);
        setSuccess(null);
        setLoadingSaleData(true);

        try {
            const data = await getSaleData(storeId, sale.id);
            setCustomerForm(customerFormFromSale(data, sale));
            setParticipantDirty(false);
            setParticipantSaveState("idle");
            setParticipantSaveMessage("");
            setSelectedParticipantId(null);
            setParticipantMode("manual");

            const saleData = data as SaleDataForNFe;
            const saleItems = await Promise.all((saleData?.venda_itens || []).map(async (item, index) => {
                let fiscal = { ncm: "", cfop: "5102", unidade: "UN" };
                if (item.product_id) {
                    const fiscalData = await getProductFiscalData(item.product_id);
                    fiscal = {
                        ncm: fiscalData?.ncm || "",
                        cfop: fiscalData?.cfop || "5102",
                        unidade: fiscalData?.unidade || "UN",
                    };
                }

                const quantidade = Number(item.quantidade || 1);
                const valorUnitario = Number(item.valor_unitario || 0);
                const valorTotal = Number(item.valor_total_item || quantidade * valorUnitario);

                return {
                    productId: item.product_id || undefined,
                    codigo: item.product_id ? String(item.product_id) : String(index + 1),
                    descricao: item.descricao || `Item ${index + 1}`,
                    ncm: fiscal.ncm,
                    cfop: fiscal.cfop,
                    unidade: fiscal.unidade,
                    quantidade,
                    valorUnitario,
                    valorTotal,
                };
            }));

            setItems(saleItems.length ? saleItems : [{ ...emptyItem }]);
            setSaleModalOpen(false);
            setStep("participant");
        } catch (err) {
            console.error(err);
            setError("Não foi possível importar a venda.");
        } finally {
            setSaleApplyingId(null);
            setLoadingSaleData(false);
        }
    }

    function updateCustomerForm(field: keyof CustomerForm, value: string) {
        setCustomerForm((current) => ({ ...current, [field]: value }));
        setParticipantSaveState("idle");
        setParticipantSaveMessage("");
        setParticipantDirty(true);
    }

    function selectParticipant(participant: ParticipantResult) {
        setSelectedParticipantId(participant.id);
        setCustomerForm(customerFormFromParticipant(participant));
        setParticipantSearch(participant.full_name);
        setParticipantResults([]);
        setHideParticipantResults(true);
        setParticipantSaveState("idle");
        setParticipantSaveMessage("");
        setParticipantDirty(false);
    }

    async function resolveCustomerFormWithCep(form: CustomerForm) {
        const cep = onlyDigits(form.cep);
        if (cep.length !== 8) return form;

        setCepLoading(true);
        try {
            const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            const data = await response.json() as ViaCepResponse;

            if (data?.erro) return { ...form, cep };

            return {
                ...form,
                cep,
                logradouro: form.logradouro || data.logradouro || "",
                bairro: form.bairro || data.bairro || "",
                cidade: form.cidade || data.localidade || "",
                uf: form.uf || data.uf || "",
                codigoMunicipioIbge: form.codigoMunicipioIbge || data.ibge || "",
            };
        } catch (err) {
            console.warn("Erro ao buscar CEP:", err);
            return { ...form, cep };
        } finally {
            setCepLoading(false);
        }
    }

    async function saveParticipantOnBlur() {
        if (participantLocked) return;
        if (!customerForm.nome.trim()) return;
        if (!participantDirty) return;

        const nextForm = await resolveCustomerFormWithCep(customerForm);
        if (nextForm !== customerForm) {
            setCustomerForm(nextForm);
        }

        setParticipantSaveState("saving");
        const result = await saveNFeCustomerParticipantAction({
            storeId,
            customerId: selectedParticipantId,
            participant: nextForm,
        });

        if (result.success) {
            setSelectedParticipantId(result.customerId || selectedParticipantId);
            setParticipantSaveState("saved");
            setParticipantSaveMessage(result.created ? "Cliente criado automaticamente." : "Cliente atualizado automaticamente.");
            setParticipantDirty(false);
            return;
        }

        setParticipantSaveState("error");
        setParticipantSaveMessage(result.error || "Não foi possível salvar o participante.");
    }

    async function lookupCepPreview() {
        if (participantLocked) return;
        if (onlyDigits(customerForm.cep).length !== 8) return;

        const resolvedForm = await resolveCustomerFormWithCep(customerForm);
        if (resolvedForm !== customerForm) {
            setCustomerForm(resolvedForm);
            setParticipantDirty(true);
        }
        const cep = onlyDigits(customerForm.cep);
        setCepLoading(true);
        let nextForm = { ...customerForm, cep };
        try {
            const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            const data = await response.json() as ViaCepResponse;

            if (!data?.erro) {
                nextForm = {
                    ...customerForm,
                    cep,
                    logradouro: customerForm.logradouro || data.logradouro || "",
                    bairro: customerForm.bairro || data.bairro || "",
                    cidade: customerForm.cidade || data.localidade || "",
                    uf: customerForm.uf || data.uf || "",
                    codigoMunicipioIbge: customerForm.codigoMunicipioIbge || data.ibge || "",
                };
                setCustomerForm(nextForm);
            }
        } catch (err) {
            console.warn("Erro ao buscar CEP:", err);
        } finally {
            setCepLoading(false);
        }

        await saveNFeCustomerParticipantAction({
            storeId,
            customerId: selectedParticipantId,
            participant: nextForm,
        }).then((result) => {
            if (result.success) {
                setSelectedParticipantId(result.customerId || selectedParticipantId);
                setParticipantSaveState("saved");
                setParticipantSaveMessage(result.created ? "Cliente criado automaticamente." : "Cliente atualizado automaticamente.");
            } else {
                setParticipantSaveState("error");
                setParticipantSaveMessage(result.error || "Não foi possível salvar o participante.");
            }
        });
    }

    function handleParticipantCardBlur(event: React.FocusEvent<HTMLElement>) {
        const nextFocused = event.relatedTarget;
        if (nextFocused instanceof Node && event.currentTarget.contains(nextFocused)) {
            return;
        }

        void saveParticipantOnBlur();
    }

    function updateItem(index: number, patch: Partial<NFeItemForm>) {
        setItems((current) => current.map((item, i) => {
            if (i !== index) return item;
            const next = { ...item, ...patch };
            if ("quantidade" in patch || "valorUnitario" in patch) {
                next.valorTotal = Number((Number(next.quantidade || 0) * Number(next.valorUnitario || 0)).toFixed(2));
            }
            return next;
        }));
    }

    function addItem() {
        setItems((current) => [...current, { ...emptyItem, codigo: String(current.length + 1) }]);
    }

    function removeItem(index: number) {
        setItems((current) => current.length === 1 ? current : current.filter((_, i) => i !== index));
    }

    async function persistProductNcm(index: number, value: string) {
        const item = items[index];
        const ncm = onlyDigits(value).slice(0, 8);
        if (!item?.productId || ncm.length !== 8 || ncm === "00000000") return;

        const result = await saveMissingProductNcmAction({
            storeId,
            productId: item.productId,
            ncm,
        });

        if (result.success && result.saved) {
            setNcmAiStatus({
                itemIndex: index,
                label: "Salvo no produto",
                tone: "green",
            });
        } else if (!result.success) {
            setError(result.error || "Não foi possível salvar o NCM no produto.");
        }
    }

    function getSaleCfop() {
        const destinationUf = customerForm.uf.trim().toUpperCase();
        const originUf = storeUf.trim().toUpperCase();
        if (originUf && destinationUf && originUf !== destinationUf) return "6102";
        return "5102";
    }

    function getBonusCfop() {
        const destinationUf = customerForm.uf.trim().toUpperCase();
        const originUf = storeUf.trim().toUpperCase();
        if (originUf && destinationUf && originUf !== destinationUf) return "6910";
        return "5910";
    }

    function getItemCfop(item: NFeItemForm) {
        if (operation === "advanced") return item.cfop;
        if (operation === "bonus") return getBonusCfop();
        if (operation === "shipment") {
            const destinationUf = customerForm.uf.trim().toUpperCase();
            const isReturn = purpose.startsWith("Retorno");
            const prefix = storeUf && destinationUf && storeUf !== destinationUf ? "6" : "5";
            if (purpose === "Remessa para demonstracao") return `${prefix}912`;
            if (purpose === "Retorno de demonstracao") return `${prefix}913`;
            return `${prefix}${isReturn ? "916" : "915"}`;
        }
        if (operation === "return") {
            const destinationUf = customerForm.uf.trim().toUpperCase();
            return storeUf && destinationUf && storeUf !== destinationUf ? "6202" : "5202";
        }
        if (operation === "transfer") {
            const destinationUf = customerForm.uf.trim().toUpperCase();
            const prefix = storeUf && destinationUf && storeUf !== destinationUf ? "6" : "5";
            if (purpose === "Transferencia para deposito") return `${prefix}905`;
            if (purpose === "Retorno de deposito") return `${prefix}906`;
            return `${prefix}152`;
        }
        return getSaleCfop();
    }

    async function fetchNcmSuggestion(index: number) {
        const descricao = items[index]?.descricao?.trim();
        if (!descricao) {
            setError("Preencha a descricao do produto antes de buscar o NCM com IA.");
            return;
        }

        setNcmAiLoadingIndex(index);
        setNcmAiStatus(null);
        setNcmOptions(null);
        setError(null);

        try {
            const response = await fetch("/api/fiscal/ncm-ia", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ descricao }),
            });
            const data = await response.json() as NcmApiResponse;
            const confidence = typeof data.confidence === "number" ? Math.max(0, Math.min(100, Math.round(data.confidence))) : undefined;
            const status = data.error
                ? { itemIndex: index, label: "Sem confianca", tone: "red" as const, confidence }
                : data.needs_review
                    ? { itemIndex: index, label: "Revisar", tone: "yellow" as const, confidence }
                    : { itemIndex: index, label: "Confiável", tone: "green" as const, confidence };
            setNcmAiStatus(status);

            if (data.options && data.options.length > 1) {
                setNcmOptions({ itemIndex: index, options: data.options });
            } else if (data.recommendation) {
                const ncm = onlyDigits(String(data.recommendation)).slice(0, 8);
                updateItem(index, { ncm });
                await persistProductNcm(index, ncm);
            } else if (data.options?.[0]?.code) {
                const ncm = onlyDigits(String(data.options[0].code)).slice(0, 8);
                updateItem(index, { ncm });
                await persistProductNcm(index, ncm);
            } else {
                setError(data.error || "A IA não conseguiu sugerir um NCM confiável.");
            }
        } catch (err) {
            setError(`Erro ao buscar NCM com IA: ${err instanceof Error ? err.message : "falha desconhecida"}`);
        } finally {
            setNcmAiLoadingIndex(null);
        }
    }

    function getPendingIssues() {
        const issues: string[] = [];
        const cpfCnpj = onlyDigits(customerForm.cpfCnpj);

        if (!["sale", "bonus", "return", "shipment", "transfer", "advanced"].includes(operation)) {
            issues.push("Esta operação ainda não está liberada para transmissão.");
        }
        if (operation === "advanced") {
            if (!advancedNature.trim()) issues.push("Informe a natureza da operação.");
            if (referencedKey && onlyDigits(referencedKey).length !== 44) issues.push("A chave NF-e referenciada deve ter 44 digitos.");
            if (modFrete === 9 && valorFrete > 0) issues.push("Frete deve ser zero quando não houver transporte.");
            if (modFrete !== 9 && ![11, 14].includes(onlyDigits(carrierDoc).length)) {
                issues.push("Informe CPF/CNPJ da transportadora.");
            }
            if (indIntermed === 1 && (onlyDigits(intermediadorCnpj).length !== 14 || !intermediadorId.trim())) {
                issues.push("Informe CNPJ e identificador do intermediador.");
            }
            if (advancedTpNF === 1 && indPres === 0) issues.push("NF-e de saída não pode usar presença 0.");
            if (valorDesconto > items.reduce((sum, item) => sum + Number(item.valorTotal || 0), 0)) {
                issues.push("O desconto não pode superar o total dos produtos.");
            }
        }
        if (operation === "return") {
            if (purpose !== "Devolução de compra") issues.push("Apenas Devolução de compra está liberada nesta etapa.");
            if (!selectedOrigin) issues.push("Selecione uma NF-e de entrada importada.");
        }
        if (operation === "shipment" && purpose.startsWith("Retorno") && !selectedShipmentOrigin) {
            issues.push("Selecione uma NF-e de remessa autorizada para o retorno.");
        }
        if (operation === "transfer" && purpose === "Transferencia entre filiais" && !selectedTransferStore) {
            issues.push("Selecione a filial de destino.");
        }
        if (operation === "transfer" && purpose === "Retorno de deposito" && !selectedDepositTransferOrigin) {
            issues.push("Selecione uma remessa para deposito importada.");
        }
        if (operation === "transfer" && (cpfCnpj.length !== 14 || !onlyDigits(customerForm.inscricaoEstadual))) {
            issues.push("Transferências exigem destinatário com CNPJ e Inscrição Estadual.");
        }
        if (!customerForm.nome.trim()) issues.push("Informe nome/razao social do participante.");
        if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) issues.push("Informe CPF/CNPJ válido.");
        if (!customerForm.logradouro.trim() || !customerForm.numero.trim() || !customerForm.bairro.trim()) issues.push("Complete logradouro, número e bairro.");
        if (!customerForm.cidade.trim() || !customerForm.uf.trim()) issues.push("Complete cidade e UF.");
        if (onlyDigits(customerForm.cep).length !== 8) issues.push("Informe CEP com 8 digitos.");
        if (onlyDigits(customerForm.codigoMunicipioIbge).length !== 7) issues.push("Informe código IBGE do municipio.");

        items.forEach((item, index) => {
            if (!item.descricao.trim()) issues.push(`Item ${index + 1}: informe descricao.`);
            if (onlyDigits(item.ncm).length !== 8 || onlyDigits(item.ncm) === "00000000") {
                issues.push(`Item ${index + 1}: informe NCM válido com 8 digitos.`);
            }
            if (operation === "advanced" && onlyDigits(item.cfop).length !== 4) issues.push(`Item ${index + 1}: informe CFOP com 4 digitos.`);
            if (operation === "advanced" && advancedTpNF === 0 && !["1", "2", "3"].includes(onlyDigits(item.cfop)[0])) {
                issues.push(`Item ${index + 1}: CFOP não corresponde a uma NF-e de entrada.`);
            }
            if (operation === "advanced" && advancedTpNF === 1 && !["5", "6", "7"].includes(onlyDigits(item.cfop)[0])) {
                issues.push(`Item ${index + 1}: CFOP não corresponde a uma NF-e de saída.`);
            }
            if (operation === "advanced" && !["101", "102", "103", "201", "202", "203", "300", "400", "500", "900"].includes(item.csosn || "")) {
                issues.push(`Item ${index + 1}: selecione um CSOSN suportado.`);
            }
            if (operation === "advanced" && (!Number.isInteger(Number(item.origem)) || Number(item.origem) < 0 || Number(item.origem) > 8)) {
                issues.push(`Item ${index + 1}: origem da mercadoria invalida.`);
            }
            if (Number(item.quantidade) <= 0) issues.push(`Item ${index + 1}: quantidade deve ser maior que zero.`);
            if (item.maxQuantity && Number(item.quantidade) > item.maxQuantity) {
                issues.push(`Item ${index + 1}: quantidade máxima para devolução e ${item.maxQuantity}.`);
            }
            if (Number(item.valorUnitario) <= 0) issues.push(`Item ${index + 1}: valor unitario deve ser maior que zero.`);
        });

        return issues;
    }

    function buildAdvancedAuditPayload(): FiscalAuditPayload {
        const totalProdutos = items.reduce((sum, item) => sum + Number(item.valorTotal || 0), 0);
        return {
            storeId,
            ambiente: environment,
            operacao: "Outra operacao",
            natureza: advancedNature,
            tipo_nfe: advancedTpNF,
            finalidade_nfe: advancedFinNFe,
            classificacao_destino: storeUf && customerForm.uf && storeUf !== customerForm.uf ? "interestadual" : "interna",
            participante: customerForm,
            itens: items.map((item) => ({
                codigo: item.codigo,
                descricao: item.descricao,
                ncm: item.ncm,
                cfop: item.cfop,
                unidade: item.unidade,
                quantidade: item.quantidade,
                valor_unitario: item.valorUnitario,
                origem: item.origem,
                csosn: item.csosn,
                cbenef: item.cbenef,
                ipi: { cst: item.ipiCst, cenq: item.ipiCEnq, base: item.ipiBase, aliquota: item.ipiAliquota, valor: item.ipiValor },
                pis: { cst: item.pisCst, base: item.pisBase, aliquota: item.pisAliquota, valor: item.pisValor },
                cofins: { cst: item.cofinsCst, base: item.cofinsBase, aliquota: item.cofinsAliquota, valor: item.cofinsValor },
            })),
            transporte: {
                modFrete,
                transportadora: carrierName,
                documento: carrierDoc,
                volumes,
                valor_frete: valorFrete,
                valor_seguro: valorSeguro,
            },
            campos_tecnicos: {
                indPres,
                indIntermed,
                indFinal,
                intermediadorCnpj,
                intermediadorId,
                meioPagamento: paymentMethod,
                valorDesconto,
                valorOutrasDespesas,
                referencedKey: onlyDigits(referencedKey),
            },
            observacoes: { infCpl, infAdFisco },
            total: Number((
                totalProdutos
                + valorFrete
                + valorSeguro
                + valorOutrasDespesas
                + items.reduce((sum, item) => sum + Number(item.ipiValor || 0), 0)
                - valorDesconto
            ).toFixed(2)),
        };
    }

    async function runAdvancedAudit() {
        const payload = buildAdvancedAuditPayload();
        setAiAuditLoading(true);
        setAdvancedAuditConfirmed(false);
        setError(null);
        try {
            for (let attempt = 1; attempt <= 6; attempt++) {
                setAiAuditAttempt(attempt);
                const result = await auditarNFeAssistidaComIaAction(payload, attempt);
                if (result.success && result.audit) {
                    setAiAudit(result.audit);
                    setAuditFingerprint(JSON.stringify(payload));
                    return true;
                }

                const canRetry = "retryable" in result && result.retryable === true;
                if (!canRetry) {
                    setError(result.error || "Não foi possível auditar a NF-e assistida.");
                    return false;
                }
            }

            setError("Nenhum provedor de IA concluiu a auditoria.");
            return false;
        } finally {
            setAiAuditAttempt(null);
            setAiAuditLoading(false);
        }
    }

    async function handleEmit() {
        const issues = getPendingIssues();
        if (issues.length > 0) {
            setError(`Antes de emitir a NF-e, resolva: ${issues.join(" ")}`);
            return;
        }

        const total = items.reduce((sum, item) => sum + Number(item.valorTotal || 0), 0);

        if (operation === "advanced") {
            const currentFingerprint = JSON.stringify(buildAdvancedAuditPayload());
            if (!aiAudit || auditFingerprint !== currentFingerprint) {
                await runAdvancedAudit();
                return;
            }
            if (!advancedAuditConfirmed) {
                setError("Confirme que revisou a auditoria com o contador antes de emitir.");
                return;
            }
        }

        setEmitting(true);
        setError(null);
        setSuccess(null);

        const result = await emitirNFe({
            storeId,
            environment,
            saleId: operation === "sale" ? selectedSale?.id : undefined,
            operation: operation === "bonus"
                ? "bonus"
                : operation === "return"
                    ? "return"
                    : operation === "shipment"
                        ? "shipment"
                        : operation === "transfer"
                            ? "transfer"
                        : operation === "advanced"
                            ? "advanced"
                        : "sale",
            referenceKey: operation === "return"
                ? selectedOrigin?.accessKey
                : operation === "shipment" && purpose.startsWith("Retorno")
                    ? selectedShipmentOrigin?.accessKey
                    : operation === "transfer" && purpose === "Retorno de deposito"
                        ? selectedDepositTransferOrigin?.accessKey
                    : operation === "advanced"
                        ? onlyDigits(referencedKey) || undefined
                    : undefined,
            finalidade_bonus: operation === "bonus"
                ? purpose as "Bonificacao" | "Brinde" | "Doacao"
                : undefined,
            finalidade_remessa: operation === "shipment"
                ? purpose as "Remessa para conserto" | "Retorno de conserto" | "Remessa em garantia" | "Retorno de garantia" | "Remessa para demonstracao" | "Retorno de demonstracao"
                : undefined,
            finalidade_transferencia: operation === "transfer"
                ? purpose as "Transferencia entre filiais" | "Transferencia para deposito" | "Retorno de deposito"
                : undefined,
            destinationStoreId: operation === "transfer" && purpose === "Transferencia entre filiais"
                ? selectedTransferStore?.id
                : undefined,
            advanced: operation === "advanced"
                ? {
                    audit_confirmed: advancedAuditConfirmed,
                    natureza_operacao: advancedNature,
                    tipo_nfe: advancedTpNF,
                    finalidade_nfe: advancedFinNFe,
                    ind_pres: indPres,
                    ind_intermed: indIntermed,
                    ind_final: indFinal,
                    meio_pagamento: paymentMethod,
                    mod_frete: modFrete,
                    transportadora: {
                        nome: carrierName,
                        cpf_cnpj: carrierDoc,
                        volumes,
                    },
                    intermediador: {
                        cnpj: intermediadorCnpj,
                        id_cadastro: intermediadorId,
                    },
                    valor_frete: valorFrete,
                    valor_seguro: valorSeguro,
                    valor_desconto: valorDesconto,
                    valor_outras_despesas: valorOutrasDespesas,
                    inf_cpl: infCpl,
                    inf_ad_fisco: infAdFisco,
                }
                : undefined,
            cliente: {
                nome: customerForm.nome,
                cpf_cnpj: customerForm.cpfCnpj,
                email: customerForm.email,
                endereco: {
                    logradouro: customerForm.logradouro,
                    numero: customerForm.numero,
                    complemento: customerForm.complemento,
                    bairro: customerForm.bairro,
                    cidade: customerForm.cidade,
                    uf: customerForm.uf,
                    cep: customerForm.cep,
                    codigo_municipio_ibge: customerForm.codigoMunicipioIbge,
                    inscricao_estadual: customerForm.inscricaoEstadual,
                },
            },
            itens: items.map((item) => ({
                codigo: item.codigo,
                descricao: item.descricao,
                ncm: item.ncm,
                cest: item.cest,
                cfop: getItemCfop(item),
                unidade: item.unidade,
                quantidade: Number(item.quantidade),
                valor_unitario: Number(item.valorUnitario),
                valor_total: Number(item.valorTotal),
                origem: item.origem,
                csosn: item.csosn,
                cbenef: item.cbenef,
                ipi_cst: item.ipiCst,
                ipi_cenq: item.ipiCEnq,
                ipi_base: item.ipiBase,
                ipi_aliquota: item.ipiAliquota,
                ipi_valor: item.ipiValor,
                pis_cst: item.pisCst,
                pis_base: item.pisBase,
                pis_aliquota: item.pisAliquota,
                pis_valor: item.pisValor,
                cofins_cst: item.cofinsCst,
                cofins_base: item.cofinsBase,
                cofins_aliquota: item.cofinsAliquota,
                cofins_valor: item.cofinsValor,
            })),
            valor_total: total,
            pagamentos: operation === "sale" ? [{ meio: paymentMethod, valor: total }] : [],
        });

        setEmitting(false);

        if (result.success) {
            setSuccess(result.message || `NF-e enviada em ${environmentLabel}.`);
            setTimeout(() => router.push(`/dashboard/loja/${storeId}/fiscal`), 900);
            return;
        }

        setError(result.error || "Erro desconhecido ao emitir NF-e.");
    }

    function goBack() {
        const index = STEPS.findIndex((item) => item.id === step);
        if (index > 0) setStep(STEPS[index - 1].id);
    }

    function goNext() {
        const index = STEPS.findIndex((item) => item.id === step);
        if (index < STEPS.length - 1) setStep(STEPS[index + 1].id);
    }

    if (!modules.fiscal) {
        return <ModuleDisabledState storeId={storeId} moduleLabel="Fiscal" backHref={`/dashboard/loja/${storeId}/fiscal`} />;
    }

    const totalProdutos = items.reduce((sum, item) => sum + Number(item.valorTotal || 0), 0);
    const total = operation === "advanced"
        ? totalProdutos
            + valorFrete
            + valorSeguro
            + valorOutrasDespesas
            + items.reduce((sum, item) => sum + Number(item.ipiValor || 0), 0)
            - valorDesconto
        : totalProdutos;
    const stepIndex = STEPS.findIndex((item) => item.id === step);
    const currentOperation = OPERATIONS.find((item) => item.id === operation) || OPERATIONS[0];
    const pendingIssues = getPendingIssues();
    const shipmentOrigins = purpose === "Retorno de demonstracao"
        ? (Array.isArray(demonstrationOrigins) ? demonstrationOrigins : [])
        : purpose === "Retorno de garantia"
            ? (Array.isArray(garantiaOrigins) ? garantiaOrigins : [])
            : (Array.isArray(consertoOrigins) ? consertoOrigins : []);
    const participantLocked = operation === "return"
        || (operation === "shipment" && purpose.startsWith("Retorno"))
        || (operation === "transfer" && (purpose === "Transferencia entre filiais" || purpose === "Retorno de deposito"));
    const itemsLocked = operation === "return"
        || (operation === "shipment" && purpose.startsWith("Retorno"))
        || (operation === "transfer" && purpose === "Retorno de deposito");
    const filteredSales = pendingSales
        .filter((sale) => {
            const term = saleSearch.trim().toLowerCase();
            if (!term) return true;
            return (
                String(sale.id).includes(term) ||
                (sale.clients?.nome || "").toLowerCase().includes(term) ||
                (sale.clients?.cpf_cnpj || "").replace(/\D/g, "").includes(term.replace(/\D/g, ""))
            );
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return (
        <div className="mx-auto max-w-7xl space-y-5 pb-32 p-6">
            <div className="space-y-3">
                <div className="flex items-center gap-3">
                    <Link href={`/dashboard/loja/${storeId}/fiscal`}>
                        <button className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-slate-300 border border-white/10 transition hover:bg-white/10">
                            <ArrowLeft size={18} />
                        </button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tight uppercase">Emissão completa de NF-e</h1>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[260px_1fr_320px] lg:items-center">
                    <div className="hidden lg:block" />
                    <div className="flex items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={() => setSaleModalOpen(true)}
                            className="inline-flex items-center gap-2 rounded-xl bg-[#FACC15] px-3 py-2 text-xs font-black text-[#1A1A1A] shadow-sm transition hover:bg-yellow-300"
                        >
                            <Search size={14} />
                            Buscar venda
                        </button>
                        <button
                            type="button"
                            onClick={() => setCloneModalOpen(true)}
                            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs font-black text-slate-200 shadow-sm transition hover:border-[#FACC15] hover:bg-white/10"
                        >
                            <Copy size={14} />
                            Clonar nota
                        </button>
                    </div>
                    <div className={`flex w-fit items-center gap-1 rounded-xl border p-1 shadow-sm lg:justify-self-end ${
                        environment === "production"
                            ? "border-green-400/30 bg-green-400/10 text-green-200"
                            : "border-yellow-400/30 bg-yellow-400/10 text-yellow-200"
                    }`}>
                        <span className="rounded-lg px-4 py-2 text-xs font-black uppercase tracking-[0.16em]">{environmentLabel}</span>
                    </div>
                </div>
            </div>

            {(error || success) && (
                <div className={`rounded-2xl border px-5 py-4 text-sm flex items-start gap-3 ${
                    success ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-200" : "bg-red-500/10 border-red-500/30 text-red-200"
                }`}>
                    {success ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                    <span>{success || error}</span>
                </div>
            )}

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr_320px]">
                <aside className="space-y-3">
                    <div className="rounded-2xl border border-white/5 bg-black/40 p-3 shadow-sm">
                        {STEPS.map((item, index) => {
                            const active = item.id === step;
                            const done = index < stepIndex;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setStep(item.id)}
                                    className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition last:mb-0 ${
                                        active ? "bg-amber-500 text-black" : "text-slate-300 hover:bg-white/5"
                                    }`}
                                >
                                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                                        active ? "bg-[#FACC15] text-white" : done ? "bg-stone-900 text-white" : "bg-white/10 text-slate-400"
                                    }`}>
                                        {done ? <CheckCircle size={14} /> : index + 1}
                                    </span>
                                    <span className="flex-1 text-sm font-black">{item.label}</span>
                                    {item.id === "review" && pendingIssues.length > 0 && <AlertCircle size={14} className={active ? "text-[#FACC15]" : "text-red-400"} />}
                                </button>
                            );
                        })}
                    </div>

                </aside>

                <main className="min-h-[640px] rounded-2xl border border-white/5 bg-black/40 p-5 shadow-sm">
                    {clonedFrom && (
                        <div className="mb-5 flex items-start justify-between gap-3 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
                            <div>
                                <p className="text-sm font-black text-blue-300">
                                    Rascunho clonado da NF-e {clonedFrom.numero || "-"}
                                    {clonedFrom.serie ? `, serie ${clonedFrom.serie}` : ""}.
                                </p>
                                <p className="mt-1 text-xs font-medium text-blue-400">
                                    Número, chave e protocolo anteriores não serao reutilizados. Revise os campos antes de emitir.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setClonedFrom(null)}
                                className="shrink-0 rounded-xl border border-blue-500/20 bg-black/40 px-3 py-2 text-xs font-black text-blue-400 hover:bg-blue-500/10"
                            >
                                Ocultar aviso
                            </button>
                        </div>
                    )}

                    {step === "operation" && (
                        <section className="space-y-5">
                            <div>
                                <h2 className="text-lg font-black text-white">Tipo de operação</h2>
                                <p className="text-sm text-slate-400">As operações serão transmitidas em {environmentLabel}.</p>
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                {OPERATIONS.map((item) => {
                                    const Icon = item.icon;
                                    const active = operation === item.id;
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => {
                                                setOperation(item.id);
                                                setPurpose(item.purposes[0]);
                                                setSelectedSale(null);
                                                setSelectedOrigin(null);
                                                setSelectedShipmentOrigin(null);
                                                setSelectedTransferStore(null);
                                                setSelectedDepositTransferOrigin(null);
                                                if (item.id === "advanced") setPaymentMethod("90");
                                            }}
                                            className={`rounded-2xl border p-4 text-left transition ${
                                                active ? "border-[#FACC15] bg-[#FACC15]/10 shadow-sm" : "border-white/10 hover:border-stone-300 hover:bg-white/5"
                                            } ${!item.enabled ? "opacity-70" : ""}`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? "bg-amber-500 text-black" : "bg-white/10 text-slate-400"}`}>
                                                    <Icon size={20} />
                                                </div>
                                                <div>
                                                    <p className="font-black text-white">{item.title}</p>
                                                    <p className="mt-1 text-xs font-medium text-slate-400">{item.subtitle}</p>
                                                    {!item.enabled && <p className="mt-2 text-[10px] font-black uppercase text-orange-500">A portar</p>}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {operation !== "advanced" && (
                                <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
                                    <label className={labelClass}>Finalidade especifica</label>
                                    <select
                                        value={purpose}
                                        onChange={(e) => {
                                            setPurpose(e.target.value);
                                            setSelectedShipmentOrigin(null);
                                            setSelectedTransferStore(null);
                                            setSelectedDepositTransferOrigin(null);
                                        }}
                                        className={fieldClass}
                                    >
                                            {currentOperation.purposes.map((item) => (
                                                <option key={item} value={item}>{purposeLabel(item)}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {operation === "advanced" && (
                                <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-500/10 p-4">
                                    <div>
                                        <p className="text-sm font-black text-amber-400">Operação assistida em {environmentLabel}</p>
                                        <p className="mt-1 text-xs font-medium text-amber-300">
                                            Preencha conforme orientacao contabil. A IA revisa consistencia, mas não substitui o contador.
                                        </p>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Natureza da operação</label>
                                        <input
                                            value={advancedNature}
                                            onChange={(e) => setAdvancedNature(e.target.value)}
                                            placeholder="Ex.: REMESSA PARA EXPOSICAO"
                                            className={fieldClass}
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                        <div>
                                            <label className={labelClass}>Tipo da NF-e</label>
                                            <select value={advancedTpNF} onChange={(e) => setAdvancedTpNF(Number(e.target.value) as 0 | 1)} className={fieldClass}>
                                                <option value={1}>1 - Saida</option>
                                                <option value={0}>0 - Entrada</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className={labelClass}>Finalidade da NF-e</label>
                                            <select value={advancedFinNFe} onChange={(e) => setAdvancedFinNFe(Number(e.target.value) as 1 | 2 | 3 | 4)} className={fieldClass}>
                                                <option value={1}>1 - Normal</option>
                                                <option value={2}>2 - Complementar</option>
                                                <option value={3}>3 - Ajuste</option>
                                                <option value={4}>4 - Devolução</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {operation === "advanced" && (
                                <div className="rounded-2xl border border-orange-500/20 bg-orange-500/10 p-4">
                                    <button
                                        type="button"
                                        onClick={() => setAdvancedOriginPanelOpen((current) => !current)}
                                        className="flex w-full items-center justify-between rounded-xl border border-orange-500/20 bg-black/40 px-3 py-3 text-left transition hover:bg-orange-500/20"
                                    >
                                        <span>
                                            <span className="block text-sm font-black text-orange-300">Nota de origem</span>
                                            <span className="mt-0.5 block text-xs font-medium text-orange-400">
                                                Opcional, para operacoes que precisam referenciar outra NF-e.
                                            </span>
                                        </span>
                                        <ChevronRight
                                            size={16}
                                            className={`shrink-0 text-orange-400 transition ${advancedOriginPanelOpen ? "rotate-90" : ""}`}
                                        />
                                    </button>

                                    {advancedOriginPanelOpen && (
                                        <div className="mt-4">
                                            <label className="ml-1 text-[10px] font-black uppercase tracking-wider text-orange-600">
                                                Chave de acesso da NF-e de origem
                                            </label>
                                            <input
                                                value={referencedKey}
                                                onChange={(e) => setReferencedKey(onlyDigits(e.target.value).slice(0, 44))}
                                                inputMode="numeric"
                                                maxLength={44}
                                                placeholder="44 digitos"
                                                className="mt-1 w-full rounded-xl border border-orange-500/20 bg-black/40 px-3 py-2 text-sm font-bold outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
                                            />
                                            <div className="mt-2 flex items-center justify-between gap-3 text-[10px] font-bold text-orange-400">
                                                <span>Informe somente quando a operação exigir referencia fiscal.</span>
                                                <span className="shrink-0">{onlyDigits(referencedKey).length}/44</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {operation === "sale" && (
                                <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4">
                                    <div>
                                        <p className="text-sm font-black text-blue-300">
                                            {selectedSale ? `Venda #${selectedSale.id} selecionada` : "NF-e avulsa"}
                                        </p>
                                        <p className="mt-1 text-xs font-medium text-blue-400">
                                            {selectedSale
                                                ? `${selectedSale.clients?.nome || "Cliente não informado"} | ${money(selectedSale.total)}`
                                                : "Nenhuma venda foi vinculada. Participante e itens serao preenchidos manualmente."}
                                        </p>
                                    </div>
                                    {selectedSale && (
                                        <div className="mt-4">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    resetToManual();
                                                    setOperation("sale");
                                                    setPurpose("Venda comum");
                                                }}
                                                className="rounded-xl border border-blue-500/20 bg-black/40 px-3 py-2 text-xs font-black text-blue-400 hover:bg-blue-500/10"
                                            >
                                                Remover vinculo
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {operation === "return" && (
                                <div className="rounded-2xl border border-amber-200 bg-amber-500/10 p-4">
                                    <div>
                                        <p className="text-sm font-black text-amber-300">NF-e de entrada importada</p>
                                        <p className="mt-1 text-xs font-medium text-amber-300">
                                            O fornecedor, os produtos e a chave referenciada serao carregados do XML original.
                                        </p>
                                    </div>

                                    {purpose === "Devolucao de venda" ? (
                                        <p className="mt-4 rounded-xl border border-orange-500/20 bg-black/40 px-4 py-3 text-xs font-bold text-orange-400">
                                            Devolução de venda ainda não está liberada. Selecione Devolução de compra.
                                        </p>
                                    ) : (
                                        <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                                            {importedOrigins.length === 0 ? (
                                                <p className="rounded-xl bg-black/40 px-4 py-4 text-center text-xs font-bold text-slate-400">
                                                    Nenhuma NF-e de entrada importada foi encontrada nesta loja.
                                                </p>
                                            ) : importedOrigins.map((origin) => (
                                                <button
                                                    key={origin.id}
                                                    type="button"
                                                    onClick={() => void selectImportedOrigin(origin)}
                                                    disabled={loadingOriginKey !== null}
                                                    className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${
                                                        selectedOrigin?.id === origin.id
                                                            ? "border-[#FACC15] bg-[#FACC15]/10"
                                                            : "border-amber-100 bg-black/40 hover:border-amber-300"
                                                    }`}
                                                >
                                                    <span>
                                                        <span className="block text-xs font-black text-white">
                                                            NF {origin.number || "-"} | {origin.issuerName || "Fornecedor"}
                                                        </span>
                                                        <span className="mt-1 block text-[10px] font-bold text-slate-400">
                                                            {origin.issuedAt ? new Date(origin.issuedAt).toLocaleDateString("pt-BR") : "Data não informada"}
                                                            {" | "}
                                                            {origin.issuerCnpj || "CNPJ não informado"}
                                                        </span>
                                                    </span>
                                                    <span className="flex items-center gap-2 text-xs font-black text-white">
                                                        {money(origin.total)}
                                                        {loadingOriginKey === origin.accessKey && <Loader2 size={14} className="animate-spin" />}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {operation === "shipment" && purpose.startsWith("Retorno") && (
                                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                                    <div>
                                        <p className="text-sm font-black text-cyan-950">
                                            {purpose === "Retorno de demonstracao"
                                                ? "Remessa de demonstração recebida"
                                                : "Remessa autorizada de origem"}
                                        </p>
                                        <p className="mt-1 text-xs font-medium text-cyan-400">
                                            {purpose === "Retorno de demonstracao"
                                                ? "Selecione uma NF-e de entrada importada com CFOP 5912/6912. Participante, itens e chave NFref serao carregados automaticamente."
                                                : "Selecione a remessa correspondente. Participante, itens e chave NFref serao carregados automaticamente."}
                                        </p>
                                    </div>

                                    <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                                        {shipmentOrigins.length === 0 ? (
                                            <p className="rounded-xl bg-black/40 px-4 py-4 text-center text-xs font-bold text-slate-400">
                                                {purpose === "Retorno de demonstracao"
                                                    ? "Nenhuma remessa para demonstração foi encontrada nas NF-e de entrada importadas."
                                                    : `Nenhuma remessa autorizada deste tipo foi encontrada em ${environmentLabel}.`}
                                            </p>
                                        ) : shipmentOrigins.map((origin) => (
                                            <button
                                                key={origin.id}
                                                type="button"
                                                onClick={() => void (purpose === "Retorno de demonstracao"
                                                    ? selectDemonstrationOrigin(origin)
                                                    : selectShipmentOrigin(origin))}
                                                disabled={loadingOriginKey !== null}
                                                className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${
                                                    selectedShipmentOrigin?.id === origin.id
                                                        ? "border-[#FACC15] bg-[#FACC15]/10"
                                                        : "border-cyan-100 bg-black/40 hover:border-cyan-300"
                                                }`}
                                            >
                                                <span>
                                                    <span className="block text-xs font-black text-white">
                                                        NF {origin.number || "-"} | {origin.recipientName || "Destinatário"}
                                                    </span>
                                                    <span className="mt-1 block text-[10px] font-bold text-slate-400">
                                                        {origin.issuedAt ? new Date(origin.issuedAt).toLocaleDateString("pt-BR") : "Data não informada"}
                                                        {" | "}
                                                        {origin.recipientCnpj || "Documento não informado"}
                                                    </span>
                                                </span>
                                                <span className="flex items-center gap-2 text-xs font-black text-white">
                                                    {money(origin.total)}
                                                    {loadingOriginKey === origin.accessKey && <Loader2 size={14} className="animate-spin" />}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {operation === "transfer" && purpose === "Transferencia entre filiais" && (
                                <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4">
                                    <p className="text-sm font-black text-violet-950">Filial de destino</p>
                                    <p className="mt-1 text-xs font-medium text-violet-400">
                                        Apenas lojas do mesmo tenant podem ser selecionadas. Os dados fiscais serao relidos no servidor.
                                    </p>
                                    <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                                        {transferStores.length === 0 ? (
                                            <p className="rounded-xl bg-black/40 px-4 py-4 text-center text-xs font-bold text-slate-400">
                                                Nenhuma outra filial foi encontrada neste tenant.
                                            </p>
                                        ) : transferStores.map((store) => (
                                            <button
                                                key={store.id}
                                                type="button"
                                                onClick={() => void selectTransferStore(store)}
                                                disabled={loadingOriginKey !== null}
                                                className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${
                                                    selectedTransferStore?.id === store.id
                                                        ? "border-[#FACC15] bg-[#FACC15]/10"
                                                        : "border-violet-100 bg-black/40 hover:border-violet-300"
                                                }`}
                                            >
                                                <span>
                                                    <span className="block text-xs font-black text-white">{store.razao_social || store.name}</span>
                                                    <span className="mt-1 block text-[10px] font-bold text-slate-400">
                                                        {store.cnpj || "CNPJ não informado"} | {[store.city, store.state].filter(Boolean).join(" - ") || "Endereço incompleto"}
                                                    </span>
                                                </span>
                                                {loadingOriginKey === `store-${store.id}` && <Loader2 size={14} className="animate-spin" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {operation === "transfer" && purpose === "Transferencia para deposito" && (
                                <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4 text-xs font-bold text-violet-400">
                                    O deposito sera informado como participante cadastrado na proxima etapa. A operação usa CFOP 5905/6905 e não gera cobrança.
                                </div>
                            )}

                            {operation === "transfer" && purpose === "Retorno de deposito" && (
                                <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4">
                                    <p className="text-sm font-black text-violet-950">Remessa para deposito recebida</p>
                                    <p className="mt-1 text-xs font-medium text-violet-400">
                                        Selecione uma NF-e de entrada importada com CFOP 5905/6905. O retorno usa CFOP 5906/6906.
                                    </p>
                                    <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                                        {depositTransferOrigins.length === 0 ? (
                                            <p className="rounded-xl bg-black/40 px-4 py-4 text-center text-xs font-bold text-slate-400">
                                                Nenhuma remessa para deposito importada foi encontrada nesta loja.
                                            </p>
                                        ) : depositTransferOrigins.map((origin) => (
                                            <button
                                                key={origin.id}
                                                type="button"
                                                onClick={() => void selectDepositTransferOrigin(origin)}
                                                disabled={loadingOriginKey !== null}
                                                className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${
                                                    selectedDepositTransferOrigin?.id === origin.id
                                                        ? "border-[#FACC15] bg-[#FACC15]/10"
                                                        : "border-violet-100 bg-black/40 hover:border-violet-300"
                                                }`}
                                            >
                                                <span>
                                                    <span className="block text-xs font-black text-white">
                                                        NF {origin.number || "-"} | {origin.recipientName || "Deposito"}
                                                    </span>
                                                    <span className="mt-1 block text-[10px] font-bold text-slate-400">
                                                        {origin.issuedAt ? new Date(origin.issuedAt).toLocaleDateString("pt-BR") : "Data não informada"}
                                                        {" | "}
                                                        {origin.recipientCnpj || "Documento não informado"}
                                                    </span>
                                                </span>
                                                <span className="flex items-center gap-2 text-xs font-black text-white">
                                                    {money(origin.total)}
                                                    {loadingOriginKey === origin.accessKey && <Loader2 size={14} className="animate-spin" />}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </section>
                    )}

                    {step === "participant" && (
                        <section className="space-y-5" onBlur={handleParticipantCardBlur}>
                            <div>
                                <h2 className="text-lg font-black text-white">Participante da nota</h2>
                                <p className="text-sm text-slate-400">
                                    {participantLocked
                                        ? "Nesta operação, o participante vem da NF-e de origem e não pode ser trocado."
                                        : "Busque um cadastro existente ou preencha um novo participante."}
                                </p>
                            </div>

                            {!participantLocked && (
                            <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-1 shadow-sm">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setParticipantMode("search");
                                        setHideParticipantResults(false);
                                        setParticipantDirty(false);
                                        setParticipantSaveState("idle");
                                        setParticipantSaveMessage("");
                                    }}
                                    className={`rounded-xl px-4 py-2 text-xs font-black transition ${participantMode === "search" ? "bg-amber-500 text-black shadow-sm" : "text-slate-200 hover:bg-black/40"}`}
                                >
                                    Buscar cadastro
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setParticipantMode("manual");
                                        setSelectedParticipantId(null);
                                        setHideParticipantResults(false);
                                        setParticipantDirty(false);
                                        setParticipantSaveState("idle");
                                        setParticipantSaveMessage("");
                                    }}
                                    className={`rounded-xl px-4 py-2 text-xs font-black transition ${participantMode === "manual" ? "bg-amber-500 text-black shadow-sm" : "text-slate-200 hover:bg-black/40"}`}
                                >
                                    Novo participante
                                </button>
                            </div>
                            )}

                            {!participantLocked && participantMode === "search" && (
                                <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
                                    <label className={labelClass}>Buscar por nome, CPF/CNPJ ou telefone</label>
                                    <div className="relative mt-1">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                                        <input
                                            value={participantSearch}
                                            onChange={(event) => {
                                                setParticipantSearch(event.target.value);
                                                setHideParticipantResults(false);
                                            }}
                                            className="w-full rounded-xl border border-white/5 bg-black/40 py-2.5 pl-9 pr-3 text-sm font-semibold text-white outline-none transition focus:border-[#FACC15] focus:ring-2 focus:ring-yellow-100"
                                            placeholder="Ex: Maria, 000.000.000-00 ou telefone"
                                        />
                                    </div>

                                    <div className="mt-3 max-h-64 overflow-y-auto space-y-2">
                                        {participantLoading ? (
                                            <div className="flex items-center gap-2 rounded-xl bg-black/40 px-3 py-3 text-xs font-bold text-slate-500">
                                                <Loader2 size={14} className="animate-spin" /> Buscando cadastros...
                                            </div>
                                        ) : hideParticipantResults ? null : participantSearch.trim().length < 2 ? (
                                            <p className="rounded-xl bg-black/40 px-3 py-3 text-xs font-bold text-slate-500">Digite pelo menos 2 caracteres para buscar.</p>
                                        ) : participantResults.length === 0 ? (
                                            <p className="rounded-xl bg-black/40 px-3 py-3 text-xs font-bold text-slate-500">Nenhum cadastro encontrado. Use &quot;Novo participante&quot;.</p>
                                        ) : (
                                            participantResults.map((participant) => (
                                                <button
                                                    key={participant.id}
                                                    type="button"
                                                    onClick={() => selectParticipant(participant)}
                                                    className={`w-full rounded-xl border p-3 text-left transition ${selectedParticipantId === participant.id ? "border-[#FACC15] bg-[#FACC15]/10" : "border-white/5 bg-black/40 hover:bg-white/10"}`}
                                                >
                                                    <p className="text-sm font-black text-white">{participant.full_name}</p>
                                                    <p className="mt-1 text-[10px] font-bold text-slate-400">
                                                        {participant.cpf || "Sem CPF"} {participant.fone_movel || participant.phone ? `| ${participant.fone_movel || participant.phone}` : ""}
                                                    </p>
                                                    <p className="mt-1 text-[10px] font-medium text-slate-500">
                                                        {[participant.rua, participant.numero, participant.bairro, participant.cidade, participant.uf].filter(Boolean).join(", ") || "Endereço não cadastrado"}
                                                    </p>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            <fieldset
                                disabled={participantLocked}
                                className={`rounded-2xl border border-white/5 bg-black/40 p-4 ${participantLocked ? "opacity-80" : ""}`}
                            >
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-black text-white">Dados do participante</h3>
                                        <p className="text-xs text-slate-400">Revise e complete antes de emitir.</p>
                                    </div>
                                    {selectedParticipantId && <span className="rounded-full bg-green-500/10 px-3 py-1 text-[10px] font-black uppercase text-green-400">Cadastro selecionado</span>}
                                </div>

                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <Field label="Nome / Razao Social" value={customerForm.nome} onChange={(v) => updateCustomerForm("nome", v)} />
                                    <Field label="CPF / CNPJ" value={customerForm.cpfCnpj} onChange={(v) => updateCustomerForm("cpfCnpj", v)} />
                                    <Field label="Email" value={customerForm.email} onChange={(v) => updateCustomerForm("email", v)} />
                                    <Field label="Inscrição Estadual (se houver)" value={customerForm.inscricaoEstadual} onChange={(v) => updateCustomerForm("inscricaoEstadual", v)} />
                                </div>

                                <div className="mt-4 rounded-2xl border border-white/5 bg-white/5 p-4">
                                    <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-white"><MapPin size={16} /> Endereço fiscal</h3>
                                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
                                        <div className="xl:col-span-3">
                                            <Field
                                                label={cepLoading ? "CEP buscando..." : "CEP"}
                                                value={customerForm.cep}
                                                onChange={(v) => updateCustomerForm("cep", v)}
                                            />
                                        </div>
                                        <div className="xl:col-span-6"><Field label="Logradouro" value={customerForm.logradouro} onChange={(v) => updateCustomerForm("logradouro", v)} /></div>
                                        <div className="xl:col-span-3"><Field label="Número" value={customerForm.numero} onChange={(v) => updateCustomerForm("numero", v)} /></div>
                                        <div className="xl:col-span-6"><Field label="Complemento" value={customerForm.complemento} onChange={(v) => updateCustomerForm("complemento", v)} /></div>
                                        <div className="xl:col-span-6"><Field label="Bairro" value={customerForm.bairro} onChange={(v) => updateCustomerForm("bairro", v)} /></div>
                                        <div className="xl:col-span-5"><Field label="Cidade" value={customerForm.cidade} onChange={(v) => updateCustomerForm("cidade", v)} /></div>
                                        <div className="xl:col-span-2"><Field label="UF" value={customerForm.uf} onChange={(v) => updateCustomerForm("uf", v.toUpperCase().slice(0, 2))} /></div>
                                        <div className="xl:col-span-5"><Field label="Código IBGE" value={customerForm.codigoMunicipioIbge} onChange={(v) => updateCustomerForm("codigoMunicipioIbge", onlyDigits(v).slice(0, 7))} /></div>
                                    </div>
                                    {participantSaveState !== "idle" && (
                                        <p className={`mt-3 text-xs font-bold ${participantSaveState === "error" ? "text-red-600" : participantSaveState === "saving" ? "text-slate-400" : "text-green-400"}`}>
                                            {participantSaveState === "saving" ? "Salvando cliente..." : participantSaveMessage}
                                        </p>
                                    )}
                                </div>
                            </fieldset>
                        </section>
                    )}

                    {step === "items" && (
                        <section className="space-y-5">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-black text-white">Itens</h2>
                                    <p className="text-sm text-slate-400">Produtos/mercadorias que serao enviados no XML.</p>
                                </div>
                                {!itemsLocked && (
                                    <button type="button" onClick={addItem} className="rounded-xl bg-[#1A1A1A] px-4 py-2 text-xs font-black text-[#FACC15] transition hover:bg-black">
                                        Adicionar item
                                    </button>
                                )}
                            </div>

                            <div className="space-y-4">
                                {items.map((item, index) => (
                                    <div key={index} className="rounded-3xl border border-white/5 bg-white/5 p-5">
                                        <div className="space-y-4">
                                            <fieldset disabled={itemsLocked} className={itemsLocked ? "opacity-80" : ""}>
                                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:items-end">
                                                <div className="xl:col-span-7">
                                                    <ProductField
                                                        label="Descrição"
                                                        storeId={storeId}
                                                        value={item.descricao}
                                                        onChange={(value) => updateItem(index, {
                                                            descricao: value,
                                                            productId: undefined,
                                                        })}
                                                        onSelect={(product) => updateItem(index, {
                                                            productId: Number(product.id),
                                                            codigo: String(product.id),
                                                            descricao: product.nome,
                                                            ncm: product.ncm || "",
                                                            cfop: product.cfop || "5102",
                                                            unidade: product.unidade || "UN",
                                                            valorUnitario: Number(product.preco_venda || 0),
                                                            valorTotal: Number(product.preco_venda || 0) * Number(item.quantidade || 1),
                                                        })}
                                                    />
                                                </div>
                                                <div className="xl:col-span-4">
                                                    <NcmField
                                                        value={item.ncm}
                                                        onChange={(value) => {
                                                            updateItem(index, { ncm: onlyDigits(value).slice(0, 8) });
                                                            setNcmAiStatus(null);
                                                        }}
                                                        onBlur={() => persistProductNcm(index, item.ncm)}
                                                        onFetch={() => fetchNcmSuggestion(index)}
                                                        loading={ncmAiLoadingIndex === index}
                                                        status={ncmAiStatus?.itemIndex === index ? ncmAiStatus : null}
                                                    />
                                                </div>
                                                <div className="xl:col-span-1 flex justify-end">
                                                    <button type="button" onClick={() => removeItem(index)} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black/40 text-slate-500 transition hover:bg-red-500/10 hover:text-red-500">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                            {ncmOptions?.itemIndex === index && (
                                                <div className="rounded-2xl border border-yellow-100 bg-black/40 p-3">
                                                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Escolha o NCM sugerido</p>
                                                    <div className="mt-2 grid gap-2 md:grid-cols-3">
                                                        {ncmOptions.options.map((option) => (
                                                            <button
                                                                key={option.code}
                                                            type="button"
                                                            onClick={() => {
                                                                const ncm = onlyDigits(option.code).slice(0, 8);
                                                                updateItem(index, { ncm });
                                                                void persistProductNcm(index, ncm);
                                                                setNcmOptions(null);
                                                            }}
                                                                className="rounded-2xl border border-white/5 bg-white/5 p-3 text-left transition hover:border-[#FACC15] hover:bg-white/10"
                                                            >
                                                                <p className="text-sm font-black text-white">{option.code}</p>
                                                                <p className="mt-1 line-clamp-2 text-[10px] font-semibold text-slate-400">{option.description}</p>
                                                                <p className="mt-2 text-[10px] font-black text-amber-700">{Math.round(option.confidence || 0)}% confianca</p>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            </fieldset>
                                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12 xl:items-start">
                                                <div className="xl:col-span-2">
                                                    {operation === "advanced" ? (
                                                        <Field
                                                            label="CFOP"
                                                            value={getItemCfop(item)}
                                                            onChange={(v) => updateItem(index, { cfop: onlyDigits(v).slice(0, 4) })}
                                                            title="CFOP liberado para outra operação."
                                                            align="right"
                                                        />
                                                    ) : (
                                                        <DisplayField
                                                            label="CFOP"
                                                            value={getItemCfop(item)}
                                                            align="right"
                                                            title="CFOP calculado pela UF da loja e do participante."
                                                        />
                                                    )}
                                                </div>
                                                <div className="xl:col-span-2">
                                                    <UnitSelect value={item.unidade} onChange={(value) => updateItem(index, { unidade: value })} disabled={itemsLocked} align="right" />
                                                </div>
                                                <div className="xl:col-span-2">
                                                    <NumberField
                                                        label={itemsLocked ? `Qtd (max. ${item.maxQuantity || item.quantidade})` : "Qtd"}
                                                        value={item.quantidade}
                                                        onChange={(v) => updateItem(index, { quantidade: v })}
                                                        max={itemsLocked ? item.maxQuantity : undefined}
                                                        align="right"
                                                    />
                                                </div>
                                                <div className="xl:col-span-3">
                                                    <CurrencyField
                                                        label="Unit."
                                                        value={item.valorUnitario}
                                                        onChange={(v) => updateItem(index, { valorUnitario: v })}
                                                        disabled={itemsLocked}
                                                        align="right"
                                                    />
                                                </div>
                                                <div className="xl:col-span-3">
                                                    <DisplayField label="Total" value={money(item.valorTotal)} />
                                                </div>
                                            </div>
                                            {operation === "advanced" && (
                                                <div className="space-y-4 rounded-2xl border border-amber-200 bg-black/40 p-4">
                                                    <p className="text-[11px] font-black uppercase tracking-wider text-amber-300">Tributacao assistida do item</p>
                                                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                                        <NumberField label="Origem (0-8)" value={Number(item.origem || 0)} onChange={(v) => updateItem(index, { origem: v })} />
                                                        <div>
                                                            <label className={labelClass}>CSOSN</label>
                                                            <select value={item.csosn || "102"} onChange={(e) => updateItem(index, { csosn: e.target.value })} className={fieldClass}>
                                                                {["101", "102", "103", "201", "202", "203", "300", "400", "500", "900"].map((code) => (
                                                                    <option key={code} value={code}>{code}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <Field label="CEST" value={item.cest || ""} onChange={(v) => updateItem(index, { cest: onlyDigits(v).slice(0, 7) })} />
                                                        <Field label="cBenef" value={item.cbenef || ""} onChange={(v) => updateItem(index, { cbenef: v.trim().slice(0, 10) })} />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                                                        <Field label="IPI CST" value={item.ipiCst || ""} onChange={(v) => updateItem(index, { ipiCst: onlyDigits(v).slice(0, 2) })} />
                                                        <Field label="IPI cEnq" value={item.ipiCEnq || "999"} onChange={(v) => updateItem(index, { ipiCEnq: onlyDigits(v).slice(0, 3) })} />
                                                        <NumberField label="IPI base" value={Number(item.ipiBase || 0)} onChange={(v) => updateItem(index, { ipiBase: v })} />
                                                        <NumberField label="IPI %" value={Number(item.ipiAliquota || 0)} onChange={(v) => updateItem(index, { ipiAliquota: v })} />
                                                        <NumberField label="IPI valor" value={Number(item.ipiValor || 0)} onChange={(v) => updateItem(index, { ipiValor: v })} />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                                        <Field label="PIS CST" value={item.pisCst || "99"} onChange={(v) => updateItem(index, { pisCst: onlyDigits(v).slice(0, 2) })} />
                                                        <NumberField label="PIS base" value={Number(item.pisBase || 0)} onChange={(v) => updateItem(index, { pisBase: v })} />
                                                        <NumberField label="PIS %" value={Number(item.pisAliquota || 0)} onChange={(v) => updateItem(index, { pisAliquota: v })} />
                                                        <NumberField label="PIS valor" value={Number(item.pisValor || 0)} onChange={(v) => updateItem(index, { pisValor: v })} />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                                        <Field label="COFINS CST" value={item.cofinsCst || "99"} onChange={(v) => updateItem(index, { cofinsCst: onlyDigits(v).slice(0, 2) })} />
                                                        <NumberField label="COFINS base" value={Number(item.cofinsBase || 0)} onChange={(v) => updateItem(index, { cofinsBase: v })} />
                                                        <NumberField label="COFINS %" value={Number(item.cofinsAliquota || 0)} onChange={(v) => updateItem(index, { cofinsAliquota: v })} />
                                                        <NumberField label="COFINS valor" value={Number(item.cofinsValor || 0)} onChange={(v) => updateItem(index, { cofinsValor: v })} />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {step === "transport" && (
                        <section className="space-y-5">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-slate-300">
                                    <Truck size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-white">Transporte e observações</h2>
                                    <p className="text-sm text-slate-400">Parametros adicionais que seguem no XML da NF-e.</p>
                                </div>
                            </div>

                            {operation !== "advanced" ? (
                                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm font-semibold text-slate-300">
                                    Os templates guiados continuam usando sem ocorrência de transporte e suas observações padrão.
                                </div>
                            ) : (
                                <>
                                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                        <label className={labelClass}>Modalidade do frete</label>
                                        <select value={modFrete} onChange={(e) => setModFrete(Number(e.target.value))} className={fieldClass}>
                                            <option value={9}>9 - Sem transporte</option>
                                            <option value={0}>0 - Por conta do emitente</option>
                                            <option value={1}>1 - Por conta do destinatário</option>
                                            <option value={2}>2 - Por conta de terceiros</option>
                                            <option value={3}>3 - Proprio por conta do remetente</option>
                                            <option value={4}>4 - Proprio por conta do destinatário</option>
                                        </select>
                                        {modFrete !== 9 && (
                                            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                                                <Field label="Transportadora" value={carrierName} onChange={setCarrierName} />
                                                <Field label="CPF/CNPJ" value={carrierDoc} onChange={(v) => setCarrierDoc(onlyDigits(v).slice(0, 14))} />
                                                <NumberField label="Volumes" value={volumes} onChange={setVolumes} />
                                            </div>
                                        )}
                                    </div>

                                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                        <p className="text-sm font-black text-white">Parametros fiscais</p>
                                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                                            <div>
                                                <label className={labelClass}>Presença</label>
                                                <select value={indPres} onChange={(e) => setIndPres(Number(e.target.value))} className={fieldClass}>
                                                    <option value={0}>0 - Não se aplica</option>
                                                    <option value={1}>1 - Presencial</option>
                                                    <option value={2}>2 - Internet</option>
                                                    <option value={3}>3 - Teleatendimento</option>
                                                    <option value={9}>9 - Outros</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className={labelClass}>Consumidor final</label>
                                                <select value={indFinal} onChange={(e) => setIndFinal(Number(e.target.value) as 0 | 1)} className={fieldClass}>
                                                    <option value={1}>1 - Sim</option>
                                                    <option value={0}>0 - Não</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className={labelClass}>Intermediador</label>
                                                <select value={indIntermed} onChange={(e) => setIndIntermed(Number(e.target.value) as 0 | 1)} className={fieldClass}>
                                                    <option value={0}>0 - Sem intermediador</option>
                                                    <option value={1}>1 - Com intermediador</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className={labelClass}>Pagamento</label>
                                                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={fieldClass}>
                                                    <option value="90">90 - Sem pagamento</option>
                                                    <option value="01">01 - Dinheiro</option>
                                                    <option value="03">03 - Cartão de crédito</option>
                                                    <option value="04">04 - Cartão de débito</option>
                                                    <option value="15">15 - Boleto</option>
                                                    <option value="17">17 - PIX</option>
                                                    <option value="99">99 - Outros</option>
                                                </select>
                                            </div>
                                        </div>
                                        {indIntermed === 1 && (
                                            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                                                <Field label="CNPJ intermediador" value={intermediadorCnpj} onChange={(v) => setIntermediadorCnpj(onlyDigits(v).slice(0, 14))} />
                                                <Field label="ID cadastro intermediador" value={intermediadorId} onChange={setIntermediadorId} />
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                        <NumberField label="Frete" value={valorFrete} onChange={setValorFrete} prefix="R$" />
                                        <NumberField label="Seguro" value={valorSeguro} onChange={setValorSeguro} prefix="R$" />
                                        <NumberField label="Desconto" value={valorDesconto} onChange={setValorDesconto} prefix="R$" />
                                        <NumberField label="Outras despesas" value={valorOutrasDespesas} onChange={setValorOutrasDespesas} prefix="R$" />
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                        <TextAreaField label="Informações complementares" value={infCpl} onChange={setInfCpl} />
                                        <TextAreaField label="Informações ao Fisco" value={infAdFisco} onChange={setInfAdFisco} />
                                    </div>
                                </>
                            )}
                        </section>
                    )}

                    {step === "review" && (
                        <section className="space-y-5">
                            <div>
                                <h2 className="text-lg font-black text-white">Revisão</h2>
                                <p className="text-sm text-slate-400">Confira os dados principais antes de transmitir.</p>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <ReviewCard label="Operação" value={`${currentOperation.title} - ${purposeLabel(purpose)}`} />
                                <ReviewCard
                                    label="Origem"
                                    value={selectedShipmentOrigin
                                        ? `Remessa NF-e ${selectedShipmentOrigin.number || "-"} | chave ${selectedShipmentOrigin.accessKey}`
                                        : selectedDepositTransferOrigin
                                            ? `Transferência NF-e ${selectedDepositTransferOrigin.number || "-"} | chave ${selectedDepositTransferOrigin.accessKey}`
                                            : selectedTransferStore
                                                ? `Filial ${selectedTransferStore.razao_social || selectedTransferStore.name}`
                                                : selectedOrigin
                                                    ? `NF-e ${selectedOrigin.number || "-"} | chave ${selectedOrigin.accessKey}`
                                                    : selectedSale
                                                        ? `Venda #${selectedSale.id}`
                                                        : "NF-e avulsa/manual"}
                                />
                                <ReviewCard label="Destinatário" value={customerForm.nome || "Não informado"} />
                                <ReviewCard label="Documento" value={customerForm.cpfCnpj || "Não informado"} />
                                <ReviewCard label="Itens" value={String(items.length)} />
                                <ReviewCard label="Total" value={money(total)} />
                            </div>
                            {pendingIssues.length > 0 ? (
                                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                                    <p className="font-black text-red-300">Pendências antes de emitir</p>
                                    <ul className="mt-2 space-y-1 text-xs font-bold text-red-400">
                                        {pendingIssues.map((issue) => <li key={issue}>{issue}</li>)}
                                    </ul>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-sm font-black text-green-300">
                                    Dados mínimos completos para emissão em {environmentLabel}.
                                </div>
                            )}
                            {operation === "advanced" && aiAudit && (
                                <div className={`rounded-2xl border p-4 ${
                                    aiAudit.status === "inconsistente"
                                        ? "border-red-500/20 bg-red-500/10"
                                        : aiAudit.status === "atencao"
                                            ? "border-amber-200 bg-amber-500/10"
                                            : "border-green-200 bg-green-500/10"
                                }`}>
                                    <p className="font-black text-white">Auditoria da operação assistida</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-200">{aiAudit.resumo}</p>
                                    {aiAudit.achados.length > 0 && (
                                        <div className="mt-3 space-y-2">
                                            {aiAudit.achados.map((finding, index) => (
                                                <div key={`${finding.titulo || "achado"}-${index}`} className="rounded-xl bg-black/80 p-3 text-xs text-slate-200">
                                                    <p className="font-black">{finding.titulo || "Ponto para revisar"}</p>
                                                    {finding.detalhe && <p className="mt-1">{finding.detalhe}</p>}
                                                    {finding.sugestao && <p className="mt-1 font-bold">Sugestao: {finding.sugestao}</p>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <p className="mt-3 text-xs font-bold text-slate-300">{aiAudit.aviso}</p>
                                    <label className="mt-4 flex items-start gap-2 rounded-xl border border-white/10 bg-black/40 p-3 text-sm font-semibold text-white">
                                        <input
                                            type="checkbox"
                                            checked={advancedAuditConfirmed}
                                            onChange={(e) => setAdvancedAuditConfirmed(e.target.checked)}
                                            className="mt-0.5 h-4 w-4 accent-stone-900"
                                        />
                                        Revisei os pontos com meu contador e confirmo a emissão deste rascunho.
                                    </label>
                                </div>
                            )}
                        </section>
                    )}

                    <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-4">
                        <button type="button" onClick={goBack} disabled={stepIndex === 0} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-4 py-2 text-sm font-black text-slate-300 transition hover:bg-white/5 disabled:opacity-40">
                            <ChevronLeft size={16} /> Voltar
                        </button>
                        {step !== "review" ? (
                            <button type="button" onClick={goNext} className="flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-4 py-2 text-sm font-black text-[#FACC15] transition hover:bg-black">
                                Próximo <ChevronRight size={16} />
                            </button>
                        ) : (
                            <button type="button" disabled={pendingIssues.length > 0 || emitting || aiAuditLoading || loadingSaleData} onClick={handleEmit} className="flex items-center gap-2 rounded-xl bg-[#FACC15] px-4 py-2 text-sm font-black text-white transition hover:bg-yellow-300 disabled:opacity-40">
                                {(emitting || aiAuditLoading) ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                {aiAuditLoading
                                    ? `Tentativa ${aiAuditAttempt || 1}/6`
                                    : emitting
                                    ? "Emitindo..."
                                    : operation === "advanced" && (!aiAudit || !advancedAuditConfirmed)
                                        ? "Revisão final"
                                    : operation === "bonus"
                                        ? `Emitir NF-e de ${purposeLabel(purpose)}`
                                        : operation === "return"
                                            ? "Emitir NF-e de Devolução"
                                            : operation === "shipment"
                                                ? `Emitir NF-e de ${purposeLabel(purpose)}`
                                            : operation === "transfer"
                                                ? `Emitir NF-e de ${purposeLabel(purpose)}`
                                            : operation === "advanced"
                                                ? "Emitir NF-e assistida"
                                            : "Emitir NF-e de Venda"}
                            </button>
                        )}
                    </div>
                </main>

                <aside className="space-y-3">
                    <div className="rounded-2xl border border-white/5 bg-black/40 p-4 shadow-sm">
                        <p className="text-xs font-black uppercase text-slate-500">Resumo</p>
                        <div className="mt-3 space-y-2 text-sm">
                            <SummaryRow label="Operação" value={currentOperation.title} />
                            <SummaryRow label="Finalidade" value={purposeLabel(purpose)} />
                            <SummaryRow
                                label="Origem"
                                value={selectedShipmentOrigin
                                    ? `Remessa NF-e ${selectedShipmentOrigin.number || "-"}`
                                    : selectedDepositTransferOrigin
                                        ? `Transferência NF-e ${selectedDepositTransferOrigin.number || "-"}`
                                        : selectedTransferStore
                                            ? selectedTransferStore.name
                                            : selectedOrigin
                                                ? `NF-e ${selectedOrigin.number || "-"}`
                                                : selectedSale
                                                    ? `Venda #${selectedSale.id}`
                                                    : "Avulsa"}
                            />
                            <SummaryRow label="Itens" value={String(items.length)} />
                            <SummaryRow label="Total" value={money(total)} strong />
                        </div>
                    </div>

                    <div className={`rounded-2xl border p-4 shadow-sm ${pendingIssues.length ? "border-red-500/20 bg-red-500/10" : "border-green-500/20 bg-green-500/10"}`}>
                        <p className={`text-xs font-black uppercase ${pendingIssues.length ? "text-red-500" : "text-green-400"}`}>Validação</p>
                        {pendingIssues.length ? (
                            <p className="mt-2 text-sm font-bold text-red-300">{pendingIssues.length} pendencia(s) antes de emitir.</p>
                        ) : (
                            <p className="mt-2 text-sm font-bold text-green-300">Pronto para {environmentLabel}.</p>
                        )}
                    </div>
                </aside>
            </div>

            {saleModalOpen && (
                <SaleSearchModal
                    query={saleSearch}
                    setQuery={setSaleSearch}
                    sales={filteredSales}
                    loading={loadingSales}
                    applyingId={saleApplyingId}
                    onClose={() => setSaleModalOpen(false)}
                    onSelect={importSale}
                />
            )}

            {cloneModalOpen && (
                <CloneInvoiceModal
                    query={cloneSearch}
                    setQuery={setCloneSearch}
                    status={cloneStatus}
                    setStatus={setCloneStatus}
                    invoices={cloneResults}
                    loading={cloneLoading}
                    applyingId={cloneApplyingId}
                    onClose={() => setCloneModalOpen(false)}
                    onSelect={applyCloneInvoice}
                />
            )}
        </div>
    );
}

function SaleSearchModal({
    query,
    setQuery,
    sales,
    loading,
    applyingId,
    onClose,
    onSelect,
}: {
    query: string;
    setQuery: (value: string) => void;
    sales: PendingSale[];
    loading: boolean;
    applyingId: number | null;
    onClose: () => void;
    onSelect: (sale: PendingSale) => Promise<void>;
}) {
    const today = new Date();
    const isToday = (value: string) => {
        const date = new Date(value);
        return date.getDate() === today.getDate()
            && date.getMonth() === today.getMonth()
            && date.getFullYear() === today.getFullYear();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="max-h-[86vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-black/40 shadow-2xl">
                <div className="flex items-center justify-between gap-3 border-b border-white/5 p-5">
                    <div>
                        <p className="text-lg font-black text-white">Buscar venda</p>
                        <p className="mt-1 text-xs font-bold text-slate-400">As vendas mais recentes aparecem primeiro.</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={applyingId !== null}
                        className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-300 hover:bg-white/5 disabled:opacity-40"
                    >
                        Fechar
                    </button>
                </div>

                <div className="border-b border-white/5 p-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            className="w-full rounded-xl border border-white/10 py-2 pl-9 pr-3 text-sm font-bold outline-none focus:border-[#FACC15] focus:ring-2 focus:ring-[#FACC15]/20"
                            placeholder="Número da venda, cliente ou CPF/CNPJ"
                            autoFocus
                        />
                    </div>
                </div>

                <div className="max-h-[58vh] overflow-y-auto p-4">
                    {loading ? (
                        <div className="flex items-center gap-2 rounded-2xl bg-white/5 p-4 text-sm font-bold text-slate-400">
                            <Loader2 size={16} className="animate-spin" /> Buscando vendas...
                        </div>
                    ) : sales.length === 0 ? (
                        <div className="rounded-2xl bg-white/5 p-5 text-center text-sm font-bold text-slate-400">
                            Nenhuma venda elegivel encontrada.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {sales.map((sale) => (
                                <button
                                    key={sale.id}
                                    type="button"
                                    onClick={() => void onSelect(sale)}
                                    disabled={applyingId !== null}
                                    className="w-full rounded-2xl border border-white/10 bg-black/40 p-4 text-left transition hover:border-[#FACC15] hover:bg-white/10 disabled:opacity-50"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="font-black text-white">Venda #{sale.id}</p>
                                                {isToday(sale.created_at) && (
                                                    <span className="rounded-full bg-[#FACC15] px-2 py-1 text-[9px] font-black uppercase text-white">
                                                        Hoje
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-1 text-xs font-bold text-slate-400">
                                                {sale.clients?.nome || "Cliente não informado"}
                                            </p>
                                            <p className="mt-1 text-[10px] font-semibold text-slate-500">
                                                {new Date(sale.created_at).toLocaleString("pt-BR")}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-white">{money(sale.total)}</p>
                                            {applyingId === sale.id && <Loader2 size={14} className="ml-auto mt-2 animate-spin text-amber-600" />}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function CloneInvoiceModal({
    query,
    setQuery,
    status,
    setStatus,
    invoices,
    loading,
    applyingId,
    onClose,
    onSelect,
}: {
    query: string;
    setQuery: (value: string) => void;
    status: "authorized" | "error" | "rejected" | "all";
    setStatus: (value: "authorized" | "error" | "rejected" | "all") => void;
    invoices: CloneInvoiceSummary[];
    loading: boolean;
    applyingId: number | null;
    onClose: () => void;
    onSelect: (invoice: CloneInvoiceSummary) => Promise<void>;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="max-h-[86vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-black/40 shadow-2xl">
                <div className="flex items-center justify-between gap-3 border-b border-white/5 p-5">
                    <div>
                        <p className="text-lg font-black text-white">Clonar NF-e</p>
                        <p className="mt-1 text-xs font-bold text-slate-400">Notas emitidas no ambiente atual por esta loja.</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={applyingId !== null}
                        className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-300 hover:bg-white/5 disabled:opacity-40"
                    >
                        Fechar
                    </button>
                </div>

                <div className="grid grid-cols-1 gap-3 border-b border-white/5 p-4 md:grid-cols-[1fr_180px]">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            className="w-full rounded-xl border border-white/10 py-2 pl-9 pr-3 text-sm font-bold outline-none focus:border-[#FACC15] focus:ring-2 focus:ring-[#FACC15]/20"
                            placeholder="Número, destinatário, documento ou chave"
                            autoFocus
                        />
                    </div>
                    <select
                        value={status}
                        onChange={(event) => setStatus(event.target.value as "authorized" | "error" | "rejected" | "all")}
                        className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm font-bold text-slate-200 outline-none focus:border-[#FACC15]"
                    >
                        <option value="authorized">Autorizadas</option>
                        <option value="rejected">Rejeitadas</option>
                        <option value="error">Com erro</option>
                        <option value="all">Todas</option>
                    </select>
                </div>

                <div className="max-h-[58vh] overflow-y-auto p-4">
                    {loading ? (
                        <div className="flex items-center gap-2 rounded-2xl bg-white/5 p-4 text-sm font-bold text-slate-400">
                            <Loader2 size={16} className="animate-spin" /> Buscando notas...
                        </div>
                    ) : invoices.length === 0 ? (
                        <div className="rounded-2xl bg-white/5 p-5 text-center text-sm font-bold text-slate-400">
                            Nenhuma NF-e encontrada para os filtros atuais.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {invoices.map((invoice) => {
                                const infNFe = asRecord(invoice.payload_json?.infNFe);
                                const nature = String(asRecord(infNFe.ide).natOp || "Natureza não informada");
                                const applying = applyingId === invoice.id;

                                return (
                                    <button
                                        key={invoice.id}
                                        type="button"
                                        onClick={() => void onSelect(invoice)}
                                        disabled={applyingId !== null}
                                        className="w-full rounded-2xl border border-white/10 bg-black/40 p-4 text-left transition hover:border-[#FACC15] hover:bg-white/10 disabled:opacity-50"
                                    >
                                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <p className="font-black text-white">
                                                        NF-e {invoice.numero || "-"} {invoice.serie ? `Série ${invoice.serie}` : ""}
                                                    </p>
                                                    <span className="rounded-full bg-white/10 px-2 py-1 text-[9px] font-black uppercase text-slate-400">
                                                        {invoice.status || "sem status"}
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-xs font-bold text-slate-400">
                                                    {invoice.destinatario_nome || "Destinatário sem nome"} | {invoice.destinatario_cnpj || "Documento pendente"}
                                                </p>
                                                <p className="mt-1 text-[11px] font-black text-blue-400">{nature}</p>
                                            </div>
                                            <div className="text-left md:text-right">
                                                <p className="text-sm font-black text-white">{money(invoice.valor_total)}</p>
                                                <p className="mt-1 text-[11px] font-bold text-slate-400">
                                                    {invoice.data_emissao
                                                        ? new Date(invoice.data_emissao).toLocaleDateString("pt-BR")
                                                        : "Data não informada"}
                                                </p>
                                                {applying && (
                                                    <p className="mt-2 inline-flex items-center gap-1 text-[10px] font-black text-amber-700">
                                                        <Loader2 size={12} className="animate-spin" /> Carregando rascunho
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

const labelClass = "ml-1 text-[10px] font-black uppercase tracking-wider text-slate-500";
const fieldClass = "w-full rounded-2xl border border-white/5 bg-black/40 px-4 py-3 text-sm font-semibold text-white outline-none transition focus:border-[#FACC15] focus:ring-2 focus:ring-yellow-100";
const controlClass = "block appearance-none box-border !h-[48px] !min-h-[48px] !max-h-[48px] !py-0 leading-[46px] w-full rounded-2xl border border-white/5 bg-black/40 px-4 text-sm font-semibold text-white outline-none transition focus:border-[#FACC15] focus:ring-2 focus:ring-yellow-100";

function Field({
    label,
    value,
    onChange,
    onBlur,
    disabled,
    title,
    align,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    disabled?: boolean;
    title?: string;
    align?: "left" | "right" | "center";
}) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className={labelClass}>{label}</span>
            <input
                type="text"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onBlur={onBlur}
                disabled={disabled}
                title={title}
                className={`${controlClass} ${align ? 'text-' + align : 'text-left'} disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-400`}
            />
        </label>
    );
}

function TextAreaField({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className={labelClass}>{label}</span>
            <textarea
                value={value}
                onChange={(event) => onChange(event.target.value)}
                rows={4}
                className={`${fieldClass} resize-y`}
            />
        </label>
    );
}

function NumberField({
    label,
    value,
    onChange,
    disabled,
    max,
    prefix,
    align,
}: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
    max?: number;
    prefix?: string;
    align?: "left" | "right" | "center";
}) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className={labelClass}>{label}</span>
            <div className="relative">
                {prefix ? (
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">
                        {prefix}
                    </span>
                ) : null}
                <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={max}
                    value={value}
                    disabled={disabled}
                    onChange={(event) => onChange(Number(event.target.value))}
                    className={`${controlClass.replace("mt-1.5", "")} ${prefix ? "pl-12" : ""} ${align ? 'text-' + align : 'text-left'} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-400`}
                />
            </div>
        </label>
    );
}

function formatCurrencyInputValue(value: number) {
    return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);
}

function parseCurrencyInputValue(value: string) {
    const normalized = value
        .replace(/\s/g, "")
        .replace(/\./g, "")
        .replace(",", ".")
        .replace(/[^\d.-]/g, "");

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function CurrencyField({
    label,
    value,
    onChange,
    disabled,
    align,
}: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
    align?: "left" | "right" | "center";
}) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className={labelClass}>{label}</span>
            <input
                type="text"
                inputMode="decimal"
                value={formatCurrencyInputValue(value)}
                disabled={disabled}
                onChange={(event) => onChange(parseCurrencyInputValue(event.target.value))}
                className={`${controlClass} ${align ? 'text-' + align : 'text-left'} disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-400`}
            />
        </label>
    );
}

function DisplayField({
    label,
    value,
    align,
    title,
}: {
    label: string;
    value: string;
    align?: "left" | "right" | "center";
    title?: string;
}) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className={labelClass}>{label}</span>
            <div
                title={title}
                className={`${controlClass.replace("leading-[46px]", "")} flex items-center ${
                    align === "left" ? "justify-start text-left" : align === "center" ? "justify-center text-center" : "justify-end text-right"
                } text-lg font-black`}
            >
                <span className="text-white">{value}</span>
            </div>
        </label>
    );
}

function UnitSelect({ value, onChange, disabled, align }: { value: string; onChange: (value: string) => void; disabled?: boolean; align?: "left" | "right" | "center"; }) {
    const currentValue = value || "UN";

    return (
        <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Unidade</span>
            <select value={currentValue} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={`${controlClass} ${align ? 'text-' + align : 'text-left'} disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-400`}>
                {UNIT_OPTIONS.map((unit) => (
                    <option key={unit} value={unit}>{unit}</option>
                ))}
                {!UNIT_OPTIONS.includes(currentValue) && <option value={currentValue}>{currentValue}</option>}
            </select>
        </label>
    );
}

function NcmField({
    value,
    onChange,
    onBlur,
    onFetch,
    loading,
    status,
}: {
    value: string;
    onChange: (value: string) => void;
    onBlur: () => void;
    onFetch: () => void;
    loading: boolean;
    status: NcmAiStatus | null;
}) {
    const hasNcm = onlyDigits(value).length > 0;

    return (
        <label className="flex flex-col gap-1.5">
            <span className="ml-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
                NCM
                {status && (
                    <span className={`rounded-full px-2 py-0.5 text-[9px] ${
                        status.tone === "green"
                            ? "bg-emerald-500/10 text-emerald-700"
                            : status.tone === "yellow"
                                ? "bg-amber-500/10 text-amber-700"
                                : "bg-red-500/10 text-red-400"
                    }`}>
                        {status.label}{typeof status.confidence === "number" ? ` ${status.confidence}%` : ""}
                    </span>
                )}
            </span>
            <div className="relative mt-1.5">
                <input
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    onBlur={onBlur}
                    maxLength={8}
                    className={`w-full rounded-2xl border border-white/5 bg-black/40 py-3 pl-4 text-sm font-semibold tracking-wider text-white outline-none transition focus:border-[#FACC15] focus:ring-2 focus:ring-yellow-100 ${hasNcm ? "pr-4" : "pr-12"}`}
                />
                {!hasNcm && (
                    <button
                        type="button"
                        onClick={onFetch}
                        disabled={loading}
                        className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white disabled:opacity-60"
                        title="Sugerir NCM com IA"
                        aria-label="Sugerir NCM com IA"
                    >
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    </button>
                )}
            </div>
        </label>
    );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <div className="flex justify-between gap-3">
            <span className="text-slate-400">{label}</span>
            <span className={`text-right font-black ${strong ? "text-white" : "text-white"}`}>{value}</span>
        </div>
    );
}

function ReviewCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-black text-white">{value}</p>
        </div>
    );
}

function ProductField({
    label,
    storeId,
    value,
    onChange,
    onSelect,
}: {
    label: string;
    storeId: number;
    value: string;
    onChange: (value: string) => void;
    onSelect: (product: ProductSearchResult) => void;
}) {
    const [results, setResults] = useState<ProductSearchResult[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!open || value.trim().length < 2) {
                setResults([]);
                return;
            }

            setLoading(true);
            const data = await searchProducts(value, storeId);
            setResults(data || []);
            setLoading(false);
        }, 350);

        return () => clearTimeout(timer);
    }, [value, open, storeId]);

    return (
        <label className="relative block">
            <span className={labelClass}>{label}</span>
            <input
                value={value}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 180)}
                onChange={(event) => onChange(event.target.value)}
                className={fieldClass}
            />
            {open && value.trim().length >= 2 && (
                <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#11131c] shadow-2xl backdrop-blur-md">
                    {loading ? (
                        <div className="flex items-center gap-2 px-3 py-3 text-xs text-slate-400">
                            <Loader2 size={14} className="animate-spin" /> Buscando...
                        </div>
                    ) : results.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-slate-400">Nenhum produto encontrado.</div>
                    ) : (
                        results.map((product) => (
                            <button
                                key={product.id}
                                type="button"
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    onSelect(product);
                                    setOpen(false);
                                }}
                                className="w-full border-t border-white/5 px-3 py-2.5 text-left transition first:border-t-0 hover:bg-white/8"
                            >
                                <p className="text-xs font-black text-white">{product.nome}</p>
                                <p className="text-[10px] text-slate-400">{money(Number(product.preco_venda || 0))} | NCM {product.ncm || "não informado"}</p>
                            </button>
                        ))
                    )}
                </div>
            )}
        </label>
    );
}
