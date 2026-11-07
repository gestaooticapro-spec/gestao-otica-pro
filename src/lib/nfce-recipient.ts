import { documentDigits } from './customer-document'

type Customer = {
    person_type?: string | null
    cpf?: string | null
    cnpj?: string | null
    full_name?: string | null
    razao_social?: string | null
    nome_fantasia?: string | null
    email?: string | null
    rua?: string | null
    numero?: string | number | null
    complemento?: string | null
    bairro?: string | null
    cidade?: string | null
    uf?: string | null
    cep?: string | null
    codigo_municipio_ibge?: string | number | null
    inscricao_estadual?: string | null
}

/** Personal data may only accompany the document stored on this customer. */
export function nfceRecipient(document: string, customer?: Customer | null) {
    const cpf_cnpj = documentDigits(document)
    const registeredDocument = documentDigits(customer?.person_type === 'PJ' ? customer.cnpj : customer?.cpf)
    if (!cpf_cnpj || !registeredDocument || cpf_cnpj !== registeredDocument || !customer) {
        return { cpf_cnpj, nome: '' }
    }
    const pj = customer.person_type === 'PJ'
    return {
        cpf_cnpj,
        nome: (pj ? customer.razao_social || customer.full_name : customer.full_name) || '',
        razao_social: pj ? customer.razao_social || undefined : undefined,
        nome_fantasia: pj ? customer.nome_fantasia || undefined : undefined,
        email: customer.email || undefined,
        endereco: {
            logradouro: customer.rua || undefined,
            numero: customer.numero == null ? undefined : String(customer.numero),
            complemento: customer.complemento || undefined,
            bairro: customer.bairro || undefined,
            cidade: customer.cidade || undefined,
            uf: customer.uf || undefined,
            cep: customer.cep || undefined,
            codigo_municipio: customer.codigo_municipio_ibge || undefined,
            inscricao_estadual: pj ? customer.inscricao_estadual || undefined : undefined,
        },
    }
}
