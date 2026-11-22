import type { UrlParts } from './url-parts.js';

/**
 * Frequently impersonated brands. Changing this list changes feature semantics: bump
 * SCHEMA_VERSION and retrain.
 *
 * - `tokens`: distinctive strings matched as **substrings** ("paypalsecure" → paypal).
 * - `words`: common words matched only as **whole tokens** ("purchase" must not hit chase).
 * - `official`: registrable labels (domain without public suffix) owned by the brand.
 * - `suffixes`: public suffixes on which those labels are official. Omitted for global brands
 *   with sites on many country suffixes ("amazon" covers amazon.com, amazon.co.uk, …); set
 *   for the others, so a look-alike such as roblox.com.kz is not treated as official.
 *
 * Words that are common in legitimate page titles (ledger, halifax, caixa, …) are left out
 * on purpose: title_brand_mismatch would fire on unrelated sites.
 */
export interface Brand {
  readonly name: string;
  readonly tokens: readonly string[];
  readonly words: readonly string[];
  readonly official: readonly string[];
  readonly suffixes?: readonly string[];
}

type B = Brand;
const brand = (
  name: string,
  tokens: string[],
  words: string[],
  official: string[],
  suffixes?: string[],
): B =>
  suffixes ? { name, tokens, words, official, suffixes } : { name, tokens, words, official };

export const BRANDS: readonly Brand[] = [
  // Global technology, e-mail and cloud
  brand('paypal', ['paypal'], [], ['paypal', 'paypalobjects']),
  brand('apple', ['icloud', 'itunes'], ['apple'], ['apple', 'icloud', 'itunes']),
  brand(
    'microsoft',
    ['microsoft', 'office365', 'outlook', 'onedrive', 'sharepoint', 'hotmail'],
    [],
    [
      'microsoft',
      'microsoftonline',
      'office',
      'office365',
      'outlook',
      'live',
      'sharepoint',
      'onedrive',
      'hotmail',
      'msn',
      'bing',
      'azure',
      'windows',
      'skype',
      'xbox',
    ],
  ),
  brand('google', ['google', 'gmail'], [], ['google', 'gmail', 'youtube', 'gstatic', 'googleapis']),
  brand('amazon', ['amazon'], [], ['amazon', 'media-amazon', 'ssl-images-amazon']),
  brand('yahoo', ['yahoo'], [], ['yahoo', 'yimg']),
  brand('aol', [], ['aol'], ['aol', 'aolcdn'], ['com']),
  brand('adobe', ['adobe'], [], ['adobe']),
  brand('dropbox', ['dropbox'], [], ['dropbox', 'dropboxusercontent'], ['com']),
  brand('docusign', ['docusign'], [], ['docusign'], ['com', 'net']),
  brand('wetransfer', ['wetransfer'], [], ['wetransfer'], ['com']),
  // Social, messaging, streaming, gaming
  brand('facebook', ['facebook'], [], ['facebook', 'fb', 'fbcdn', 'meta']),
  brand('instagram', ['instagram'], [], ['instagram', 'cdninstagram'], ['com']),
  brand('whatsapp', ['whatsapp'], [], ['whatsapp'], ['com', 'net']),
  brand('linkedin', ['linkedin'], [], ['linkedin', 'licdn']),
  brand('twitter', ['twitter'], [], ['twitter', 'x', 'twimg'], ['com']),
  brand('tiktok', ['tiktok', 'tik-tok'], [], ['tiktok', 'tiktokcdn', 'tiktokv'], ['com']),
  brand('snapchat', ['snapchat'], [], ['snapchat'], ['com']),
  brand('telegram', ['telegram'], [], ['telegram', 't'], ['org', 'me']),
  brand('discord', ['discord'], [], ['discord', 'discordapp'], ['com', 'gg']),
  brand('netflix', ['netflix'], [], ['netflix', 'nflxext', 'nflximg']),
  brand('spotify', ['spotify'], [], ['spotify']),
  brand(
    'steam',
    ['steamcommunity', 'steampowered'],
    ['steam'],
    ['steamcommunity', 'steampowered', 'steamstatic'],
    ['com'],
  ),
  brand('roblox', ['roblox'], [], ['roblox', 'rbxcdn'], ['com']),
  brand('epicgames', ['epicgames'], [], ['epicgames'], ['com']),
  // Shopping
  brand('ebay', ['ebay'], [], ['ebay', 'ebaystatic', 'ebayimg']),
  brand('walmart', ['walmart'], [], ['walmart']),
  brand('allegro', ['allegro'], [], ['allegro', 'allegrolokalnie'], ['pl']),
  brand(
    'mercadolibre',
    ['mercadolibre', 'mercadopago', 'mercadolivre'],
    [],
    ['mercadolibre', 'mercadopago', 'mercadolivre'],
  ),
  brand('airbnb', ['airbnb'], [], ['airbnb']),
  // Banks and payments
  brand('chase', [], ['chase'], ['chase'], ['com']),
  brand('wellsfargo', ['wellsfargo'], [], ['wellsfargo', 'wf'], ['com']),
  brand('bankofamerica', ['bankofamerica'], [], ['bankofamerica', 'bofa'], ['com']),
  brand('americanexpress', ['americanexpress'], [], ['americanexpress']),
  brand('citi', ['citibank'], ['citi'], ['citi', 'citibank', 'citigroup']),
  brand('capitalone', ['capitalone'], [], ['capitalone'], ['com']),
  brand('usaa', ['usaa'], [], ['usaa'], ['com']),
  brand('hsbc', ['hsbc'], [], ['hsbc']),
  brand('barclays', ['barclays'], [], ['barclays']),
  brand('natwest', ['natwest'], [], ['natwest'], ['com']),
  brand(
    'lloyds',
    ['lloydsbank'],
    ['lloyds'],
    ['lloyds', 'lloydsbank', 'lloydsbankinggroup'],
    ['com', 'co.uk'],
  ),
  brand('santander', ['santander'], [], ['santander', 'bancosantander']),
  brand('bbva', ['bbva'], [], ['bbva']),
  brand('revolut', ['revolut'], [], ['revolut']),
  brand('n26', [], ['n26'], ['n26'], ['com', 'de']),
  brand('rabobank', ['rabobank'], [], ['rabobank']),
  brand('commerzbank', ['commerzbank'], [], ['commerzbank'], ['de', 'com']),
  brand('postbank', ['postbank'], [], ['postbank'], ['de']),
  brand('pko', ['pkobp', 'ipko'], ['pko'], ['pkobp', 'ipko', 'pko'], ['pl', 'com.pl']),
  brand('bradesco', ['bradesco'], [], ['bradesco'], ['com.br', 'com']),
  brand('itau', ['itaucard', 'itauunibanco'], ['itau'], ['itau', 'itaucard'], ['com.br']),
  brand('nubank', ['nubank'], [], ['nubank'], ['com.br']),
  brand('interac', [], ['interac'], ['interac'], ['ca']),
  // Crypto
  brand('coinbase', ['coinbase'], [], ['coinbase'], ['com']),
  brand('binance', ['binance'], [], ['binance']),
  brand('metamask', ['metamask'], [], ['metamask'], ['io']),
  brand('trezor', ['trezor'], [], ['trezor'], ['io']),
  brand('ledger', ['ledgerlive', 'ledger-live', 'ledgerwallet'], [], ['ledger'], ['com']),
  brand('trustwallet', ['trustwallet'], [], ['trustwallet'], ['com']),
  brand('opensea', ['opensea'], [], ['opensea'], ['io']),
  brand('uniswap', ['uniswap'], [], ['uniswap'], ['org']),
  brand('bybit', ['bybit'], [], ['bybit']),
  brand('kraken', [], ['kraken'], ['kraken'], ['com']),
  brand('okx', [], ['okx'], ['okx'], ['com']),
  // Telecoms
  brand('xfinity', ['xfinity', 'comcast'], [], ['xfinity', 'comcast'], ['com', 'net']),
  brand('att', [], ['att'], ['att'], ['com', 'net']),
  brand('verizon', ['verizon'], [], ['verizon', 'verizonwireless'], ['com', 'net']),
  brand('tmobile', ['t-mobile', 'tmobile'], [], ['t-mobile', 'tmobile']),
  // Parcels and post
  brand('dhl', [], ['dhl'], ['dhl']),
  brand('fedex', ['fedex'], [], ['fedex']),
  brand('ups', [], ['ups'], ['ups'], ['com']),
  brand('usps', [], ['usps'], ['usps'], ['com']),
  brand('royalmail', ['royalmail'], [], ['royalmail'], ['com', 'co.uk']),
  brand('auspost', ['auspost'], [], ['auspost'], ['com.au']),
  brand(
    'canadapost',
    ['canadapost', 'postescanada'],
    [],
    ['canadapost', 'canadapost-postescanada'],
    ['ca'],
  ),
  brand('correos', ['correos'], [], ['correos'], ['es']),
  brand('laposte', ['laposte'], [], ['laposte'], ['fr', 'net']),
  brand('posteitaliane', ['posteitaliane'], ['poste'], ['poste', 'posteitaliane'], ['it']),
  brand('postnord', ['postnord'], [], ['postnord']),
  brand('evri', [], ['evri'], ['evri'], ['com']),
  brand('dpd', [], ['dpd'], ['dpd']),
  // Government
  brand('irs', ['irsgov'], ['irs'], ['irs'], ['gov']),
  brand('hmrc', ['hmrc'], [], ['hmrc'], ['gov.uk']),
];

/** Words typical of credential-harvesting URLs. Matched as substrings; counted once each. */
export const SENSITIVE_WORDS: readonly string[] = [
  'account',
  'authenticat',
  'banking',
  'billing',
  'confirm',
  'credential',
  'invoice',
  'limited',
  'login',
  'logon',
  'password',
  'recover',
  'restore',
  'secure',
  'signin',
  'sign-in',
  'suspend',
  'unlock',
  'unusual',
  'update',
  'validat',
  'verif',
  'wallet',
  'webscr',
];

const NON_ALNUM = /[^a-z0-9]+/;

/** Brands mentioned in a piece of text (case-insensitive). */
export function findBrands(text: string): Brand[] {
  const lower = text.toLowerCase();
  let words: Set<string> | undefined;
  return BRANDS.filter((brand) => {
    if (brand.tokens.some((t) => lower.includes(t))) return true;
    if (brand.words.length === 0) return false;
    words ??= new Set(lower.split(NON_ALNUM));
    return brand.words.some((w) => words?.has(w));
  });
}

/**
 * True when the page's registrable domain belongs to the brand: an official label on an
 * allowed suffix (any ICANN suffix for global brands). Never on private suffixes.
 */
export function isOfficialFor(brand: Brand, parts: UrlParts): boolean {
  return (
    !parts.isPrivateSuffix &&
    parts.domainWithoutSuffix !== null &&
    brand.official.includes(parts.domainWithoutSuffix) &&
    (brand.suffixes === undefined ||
      (parts.publicSuffix !== null && brand.suffixes.includes(parts.publicSuffix)))
  );
}

/** Brands mentioned in `text` that do NOT own the page's domain. */
export function foreignBrands(text: string, parts: UrlParts): Brand[] {
  return findBrands(text).filter((b) => !isOfficialFor(b, parts));
}

/** Number of distinct sensitive words in a text (case-insensitive substrings). */
export function countSensitiveWords(text: string): number {
  const lower = text.toLowerCase();
  return SENSITIVE_WORDS.filter((w) => lower.includes(w)).length;
}
