/**
 * Catálogo La Joaquina · Hogar & Deco.
 *
 * `priceArs` es el precio de venta en efectivo/transferencia (el destacado del
 * catálogo). `cardPriceArs` es el precio con tarjeta que figura en cada flyer y
 * se muestra como referencia en la ficha.
 *
 * `costArs` es una estimación provisoria (60% del precio) hasta cargar los
 * costos reales de cada proveedor. El margen del dashboard usa este número.
 */

export const CATEGORIES = [
  { id: "todos", label: "Todos" },
  { id: "cocina", label: "Cocina" },
  { id: "bano", label: "Baño" },
  { id: "deco", label: "Deco" },
  { id: "hogar", label: "Hogar" },
  { id: "tecnologia", label: "Tecnología" },
  { id: "cuidado", label: "Cuidado personal" },
];

const RAW = [
  {
    id: "massage-gun",
    name: "Massage Gun",
    subtitle: "Masajeador de percusión recargable",
    category: "cuidado",
    priceArs: 18900,
    cardPriceArs: 20900,
    image: "/assets/products/joaquina/massage-gun.jpg",
    colors: ["Gris", "Verde", "Bordó", "Negro"],
    badge: "Oferta",
    short: "Alivio muscular profundo en casa. Incluye cuatro cabezales intercambiables y cable USB.",
    benefits: ["Cuatro cabezales para distintos grupos musculares", "Batería recargable por USB", "Diseño compacto con estuche de regalo"],
    specs: { Incluye: "Masajeador, 4 cabezales y cable USB", Colores: "Gris, verde, bordó y negro", Alimentación: "Batería recargable" },
  },
  {
    id: "cubo-fidget",
    name: "Cubo Fidget LED",
    subtitle: "Cubo antiestrés con interruptores y luz",
    category: "deco",
    priceArs: 7900,
    cardPriceArs: 8900,
    image: "/assets/products/joaquina/cubo-fidget.jpg",
    colors: ["Violeta", "Negro", "Verde", "Rosa"],
    short: "Un objeto de escritorio que entretiene y suma luz. Ideal para regalar o despejar la cabeza.",
    benefits: ["Botones y switches para manipular", "Luz LED integrada", "Cuatro colores disponibles"],
    specs: { Material: "ABS", Incluye: "1 cubo", Colores: "Violeta, negro, verde y rosa" },
  },
  {
    id: "auricular-m10",
    name: "Auricular Bluetooth M10",
    subtitle: "Inalámbrico con estuche de carga y display",
    category: "tecnologia",
    priceArs: 9900,
    cardPriceArs: 10900,
    image: "/assets/products/joaquina/auricular-m10.jpg",
    colors: ["Negro"],
    badge: "Oferta",
    short: "Auriculares inalámbricos con estuche recargable y control táctil. Conectá y listo.",
    benefits: ["Bluetooth 5.3 con conexión estable", "Estuche con display de batería", "Control táctil y cable USB incluido"],
    specs: { Conexión: "Bluetooth 5.3", Incluye: "Auriculares, estuche y cable USB", Batería: "Recargable" },
  },
  {
    id: "licuadora-portatil",
    name: "Licuadora Portátil 380 ml",
    subtitle: "Recargable USB con cuchillas de acero",
    category: "cocina",
    priceArs: 19900,
    cardPriceArs: 21900,
    image: "/assets/products/joaquina/licuadora-portatil.jpg",
    colors: ["Azul", "Verde", "Violeta", "Rosa"],
    badge: "Oferta",
    short: "Llevá tus licuados y smoothies a todos lados. Carga por USB y vaso de 380 ml.",
    benefits: ["Cuchillas de acero inoxidable", "Recargable por USB", "Vaso transportable de 380 ml"],
    specs: { Capacidad: "380 ml", Incluye: "Licuadora, cable USB y manual", Colores: "Azul, verde, violeta y rosa" },
  },
  {
    id: "sellador-portatil",
    name: "Sellador Portátil 2 en 1",
    subtitle: "Sella y corta bolsas, recargable",
    category: "cocina",
    priceArs: 6900,
    cardPriceArs: 7900,
    image: "/assets/products/joaquina/sellador-portatil.jpg",
    colors: ["Blanco", "Negro", "Celeste", "Lila"],
    short: "Conservá los alimentos por más tiempo. Sella bolsas y corta con la misma herramienta.",
    benefits: ["Función selladora y cutter", "Recargable con cable USB incluido", "Compacto y fácil de guardar"],
    specs: { Incluye: "Sellador y cable USB", Colores: "Blanco, negro, celeste y lila", Alimentación: "Batería recargable" },
  },
  {
    id: "tensiometro-digital",
    name: "Tensiómetro Digital de Brazo",
    subtitle: "Automático ARM STYLE con voz y 99 memorias",
    category: "cuidado",
    priceArs: 24900,
    cardPriceArs: 27900,
    image: "/assets/products/joaquina/tensiometro-digital.jpg",
    colors: ["Blanco"],
    short: "Controlá tu presión en casa con pantalla LCD grande, aviso de arritmia y memoria para 99 registros.",
    benefits: ["Pantalla LCD grande con lectura clara", "Detección de arritmia y voz guiada", "Brazalete ajustable e interfaz USB"],
    specs: { Marca: "ARM STYLE", Memoria: "99 mediciones", Incluye: "Brazalete ajustable", Alimentación: "USB" },
  },
  {
    id: "soporte-tv-15-43",
    name: 'Soporte TV 15" a 43"',
    subtitle: "Brazo móvil BeOne BM7000 hasta 20 kg",
    category: "tecnologia",
    priceArs: 17900,
    cardPriceArs: 19900,
    image: "/assets/products/joaquina/soporte-tv-15-43.jpg",
    colors: ["Negro"],
    short: "Ganá ángulo y despejá el ambiente. Soporte con brazo móvil para TV de 15 a 43 pulgadas.",
    benefits: ["Soporta hasta 20 kg", "Inclinación de 15° y giro de 90°", "Montaje VESA compatible"],
    specs: { Modelo: "BeOne BM7000", Pantallas: '15" a 43"', "Peso máximo": "20 kg" },
  },
  {
    id: "soporte-tv-32-55",
    name: 'Soporte TV 32" a 55"',
    subtitle: "Brazo móvil EuroSound ESM8000 hasta 30 kg",
    category: "tecnologia",
    priceArs: 22900,
    cardPriceArs: 25900,
    image: "/assets/products/joaquina/soporte-tv-32-55.jpg",
    colors: ["Negro"],
    short: "Soporte robusto con brazo extensible para pantallas grandes. Mové la TV sin taladrar de nuevo.",
    benefits: ["Soporta hasta 30 kg", "VESA 40 x 40 cm y giro de 180°", "Distancia a pared regulable de 6 a 38 cm"],
    specs: { Modelo: "EuroSound ESM8000", Pantallas: '32" a 55"', "Peso máximo": "30 kg", VESA: "40 x 40 cm" },
  },
  {
    id: "zapatero-4-niveles",
    name: "Zapatero Metal 4 Niveles",
    subtitle: "Estante organizador de 4 niveles",
    category: "hogar",
    priceArs: 11900,
    cardPriceArs: 12900,
    image: "/assets/products/joaquina/zapatero-metal.jpg",
    colors: ["Negro / Acero"],
    short: "Ordená la entrada y ganá espacio. Estructura metálica con cuatro niveles de barras.",
    benefits: ["Cuatro niveles de apoyo", "Estructura liviana y resistente", "Se arma sin herramientas especiales"],
    specs: { Niveles: "4", Material: "Metal y plástico reforzado", Uso: "Zapatos y accesorios" },
  },
  {
    id: "zapatero-5-niveles",
    name: "Zapatero Metal 5 Niveles",
    subtitle: "Estante organizador de 5 niveles",
    category: "hogar",
    priceArs: 13900,
    cardPriceArs: 14900,
    image: "/assets/products/joaquina/zapatero-metal.jpg",
    colors: ["Negro / Acero"],
    short: "La versión más alta del organizador: cinco niveles para toda la familia.",
    benefits: ["Cinco niveles de apoyo", "Estructura metálica desmontable", "Ideal para placard o lavadero"],
    specs: { Niveles: "5", Material: "Metal y plástico reforzado", Uso: "Zapatos y accesorios" },
  },
  {
    id: "encendedor-electrico",
    name: "Encendedor Eléctrico de Arco",
    subtitle: "Recargable, flexible 360° y sin gas",
    category: "hogar",
    priceArs: 6900,
    cardPriceArs: 7900,
    image: "/assets/products/joaquina/encendedor-electrico.jpg",
    colors: ["Plateado"],
    short: "Encendé velas y hornallas sin llama ni gas. Cuello flexible y carga por USB.",
    benefits: ["Arco eléctrico a prueba de viento", "Cuello flexible de 360°", "Traba de seguridad y cable USB incluido"],
    specs: { Alimentación: "Batería recargable USB", Incluye: "Encendedor y cable USB", Seguridad: "Traba y apagado automático" },
  },
  {
    id: "inversor-auto",
    name: "Inversor de Corriente 150 W",
    subtitle: "Para auto, 12V/24V a 220V con USB-C",
    category: "tecnologia",
    priceArs: 24900,
    cardPriceArs: 27900,
    image: "/assets/products/joaquina/inversor-auto.jpg",
    colors: ["Negro"],
    short: "Llevá la energía siempre con vos. Convertí la batería del auto en 220V para cargar y trabajar.",
    benefits: ["Salida de 220V y 150 W", "Puertos USB y USB-C", "Protección contra sobrecarga y baja tensión"],
    specs: { Potencia: "150 W", Entrada: "12V / 24V", Salida: "220V · 50/60 Hz", Incluye: "Conexión para encendedor" },
  },
  {
    id: "secador-profesional",
    name: "Secador Profesional",
    subtitle: "Con difusor, concentrador y peine",
    category: "cuidado",
    priceArs: 19900,
    cardPriceArs: 21900,
    image: "/assets/products/joaquina/secador-profesional.jpg",
    colors: ["Negro"],
    short: "Secado rápido y acabado prolijo, con los accesorios que realmente usás.",
    benefits: ["Incluye difusor para rulos", "Concentrador y peine incluidos", "Cuerpo liviano para uso diario"],
    specs: { Incluye: "Secador, difusor, concentrador y peine", Color: "Negro", Uso: "Profesional y hogar" },
  },
  {
    id: "set-utensilios-12",
    name: "Set de Utensilios 12 Piezas",
    subtitle: "Silicona con mango de bambú y recipiente",
    category: "cocina",
    priceArs: 19900,
    cardPriceArs: 21900,
    image: "/assets/products/joaquina/set-utensilios-12.jpg",
    colors: ["Negro / Bambú"],
    short: "Todo lo que necesitás para cocinar, en un set que también decora la mesada.",
    benefits: ["11 utensilios + recipiente contenedor", "Silicona apta para antiadherente", "Mangos de bambú"],
    specs: { Piezas: "12", Material: "Silicona y bambú", Incluye: "Recipiente de almacenamiento" },
  },
  {
    id: "cortadora-mascotas",
    name: "Cortadora de Pelo para Mascotas",
    subtitle: "Kit profesional con accesorios",
    category: "cuidado",
    priceArs: 18900,
    cardPriceArs: 20900,
    image: "/assets/products/joaquina/cortadora-mascotas.jpg",
    colors: ["Plateado"],
    short: "Cortá el pelo de tu mascota en casa con un kit completo y silencioso.",
    benefits: ["Incluye peines, tijeras y cortaúñas", "Cuchilla de acero ajustable", "Carga por USB"],
    specs: { Incluye: "Máquina, peines, tijeras, peine metálico y cortaúñas", Alimentación: "Recargable USB", Uso: "Perros y gatos" },
  },
  {
    id: "yogurtera-7-vasos",
    name: "Yogurtera 7 Vasos de Vidrio",
    subtitle: "Suono con tapa y vasos individuales",
    category: "cocina",
    priceArs: 39900,
    cardPriceArs: 43900,
    image: "/assets/products/joaquina/yogurtera-7-vasos.jpg",
    colors: ["Celeste"],
    short: "Hacé yogur casero en porciones listas para la heladera. Siete vasos de vidrio reutilizables.",
    benefits: ["7 vasos de vidrio con tapa", "Base eléctrica con indicador", "Ideal para yogur natural y bebible"],
    specs: { Marca: "Suono", Capacidad: "7 vasos individuales", Material: "Vidrio y plástico libre de BPA" },
  },
  {
    id: "sandwich-maker",
    name: "Sandwich Maker Gourmet 3 en 1",
    subtitle: "Suono con placas intercambiables",
    category: "cocina",
    priceArs: 49900,
    cardPriceArs: 54900,
    image: "/assets/products/joaquina/sandwich-maker.jpg",
    colors: ["Negro"],
    short: "Sándwiches, waffles y parrilla con un solo electrodoméstico. Placas antiadherentes intercambiables.",
    benefits: ["Tres juegos de placas", "Superficie antiadherente", "Cierre seguro y fácil limpieza"],
    specs: { Marca: "Suono", Funciones: "Sándwich, waffle y grill", Placas: "Intercambiables y antiadherentes" },
  },
  {
    id: "exprimidor",
    name: "Exprimidor Suono",
    subtitle: "Eléctrico con jarra transparente",
    category: "cocina",
    priceArs: 32900,
    cardPriceArs: 35900,
    image: "/assets/products/joaquina/exprimidor.jpg",
    colors: ["Negro / Acero"],
    short: "Jugo fresco en segundos, sin esfuerzo. Cono y filtro desmontables para limpiar rápido.",
    benefits: ["Exprime cítricos de forma automática", "Jarra transparente con asa", "Partes desmontables aptas para lavar"],
    specs: { Marca: "Suono", Incluye: "Exprimidor y jarra", Material: "Plástico y acero inoxidable" },
  },
  {
    id: "cafetera-digital",
    name: "Cafetera de Filtro Digital",
    subtitle: "Suono 1.5 L con pantalla y keep warm",
    category: "cocina",
    priceArs: 64900,
    cardPriceArs: 69900,
    image: "/assets/products/joaquina/cafetera-digital.jpg",
    colors: ["Acero / Negro"],
    short: "Café recién hecho para toda la casa. Filtro digital, jarra de 1.5 L y función para mantener caliente.",
    benefits: ["Pantalla digital y programación", "Jarra de vidrio de 1.5 L", "Función keep warm"],
    specs: { Marca: "Suono", Capacidad: "1.5 L", Potencia: "900 W", Funciones: "Filtro digital y mantener caliente" },
  },
  {
    id: "pava-electrica",
    name: "Pava Eléctrica Hervidora 2 L",
    subtitle: "EITTEL de acero inoxidable",
    category: "cocina",
    priceArs: 18900,
    cardPriceArs: 20900,
    image: "/assets/products/joaquina/pava-electrica.jpg",
    colors: ["Acero"],
    short: "Herví agua en minutos para el mate, el té o la cocina. Corte automático y base giratoria.",
    benefits: ["Capacidad de 2 litros", "Acero inoxidable y corte automático", "Base giratoria de 360°"],
    specs: { Marca: "EITTEL", Capacidad: "2 L", Material: "Acero inoxidable", Voltaje: "220V" },
  },
  {
    id: "pizza-maker",
    name: "Pizza Maker & Grill",
    subtitle: "Suono con apertura de 180°",
    category: "cocina",
    priceArs: 64900,
    cardPriceArs: 69900,
    image: "/assets/products/joaquina/pizza-maker.jpg",
    colors: ["Negro"],
    short: "Pizza casera con masa crocante y grill para carnes y verduras. Se abre 180° como plancha.",
    benefits: ["Apertura total de 180°", "Superficie antiadherente", "Ideal para pizza, carne y vegetales"],
    specs: { Marca: "Suono", Potencia: "1200 W", Apertura: "180°", Superficie: "Antiadherente" },
  },
  {
    id: "alfombra-bano",
    name: "Alfombra de Baño 38 x 58 cm",
    subtitle: "Camponayo extra suave y antideslizante",
    category: "bano",
    priceArs: 6900,
    cardPriceArs: 7900,
    image: "/assets/products/joaquina/alfombra-bano.jpg",
    colors: ["Bizon", "Gris", "Negro", "Gris oscuro", "Azul"],
    short: "Pisá suave al salir de la ducha. Felpa de gran absorción con base antideslizante.",
    benefits: ["Textura extra suave", "Gran absorción de agua", "Base antideslizante"],
    specs: { Marca: "Camponayo", Medidas: "38 x 58 cm", Colores: "Bizon, gris, negro, gris oscuro y azul" },
  },
  {
    id: "set-jarra-7",
    name: "Set Jarra + 6 Vasos Azul",
    subtitle: "7 piezas de vidrio azul ahumado",
    category: "cocina",
    priceArs: 24900,
    cardPriceArs: 27900,
    image: "/assets/products/joaquina/set-jarra-7.jpg",
    colors: ["Azul ahumado"],
    short: "Una mesa que se ve fresca y ordenada. Jarra con seis vasos de vidrio libre de plomo.",
    benefits: ["7 piezas: 1 jarra + 6 vasos", "Vidrio libre de plomo", "Color azul ahumado"],
    specs: { Piezas: "7", Material: "Vidrio libre de plomo", Color: "Azul ahumado" },
  },
  {
    id: "funda-sofa",
    name: "Funda de Sofá Universal 2 Cuerpos",
    subtitle: "Teka elástica y lavable",
    category: "hogar",
    priceArs: 27900,
    cardPriceArs: 29900,
    image: "/assets/products/joaquina/funda-sofa.jpg",
    colors: ["Gris", "Beige", "Rojo", "Azul", "Chocolate", "Crema"],
    short: "Renová el living sin cambiar el sofá. Funda elástica que se adapta y protege.",
    benefits: ["Se adapta a sofás de 2 cuerpos", "Protege la tapicería del uso diario", "Fácil de lavar"],
    specs: { Marca: "Teka", Cuerpos: "2", Colores: "Gris, beige, rojo, azul, chocolate y crema" },
  },
  {
    id: "protector-cortina",
    name: "Protector para Cortina de Baño",
    subtitle: "50 micrones, 1.80 x 1.80 m",
    category: "bano",
    priceArs: 4900,
    cardPriceArs: 5900,
    image: "/assets/products/joaquina/protector-cortina.jpg",
    colors: ["Blanco", "Translúcido", "Beige"],
    short: "Protegé la cortina y mantené el baño impecable. Polietileno resistente con proceso antihongos.",
    benefits: ["50 micrones de alta resistencia", "Cabezal reforzado con doble soldadura", "Incluye 12 ganchos de sujeción"],
    specs: { Medida: "1.80 x 1.80 m", Material: "Polietileno 100%", Incluye: "12 ganchos", Colores: "Blanco, translúcido y beige" },
  },
  {
    id: "mantel-ecocuero-220",
    name: "Mantel Ecocuero 1.40 x 2.20 m",
    subtitle: "Impermeable y antideslizante",
    category: "hogar",
    priceArs: 12900,
    cardPriceArs: 14900,
    image: "/assets/products/joaquina/mantel-ecocuero-220.jpg",
    colors: ["Negro", "Gris plata", "Blanco", "Beige", "Chocolate", "Rojo"],
    short: "Vestí la mesa todos los días sin preocuparte por manchas. Ecocuero impermeable y fácil de limpiar.",
    benefits: ["Protege la mesa y evita rayaduras", "Impermeable y antideslizante", "Se limpia con un paño"],
    specs: { Medidas: "1.40 x 2.20 m", Material: "Ecocuero", Colores: "Negro, gris plata, blanco, beige, chocolate y rojo" },
  },
  {
    id: "mantel-ecocuero-180",
    name: "Mantel Ecocuero con Friselina 1.40 x 1.80 m",
    subtitle: "Impermeable, con base de friselina",
    category: "hogar",
    priceArs: 9900,
    cardPriceArs: 10900,
    image: "/assets/products/joaquina/mantel-ecocuero-180.jpg",
    gallery: ["/assets/products/joaquina/mantel-ecocuero-180.jpg", "/assets/products/joaquina/mantel-ecocuero-180-bordo.jpg"],
    colors: ["Negro", "Gris plata", "Blanco", "Beige", "Chocolate", "Rojo", "Bordó"],
    badge: "Oferta",
    short: "El mantel diario que combina con todo. Ecocuero con friselina, impermeable y antideslizante.",
    benefits: ["Base de friselina que no resbala", "Impermeable y fácil de limpiar", "Disponible en siete colores"],
    specs: { Medidas: "1.40 x 1.80 m", Material: "Ecocuero con friselina", Colores: "Negro, gris plata, blanco, beige, chocolate, rojo y bordó" },
  },
  {
    id: "set-jarra-4",
    name: "Set Jarra + 4 Vasos Acanalado",
    subtitle: "Vidrio acanalado con tapa de bambú",
    category: "cocina",
    priceArs: 16900,
    cardPriceArs: 18900,
    image: "/assets/products/joaquina/set-jarra-4.jpg",
    colors: ["Ámbar / Bambú"],
    short: "Serví agua, jugos o infusiones con una jarra que se luce en la mesa.",
    benefits: ["Jarra con tapa de bambú", "Cuatro vasos de vidrio acanalado", "Diseño apilable y fácil de lavar"],
    specs: { Piezas: "5 (1 jarra + 4 vasos)", Material: "Vidrio y bambú", Color: "Ámbar" },
  },
  {
    id: "lampara-pared",
    name: "Lámpara de Pared Recargable",
    subtitle: "2 unidades con control remoto",
    category: "deco",
    priceArs: 9900,
    cardPriceArs: 11900,
    image: "/assets/products/joaquina/lampara-pared.jpg",
    colors: ["Blanco"],
    badge: "Nuevo",
    short: "Luz cálida sin cables ni instalación. Dos apliques recargables con control remoto.",
    benefits: ["Dos lámparas por caja", "Control remoto con colores", "Recargables por USB"],
    specs: { Incluye: "2 lámparas y control remoto", Alimentación: "Batería recargable", Montaje: "Pared, sin cableado" },
  },
  {
    id: "luz-sensor",
    name: "Luz Inteligente con Sensor",
    subtitle: "Recargable, para placard y pasillos",
    category: "deco",
    priceArs: 9900,
    cardPriceArs: 11900,
    image: "/assets/products/joaquina/luz-sensor.jpg",
    colors: ["Madera"],
    badge: "Nuevo",
    short: "Se enciende sola cuando pasás. Ideal para placares, escaleras y rincones sin enchufe.",
    benefits: ["Sensor de movimiento", "Diseño de madera cálido", "Batería recargable"],
    specs: { Material: "Madera y plástico", Sensor: "Movimiento", Alimentación: "Recargable USB" },
  },
  {
    id: "especiero-giratorio",
    name: "Especiero Giratorio 6 Frascos",
    subtitle: "Redondo, con frascos de vidrio",
    category: "cocina",
    priceArs: 18900,
    cardPriceArs: 20900,
    image: "/assets/products/joaquina/especiero-giratorio.jpg",
    colors: ["Negro / Vidrio"],
    short: "Tené tus especias a mano y ordenadas. Base giratoria con seis frascos de vidrio.",
    benefits: ["Gira 360° para encontrar todo", "6 frascos de vidrio con tapa", "Base compacta para la mesada"],
    specs: { Medidas: "16.5 x 13.5 cm", Incluye: "6 frascos de vidrio", Material: "Metal y vidrio" },
  },
  {
    id: "cepillo-bano",
    name: "Cepillo de Baño Negro",
    subtitle: "Con soporte y borde plateado",
    category: "bano",
    priceArs: 9900,
    cardPriceArs: 11900,
    image: "/assets/products/joaquina/cepillo-bano.jpg",
    colors: ["Negro"],
    short: "Un detalle que ordena el baño. Cepillo con soporte, mango largo y acabado moderno.",
    benefits: ["Incluye soporte de piso", "Mango largo y cepillo reemplazable", "Plástico resistente fácil de limpiar"],
    specs: { Medidas: "9.5 x 9.5 x 37.5 cm", Modelo: "BSM052 / B5172H", Material: "Plástico" },
  },
  {
    id: "organizador-ollas",
    name: "Organizador de Ollas Extensible",
    subtitle: "Acero negro para 30 a 58 cm",
    category: "cocina",
    priceArs: 13900,
    cardPriceArs: 15900,
    image: "/assets/products/joaquina/organizador-ollas.jpg",
    colors: ["Negro"],
    short: "Ganá lugar en el bajo mesada. Organizador extensible que separa ollas, sartenes y tapas.",
    benefits: ["Se extiende de 30 a 58 cm", "Estructura de acero resistente", "Compatible con ollas y tapas"],
    specs: { Medidas: "18 x 18 x 30-58 cm", Material: "Acero", Color: "Negro" },
  },
  {
    id: "mesa-ratona",
    name: "Mesa Auxiliar Ratona en C",
    subtitle: "Diseño moderno, tapa blanca y base negra",
    category: "deco",
    priceArs: 27900,
    cardPriceArs: 29900,
    image: "/assets/products/joaquina/mesa-ratona.jpg",
    colors: ["Blanco / Negro"],
    badge: "Nuevo",
    short: "La mesa que resuelve el living. Diseño en C para apoyar el mate, la notebook o el control.",
    benefits: ["Base en C que se acerca al sofá", "Tapa MDF y estructura reforzada", "Fácil de armar"],
    specs: { Medidas: "60 x 40 x 30 cm", Material: "MDF y metal", Colores: "Tapa blanca, base negra" },
  },
  {
    id: "set-matero",
    name: "Set Matero Marwal 3 Piezas",
    subtitle: "Yerbera, azucarera y mate",
    category: "cocina",
    priceArs: 8900,
    cardPriceArs: 9900,
    image: "/assets/products/joaquina/set-matero.jpg",
    colors: ["Es Hora de Tomarse Tu Tiempo", "Diseño floral", "Diseño abstracto", "Diseño verde", "Diseño azul"],
    short: "Un set matero lindo para regalar o regalarte. Tres piezas con diseños exclusivos.",
    benefits: ["Set completo de 3 piezas", "Cinco diseños disponibles", "Yerbera y azucarera con tapa"],
    specs: { Marca: "Marwal", Incluye: "Yerbera, azucarera y mate", Diseños: "5 modelos" },
  },
  {
    id: "dispensador-aceite",
    name: "Dispensador de Aceite 300 ml",
    subtitle: "Vidrio y acero con dosificador",
    category: "cocina",
    priceArs: 6900,
    cardPriceArs: 7900,
    image: "/assets/products/joaquina/dispensador-aceite.jpg",
    colors: ["Acero / Vidrio"],
    short: "Dosificá el aceite sin manchar y dejá la cocina prolija.",
    benefits: ["Dosificador preciso", "Cuerpo de vidrio con detalles de acero", "Capacidad de 300 ml"],
    specs: { Capacidad: "300 ml", Material: "Vidrio y acero inoxidable", Uso: "Aceite, vinagre y salsas" },
  },
  {
    id: "set-aceiteras",
    name: "Set 2 Aceiteras con Base de Bambú",
    subtitle: "150 ml cada una",
    category: "cocina",
    priceArs: 11900,
    cardPriceArs: 13900,
    image: "/assets/products/joaquina/set-aceiteras.jpg",
    colors: ["Vidrio / Bambú"],
    short: "Aceite y vinagre siempre a mano, con una base de bambú que ordena la mesa.",
    benefits: ["Dos botellas de 150 ml", "Base de bambú", "Picos dosificadores de acero"],
    specs: { Capacidad: "2 x 150 ml", Material: "Vidrio, acero y bambú", Incluye: "Base y dos picos" },
  },
  {
    id: "parlante-mini",
    name: "Parlante Mini LED RGB",
    subtitle: "Wireless, recargable y con luces",
    category: "tecnologia",
    priceArs: 8900,
    cardPriceArs: 9900,
    image: "/assets/products/joaquina/parlante-mini.jpg",
    colors: ["Negro"],
    short: "Música y luz ambiente en un parlante de bolsillo. Conectá por wireless y listo.",
    benefits: ["Conexión inalámbrica", "Batería recargable", "Luces LED RGB"],
    specs: { Conexión: "Wireless", Alimentación: "Batería recargable", Iluminación: "LED RGB" },
  },
  {
    id: "parlante-kbroad",
    name: "Parlante Portátil KBROAD",
    subtitle: "Bluetooth, 500 mAh y luces RGB",
    category: "tecnologia",
    priceArs: 29900,
    cardPriceArs: 32900,
    image: "/assets/products/joaquina/parlante-kbroad.jpg",
    colors: ["Negro"],
    short: "Sonido portátil con presencia. Parlante Bluetooth con batería de 500 mAh y luz RGB.",
    benefits: ["Bluetooth con alcance portátil", "Batería de 500 mAh", "Luces RGB integradas"],
    specs: { Marca: "KBROAD", Batería: "500 mAh", Conexión: "Bluetooth", Iluminación: "RGB" },
  },
  {
    id: "luz-emergencia",
    name: "Luz de Emergencia 30 LED",
    subtitle: "Recargable y automática",
    category: "tecnologia",
    priceArs: 6900,
    cardPriceArs: 7900,
    image: "/assets/products/joaquina/luz-emergencia.jpg",
    colors: ["Gris"],
    short: "Que un corte de luz no te agarre a oscuras. Se enchufa, se carga y se enciende sola.",
    benefits: ["30 LED de alta luminosidad", "Se activa automáticamente al cortarse la luz", "Batería recargable"],
    specs: { Modelo: "Lambo Tech LM-LE003", LED: "30", Alimentación: "Recargable 220V" },
  },
  {
    id: "batidor-leche",
    name: "Batidor Espumador de Leche",
    subtitle: "Recargable Lambo Tech LT-25116",
    category: "cocina",
    priceArs: 5900,
    cardPriceArs: 6900,
    image: "/assets/products/joaquina/batidor-leche.jpg",
    colors: ["Blanco"],
    short: "Espuma de cafetería en casa. Batidor recargable para capuchino, chocolatada y huevos.",
    benefits: ["Recargable por USB", "Potente y liviano", "Fácil de limpiar"],
    specs: { Modelo: "Lambo Tech LT-25116", Color: "Blanco", Alimentación: "USB" },
  },
  {
    id: "set-bano-5",
    name: "Set de Baño Blanco 5 Piezas",
    subtitle: "Jabonera, vaso, porta cepillos, dispensador y cepillo",
    category: "bano",
    priceArs: 19900,
    cardPriceArs: 21900,
    image: "/assets/products/joaquina/set-bano-5.jpg",
    colors: ["Blanco"],
    short: "Un baño completo y coordinado en un solo set. Cinco piezas de plástico resistente.",
    benefits: ["5 piezas coordinadas", "Plástico resistente de alta calidad", "Fácil de limpiar"],
    specs: { Piezas: "5", Incluye: "Jabonera, vaso, porta cepillos, dispensador y cepillo", Color: "Blanco" },
  },
  {
    id: "mantel-vinilo",
    name: "Mantel de Vinilo Pesado 1.40 x 2.20 m",
    subtitle: "Impermeable con diseño geométrico",
    category: "hogar",
    priceArs: 7900,
    cardPriceArs: 8900,
    image: "/assets/products/joaquina/mantel-vinilo.jpg",
    colors: ["Gris / Blanco"],
    short: "Práctico, impermeable y con un diseño que combina con todo. Se limpia en segundos.",
    benefits: ["Vinilo pesado que cae prolijo", "Impermeable y fácil de limpiar", "Diseño geométrico"],
    specs: { Medidas: "1.40 x 2.20 m", Material: "Vinilo", Uso: "Interior y exterior" },
  },
  {
    id: "secaplatos-teka",
    name: "Secaplatos de Toalla Teka",
    subtitle: "Línea Pachamama súper absorbente",
    category: "cocina",
    priceArs: 3900,
    cardPriceArs: 4500,
    image: "/assets/products/joaquina/secaplatos-teka.jpg",
    colors: ["Gris", "Azul", "Negro", "Beige", "Celeste"],
    short: "Secá platos y vasos sin dejar marcas. Tela súper absorbente con diseños de la línea Pachamama.",
    benefits: ["Súper absorbente y de secado rápido", "Resistente y durable", "Varios diseños disponibles"],
    specs: { Marca: "Teka", Línea: "Pachamama", Material: "Toalla de algodón" },
  },
  {
    id: "cepillo-alisador",
    name: "Cepillo Alisador y Secador Tokyo Style",
    subtitle: "2 en 1: seca y alisa en minutos",
    category: "cuidado",
    priceArs: 19900,
    cardPriceArs: 21900,
    image: "/assets/products/joaquina/cepillo-alisador.jpg",
    colors: ["Negro / Violeta"],
    short: "Peinado rápido sin plancha. Cepillo que seca y alisa mientras peinás.",
    benefits: ["Función secadora y alisadora", "Cerdas que desenredan", "Diseño liviano para uso diario"],
    specs: { Marca: "Tokyo Style", Función: "2 en 1", Color: "Negro y violeta" },
  },
  {
    id: "cortina-blackout",
    name: "Cortina Blackout 2 Paños 1.36 x 1.50 m",
    subtitle: "Camponayo línea Look",
    category: "hogar",
    priceArs: 24900,
    cardPriceArs: 27900,
    image: "/assets/products/joaquina/cortina-blackout.jpg",
    colors: ["Bizon", "Gris oscuro", "Gris medio", "Tostado"],
    short: "Oscurecé, aislá y vestí el ambiente. Dos paños de tela blackout de alta calidad.",
    benefits: ["Bloquea la luz y da privacidad", "Tela de alta calidad", "Incluye dos paños de 1.36 x 1.50 m"],
    specs: { Marca: "Camponayo", Línea: "Look", Medidas: "2 paños de 1.36 x 1.50 m", Colores: "Bizon, gris oscuro, gris medio y tostado" },
  },
];

function normalizeBase(product, index) {
  return {
    ...product,
    slug: product.id,
    compareAtArs: 0,
    costArs: Math.round(product.priceArs * 0.6),
    stock: product.stock ?? 20,
    rating: 0,
    reviews: 0,
    image: `${product.image}?v=20261111`,
    gallery: (product.gallery || [product.image]).map((image) => `${image}?v=20261111`),
    supplierSku: `LJ-${String(index + 1).padStart(3, "0")}`,
    shippingDays: "5 a 9 días hábiles",
  };
}

export const BASE_PRODUCTS = RAW.map(normalizeBase);
export const BUNDLES = [];

function mergeList() {
  let overrides = {};
  let custom = [];
  try {
    // lazy import to avoid circular deps at module init in some contexts
    const { getDb } = require ? null : null;
  } catch {}
  try {
    // dynamic access via global store if loaded
    // we'll use a soft approach: import store lazily
  } catch {}
  return { overrides, custom };
}

export function getProducts() {
  return getAllProducts().filter((p) => !p.bundle);
}

export function getAllProducts() {
  let db;
  try {
    // eslint-disable-next-line global-require
    db = globalThis.__aureaGetDb ? globalThis.__aureaGetDb() : null;
  } catch {}
  if (!db) {
    try {
      // synchronous require not available in ESM; use store module state via a hook
    } catch {}
  }
  // We'll read from store's getDb if available through a cached reference
  let overrides = {};
  let custom = [];
  try {
    if (globalThis.__aureaStore?.getDb) {
      const d = globalThis.__aureaStore.getDb();
      overrides = d.productOverrides || {};
      custom = d.customProducts || [];
    }
  } catch {}
  // fallback: try to import store synchronously via createRequire pattern not set; 
  // instead, catalog consumers in this app run after store init - use a module-level setter.
  overrides = _overrideState.overrides || {};
  custom = _overrideState.custom || [];
  const mergedBase = BASE_PRODUCTS.map((p) => applyOverride(p, overrides[p.id]));
  const mergedCustom = custom.map((p) => normalizeCustom(p));
  return [...mergedBase, ...mergedCustom, ...BUNDLES];
}

const _overrideState = { overrides: {}, custom: [], ready: false };

export function setCatalogOverrides(overrides = {}, custom = []) {
  _overrideState.overrides = overrides || {};
  _overrideState.custom = Array.isArray(custom) ? custom : [];
  _overrideState.ready = true;
}

function applyOverride(base, ov) {
  if (!ov) return { ...base };
  const merged = { ...base, ...ov };
  if (ov.gallery && Array.isArray(ov.gallery) && ov.gallery.length) merged.gallery = ov.gallery;
  if (ov.colors && Array.isArray(ov.colors)) merged.colors = ov.colors;
  if (ov.benefits && Array.isArray(ov.benefits)) merged.benefits = ov.benefits;
  if (ov.specs && ov.specs && typeof ov.specs === 'object') merged.specs = ov.specs;
  // ensure derived/display fields stay coherent
  if (merged.image && !String(merged.image).includes('?v=')) merged.image = merged.image;
  if (!Array.isArray(merged.gallery) || !merged.gallery.length) merged.gallery = [merged.image];
  merged.slug = merged.slug || merged.id;
  return merged;
}

function normalizeCustom(p) {
  const id = String(p.id || '').trim();
  const image = p.image || '/assets/products/joaquina/placeholder.jpg';
  return {
    compareAtArs: 0,
    costArs: Math.round(Number(p.priceArs || 0) * 0.6),
    rating: 0,
    reviews: 0,
    shippingDays: '5 a 9 días hábiles',
    colors: [],
    benefits: [],
    specs: {},
    badge: '',
    short: '',
    subtitle: '',
    ...p,
    id,
    slug: p.slug || id,
    priceArs: Number(p.priceArs || 0),
    cardPriceArs: p.cardPriceArs != null ? Number(p.cardPriceArs) : undefined,
    image,
    gallery: Array.isArray(p.gallery) && p.gallery.length ? p.gallery : [image],
    category: p.category || 'hogar',
    name: p.name || 'Producto',
    isCustom: true,
  };
}

export function findProduct(id) {
  return getAllProducts().find((p) => p.id === id || p.slug === id);
}

/* Precio en la moneda del país. AR = ARS; resto = USD redondeado.
 * `priceMode = "card"` usa el precio con tarjeta cuando está cargado. */
export function priceFor(product, currency, arsPerUsd, priceMode = "cash") {
  const ars =
    priceMode === "card" && product.cardPriceArs ? product.cardPriceArs : product.priceArs;
  if (currency === "ARS") {
    return { price: ars, compareAt: product.compareAtArs || 0 };
  }
  return {
    price: Math.round(ars / arsPerUsd),
    compareAt: Math.round((product.compareAtArs || 0) / arsPerUsd),
  };
}

// Backward-compatible exports (snapshots at import time). Prefer getAllProducts()/findProduct().
// NOTE: these are static snapshots; runtime code should use getters for override-aware data.
export const PRODUCTS = BASE_PRODUCTS;
export const ALL_PRODUCTS = BASE_PRODUCTS;
