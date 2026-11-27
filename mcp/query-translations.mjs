// THE USER'S OWN LANGUAGE, FOR TOOL SEARCH (2026-11-24, moved here and widened 2026-11-26). Byte-identical twin:
// mcp/query-translations.mjs and cli/mcp/query-translations.mjs. find_tools (and GET /v1/tools?search=, which ranks
// with the same scorer) only knew English, and agents pass the user's own word through untranslated: find_tools("jeu")
// (French for "game") and ("jeu", group create) filed no_match on the defect board. The scorer folds accents first
// (it drops non a-z letters, so "vidéo" read as "vid" + "o"), then this table maps a common task word onto the English
// word, whose own synonyms then apply exactly as if it had been typed in English.
//
// Latin-script words (French, Spanish, Portuguese, German, Italian, Polish) are matched after foldAccents, so a key is
// written with its accents and found with or without them. Cyrillic (Russian, Ukrainian) and Arabic words would be
// stripped to nothing by the a-z matcher, so the scorer looks them up here before it strips (translateQueryWord).
//
// RULES FOR A ROW: the target is an English word the scorer already knows (a tool-name token or a TOOL_SYNONYMS key in
// mcp/tools.mjs); a key is never an English word somebody would type in English (that would move English results:
// "analyse", "planning", "montage", "poster", "laden", "boutique" and "agenda" are left out on purpose); a key maps to
// ONE target. tools/find-tools-multilingual-check.mjs enforces all three against the real roster.
//
// A word with no tool behind it still files its no_match dead end: that row is how this table grows.

// Accents and the few letters NFD does not decompose (Polish ł, Danish ø, ß, æ, œ, đ). Cyrillic й/ё/ї fold to и/е/і,
// which is harmless because every key below goes through the same fold.
export const foldAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/ø/g, 'o').replace(/Ø/g, 'O').replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/đ/g, 'd');

// The lookup key of one typed word: folded, lowercased, letters and digits only, in any script.
export const queryKey = (s) => foldAccents(String(s || '').toLowerCase()).replace(/[^\p{L}\p{N}]/gu, '');

// English task word → the words for it in the languages our users write in. fr · es · pt · de · it · pl, then ru · uk · ar.
export const QUERY_TRANSLATION_ROWS = Object.freeze([
  ['game', ['jeu', 'jeux', 'juego', 'juegos', 'jogo', 'jogos', 'spiel', 'spiele', 'gioco', 'giochi', 'gra', 'gry', 'игра', 'игру', 'игры', 'гра', 'لعبة', 'العاب']],
  ['ad', ['publicite', 'publicites', 'pub', 'pubs', 'annonce', 'annonces', 'anuncio', 'anuncios', 'publicidad', 'publicidade', 'werbung', 'anzeige', 'anzeigen', 'annuncio', 'annunci', 'pubblicita', 'reklama', 'reklamy', 'ogłoszenie', 'реклама', 'рекламу', 'рекламы', 'объявление', 'оголошення', 'إعلان', 'اعلان', 'إعلانات', 'اعلانات']],
  ['publish', ['publier', 'publication', 'publicar', 'publicacion', 'publicacao', 'postear', 'postar', 'veroffentlichen', 'posten', 'pubblicare', 'pubblicazione', 'opublikuj', 'opublikować', 'publikacja', 'publikuj', 'опубликовать', 'опубликуй', 'публикация', 'публикацию', 'пост', 'опублікувати', 'публікація', 'نشر', 'انشر', 'منشور']],
  ['schedule', ['programmer', 'planifier', 'planifié', 'programmation', 'planification', 'programar', 'programación', 'agendar', 'agendamento', 'programação', 'planen', 'einplanen', 'terminieren', 'programmare', 'pianificare', 'programmazione', 'calendrier', 'calendario', 'zaplanuj', 'zaplanować', 'harmonogram', 'запланировать', 'запланируй', 'расписание', 'запланувати', 'розклад', 'جدولة', 'جدول']],
  ['competitor', ['concurrent', 'concurrents', 'concurrence', 'competidor', 'competidores', 'competencia', 'concorrente', 'concorrentes', 'concorrência', 'concorrenti', 'konkurrent', 'konkurrenten', 'wettbewerber', 'mitbewerber', 'konkurent', 'konkurenci', 'konkurencja', 'конкурент', 'конкуренты', 'конкурентов', 'конкуренти', 'منافس', 'منافسين', 'منافسون']],
  ['image', ['imagen', 'imagenes', 'imagem', 'imagens', 'bild', 'bilder', 'immagine', 'immagini', 'foto', 'fotos', 'visuel', 'visuels', 'affiche', 'plakat', 'obraz', 'obrazek', 'zdjęcie', 'zdjęcia', 'grafika', 'изображение', 'картинка', 'картинку', 'фото', 'фотография', 'зображення', 'фотографія', 'صورة', 'صور']],
  ['video', ['wideo', 'filmik', 'видео', 'видеоролик', 'ролик', 'відео', 'فيديو']],
  ['voice', ['voix', 'voz', 'stimme', 'voce', 'głos', 'голос', 'صوت']],
  ['voiceover', ['voixoff', 'locución', 'locução', 'озвучка', 'озвучення']],
  ['dub', ['doublage', 'doblaje', 'dublagem', 'doppiaggio', 'дубляж']],
  ['subtitle', ['soustitres', 'soustitre', 'subtitulos', 'subtitulo', 'legenda', 'legendas', 'untertitel', 'sottotitoli', 'sottotitolo', 'napisy', 'субтитры', 'субтитри']],
  ['clip', ['extrait', 'extraits', 'recorte', 'recortes', 'corte', 'cortes', 'fragmento', 'clipe', 'clipes', 'ausschnitt', 'ausschnitte', 'ritaglio', 'spezzone', 'frammento', 'klip', 'klipy', 'клип', 'нарезка', 'фрагмент', 'кліп', 'مقطع']],
  ['campaign', ['campagne', 'campagnes', 'campana', 'campanas', 'campanha', 'campanhas', 'kampagne', 'kampagnen', 'campagna', 'kampania', 'kampanie', 'кампания', 'кампанию', 'кампанія', 'حملة', 'حملات']],
  ['report', ['rapport', 'informe', 'relatorio', 'bericht', 'statistiques', 'estadisticas', 'estatisticas', 'statistiken', 'statistiche', 'raport', 'raporty', 'statystyki', 'отчет', 'звіт', 'статистика']],
  ['analytics', ['analytique', 'analíticas', 'analítica', 'análisis', 'análise', 'analisi', 'analityka', 'аналитика', 'аналітика', 'تحليلات', 'إحصائيات', 'احصائيات']],
  ['performance', ['rendimiento', 'desempenho', 'leistung', 'prestazioni', 'wydajność', 'эффективность', 'أداء']],
  ['result', ['resultats', 'resultados', 'risultati', 'ergebnisse', 'wyniki', 'результаты', 'результати', 'نتائج']],
  ['budget', ['presupuesto', 'orcamento', 'budżet', 'бюджет', 'ميزانية']],
  ['audience', ['publico', 'audiencia', 'zielgruppe', 'pubblico', 'odbiorcy', 'аудитория', 'аудиторія', 'جمهور']],
  ['targeting', ['ciblage', 'cible', 'segmentación', 'segmentação', 'targetowanie', 'таргетинг']],
  ['comment', ['commentaire', 'commentaires', 'comentario', 'comentarios', 'kommentar', 'kommentare', 'commento', 'commenti', 'komentarz', 'komentarze', 'комментарий', 'комментарии', 'коментар', 'коментарі', 'تعليق', 'تعليقات']],
  ['reply', ['répondre', 'réponse', 'responder', 'respuesta', 'resposta', 'antworten', 'antwort', 'rispondere', 'risposta', 'odpowiedz', 'odpowiedź', 'ответить', 'ответ', 'відповісти', 'відповідь', 'رد']],
  ['message', ['mensaje', 'mensajes', 'mensagem', 'mensagens', 'nachricht', 'nachrichten', 'messaggio', 'messaggi', 'wiadomość', 'wiadomości', 'сообщение', 'сообщения', 'повідомлення', 'رسالة', 'رسائل']],
  ['thumbnail', ['miniature', 'miniatura', 'miniaturka', 'vorschaubild', 'vignette', 'превью', 'мініатюра', 'миниатюра', 'مصغرة']],
  ['cover', ['portada', 'capa', 'copertina', 'titelbild', 'okładka', 'обложка', 'обкладинка']],
  ['music', ['musique', 'musica', 'musicas', 'musik', 'muzyka', 'chanson', 'canción', 'canção', 'canzone', 'piosenka', 'музыка', 'музыку', 'музика', 'موسيقى']],
  ['logo', ['logotipo', 'логотип', 'лого', 'شعار']],
  ['product', ['produit', 'produits', 'producto', 'productos', 'produto', 'produtos', 'produkt', 'produkte', 'prodotto', 'prodotti', 'produkty', 'товар', 'товары', 'продукт', 'منتج', 'منتجات']],
  ['translate', ['traduire', 'traduction', 'traducir', 'traducción', 'traduzir', 'tradução', 'ubersetzen', 'übersetzung', 'tradurre', 'traduzione', 'przetłumacz', 'tłumaczenie', 'перевести', 'перевод', 'перекласти', 'переклад', 'ترجمة', 'ترجم']],
  ['create', ['creer', 'crear', 'criar', 'erstellen', 'creare', 'stwórz', 'utwórz', 'создать', 'создай', 'створити', 'створи', 'إنشاء', 'انشاء']],
  ['generate', ['générer', 'generar', 'gerar', 'generieren', 'generare', 'wygeneruj', 'сгенерировать', 'сгенерируй', 'згенерувати', 'توليد']],
  ['edit', ['editar', 'bearbeiten', 'modificare', 'edytuj', 'редактировать', 'изменить', 'редагувати', 'تعديل']],
  ['delete', ['supprimer', 'eliminar', 'borrar', 'excluir', 'löschen', 'eliminare', 'cancellare', 'usuń', 'удалить', 'видалити', 'حذف']],
  ['brand', ['marque', 'marca', 'marke', 'marchio', 'бренд', 'علامة']],
  ['store', ['tienda', 'loja', 'negozio', 'sklep', 'магазин', 'متجر']],
  ['email', ['courriel', 'correo', 'письмо', 'почта', 'بريد']],
  ['carousel', ['carrousel', 'carrusel', 'carrossel', 'karussell', 'carosello', 'karuzela', 'карусель']],
  ['influencer', ['influenceur', 'influenceurs', 'influenceuse', 'influenciador', 'influenciadores', 'influencerin', 'блогер', 'блогеры', 'інфлюенсер', 'مؤثر']],
  ['text', ['texte', 'texto', 'testo', 'tekst', 'текст', 'نص']],
  ['resize', ['redimensionner', 'redimensionar', 'ridimensionare', 'размер', 'розмір']],
  ['background', ['arrièreplan', 'fondo', 'hintergrund', 'sfondo', 'tło', 'фон', 'خلفية']],
  ['story', ['histoire', 'historia', 'историю', 'история', 'історія', 'قصة']],
]);

// One row per key; a key two rows claim is a defect the check names (the first row would silently win here).
const _conflicts = [];
const _map = {};
for (const [en, words] of QUERY_TRANSLATION_ROWS) {
  for (const w of words) {
    const k = queryKey(w);
    if (!k) continue;
    if (_map[k] && _map[k] !== en) { _conflicts.push(`${w} → ${_map[k]} and ${en}`); continue; }
    _map[k] = en;
  }
}
export const QUERY_TRANSLATION_CONFLICTS = Object.freeze(_conflicts);
export const QUERY_TRANSLATIONS = Object.freeze(_map);

// A word outside a-z (Cyrillic, Arabic) is looked up BEFORE the a-z matcher strips it. Arabic's attached article
// (ال) is tried off too, so "الفيديو" reads as "فيديو". null when the word is not in the table.
export const translateQueryWord = (raw) => {
  const k = queryKey(raw);
  if (!k) return null;
  if (QUERY_TRANSLATIONS[k]) return QUERY_TRANSLATIONS[k];
  if (k.startsWith('ال') && k.length > 3 && QUERY_TRANSLATIONS[k.slice(2)]) return QUERY_TRANSLATIONS[k.slice(2)];
  return null;
};
// True for a word that still has letters outside a-z once accents are folded (Cyrillic, Arabic): the a-z matcher would delete it whole.
export const isNonLatinWord = (raw) => /[^\x00-\x7f]/.test(foldAccents(String(raw || '')));
