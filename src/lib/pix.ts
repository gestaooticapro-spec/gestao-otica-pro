export class PixPayload {
    private key: string;
    private name: string;
    private city: string;
    private amount: string;
    private txid: string;

    constructor(key: string, name: string, city: string, amount: number, txid: string = '***') {
        this.key = this.normalizeKey(key);
        this.name = this.normalizeString(name).substring(0, 25);
        this.city = this.normalizeString(city).substring(0, 15);
        this.amount = amount.toFixed(2);
        this.txid = txid;
    }

    private normalizeKey(key: string): string {
        // Se tiver @, assume que é email e mantém
        if (key.includes('@')) return key.trim();

        // Se tem mais de 30 chars e tem traços -> Aleatória (UUID) -> Mantém
        if (key.length > 30 && key.includes('-')) return key.trim();

        // Caso contrário (CPF/CNPJ/Tel) -> Remove tudo que não é letra/número
        return key.replace(/[^a-zA-Z0-9]/g, '');
    }

    private normalizeString(str: string): string {
        return str
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remove acentos
            .replace(/[^a-zA-Z0-9 ]/g, '')   // Remove caracteres especiais
            .replace(/\s+/g, ' ')            // Remove espaços duplos
            .trim()
            .toUpperCase();
    }

    private formatField(id: string, value: string): string {
        const len = value.length.toString().padStart(2, '0');
        return `${id}${len}${value}`;
    }

    public getPayload(): string {
        const payloadKey = [
            this.formatField('00', 'BR.GOV.BCB.PIX'),
            this.formatField('01', this.key),
        ].join('');

        const payload = [
            this.formatField('00', '01'), // Payload Format Indicator
            this.formatField('26', payloadKey), // Merchant Account Information
            this.formatField('52', '0000'), // Merchant Category Code
            this.formatField('53', '986'), // Transaction Currency (BRL)
            this.formatField('54', this.amount), // Transaction Amount
            this.formatField('58', 'BR'), // Country Code
            this.formatField('59', this.name), // Merchant Name
            this.formatField('60', this.city), // Merchant City
            this.formatField('62', this.formatField('05', this.txid)), // Additional Data Field Template (TxID)
            '6304', // CRC16 ID + Length
        ].join('');

        const crc = this.crc16ccitt(payload).toUpperCase();
        return `${payload}${crc}`;
    }

    private crc16ccitt(str: string): string {
        let crc = 0xFFFF; // Valor inicial padrão do Pix (CRC16/CCITT-FALSE)

        for (let i = 0; i < str.length; i++) {
            crc ^= str.charCodeAt(i) << 8;
            for (let j = 0; j < 8; j++) {
                if ((crc & 0x8000) !== 0) {
                    crc = (crc << 1) ^ 0x1021;
                } else {
                    crc = crc << 1;
                }
            }
        }

        return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
    }
}
