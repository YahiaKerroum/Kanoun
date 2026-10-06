/**
 * Synthetic content for the Dar Nedjma sample restaurant: an Algerian menu,
 * two branches of tables, the wider team, and guest names. Everything here is
 * fictional. Prices are in Algerian dinars.
 */

export interface CatalogOption {
  readonly name: string;
  readonly priceDelta: string;
}

export interface CatalogOptionGroup {
  readonly name: string;
  readonly selectionType: "single" | "multiple";
  readonly isRequired: boolean;
  readonly minimumSelections: number;
  readonly maximumSelections: number;
  readonly options: readonly CatalogOption[];
}

export interface CatalogDish {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly price: string;
  readonly image?: string;
  readonly optionGroups?: readonly CatalogOptionGroup[];
  /** Relative popularity when generating orders. */
  readonly weight: number;
}

export interface CatalogCategory {
  readonly name: string;
  readonly dishes: readonly CatalogDish[];
}

const cooking: CatalogOptionGroup = {
  name: "Cuisson",
  selectionType: "single",
  isRequired: true,
  minimumSelections: 1,
  maximumSelections: 1,
  options: [
    { name: "Saignant", priceDelta: "0.00" },
    { name: "À point", priceDelta: "0.00" },
    { name: "Bien cuit", priceDelta: "0.00" },
  ],
};

const side: CatalogOptionGroup = {
  name: "Accompagnement",
  selectionType: "single",
  isRequired: true,
  minimumSelections: 1,
  maximumSelections: 1,
  options: [
    { name: "Frites maison", priceDelta: "0.00" },
    { name: "Riz safrané", priceDelta: "0.00" },
    { name: "Salade de saison", priceDelta: "0.00" },
  ],
};

export const SAMPLE_MENU: readonly CatalogCategory[] = [
  {
    name: "Soupes",
    dishes: [
      {
        key: "chorba-frik",
        name: "Chorba frik",
        description: "Lamb and cracked green wheat soup with coriander.",
        price: "450.00",
        weight: 6,
      },
      {
        key: "harira",
        name: "Harira",
        description:
          "Tomato, lentil, and chickpea soup with a squeeze of lemon.",
        price: "400.00",
        weight: 3,
      },
      {
        key: "chorba-beida",
        name: "Chorba beïda",
        description: "White chicken soup with vermicelli and egg.",
        price: "450.00",
        weight: 2,
      },
    ],
  },
  {
    name: "Entrées",
    dishes: [
      {
        key: "bourek",
        name: "Bourek à la viande",
        description: "Crisp pastry rolls with spiced minced beef and parsley.",
        price: "350.00",
        weight: 7,
        optionGroups: [
          {
            name: "Portion",
            selectionType: "single",
            isRequired: true,
            minimumSelections: 1,
            maximumSelections: 1,
            options: [
              { name: "3 pièces", priceDelta: "0.00" },
              { name: "6 pièces", priceDelta: "300.00" },
            ],
          },
        ],
      },
      {
        key: "mechouia",
        name: "Salade méchouia",
        description: "Charred peppers and tomatoes with garlic and olive oil.",
        price: "400.00",
        weight: 5,
      },
      {
        key: "hmiss",
        name: "H'miss",
        description: "Grilled pepper and tomato dip with warm kesra.",
        price: "380.00",
        weight: 3,
      },
      {
        key: "dolma",
        name: "Dolma",
        description:
          "Courgettes stuffed with rice and minced lamb, white sauce.",
        price: "650.00",
        weight: 2,
      },
    ],
  },
  {
    name: "Plats",
    dishes: [
      {
        key: "couscous",
        name: "Couscous royale",
        description:
          "Steamed semolina with lamb, merguez, and seasonal vegetables.",
        price: "1850.00",
        image: "couscous-royale.webp",
        weight: 9,
        optionGroups: [
          {
            name: "Viande",
            selectionType: "single",
            isRequired: true,
            minimumSelections: 1,
            maximumSelections: 1,
            options: [
              { name: "Agneau", priceDelta: "0.00" },
              { name: "Poulet", priceDelta: "-200.00" },
              { name: "Agneau et merguez", priceDelta: "250.00" },
            ],
          },
          {
            name: "Extras",
            selectionType: "multiple",
            isRequired: false,
            minimumSelections: 0,
            maximumSelections: 2,
            options: [
              { name: "Raisins secs", priceDelta: "100.00" },
              { name: "Lben", priceDelta: "150.00" },
            ],
          },
        ],
      },
      {
        key: "rechta",
        name: "Rechta au poulet",
        description: "Hand-cut noodles with chicken, turnips, and chickpeas.",
        price: "2400.00",
        image: "rechta.webp",
        weight: 6,
      },
      {
        key: "tajine-zitoune",
        name: "Tajine zitoune",
        description: "Chicken with green olives, carrots, and preserved lemon.",
        price: "1600.00",
        weight: 5,
      },
      {
        key: "chakhchoukha",
        name: "Chakhchoukha",
        description: "Torn flatbread in a spiced tomato and lamb sauce.",
        price: "1700.00",
        weight: 3,
      },
      {
        key: "mtewem",
        name: "Mtewem",
        description: "Garlic meatballs and lamb in a chickpea sauce.",
        price: "1500.00",
        weight: 3,
      },
      {
        key: "loubia",
        name: "Loubia",
        description: "Slow-cooked white beans with cumin and paprika.",
        price: "900.00",
        weight: 3,
      },
      {
        key: "berkoukes",
        name: "Berkoukes",
        description: "Hand-rolled pearl semolina with vegetables and lamb.",
        price: "1300.00",
        weight: 2,
      },
    ],
  },
  {
    name: "Grillades",
    dishes: [
      {
        key: "brochettes",
        name: "Brochettes d'agneau",
        description: "Charcoal-grilled lamb skewers with cumin salt.",
        price: "1900.00",
        weight: 6,
        optionGroups: [cooking, side],
      },
      {
        key: "cotelettes",
        name: "Côtelettes d'agneau",
        description: "Four lamb cutlets grilled over charcoal.",
        price: "2600.00",
        weight: 3,
        optionGroups: [cooking, side],
      },
      {
        key: "merguez",
        name: "Merguez grillées",
        description: "House merguez with harissa and grilled peppers.",
        price: "1400.00",
        weight: 4,
        optionGroups: [side],
      },
      {
        key: "poulet-grille",
        name: "Poulet grillé",
        description: "Half chicken marinated in garlic, lemon, and paprika.",
        price: "1600.00",
        weight: 4,
        optionGroups: [side],
      },
      {
        key: "poisson",
        name: "Poisson du jour",
        description:
          "Whole fish from the morning market, grilled with chermoula.",
        price: "2800.00",
        weight: 2,
        optionGroups: [side],
      },
    ],
  },
  {
    name: "Desserts",
    dishes: [
      {
        key: "makroud",
        name: "Makroud",
        description: "Semolina diamonds filled with dates, soaked in honey.",
        price: "300.00",
        weight: 4,
      },
      {
        key: "baklawa",
        name: "Baklawa",
        description: "Almond and walnut pastry with orange-blossom syrup.",
        price: "450.00",
        weight: 4,
      },
      {
        key: "zlabia",
        name: "Zlabia",
        description: "Crisp honey fritters, a Ramadan favourite all year.",
        price: "300.00",
        weight: 2,
      },
      {
        key: "qalb-el-louz",
        name: "Qalb el louz",
        description: "Almond semolina cake in light syrup.",
        price: "350.00",
        weight: 3,
      },
      {
        key: "mhalbi",
        name: "Mhalbi",
        description: "Rice-flour cream with cinnamon and orange blossom.",
        price: "400.00",
        weight: 2,
      },
    ],
  },
  {
    name: "Boissons chaudes",
    dishes: [
      {
        key: "the",
        name: "Thé à la menthe",
        description: "Fresh mint tea served in a traditional glass.",
        price: "350.00",
        weight: 8,
        optionGroups: [
          {
            name: "Sucre",
            selectionType: "single",
            isRequired: true,
            minimumSelections: 1,
            maximumSelections: 1,
            options: [
              { name: "Normal", priceDelta: "0.00" },
              { name: "Peu sucré", priceDelta: "0.00" },
              { name: "Sans sucre", priceDelta: "0.00" },
            ],
          },
        ],
      },
      {
        key: "cafe",
        name: "Café",
        description: "Short espresso.",
        price: "200.00",
        weight: 6,
      },
      {
        key: "cafe-lait",
        name: "Café au lait",
        description: "Espresso with steamed milk.",
        price: "250.00",
        weight: 3,
      },
    ],
  },
  {
    name: "Boissons fraîches",
    dishes: [
      {
        key: "citronnade",
        name: "Citronnade",
        description: "House lemonade with mint and orange blossom.",
        price: "400.00",
        weight: 5,
      },
      {
        key: "jus-orange",
        name: "Jus d'orange pressé",
        description: "Freshly squeezed oranges.",
        price: "500.00",
        weight: 4,
      },
      {
        key: "lben",
        name: "Lben",
        description: "Chilled fermented milk.",
        price: "200.00",
        weight: 3,
      },
      {
        key: "hamoud",
        name: "Hamoud Boualem",
        description: "The classic Algerian lemon soda.",
        price: "250.00",
        weight: 4,
      },
      {
        key: "eau",
        name: "Eau minérale",
        description: "Still mineral water, 1 L.",
        price: "150.00",
        weight: 5,
      },
    ],
  },
];

export interface CatalogTable {
  readonly code: string;
  readonly area: string;
}

function range(
  prefix: string,
  from: number,
  to: number,
  area: string,
): CatalogTable[] {
  const tables: CatalogTable[] = [];
  for (let number = from; number <= to; number += 1) {
    tables.push({ code: `${prefix}${String(number).padStart(2, "0")}`, area });
  }
  return tables;
}

export const HYDRA_TABLES: readonly CatalogTable[] = [
  ...range("T-", 1, 12, "Salle principale"),
  ...range("T-", 20, 25, "Terrasse"),
  ...range("S-", 1, 3, "Salon"),
];

export const BAB_EZZOUAR_TABLES: readonly CatalogTable[] = [
  ...range("B-", 1, 8, "Salle"),
];

export type TemplateKey =
  "administrator" | "general_staff" | "kitchen_staff" | "cashier";

export interface CatalogEmployee {
  readonly displayName: string;
  readonly email: string;
  readonly template: TemplateKey;
  readonly branch: "hydra" | "bab-ezzouar";
  /** How far through onboarding this person is. */
  readonly state: "active" | "invited" | "deactivated";
}

/** The team beyond the four sign-in roles defined in demo-types.ts. */
export const EXTRA_EMPLOYEES: readonly CatalogEmployee[] = [
  {
    displayName: "Riad Mansouri",
    email: "riad.mansouri@dar-nedjma.demo",
    template: "general_staff",
    branch: "hydra",
    state: "active",
  },
  {
    displayName: "Lina Haddad",
    email: "lina.haddad@dar-nedjma.demo",
    template: "general_staff",
    branch: "hydra",
    state: "active",
  },
  {
    displayName: "Omar Ferhat",
    email: "omar.ferhat@dar-nedjma.demo",
    template: "kitchen_staff",
    branch: "hydra",
    state: "active",
  },
  {
    displayName: "Yasmine Kaci",
    email: "yasmine.kaci@dar-nedjma.demo",
    template: "cashier",
    branch: "hydra",
    state: "active",
  },
  {
    displayName: "Walid Touati",
    email: "walid.touati@dar-nedjma.demo",
    template: "general_staff",
    branch: "hydra",
    state: "invited",
  },
  {
    displayName: "Karima Ziani",
    email: "karima.ziani@dar-nedjma.demo",
    template: "general_staff",
    branch: "hydra",
    state: "deactivated",
  },
  {
    displayName: "Sofiane Amrani",
    email: "sofiane.amrani@dar-nedjma.demo",
    template: "general_staff",
    branch: "bab-ezzouar",
    state: "active",
  },
  {
    displayName: "Meriem Saadi",
    email: "meriem.saadi@dar-nedjma.demo",
    template: "kitchen_staff",
    branch: "bab-ezzouar",
    state: "active",
  },
  {
    displayName: "Hichem Belaid",
    email: "hichem.belaid@dar-nedjma.demo",
    template: "cashier",
    branch: "bab-ezzouar",
    state: "active",
  },
];

export const GUEST_NAMES: readonly string[] = [
  "Amel Benkhaled",
  "Karim Bouzid",
  "Sarah Meziane",
  "Mehdi Larbi",
  "Nour Hamidi",
  "Yanis Belkacem",
  "Inès Rahmani",
  "Adel Chabane",
  "Rania Ouali",
  "Bilal Djebbar",
  "Selma Aït Ali",
  "Farid Guerroudj",
  "Hana Boukhari",
  "Anis Tebboune",
  "Lamia Kherbache",
  "Rachid Mebarki",
  "Dounia Saïdi",
  "Islem Benali",
  "Feriel Zerrouki",
  "Nassim Hadj",
];

export const CANCELLATION_REASONS: readonly string[] = [
  "Guest left before the order was prepared.",
  "Order entered on the wrong table.",
  "Guest changed their mind after a long wait.",
  "Duplicate order from two staff members.",
];

export const REFUND_REASONS: readonly string[] = [
  "Dish arrived cold; refunded the main course.",
  "Courtesy adjustment for a delayed side dish.",
  "Wrong drink served; refunded the difference.",
];
