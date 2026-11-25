import Image from 'next/image'
import Link from 'next/link'
import QRCode from 'qrcode'
import TowerDirectoryAdmin from '@/components/admin/TowerDirectoryAdmin'
import LogoutButton from '@/components/LogoutButton'
import { getTowerDirectoryData } from '@/lib/actions/tower-admin.actions'
import styles from './guide.module.css'

const installations = '/admin/torres?vista=instalacoes'
const equipment = '/admin/torres/equipamentos'

const neoManagerVersion = '0.0.15'
const neoManagerApkUrl = 'https://apk.mentebinaria.com/releases/dpc/0.0.15/NeoSmart-DPC-0.0.15-CE813CA8.apk'
const neoManagerApkSha256 = 'CE813CA8DE1FFE90F60DDEC0C0B61C47CAF54F8142EE5ADA2CDB453924126E90'
const tabletApkUrl = 'https://apk.mentebinaria.com/releases/tablet/0.0.21/NeoSmart-Tablet-0.0.21-C9451181.apk'

function createQr(value: string) {
  return QRCode.toDataURL(value, { errorCorrectionLevel: 'M', scale: 8, margin: 4 })
}

function createAndroidProvisioningQr() {
  return createQr(JSON.stringify({
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME': 'br.com.mboptical.neosmart.dpc/.NeoSmartAdminReceiver',
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION': neoManagerApkUrl,
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM': Buffer.from(neoManagerApkSha256, 'hex').toString('base64url'),
  }))
}

function getWindowsInstaller() {
  const version = process.env.NEOSMART_INITIAL_WINDOWS_VERSION
  const sha256 = process.env.NEOSMART_INITIAL_WINDOWS_SHA256
  if (!version || !/^\d{1,9}\.\d{1,9}\.\d{1,9}$/.test(version) || !sha256 || !/^[a-f0-9]{64}$/i.test(sha256)) return null

  const file = 'Neosmart-Setup-' + version + '-x64.exe'
  return { file, sha256, url: 'https://updates.mentebinaria.com/releases/' + version + '/' + file }
}

function GuideQr({ src, label, url }: { src: string; label: string; url?: string }) {
  return (
    <figure className={styles.provisioningQr}>
      <figcaption>{label}</figcaption>
      <div className={styles.qrActions}>
        <details name="neosmart-guide-qr" className={styles.qrDisclosure}>
          <summary className={styles.action}>
            <span className={styles.showQr}>Mostrar QR</span>
            <span className={styles.hideQr}>Ocultar QR</span>
            <span className="sr-only">{' — ' + label}</span>
          </summary>
          <Image alt={label} src={src} width={320} height={320} unoptimized />
        </details>
        {url && <a href={url} className={styles.action} aria-label={label}>Abrir link de download</a>}
      </div>
    </figure>
  )
}

const steps = [
  {
    id: 'identificar',
    title: 'Identifique o equipamento físico',
    paragraphs: [
      'Coloque uma etiqueta no mini PC. O código público impresso identifica a Torre em caso de avaria, manutenção, substituição ou aposentadoria.',
      'Em Equipamentos físicos, use a busca pelo código, lote ou estado para localizar uma identidade disponível. Se precisar de mais etiquetas, abra Gerar lote, preencha o nome, a quantidade e o ano e clique em Gerar lote. Em Lotes, use Abrir etiquetas para imprimir, marque as etiquetas como impressas e cole a escolhida no mini PC. Confira o código no inventário antes de continuar.',
    ],
    actions: [
      { href: equipment, label: 'Ver equipamentos e etiquetas' },
      { href: equipment + '#gerar-lote', label: 'Ir para Gerar lote' },
    ],
  },
  {
    id: 'loja',
    title: 'Cadastre ou localize a loja',
    paragraphs: [
      'Em Nova loja com Torre, escolha uma empresa existente ou crie uma empresa. Preencha o nome da loja e os dados solicitados, confira o destino e selecione Criar loja e gerar ativação. Para uma loja já cadastrada, abra Lojas e instalações e confira o nome da empresa e da loja.',
      'O cadastro novo já mostra uma ativação. Para a instalação com etiqueta, use o QR emitido em Gerar associação na etapa Vincule a Torre à loja. Esse QR é vinculado ao equipamento físico escolhido.',
    ],
    actions: [
      { href: '/admin/torres/nova', label: 'Nova loja com Torre' },
      { href: installations, label: 'Ver lojas e instalações' },
    ],
  },
  {
    id: 'instalar',
    title: 'Baixe e instale o NeoSmart no mini PC',
    paragraphs: [
      'Conecte o monitor do cliente, a câmera, um teclado temporário e a internet. Prepare o Windows x64 e a conta que será usada diariamente pela Torre. Configure a Área de Trabalho Remota do Chrome para o suporte e confirme, de outro aparelho, que você consegue acessar o mini PC.',
      'No navegador do mini PC, abra este guia e baixe o instalador inicial aprovado para lojas. Se estiver vendo o guia em outro aparelho, use o QR para obter o endereço de download. Na pasta Downloads, confira se a assinatura digital é válida e corresponde ao publicador aprovado e se o SHA-256 confere com o valor exibido no guia.',
      'Execute o instalador com autorização de administrador. Depois, abra o NeoSmart na conta operacional da Torre. Na tela do cliente, use Ctrl+Alt+Shift+T para entrar no modo técnico quando precisar.',
    ],
  },
  {
    id: 'registrar',
    title: 'Registre a identidade da Torre',
    paragraphs: [
      'No GOP, encontre o código impresso na etiqueta em Equipamentos físicos. Use Preparar Electron. Em uma reinstalação autorizada de equipamento já registrado, use Reinstalar Electron quando essa opção estiver disponível. O GOP exibe Registro do Electron e gera uma credencial temporária de 24 horas.',
      'Na Torre, selecione Ler QR temporário do Admin e mostre à câmera o código exibido no GOP em outro aparelho. Se preferir digitar, informe o código da etiqueta e o código alternativo temporário. Aguarde a confirmação de que a identidade física foi registrada.',
    ],
    actions: [
      { href: equipment, label: 'Abrir Equipamentos físicos' },
    ],
  },
  {
    id: 'vincular',
    title: 'Vincule a Torre à loja',
    paragraphs: [
      'No GOP, volte à linha da etiqueta. Em Associar à loja, confira o código da Torre, a empresa, a loja e a validade. Clique em Gerar associação. Se já houver vínculo, a nova associação pode revogá-lo imediatamente.',
      'Na Torre, toque em Ler QR Code e mostre o QR de Associação com a loja. Para digitar o código de oito caracteres, use Não consigo ler o QR Code. Depois de Dados de ativação confirmados, escolha Vincular esta Torre à loja e confira o vínculo.',
      'Abra Continuar para cadastrar o tablet para concluir o primeiro acesso técnico. Se aparecer Troque o PIN provisório, use o PIN emitido com a associação e confirme um novo PIN de seis dígitos. Guarde o novo PIN no cofre. Use Sair para deixar o cadastro do tablet para a loja.',
    ],
    actions: [
      { href: equipment, label: 'Abrir associação do equipamento' },
      { href: installations, label: 'Consultar instalações' },
    ],
  },
  {
    id: 'preparar-atualizador',
    title: 'Prepare o atualizador Windows na primeira instalação',
    paragraphs: [
      'Etapa pendente de homologação para lojas. O fluxo foi testado na Torre Física de Teste com material de laboratório. Aguarde o kit aprovado para a frota antes de executar este cadastro em uma loja.',
      'Cada versão terá um instalador Windows assinado pelo publicador NeoSmart, compartilhado pelas Torres compatíveis. Na primeira instalação supervisionada, use o kit aprovado para instalar o serviço NeoSmartUpdate, configurar a reabertura do NeoSmart na conta operacional e provisionar a confiança no publicador.',
      'Cadastre uma vez o ID e a credencial de atualização exclusivos do mini PC. Relacione o ID à etiqueta e à loja. A credencial fica protegida no Windows e a VPS guarda apenas o verificador. Esse cadastro é separado dos QRs de registro e associação do GOP e do pareamento do tablet.',
      'Antes de encerrar a preparação, confira se o serviço inicia automaticamente, se reconhece o canal atribuído e se o NeoSmart volta a abrir na conta operacional após reiniciar. O serviço usará esse cadastro para obter da VPS uma autorização de uso único para cada atualização aprovada. A renovação do certificado de assinatura será administrada centralmente pela política de confiança.',
    ],
  },
  {
    id: 'preparar-tablet',
    title: 'Inscreva o NeoManager no Android',
    paragraphs: [
      'No Android novo, ainda na tela de boas-vindas, toque seis vezes seguidas no mesmo ponto. Quando o assistente abrir o leitor, deixe o QR abaixo visível em outro aparelho e aponte a câmera do tablet para ele. Conecte o tablet ao Wi-Fi com internet quando solicitado. Ao concluir, confirme no NeoManager que ele é o proprietário do dispositivo (Device Owner).',
      'O QR abaixo instala o NeoManager de bancada. A inscrição desde a tela de boas-vindas já funcionou no Lenovo com uma versão anterior. A preparação completa de um tablet novo com os pacotes atuais ainda precisa ser validada.',
    ],
  },
  {
    id: 'instalar-tablet',
    title: 'Instale e confira o quiosque na fábrica',
    paragraphs: [
      'No NeoManager, guarde uma senha técnica individual do tablet no cofre. Digite e repita a senha, marque Confirmei a guarda da senha no cofre e toque em Cadastrar senha. Entre com a senha e toque em Concluir preparação da credencial.',
      'Use Instalar NeoSmart inicial, confirme em Instalar e depois toque em Conferir instalação. O NeoManager 0.0.15 instala inicialmente o NeoSmart Tablet 0.0.5. No NeoManager autenticado, toque em Verificar atualizações para obter a versão oferecida pelo catálogo. Confira a versão instalada. Para preparar o Android como dispositivo gerenciado, use o QR de inscrição da etapa anterior.',
      'Em aparelho de bancada com a recuperação física já conferida, toque em Ativar ensaio de bloqueio e confirme Recuperação conferida. Selecione Ativar início automático do NeoSmart e use Reiniciar aparelho. Confira se o NeoSmart abre em quiosque e se seis toques no canto superior esquerdo abrem a manutenção autenticada. Deixe o tablet pronto para ler o QR de pareamento na loja.',
    ],
  },
  {
    id: 'parear',
    title: 'Pareie o tablet na loja',
    paragraphs: [
      'Ligue os dois aparelhos. Use uma rede local da loja que permita a comunicação do tablet com o mini PC. No NeoSmart Tablet, toque seis vezes no canto superior esquerdo, autentique-se na manutenção do NeoManager e abra Rede. Informe ou selecione o Wi-Fi da loja e toque em Conectar. Aguarde a confirmação da rede e use Encerrar manutenção para voltar ao NeoSmart Tablet.',
      'Na Torre, pressione Ctrl+Alt+Shift+T e entre com o PIN administrativo da Torre. Se o controlador local estiver inativo, clique em Ativar controlador. Selecione Cadastrar tablet. No NeoSmart Tablet, toque em Ler QR da Torre e aponte para o QR exibido no monitor da Torre. Na Torre, aguarde a solicitação e escolha Aprovar e cadastrar tablet.',
      'Confirme que o tablet abre o painel. No modo técnico da Torre, use Sair para voltar à tela cliente.',
    ],
  },
  {
    id: 'conferir',
    title: 'Confira a instalação antes da entrega',
    paragraphs: [
      'No tablet, abra Configurações e Administração da loja com o PIN administrativo da Torre. Em Preparar Torre, use Testar câmera e, quando a imagem estiver correta no monitor do cliente, Confirmar imagem. Em Tela do cliente, use Abrir teste e Confirmar tela. Em Calibrar, compare a régua com uma régua física de 100 mm e use Salvar calibração se precisar ajustar.',
      'Em Catálogos de lentes, use Buscar atualizações da Torre, selecione os catálogos da loja e confira a lista antes de confirmar em Aplicar seleção (instala e remove). Use Vamos começar para sair da preparação.',
      'Reinicie o mini PC e o tablet. Confirme a abertura automática do NeoSmart, a reconexão do tablet, a resposta da Torre a um comando e o acesso remoto de suporte. Retire o teclado temporário ao concluir. Em Lojas e instalações você pode consultar o histórico ou abrir o cadastro para reemitir uma ativação ou recuperar o PIN.',
    ],
    actions: [
      { href: installations, label: 'Abrir Lojas e instalações' },
    ],
  },
  {
    id: 'validar-atualizacao',
    title: 'Valide o atualizador antes de expandir para as lojas',
    paragraphs: [
      'Aceite ainda pendente. Durante a instalação e também em caso de falha ou recuperação, o monitor da Torre deve exibir a manutenção e manter a área de trabalho do Windows inacessível na conta operacional, inclusive enquanto o NeoSmart estiver fechado.',
      'No tablet, confira a faixa superior já usada pela atualização do próprio tablet. O mesmo botão Atualizar agora deve funcionar quando houver só atualização do tablet, só da Torre ou das duas. Confirme que a faixa informa o andamento e que o tablet reconecta à Torre e confirma a nova versão.',
      'Inicie o teste pelo tablet, sem interação no mini PC. Um atendimento guardado para retomar depois pode continuar aberto. A atualização deve esperar enquanto houver atendimento em andamento e seguir quando a Torre voltar ao menu inicial e estiver disponível. Faça a primeira liberação somente para a Torre piloto e confirme a volta à operação antes de ampliar a distribuição.',
    ],
  },
]

export default async function TowerPlatformAdminPage({
  searchParams,
}: {
  searchParams: { vista?: string | string[] }
}) {
  const showInstallations = searchParams.vista === 'instalacoes'
  const data = showInstallations ? await getTowerDirectoryData() : null
  const windowsInstaller = showInstallations ? null : getWindowsInstaller()
  const downloads = showInstallations ? null : await Promise.all([
    createAndroidProvisioningQr(),
    createQr(neoManagerApkUrl),
    createQr(tabletApkUrl),
    windowsInstaller ? createQr(windowsInstaller.url) : null,
  ]).then(([android, manager, tablet, windows]) => ({ android, manager, tablet, windows }))

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topBar}>
          <Link href="/admin/torres" className={styles.brand}>NeoSmart</Link>
          <div className={styles.logout}><LogoutButton /></div>
        </div>

        {data ? (
          <>
            <Link href="/admin/torres" className={styles.action}>Voltar ao guia</Link>
            <h1 className={styles.title}>Torres cadastradas</h1>
            <TowerDirectoryAdmin data={data} />
          </>
        ) : (
          <>
            <header className={styles.header}>
              <h1 className={styles.title}>Guia para instalação de Torres NeoSmart</h1>
              <p>Da identificação do mini PC na fábrica à conferência da Torre e do tablet na loja.</p>
            </header>
            <div className={styles.document}>
              <nav className={styles.contents} aria-label="Etapas do guia">
                <p>Neste guia</p>
                <ol>
                  {steps.map((step) => (
                    <li key={step.id}><a href={'#' + step.id}>{step.title}</a></li>
                  ))}
                </ol>
              </nav>
              <ol className={styles.steps}>
                {steps.map((step, index) => (
                  <li key={step.id} id={step.id} className={styles.step}>
                    <span aria-hidden="true" className={styles.stepNumber}>{index + 1}.</span>
                    <div>
                      <h2>{step.title}</h2>
                      {step.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                      {step.id === 'instalar' && downloads && (
                        <div>
                          {windowsInstaller && downloads.windows ? (
                            <>
                              <GuideQr src={downloads.windows} label={'Baixar ' + windowsInstaller.file} url={windowsInstaller.url} />
                              <p>SHA-256 do EXE <code className="break-all">{windowsInstaller.sha256}</code></p>
                            </>
                          ) : (
                            <p>O download para lojas aparece aqui quando o instalador inicial aprovado for publicado na VPS e a versão e o SHA-256 forem cadastrados.</p>
                          )}
                        </div>
                      )}
                      {step.id === 'preparar-tablet' && downloads && (
                        <GuideQr
                          src={downloads.android}
                          label={'QR de preparação do Android · NeoManager ' + neoManagerVersion + ' de bancada'}
                        />
                      )}
                      {step.id === 'instalar-tablet' && downloads && (
                        <div className="flex flex-wrap gap-x-8">
                          <GuideQr src={downloads.manager} label={'Baixar APK do NeoManager ' + neoManagerVersion} url={neoManagerApkUrl} />
                          <GuideQr src={downloads.tablet} label="Baixar APK do NeoSmart Tablet 0.0.21" url={tabletApkUrl} />
                        </div>
                      )}
                      {step.actions && (
                        <div className={styles.actions}>
                          {step.actions.map((action) => (
                            <Link key={action.href} href={action.href} className={styles.action}>{action.label}</Link>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
