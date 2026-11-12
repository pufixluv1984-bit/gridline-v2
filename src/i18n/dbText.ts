// Тексты, которые приходят из базы по-русски: названия этапов, стран, команд и пилотов, сообщения об ошибках,
// причины изменения цен в фэнтези. База хранит их по-русски (так пишет sync-f1 и миграции), а переводит
// src/i18n/db.ts — прямо в ответе базы и в уже загруженных данных при смене языка.
//
// Каждая строка — [ru, uk, en]. Новый этап, команда, пилот или сообщение об ошибке в базе → строка здесь
// (тест dbText.test.ts сверяет со списками из sync-f1 и миграций).

export type Triple = readonly [ru: string, uk: string, en: string];

/** Этапы: [ru, uk, en, короткое английское имя для списков]. */
export const GRANDS_PRIX: readonly (readonly [string, string, string, string])[] = [
  ['Гран-при Австралии', 'Гран-прі Австралії', 'Australian Grand Prix', 'Australia'],
  ['Гран-при Китая', 'Гран-прі Китаю', 'Chinese Grand Prix', 'China'],
  ['Гран-при Японии', 'Гран-прі Японії', 'Japanese Grand Prix', 'Japan'],
  ['Гран-при Бахрейна', 'Гран-прі Бахрейну', 'Bahrain Grand Prix', 'Bahrain'],
  ['Гран-при Саудовской Аравии', 'Гран-прі Саудівської Аравії', 'Saudi Arabian Grand Prix', 'Saudi Arabia'],
  ['Гран-при Майами', 'Гран-прі Маямі', 'Miami Grand Prix', 'Miami'],
  ['Гран-при Канады', 'Гран-прі Канади', 'Canadian Grand Prix', 'Canada'],
  ['Гран-при Монако', 'Гран-прі Монако', 'Monaco Grand Prix', 'Monaco'],
  ['Гран-при Барселоны', 'Гран-прі Барселони', 'Barcelona Grand Prix', 'Barcelona'],
  ['Гран-при Австрии', 'Гран-прі Австрії', 'Austrian Grand Prix', 'Austria'],
  ['Гран-при Великобритании', 'Гран-прі Великої Британії', 'British Grand Prix', 'Britain'],
  ['Гран-при Бельгии', 'Гран-прі Бельгії', 'Belgian Grand Prix', 'Belgium'],
  ['Гран-при Венгрии', 'Гран-прі Угорщини', 'Hungarian Grand Prix', 'Hungary'],
  ['Гран-при Нидерландов', 'Гран-прі Нідерландів', 'Dutch Grand Prix', 'Netherlands'],
  ['Гран-при Италии', 'Гран-прі Італії', 'Italian Grand Prix', 'Italy'],
  ['Гран-при Испании', 'Гран-прі Іспанії', 'Spanish Grand Prix', 'Spain'],
  ['Гран-при Азербайджана', 'Гран-прі Азербайджану', 'Azerbaijan Grand Prix', 'Azerbaijan'],
  ['Гран-при Бахрейна в Малайзии', 'Гран-прі Бахрейну в Малайзії', 'Bahrain Grand Prix in Malaysia', 'Malaysia'],
  ['Гран-при Сингапура', 'Гран-прі Сінгапуру', 'Singapore Grand Prix', 'Singapore'],
  ['Гран-при США', 'Гран-прі США', 'United States Grand Prix', 'United States'],
  ['Гран-при Мехико', 'Гран-прі Мехіко', 'Mexico City Grand Prix', 'Mexico City'],
  ['Гран-при Сан-Паулу', 'Гран-прі Сан-Паулу', 'São Paulo Grand Prix', 'São Paulo'],
  ['Гран-при Лас-Вегаса', 'Гран-прі Лас-Вегаса', 'Las Vegas Grand Prix', 'Las Vegas'],
  ['Гран-при Катара', 'Гран-прі Катару', 'Qatar Grand Prix', 'Qatar'],
  ['Гран-при Абу-Даби', 'Гран-прі Абу-Дабі', 'Abu Dhabi Grand Prix', 'Abu Dhabi'],
];

/** Страны этапов (events.country). */
export const COUNTRIES: readonly Triple[] = [
  ['Австралия', 'Австралія', 'Australia'],
  ['Китай', 'Китай', 'China'],
  ['Япония', 'Японія', 'Japan'],
  ['Бахрейн', 'Бахрейн', 'Bahrain'],
  ['Саудовская Аравия', 'Саудівська Аравія', 'Saudi Arabia'],
  ['США', 'США', 'USA'],
  ['Канада', 'Канада', 'Canada'],
  ['Монако', 'Монако', 'Monaco'],
  ['Испания', 'Іспанія', 'Spain'],
  ['Австрия', 'Австрія', 'Austria'],
  ['Великобритания', 'Велика Британія', 'Great Britain'],
  ['Бельгия', 'Бельгія', 'Belgium'],
  ['Венгрия', 'Угорщина', 'Hungary'],
  ['Нидерланды', 'Нідерланди', 'Netherlands'],
  ['Италия', 'Італія', 'Italy'],
  ['Азербайджан', 'Азербайджан', 'Azerbaijan'],
  ['Малайзия', 'Малайзія', 'Malaysia'],
  ['Сингапур', 'Сінгапур', 'Singapore'],
  ['Мексика', 'Мексика', 'Mexico'],
  ['Бразилия', 'Бразилія', 'Brazil'],
  ['Катар', 'Катар', 'Qatar'],
  ['ОАЭ', 'ОАЕ', 'UAE'],
];

/** Команды (teams.name). */
export const TEAMS: readonly Triple[] = [
  ['Макларен', 'Макларен', 'McLaren'],
  ['Ред Булл', 'Ред Булл', 'Red Bull'],
  ['Мерседес', 'Мерседес', 'Mercedes'],
  ['Феррари', 'Феррарі', 'Ferrari'],
  ['Уильямс', 'Вільямс', 'Williams'],
  ['Астон Мартин', 'Астон Мартін', 'Aston Martin'],
  ['Хаас', 'Хаас', 'Haas'],
  ['Рейсинг Буллз', 'Рейсінг Буллз', 'Racing Bulls'],
  ['Альпин', 'Альпін', 'Alpine'],
  ['Ауди', 'Ауді', 'Audi'],
  ['Кадиллак', 'Кадилак', 'Cadillac'],
];

/** Пилоты (drivers.name_ru). Пилоты без русского имени и так приходят латиницей. */
export const DRIVERS: readonly Triple[] = [
  ['Ландо Норрис', 'Ландо Норріс', 'Lando Norris'],
  ['Макс Ферстаппен', 'Макс Ферстаппен', 'Max Verstappen'],
  ['Исак Аджар', 'Ісак Хаджар', 'Isack Hadjar'],
  ['Джордж Расселл', 'Джордж Расселл', 'George Russell'],
  ['Кими Антонелли', 'Кімі Антонеллі', 'Kimi Antonelli'],
  ['Оскар Пиастри', 'Оскар Піастрі', 'Oscar Piastri'],
  ['Лиам Лоусон', 'Ліам Лоусон', 'Liam Lawson'],
  ['Шарль Леклер', 'Шарль Леклер', 'Charles Leclerc'],
  ['Льюис Хэмилтон', 'Льюїс Гамільтон', 'Lewis Hamilton'],
  ['Нико Хюлькенберг', 'Ніко Гюлькенберг', 'Nico Hülkenberg'],
  ['Арвид Линдблад', 'Арвід Ліндблад', 'Arvid Lindblad'],
  ['Фернандо Алонсо', 'Фернандо Алонсо', 'Fernando Alonso'],
  ['Франко Колапинто', 'Франко Колапінто', 'Franco Colapinto'],
  ['Пьер Гасли', 'П’єр Гаслі', 'Pierre Gasly'],
  ['Александр Албон', 'Александер Албон', 'Alexander Albon'],
  ['Габриэл Бортолето', 'Габріел Бортолето', 'Gabriel Bortoleto'],
  ['Оливер Берман', 'Олівер Берман', 'Oliver Bearman'],
  ['Серхио Перес', 'Серхіо Перес', 'Sergio Pérez'],
  ['Карлос Сайнс', 'Карлос Сайнс', 'Carlos Sainz'],
  ['Лэнс Стролл', 'Ленс Стролл', 'Lance Stroll'],
  ['Валттери Боттас', 'Валттері Боттас', 'Valtteri Bottas'],
  ['Эстебан Окон', 'Естебан Окон', 'Esteban Ocon'],
  ['Рафаэл Камара', 'Рафаел Камара', 'Rafael Câmara'],
];

/** Причины изменения цены в фэнтези (fantasy_prices.reason) — без чисел. */
export const PRICE_REASONS: readonly Triple[] = [
  ['стартовая цена из чемпионата', 'стартова ціна з чемпіонату', 'starting price from the championship'],
  ['сильная свежая форма', 'сильна свіжа форма', 'strong recent form'],
  ['квалификация выше напарника', 'кваліфікація вища за напарника', 'out-qualifying the teammate'],
  ['сильная квалификация', 'сильна кваліфікація', 'strong qualifying'],
  ['тренд вверх', 'тренд угору', 'trending up'],
  ['сильный сезон', 'сильний сезон', 'strong season'],
  ['слабая свежая форма', 'слабка свіжа форма', 'weak recent form'],
  ['квалификация ниже напарника', 'кваліфікація нижча за напарника', 'out-qualified by the teammate'],
  ['слабая квалификация', 'слабка кваліфікація', 'weak qualifying'],
  ['тренд вниз', 'тренд униз', 'trending down'],
  ['слабый сезон', 'слабкий сезон', 'weak season'],
  ['цена около справедливой', 'ціна близька до справедливої', 'price close to fair'],
  ['очки на миллион в верхней четверти', 'очки на мільйон у верхній чверті', 'points per million in the top quarter'],
  ['очки на миллион выше середины', 'очки на мільйон вище середини', 'points per million above the middle'],
  ['очки на миллион ниже середины', 'очки на мільйон нижче середини', 'points per million below the middle'],
  ['очки на миллион в нижней четверти', 'очки на мільйон у нижній чверті', 'points per million in the bottom quarter'],
];

/** Сообщения об ошибках из функций базы (raise exception). */
export const ERRORS: readonly Triple[] = [
  ['DRS-буст — только пилоту из состава', 'DRS-буст — лише пілоту зі складу', 'DRS boost only for a driver in your squad'],
  ['Final Fix работает после закрытия составов и до старта гонки', 'Final Fix працює після закриття складів і до старту гонки', 'Final Fix works after squads lock and before the race starts'],
  ['Final Fix уже использован', 'Final Fix уже використано', 'Final Fix has already been used'],
  ['Wildcard и Limitless нельзя играть два этапа подряд', 'Wildcard і Limitless не можна грати два етапи поспіль', 'Wildcard and Limitless can’t be played in back-to-back races'],
  ['owner_id, season_id и invite_code меняются только через RPC', 'owner_id, season_id та invite_code змінюються лише через RPC', 'owner_id, season_id and invite_code can only be changed via RPC'],
  ['Бустер нельзя перенести с закрытого блока или на закрытый блок', 'Бустер не можна перенести із закритого блоку або на закритий блок', 'The booster can’t be moved from or to a locked block'],
  ['Бустер уже использован на другом этапе этого окна', 'Бустер уже використано на іншому етапі цього вікна', 'The booster was already used on another race in this window'],
  ['В лиге нет свободных мест', 'У лізі немає вільних місць', 'The league is full'],
  ['Вручную вводятся только квалификация и гонка', 'Вручну вводяться лише кваліфікація і гонка', 'Only qualifying and the race can be entered manually'],
  ['Гонка уже началась — блок закрыт', 'Гонка вже почалася — блок закрито', 'The race has started — this block is locked'],
  ['Замена: убрать пилота из состава и поставить того, кого в нём нет', 'Заміна: прибрати пілота зі складу й поставити того, кого в ньому немає', 'A swap takes a driver out of your squad and brings in one who isn’t in it'],
  ['Заполни все места', 'Заповни всі місця', 'Fill in every position'],
  ['Квалификация уже началась — этот блок закрыт', 'Кваліфікація вже почалася — цей блок закрито', 'Qualifying has started — this block is locked'],
  ['Кого-то из выбранных нет на рынке этого этапа', 'Когось із вибраних немає на ринку цього етапу', 'Some of your picks aren’t on the market for this race'],
  ['Лига уже в текущем сезоне', 'Ліга вже в поточному сезоні', 'The league is already in the current season'],
  ['На этом этапе нет спринта', 'На цьому етапі немає спринту', 'There’s no sprint at this race'],
  ['На этом этапе фэнтези не проводится', 'На цьому етапі фентезі не проводиться', 'Fantasy isn’t played at this race'],
  ['Нельзя менять владельца или этап прогноза', 'Не можна змінювати власника чи етап прогнозу', 'You can’t change a prediction’s owner or race'],
  ['Ник можно менять раз в 30 дней', 'Нік можна змінювати раз на 30 днів', 'Your nickname can be changed once every 30 days'],
  ['Новый владелец должен быть участником лиги', 'Новий власник має бути учасником ліги', 'The new owner must be a league member'],
  ['Нужен список пилотов без повторов', 'Потрібен список пілотів без повторів', 'Each driver can appear only once'],
  ['Нужно 2 разных конструктора', 'Потрібно 2 різні конструктори', 'Pick 2 different constructors'],
  ['Нужно 5 разных пилотов', 'Потрібно 5 різних пілотів', 'Pick 5 different drivers'],
  ['Нужно войти в аккаунт', 'Потрібно увійти в акаунт', 'Please sign in'],
  ['Нужно войти', 'Потрібно увійти', 'Please sign in'],
  ['Один пилот не может стоять на двух местах', 'Один пілот не може стояти на двох місцях', 'One driver can’t take two positions'],
  ['Перенести лигу может только её хозяин', 'Перенести лігу може лише її власник', 'Only the league owner can move the league'],
  ['Приём прогнозов на этот этап закрыт', 'Прийом прогнозів на цей етап закрито', 'Predictions for this race are closed'],
  ['Себя исключить нельзя', 'Себе виключити не можна', 'You can’t remove yourself'],
  ['Слишком много неверных кодов. Попробуй через час.', 'Забагато неправильних кодів. Спробуй за годину.', 'Too many wrong codes. Try again in an hour.'],
  ['Сначала передай лиги, где ты владелец', 'Спершу передай ліги, де ти власник', 'First hand over the leagues you own'],
  ['Сначала передай лигу другому игроку', 'Спершу передай лігу іншому гравцеві', 'First hand the league over to another player'],
  ['Состав дороже бюджета', 'Склад дорожчий за бюджет', 'The squad is over budget'],
  ['Составы на этот этап уже закрыты', 'Склади на цей етап уже закрито', 'Squads for this race are already locked'],
  ['Спринт уже начался — этот блок закрыт', 'Спринт уже почався — цей блок закрито', 'The sprint has started — this block is locked'],
  ['Только владелец лиги', 'Лише власник ліги', 'League owner only'],
  ['Только для админа сайта', 'Лише для адміна сайту', 'Site admin only'],
  ['Только практики', 'Лише практики', 'Practice sessions only'],
  ['Ты не в этой лиге', 'Ти не в цій лізі', 'You’re not in this league'],
  ['Чип Final Fix на этот этап не выбран', 'Чип Final Fix на цей етап не вибрано', 'The Final Fix chip isn’t selected for this race'],
  ['Этот чип нельзя играть на первом этапе', 'Цей чип не можна грати на першому етапі', 'This chip can’t be played in the first race'],
  ['Этот чип уже сыгран в сезоне', 'Цей чип уже зіграно в сезоні', 'This chip has already been played this season'],
];

/**
 * Строки с подстановками. {1}, {2} — части, которые переносятся как есть (числа) или переводятся по таблицам выше.
 */
export const PATTERNS: readonly Triple[] = [
  ['справедливая ${1}M · {2}', 'справедлива ${1}M · {2}', 'fair ${1}M · {2}'],
  ['новичок: {1}% цены напарника', 'новачок: {1}% ціни напарника', 'rookie: {1}% of the teammate’s price'],
  ['Пилота {1} нет в заявке сезона', 'Пілота {1} немає в заявці сезону', 'Driver {1} isn’t on this season’s entry list'],
];
