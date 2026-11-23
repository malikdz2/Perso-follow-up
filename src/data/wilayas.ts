// Fichier généré par scripts/build-map.mjs — ne pas modifier à la main.
// Liste officielle des 69 wilayas (loi 26-06 du 4 avril 2026, JO n° 25 ; décret présidentiel 26-206, JO n° 40).
// x, y : position du chef-lieu sur la carte.

export interface Wilaya {
  code: number;
  name: string;
  nameAr: string;
  capital: string;
  x: number;
  y: number;
  created: number;
  /** Wilaya d'origine (wilayas créées en 2019 et 2026) */
  mother?: number;
}

export const WILAYAS: Wilaya[] = [ { "code": 1, "name": "Adrar", "nameAr": "أدرار", "capital": "Adrar", "x": 405.1, "y": 505.5, "created": 1984 },
  { "code": 2, "name": "Chlef", "nameAr": "الشلف", "capital": "Chlef", "x": 483.9, "y": 51.2, "created": 1984 },
  { "code": 3, "name": "Laghouat", "nameAr": "الأغواط", "capital": "Laghouat", "x": 558.5, "y": 180.8, "created": 1984 },
  { "code": 4, "name": "Oum El Bouaghi", "nameAr": "أم البواقي", "capital": "Oum El Bouaghi", "x": 763.8, "y": 67.4, "created": 1984 },
  { "code": 5, "name": "Batna", "nameAr": "باتنة", "capital": "Batna", "x": 718.1, "y": 84.6, "created": 1984 },
  { "code": 6, "name": "Béjaïa", "nameAr": "بجاية", "capital": "Bejaia", "x": 664.1, "y": 19.1, "created": 1984 },
  { "code": 7, "name": "Biskra", "nameAr": "بسكرة", "capital": "Biskra", "x": 696.6, "y": 123.2, "created": 1984 },
  { "code": 8, "name": "Béchar", "nameAr": "بشار", "capital": "Bechar", "x": 312.2, "y": 300.4, "created": 1984 },
  { "code": 9, "name": "Blida", "nameAr": "البليدة", "capital": "Blida", "x": 556.5, "y": 34.5, "created": 1984 },
  { "code": 10, "name": "Bouira", "nameAr": "البويرة", "capital": "Bouira", "x": 607.9, "y": 39.6, "created": 1984 },
  { "code": 11, "name": "Tamanrasset", "nameAr": "تمنراست", "capital": "Tamanrasset", "x": 686.6, "y": 784.2, "created": 1984 },
  { "code": 12, "name": "Tébessa", "nameAr": "تبسة", "capital": "Tébessa", "x": 812.5, "y": 92.8, "created": 1984 },
  { "code": 13, "name": "Tlemcen", "nameAr": "تلمسان", "capital": "Tlemcen", "x": 355.7, "y": 121.5, "created": 1984 },
  { "code": 14, "name": "Tiaret", "nameAr": "تيارت", "capital": "Tiaret", "x": 483.1, "y": 95, "created": 1984 },
  { "code": 15, "name": "Tizi Ouzou", "nameAr": "تيزي وزو", "capital": "Tizi-Ouzou", "x": 615.4, "y": 20.1, "created": 1984 },
  { "code": 16, "name": "Alger", "nameAr": "الجزائر", "capital": "Alger Centre", "x": 567.4, "y": 17.7, "created": 1984 },
  { "code": 17, "name": "Djelfa", "nameAr": "الجلفة", "capital": "Djelfa", "x": 576.7, "y": 133, "created": 1984 },
  { "code": 18, "name": "Jijel", "nameAr": "جيجل", "capital": "Jijel", "x": 698.4, "y": 15.3, "created": 1984 },
  { "code": 19, "name": "Sétif", "nameAr": "سطيف", "capital": "Setif", "x": 681.4, "y": 49.8, "created": 1984 },
  { "code": 20, "name": "Saïda", "nameAr": "سعيدة", "capital": "Saida", "x": 426.7, "y": 124.2, "created": 1984 },
  { "code": 21, "name": "Skikda", "nameAr": "سكيكدة", "capital": "Skikda", "x": 753.3, "y": 12.3, "created": 1984 },
  { "code": 22, "name": "Sidi Bel Abbès", "nameAr": "سيدي بلعباس", "capital": "Sidi Bel-Abbes", "x": 389, "y": 104, "created": 1984 },
  { "code": 23, "name": "Annaba", "nameAr": "عنابة", "capital": "Annaba", "x": 795.2, "y": 11, "created": 1984 },
  { "code": 24, "name": "Guelma", "nameAr": "قالمة", "capital": "Guelma", "x": 778.5, "y": 34.7, "created": 1984 },
  { "code": 25, "name": "Constantine", "nameAr": "قسنطينة", "capital": "Constantine", "x": 739.2, "y": 40.3, "created": 1984 },
  { "code": 26, "name": "Médéa", "nameAr": "المدية", "capital": "Médéa", "x": 552.5, "y": 45.6, "created": 1984 },
  { "code": 27, "name": "Mostaganem", "nameAr": "مستغانم", "capital": "Mostaganem", "x": 423.8, "y": 64.4, "created": 1984 },
  { "code": 28, "name": "M'Sila", "nameAr": "المسيلة", "capital": "M'Sila", "x": 639.4, "y": 76.2, "created": 1984 },
  { "code": 29, "name": "Mascara", "nameAr": "معسكر", "capital": "Mascara", "x": 425.9, "y": 93.1, "created": 1984 },
  { "code": 30, "name": "Ouargla", "nameAr": "ورقلة", "capital": "Ouargla", "x": 676.7, "y": 282.2, "created": 1984 },
  { "code": 31, "name": "Oran", "nameAr": "وهران", "capital": "Oran", "x": 388.8, "y": 76.3, "created": 1984 },
  { "code": 32, "name": "El Bayadh", "nameAr": "البيض", "capital": "El Bayadh", "x": 468.7, "y": 187.2, "created": 1984 },
  { "code": 33, "name": "Illizi", "nameAr": "إليزي", "capital": "Illizi", "x": 829.9, "y": 581.7, "created": 1984 },
  { "code": 34, "name": "Bordj Bou Arreridj", "nameAr": "برج بوعريريج", "capital": "Bordj Bou Arreridj", "x": 650.1, "y": 56.4, "created": 1984 },
  { "code": 35, "name": "Boumerdès", "nameAr": "بومرداس", "capital": "Boumerdes", "x": 587.7, "y": 18.3, "created": 1984 },
  { "code": 36, "name": "El Tarf", "nameAr": "الطارف", "capital": "El Tarf", "x": 821.8, "y": 18.3, "created": 1984 },
  { "code": 37, "name": "Tindouf", "nameAr": "تندوف", "capital": "Tindouf", "x": 26.3, "y": 516.7, "created": 1984 },
  { "code": 38, "name": "Tissemsilt", "nameAr": "تيسمسيلت", "capital": "Tissemsilt", "x": 507.1, "y": 81.8, "created": 1984 },
  { "code": 39, "name": "El Oued", "nameAr": "الوادي", "capital": "El-Oued", "x": 751.4, "y": 204.9, "created": 1984 },
  { "code": 40, "name": "Khenchela", "nameAr": "خنشلة", "capital": "Khenchela", "x": 765, "y": 91.2, "created": 1984 },
  { "code": 41, "name": "Souk Ahras", "nameAr": "سوق أهراس", "capital": "Souk Ahras", "x": 804.1, "y": 44.6, "created": 1984 },
  { "code": 42, "name": "Tipaza", "nameAr": "تيبازة", "capital": "Tipaza", "x": 537.6, "y": 27.8, "created": 1984 },
  { "code": 43, "name": "Mila", "nameAr": "ميلة", "capital": "Mila", "x": 722.5, "y": 35.6, "created": 1984 },
  { "code": 44, "name": "Aïn Defla", "nameAr": "عين الدفلى", "capital": "Ain-Defla", "x": 514.8, "y": 45.7, "created": 1984 },
  { "code": 45, "name": "Naâma", "nameAr": "النعامة", "capital": "Naama", "x": 404.1, "y": 210, "created": 1984 },
  { "code": 46, "name": "Aïn Témouchent", "nameAr": "عين تموشنت", "capital": "Ain Temouchent", "x": 364.6, "y": 98.8, "created": 1984 },
  { "code": 47, "name": "Ghardaïa", "nameAr": "غرداية", "capital": "Ghardaia", "x": 596.8, "y": 253, "created": 1984 },
  { "code": 48, "name": "Relizane", "nameAr": "غليزان", "capital": "Relizane", "x": 446.5, "y": 74.9, "created": 1984 },
  { "code": 49, "name": "Timimoun", "nameAr": "تيميمون", "capital": "Timimoun", "x": 430.5, "y": 430.1, "created": 2019, "mother": 1 },
  { "code": 50, "name": "Bordj Badji Mokhtar", "nameAr": "برج باجي مختار", "capital": "Bordj Badji Mokhtar", "x": 465.6, "y": 864.1, "created": 2019, "mother": 1 },
  { "code": 51, "name": "Ouled Djellal", "nameAr": "أولاد جلال", "capital": "Ouled Djellal", "x": 664.5, "y": 146.5, "created": 2019, "mother": 7 },
  { "code": 52, "name": "Béni Abbès", "nameAr": "بني عباس", "capital": "Beni-Abbes", "x": 314.5, "y": 381.8, "created": 2019, "mother": 8 },
  { "code": 53, "name": "In Salah", "nameAr": "عين صالح", "capital": "Ain Salah", "x": 539.6, "y": 542.8, "created": 2019, "mother": 11 },
  { "code": 54, "name": "In Guezzam", "nameAr": "عين قزام", "capital": "Ain Guezzam", "x": 698.5, "y": 960.5, "created": 2019, "mother": 11 },
  { "code": 55, "name": "Touggourt", "nameAr": "توقرت", "capital": "Touggourt", "x": 712.5, "y": 219.2, "created": 2019, "mother": 30 },
  { "code": 56, "name": "Djanet", "nameAr": "جانت", "capital": "Djanet", "x": 878.3, "y": 687.5, "created": 2019, "mother": 33 },
  { "code": 57, "name": "El M'Ghair", "nameAr": "المغير", "capital": "El-M'ghaier", "x": 706.1, "y": 172.4, "created": 2019, "mother": 39 },
  { "code": 58, "name": "El Meniaa", "nameAr": "المنيعة", "capital": "El Meniaa", "x": 559.1, "y": 357.5, "created": 2019, "mother": 47 },
  { "code": 59, "name": "Aflou", "nameAr": "آفلو", "capital": "Aflou", "x": 521.1, "y": 163.7, "created": 2026, "mother": 3 },
  { "code": 60, "name": "Barika", "nameAr": "بريكة", "capital": "Barika", "x": 679, "y": 93.3, "created": 2026, "mother": 5 },
  { "code": 61, "name": "El Kantara", "nameAr": "القنطرة", "capital": "El Kantara", "x": 695.7, "y": 102.8, "created": 2026, "mother": 7 },
  { "code": 62, "name": "Bir El Ater", "nameAr": "بئر العاتر", "capital": "Bir El Ater", "x": 809.4, "y": 129, "created": 2026, "mother": 12 },
  { "code": 63, "name": "El Aricha", "nameAr": "العريشة", "capital": "El Aricha", "x": 358.6, "y": 157.7, "created": 2026, "mother": 13 },
  { "code": 64, "name": "Ksar Chellala", "nameAr": "قصر الشلالة", "capital": "Ksar Chellala", "x": 531.6, "y": 103.4, "created": 2026, "mother": 14 },
  { "code": 65, "name": "Aïn Ouessara", "nameAr": "عين وسارة", "capital": "Aïn Ouessara", "x": 560, "y": 90.2, "created": 2026, "mother": 17 },
  { "code": 66, "name": "Messaad", "nameAr": "مسعد", "capital": "Messaad", "x": 588.9, "y": 161.4, "created": 2026, "mother": 17 },
  { "code": 67, "name": "Ksar El Boukhari", "nameAr": "قصر البخاري", "capital": "Ksar El Boukhari", "x": 552.4, "y": 66.4, "created": 2026, "mother": 26 },
  { "code": 68, "name": "Bou Saâda", "nameAr": "بوسعادة", "capital": "Bou Saada", "x": 621.4, "y": 103.1, "created": 2026, "mother": 28 },
  { "code": 69, "name": "El Abiodh Sidi Cheikh", "nameAr": "الأبيض سيدي الشيخ", "capital": "El Abiodh Sidi Cheikh", "x": 445.8, "y": 230.2, "created": 2026, "mother": 32 } ];

export const WILAYA_BY_CODE = new Map(WILAYAS.map((w) => [w.code, w]));

/** « 16 — Alger » */
export const wilayaLabel = (code: number) => `${String(code).padStart(2, '0')} — ${WILAYA_BY_CODE.get(code)?.name ?? '?'}`;
