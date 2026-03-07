
-- Corrigindo o tipo de produto para itens que foram salvos erroneamente como 'Receituario'
-- Devem ser 'Armacao' para serem localizados pela busca e pelo resto do sistema.

UPDATE products 
SET tipo_produto = 'Armacao' 
WHERE tipo_produto = 'Receituario'::text;

-- Verificando se ainda restou algum
SELECT id, nome, tipo_produto FROM products WHERE tipo_produto = 'Receituario'::text;
