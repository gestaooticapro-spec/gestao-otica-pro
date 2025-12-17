import os

# Configuração das categorias
CATEGORIAS = {
    "1_TELAS_E_ROTAS.txt": ["src\\app", "src/app"],
    "2_COMPONENTES_VISUAIS.txt": ["src\\components", "src/components"],
    "3_REGRAS_BANCO_DADOS.txt": ["src\\lib", "src\\actions", "src/lib", "src/actions"],
    "4_CONFIGURACOES.txt": ["package.json", "tsconfig.json", "next.config"]
}

EXTENSOES_PERMITIDAS = ['.ts', '.tsx', '.sql', '.css', '.json', '.md']
IGNORAR_ARQUIVOS = ['package-lock.json', 'next-env.d.ts']
IGNORAR_PASTAS = ['node_modules', '.next', '.git', '.vscode']

def gerar_arquivos_divididos():
    # Limpa arquivos anteriores
    for arquivo in CATEGORIAS.keys():
        with open(arquivo, 'w', encoding='utf-8') as f:
            f.write(f"=== CONTEÚDO: {arquivo} ===\n\n")

    # Percorre o projeto
    for root, dirs, files in os.walk('.'):
        # Remove pastas ignoradas
        for ignore in IGNORAR_PASTAS:
            if ignore in dirs: dirs.remove(ignore)

        for file in files:
            ext = os.path.splitext(file)[1]
            path_completo = os.path.join(root, file)
            
            if ext not in EXTENSOES_PERMITIDAS or file in IGNORAR_ARQUIVOS:
                continue

            # Decide em qual arquivo salvar
            arquivo_destino = "4_CONFIGURACOES.txt" # Padrão (Fallback)
            
            for nome_txt, caminhos_chave in CATEGORIAS.items():
                # Verifica se o caminho do arquivo contém alguma das chaves
                if any(chave in path_completo for chave in caminhos_chave):
                    arquivo_destino = nome_txt
                    break
            
            # Se for arquivo da raiz (fora de src) e não for config, ignora ou põe em config
            if "src" not in path_completo and arquivo_destino == "4_CONFIGURACOES.txt":
                 if file not in ["package.json", "next.config.ts"]:
                     continue

            try:
                with open(arquivo_destino, 'a', encoding='utf-8') as outfile:
                    with open(path_completo, 'r', encoding='utf-8') as infile:
                        outfile.write(f"\n{'='*50}\n")
                        outfile.write(f"ARQUIVO: {path_completo}\n")
                        outfile.write(f"{'='*50}\n")
                        outfile.write(infile.read())
                        outfile.write("\n")
                print(f"[{arquivo_destino}] Salvo: {path_completo}")
            except Exception as e:
                print(f"Erro ao ler {path_completo}: {e}")

if __name__ == "__main__":
    gerar_arquivos_divididos()