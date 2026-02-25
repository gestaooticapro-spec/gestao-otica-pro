/**
 * Utilitário para abrir WhatsApp.
 * Abre via api.whatsapp.com e fecha a aba intermediária automaticamente.
 */
export function openWhatsApp(phone: string, message: string) {
    const cleanPhone = phone.replace(/\D/g, '')
    const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`
    const encodedMsg = encodeURIComponent(message)

    const url = `https://api.whatsapp.com/send?phone=${fullPhone}&text=${encodedMsg}`

    // Abre a aba e guarda a referência pra fechar depois
    const win = window.open(url, '_blank')

    // Fecha a aba intermediária após 3 segundos (tempo suficiente pro redirect pro app)
    if (win) {
        setTimeout(() => {
            try { win.close() } catch { }
        }, 3000)
    }
}
