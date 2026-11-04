import type { Page } from 'puppeteer-core';
import type { PlaceRecord } from '../../shared/types.js';
import {
  cleanText, normalizeAddress, normalizePhone, normalizeWebsite, normalizeCategory,
  normalizeRating, normalizeReviewCount, normalizePriceRange, normalizeBusinessStatus,
  extractCoordinates, parseAddressComponents, extractSourcePlaceId,
} from './normalizer.js';
import { SELECTORS } from './selectors.js';

/**
 * Extract only values actually rendered on the public Maps place sheet.
 * Prefer semantic data-item-id/aria-label attributes over unstable CSS classes.
 */
export async function extractPlaceDetails(page: Page, jobId: string, targetUrl: string): Promise<PlaceRecord> {
  // Google Maps collapses the weekly schedule by default. Expand it before reading
  // the DOM so we capture all visible days instead of only the current-day row.
  try {
    await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('button'));
      const hoursButton = candidates.find((button) => {
        const label = [button.getAttribute('aria-label') || '', button.innerText || ''].join(' ');
        return button.getAttribute('data-item-id') === 'oh' ||
          /horários de funcionamento|opening hours|horario de apertura|heures d.?ouverture/i.test(label);
      });
      if (hoursButton) hoursButton.click();
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
  } catch {
    // Expansion is best-effort; extraction should continue if the UI changes.
  }

  const raw: any = await page.evaluate(async (selectors: typeof SELECTORS.place) => {
    if (typeof (window as any).__name === 'undefined') (window as any).__name = (f: any) => f;
    if (typeof (globalThis as any).__name === 'undefined') (globalThis as any).__name = (f: any) => f;

    const text = (el: Element | null): string => (el as HTMLElement | null)?.innerText?.trim() || '';
    const attr = (el: Element | null, name: string): string => el?.getAttribute(name)?.trim() || '';
    const first = (sels: string[]): Element | null => {
      for (const selector of sels) {
        try { const el = document.querySelector(selector); if (el) return el; } catch {}
      }
      return null;
    };
    const firstText = (sels: string[]): string => {
      for (const selector of sels) {
        try { const el = document.querySelector(selector); const value = text(el); if (value) return value; } catch {}
      }
      return '';
    };
    const firstAttr = (sels: string[], name: string): string => {
      for (const selector of sels) {
        try { const el = document.querySelector(selector); const value = attr(el, name); if (value) return value; } catch {}
      }
      return '';
    };
    const cleanLabel = (value: string): string => value.replace(/^(endereço|address|adresse|dirección|telefone|phone|téléphone|teléfono|site|website|sito web|sitio web|preço|price|prix)\s*:\s*/i, '').trim();

    // Ignore overlay headings such as "Horários" and "Avaliações".
    // The business title must be a real h1 outside dialogs.
    const genericHeadings = /^(horários?|opening hours|reviews?|avaliações?|sobre|about|fotos|photos|directions|como chegar|menu)$/i;
    const titleCandidates = Array.from(document.querySelectorAll('h1'))
      .filter((node) => !node.closest('[role="dialog"],[aria-modal="true"]'))
      .map((node) => text(node).replace(/\s+/g, ' ').trim())
      .filter((value) => value && value.length <= 180 && !genericHeadings.test(value));
    const name = titleCandidates[0] || '';
    const category = firstText(selectors.category);

    // Maps commonly puts rating and review count together in one accessible label.
    const ratingNode = first([
      'div.F7nice span[aria-hidden="true"]',
      'span[role="img"][aria-label*="estrelas"]',
      'span[role="img"][aria-label*="stars"]',
      'div.F7nice span[aria-label*="star"]',
      'div.F7nice span[aria-label*="estrela"]',
      ...selectors.rating,
    ]);
    const ratingLabel = [attr(ratingNode, 'aria-label'), text(ratingNode)].filter(Boolean).join(' ');
    const ratingMatch = ratingLabel.match(/([0-5][.,]\d)/);
    const rating = ratingMatch?.[1] || firstText(selectors.rating);
    const reviewNode = first([
      'div.F7nice button[aria-label]',
      'button[jsaction*="pane.reviewChart.moreReviews"]',
      ...selectors.reviews,
    ]);
    const reviewLabel = [attr(reviewNode, 'aria-label'), text(reviewNode)].filter(Boolean).join(' ');
    const parseReviewCount = (value: string): string => {
      const normalized = value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      // Prefer explicitly labelled counts, including localized "mil" / "K" forms.
      const labeled = normalized.match(/(\d{1,3}(?:[.\s]\d{3})+|\d+(?:[.,]\d+)?(?:\s*(?:mil|k|thousand))?)\s*(?:avaliações?|reviews?|opiniones?|avis|bewertung(?:en)?|recensioni)/i);
      if (labeled) return labeled[1].trim();
      // Maps often renders "4,7 (587)" or "4,9 (1,2 mil)" in the rating cluster.
      const parenthesized = normalized.match(/[([]\s*([\d][\d\s.,]*(?:\s*(?:mil|k))?)\s*[)\]]/i);
      if (parenthesized && !/^\d[.,]\d$/.test(parenthesized[1].trim())) return parenthesized[1].trim();
      // A bare integer/grouped integer is a count; a decimal like 4.7 is not.
      const bareCount = normalized.match(/^\(?\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)\s*\)?$/);
      return bareCount?.[1] || '';
    };
    // Google changes nested markup frequently. Read the rating cluster and all
    // review-related accessible labels instead of trusting one CSS selector.
    const ratingCluster = first(['div.F7nice', 'div[role="main"] div.F7nice']);
    const reviewSources = [
      reviewLabel,
      ratingLabel,
      text(ratingCluster),
      attr(ratingCluster, 'aria-label'),
      ...Array.from(document.querySelectorAll(
        'button[jsaction*="pane.reviewChart.moreReviews"], [aria-label*="avaliações"], [aria-label*="reviews"], [aria-label*="opiniones"], [aria-label*="recensioni"]'
      )).map((el) => [attr(el, 'aria-label'), text(el)].filter(Boolean).join(' ')),
      ...Array.from(ratingCluster?.querySelectorAll('span,button') || []).map((el) =>
        [attr(el, 'aria-label'), text(el)].filter(Boolean).join(' ')
      ),
    ].filter(Boolean);
    const review_count = reviewSources.map(parseReviewCount).find(Boolean) || '';

    const addressNode = first(['button[data-item-id="address"]', '[data-item-id="address"]', ...selectors.address]);
    const phoneNode = first(['button[data-item-id^="phone:tel:"]', 'button[data-item-id^="phone:"]', ...selectors.phone]);
    const websiteNode = first(['a[data-item-id="authority"][href]', ...selectors.website]);
    const priceNode = first([
      'span[aria-label^="Preço:"]', 'span[aria-label^="Price:"]',
      'span[aria-label^="Prix:"]', 'span[aria-label^="Precio:"]',
      ...selectors.priceRange,
    ]);

    const address = cleanLabel(attr(addressNode, 'aria-label') || text(addressNode));
    const phone = cleanLabel(attr(phoneNode, 'aria-label') || text(phoneNode));
    // Save the URL shown by Maps only; never visit it.
    const website = attr(websiteNode, 'href') || cleanLabel(attr(websiteNode, 'aria-label') || text(websiteNode));
    const price_range = cleanLabel(attr(priceNode, 'aria-label') || text(priceNode));

    // Capture the visible weekly schedule as rows, rather than one generic wrapper
    // whose text may only say "Horários" or "Aberto".
    const hoursTable = first([
      'table[aria-label*="Horário"]', 'table[aria-label*="Hours"]',
      'table[aria-label*="Heures"]', 'table[aria-label*="Horario"]',
      'table.eKjhbv',
    ]) || Array.from(document.querySelectorAll('table')).find((table) =>
      Array.from(table.querySelectorAll('tr')).some((row) =>
        /segunda|terça|quarta|quinta|sexta|sábado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche/i.test(text(row))
      )
    ) || null;
    const dayPattern = /segunda(?:-feira)?|terça(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sábado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag/i;
    const scheduleRows = new Set<string>();
    const addScheduleRow = (value: string) => {
      const normalized = value.replace(/\s+/g, ' ').trim();
      if (/^(segunda(?:-feira)?|terça(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sábado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/i.test(normalized) &&
          /\d{1,2}[:h.]?\d{0,2}|fechado|closed|aberto|open|24 horas/i.test(normalized)) {
        scheduleRows.add(normalized);
      }
    };
    if (hoursTable) {
      Array.from(hoursTable.querySelectorAll('tr,[role="row"]')).forEach((row) => addScheduleRow(text(row)));
    }
    // Read actual schedule rows only. Scanning every aria-label mixes unrelated
    // controls, suggested businesses and navigation text into opening_hours.
    document.querySelectorAll('[role="row"]').forEach((node) => {
      const value = [attr(node, 'aria-label'), text(node)].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      if (value.length < 160) addScheduleRow(value);
    });
    let opening_hours = Array.from(scheduleRows).join(' | ');
    if (!opening_hours) {
      const hoursButton = first([
        'button[data-item-id="oh"]', 'button[aria-label*="Horários de funcionamento"]',
        'button[aria-label*="Opening hours"]', 'button[aria-label*="Heures d’ouverture"]',
        'button[aria-label*="Horario de apertura"]',
      ]);
      const buttonText = text(hoursButton) || attr(hoursButton, 'aria-label');
      opening_hours = dayPattern.test(buttonText) ? buttonText : '';
    }

    const statusCandidates = Array.from(document.querySelectorAll(
      '[aria-label*="Aberto"], [aria-label*="Fechado"], [aria-label*="Open"], [aria-label*="Closed"],' +
      '[aria-label*="Fermé"], [aria-label*="Ouvert"], [aria-label*="Cerrado"], [aria-label*="Abierto"],' +
      '.ZDu9vd, .o0Svhf'
    ));
    const statusText = statusCandidates.map((el) => attr(el, 'aria-label') || text(el))
      .find((value) => /aberto|fechado|open|closed|fermé|fermée|ouvert|abierto|cerrado/i.test(value)) || '';
    const nextOpeningText = statusText.match(/(?:abre|opens|reopens|abertura)[^·|]*/i)?.[0]?.trim() || '';
    const openingDayMatch = nextOpeningText.match(/\b(segunda(?:-feira)?|terça(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sábado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i);
    const openingTimeMatch = nextOpeningText.match(/\b(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?|\d{1,2}h(?:\d{2})?)\b/i);

    // Prefer explicit business description/summary fields and avoid generic
    // container text that merely repeats navigation labels.
    const description = firstText([
      '[data-item-id="description"]',
      '[aria-label*="Descrição"]',
      '[aria-label*="From the business"]',
      '[aria-label*="Da empresa"]',
      ...selectors.description,
    ]);
    const serviceSelectors = [
      '[aria-label*="Serviços"]', '[aria-label*="Services"]',
      '[aria-label*="Menu"]', '[aria-label*="Products and services"]',
      '[data-item-id*="service"]', '[data-item-id*="menu"]',
      '[role="main"] [class*="service"]', '[role="main"] [class*="Service"]',
      ...selectors.services,
    ];
    const serviceEls = Array.from(document.querySelectorAll(serviceSelectors.join(', ')));
    const serviceLines = serviceEls.flatMap((element) => {
      const value = text(element).replace(/\s+/g, ' ').trim();
      const descendants = Array.from(element.querySelectorAll('li,[role="listitem"],button,[role="button"],a'))
        .map((child) => text(child).replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      return [value, ...descendants];
    });
    const services_attributes = Array.from(new Set(serviceLines
      .filter((value) => value && value.length < 1200)
      .filter((value) => !/^(serviços|services|acessibilidade|accessibility|menu|products and services)$/i.test(value))
      .filter((value) => !/^(ver mais|show more|saiba mais|learn more)$/i.test(value))))
      .join(' · ');

    const photoUrls: string[] = [];
    const seenPhotos = new Set<string>();
    const addPhoto = (candidate: string): void => {
      const src = (candidate || '').trim().split(/\s+/)[0];
      if (!src.startsWith('http') || /cleardot\.gif|gstatic\.com\/images\/branding/i.test(src)) return;
      // Reject tiny UI icons/avatars regardless of Google's URL parameter format.
      const dimensions = src.match(/(?:=|[-_])(?:w|s)(\d{1,4})(?:-h(\d{1,4}))?/i);
      const queryWidth = src.match(/[?&](?:width|w)=(\d{1,4})/i);
      const queryHeight = src.match(/[?&](?:height|h)=(\d{1,4})/i);
      const width = Number(dimensions?.[1] || queryWidth?.[1] || 0);
      const height = Number(dimensions?.[2] || queryHeight?.[1] || 0);
      if ((width > 0 && width <= 64) || (height > 0 && height <= 64) ||
          /=s(?:16|24|32|40|48|64)(?:-c)?(?:-[a-z]+)?$/i.test(src)) return;
      if (!seenPhotos.has(src)) { seenPhotos.add(src); photoUrls.push(src); }
    };
    for (const selector of selectors.photos) {
      try {
        document.querySelectorAll(selector).forEach((el) => {
          const image = el as HTMLImageElement;
          addPhoto(image.currentSrc || image.src || attr(el, 'src'));
          addPhoto(attr(el, 'data-src'));
          const srcset = attr(el, 'srcset');
          if (srcset) srcset.split(',').forEach((part) => addPhoto(part.trim().split(/\s+/)[0]));
        });
      } catch {}
    }

    // Collect social profile links only when they are actual links rendered in the Maps sheet.
    const socialHosts = /(^|\.)(instagram\.com|facebook\.com|fb\.com|tiktok\.com|youtube\.com|youtu\.be|linkedin\.com|x\.com|twitter\.com|pinterest\.com|threads\.net|wa\.me|whatsapp\.com)$/i;
    const socialUrls: string[] = [];
    const seenSocial = new Set<string>();
    document.querySelectorAll('a[href]').forEach((anchor) => {
      const href = attr(anchor, 'href');
      try {
        const url = new URL(href, window.location.href);
        const host = url.hostname.toLowerCase().replace(/^www\./, '');
        if (socialHosts.test(host) && !seenSocial.has(url.href)) {
          seenSocial.add(url.href);
          socialUrls.push(url.href);
        }
      } catch {}
    });

    // Capture the actual booking destination exposed by the Maps place sheet.
    // Google varies the visible label ("Agendar", "Agendar on-line", "Book online",
    // "Reservar") and may put it on a nested span or an accessible button label.
    const bookingUrl = (() => {
      const candidates = Array.from(document.querySelectorAll('a[href], button, [role="button"]'))
        .map((node) => {
          const label = [
            (node as HTMLElement).innerText || '',
            node.getAttribute('aria-label') || '',
            node.getAttribute('data-tooltip') || '',
            node.getAttribute('data-item-id') || '',
            node.getAttribute('title') || '',
          ].join(' ').replace(/\s+/g, ' ').trim();
          const href = node.getAttribute('href') || node.getAttribute('data-href') || '';
          return { node, label, href };
        })
        .filter(({ label, href }) => {
          if (!href || /^(?:javascript:|#)$/i.test(href)) return false;
          return /\b(?:agendar(?:\s+on[- ]?line)?|marcar\s+(?:um\s+)?hor[aá]rio|book\s+online|online\s+booking|reserv(?:ar|e|ation)|appointment|agendamento)\b/i.test(label) ||
            /\b(?:avec\.beauty|booksy\.com|fresha\.com|treatwell\.|square\.site|mindbodyonline\.com)\b/i.test(href);
        });
      for (const candidate of candidates) {
        try {
          const url = new URL(candidate.href, window.location.href);
          if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
        } catch {}
      }
      return '';
    })();

    const videoUrls: string[] = [];
    const seenVideos = new Set<string>();
    for (const selector of selectors.videos) {
      try {
        document.querySelectorAll(selector).forEach((el) => {
          const media = el as HTMLVideoElement;
          const src = media.currentSrc || media.src || attr(el, 'src') || attr(el, 'href') || attr(el, 'data-video-url');
          const accessibleLabel = attr(el, 'aria-label') || (el as HTMLElement).innerText || '';
          if (src.startsWith('http') && !src.includes('cleardot.gif') && !seenVideos.has(src)) {
            seenVideos.add(src); videoUrls.push(src);
          } else if (/video|vídeo/i.test(accessibleLabel) && !seenVideos.has(accessibleLabel)) {
            seenVideos.add(accessibleLabel);
            videoUrls.push(accessibleLabel);
          }
        });
      } catch {}
    }

    // Expand the public Reviews panel and collect the review cards that Maps
    // actually exposes. Scroll the review container to load subsequent batches;
    // stop when the DOM stops growing or the bounded traversal completes.
    const clickByText = (pattern: RegExp): boolean => {
      const element = Array.from(document.querySelectorAll('button,[role="button"],[role="tab"]'))
        .find((candidate) => pattern.test([
          (candidate as HTMLElement).innerText || '',
          candidate.getAttribute('aria-label') || '',
        ].join(' ').replace(/\s+/g, ' ').trim()));
      if (!element) return false;
      (element as HTMLElement).click();
      return true;
    };
    const reviewTab = Array.from(document.querySelectorAll('button,[role="tab"],[role="button"]')).find((candidate) =>
      /reviews?|avaliações?|comentários?/i.test([
        (candidate as HTMLElement).innerText || '',
        candidate.getAttribute('aria-label') || '',
        candidate.getAttribute('data-tab') || '',
      ].join(' ')) &&
      !/sort|ordenar|translate|traduzir|reply|responder/i.test([
        (candidate as HTMLElement).innerText || '', candidate.getAttribute('aria-label') || '',
      ].join(' '))
    );
    if (reviewTab) (reviewTab as HTMLElement).click();
    else clickByText(/^Reviews$|Reviews for|Avaliações|Comentários/i);
    await new Promise((resolve) => setTimeout(resolve, 350));
    clickByText(/^More reviews|Mais avaliações|Mais comentários|Ver todas as avaliações|See all reviews/i);
    await new Promise((resolve) => setTimeout(resolve, 250));

    const reviews: any[] = [];
    const seenReviewIds = new Set<string>();
    let reviewContainer: HTMLElement | null = null;
    const findReviewContainer = (): HTMLElement | null => {
      const firstReview = document.querySelector('[data-review-id].jftiEf, .jftiEf[data-review-id]');
      let parent = firstReview?.parentElement as HTMLElement | null;
      while (parent && parent !== document.body) {
        if (parent.scrollHeight > parent.clientHeight + 80 && parent.clientHeight > 100) return parent;
        parent = parent.parentElement;
      }
      const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
      return dialog;
    };
    const readReviews = () => {
      document.querySelectorAll('.jftiEf[data-review-id], [data-review-id].jftiEf').forEach((card) => {
        const id = card.getAttribute('data-review-id') || '';
        if (!id || seenReviewIds.has(id)) return;
        seenReviewIds.add(id);
        const getText = (selectors: string[]) => {
          for (const selector of selectors) {
            const node = card.querySelector(selector);
            const value = (node as HTMLElement | null)?.innerText?.trim() || '';
            if (value) return value;
          }
          return '';
        };
        const getAttr = (selectors: string[], attribute: string) => {
          for (const selector of selectors) {
            const node = card.querySelector(selector);
            const value = node?.getAttribute(attribute)?.trim() || '';
            if (value) return value;
          }
          return '';
        };
        const media = [
          ...Array.from(card.querySelectorAll('img'))
            .map((img) => ({ type: 'image', url: (img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src, alt: img.getAttribute('alt') || '' }))
            .filter((item) => item.url.startsWith('http') && !/NBa7we|w36-h36|avatar/i.test(item.url)),
          ...Array.from(card.querySelectorAll('video, a[href$=".mp4"], a[href$=".webm"], [data-video-url]'))
            .map((node) => ({
              type: 'video',
              url: (node as HTMLVideoElement).currentSrc || (node as HTMLVideoElement).src || attr(node, 'href') || attr(node, 'data-video-url'),
              alt: attr(node, 'aria-label') || 'Vídeo anexado à avaliação',
            }))
            .filter((item) => item.url.startsWith('http')),
        ];
        const ratingNode = card.querySelector('[role="img"][aria-label*="star"],[role="img"][aria-label*="estrela"],span[aria-label*="star"],span[aria-label*="estrela"]');
        reviews.push({
          id,
          author: getText(['.d4r55','.WNxzHc .fontTitleMedium','button[aria-label^="Photo of"]']),
          author_profile_url: getAttr(['button[data-href]'], 'data-href'),
          author_avatar_url: getAttr(['button[aria-label^="Photo of"] img','img.NBa7we'], 'src'),
          author_metadata: getText(['.GHT2ce','.RfnDt']),
          rating: ratingNode?.getAttribute('aria-label') || '',
          date: getText(['.rsqaWe','.DU9Pgb','span[class*="rsqaWe"]']),
          text: getText(['.wiI7pd','.MyEned','.review-full-text']),
          owner_response: getText(['.CDe7pd','.bwb7ce','.ODSEW-ShBeI']),
          media,
          helpful_count: getText(['.GBkF3d','button[aria-label*="like"]']),
        });
      });
    };
    reviewContainer = findReviewContainer();
    const expandVisibleReviews = () => {
      document.querySelectorAll('.jftiEf button').forEach((button) => {
        if (/see more|mais|ver mais|plus/i.test(button.textContent || button.getAttribute('aria-label') || '')) {
          (button as HTMLElement).click();
        }
      });
    };
    let lastCount = -1;
    let stagnant = 0;
    for (let iteration = 0; iteration < 80; iteration++) {
      expandVisibleReviews();
      await new Promise((resolve) => setTimeout(resolve, 35));
      readReviews();
      if (reviews.length === lastCount) stagnant += 1;
      else stagnant = 0;
      if (stagnant >= 8) break;
      lastCount = reviews.length;
      if (!reviewContainer) reviewContainer = findReviewContainer();
      if (reviewContainer) reviewContainer.scrollTop = reviewContainer.scrollHeight;
      else window.scrollTo(0, document.body.scrollHeight);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    expandVisibleReviews();
    await new Promise((resolve) => setTimeout(resolve, 35));
    readReviews();

    // Expand the list of review topic/category chips before capturing labels/counts.
    clickByText(/^(?:View \d+ more Topics|Ver \d+ tópicos? a mais|Ver mais tópicos|Mais tópicos|Ver mais temas)$/i);
    await new Promise((resolve) => setTimeout(resolve, 100));
    // Only accept explicit review topics or labeled chips with a numeric review count.
    // Generic Maps controls (tabs, map layers, markers) are not review categories.
    const review_topics = Array.from(document.querySelectorAll(
      '[data-review-topic], [role="radio"], [role="checkbox"], button[aria-pressed="true"], button[aria-selected="true"]'
    ))
      .filter((node) => !node.closest('.jftiEf') && node.getAttribute('role') !== 'tab')
      .map((node) => {
        const label = ((node as HTMLElement).innerText || node.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
        const count = (label.match(/(?:\(|\s)(\d{1,6})\s*\)?$/) || [])[1] || '';
        return { label, count, node };
      })
      .filter((item) => item.label && item.label.length < 100)
      .filter((item) => !/^(all reviews|todas as avaliações|avaliações|reviews|all|todas|overview|visão geral|about|sobre|standard|padrão|satellite|satélite|globe view|visualização do globo|markers|marcadores|map layers|camadas do mapa|most relevant|mais relevantes|newest|mais recentes|sort by|ordenar por|more reviews|mais avaliações|translate|traduzir|like|gostei|reply|responder)$/i.test(item.label))
      .filter((item) => !!item.count || !!item.node.hasAttribute('data-review-topic'))
      .map(({label,count}) => ({label,count}));

    // The About tab contains additional attributes not present in the overview.
    const aboutTabClicked = clickByText(/^(?:About(?:\s|$)|Sobre(?:\s|$)|Informações(?:\s|$))/i);
    await new Promise((resolve) => setTimeout(resolve, 180));
    const aboutText = ((document.querySelector('div[role="main"]') as HTMLElement | null)?.innerText || '')
      .split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 300).join('\n');
    const additional_attributes = {
      about_text: aboutTabClicked ? aboutText.slice(0, 18000) : '',
      sections: aboutTabClicked ? Array.from(document.querySelectorAll('div[role="main"] h2, div[role="main"] h3'))
        .map((heading) => {
          const category = ((heading as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim();
          const root = heading.parentElement?.parentElement || heading.parentElement;
          const items = ((root as HTMLElement | null)?.innerText || '')
            .split('\n').map((line) => line.replace(/\s+/g, ' ').trim())
            .filter((line) => line && line !== category && line.length < 180);
          return { category, items: Array.from(new Set(items)) };
        })
        .filter((section) => section.category && section.items.length)
        .slice(0, 60) : [],
      labeled_attributes: aboutTabClicked ? Array.from(document.querySelectorAll('div[role="main"] button, div[role="main"] [role="button"]'))
        .map((node) => ({
          label: node.getAttribute('aria-label') || '',
          value: ((node as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim(),
        }))
        .filter((item) => item.label || item.value)
        .filter((item) => item.value.length < 500)
        .filter((item) => !/^(overview|visão geral|about|sobre|see more|ver mais|standard|padrão|satellite|satélite|globe view|visualização do globo|markers|marcadores)$/i.test(item.value))
        .slice(0, 200) : [],
    };

    // Promote verified public service/accessibility details into the searchable
    // services_attributes field, while retaining the structured About payload too.
    const attributeSections = Array.isArray(additional_attributes.sections) ? additional_attributes.sections : [];
    const allAttributeItems = attributeSections.flatMap((section: { category?: string; items?: string[] }) =>
      (Array.isArray(section.items) ? section.items : []).map((item: string) => String(item || '').trim()).filter(Boolean)
    );
    const attributes = Array.from(new Set(allAttributeItems.filter((item: string) =>
      !/wheelchair|cadeira de rodas|acessibilidade|accessible entrance|accessible parking|acessível/i.test(item)
    )));
    const accessibility_attributes = Array.from(new Set(allAttributeItems.filter((item: string) =>
      /wheelchair|cadeira de rodas|acessibilidade|accessible entrance|accessible parking|acessível|accessible restroom|banheiro acessível/i.test(item)
    )));
    const structuredAttributeLines = (additional_attributes.sections || [])
      .flatMap((section: { category?: string; items?: string[] }) => {
        const category = String(section.category || '').trim();
        const items = Array.isArray(section.items) ? section.items.map((item) => String(item || '').trim()).filter(Boolean) : [];
        const usefulItems = items.filter((item) => !/^(?:||ver mais|show more|saiba mais|learn more)$/i.test(item));
        return category && usefulItems.length ? [category + ': ' + usefulItems.join(', ')] : [];
      });
    const servicesAndAttributes = Array.from(new Set([
      services_attributes,
      ...structuredAttributeLines,
    ].map((value) => value.trim()).filter(Boolean))).join(' · ');

    // Close any review dialog and inspect the public gallery. Collect thumbnails
    // as actual image data; keep video cards typed even when Maps hides the
    // underlying stream URL and only exposes a playable item in its own viewer.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 120));
    clickByText(/^See photos$|^Ver fotos$|^Ver todas as fotos$|^Fotos$/i);
    await new Promise((resolve) => setTimeout(resolve, 220));
    const findGalleryContainer = (): HTMLElement | null => {
      const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
      if (dialog) {
        const scrollables = [dialog, ...Array.from(dialog.querySelectorAll<HTMLElement>('*'))]
          .filter((element) => element.scrollHeight > element.clientHeight + 80 && element.clientHeight > 100)
          .sort((a, b) => a.clientHeight - b.clientHeight);
        return scrollables[0] || dialog;
      }
      const galleryImage = Array.from(document.querySelectorAll<HTMLImageElement>('div[role="main"] img[src*="googleusercontent.com"]'))
        .find((image) => image.naturalWidth > 64 && image.naturalHeight > 64);
      let parent = galleryImage?.parentElement as HTMLElement | null;
      while (parent && parent !== document.body) {
        if (parent.scrollHeight > parent.clientHeight + 80 && parent.clientHeight > 100) return parent;
        parent = parent.parentElement;
      }
      return null;
    };
    let galleryContainer = findGalleryContainer();
    let previousGalleryCount = -1;
    let galleryStagnant = 0;
    for (let iteration = 0; iteration < 80; iteration++) {
      const before = photoUrls.length;
      document.querySelectorAll('[role="dialog"] img, div[role="main"] img[src*="googleusercontent.com"]').forEach((node) => {
        const image = node as HTMLImageElement;
        addPhoto(image.currentSrc || image.src || attr(node, 'src'));
        addPhoto(attr(node, 'data-src'));
        const srcset = attr(node, 'srcset');
        if (srcset) srcset.split(',').forEach((part) => addPhoto(part.trim().split(/\s+/)[0]));
      });
      document.querySelectorAll('[role="dialog"] video, [role="dialog"] [data-video-url], [role="dialog"] button[aria-label*="video"], [role="dialog"] button[aria-label*="vídeo"]').forEach((node) => {
        const media = node as HTMLVideoElement;
        const source = media.currentSrc || media.src || attr(node, 'src') || attr(node, 'data-video-url');
        const label = attr(node, 'aria-label') || (node as HTMLElement).innerText || 'Vídeo na galeria do Google Maps';
        if (source.startsWith('http') && !seenVideos.has(source)) { seenVideos.add(source); videoUrls.push(source); }
        else if (!source && !seenVideos.has(label)) { seenVideos.add(label); videoUrls.push(label); }
      });
      if (photoUrls.length === previousGalleryCount && photoUrls.length === before) galleryStagnant += 1;
      else galleryStagnant = 0;
      if (galleryStagnant >= 6) break;
      previousGalleryCount = photoUrls.length;
      galleryContainer = findGalleryContainer() || galleryContainer;
      if (galleryContainer) galleryContainer.scrollTop = galleryContainer.scrollHeight;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }

    // Build typed media entries so the UI can render photos as images and video
    // items with a playable preview where the public page exposes a source.
    const makeThumbnailUrl = (url: string): string => {
      if (/=w\d+-h\d+[^&]*/i.test(url)) return url.replace(/=w\d+-h\d+[^&]*/i, '=w400-h300-k-no');
      if (/=s\d+([^&]*)$/i.test(url)) return url.replace(/=s\d+([^&]*)$/i, '=w400-h300-k-no$1');
      if (/=w\d+([^&]*)$/i.test(url)) return url.replace(/=w\d+([^&]*)$/i, '=w400-h300-k-no$1');
      return '';
    };
    const visiblePhotoCountText = Array.from(document.querySelectorAll('button,[aria-label],span,div'))
      .map((node) => [text(node), attr(node, 'aria-label')].filter(Boolean).join(' '))
      .filter((value) => /\b\d{1,4}\s*(?:photos|fotos)\b/i.test(value) && value.length < 160)
      .map((value) => value.match(/\b(\d{1,4})\s*(?:photos|fotos)\b/i)?.[1] || '')
      .find(Boolean) || '';
    const media_items = [
      ...photoUrls.map((url) => ({
        type: 'image',
        url,
        thumbnail_url: makeThumbnailUrl(url),
        title: '',
      })),
    ];
    const plusCodeNode = Array.from(document.querySelectorAll('[aria-label*="Plus code"],[aria-label*="Plus Code"],[aria-label*="Código Plus"],[data-item-id*="oloc"]'))
      .find((node) => /plus code|código plus/i.test([attr(node, 'aria-label'), text(node)].join(' ')));
    const plusCodeLabel = plusCodeNode ? (attr(plusCodeNode, 'aria-label') || text(plusCodeNode)) : '';
    const plus_code = plusCodeLabel.replace(/^(plus code|código plus)\s*:\s*/i, '').trim();

    // Extract only visible popular-times labels/bars; do not infer data from graph shape.
    const popularTimesNodes = Array.from(document.querySelectorAll(
      '[aria-label*="Popular times"],[aria-label*="Horários de pico"],[aria-label*="Horários populares"],[data-day-of-week],[class*="popular-times"],[class*="PopularTimes"]'
    ));
    const popular_times = popularTimesNodes.map((node) => ({
      label: attr(node, 'aria-label'),
      text: text(node).replace(/\s+/g, ' ').trim(),
      day: attr(node, 'data-day-of-week'),
      value: attr(node, 'aria-valuenow') || attr(node, 'data-value') || '',
    })).filter((item) => item.label || item.text || item.day || item.value)
      .filter((item) => (item.label + ' ' + item.text).length < 600)
      .slice(0, 300);

    // Rating histogram counts are accepted only when the accessible label explicitly names stars and reviews.
    const rating_distribution: Record<string, number> = {};
    document.querySelectorAll('[aria-label]').forEach((node) => {
      const label = attr(node, 'aria-label').replace(/\s+/g, ' ').trim();
      const match = label.match(/([1-5])\s*(?:star|stars|estrela|estrelas)\D{0,24}(\d[\d.,\s]*)/i) ||
        label.match(/(\d[\d.,\s]*)\s*(?:reviews?|avaliações?)\D{0,24}([1-5])\s*(?:star|stars|estrela|estrelas)/i);
      if (!match) return;
      const starsFirst = /star|estrela/i.test(label.slice(0, label.indexOf(match[0]) + match[0].length).split(match[2] || match[1])[0]);
      const stars = starsFirst ? match[1] : match[2];
      const countText = starsFirst ? match[2] : match[1];
      const count = Number(countText.replace(/[.,\s]/g, ''));
      if (stars && Number.isFinite(count)) rating_distribution[String(stars)] = count;
    });

    // Review highlights are distinct from individual review cards.
    const review_highlights = Array.from(document.querySelectorAll(
      '[data-review-summary], [class*="reviewSummary"], [class*="ReviewSummary"], [aria-label*="Review summary"], [aria-label*="Resumo das avaliações"]'
    )).map((node) => (text(node) || attr(node, 'aria-label')).replace(/\s+/g, ' ').trim())
      .filter((value) => value.length > 12 && value.length < 500)
      .filter((value, index, all) => all.indexOf(value) === index)
      .slice(0, 30);

    // Use the explicitly labelled business profile image as the logo/cover image
    // when Maps exposes it; never substitute a reviewer avatar.
    let logo_url = '';
    const businessProfileImage = Array.from(document.querySelectorAll('button[aria-label^="Photo of"] img'))
      .find((img) => {
        const label = img.parentElement?.getAttribute('aria-label') || img.closest('button')?.getAttribute('aria-label') || '';
        return !!name && label.toLowerCase().includes(name.toLowerCase());
      }) as HTMLImageElement | undefined;
    if (businessProfileImage) {
      const source = businessProfileImage.currentSrc || businessProfileImage.src || '';
      if (source.startsWith('http') && !/w\d{1,2}-h\d{1,2}|br100|avatar/i.test(source)) logo_url = source;
    }
    for (const selector of selectors.logo) {
      try {
        const el = document.querySelector(selector) as HTMLImageElement | null;
        const src = el?.currentSrc || el?.src || '';
        if (src.startsWith('http') && !src.includes('cleardot.gif') &&
            /logo|avatar|profile|perfil/i.test((el?.alt || '') + ' ' + (el?.getAttribute('aria-label') || ''))) {
          logo_url = src; break;
        }
      } catch {}
    }

    // Do not infer a logo/profile image from an arbitrary gallery photo.
    // Leave logo_url empty unless Maps explicitly labels a business profile image.

    videoUrls.forEach((url) => media_items.push({ type: 'video', url, thumbnail_url: '', title: '' }));
    return {
      name, category, rating, review_count, price_range, address, website, phone,
      opening_hours, business_status: statusText, description, services_attributes: servicesAndAttributes,
      photos: photoUrls.join(' | '), videos: videoUrls.join(' | '), logo_url, social_links: socialUrls.join(' | '),
      bookingUrl, reviews, review_topics, additional_attributes, media_items, plus_code,
      popular_times, rating_distribution, review_highlights, attributes, accessibility_attributes,
      nextOpeningText, nextOpeningDay: openingDayMatch?.[1] || '', nextOpeningTime: openingTimeMatch?.[1] || '',
      visiblePhotosCount: visiblePhotoCountText,
      currentUrl: window.location.href,
    };
  }, SELECTORS.place);

  const finalUrl = raw.currentUrl || targetUrl;
  const extractedName = cleanText(raw.name);
  if (!extractedName || /^(horários?|opening hours|reviews?|avaliações?|sobre|about|fotos|photos|directions|como chegar|menu)$/i.test(extractedName)) {
    throw new Error('place_name_not_found: painel sem título válido do estabelecimento; registro não será persistido');
  }
  const coords = extractCoordinates(finalUrl);
  const address = normalizeAddress(raw.address);
  const addressComponents = parseAddressComponents(address);
  const sourcePlaceId = extractSourcePlaceId(finalUrl);
  const sourceUrl = targetUrl || finalUrl;
  const collectedAt = new Date().toISOString();
  const fieldValues: Record<string, unknown> = {
    name: raw.name, category: raw.category, address, neighborhood: addressComponents.neighborhood, phone: raw.phone, website: raw.website,
    rating: raw.rating, review_count: raw.review_count, price_range: raw.price_range,
    opening_hours: raw.opening_hours, business_status: raw.business_status,
    latitude: coords.latitude, longitude: coords.longitude, maps_url: finalUrl,
    description: raw.description, services_attributes: raw.services_attributes,
    booking_url: raw.bookingUrl, photos: raw.photos, videos: raw.videos, logo_url: raw.logo_url,
    social_links: raw.social_links, reviews: raw.reviews, review_topics: raw.review_topics,
    additional_attributes: raw.additional_attributes, media_items: raw.media_items, plus_code: raw.plus_code,
    attributes: raw.attributes, accessibility_attributes: raw.accessibility_attributes,
    next_opening_text: raw.nextOpeningText, next_open_day: raw.nextOpeningDay, next_open_time: raw.nextOpeningTime,
    visible_photos_count: raw.visiblePhotosCount, popular_times: raw.popular_times,
    rating_distribution: raw.rating_distribution, review_highlights: raw.review_highlights,
    postal_code: addressComponents.postal_code, country: addressComponents.country, city: addressComponents.city, state: addressComponents.state,
    source_place_id: sourcePlaceId, source_url: sourceUrl, collected_at: collectedAt,
  };
  const fieldStatus = Object.fromEntries(Object.entries(fieldValues).map(([field, value]) => {
    const present = Array.isArray(value) ? value.length > 0 : value && typeof value === 'object'
      ? Object.keys(value as object).length > 0 : String(value ?? '').trim().length > 0;
    return [field, { status: present ? 'captured' : 'not_observed_in_session', observed_at: new Date().toISOString() }];
  }));
  return {
    id: `place_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    job_id: jobId,
    name: cleanText(raw.name),
    category: normalizeCategory(raw.category),
    address,
    neighborhood: cleanText(addressComponents.neighborhood),
    phone: normalizePhone(raw.phone),
    website: normalizeWebsite(raw.website),
    rating: normalizeRating(raw.rating),
    review_count: normalizeReviewCount(raw.review_count),
    price_range: normalizePriceRange(raw.price_range),
    opening_hours: cleanText(raw.opening_hours),
    business_status: normalizeBusinessStatus(raw.business_status),
    latitude: coords.latitude,
    longitude: coords.longitude,
    maps_url: finalUrl,
    description: cleanText(raw.description),
    services_attributes: cleanText(raw.services_attributes),
    photos: cleanText(raw.photos),
    videos: cleanText(raw.videos),
    logo_url: cleanText(raw.logo_url),
    social_links: cleanText(raw.social_links),
    reviews: JSON.stringify(Array.isArray(raw.reviews) ? raw.reviews : []),
    review_topics: JSON.stringify(Array.isArray(raw.review_topics) ? raw.review_topics : []),
    additional_attributes: JSON.stringify(raw.additional_attributes || {}),
    media_items: JSON.stringify(Array.isArray(raw.media_items) ? raw.media_items : []),
    plus_code: cleanText(raw.plus_code),
    attributes: JSON.stringify(Array.isArray(raw.attributes) ? raw.attributes : []),
    accessibility_attributes: JSON.stringify(Array.isArray(raw.accessibility_attributes) ? raw.accessibility_attributes : []),
    next_opening_text: cleanText(raw.nextOpeningText),
    next_open_day: cleanText(raw.nextOpeningDay),
    next_open_time: cleanText(raw.nextOpeningTime),
    visible_photos_count: cleanText(raw.visiblePhotosCount),
    postal_code: cleanText(addressComponents.postal_code),
    country: cleanText(addressComponents.country),
    city: cleanText(addressComponents.city),
    state: cleanText(addressComponents.state),
    source_place_id: cleanText(sourcePlaceId),
    source_url: cleanText(sourceUrl),
    popular_times: JSON.stringify(Array.isArray(raw.popular_times) ? raw.popular_times : []),
    rating_distribution: JSON.stringify(raw.rating_distribution || {}),
    review_highlights: JSON.stringify(Array.isArray(raw.review_highlights) ? raw.review_highlights : []),
    field_status: JSON.stringify(fieldStatus),
    collected_at: collectedAt,
    booking_url: cleanText(raw.bookingUrl),
  };
}
