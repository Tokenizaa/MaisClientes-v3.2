/**
 * Centralized selectors for Google Maps search feeds and place details.
 * Contains primary and secondary fallback selectors with structural redundancy.
 */

export const SELECTORS = {
  feed: {
    container: [
      'div[role="feed"]',
      'div.m6QErb[aria-label]',
      'div.TFQHme',
      'div[role="main"]',
    ],
    placeLinks: [
      'a.hfpxzc[href*="/maps/place/"]',
      'div[role="feed"] a[href*="/maps/place/"]',
      'div.Nv2PK a[href*="/maps/place/"]',
      'a[href*="/maps/place/"]',
    ],
    endOfList: [
      'span.HlvSq',
      'div.m6QErb div.HlvSq',
      'div.HlvSq',
      'div.PbZDve',
    ],
  },
  place: {
    title: [
      'h1.DUwDvf',
      'h1.fontHeadlineLarge',
      'div[role="main"] h1',
      'h1',
    ],
    category: [
      'button[jsaction*="pane.rating.category"]',
      'button.DkEaL',
      'span.Y0A0hc',
      'button[jsaction*="category"]',
    ],
    rating: [
      'div.F7nice span[aria-hidden="true"]',
      'span.ceNzKf',
      'div.fontDisplayLarge',
      'div[role="main"] span[aria-label*="estrelas"]',
      'div[role="main"] span[aria-label*="star"]',
    ],
    reviews: [
      'div.F7nice span:last-child',
      'span[aria-label*="avaliações"]',
      'span[aria-label*="reviews"]',
      'button[jsaction*="pane.reviewChart.moreReviews"]',
      'span.UY7F9',
    ],
    priceRange: [
      'span[aria-label*="Preço:"]',
      'span[aria-label*="Price:"]',
      'span.mgr77e span',
      'span.mgr77e',
    ],
    address: [
      'button[data-item-id="address"] div.fontBodyMedium',
      'button[data-item-id="address"]',
      '[data-item-id="address"]',
      'button[aria-label*="Endereço:"]',
      'button[aria-label*="Address:"]',
    ],
    website: [
      'a[data-item-id="authority"]',
      'a[aria-label*="Website:"]',
      'a[aria-label*="Site:"]',
      '[data-item-id="authority"]',
    ],
    phone: [
      'button[data-item-id^="phone:"] div.fontBodyMedium',
      'button[data-item-id^="phone:"]',
      'button[aria-label*="Telefone:"]',
      'button[aria-label*="Phone:"]',
      '[data-item-id^="phone:"]',
    ],
    businessStatus: [
      'span.ZDu9vd span:first-child',
      'div.OM3Cfd span:first-child',
      'div[aria-label*="Aberto"]',
      'div[aria-label*="Fechado"]',
      'span.o0Svhf',
    ],
    hours: [
      'div[aria-label*="Horário"]',
      'div.t39EBf',
      'span.ZDu9vd',
      'table.eKjhbv',
      'div.OM3Cfd',
    ],
    description: [
      'div.PYvSYb',
      'div.WeS02d',
      'div.bJzME.Hu9e2e div.loref',
      'div.w70O2e',
    ],
    services: [
      'div.E0dtEd',
      'div.dr4qPd',
      'div.LTs0Rc',
      'div[aria-label*="Serviços"]',
      'div.jANrlb',
    ],
    photos: [
      'button[jsaction*="heroHeader"] img',
      'button.aoRNLd img',
      'div.m6QErb img.uetUYb',
      'img[src*="googleusercontent.com/p/"]',
      'img[src*="googleusercontent.com"]',
      'img[data-src*="googleusercontent.com"]',
      'button[aria-label*="Ver todas as fotos"] img',
      'button[aria-label*="See all photos"] img',
      'div[role="main"] img[src^="https://lh3.googleusercontent.com/"]',
      'button[aria-label*="Foto"] img',
      'div.Z5vB5 img',
      'div.RZ66Rb img',
    ],
    videos: [
      'video',
      'video source',
      'div[aria-label*="Vídeo"] video',
      'div[aria-label*="Video"] video',
      'a[href*="youtube.com/watch"]',
      'a[href*="youtu.be"]',
      'button[aria-label*="Vídeo"]',
      'button[aria-label*="Video"]',
      'div[data-video-url]',
    ],
    logo: [
      'div.lMbq3e img',
      'img.uetUYb',
      'button[jsaction*="pane.photo"] img',
      'img[src*="googleusercontent.com"]',
    ],
  },
};
