export interface BrazilianState {
  uf: string;
  name: string;
  cities: string[];
}

export const BRAZILIAN_STATES: BrazilianState[] = [
  {
    uf: 'SP',
    name: 'São Paulo',
    cities: [
      'São Paulo', 'Campinas', 'Guarulhos', 'São Bernardo do Campo', 'Santo André',
      'Osasco', 'São José dos Campos', 'Ribeirão Preto', 'Sorocaba', 'Santos',
      'São Caetano do Sul', 'Barueri', 'Jundiaí', 'Piracicaba', 'Bauru',
      'Franca', 'São Vicente', 'Praia Grande', 'Mauá', 'Mogi das Cruzes'
    ],
  },
  {
    uf: 'RJ',
    name: 'Rio de Janeiro',
    cities: [
      'Rio de Janeiro', 'Niterói', 'São Gonçalo', 'Duque de Caxias', 'Nova Iguaçu',
      'Petrópolis', 'Campos dos Goytacazes', 'Cabo Frio', 'Volta Redonda', 'Macaé',
      'Angra dos Reis', 'Belford Roxo', 'São João de Meriti', 'Teresópolis', 'Resende'
    ],
  },
  {
    uf: 'MG',
    name: 'Minas Gerais',
    cities: [
      'Belo Horizonte', 'Uberlândia', 'Contagem', 'Juiz de Fora', 'Betim',
      'Montes Claros', 'Uberaba', 'Governador Valadares', 'Ipatinga', 'Divinópolis',
      'Poços de Caldas', 'Pouso Alegre', 'Varginha', 'Patos de Minas', 'Sete Lagoas'
    ],
  },
  {
    uf: 'PR',
    name: 'Paraná',
    cities: [
      'Curitiba', 'Londrina', 'Maringá', 'Ponta Grossa', 'Cascavel',
      'Foz do Iguaçu', 'São José dos Pinhais', 'Colombo', 'Guarapuava', 'Paranaguá',
      'Toledo', 'Apucarana', 'Pinhais', 'Campo Largo', 'Arapongas'
    ],
  },
  {
    uf: 'RS',
    name: 'Rio Grande do Sul',
    cities: [
      'Porto Alegre', 'Caxias do Sul', 'Canoas', 'Pelotas', 'Santa Maria',
      'Gravataí', 'Viamão', 'Novo Hamburgo', 'São Leopoldo', 'Rio Grande',
      'Passo Fundo', 'Bento Gonçalves', 'Uruguaiana', 'Gramado', 'Canela'
    ],
  },
  {
    uf: 'SC',
    name: 'Santa Catarina',
    cities: [
      'Florianópolis', 'Joinville', 'Blumenau', 'São José', 'Chapecó',
      'Itajaí', 'Criciúma', 'Balneário Camboriú', 'Brusque', 'Tubarao',
      'Palhoça', 'Lages', 'Jaraguá do Sul', 'Itapema', 'Navegantes'
    ],
  },
  {
    uf: 'BA',
    name: 'Bahia',
    cities: [
      'Salvador', 'Feira de Santana', 'Vitória da Conquista', 'Camaçari', 'Juazeiro',
      'Itabuna', 'Lauro de Freitas', 'Ilhéus', 'Jequié', 'Teixeira de Freitas',
      'Porto Seguro', 'Barreiras', 'Alagoinhas', 'Simões Filho', 'Eunápolis'
    ],
  },
  {
    uf: 'PE',
    name: 'Pernambuco',
    cities: [
      'Recife', 'Jaboatão dos Guararapes', 'Olinda', 'Caruaru', 'Petrolina',
      'Paulista', 'Cabo de Santo Agostinho', 'Camaragibe', 'Garanhuns', 'Vitória de Santo Antão'
    ],
  },
  {
    uf: 'CE',
    name: 'Ceará',
    cities: [
      'Fortaleza', 'Caucaia', 'Juazeiro do Norte', 'Maracanaú', 'Sobral',
      'Crato', 'Itapipoca', 'Maranguape', 'Iguatu', 'Quixadá'
    ],
  },
  {
    uf: 'GO',
    name: 'Goiás',
    cities: [
      'Goiânia', 'Aparecida de Goiânia', 'Anápolis', 'Rio Verde', 'Luziânia',
      'Águas Lindas de Goiás', 'Valparaíso de Goiás', 'Trindade', 'Formosa', 'Itumbiara'
    ],
  },
  {
    uf: 'DF',
    name: 'Distrito Federal',
    cities: [
      'Brasília', 'Plano Piloto', 'Taguatinga', 'Ceilândia', 'Águas Claras',
      'Guará', 'Samambaia', 'Sobradinho', 'Gama', 'Vicente Pires'
    ],
  },
  {
    uf: 'ES',
    name: 'Espírito Santo',
    cities: [
      'Vitória', 'Vila Velha', 'Serra', 'Cariacica', 'Cachoeiro de Itapemirim',
      'Linhares', 'São Mateus', 'Colatina', 'Guarapari', 'Aracruz'
    ],
  },
  {
    uf: 'MT',
    name: 'Mato Grosso',
    cities: [
      'Cuiabá', 'Várzea Grande', 'Rondonópolis', 'Sinop', 'Tangará da Serra',
      'Sorriso', 'Lucas do Rio Verde', 'Primavera do Leste', 'Barra do Garças'
    ],
  },
  {
    uf: 'MS',
    name: 'Mato Grosso do Sul',
    cities: [
      'Campo Grande', 'Dourados', 'Três Lagoas', 'Corumbá', 'Ponta Porã',
      'Naviraí', 'Nova Andradina', 'Aquidauana', 'Maracaju', 'Paranaíba'
    ],
  },
  {
    uf: 'PA',
    name: 'Pará',
    cities: [
      'Belém', 'Ananindeua', 'Santarém', 'Marabá', 'Parauapebas',
      'Castanhal', 'Abaetetuba', 'Cametá', 'Bragança', 'Barcarena'
    ],
  },
  {
    uf: 'AM',
    name: 'Amazonas',
    cities: ['Manaus', 'Parintins', 'Itacoatiara', 'Manacapuru', 'Coari', 'Tefé'],
  },
  {
    uf: 'PB',
    name: 'Paraíba',
    cities: ['João Pessoa', 'Campina Grande', 'Santa Rita', 'Patos', 'Bayeux', 'Sousa', 'Cajazeiras'],
  },
  {
    uf: 'RN',
    name: 'Rio Grande do Norte',
    cities: ['Natal', 'Mossoró', 'Parnamirim', 'São Gonçalo do Amarante', 'Ceará-Mirim', 'Macaíba'],
  },
  {
    uf: 'AL',
    name: 'Alagoas',
    cities: ['Maceió', 'Arapiraca', 'Rio Largo', 'Palmeira dos Índios', 'União dos Palmares'],
  },
  {
    uf: 'PI',
    name: 'Piauí',
    cities: ['Teresina', 'Parnaíba', 'Picos', 'Piripiri', 'Floriano'],
  },
  {
    uf: 'MA',
    name: 'Maranhão',
    cities: ['São Luís', 'Imperatriz', 'São José de Ribamar', 'Timon', 'Caxias'],
  },
  {
    uf: 'SE',
    name: 'Sergipe',
    cities: ['Aracaju', 'Nossa Senhora do Socorro', 'Lagarto', 'Itabaiana', 'São Cristóvão'],
  },
  {
    uf: 'RO',
    name: 'Rondônia',
    cities: ['Porto Velho', 'Ji-Paraná', 'Ariquemes', 'Vilhena', 'Cacoal'],
  },
  {
    uf: 'TO',
    name: 'Tocantins',
    cities: ['Palmas', 'Araguaína', 'Gurupi', 'Porto Nacional', 'Paraíso do Tocantins'],
  },
  {
    uf: 'AC',
    name: 'Acre',
    cities: ['Rio Branco', 'Cruzeiro do Sul', 'Sena Madureira'],
  },
  {
    uf: 'AP',
    name: 'Amapá',
    cities: ['Macapá', 'Santana', 'Laranjal do Jari'],
  },
  {
    uf: 'RR',
    name: 'Roraima',
    cities: ['Boa Vista', 'Rorainópolis', 'Caracaraí'],
  },
];

export interface CategoryPresetGroup {
  group: string;
  items: string[];
}

export const POPULAR_CATEGORIES: CategoryPresetGroup[] = [
  {
    group: 'Gastronomia & Alimentação',
    items: [
      'Restaurantes',
      'Pizzarias',
      'Hamburguerias',
      'Cafeterias',
      'Padarias artesanais',
      'Bares e Pubs',
      'Churrascarias',
      'Restaurantes Japoneses',
    ],
  },
  {
    group: 'Saúde & Bem-Estar',
    items: [
      'Clínicas Odontológicas',
      'Consultórios Médicos',
      'Clínicas de Fisioterapia',
      'Laboratórios de Análises',
      'Farmácias e Drogarias',
      'Psicólogos e Terapeutas',
      'Clínicas de Nutrição',
    ],
  },
  {
    group: 'Beleza & Estética',
    items: [
      'Salões de Beleza',
      'Barbearias',
      'Clínicas de Estética',
      'Studios de Tatuagem',
      'Studios de Sobrancelhas',
      'Spas Urbanos',
      'Esmalterias',
    ],
  },
  {
    group: 'Pet & Veterinária',
    items: [
      'Pet Shops',
      'Clínicas Veterinárias',
      'Banho e Tosa',
      'Hospitais Veterinários 24h',
      'Hotéis para Cães',
    ],
  },
  {
    group: 'Automotivo',
    items: [
      'Oficinas Mecânicas',
      'Auto Centers',
      'Funilaria e Pintura',
      'Lava-rápidos e Estética Automotiva',
      'Troca de Óleo',
      'Concessionárias de Veículos',
    ],
  },
  {
    group: 'Serviços & Negócios',
    items: [
      'Escritórios de Advocacia',
      'Contabilidades',
      'Imobiliárias',
      'Agências de Marketing',
      'Coworkings',
      'Despachantes',
    ],
  },
  {
    group: 'Esportes & Fitness',
    items: [
      'Academias',
      'Boxes de Crossfit',
      'Studios de Pilates',
      'Escolas de Natação',
      'Quadras de Beach Tennis',
      'Escolas de Luta e Artes Marciais',
    ],
  },
  {
    group: 'Comércio & Varejo',
    items: [
      'Supermercados',
      'Lojas de Roupas',
      'Materiais de Construção',
      'Óticas',
      'Floriculturas',
      'Lojas de Calçados',
    ],
  },
];
