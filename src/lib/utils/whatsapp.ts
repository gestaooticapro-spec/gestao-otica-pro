/**
 * Utilitário para abrir WhatsApp.
 * Abre via api.whatsapp.com e fecha a aba intermediária automaticamente.
 * Handles international numbers (with '+' prefix) and Brazilian numbers.
 */
export function openWhatsApp(phone: string, message: string) {
    const raw = phone.trim()
    let digits: string

    if (raw.startsWith('+')) {
        // International number — already has country code
        digits = raw.replace(/\D/g, '')
    } else {
        digits = raw.replace(/\D/g, '')
        if (digits.length < 12) {
            digits = `55${digits}`
        }
    }

    const encodedMsg = encodeURIComponent(message)
    const url = `https://api.whatsapp.com/send?phone=${digits}&text=${encodedMsg}`

    // Abre a aba e guarda a referência pra fechar depois
    const win = window.open(url, '_blank')

    // Fecha a aba intermediária após 3 segundos (tempo suficiente pro redirect pro app)
    if (win) {
        setTimeout(() => {
            try { win.close() } catch { }
        }, 3000)
    }
}
