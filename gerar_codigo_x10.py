import os
import math

# --- CONFIGURAÇÃO ---

# Limite máximo de arquivos por cada arquivo de texto gerado
TAMANHO_MAXIMO_LOTE = 10 

# Definição das regras: Apenas as pastas chaves (removemos a chave 'partes')
CONFIG_AGRUPAMENTO = {
    "1_TELAS_E_ROTAS": ["src\\app", "src/app"], 
    "2_COMPONENTES_VISUAIS": ["src\\components", "src/components"], 
    "3_REGRAS_BANCO_DADOS": ["src\\lib", "src\\actions", "src/lib", "src/actions"], 
    "4_CONFIGURACOES": ["package.json", "tsconfig.json", "next.config"]
}

EXTENSOES_PERMITIDAS = ['.ts', '.tsx', '.sql', '.css', '.json', '.md']
IGNORAR_ARQUIVOS = ['package-lock.json', 'next-env.d.ts', 'yarn.lock']
IGNORAR_PASTAS = ['node_modules', '.next', '.git', '.vscode', 'dist', 'build']

def salvar_lote(nome_arquivo, lista_arquivos):
    """Função auxiliar para salvar uma lista de arquivos em um único .txt"""
    try:
        with open(nome_arquivo, 'w', encoding='utf-8') as outfile:
            outfile.write(f"=== CONTEÚDO PARCIAL: {nome_arquivo} ===\n")
            outfile.write(f"=== CONTÉM {len(lista_arquivos)} ARQUIVOS ===\n\n")

            for path_completo in lista_arquivos:
                try:
                    with open(path_completo, 'r', encoding='utf-8') as infile:
                        outfile.write(f"\n{'='*50}\n")
                        outfile.write(f"ARQUIVO: {path_completo}\n")
                        outfile.write(f"{'='*50}\n")
                        outfile.write(infile.read())
                        outfile.write("\n")
                except Exception as e:
                    outfile.write(f"\n[ERRO AO LER {path_completo}: {e}]\n")
        
        print(f"✅ Gerado: {nome_arquivo} ({len(lista_arquivos)} arquivos)")
    except Exception as e:
        print(f"❌ Erro fatal ao criar {nome_arquivo}: {e}")

def processar_projeto():
    # Dicionário para agrupar os caminhos dos arquivos antes de salvar
    arquivos_agrupados = {k: [] for k in CONFIG_AGRUPAMENTO.keys()}
    
    # Lista extra para arquivos que não caem nas regras, mas são importantes (configs na raiz)
    # Eles serão jogados na categoria 4_CONFIGURACOES
    arquivos_raiz_config = ["package.json", "next.config.ts", "next.config.js", "tailwind.config.js", "tsconfig.json", "middleware.ts"]

    print("🔍 Escaneando diretórios...")

    # 1. COLETA (VARREDURA)
    for root, dirs, files in os.walk('.'):
        # Remove pastas ignoradas para não entrar nelas
        for ignore in IGNORAR_PASTAS:
            if ignore in dirs: dirs.remove(ignore)

        for file in files:
            ext = os.path.splitext(file)[1]
            path_completo = os.path.join(root, file)
            
            # Filtros básicos de extensão e arquivos ignorados
            if ext not in EXTENSOES_PERMITIDAS or file in IGNORAR_ARQUIVOS:
                continue

            # Lógica de Classificação
            categoria_encontrada = None
            
            # Verifica nas regras específicas
            for nome_base, chaves in CONFIG_AGRUPAMENTO.items():
                # Se qualquer chave estiver no caminho do arquivo
                if any(chave in path_completo for chave in chaves):
                    categoria_encontrada = nome_base
                    break
            
            # Se não achou categoria pelas pastas, verifica se é arquivo de configuração na raiz
            if not categoria_encontrada:
                if "src" not in path_completo and file in arquivos_raiz_config:
                     categoria_encontrada = "4_CONFIGURACOES"
            
            # Adiciona à lista se encontrou categoria
            if categoria_encontrada:
                arquivos_agrupados[categoria_encontrada].append(path_completo)

    print(f"📦 Organizando e dividindo arquivos (Máx {TAMANHO_MAXIMO_LOTE} por parte)...")

    # 2. DIVISÃO E SALVAMENTO
    for nome_base, lista_arquivos in arquivos_agrupados.items():
        if not lista_arquivos:
            continue

        # Ordena para manter a ordem dos arquivos consistente (alfabética)
        lista_arquivos.sort()

        # Cria pedaços (chunks) de no máximo TAMANHO_MAXIMO_LOTE (10)
        lotes = [lista_arquivos[i:i + TAMANHO_MAXIMO_LOTE] for i in range(0, len(lista_arquivos), TAMANHO_MAXIMO_LOTE)]
        
        # Se tiver apenas 1 lote, salva sem sufixo ou com sufixo A (opcional, mantive padrão para consistência)
        # Se você preferir sem sufixo quando for único, pode adicionar um 'if len(lotes) == 1'
        
        for i, lote_atual in enumerate(lotes):
            # Define sufixo: A, B, C, D...
            # Obs: Se passar de 26 partes, vai começar a usar caracteres ASCII seguintes ([, \, etc). 
            # Para projetos normais, A-Z é suficiente.
            sufixo = chr(65 + i) 
            
            nome_final = f"{nome_base}_PARTE_{sufixo}.txt"
            
            salvar_lote(nome_final, lote_atual)

if __name__ == "__main__":
    processar_projeto()