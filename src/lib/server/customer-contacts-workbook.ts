import JSZip from 'jszip'

export type CustomerContactRow = {
  full_name: string | null
  fone_movel: string | null
  phone: string | null
}

function formatBrazilianPhone(digits: string) {
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  if (digits.length === 9) return `${digits.slice(0, 5)}-${digits.slice(5)}`
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`
  return digits
}

export function formatCustomerPhone(value: string | null | undefined) {
  const digits = String(value || '').replace(/\D/g, '')
  if (!digits) return ''

  if (digits.startsWith('595') && digits.length > 3) {
    const local = digits.slice(3)
    const groups = [local.slice(0, 3), local.slice(3, 6), local.slice(6)].filter(Boolean)
    return `+595 ${groups.join(' ')}`
  }

  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return `+55 ${formatBrazilianPhone(digits.slice(2))}`
  }

  return formatBrazilianPhone(digits)
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function inlineStringCell(reference: string, value: string, style: number) {
  const preserveWhitespace = /^\s|\s$/.test(value) ? ' xml:space="preserve"' : ''
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t${preserveWhitespace}>${escapeXml(value)}</t></is></c>`
}

function buildWorksheetXml(customers: CustomerContactRow[]) {
  const dataRows = customers.map((customer, index) => {
    const rowNumber = index + 2
    const style = index % 2 === 0 ? 2 : 3
    const name = String(customer.full_name || '').trim()
    const phone = formatCustomerPhone(customer.fone_movel || customer.phone)
    return `<row r="${rowNumber}" ht="20" customHeight="1">${inlineStringCell(`A${rowNumber}`, name, style)}${inlineStringCell(`B${rowNumber}`, phone, style)}</row>`
  }).join('')
  const lastRow = Math.max(customers.length + 1, 1)

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:B${lastRow}"/>
  <sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  <cols><col min="1" max="1" width="42" customWidth="1"/><col min="2" max="2" width="24" customWidth="1"/></cols>
  <sheetData><row r="1" ht="24" customHeight="1">${inlineStringCell('A1', 'Nome', 1)}${inlineStringCell('B1', 'Telefone', 1)}</row>${dataRows}</sheetData>
  <autoFilter ref="A1:B${lastRow}"/>
</worksheet>`
}

export async function buildCustomerContactsWorkbook(customers: CustomerContactRow[]) {
  const zip = new JSZip()
  const timestamp = new Date().toISOString()

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`)
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`)
  zip.folder('docProps')?.file('core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>MB Optical</dc:creator><cp:lastModifiedBy>MB Optical</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified>
</cp:coreProperties>`)
  zip.folder('docProps')?.file('app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>MB Optical</Application></Properties>`)
  zip.folder('xl')?.file('workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="Clientes" sheetId="1" r:id="rId1"/></sheets></workbook>`)
  zip.folder('xl')?.folder('_rels')?.file('workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`)
  zip.folder('xl')?.file('styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>
  <fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E3A5F"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF2F8"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD9E2EC"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center" horizontal="left"/></xf><xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center" horizontal="left"/></xf><xf numFmtId="49" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center" horizontal="left"/></xf></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`)
  zip.folder('xl')?.folder('worksheets')?.file('sheet1.xml', buildWorksheetXml(customers))

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
