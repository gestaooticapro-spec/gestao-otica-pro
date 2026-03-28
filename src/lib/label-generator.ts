// ARQUIVO: src/lib/label-generator.ts
import jsPDF from 'jspdf'
import QRCode from 'qrcode'

// Label sheet templates (dimensions in mm)
export type LabelTemplate = {
    name: string
    code: string
    columns: number
    rows: number
    labelWidth: number
    labelHeight: number
    marginTop: number
    marginLeft: number
    gapHorizontal: number
    gapVertical: number
    pageWidth: number
    pageHeight: number
}

export const LABEL_TEMPLATES: LabelTemplate[] = [
    {
        name: 'Pimaco 6180 (3x10)',
        code: '6180',
        columns: 3,
        rows: 10,
        labelWidth: 25.4,
        labelHeight: 66.7,
        marginTop: 12.7,
        marginLeft: 4.7,
        gapHorizontal: 3.2,
        gapVertical: 0,
        pageWidth: 210,
        pageHeight: 297
    },
    {
        name: 'Pimaco 6080 (3x8)',
        code: '6080',
        columns: 3,
        rows: 8,
        labelWidth: 25.4,
        labelHeight: 33.9,
        marginTop: 12.7,
        marginLeft: 4.7,
        gapHorizontal: 3.2,
        gapVertical: 0,
        pageWidth: 210,
        pageHeight: 297
    },
    {
        name: 'Pimaco 6280 (2x5)',
        code: '6280',
        columns: 2,
        rows: 5,
        labelWidth: 88.9,
        labelHeight: 50.8,
        marginTop: 12.7,
        marginLeft: 12.2,
        gapHorizontal: 8,
        gapVertical: 0,
        pageWidth: 210,
        pageHeight: 297
    },
    {
        name: 'Joalheria 25x10mm (7x29)',
        code: 'JOALHERIA',
        columns: 7,
        rows: 29,
        labelWidth: 25,
        labelHeight: 10,
        marginTop: 3,
        marginLeft: 5,
        gapHorizontal: 2.14,
        gapVertical: 0,
        pageWidth: 210,
        pageHeight: 297
    }
]

export type LabelItem = {
    productName: string
    barcode: string | null
    price: number
    ref: string | null
    quantity: number
}

// Simple Code128 barcode drawing using only jsPDF lines
// This is a minimal implementation that generates bars directly
function drawBarcode(doc: jsPDF, code: string, x: number, y: number, width: number, height: number) {
    if (!code || code.trim() === '') return

    // Draw the barcode text below
    const fontSize = Math.min(6, width * 0.08)
    doc.setFontSize(fontSize)
    doc.setFont('courier', 'normal')
    doc.text(code, x + width / 2, y + height + fontSize * 0.4, { align: 'center' })

    // Draw simple bars representation
    // We'll use a pattern based on the code characters
    const totalBars = code.length * 6 + 10
    const barWidth = width / totalBars
    let currentX = x

    // Start pattern
    doc.setFillColor(0, 0, 0)

    for (let i = 0; i < code.length; i++) {
        const charCode = code.charCodeAt(i)
        // Generate a deterministic pattern from char code
        const pattern = [
            (charCode >> 0) & 1,
            (charCode >> 1) & 1,
            (charCode >> 2) & 1,
            (charCode >> 3) & 1,
            (charCode >> 4) & 1,
            1 // separator
        ]

        for (const bit of pattern) {
            if (bit === 1) {
                doc.rect(currentX, y, barWidth, height, 'F')
            }
            currentX += barWidth
        }
    }
}

async function drawQRCode(doc: jsPDF, code: string, x: number, y: number, size: number) {
    if (!code || code.trim() === '') return

    try {
        const qrDataUrl = await QRCode.toDataURL(code, {
            margin: 0,
            errorCorrectionLevel: 'M', // Médio, bom equilíbrio de tamanho e dados
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        })
        doc.addImage(qrDataUrl, 'PNG', x, y, size, size)
    } catch (err) {
        console.error('Error generating QR code:', err)
    }
}

async function drawLabelContent(
    doc: jsPDF,
    item: LabelItem,
    x: number,
    y: number,
    width: number,
    height: number,
    codeType: 'barcode' | 'qrcode' = 'barcode'
) {
    const padding = 1
    const innerX = x + padding
    const innerY = y + padding
    const innerW = width - padding * 2
    const innerH = height - padding * 2

    // Product name (top)
    const nameFontSize = Math.min(7, innerW * 0.1)
    doc.setFontSize(nameFontSize)
    doc.setFont('helvetica', 'bold')

    const maxChars = Math.floor(innerW / (nameFontSize * 0.22))
    const truncatedName = item.productName.length > maxChars
        ? item.productName.substring(0, maxChars - 2) + '..'
        : item.productName

    doc.text(truncatedName, innerX + innerW / 2, innerY + nameFontSize * 0.4, { align: 'center' })

    // Reference (if exists)
    let refOffset = 0
    if (item.ref) {
        refOffset = nameFontSize * 0.45
        doc.setFontSize(Math.max(4, nameFontSize - 2))
        doc.setFont('helvetica', 'normal')
        doc.text(`Ref: ${item.ref}`, innerX + innerW / 2, innerY + nameFontSize * 0.4 + refOffset, { align: 'center' })
    }

    // Barcode (middle)
    if (item.barcode) {
        if (codeType === 'qrcode') {
            const qrSize = Math.min(innerW * 0.45, innerH * 0.45) // Define um quadrado
            const qrX = innerX + (innerW - qrSize) / 2
            const qrY = innerY + nameFontSize * 0.7 + refOffset + 0.5
            await drawQRCode(doc, item.barcode, qrX, qrY, qrSize)
        } else {
            const barcodeY = innerY + nameFontSize * 0.6 + refOffset + 1
            const barcodeHeight = Math.min(innerH * 0.35, 8)
            drawBarcode(doc, item.barcode, innerX + 1, barcodeY, innerW - 2, barcodeHeight)
        }
    }

    // Price (bottom)
    const priceFontSize = Math.min(9, innerW * 0.12)
    doc.setFontSize(priceFontSize)
    doc.setFont('helvetica', 'bold')
    const priceText = `R$ ${item.price.toFixed(2).replace('.', ',')}`
    doc.text(priceText, innerX + innerW / 2, innerY + innerH - 1, { align: 'center' })
}

export async function generateLabelsPDF(
    items: LabelItem[],
    template: LabelTemplate,
    startPosition: number = 1,
    codeType: 'barcode' | 'qrcode' = 'barcode'
): Promise<Buffer> {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [template.pageWidth, template.pageHeight]
    })

    const labelsPerPage = template.columns * template.rows
    let currentPosition = startPosition - 1 // 0-indexed

    // Flatten items into individual labels
    const allLabels: LabelItem[] = []
    for (const item of items) {
        for (let i = 0; i < item.quantity; i++) {
            allLabels.push(item)
        }
    }

    let isFirstPage = true

    for (let labelIdx = 0; labelIdx < allLabels.length; labelIdx++) {
        // Check if we need a new page
        if (currentPosition >= labelsPerPage) {
            doc.addPage()
            currentPosition = 0
            isFirstPage = false
        } else if (labelIdx === 0 && !isFirstPage) {
            doc.addPage()
        }

        // Calculate row and column
        const col = currentPosition % template.columns
        const row = Math.floor(currentPosition / template.columns)

        // Calculate position
        const x = template.marginLeft + col * (template.labelWidth + template.gapHorizontal)
        const y = template.marginTop + row * (template.labelHeight + template.gapVertical)

        // Draw label content
        await drawLabelContent(doc, allLabels[labelIdx], x, y, template.labelWidth, template.labelHeight, codeType)

        currentPosition++
    }

    return Buffer.from(doc.output('arraybuffer'))
}
