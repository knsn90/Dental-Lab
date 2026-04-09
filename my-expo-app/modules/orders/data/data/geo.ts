// ─── Türkçe Ülke & Şehir Veritabanı ─────────────────────────────────────────
// Uyruk / İkamet Ülkesi / İkamet Şehri seçimi için

export interface GeoCountry {
  code: string;   // ISO 3166-1 alpha-2
  label: string;  // Türkçe ad
  cities: string[];
}

export const GEO_COUNTRIES: GeoCountry[] = [
  // ── En sık kullanılanlar üste ──────────────────────────────────────────────
  {
    code: 'TR', label: 'Türkiye',
    cities: [
      'İstanbul','Ankara','İzmir','Bursa','Antalya','Adana','Konya','Gaziantep',
      'Şanlıurfa','Kocaeli','Mersin','Diyarbakır','Hatay','Manisa','Kayseri',
      'Samsun','Balıkesir','Kahramanmaraş','Van','Aydın','Tekirdağ','Denizli',
      'Muğla','Eskişehir','Sakarya','Trabzon','Mardin','Erzurum','Ordu',
      'Zonguldak','Malatya','Elazığ','Rize','Giresun','Artvin','Kastamonu',
      'Sinop','Karabük','Bartın','Bolu','Düzce','Yalova','Kırklareli','Edirne',
      'Çanakkale','Balıkesir','Kütahya','Afyonkarahisar','Isparta','Burdur',
      'Uşak','Kırşehir','Aksaray','Nevşehir','Niğde','Karaman','Konya',
      'Ankara','Çorum','Tokat','Amasya','Sivas','Erzincan','Ağrı','Iğdır',
      'Kars','Ardahan','Hakkari','Şırnak','Batman','Siirt','Bitlis','Muş',
      'Bingöl','Tunceli','Adıyaman','Kilis','Osmaniye','Bayburt','Gümüşhane',
    ],
  },
  {
    code: 'DE', label: 'Almanya',
    cities: [
      'Berlin','Hamburg','Münih','Köln','Frankfurt','Stuttgart','Düsseldorf',
      'Leipzig','Dortmund','Essen','Bremen','Dresden','Hannover','Nürnberg',
      'Duisburg','Bochum','Wuppertal','Bielefeld','Bonn','Münster','Karlsruhe',
      'Mannheim','Augsburg','Wiesbaden','Gelsenkirchen','Mönchengladbach',
      'Braunschweig','Kiel','Chemnitz','Aachen','Halle','Magdeburg','Freiburg',
      'Krefeld','Lübeck','Oberhausen','Erfurt','Rostock','Mainz','Kassel',
    ],
  },
  {
    code: 'NL', label: 'Hollanda',
    cities: [
      'Amsterdam','Rotterdam','Lahey','Utrecht','Eindhoven','Tilburg','Groningen',
      'Almere','Breda','Nijmegen','Enschede','Apeldoorn','Haarlem','Arnhem',
      'Zaanstad','Amersfoort','Dordrecht','Leiden','Zoetermeer','Maastricht',
    ],
  },
  {
    code: 'BE', label: 'Belçika',
    cities: [
      'Brüksel','Antwerp','Gent','Liège','Brugge','Namur','Leuven','Mons',
      'Aalst','Mechelen','La Louvière','Kortrijk','Hasselt','Sint-Niklaas',
    ],
  },
  {
    code: 'AT', label: 'Avusturya',
    cities: [
      'Viyana','Graz','Linz','Salzburg','Innsbruck','Klagenfurt','Villach',
      'Wels','Sankt Pölten','Dornbirn','Steyr','Wiener Neustadt','Feldkirch',
    ],
  },
  {
    code: 'CH', label: 'İsviçre',
    cities: [
      'Zürih','Cenevre','Basel','Bern','Lozan','Winterthur','Luzern',
      'St. Gallen','Lugano','Biel/Bienne','Thun','Köniz','La Chaux-de-Fonds',
    ],
  },
  {
    code: 'FR', label: 'Fransa',
    cities: [
      'Paris','Marsilya','Lyon','Toulouse','Strasbourg','Bordeaux','Nantes',
      'Lille','Nice','Montpellier','Rennes','Reims','Le Havre','Saint-Étienne',
      'Toulon','Grenoble','Dijon','Angers','Nîmes','Clermont-Ferrand','Metz',
    ],
  },
  {
    code: 'GB', label: 'İngiltere',
    cities: [
      'Londra','Birmingham','Manchester','Leeds','Sheffield','Liverpool',
      'Bristol','Nottingham','Leicester','Coventry','Bradford','Cardiff',
      'Belfast','Edinburgh','Glasgow','Newcastle','Derby','Southampton',
      'Portsmouth','Oxford','Cambridge','Brighton','Hull','Stoke-on-Trent',
    ],
  },
  {
    code: 'US', label: 'Amerika Birleşik Devletleri',
    cities: [
      'New York','Los Angeles','Chicago','Houston','Phoenix','Philadelphia',
      'San Antonio','San Diego','Dallas','San Jose','Austin','Jacksonville',
      'Fort Worth','Columbus','Charlotte','Indianapolis','San Francisco',
      'Seattle','Denver','Nashville','Oklahoma City','El Paso','Washington D.C.',
      'Las Vegas','Boston','Portland','Louisville','Memphis','Atlanta','Miami',
    ],
  },
  {
    code: 'CA', label: 'Kanada',
    cities: [
      'Toronto','Montreal','Vancouver','Calgary','Edmonton','Ottawa',
      'Winnipeg','Quebec','Hamilton','Kitchener','London','Victoria',
      'Halifax','Saskatoon','Regina','Windsor',
    ],
  },
  {
    code: 'AU', label: 'Avustralya',
    cities: [
      'Sydney','Melbourne','Brisbane','Perth','Adelaide','Canberra',
      'Hobart','Darwin','Gold Coast','Newcastle','Wollongong','Geelong',
    ],
  },
  {
    code: 'AZ', label: 'Azerbaycan',
    cities: ['Bakü','Gence','Sumgayıt','Mingəçevir','Nakhchivan','Lənkəran','Şirvan'],
  },
  {
    code: 'RU', label: 'Rusya',
    cities: [
      'Moskova','St. Petersburg','Novosibirsk','Yekaterinburg','Kazan',
      'Nizhny Novgorod','Çelyabinsk','Omsk','Samara','Ufa','Krasnoyarsk',
      'Saratov','Perm','Voronej','Volgograd','Krasnodar','Rostov-on-Don',
    ],
  },
  {
    code: 'UA', label: 'Ukrayna',
    cities: [
      'Kiev','Kharkiv','Odessa','Dnipro','Donetsk','Zaporijjya','Lviv',
      'Kryvyi Rih','Mykolaiv','Mariupol','Poltava','Vinnytsia','Cherkasy',
    ],
  },
  {
    code: 'SA', label: 'Suudi Arabistan',
    cities: [
      'Riyad','Cidde','Mekke','Medine','Dammam','Taif','Tabuk','Buraidah',
      'Hufuf','Khamis Mushait','Jubail','Yanbu',
    ],
  },
  {
    code: 'AE', label: 'Birleşik Arap Emirlikleri',
    cities: ['Dubai','Abu Dabi','Sharjah','Ajman','Ras Al Khaimah','Fujairah','Umm Al Quwain'],
  },
  {
    code: 'QA', label: 'Katar',
    cities: ['Doha','Al Wakrah','Al Khor','Dukhan','Mesaieed','Ras Laffan'],
  },
  {
    code: 'KW', label: 'Kuveyt',
    cities: ['Kuveyt Şehri','Salmiya','Hawalli','Fahaheel','Jahra','Ahmadi'],
  },
  {
    code: 'BH', label: 'Bahreyn',
    cities: ['Manama','Riffa','Muhammed','Hamad Şehri','A\'ali','Isa Şehri'],
  },
  {
    code: 'OM', label: 'Umman',
    cities: ['Maskat','Salalah','Sohar','Sur','Nizwa','Rustaq'],
  },
  {
    code: 'IQ', label: 'Irak',
    cities: ['Bağdat','Basra','Erbil','Musul','Kerkük','Necef','Kerbela','Süleymaniye'],
  },
  {
    code: 'IR', label: 'İran',
    cities: ['Tahran','Meşhed','İsfahan','Karaj','Tebriz','Şiraz','Ahvaz','Kum'],
  },
  {
    code: 'SY', label: 'Suriye',
    cities: ['Şam','Halep','Humus','Lazkiye','Hama','Kamışlı','Tartus','Der\'a'],
  },
  {
    code: 'LB', label: 'Lübnan',
    cities: ['Beyrut','Trablus','Sidon','Tyre','Zahle','Jounieh','Baalbek'],
  },
  {
    code: 'JO', label: 'Ürdün',
    cities: ['Amman','Zarqa','Irbid','Russeifa','Aqaba','Madaba','Jerash'],
  },
  {
    code: 'EG', label: 'Mısır',
    cities: ['Kahire','İskenderiye','Giza','Şubra El-Hayme','Port Said','Süveyş','Luksor','Asvan'],
  },
  {
    code: 'LY', label: 'Libya',
    cities: ['Trablus','Bingazi','Misrata','Zawiya','Sabha','Tobruk','Zintan'],
  },
  {
    code: 'TN', label: 'Tunus',
    cities: ['Tunus','Sfax','Sousse','Kairouan','Bizerte','Gabès','Ariana'],
  },
  {
    code: 'DZ', label: 'Cezayir',
    cities: ['Cezayir','Oran','Konstantin','Annaba','Blida','Batna','Setif'],
  },
  {
    code: 'MA', label: 'Fas',
    cities: ['Casablanca','Fas','Marakeş','Rabat','Agadir','Tanca','Meknes','Oujda'],
  },
  {
    code: 'GR', label: 'Yunanistan',
    cities: ['Atina','Selanik','Patras','Heraklion','Larisa','Volos','Ioannina','Kavala'],
  },
  {
    code: 'BG', label: 'Bulgaristan',
    cities: ['Sofya','Plovdiv','Varna','Burgas','Ruse','Stara Zagora','Pleven','Sliven'],
  },
  {
    code: 'RO', label: 'Romanya',
    cities: ['Bükreş','Cluj-Napoca','Timişoara','Iaşi','Constanţa','Craiova','Galaţi','Braşov'],
  },
  {
    code: 'IT', label: 'İtalya',
    cities: [
      'Roma','Milano','Napoli','Torino','Palermo','Cenova','Floransa','Bologna',
      'Bari','Catania','Venedik','Verona','Trieste','Messina','Padova',
    ],
  },
  {
    code: 'ES', label: 'İspanya',
    cities: [
      'Madrid','Barselona','Valencia','Sevilla','Zaragoza','Malaga','Murcia',
      'Palma','Las Palmas','Bilbao','Alicante','Córdoba','Valladolid',
    ],
  },
  {
    code: 'PT', label: 'Portekiz',
    cities: ['Lizbon','Porto','Vila Nova de Gaia','Amadora','Braga','Setúbal','Coimbra'],
  },
  {
    code: 'PL', label: 'Polonya',
    cities: ['Varşova','Kraków','Łódź','Wrocław','Poznań','Gdańsk','Szczecin','Bydgoszcz'],
  },
  {
    code: 'CZ', label: 'Çekya',
    cities: ['Prag','Brno','Ostrava','Plzeň','Liberec','Olomouc','Ústí nad Labem'],
  },
  {
    code: 'SK', label: 'Slovakya',
    cities: ['Bratislava','Košice','Prešov','Žilina','Banská Bystrica','Nitra'],
  },
  {
    code: 'HU', label: 'Macaristan',
    cities: ['Budapeşte','Debrecen','Miskolc','Szeged','Pécs','Győr','Nyíregyháza'],
  },
  {
    code: 'HR', label: 'Hırvatistan',
    cities: ['Zagreb','Split','Rijeka','Osijek','Zadar','Slavonski Brod','Pula'],
  },
  {
    code: 'RS', label: 'Sırbistan',
    cities: ['Belgrad','Novi Sad','Niš','Kragujevac','Subotica','Zrenjanin'],
  },
  {
    code: 'BA', label: 'Bosna-Hersek',
    cities: ['Saraybosna','Banja Luka','Zenica','Tuzla','Mostar','Bijeljina'],
  },
  {
    code: 'MK', label: 'Kuzey Makedonya',
    cities: ['Üsküp','Bitola','Kumanovo','Prilep','Tetovo','Ohrid'],
  },
  {
    code: 'AL', label: 'Arnavutluk',
    cities: ['Tiran','Dürres','Vlorë','Shkodër','Fier','Korçë','Berat'],
  },
  {
    code: 'ME', label: 'Karadağ',
    cities: ['Podgorica','Nikšić','Herceg Novi','Pljevlja','Bar','Budva'],
  },
  {
    code: 'SI', label: 'Slovenya',
    cities: ['Ljubljana','Maribor','Celje','Kranj','Velenje','Koper'],
  },
  {
    code: 'SE', label: 'İsveç',
    cities: ['Stockholm','Göteborg','Malmö','Uppsala','Södertälje','Västerås','Örebro','Linköping'],
  },
  {
    code: 'NO', label: 'Norveç',
    cities: ['Oslo','Bergen','Stavanger','Trondheim','Drammen','Fredrikstad','Kristiansand'],
  },
  {
    code: 'DK', label: 'Danimarka',
    cities: ['Kopenhag','Aarhus','Odense','Aalborg','Esbjerg','Randers','Kolding'],
  },
  {
    code: 'FI', label: 'Finlandiya',
    cities: ['Helsinki','Espoo','Tampere','Vantaa','Oulu','Turku','Jyväskylä'],
  },
  {
    code: 'JP', label: 'Japonya',
    cities: [
      'Tokyo','Osaka','Kyoto','Nagoya','Sapporo','Fukuoka','Kobe','Kawasaki',
      'Hiroshima','Sendai','Yokohama','Chiba','Kitakyushu','Sakai',
    ],
  },
  {
    code: 'CN', label: 'Çin',
    cities: [
      'Pekin','Şangay','Guangzhou','Shenzhen','Chengdu','Chongqing','Tianjin',
      'Wuhan','Xi\'an','Hangzhou','Shenyang','Harbin','Nanjing','Dalian',
    ],
  },
  {
    code: 'KR', label: 'Güney Kore',
    cities: ['Seul','Busan','Incheon','Daegu','Daejeon','Gwangju','Suwon','Ulsan'],
  },
  {
    code: 'IN', label: 'Hindistan',
    cities: [
      'Mumbai','Delhi','Bangalore','Hyderabad','Chennai','Kolkata','Pune',
      'Ahmedabad','Jaipur','Surat','Lucknow','Kanpur','Nagpur','Indore',
    ],
  },
  {
    code: 'PK', label: 'Pakistan',
    cities: ['Karaçi','Lahor','İslamabad','Faisalabad','Ravalpindi','Gujranwala','Multan'],
  },
  {
    code: 'BD', label: 'Bangladeş',
    cities: ['Dakka','Chittagong','Sylhet','Rajshahi','Khulna','Comilla'],
  },
  {
    code: 'AF', label: 'Afganistan',
    cities: ['Kabil','Kandahar','Herat','Mezar-ı Şerif','Jalalabad','Kunduz'],
  },
  {
    code: 'UZ', label: 'Özbekistan',
    cities: ['Taşkent','Semerkant','Buhara','Namangan','Andijan','Fergana'],
  },
  {
    code: 'KZ', label: 'Kazakistan',
    cities: ['Almatı','Astana','Şimkent','Karagandı','Aktobe','Taraz','Pavlodar'],
  },
  {
    code: 'TM', label: 'Türkmenistan',
    cities: ['Aşkabat','Türkmenabat','Daşoguz','Mary','Balkanabat'],
  },
  {
    code: 'TJ', label: 'Tacikistan',
    cities: ['Duşanbe','Hucend','Kulob','Kurgan-Tyube','Kanibadam'],
  },
  {
    code: 'KG', label: 'Kırgızistan',
    cities: ['Bişkek','Oş','Celalabad','Karakol','Tokmak','Balıkçı'],
  },
  {
    code: 'GE', label: 'Gürcistan',
    cities: ['Tiflis','Batum','Kutaisi','Rustavi','Zugdidi','Gori'],
  },
  {
    code: 'AM', label: 'Ermenistan',
    cities: ['Yerevan','Gyumri','Vanadzor','Vagharshapat','Hrazdan'],
  },
  {
    code: 'BR', label: 'Brezilya',
    cities: ['São Paulo','Rio de Janeiro','Brasília','Salvador','Fortaleza','Belo Horizonte','Manaus','Curitiba'],
  },
  {
    code: 'AR', label: 'Arjantin',
    cities: ['Buenos Aires','Córdoba','Rosario','Mendoza','San Miguel de Tucumán','La Plata'],
  },
  {
    code: 'MX', label: 'Meksika',
    cities: ['Mexico City','Guadalajara','Monterrey','Puebla','Toluca','Tijuana','León','Juárez'],
  },
  {
    code: 'ZA', label: 'Güney Afrika',
    cities: ['Johannesburg','Cape Town','Durban','Pretoria','Port Elizabeth','Bloemfontein'],
  },
  {
    code: 'NG', label: 'Nijerya',
    cities: ['Lagos','Abuja','Kano','Ibadan','Port Harcourt','Benin City','Kaduna'],
  },
  {
    code: 'ET', label: 'Etiyopya',
    cities: ['Addis Ababa','Dire Dawa','Bahir Dar','Gondar','Hawassa'],
  },
  {
    code: 'KE', label: 'Kenya',
    cities: ['Nairobi','Mombasa','Kisumu','Nakuru','Eldoret'],
  },
  {
    code: 'TZ', label: 'Tanzanya',
    cities: ['Dar es Salaam','Dodoma','Mwanza','Arusha','Mbeya'],
  },
  {
    code: 'NZ', label: 'Yeni Zelanda',
    cities: ['Auckland','Wellington','Christchurch','Hamilton','Tauranga','Dunedin'],
  },
  {
    code: 'IL', label: 'İsrail',
    cities: ['Kudüs','Tel Aviv','Hayfa','Beersheba','Rishon LeZion','Ashdod','Netanya'],
  },
  {
    code: 'CY', label: 'Kıbrıs',
    cities: ['Lefkoşa','Limasol','Larnaka','Gazimağusa','Girne','Baf'],
  },
  {
    code: 'MT', label: 'Malta',
    cities: ['Valletta','Birkirkara','Mosta','Qormi','San Gwann'],
  },
  {
    code: 'LU', label: 'Lüksemburg',
    cities: ['Lüksemburg Şehri','Esch-sur-Alzette','Differdange','Dudelange'],
  },
  {
    code: 'IE', label: 'İrlanda',
    cities: ['Dublin','Cork','Limerick','Galway','Waterford','Drogheda'],
  },
  {
    code: 'IS', label: 'İzlanda',
    cities: ['Reykjavik','Kópavogur','Hafnarfjörður','Reykjanesbær'],
  },

  // ── Diğer tüm ülkeler (şehirsiz) ─────────────────────────────────────────
  { code: 'AD', label: 'Andorra',           cities: ['Andorra la Vella'] },
  { code: 'AG', label: 'Antigua ve Barbuda',cities: ["Saint John's"] },
  { code: 'AI', label: 'Anguilla',          cities: ['The Valley'] },
  { code: 'AO', label: 'Angola',            cities: ['Luanda','Huambo','Lobito'] },
  { code: 'AW', label: 'Aruba',             cities: ['Oranjestad'] },
  { code: 'BB', label: 'Barbados',          cities: ['Bridgetown'] },
  { code: 'BF', label: 'Burkina Faso',      cities: ['Ouagadougou','Bobo-Dioulasso'] },
  { code: 'BI', label: 'Burundi',           cities: ['Bujumbura','Gitega'] },
  { code: 'BJ', label: 'Benin',             cities: ['Cotonou','Porto-Novo'] },
  { code: 'BN', label: 'Brunei',            cities: ['Bandar Seri Begawan'] },
  { code: 'BO', label: 'Bolivya',           cities: ['La Paz','Santa Cruz','Cochabamba'] },
  { code: 'BS', label: 'Bahamalar',         cities: ['Nassau'] },
  { code: 'BT', label: 'Bhutan',            cities: ['Thimphu'] },
  { code: 'BW', label: 'Botsvana',          cities: ['Gaborone','Francistown'] },
  { code: 'BZ', label: 'Belize',            cities: ['Belmopan','Belize City'] },
  { code: 'CD', label: 'Demokratik Kongo Cumhuriyeti', cities: ['Kinshasa','Lubumbashi','Mbuji-Mayi'] },
  { code: 'CF', label: 'Orta Afrika Cumhuriyeti', cities: ['Bangui'] },
  { code: 'CG', label: 'Kongo Cumhuriyeti', cities: ['Brazzaville','Pointe-Noire'] },
  { code: 'CI', label: 'Fildişi Sahili',    cities: ['Abidjan','Yamoussoukro'] },
  { code: 'CL', label: 'Şili',              cities: ['Santiago','Valparaíso','Concepción','Antofagasta'] },
  { code: 'CM', label: 'Kamerun',           cities: ['Yaoundé','Douala'] },
  { code: 'CO', label: 'Kolombiya',         cities: ['Bogota','Medellín','Cali','Barranquilla','Cartagena'] },
  { code: 'CR', label: 'Kosta Rika',        cities: ['San José','Alajuela','Cartago'] },
  { code: 'CU', label: 'Küba',              cities: ['Havana','Santiago de Cuba','Camaguey'] },
  { code: 'CV', label: 'Cabo Verde',        cities: ['Praia','Mindelo'] },
  { code: 'DJ', label: 'Cibuti',            cities: ['Djibouti City'] },
  { code: 'DM', label: 'Dominika',          cities: ['Roseau'] },
  { code: 'DO', label: 'Dominik Cumhuriyeti', cities: ['Santo Domingo','Santiago de los Caballeros'] },
  { code: 'EC', label: 'Ekvador',           cities: ['Quito','Guayaquil','Cuenca'] },
  { code: 'EE', label: 'Estonya',           cities: ['Tallinn','Tartu','Narva'] },
  { code: 'ER', label: 'Eritre',            cities: ['Asmara'] },
  { code: 'FJ', label: 'Fiji',              cities: ['Suva','Lautoka'] },
  { code: 'GA', label: 'Gabon',             cities: ['Libreville','Port-Gentil'] },
  { code: 'GD', label: 'Grenada',           cities: ['Saint George\'s'] },
  { code: 'GH', label: 'Gana',              cities: ['Accra','Kumasi','Tamale'] },
  { code: 'GM', label: 'Gambiya',           cities: ['Banjul','Serekunda'] },
  { code: 'GN', label: 'Gine',              cities: ['Conakry'] },
  { code: 'GQ', label: 'Ekvator Ginesi',    cities: ['Malabo','Bata'] },
  { code: 'GW', label: 'Gine-Bissau',       cities: ['Bissau'] },
  { code: 'GY', label: 'Guyana',            cities: ['Georgetown'] },
  { code: 'HN', label: 'Honduras',          cities: ['Tegucigalpa','San Pedro Sula'] },
  { code: 'HT', label: 'Haiti',             cities: ['Port-au-Prince','Cap-Haïtien'] },
  { code: 'ID', label: 'Endonezya',         cities: ['Cakarta','Surabaya','Bandung','Bekasi','Medan'] },
  { code: 'JM', label: 'Jamaika',           cities: ['Kingston','Montego Bay'] },
  { code: 'KH', label: 'Kamboçya',          cities: ['Phnom Penh','Siem Reap'] },
  { code: 'KI', label: 'Kiribati',          cities: ['South Tarawa'] },
  { code: 'KM', label: 'Komorlar',          cities: ['Moroni'] },
  { code: 'KN', label: 'Saint Kitts ve Nevis', cities: ['Basseterre'] },
  { code: 'LA', label: 'Laos',              cities: ['Vientiane','Luang Prabang'] },
  { code: 'LC', label: 'Saint Lucia',       cities: ['Castries'] },
  { code: 'LI', label: 'Lihtenştayn',       cities: ['Vaduz'] },
  { code: 'LK', label: 'Sri Lanka',         cities: ['Colombo','Kandy','Galle','Jaffna'] },
  { code: 'LR', label: 'Liberya',           cities: ['Monrovia'] },
  { code: 'LS', label: 'Lesoto',            cities: ['Maseru'] },
  { code: 'LT', label: 'Litvanya',          cities: ['Vilnius','Kaunas','Klaipėda'] },
  { code: 'LV', label: 'Letonya',           cities: ['Riga','Daugavpils','Liepāja'] },
  { code: 'MD', label: 'Moldova',           cities: ['Kişinev','Tiraspol','Beltsy'] },
  { code: 'MG', label: 'Madagaskar',        cities: ['Antananarivo','Toamasina'] },
  { code: 'ML', label: 'Mali',              cities: ['Bamako','Sikasso','Mopti'] },
  { code: 'MM', label: 'Myanmar',           cities: ['Yangon','Mandalay','Naypyidaw'] },
  { code: 'MN', label: 'Moğolistan',        cities: ['Ulan Bator','Erdenet'] },
  { code: 'MR', label: 'Moritanya',         cities: ['Nouakchott','Nouadhibou'] },
  { code: 'MU', label: 'Mauritius',         cities: ['Port Louis','Beau Bassin-Rose Hill'] },
  { code: 'MV', label: 'Maldivler',         cities: ['Malé'] },
  { code: 'MW', label: 'Malavi',            cities: ['Lilongwe','Blantyre'] },
  { code: 'MY', label: 'Malezya',           cities: ['Kuala Lumpur','George Town','Johor Bahru','Ipoh'] },
  { code: 'MZ', label: 'Mozambik',          cities: ['Maputo','Matola','Beira'] },
  { code: 'NA', label: 'Namibya',           cities: ['Windhoek','Walvis Bay'] },
  { code: 'NE', label: 'Nijer',             cities: ['Niamey','Zinder'] },
  { code: 'NI', label: 'Nikaragua',         cities: ['Managua','León','Masaya'] },
  { code: 'NP', label: 'Nepal',             cities: ['Katmandu','Pokhara','Bharatpur'] },
  { code: 'NR', label: 'Nauru',             cities: ['Yaren'] },
  { code: 'PA', label: 'Panama',            cities: ['Panama City','Colón','David'] },
  { code: 'PE', label: 'Peru',              cities: ['Lima','Arequipa','Callao','Trujillo'] },
  { code: 'PG', label: 'Papua Yeni Gine',   cities: ['Port Moresby','Lae'] },
  { code: 'PH', label: 'Filipinler',        cities: ['Manila','Davao','Cebu','Zamboanga'] },
  { code: 'PW', label: 'Palau',             cities: ['Ngerulmud'] },
  { code: 'PY', label: 'Paraguay',          cities: ['Asunción','Ciudad del Este'] },
  { code: 'RW', label: 'Ruanda',            cities: ['Kigali','Butare'] },
  { code: 'SB', label: 'Solomon Adaları',   cities: ['Honiara'] },
  { code: 'SC', label: 'Seyşeller',         cities: ['Victoria'] },
  { code: 'SD', label: 'Sudan',             cities: ['Hartum','Omdurman','Port Sudan'] },
  { code: 'SG', label: 'Singapur',          cities: ['Singapur'] },
  { code: 'SL', label: 'Sierra Leone',      cities: ['Freetown'] },
  { code: 'SM', label: 'San Marino',        cities: ['San Marino'] },
  { code: 'SN', label: 'Senegal',           cities: ['Dakar','Touba','Thiès'] },
  { code: 'SO', label: 'Somali',            cities: ['Mogadişu','Hargeisa','Kismayo'] },
  { code: 'SR', label: 'Surinam',           cities: ['Paramaribo'] },
  { code: 'SS', label: 'Güney Sudan',       cities: ['Juba','Wau'] },
  { code: 'ST', label: 'São Tomé ve Príncipe', cities: ['São Tomé'] },
  { code: 'SV', label: 'El Salvador',       cities: ['San Salvador','Santa Ana'] },
  { code: 'SZ', label: 'Esvatini',          cities: ['Mbabane','Manzini'] },
  { code: 'TD', label: 'Çad',               cities: ['N\'Djamena','Moundou'] },
  { code: 'TG', label: 'Togo',              cities: ['Lomé','Sokodé'] },
  { code: 'TH', label: 'Tayland',           cities: ['Bangkok','Chiang Mai','Pattaya','Phuket','Ayutthaya'] },
  { code: 'TL', label: 'Doğu Timor',        cities: ['Dili'] },
  { code: 'TO', label: 'Tonga',             cities: ['Nuku\'alofa'] },
  { code: 'TT', label: 'Trinidad ve Tobago',cities: ['Port of Spain','Chaguanas'] },
  { code: 'TV', label: 'Tuvalu',            cities: ['Funafuti'] },
  { code: 'TW', label: 'Tayvan',            cities: ['Taipei','Kaohsiung','Taichung','Tainan'] },
  { code: 'UG', label: 'Uganda',            cities: ['Kampala','Gulu','Mbarara'] },
  { code: 'UY', label: 'Uruguay',           cities: ['Montevideo','Salto','Paysandú'] },
  { code: 'VA', label: 'Vatikan',           cities: ['Vatikan'] },
  { code: 'VC', label: 'Saint Vincent ve Grenadinler', cities: ['Kingstown'] },
  { code: 'VE', label: 'Venezuela',         cities: ['Caracas','Maracaibo','Valencia','Barquisimeto'] },
  { code: 'VN', label: 'Vietnam',           cities: ['Hanoi','Ho Chi Minh Şehri','Da Nang','Hải Phòng'] },
  { code: 'VU', label: 'Vanuatu',           cities: ['Port Vila'] },
  { code: 'WS', label: 'Samoa',             cities: ['Apia'] },
  { code: 'XK', label: 'Kosova',            cities: ['Priştine','Prizren','Peja','Mitrovica'] },
  { code: 'YE', label: 'Yemen',             cities: ['Sana','Aden','Taiz','Hudayda'] },
  { code: 'ZM', label: 'Zambiya',           cities: ['Lusaka','Kitwe','Ndola'] },
  { code: 'ZW', label: 'Zimbabve',          cities: ['Harare','Bulawayo','Mutare'] },
];

// Ülke koduna göre hızlı erişim haritası
export const GEO_BY_CODE: Record<string, GeoCountry> = Object.fromEntries(
  GEO_COUNTRIES.map(c => [c.code, c])
);

// Ülke adına göre hızlı erişim haritası
export const GEO_BY_LABEL: Record<string, GeoCountry> = Object.fromEntries(
  GEO_COUNTRIES.map(c => [c.label, c])
);
