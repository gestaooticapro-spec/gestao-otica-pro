import { ReceiptPhantom } from '@/components/print/ReceiptPhantom'

export async function generateReceiptHtml(data: any) {
  const { renderToStaticMarkup } = await import('react-dom/server')

  const componentHtml = renderToStaticMarkup(<ReceiptPhantom data={data} />)

  // REMOVI AS TAGS HTML/BODY E DOCTYPE QUE PODEM ESTAR BLOQUEANDO A HP
  // Enviamos apenas a DIV container. O Gmail/Outlook cria o corpo do email automaticamente.
  return `
    <div style="width: 100%; font-family: sans-serif; background-color: white;">
       ${componentHtml}
    </div>
  `
}