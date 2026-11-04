# Criar uma área de leads com cards e modal completo em outro projeto

Este documento é uma instrução de implementação para quando o projeto consumidor ainda não tiver uma área de leads. Se já existir uma área equivalente, estenda-a sem criar uma segunda página ou menu duplicado.

## Resultado esperado

Criar uma área de trabalho de leads que consuma a API MapScrape e reproduza o fluxo da interface do MapScrape:

1. Lista pesquisável e paginada de estabelecimentos.
2. Cards com os principais dados para triagem.
3. Modal de detalhes completo ao selecionar um card.
4. Conteúdo estruturado para avaliações, tópicos, atributos, fotografias e vídeos.
5. Estados de carregamento, vazio, erro e dados incompletos.
6. Ação para abrir a ficha original do Google Maps.
7. Nenhuma credencial MapScrape no cliente/browser.

## 1. Inspecionar antes de construir

A LLM deve localizar:
- Router e navegação principal.
- Layout e permissões de usuário.
- Biblioteca de componentes, ícones e estilos.
- Cliente API e padrão de tratamento de erros.
- Tabelas/listas existentes e seus estados.
- Modal/dialog existente.
- Testes de UI.

Reutilize a página, o layout, a navegação e os componentes existentes. Se não existir área de leads, crie apenas uma rota e uma entrada de navegação coerente com o produto, por exemplo `/leads`. Não crie um dashboard paralelo nem altere o design system global sem necessidade.

## 2. Camada de dados

Faça chamadas server-side para `GET /api/v1/leads` e `GET /api/v1/leads/{id}` usando o cliente definido em `docs/INTEGRATION-FOR-LLMS.md`.

- Buscar no servidor, com debounce se houver pesquisa instantânea.
- Reiniciar `offset` quando o termo mudar.
- Respeitar `pagination.total` e `pagination.hasMore`.
- Não carregar todos os registros numa única chamada.
- Não presumir que os campos estarão preenchidos.
- Ao abrir um card, busque o detalhe completo pelo ID se o registro da lista estiver resumido.
- Não gravar uma segunda cópia permanente da base de leads no projeto consumidor sem uma necessidade de produto explícita.

## 3. Card de estabelecimento

Cada card deve exibir, quando disponíveis:
- Foto principal: `logo_url` ou primeira foto válida.
- Nome.
- Categoria.
- Nota e quantidade de avaliações.
- Endereço.
- Telefone.
- Website.
- Status de funcionamento.
- Indicador discreto de completude/ausência de dados, se útil.
- Ação para abrir detalhes.
- Link externo para `maps_url`.

Não invente dados nem use imagens genéricas como se fossem fotos do estabelecimento. Se não houver imagem, mostre um placeholder neutro.

Ações de telefone e site devem usar links seguros: `tel:` para telefone normalizado e `https:`/URL validada para website. Links externos devem usar `target="_blank"` com `rel="noopener noreferrer"` quando aplicável.

## 4. Modal de detalhes

Ao selecionar um card, abrir um modal/dialog acessível com:
- Nome, categoria, nota, avaliações e links de contato no cabeçalho.
- Endereço e coordenadas.
- Horários e status.
- Descrição, faixa de preço e serviços/atributos.
- Redes sociais e Plus Code.
- Data da coleta e URL original da ficha.
- Seções de avaliações, tópicos, atributos e mídias.

Requisitos de UX:
- Fechar com botão explícito e tecla Escape.
- Foco acessível e navegação por teclado.
- Em mobile, ocupar a largura disponível sem cortar conteúdo.
- Seções recolhíveis são aceitáveis para conteúdo extenso, mas os dados não podem ser descartados.
- Mostrar “Não coletado / não disponível” de modo consistente, sem inventar valores.
- Incluir ação “Copiar dados” que serialize todo o registro de maneira legível, incluindo arrays e objetos JSON formatados.

## 5. Renderização de tipos de dados

Não renderize todos os campos como strings nem apenas como links.

### Fotografias
- Renderize uma grade de miniaturas usando `photos`, `logo_url` e itens de mídia do tipo imagem.
- Use `alt` descritivo quando disponível.
- Ao clicar, abrir uma visualização ampliada acessível.
- Se uma URL falhar, mostre placeholder e mantenha o restante do modal funcional.

### Vídeos
- Detecte `media_items` com tipo de vídeo e URLs reconhecidas.
- Se a URL for diretamente reproduzível por um elemento `video` seguro, apresente player com controles e sem autoplay.
- Se houver somente URL da página de origem ou link não reproduzível, apresente thumbnail/ícone de vídeo e ação “Abrir vídeo na origem”; não coloque URL da página em um player que não consegue reproduzi-la.
- Não contorne CORS, autenticação da origem ou restrições do navegador.

### Avaliações
- Renderize cards por avaliação com autor, nota, data, texto integral disponível e resposta do proprietário.
- Apresente anexos da avaliação como imagens/vídeos conforme o tipo.
- Escape conteúdo textual e nunca injete HTML arbitrário.
- Informe que a lista representa avaliações coletadas, não necessariamente todas as avaliações existentes.

### Tópicos de avaliações
- Renderize tópicos como chips/linhas com nome e contagem, quando contagem estiver disponível.
- Não invente contagens nem tópicos ausentes.

### Atributos adicionais
- Percorra `additional_attributes.sections` e apresente cada seção com título e seus atributos.
- Renderize `labeled_attributes` e `about_text` sem perder conteúdo.
- Para objetos de formato inesperado, use uma visualização JSON legível como fallback.

### Outros campos
- Horários como lista por dia, quando os dados forem estruturados; caso contrário, texto legível.
- Coordenadas com link para Maps quando válidas.
- Serviços e redes sociais como listas/link apropriado, após validar URLs.

## 6. Segurança e resiliência

- A chave MapScrape fica no backend do consumidor.
- Se o frontend chamar uma rota própria do consumidor, essa rota valida a sessão e chama MapScrape server-side.
- Não permita que usuários sem permissão consultem a integração só por conhecer a URL interna.
- Não use HTML bruto vindo das avaliações.
- Valide esquemas de resposta em runtime se o projeto já usa Zod ou equivalente.
- Implemente cancelamento de requisição quando o modal fechar ou a pesquisa mudar.
- Mostre erro de rede e ofereça retry manual.
- Evite repetição automática infinita e chamadas paralelas sem limite.

## 7. Testes de UI e integração

Criar testes para:
- Lista com dados completos e parciais.
- Pesquisa e paginação.
- Abrir/fechar modal e carregar detalhe por ID.
- Ausência de foto, reviews, atributos e mídia.
- Texto de review longo.
- Imagem quebrada e vídeo sem URL reproduzível.
- Erros 401, 404, 422, 503 e timeout.
- Acessibilidade básica de teclado.
- Garantia de que a chave não aparece no HTML, bundle ou chamadas do browser.

Use mocks em testes automáticos. Faça um teste real separado quando URL e chave forem configuradas.

## 8. Critério de aceite

A área está pronta quando um usuário consegue pesquisar leads, percorrer a lista paginada, abrir um estabelecimento, examinar todos os campos retornados, visualizar imagens, abrir vídeos pela via apropriada e ler comentários/tópicos/atributos sem que o projeto consumidor precise acessar diretamente o banco de dados do MapScrape.
