/**
 * Fuente única de contenido del portafolio.
 *
 * Añadir un proyecto = añadir un objeto a PROJECTS y dejar su portada en
 * /covers/<id>.jpg (ver tools/covers.mjs). Nada más: la galería WebGL, la
 * rejilla HTML, los filtros, el contador y el visor se construyen a partir
 * de estos datos.
 */

/**
 * @typedef {Object} Category
 * @property {string} id
 * @property {string} title
 * @property {string} short       Etiqueta corta para chips y filtros.
 * @property {string} description
 * @property {string} accent      Color de apoyo de la categoría.
 * @property {string} formTitle   Encabezado del formulario cuando está activa.
 */

/**
 * @typedef {Object} Project
 * @property {string} id          También es el slug de la URL (#<categoría>/<id>).
 * @property {string} title
 * @property {string} category    id de una Category.
 * @property {string} type        Subtítulo corto que acompaña al título.
 * @property {string} description
 * @property {string} accent      Color dominante del proyecto.
 * @property {string} cover       Portada usada como textura de la lámina 3D.
 * @property {string} logo
 * @property {string|null} file   Experiencia navegable. null => "Próximamente".
 * @property {Component[]} [components]
 *   Piezas de interfaz que flotan alrededor de la portada. NO son recortes de
 *   la imagen: se dibujan como HTML real, así que se leen nítidas a cualquier
 *   tamaño y se pueden seleccionar y leer con lector de pantalla. Los valores
 *   salen de la captura del caso, no se inventan.
 */

/**
 * @typedef {Object} Component
 * @property {'stat'|'row'|'action'} kind
 * @property {string} [value]     stat: cifra grande.        action: importe.
 * @property {string} [label]     stat: pie de la cifra.     action: encabezado.
 * @property {string} [meta]      row: etiqueta superior.
 * @property {string} [title]     row: línea principal.
 * @property {string} [trailing]  row: valor a la derecha.
 * @property {string} [action]    action: texto del botón.
 */

/**
 * @typedef {Object} Member
 * @property {string} id
 * @property {string} name
 * @property {string} role
 * @property {string} network
 * @property {string} url
 * @property {string} photo
 * @property {string} accent
 */

/** @type {Category[]} */
export const CATEGORIES = [
  {
    id: 'pos',
    title: 'Sistema de Comandas',
    short: 'Comandas',
    description: 'Ventas, comandas y administración para restaurantes y cafeterías.',
    accent: '#26502F',
    formTitle: '¿Qué necesitas para tu restaurante?'
  },
  {
    id: 'showrooms',
    title: 'Concesionario Virtual',
    short: 'Concesionario',
    description: 'Experiencias interactivas e inmersivas para mostrar producto.',
    accent: '#1E3A6E',
    formTitle: '¿Qué necesitas para tu concesionario?'
  },
  {
    id: 'hospitality',
    title: 'Hotelería & Reservas',
    short: 'Hotelería',
    description: 'Reservas, disponibilidad y administración de alojamiento.',
    accent: '#7B2233',
    formTitle: '¿Qué necesitas para tu hotel?'
  },
  {
    id: 'ecommerce',
    title: 'Tienda Online',
    short: 'Tienda',
    description: 'Catálogos y experiencias de compra.',
    accent: '#C79318',
    formTitle: '¿Qué necesitas para tu tienda?'
  },
  {
    id: 'saas',
    title: 'Plataformas SaaS',
    short: 'SaaS',
    description: 'Herramientas digitales para operar un negocio completo.',
    accent: '#2F5D62',
    formTitle: '¿Qué necesitas para tu operación?'
  },
  {
    id: 'custom',
    title: 'Software a medida',
    short: 'A medida',
    description: 'Productos creados alrededor de una necesidad específica.',
    accent: '#5A3E7A',
    formTitle: '¿Qué necesitas construir?'
  }
];

/** @type {Project[]} */
export const PROJECTS = [
  {
    id: 'guarowook',
    title: 'GuaroWook',
    category: 'pos',
    type: 'Sistema de Comandas',
    description: 'Sistema de comandas y operación para restaurante.',
    accent: '#1A1413',
    cover: './covers/guarowook.jpg',
    logo: './assets-min/logo-guarowook.png',
    file: './projects/guarowook.html',
    components: [
      { kind: 'row', meta: 'Entradas', title: 'ENT ALITAS FRITAS', trailing: '$4.00' },
      { kind: 'action', label: 'Total', value: '$16.00', action: 'Revisar y enviar' },
      { kind: 'stat', value: '4', label: 'ítems en la comanda' },
      { kind: 'row', meta: 'Mesa 1', title: 'JOSE', trailing: 'Mesero' },
      { kind: 'stat', value: '8', label: 'categorías del menú' }
    ]
  },
  {
    id: 'coffee-cake',
    title: 'Coffee & Cake',
    category: 'pos',
    type: 'Comandas Cafetería',
    description: 'Sistema operativo para cafetería de especialidad.',
    accent: '#6B4A2F',
    cover: './covers/coffee-cake.jpg',
    logo: './assets-min/logo-coffee-cake.png',
    file: './projects/coffee-cake.html',
    components: [
      { kind: 'row', meta: 'Estación', title: 'Barista', trailing: '6 activas' },
      { kind: 'stat', value: '12', label: 'órdenes abiertas' },
      { kind: 'action', label: 'Mesa 04', value: '2 comensales', action: 'Continuar' },
      { kind: 'stat', value: '4m', label: 'preparación media' },
      { kind: 'row', meta: 'Caja', title: 'Pagos y tickets', trailing: '3 pendientes' }
    ]
  },
  {
    id: 'brasa',
    title: 'BRASA',
    category: 'pos',
    type: 'Comandas Restaurante',
    description: 'Operación integral para restaurante.',
    accent: '#3A1D15',
    cover: './covers/brasa.jpg',
    logo: './assets-min/logo-brasa.jpg',
    file: './projects/brasa.html',
    components: [
      { kind: 'stat', value: '$4.280', label: 'ventas del día' },
      { kind: 'row', meta: 'Más vendido', title: 'Brasa Burger', trailing: '38 hoy' },
      { kind: 'action', label: 'Mesa 07', value: '$41,60', action: 'Nuevo pedido' },
      { kind: 'stat', value: '143', label: 'pedidos del día' },
      { kind: 'row', meta: 'Salón principal', title: '14 mesas', trailing: '6 asignadas' }
    ]
  },
  {
    id: 'changan',
    title: 'Changan 360°',
    category: 'showrooms',
    type: 'Concesionario Virtual',
    description: 'Experiencia automotriz inmersiva en 360°.',
    accent: '#0E2A5C',
    cover: './covers/changan.jpg',
    logo: './assets-min/logo-changan.jpg',
    file: './projects/changan-360.html',
    components: [
      { kind: 'stat', value: '36', label: 'frames por giro' },
      { kind: 'stat', value: '360°', label: 'exterior e interior' },
      { kind: 'row', meta: 'Showroom público', title: 'CS55 Plus', trailing: 'Vista exterior' },
      { kind: 'stat', value: '4', label: 'acabados por modelo' },
      { kind: 'row', meta: 'Gestión', title: 'CMS interno', trailing: 'Activo' }
    ]
  },
  {
    id: 'jac',
    title: 'JAC 360°',
    category: 'showrooms',
    type: 'Concesionario Virtual',
    description: 'Showroom inmersivo de vehículos JAC.',
    accent: '#241E17',
    cover: './covers/jac.jpg',
    logo: './assets-min/logo-jac.jpg',
    file: './projects/jac-360.html',
    components: [
      { kind: 'row', meta: 'Vehículo', title: 'Frison T9', trailing: 'Exterior' },
      { kind: 'stat', value: '360°', label: 'rotación libre' },
      { kind: 'row', meta: 'Escena', title: 'Showroom premium', trailing: '01' },
      { kind: 'stat', value: '36', label: 'frames por giro' },
      { kind: 'row', meta: 'Control', title: 'Girar y acercar', trailing: 'Drag · Zoom' }
    ]
  },
  {
    id: 'rents-brooklyn-queens',
    title: 'Rents Brooklyn Queens',
    category: 'hospitality',
    type: 'Hospitality Platform',
    description: 'Plataforma de hotelería y reservas.',
    accent: '#5E1626',
    cover: './covers/rents-brooklyn-queens.jpg',
    logo: './assets-min/logo-reents.png',
    file: './projects/rents-brooklyn-queens.html',
    components: [
      { kind: 'row', meta: 'Guest favourite', title: 'The Marlowe House', trailing: '4.9' },
      { kind: 'stat', value: '$186', label: 'por noche' },
      { kind: 'row', meta: 'Destino', title: 'Williamsburg, Brooklyn', trailing: '2 adultos' },
      { kind: 'stat', value: '214', label: 'alojamientos' },
      { kind: 'row', meta: 'Filtros', title: 'Desayuno y cancelación', trailing: '5★' }
    ]
  }
];

/** @type {Member[]} */
export const TEAM = [
  {
    id: 'jorbi',
    name: 'Jorbi Nogales',
    role: 'Producto & Estrategia',
    network: 'LinkedIn',
    url: 'https://www.linkedin.com/in/jorbi-nogales/',
    photo: './assets-min/team-jorbi.jpg',
    accent: '#1E3A6E'
  },
  {
    id: 'elis',
    name: 'Elis Pérez',
    role: 'Desarrollo & Integraciones',
    network: 'Facebook',
    url: 'https://www.facebook.com/elisxavier.perez',
    photo: './assets-min/team-elis.jpg',
    accent: '#C79318'
  },
  {
    id: 'leandro',
    name: 'Leandro Guzmán',
    role: 'Ingeniería & Arquitectura',
    network: 'LinkedIn',
    url: 'https://www.linkedin.com/in/leandrogzn/',
    photo: './assets-min/team-leandro.jpg',
    accent: '#26502F'
  }
];

export const DIAL_CODES = [
  { value: '+58', label: 'VE +58' },
  { value: '+1', label: 'US +1' },
  { value: '+57', label: 'CO +57' },
  { value: '+52', label: 'MX +52' },
  { value: '+507', label: 'PA +507' },
  { value: '+34', label: 'ES +34' },
  { value: '+51', label: 'PE +51' },
  { value: '+56', label: 'CL +56' },
  { value: '+54', label: 'AR +54' },
  { value: '+593', label: 'EC +593' },
  { value: '+1809', label: 'DO +1809' },
  { value: '+55', label: 'BR +55' }
];

/**
 * Proyectos de una categoría. Sin categoría devuelve el portafolio completo.
 * @param {string|null} categoryId
 * @returns {Project[]}
 */
export function projectsOf(categoryId) {
  if (!categoryId) return PROJECTS.slice();
  return PROJECTS.filter((p) => p.category === categoryId);
}

/** @param {string} id @returns {Category|null} */
export function categoryById(id) {
  return CATEGORIES.find((c) => c.id === id) || null;
}

/** @param {string} id @returns {Project|null} */
export function projectById(id) {
  return PROJECTS.find((p) => p.id === id) || null;
}
