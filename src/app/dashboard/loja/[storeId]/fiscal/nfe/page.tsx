"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    AlertCircle,
    AlertTriangle,
    ArrowLeft,
    CheckCircle,
    ChevronLeft,
    ChevronRight,
    FileCheck2,
    FileText,
    Gift,
    Loader2,
    MapPin,
    Package,
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
import { getAuthorizedDepositTransferOriginAction, getAuthorizedShipmentOriginAction, getImportedDemonstrationOriginAction, getImportedNFeOriginAction, getPendingSales, getProductFiscalData, getSaleData, getTenantTransferStoreAction, listAuthorizedDepositTransferOriginsAction, listAuthorizedShipmentOriginsAction, listImportedDemonstrationOriginsAction, listImportedNFeOriginsAction, listTenantTransferStoresAction, saveMissingProductNcmAction, saveNFeCustomerParticipantAction, searchNFeParticipantsAction, searchProducts } from "@/lib/actions/fiscal-db.actions";
import { emitirNFeVendaHomologacao } from "@/lib/actions/fiscal-nfe.actions";
import { auditarNFeAssistidaComIaAction, type FiscalAuditPayload, type FiscalAuditUiResult } from "@/lib/actions/fiscal-ai-audit.actions";
import { getStoreProfile } from "@/lib/actions/store.actions";

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

const STEPS: { id: StepId; label: string }[] = [
    { id: "operation", label: "Operacao" },
    { id: "participant", label: "Participante" },
    { id: "items", label: "Itens" },
    { id: "transport", label: "Transporte" },
    { id: "review", label: "Revisao" },
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
        title: "Devolucao",
        subtitle: "Devolucao com nota de origem",
        icon: RotateCcw,
        purposes: ["Devolucao de compra", "Devolucao de venda"],
        enabled: true,
    },
    {
        id: "shipment",
        title: "Remessa/Retorno",
        subtitle: "Conserto, garantia, demonstracao",
        icon: Repeat2,
        purposes: ["Remessa para conserto", "Retorno de conserto", "Remessa em garantia", "Retorno de garantia", "Remessa para demonstracao", "Retorno de demonstracao"],
        enabled: true,
    },
    {
        id: "transfer",
        title: "Transferencia",
        subtitle: "Entre filiais ou depositos",
        icon: Warehouse,
        purposes: ["Transferencia entre filiais", "Transferencia para deposito", "Retorno de deposito"],
        enabled: true,
    },
    {
        id: "bonus",
        title: "Bonificacao/Doacao",
        subtitle: "Bonificacao, brinde ou doacao",
        icon: Gift,
        purposes: ["Bonificacao", "Brinde", "Doacao"],
        enabled: true,
    },
    {
        id: "advanced",
        title: "Outra operacao",
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

    const [step, setStep] = useState<StepId>("operation");
    const [operation, setOperation] = useState<OperationGroup>("sale");
    const [purpose, setPurpose] = useState("Venda comum");
    const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
    const [loadingSales, setLoadingSales] = useState(true);
    const [saleSearch, setSaleSearch] = useState("");
    const [selectedSale, setSelectedSale] = useState<PendingSale | null>(null);
    const [loadingSaleData, setLoadingSaleData] = useState(false);
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
    const [selectedParticipantId, setSelectedParticipantId] = useState<number | null>(null);
    const [participantSaveState, setParticipantSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [participantSaveMessage, setParticipantSaveMessage] = useState("");
    const [cepLoading, setCepLoading] = useState(false);
    const [items, setItems] = useState<NFeItemForm[]>([{ ...emptyItem }]);
    const [paymentMethod, setPaymentMethod] = useState("01");
    const [advancedNature, setAdvancedNature] = useState("");
    const [advancedTpNF, setAdvancedTpNF] = useState<0 | 1>(1);
    const [advancedFinNFe, setAdvancedFinNFe] = useState<1 | 2 | 3 | 4>(1);
    const [referencedKey, setReferencedKey] = useState("");
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
                    getPendingSales(storeId),
                    getStoreProfile(storeId),
                    listImportedNFeOriginsAction(storeId),
                    listAuthorizedShipmentOriginsAction({ storeId, kind: "conserto" }),
                    listAuthorizedShipmentOriginsAction({ storeId, kind: "garantia" }),
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
    }, [storeId, modules.fiscal]);

    useEffect(() => {
        if (participantMode !== "search") return;

        const timer = setTimeout(async () => {
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
    }, [participantMode, participantSearch, storeId]);

    function resetToManual() {
        setSelectedSale(null);
        setSelectedOrigin(null);
        setSelectedShipmentOrigin(null);
        setSelectedTransferStore(null);
        setSelectedDepositTransferOrigin(null);
        setSelectedParticipantId(null);
        setParticipantMode("manual");
        setCustomerForm(emptyCustomerForm);
        setItems([{ ...emptyItem }]);
        setError(null);
        setSuccess(null);
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
            setError(result.error || "Nao foi possivel carregar a filial de destino.");
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
            setError(result.error || "Nao foi possivel carregar a transferencia para deposito.");
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
        });

        setLoadingOriginKey(null);
        if (!result.success || !result.participant || !result.items) {
            setError(result.error || "Nao foi possivel carregar a remessa autorizada.");
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
            setError(result.error || "Nao foi possivel carregar a remessa de demonstracao importada.");
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
            setError(result.error || "Nao foi possivel carregar a NF-e importada.");
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
        setSelectedSale(sale);
        setError(null);
        setSuccess(null);
        setLoadingSaleData(true);

        try {
            const data = await getSaleData(sale.id);
            setCustomerForm(customerFormFromSale(data, sale));
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
            setStep("participant");
        } catch (err) {
            console.error(err);
            setError("Nao foi possivel importar a venda.");
        } finally {
            setLoadingSaleData(false);
        }
    }

    function updateCustomerForm(field: keyof CustomerForm, value: string) {
        setCustomerForm((current) => ({ ...current, [field]: value }));
        setParticipantSaveState("idle");
    }

    function selectParticipant(participant: ParticipantResult) {
        setSelectedParticipantId(participant.id);
        setCustomerForm(customerFormFromParticipant(participant));
        setParticipantSearch(participant.full_name);
        setParticipantSaveState("idle");
    }

    async function saveParticipantOnBlur() {
        if (participantLocked) return;
        if (!customerForm.nome.trim()) return;

        setParticipantSaveState("saving");
        const result = await saveNFeCustomerParticipantAction({
            storeId,
            customerId: selectedParticipantId,
            participant: customerForm,
        });

        if (result.success) {
            setSelectedParticipantId(result.customerId || selectedParticipantId);
            setParticipantSaveState("saved");
            setParticipantSaveMessage(result.created ? "Cliente criado automaticamente." : "Cliente atualizado automaticamente.");
            return;
        }

        setParticipantSaveState("error");
        setParticipantSaveMessage(result.error || "Nao foi possivel salvar o participante.");
    }

    async function lookupCepAndSave() {
        if (participantLocked) return;
        const cep = onlyDigits(customerForm.cep);
        if (cep.length !== 8) {
            await saveParticipantOnBlur();
            return;
        }

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
                setParticipantSaveMessage(result.error || "Nao foi possivel salvar o participante.");
            }
        });
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
            setError(result.error || "Nao foi possivel salvar o NCM no produto.");
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
                    : { itemIndex: index, label: "Confiavel", tone: "green" as const, confidence };
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
                setError(data.error || "A IA nao conseguiu sugerir um NCM confiavel.");
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
            issues.push("Esta operacao ainda nao esta liberada para transmissao.");
        }
        if (operation === "advanced") {
            if (!advancedNature.trim()) issues.push("Informe a natureza da operacao.");
            if (referencedKey && onlyDigits(referencedKey).length !== 44) issues.push("A chave NF-e referenciada deve ter 44 digitos.");
            if (modFrete === 9 && valorFrete > 0) issues.push("Frete deve ser zero quando nao houver transporte.");
            if (modFrete !== 9 && ![11, 14].includes(onlyDigits(carrierDoc).length)) {
                issues.push("Informe CPF/CNPJ da transportadora.");
            }
            if (indIntermed === 1 && (onlyDigits(intermediadorCnpj).length !== 14 || !intermediadorId.trim())) {
                issues.push("Informe CNPJ e identificador do intermediador.");
            }
            if (advancedTpNF === 1 && indPres === 0) issues.push("NF-e de saida nao pode usar presenca 0.");
            if (valorDesconto > items.reduce((sum, item) => sum + Number(item.valorTotal || 0), 0)) {
                issues.push("O desconto nao pode superar o total dos produtos.");
            }
        }
        if (operation === "return") {
            if (purpose !== "Devolucao de compra") issues.push("Apenas Devolucao de compra esta liberada nesta etapa.");
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
            issues.push("Transferencias exigem destinatario com CNPJ e Inscricao Estadual.");
        }
        if (!customerForm.nome.trim()) issues.push("Informe nome/razao social do participante.");
        if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) issues.push("Informe CPF/CNPJ valido.");
        if (!customerForm.logradouro.trim() || !customerForm.numero.trim() || !customerForm.bairro.trim()) issues.push("Complete logradouro, numero e bairro.");
        if (!customerForm.cidade.trim() || !customerForm.uf.trim()) issues.push("Complete cidade e UF.");
        if (onlyDigits(customerForm.cep).length !== 8) issues.push("Informe CEP com 8 digitos.");
        if (onlyDigits(customerForm.codigoMunicipioIbge).length !== 7) issues.push("Informe codigo IBGE do municipio.");

        items.forEach((item, index) => {
            if (!item.descricao.trim()) issues.push(`Item ${index + 1}: informe descricao.`);
            if (onlyDigits(item.ncm).length !== 8 || onlyDigits(item.ncm) === "00000000") {
                issues.push(`Item ${index + 1}: informe NCM valido com 8 digitos.`);
            }
            if (operation === "advanced" && onlyDigits(item.cfop).length !== 4) issues.push(`Item ${index + 1}: informe CFOP com 4 digitos.`);
            if (operation === "advanced" && advancedTpNF === 0 && !["1", "2", "3"].includes(onlyDigits(item.cfop)[0])) {
                issues.push(`Item ${index + 1}: CFOP nao corresponde a uma NF-e de entrada.`);
            }
            if (operation === "advanced" && advancedTpNF === 1 && !["5", "6", "7"].includes(onlyDigits(item.cfop)[0])) {
                issues.push(`Item ${index + 1}: CFOP nao corresponde a uma NF-e de saida.`);
            }
            if (operation === "advanced" && !["101", "102", "103", "201", "202", "203", "300", "400", "500", "900"].includes(item.csosn || "")) {
                issues.push(`Item ${index + 1}: selecione um CSOSN suportado.`);
            }
            if (operation === "advanced" && (!Number.isInteger(Number(item.origem)) || Number(item.origem) < 0 || Number(item.origem) > 8)) {
                issues.push(`Item ${index + 1}: origem da mercadoria invalida.`);
            }
            if (Number(item.quantidade) <= 0) issues.push(`Item ${index + 1}: quantidade deve ser maior que zero.`);
            if (item.maxQuantity && Number(item.quantidade) > item.maxQuantity) {
                issues.push(`Item ${index + 1}: quantidade maxima para devolucao e ${item.maxQuantity}.`);
            }
            if (Number(item.valorUnitario) <= 0) issues.push(`Item ${index + 1}: valor unitario deve ser maior que zero.`);
        });

        return issues;
    }

    function buildAdvancedAuditPayload(): FiscalAuditPayload {
        const totalProdutos = items.reduce((sum, item) => sum + Number(item.valorTotal || 0), 0);
        return {
            storeId,
            ambiente: "homologation",
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
                    setError(result.error || "Nao foi possivel auditar a NF-e assistida.");
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

        const result = await emitirNFeVendaHomologacao({
            storeId,
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
            setSuccess(result.message || "NF-e enviada em homologacao.");
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
    const filteredSales = pendingSales.filter((sale) => {
        const term = saleSearch.trim().toLowerCase();
        if (!term) return true;
        return (
            String(sale.id).includes(term) ||
            (sale.clients?.nome || "").toLowerCase().includes(term) ||
            (sale.clients?.cpf_cnpj || "").replace(/\D/g, "").includes(term.replace(/\D/g, ""))
        );
    });

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
                        <h1 className="text-3xl font-black text-white tracking-tight uppercase">Emissao completa de NF-e</h1>
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">
                            Rascunho guiado para venda comum, com estrutura preparada para outras operacoes.
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[260px_1fr_320px] lg:items-center">
                    <div className="hidden lg:block" />
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-black text-stone-700 shadow-sm transition hover:bg-stone-50 opacity-60"
                            title="Sera portado em uma etapa futura"
                        >
                            <FileText size={14} />
                            Clonar nota
                        </button>
                    </div>
                    <div className="flex w-fit items-center gap-1 rounded-xl border border-yellow-400/30 bg-yellow-400/10 p-1 text-yellow-200 shadow-sm lg:justify-self-end">
                        <span className="rounded-lg px-4 py-2 text-xs font-black uppercase tracking-[0.16em]">Homologacao</span>
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
                    <div className="rounded-2xl border border-stone-100 bg-white p-3 shadow-sm">
                        {STEPS.map((item, index) => {
                            const active = item.id === step;
                            const done = index < stepIndex;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setStep(item.id)}
                                    className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition last:mb-0 ${
                                        active ? "bg-[#1A1A1A] text-[#FACC15]" : "text-stone-900 hover:bg-stone-50"
                                    }`}
                                >
                                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${
                                        active ? "bg-[#FACC15] text-[#1A1A1A]" : done ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-500"
                                    }`}>
                                        {done ? <CheckCircle size={14} /> : index + 1}
                                    </span>
                                    <span className="flex-1 text-sm font-black">{item.label}</span>
                                    {item.id === "review" && pendingIssues.length > 0 && <AlertCircle size={14} className={active ? "text-[#FACC15]" : "text-red-400"} />}
                                </button>
                            );
                        })}
                    </div>

                    <div className="rounded-2xl border border-stone-100 bg-white p-3 shadow-sm">
                        <p className="px-2 pb-2 text-[10px] font-black uppercase tracking-widest text-stone-400">Atalhos</p>
                        <button
                            type="button"
                            onClick={() => {
                                resetToManual();
                                setOperation("sale");
                                setPurpose("Venda comum");
                                setStep("participant");
                            }}
                            className="mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-black text-stone-700 hover:bg-stone-50"
                        >
                            <Package size={14} /> NF-e avulsa/manual
                        </button>
                    </div>
                </aside>

                <main className="min-h-[640px] rounded-2xl border border-stone-100 bg-white p-5 shadow-sm">
                    {step === "operation" && (
                        <section className="space-y-5">
                            <div>
                                <h2 className="text-lg font-black text-[#1A1A1A]">Tipo de operacao</h2>
                                <p className="text-sm text-stone-500">Venda, devolucao de compra, remessas e saidas sem cobranca transmitem em homologacao.</p>
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
                                                active ? "border-[#FACC15] bg-[#FACC15]/10 shadow-sm" : "border-stone-200 hover:border-stone-300 hover:bg-stone-50"
                                            } ${!item.enabled ? "opacity-70" : ""}`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${active ? "bg-[#1A1A1A] text-[#FACC15]" : "bg-stone-100 text-stone-500"}`}>
                                                    <Icon size={20} />
                                                </div>
                                                <div>
                                                    <p className="font-black text-[#1A1A1A]">{item.title}</p>
                                                    <p className="mt-1 text-xs font-medium text-stone-500">{item.subtitle}</p>
                                                    {!item.enabled && <p className="mt-2 text-[10px] font-black uppercase text-orange-500">A portar</p>}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="rounded-2xl border border-stone-100 bg-[#F8F7F2] p-4">
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
                                        <option key={item} value={item}>{item}</option>
                                    ))}
                                </select>
                            </div>

                            {operation === "advanced" && (
                                <div className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                    <div>
                                        <p className="text-sm font-black text-amber-950">Operacao assistida em homologacao</p>
                                        <p className="mt-1 text-xs font-medium text-amber-800">
                                            Preencha conforme orientacao contabil. A IA revisa consistencia, mas nao substitui o contador.
                                        </p>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Natureza da operacao</label>
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
                                                <option value={4}>4 - Devolucao</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Chave NF-e referenciada (opcional)</label>
                                        <input
                                            value={referencedKey}
                                            onChange={(e) => setReferencedKey(onlyDigits(e.target.value).slice(0, 44))}
                                            placeholder="44 digitos, apenas quando o contador orientar"
                                            className={fieldClass}
                                        />
                                    </div>
                                </div>
                            )}

                            {operation === "sale" && (
                            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-black text-blue-800">Importar venda e opcional</p>
                                        <p className="mt-1 text-xs font-medium text-blue-700">A NF-e pode ser avulsa. A venda serve apenas para preencher cliente e itens.</p>
                                    </div>
                                    <button type="button" onClick={resetToManual} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-blue-700 shadow-sm hover:bg-blue-50">
                                        Usar avulsa
                                    </button>
                                </div>

                                <div className="mt-4 rounded-2xl border border-blue-100 bg-white p-3">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={15} />
                                        <input
                                            value={saleSearch}
                                            onChange={(e) => setSaleSearch(e.target.value)}
                                            placeholder="Buscar venda, cliente ou CPF..."
                                            className="w-full rounded-xl border border-stone-100 bg-[#F8F7F2] py-2 pl-9 pr-3 text-sm outline-none focus:border-[#FACC15]"
                                        />
                                    </div>
                                    <div className="mt-3 max-h-52 overflow-y-auto space-y-2">
                                        {loadingSales ? (
                                            <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-[#FACC15]" size={20} /></div>
                                        ) : filteredSales.length === 0 ? (
                                            <p className="py-4 text-center text-xs font-bold text-stone-400">Nenhuma venda elegivel encontrada.</p>
                                        ) : (
                                            filteredSales.map((sale) => (
                                                <button key={sale.id} type="button" onClick={() => importSale(sale)} className="flex w-full justify-between rounded-xl border border-stone-100 p-3 text-left transition hover:bg-yellow-50">
                                                    <span>
                                                        <span className="block text-xs font-black text-stone-900">Venda #{sale.id}</span>
                                                        <span className="block text-[10px] font-bold text-stone-500">{sale.clients?.nome || "Cliente nao informado"}</span>
                                                    </span>
                                                    <span className="text-xs font-black text-stone-800">{money(sale.total)}</span>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                            )}

                            {operation === "return" && (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                    <div>
                                        <p className="text-sm font-black text-amber-900">NF-e de entrada importada</p>
                                        <p className="mt-1 text-xs font-medium text-amber-800">
                                            O fornecedor, os produtos e a chave referenciada serao carregados do XML original.
                                        </p>
                                    </div>

                                    {purpose === "Devolucao de venda" ? (
                                        <p className="mt-4 rounded-xl border border-orange-200 bg-white px-4 py-3 text-xs font-bold text-orange-700">
                                            Devolucao de venda ainda nao esta liberada. Selecione Devolucao de compra.
                                        </p>
                                    ) : (
                                        <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                                            {importedOrigins.length === 0 ? (
                                                <p className="rounded-xl bg-white px-4 py-4 text-center text-xs font-bold text-stone-500">
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
                                                            ? "border-[#FACC15] bg-yellow-50"
                                                            : "border-amber-100 bg-white hover:border-amber-300"
                                                    }`}
                                                >
                                                    <span>
                                                        <span className="block text-xs font-black text-stone-900">
                                                            NF {origin.number || "-"} | {origin.issuerName || "Fornecedor"}
                                                        </span>
                                                        <span className="mt-1 block text-[10px] font-bold text-stone-500">
                                                            {origin.issuedAt ? new Date(origin.issuedAt).toLocaleDateString("pt-BR") : "Data nao informada"}
                                                            {" | "}
                                                            {origin.issuerCnpj || "CNPJ nao informado"}
                                                        </span>
                                                    </span>
                                                    <span className="flex items-center gap-2 text-xs font-black text-stone-800">
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
                                <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
                                    <div>
                                        <p className="text-sm font-black text-cyan-950">
                                            {purpose === "Retorno de demonstracao"
                                                ? "Remessa de demonstracao recebida"
                                                : "Remessa autorizada de origem"}
                                        </p>
                                        <p className="mt-1 text-xs font-medium text-cyan-800">
                                            {purpose === "Retorno de demonstracao"
                                                ? "Selecione uma NF-e de entrada importada com CFOP 5912/6912. Participante, itens e chave NFref serao carregados automaticamente."
                                                : "Selecione a remessa correspondente. Participante, itens e chave NFref serao carregados automaticamente."}
                                        </p>
                                    </div>

                                    <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                                        {shipmentOrigins.length === 0 ? (
                                            <p className="rounded-xl bg-white px-4 py-4 text-center text-xs font-bold text-stone-500">
                                                {purpose === "Retorno de demonstracao"
                                                    ? "Nenhuma remessa para demonstracao foi encontrada nas NF-e de entrada importadas."
                                                    : "Nenhuma remessa autorizada deste tipo foi encontrada em homologacao."}
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
                                                        ? "border-[#FACC15] bg-yellow-50"
                                                        : "border-cyan-100 bg-white hover:border-cyan-300"
                                                }`}
                                            >
                                                <span>
                                                    <span className="block text-xs font-black text-stone-900">
                                                        NF {origin.number || "-"} | {origin.recipientName || "Destinatario"}
                                                    </span>
                                                    <span className="mt-1 block text-[10px] font-bold text-stone-500">
                                                        {origin.issuedAt ? new Date(origin.issuedAt).toLocaleDateString("pt-BR") : "Data nao informada"}
                                                        {" | "}
                                                        {origin.recipientCnpj || "Documento nao informado"}
                                                    </span>
                                                </span>
                                                <span className="flex items-center gap-2 text-xs font-black text-stone-800">
                                                    {money(origin.total)}
                                                    {loadingOriginKey === origin.accessKey && <Loader2 size={14} className="animate-spin" />}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {operation === "transfer" && purpose === "Transferencia entre filiais" && (
                                <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                                    <p className="text-sm font-black text-violet-950">Filial de destino</p>
                                    <p className="mt-1 text-xs font-medium text-violet-800">
                                        Apenas lojas do mesmo tenant podem ser selecionadas. Os dados fiscais serao relidos no servidor.
                                    </p>
                                    <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                                        {transferStores.length === 0 ? (
                                            <p className="rounded-xl bg-white px-4 py-4 text-center text-xs font-bold text-stone-500">
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
                                                        ? "border-[#FACC15] bg-yellow-50"
                                                        : "border-violet-100 bg-white hover:border-violet-300"
                                                }`}
                                            >
                                                <span>
                                                    <span className="block text-xs font-black text-stone-900">{store.razao_social || store.name}</span>
                                                    <span className="mt-1 block text-[10px] font-bold text-stone-500">
                                                        {store.cnpj || "CNPJ nao informado"} | {[store.city, store.state].filter(Boolean).join(" - ") || "Endereco incompleto"}
                                                    </span>
                                                </span>
                                                {loadingOriginKey === `store-${store.id}` && <Loader2 size={14} className="animate-spin" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {operation === "transfer" && purpose === "Transferencia para deposito" && (
                                <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-xs font-bold text-violet-800">
                                    O deposito sera informado como participante cadastrado na proxima etapa. A operacao usa CFOP 5905/6905 e nao gera cobranca.
                                </div>
                            )}

                            {operation === "transfer" && purpose === "Retorno de deposito" && (
                                <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                                    <p className="text-sm font-black text-violet-950">Remessa para deposito recebida</p>
                                    <p className="mt-1 text-xs font-medium text-violet-800">
                                        Selecione uma NF-e de entrada importada com CFOP 5905/6905. O retorno usa CFOP 5906/6906.
                                    </p>
                                    <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                                        {depositTransferOrigins.length === 0 ? (
                                            <p className="rounded-xl bg-white px-4 py-4 text-center text-xs font-bold text-stone-500">
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
                                                        ? "border-[#FACC15] bg-yellow-50"
                                                        : "border-violet-100 bg-white hover:border-violet-300"
                                                }`}
                                            >
                                                <span>
                                                    <span className="block text-xs font-black text-stone-900">
                                                        NF {origin.number || "-"} | {origin.recipientName || "Deposito"}
                                                    </span>
                                                    <span className="mt-1 block text-[10px] font-bold text-stone-500">
                                                        {origin.issuedAt ? new Date(origin.issuedAt).toLocaleDateString("pt-BR") : "Data nao informada"}
                                                        {" | "}
                                                        {origin.recipientCnpj || "Documento nao informado"}
                                                    </span>
                                                </span>
                                                <span className="flex items-center gap-2 text-xs font-black text-stone-800">
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
                        <section className="space-y-5">
                            <div>
                                <h2 className="text-lg font-black text-[#1A1A1A]">Participante da nota</h2>
                                <p className="text-sm text-stone-500">
                                    {participantLocked
                                        ? "Nesta operacao, o participante vem da NF-e de origem e nao pode ser trocado."
                                        : "Busque um cadastro existente ou preencha um novo participante."}
                                </p>
                            </div>

                            {!participantLocked && (
                            <div className="inline-flex rounded-2xl border border-stone-200 bg-[#F8F7F2] p-1 shadow-sm">
                                <button
                                    type="button"
                                    onClick={() => setParticipantMode("search")}
                                    className={`rounded-xl px-4 py-2 text-xs font-black transition ${participantMode === "search" ? "bg-[#1A1A1A] text-[#FACC15] shadow-sm" : "text-stone-700 hover:bg-white"}`}
                                >
                                    Buscar cadastro
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setParticipantMode("manual");
                                        setSelectedParticipantId(null);
                                    }}
                                    className={`rounded-xl px-4 py-2 text-xs font-black transition ${participantMode === "manual" ? "bg-[#1A1A1A] text-[#FACC15] shadow-sm" : "text-stone-700 hover:bg-white"}`}
                                >
                                    Novo participante
                                </button>
                            </div>
                            )}

                            {!participantLocked && participantMode === "search" && (
                                <div className="rounded-2xl border border-stone-100 bg-[#F8F7F2] p-4">
                                    <label className={labelClass}>Buscar por nome, CPF/CNPJ ou telefone</label>
                                    <div className="relative mt-1">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" size={15} />
                                        <input
                                            value={participantSearch}
                                            onChange={(event) => setParticipantSearch(event.target.value)}
                                            className="w-full rounded-xl border border-stone-100 bg-white py-2.5 pl-9 pr-3 text-sm font-semibold text-[#1A1A1A] outline-none transition focus:border-[#FACC15] focus:ring-2 focus:ring-yellow-100"
                                            placeholder="Ex: Maria, 000.000.000-00 ou telefone"
                                        />
                                    </div>

                                    <div className="mt-3 max-h-64 overflow-y-auto space-y-2">
                                        {participantLoading ? (
                                            <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-3 text-xs font-bold text-stone-400">
                                                <Loader2 size={14} className="animate-spin" /> Buscando cadastros...
                                            </div>
                                        ) : participantSearch.trim().length < 2 ? (
                                            <p className="rounded-xl bg-white px-3 py-3 text-xs font-bold text-stone-400">Digite pelo menos 2 caracteres para buscar.</p>
                                        ) : participantResults.length === 0 ? (
                                            <p className="rounded-xl bg-white px-3 py-3 text-xs font-bold text-stone-400">Nenhum cadastro encontrado. Use &quot;Novo participante&quot;.</p>
                                        ) : (
                                            participantResults.map((participant) => (
                                                <button
                                                    key={participant.id}
                                                    type="button"
                                                    onClick={() => selectParticipant(participant)}
                                                    className={`w-full rounded-xl border p-3 text-left transition ${selectedParticipantId === participant.id ? "border-[#FACC15] bg-yellow-50" : "border-stone-100 bg-white hover:bg-yellow-50"}`}
                                                >
                                                    <p className="text-sm font-black text-[#1A1A1A]">{participant.full_name}</p>
                                                    <p className="mt-1 text-[10px] font-bold text-stone-500">
                                                        {participant.cpf || "Sem CPF"} {participant.fone_movel || participant.phone ? `| ${participant.fone_movel || participant.phone}` : ""}
                                                    </p>
                                                    <p className="mt-1 text-[10px] font-medium text-stone-400">
                                                        {[participant.rua, participant.numero, participant.bairro, participant.cidade, participant.uf].filter(Boolean).join(", ") || "Endereco nao cadastrado"}
                                                    </p>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            <fieldset disabled={participantLocked} className={`rounded-2xl border border-stone-100 bg-white p-4 ${participantLocked ? "opacity-80" : ""}`}>
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-black text-[#1A1A1A]">Dados do participante</h3>
                                        <p className="text-xs text-stone-500">Revise e complete antes de emitir.</p>
                                    </div>
                                    {selectedParticipantId && <span className="rounded-full bg-green-100 px-3 py-1 text-[10px] font-black uppercase text-green-700">Cadastro selecionado</span>}
                                </div>

                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <Field label="Nome / Razao Social" value={customerForm.nome} onChange={(v) => updateCustomerForm("nome", v)} onBlur={saveParticipantOnBlur} />
                                    <Field label="CPF / CNPJ" value={customerForm.cpfCnpj} onChange={(v) => updateCustomerForm("cpfCnpj", v)} onBlur={saveParticipantOnBlur} />
                                    <Field label="Email" value={customerForm.email} onChange={(v) => updateCustomerForm("email", v)} onBlur={saveParticipantOnBlur} />
                                    <Field label="Inscricao Estadual (se houver)" value={customerForm.inscricaoEstadual} onChange={(v) => updateCustomerForm("inscricaoEstadual", v)} onBlur={saveParticipantOnBlur} />
                                </div>

                                <div className="mt-4 rounded-2xl border border-stone-100 bg-[#F8F7F2] p-4">
                                    <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-[#1A1A1A]"><MapPin size={16} /> Endereco fiscal</h3>
                                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
                                        <div className="xl:col-span-3">
                                            <Field
                                                label={cepLoading ? "CEP buscando..." : "CEP"}
                                                value={customerForm.cep}
                                                onChange={(v) => updateCustomerForm("cep", v)}
                                                onBlur={lookupCepAndSave}
                                            />
                                        </div>
                                        <div className="xl:col-span-6"><Field label="Logradouro" value={customerForm.logradouro} onChange={(v) => updateCustomerForm("logradouro", v)} onBlur={saveParticipantOnBlur} /></div>
                                        <div className="xl:col-span-3"><Field label="Numero" value={customerForm.numero} onChange={(v) => updateCustomerForm("numero", v)} onBlur={saveParticipantOnBlur} /></div>
                                        <div className="xl:col-span-6"><Field label="Complemento" value={customerForm.complemento} onChange={(v) => updateCustomerForm("complemento", v)} onBlur={saveParticipantOnBlur} /></div>
                                        <div className="xl:col-span-6"><Field label="Bairro" value={customerForm.bairro} onChange={(v) => updateCustomerForm("bairro", v)} onBlur={saveParticipantOnBlur} /></div>
                                        <div className="xl:col-span-5"><Field label="Cidade" value={customerForm.cidade} onChange={(v) => updateCustomerForm("cidade", v)} onBlur={saveParticipantOnBlur} /></div>
                                        <div className="xl:col-span-2"><Field label="UF" value={customerForm.uf} onChange={(v) => updateCustomerForm("uf", v.toUpperCase().slice(0, 2))} onBlur={saveParticipantOnBlur} /></div>
                                        <div className="xl:col-span-5"><Field label="Codigo IBGE" value={customerForm.codigoMunicipioIbge} onChange={(v) => updateCustomerForm("codigoMunicipioIbge", onlyDigits(v).slice(0, 7))} onBlur={saveParticipantOnBlur} /></div>
                                    </div>
                                    {participantSaveState !== "idle" && (
                                        <p className={`mt-3 text-xs font-bold ${participantSaveState === "error" ? "text-red-600" : participantSaveState === "saving" ? "text-stone-500" : "text-green-700"}`}>
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
                                    <h2 className="text-lg font-black text-[#1A1A1A]">Itens</h2>
                                    <p className="text-sm text-stone-500">Produtos/mercadorias que serao enviados no XML.</p>
                                </div>
                                {!itemsLocked && (
                                    <button type="button" onClick={addItem} className="rounded-xl bg-[#1A1A1A] px-4 py-2 text-xs font-black text-[#FACC15] transition hover:bg-black">
                                        Adicionar item
                                    </button>
                                )}
                            </div>

                            <div className="space-y-4">
                                {items.map((item, index) => (
                                    <div key={index} className="rounded-3xl border border-stone-100 bg-[#F8F7F2] p-5">
                                        <div className="space-y-4">
                                            <fieldset disabled={itemsLocked} className={itemsLocked ? "opacity-80" : ""}>
                                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:items-end">
                                                <div className="xl:col-span-7">
                                                    <ProductField
                                                        label="Descricao"
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
                                                    <button type="button" onClick={() => removeItem(index)} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-stone-400 transition hover:bg-red-50 hover:text-red-500">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                            {ncmOptions?.itemIndex === index && (
                                                <div className="rounded-2xl border border-yellow-100 bg-white p-3">
                                                    <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Escolha o NCM sugerido</p>
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
                                                                className="rounded-2xl border border-stone-100 bg-[#F8F7F2] p-3 text-left transition hover:border-[#FACC15] hover:bg-yellow-50"
                                                            >
                                                                <p className="text-sm font-black text-[#1A1A1A]">{option.code}</p>
                                                                <p className="mt-1 line-clamp-2 text-[10px] font-semibold text-stone-500">{option.description}</p>
                                                                <p className="mt-2 text-[10px] font-black text-amber-700">{Math.round(option.confidence || 0)}% confianca</p>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            </fieldset>
                                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12 xl:items-end">
                                                <div className="xl:col-span-2">
                                                    <Field
                                                        label={operation === "advanced"
                                                            ? "CFOP"
                                                            : operation === "bonus"
                                                                ? "CFOP bonificacao"
                                                                : operation === "shipment"
                                                                    ? purpose.startsWith("Retorno") ? "CFOP retorno" : "CFOP remessa"
                                                                    : operation === "return"
                                                                        ? "CFOP devolucao"
                                                                        : operation === "transfer"
                                                                            ? purpose === "Retorno de deposito" ? "CFOP retorno" : "CFOP transferencia"
                                                                        : "CFOP venda"}
                                                        value={getItemCfop(item)}
                                                        onChange={(v) => updateItem(index, { cfop: onlyDigits(v).slice(0, 4) })}
                                                        disabled={operation !== "advanced"}
                                                        title={operation === "advanced" ? "CFOP liberado para outra operacao." : "CFOP calculado pela UF da loja e do participante."}
                                                    />
                                                </div>
                                                <div className="xl:col-span-2">
                                                    <UnitSelect value={item.unidade} onChange={(value) => updateItem(index, { unidade: value })} disabled={itemsLocked} />
                                                </div>
                                                <div className="xl:col-span-2">
                                                    <NumberField
                                                        label={itemsLocked ? `Qtd (max. ${item.maxQuantity || item.quantidade})` : "Qtd"}
                                                        value={item.quantidade}
                                                        onChange={(v) => updateItem(index, { quantidade: v })}
                                                        max={itemsLocked ? item.maxQuantity : undefined}
                                                    />
                                                </div>
                                                <div className="xl:col-span-3"><NumberField label="Unit." value={item.valorUnitario} onChange={(v) => updateItem(index, { valorUnitario: v })} disabled={itemsLocked} /></div>
                                                <div className="xl:col-span-3 rounded-2xl bg-white px-4 py-3 text-right">
                                                    <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">Total do item</p>
                                                    <p className="mt-1 text-lg font-black text-[#1A1A1A]">{money(item.valorTotal)}</p>
                                                </div>
                                            </div>
                                            {operation === "advanced" && (
                                                <div className="space-y-4 rounded-2xl border border-amber-200 bg-white p-4">
                                                    <p className="text-[11px] font-black uppercase tracking-wider text-amber-800">Tributacao assistida do item</p>
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
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-stone-600">
                                    <Truck size={20} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-[#1A1A1A]">Transporte e observacoes</h2>
                                    <p className="text-sm text-stone-500">Parametros adicionais que seguem no XML da NF-e.</p>
                                </div>
                            </div>

                            {operation !== "advanced" ? (
                                <div className="rounded-2xl border border-stone-200 bg-[#F8F7F2] p-5 text-sm font-semibold text-stone-600">
                                    Nesta etapa os templates guiados continuam usando sem ocorrencia de transporte e suas observacoes padrao.
                                </div>
                            ) : (
                                <>
                                    <div className="rounded-2xl border border-stone-200 bg-[#F8F7F2] p-4">
                                        <label className={labelClass}>Modalidade do frete</label>
                                        <select value={modFrete} onChange={(e) => setModFrete(Number(e.target.value))} className={fieldClass}>
                                            <option value={9}>9 - Sem transporte</option>
                                            <option value={0}>0 - Por conta do emitente</option>
                                            <option value={1}>1 - Por conta do destinatario</option>
                                            <option value={2}>2 - Por conta de terceiros</option>
                                            <option value={3}>3 - Proprio por conta do remetente</option>
                                            <option value={4}>4 - Proprio por conta do destinatario</option>
                                        </select>
                                        {modFrete !== 9 && (
                                            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                                                <Field label="Transportadora" value={carrierName} onChange={setCarrierName} />
                                                <Field label="CPF/CNPJ" value={carrierDoc} onChange={(v) => setCarrierDoc(onlyDigits(v).slice(0, 14))} />
                                                <NumberField label="Volumes" value={volumes} onChange={setVolumes} />
                                            </div>
                                        )}
                                    </div>

                                    <div className="rounded-2xl border border-stone-200 bg-[#F8F7F2] p-4">
                                        <p className="text-sm font-black text-[#1A1A1A]">Parametros fiscais</p>
                                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
                                            <div>
                                                <label className={labelClass}>Presenca</label>
                                                <select value={indPres} onChange={(e) => setIndPres(Number(e.target.value))} className={fieldClass}>
                                                    <option value={0}>0 - Nao se aplica</option>
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
                                                    <option value={0}>0 - Nao</option>
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
                                                    <option value="03">03 - Cartao de credito</option>
                                                    <option value="04">04 - Cartao de debito</option>
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
                                        <NumberField label="Frete" value={valorFrete} onChange={setValorFrete} />
                                        <NumberField label="Seguro" value={valorSeguro} onChange={setValorSeguro} />
                                        <NumberField label="Desconto" value={valorDesconto} onChange={setValorDesconto} />
                                        <NumberField label="Outras despesas" value={valorOutrasDespesas} onChange={setValorOutrasDespesas} />
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                        <TextAreaField label="Informacoes complementares" value={infCpl} onChange={setInfCpl} />
                                        <TextAreaField label="Informacoes ao Fisco" value={infAdFisco} onChange={setInfAdFisco} />
                                    </div>
                                </>
                            )}
                        </section>
                    )}

                    {step === "review" && (
                        <section className="space-y-5">
                            <div>
                                <h2 className="text-lg font-black text-[#1A1A1A]">Revisao</h2>
                                <p className="text-sm text-stone-500">Confira os dados principais antes de transmitir.</p>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <ReviewCard label="Operacao" value={`${currentOperation.title} - ${purpose}`} />
                                <ReviewCard
                                    label="Origem"
                                    value={selectedShipmentOrigin
                                        ? `Remessa NF-e ${selectedShipmentOrigin.number || "-"} | chave ${selectedShipmentOrigin.accessKey}`
                                        : selectedDepositTransferOrigin
                                            ? `Transferencia NF-e ${selectedDepositTransferOrigin.number || "-"} | chave ${selectedDepositTransferOrigin.accessKey}`
                                            : selectedTransferStore
                                                ? `Filial ${selectedTransferStore.razao_social || selectedTransferStore.name}`
                                                : selectedOrigin
                                                    ? `NF-e ${selectedOrigin.number || "-"} | chave ${selectedOrigin.accessKey}`
                                                    : selectedSale
                                                        ? `Venda #${selectedSale.id}`
                                                        : "NF-e avulsa/manual"}
                                />
                                <ReviewCard label="Destinatario" value={customerForm.nome || "Nao informado"} />
                                <ReviewCard label="Documento" value={customerForm.cpfCnpj || "Nao informado"} />
                                <ReviewCard label="Itens" value={String(items.length)} />
                                <ReviewCard label="Total" value={money(total)} />
                            </div>
                            {pendingIssues.length > 0 ? (
                                <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
                                    <p className="font-black text-red-800">Pendencias antes de emitir</p>
                                    <ul className="mt-2 space-y-1 text-xs font-bold text-red-700">
                                        {pendingIssues.map((issue) => <li key={issue}>{issue}</li>)}
                                    </ul>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-green-100 bg-green-50 p-4 text-sm font-black text-green-800">
                                    Dados minimos completos para emissao em homologacao.
                                </div>
                            )}
                            {operation === "advanced" && aiAudit && (
                                <div className={`rounded-2xl border p-4 ${
                                    aiAudit.status === "inconsistente"
                                        ? "border-red-200 bg-red-50"
                                        : aiAudit.status === "atencao"
                                            ? "border-amber-200 bg-amber-50"
                                            : "border-green-200 bg-green-50"
                                }`}>
                                    <p className="font-black text-stone-900">Auditoria da operacao assistida</p>
                                    <p className="mt-1 text-sm font-semibold text-stone-700">{aiAudit.resumo}</p>
                                    {aiAudit.achados.length > 0 && (
                                        <div className="mt-3 space-y-2">
                                            {aiAudit.achados.map((finding, index) => (
                                                <div key={`${finding.titulo || "achado"}-${index}`} className="rounded-xl bg-white/80 p-3 text-xs text-stone-700">
                                                    <p className="font-black">{finding.titulo || "Ponto para revisar"}</p>
                                                    {finding.detalhe && <p className="mt-1">{finding.detalhe}</p>}
                                                    {finding.sugestao && <p className="mt-1 font-bold">Sugestao: {finding.sugestao}</p>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <p className="mt-3 text-xs font-bold text-stone-600">{aiAudit.aviso}</p>
                                    <label className="mt-4 flex items-start gap-2 rounded-xl border border-stone-200 bg-white p-3 text-sm font-semibold text-stone-800">
                                        <input
                                            type="checkbox"
                                            checked={advancedAuditConfirmed}
                                            onChange={(e) => setAdvancedAuditConfirmed(e.target.checked)}
                                            className="mt-0.5 h-4 w-4 accent-stone-900"
                                        />
                                        Revisei os pontos com meu contador e confirmo a emissao deste rascunho.
                                    </label>
                                </div>
                            )}
                        </section>
                    )}

                    <div className="mt-6 flex items-center justify-between border-t border-stone-100 pt-4">
                        <button type="button" onClick={goBack} disabled={stepIndex === 0} className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-black text-stone-600 transition hover:bg-stone-50 disabled:opacity-40">
                            <ChevronLeft size={16} /> Voltar
                        </button>
                        {step !== "review" ? (
                            <button type="button" onClick={goNext} className="flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-4 py-2 text-sm font-black text-[#FACC15] transition hover:bg-black">
                                Proximo <ChevronRight size={16} />
                            </button>
                        ) : (
                            <button type="button" disabled={pendingIssues.length > 0 || emitting || aiAuditLoading || loadingSaleData} onClick={handleEmit} className="flex items-center gap-2 rounded-xl bg-[#FACC15] px-4 py-2 text-sm font-black text-[#1A1A1A] transition hover:bg-yellow-300 disabled:opacity-40">
                                {(emitting || aiAuditLoading) ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                {aiAuditLoading
                                    ? `Tentativa ${aiAuditAttempt || 1}/6`
                                    : emitting
                                    ? "Emitindo..."
                                    : operation === "advanced" && (!aiAudit || !advancedAuditConfirmed)
                                        ? "Revisao final"
                                    : operation === "bonus"
                                        ? `Emitir NF-e de ${purpose}`
                                        : operation === "return"
                                            ? "Emitir NF-e de Devolucao"
                                            : operation === "shipment"
                                                ? `Emitir NF-e de ${purpose}`
                                            : operation === "transfer"
                                                ? `Emitir NF-e de ${purpose}`
                                            : operation === "advanced"
                                                ? "Emitir NF-e assistida"
                                            : "Emitir NF-e de Venda"}
                            </button>
                        )}
                    </div>
                </main>

                <aside className="space-y-3">
                    <div className="rounded-2xl border border-stone-100 bg-white p-4 shadow-sm">
                        <p className="text-xs font-black uppercase text-stone-400">Resumo</p>
                        <div className="mt-3 space-y-2 text-sm">
                            <SummaryRow label="Operacao" value={currentOperation.title} />
                            <SummaryRow label="Finalidade" value={purpose} />
                            <SummaryRow
                                label="Origem"
                                value={selectedShipmentOrigin
                                    ? `Remessa NF-e ${selectedShipmentOrigin.number || "-"}`
                                    : selectedDepositTransferOrigin
                                        ? `Transferencia NF-e ${selectedDepositTransferOrigin.number || "-"}`
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

                    <div className="rounded-2xl border border-stone-100 bg-white p-4 shadow-sm">
                        {operation === "bonus" || operation === "return" || operation === "shipment" || operation === "transfer" ? (
                            <>
                                <p className={labelClass}>Pagamento</p>
                                <p className="mt-2 rounded-2xl bg-[#F8F7F2] px-4 py-3 text-sm font-black text-stone-700">Sem pagamento</p>
                                <p className="mt-2 text-[10px] font-semibold text-stone-400">O template envia tPag 90 e vPag 0.</p>
                            </>
                        ) : (
                            <>
                                <label className={labelClass}>Pagamento</label>
                                <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className={fieldClass}>
                                    <option value="01">Dinheiro</option>
                                    <option value="17">Pix</option>
                                    <option value="03">Cartao credito</option>
                                    <option value="04">Cartao debito</option>
                                    <option value="15">Boleto</option>
                                    <option value="99">Outro</option>
                                </select>
                            </>
                        )}
                    </div>

                    <div className={`rounded-2xl border p-4 shadow-sm ${pendingIssues.length ? "border-red-100 bg-red-50" : "border-green-100 bg-green-50"}`}>
                        <p className={`text-xs font-black uppercase ${pendingIssues.length ? "text-red-500" : "text-green-600"}`}>Validacao</p>
                        {pendingIssues.length ? (
                            <p className="mt-2 text-sm font-bold text-red-800">{pendingIssues.length} pendencia(s) antes de emitir.</p>
                        ) : (
                            <p className="mt-2 text-sm font-bold text-green-800">Pronto para homologacao.</p>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}

const labelClass = "ml-1 text-[10px] font-black uppercase tracking-wider text-stone-400";
const fieldClass = "mt-1.5 w-full rounded-2xl border border-stone-100 bg-white px-4 py-3 text-sm font-semibold text-[#1A1A1A] outline-none transition focus:border-[#FACC15] focus:ring-2 focus:ring-yellow-100";

function Field({
    label,
    value,
    onChange,
    onBlur,
    disabled,
    title,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    disabled?: boolean;
    title?: string;
}) {
    return (
        <label className="block">
            <span className={labelClass}>{label}</span>
            <input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onBlur={onBlur}
                disabled={disabled}
                title={title}
                className={`${fieldClass} disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500`}
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
        <label className="block">
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
}: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    disabled?: boolean;
    max?: number;
}) {
    return (
        <label className="block">
            <span className={labelClass}>{label}</span>
            <input
                type="number"
                step="0.01"
                min="0"
                max={max}
                value={value}
                disabled={disabled}
                onChange={(event) => onChange(Number(event.target.value))}
                className={`${fieldClass} disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500`}
            />
        </label>
    );
}

function UnitSelect({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
    const currentValue = value || "UN";

    return (
        <label className="block">
            <span className={labelClass}>Unidade</span>
            <select value={currentValue} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={`${fieldClass} disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500`}>
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
        <label className="block">
            <span className="ml-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-stone-400">
                NCM
                {status && (
                    <span className={`rounded-full px-2 py-0.5 text-[9px] ${
                        status.tone === "green"
                            ? "bg-emerald-100 text-emerald-700"
                            : status.tone === "yellow"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-700"
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
                    className={`w-full rounded-2xl border border-stone-100 bg-white py-3 pl-4 text-sm font-semibold tracking-wider text-[#1A1A1A] outline-none transition focus:border-[#FACC15] focus:ring-2 focus:ring-yellow-100 ${hasNcm ? "pr-4" : "pr-12"}`}
                />
                {!hasNcm && (
                    <button
                        type="button"
                        onClick={onFetch}
                        disabled={loading}
                        className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-stone-500 transition hover:bg-yellow-50 hover:text-[#1A1A1A] disabled:opacity-60"
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
            <span className="text-stone-500">{label}</span>
            <span className={`text-right font-black ${strong ? "text-[#1A1A1A]" : "text-stone-800"}`}>{value}</span>
        </div>
    );
}

function ReviewCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-stone-100 bg-[#F8F7F2] p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">{label}</p>
            <p className="mt-1 text-sm font-black text-[#1A1A1A]">{value}</p>
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
                <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-stone-100 bg-white shadow-xl">
                    {loading ? (
                        <div className="flex items-center gap-2 px-3 py-3 text-xs text-stone-400">
                            <Loader2 size={14} className="animate-spin" /> Buscando...
                        </div>
                    ) : results.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-stone-400">Nenhum produto encontrado.</div>
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
                                className="w-full px-3 py-2 text-left transition hover:bg-yellow-50"
                            >
                                <p className="text-xs font-black text-[#1A1A1A]">{product.nome}</p>
                                <p className="text-[10px] text-stone-400">{money(Number(product.preco_venda || 0))} | NCM {product.ncm || "nao informado"}</p>
                            </button>
                        ))
                    )}
                </div>
            )}
        </label>
    );
}
