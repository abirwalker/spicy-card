// Spicy Card View: main orchestrator
import "./styles/CardView.scss";
import "./styles/simplebar.css";
import "./styles/Lyrics.scss";

import { CreateElement, ResetRomanization } from "./utils/Shared";
import { fetchAndAdaptLyrics } from "./utils/fetchLyrics";
import { cleanupLyricsCache, getLyricsFromCache } from "./utils/LyricsCache";
import CardView from "./components/CardView";
import NoLyricsCard from "./components/NoLyricsCard";

// Load SpicyLyrics font
const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.type = "text/css";
fontLink.href = "https://fonts.spikerko.org/spicy-lyrics/source.css";
document.head.appendChild(fontLink);

const SpotifyCardViewQuery = [
  '[data-testid="lyrics-npv-section"]',
  '.main-nowPlayingView-section:not(#SpicyCard-CardView):has(.main-nowPlayingView-lyricsTitle)'
].join(", ");

const LoadingLyricsCard = `<div class="LoadingLyricsCard Loading"></div>`;

// Spotify's newer NPV layout (rolled out remotely to 1.3.3+) has no test id on the
// panel's content or artwork. Its cover block holds either the Canvas surface or
// the cover-art slot, and the block after it holds the title, the sections, etc.
const NPV_COVER_MARKERS = "[data-canvas-surface], [data-testid='cover-art-slot']";

const GetNPVElement = (): HTMLElement | null =>
  document.querySelector<HTMLElement>("aside.NowPlayingView") ??
  document.querySelector<HTMLElement>(
    `aside#Desktop_PanelContainer_Id:has([data-testid='NPV_Panel_OpenDiv'], .main-nowPlayingView-coverArtContainer, ${NPV_COVER_MARKERS})`
  );

const GetNPVObserverRoot = (): Element | null => {
  const panel = document.getElementById("Desktop_PanelContainer_Id") ?? GetNPVElement();
  return (
    document.querySelector(".Root__right-sidebar") ??
    panel?.closest(".Root__top-container > *, .LiEjwLua6RNBCvlysAT2 > *") ??
    panel?.closest("[aria-hidden]") ??
    panel?.parentElement ??
    null
  );
};

const isNPVVisible = (npv: HTMLElement): boolean => {
  return npv.isConnected && !npv.closest('[inert], [hidden], [aria-hidden="true"]');
};

function insertCard(npv: HTMLElement, el: HTMLElement): boolean {
  // Mode 1: Modern Spotify with test IDs
  const modernContent = npv.querySelector('[data-testid="NPV_Panel_OpenDiv"]');
  if (modernContent) {
    const nativeLyrics = modernContent.querySelector('[data-testid="lyrics-npv-section"]');
    if (nativeLyrics?.parentElement === modernContent) {
      if (el.parentElement !== modernContent || el.nextElementSibling !== nativeLyrics) {
        nativeLyrics.insertAdjacentElement("beforebegin", el);
      }
    } else {
      const artwork = modernContent.querySelector(
        `${NPV_COVER_MARKERS}, [data-testid="track-visual-enhancement"], .main-nowPlayingView-coverArtContainer`
      );
      let section: Element | null = artwork;
      while (section && section.parentElement !== modernContent) section = section.parentElement;
      if (section) {
        if (section.nextElementSibling !== el) section.insertAdjacentElement("afterend", el);
      } else if (modernContent.firstElementChild !== el) {
        modernContent.prepend(el);
      }
    }
    return true;
  }

  // Mode 2: Modern Spotify 1.3.3+ (Canvas / cover-art-slot)
  const coverMarker = npv.querySelector(NPV_COVER_MARKERS);
  if (coverMarker) {
    const nativeLyrics = npv.querySelector('[data-testid="lyrics-npv-section"]');
    if (nativeLyrics) {
      if (el.nextElementSibling !== nativeLyrics) nativeLyrics.insertAdjacentElement("beforebegin", el);
      return true;
    }

    let coverBlock: Element = coverMarker;
    while (coverBlock.parentElement && coverBlock.parentElement !== npv && coverBlock.parentElement.children.length < 2) {
      coverBlock = coverBlock.parentElement;
    }
    let info = coverBlock.nextElementSibling;
    if (info === el) info = el.nextElementSibling;
    if (!info) {
      if (coverBlock.nextElementSibling !== el) coverBlock.insertAdjacentElement("afterend", el);
      return true;
    }
    const infoBlocks = [...info.children].filter((child) => child !== el);
    const title =
      infoBlocks.find((child) => child.querySelector('a[href^="/album/"], a[href^="/show/"], a[href^="/episode/"]')) ??
      infoBlocks.find((child) => child.textContent?.trim());
    if (title) {
      if (title.nextElementSibling !== el) title.insertAdjacentElement("afterend", el);
    } else if (info.firstElementChild !== el) {
      info.prepend(el);
    }
    return true;
  }

  // Mode 3: Legacy Spotify builds with coverArtContainer
  const cover = npv.querySelector(".main-nowPlayingView-coverArtContainer");
  const anchor =
    cover?.closest(".main-nowPlayingView-nowPlayingWidget") ??
    cover?.closest(".main-nowPlayingView-section") ??
    cover?.parentElement ??
    null;
  if (anchor && anchor.parentElement && anchor !== npv) {
    if (anchor.nextElementSibling !== el) {
      anchor.insertAdjacentElement("afterend", el);
    }
    return true;
  }

  // Mode 4: Legacy content fallback
  const content = npv.querySelector(".main-nowPlayingView-content");
  if (content) {
    if (content.firstElementChild !== el) {
      content.prepend(el);
    }
    return true;
  }

  return false;
}

function hideNativeLyrics(npv: HTMLElement): void {
  const nativeCards = npv.querySelectorAll<HTMLElement>(SpotifyCardViewQuery);
  nativeCards.forEach((card) => {
    if (card.style.display !== "none") {
      card.style.setProperty("display", "none", "important");
    }
  });
}

function waitForSpicetify(): Promise<void> {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (Spicetify?.Player?.data && Spicetify?.CosmosAsync) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });
}

const getCurrentTrackId = (): string | null => {
  const uri = Spicetify.Player.data?.item?.uri;
  if (!uri || !uri.startsWith("spotify:track:")) return null;
  return uri.split(":")[2] ?? null;
};

const isStreamedTrack = (): boolean => {
  const item = Spicetify.Player.data?.item;
  if (!item) return false;
  const type = item.type;
  const provider = (item as any).provider ?? "";
  if (type === "unknown" && provider.startsWith("narration")) return false;
  return type === "track" || (type === "unknown" && provider === "");
};

let existingCard: CardView | NoLyricsCard | null = null;
let activeLoadingCard: HTMLDivElement | null = null;

function getActiveCardEl(): HTMLElement | null {
  return (existingCard?.Container as HTMLElement | undefined) ?? activeLoadingCard ?? null;
}

function mountActiveCard(): void {
  const npv = GetNPVElement();
  if (!npv) return;
  hideNativeLyrics(npv);
  if (!isNPVVisible(npv)) return;

  const cardEl = getActiveCardEl();
  if (!cardEl) return;
  insertCard(npv, cardEl);
}

let observedSidebar: Element | null = null;
let sidebarObserver: MutationObserver | null = null;

function attachSidebarObserver(): void {
  const sidebar = GetNPVObserverRoot();
  if (!sidebar || sidebar === observedSidebar) return;
  sidebarObserver?.disconnect();

  sidebarObserver = new MutationObserver((records) => {
    const cardEl = getActiveCardEl();
    if (records.every((record) => cardEl !== null && cardEl.contains(record.target))) return;

    const npv = GetNPVElement();
    if (npv) {
      hideNativeLyrics(npv);
      if (isNPVVisible(npv) && cardEl) {
        mountActiveCard();
      }
    }
  });

  sidebarObserver.observe(sidebar, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["inert", "aria-hidden", "hidden", "aria-label"],
  });
  observedSidebar = sidebar;
  mountActiveCard();
}

function attachWatchers(): void {
  attachSidebarObserver();

  const topContainer =
    document.querySelector(".Root__top-container, .LiEjwLua6RNBCvlysAT2") ??
    document.getElementById("main-view")?.parentElement ??
    null;
  const watchRoot = topContainer ?? document.querySelector(".Root") ?? document.body;

  let watchingSubtree = false;
  const observeTop = () => {
    watchingSubtree = topContainer === null || observedSidebar === null;
    topObserver.observe(watchRoot, { childList: true, subtree: watchingSubtree });
  };

  const topObserver = new MutationObserver((records) => {
    if (observedSidebar === null) {
      attachSidebarObserver();
      if (observedSidebar !== null && watchingSubtree && topContainer !== null) observeTop();
      return;
    }
    const cardEl = getActiveCardEl();
    if (records.every((record) => cardEl !== null && cardEl.contains(record.target))) return;

    const panelChanged = records.some((record) =>
      [...record.addedNodes, ...record.removedNodes].some(
        (node) =>
          node instanceof Element &&
          (node.matches("aside.NowPlayingView, #Desktop_PanelContainer_Id") ||
            node.querySelector("aside.NowPlayingView, #Desktop_PanelContainer_Id"))
      )
    );

    if (!observedSidebar || !observedSidebar.isConnected || panelChanged) {
      observedSidebar = null;
      attachSidebarObserver();
      if (observedSidebar === null && !watchingSubtree) observeTop();
    }
  });

  observeTop();
}

let currentFetchId = 0;
let lastFetchedTrackId: string | null = null;

async function onSongChange(): Promise<void> {
  const initialTrackId = getCurrentTrackId();
  if (initialTrackId && initialTrackId === lastFetchedTrackId) return;

  const fetchId = ++currentFetchId;

  // Clean previous card and loading skeleton
  activeLoadingCard?.remove();
  activeLoadingCard = null;
  existingCard?.Destroy();
  existingCard = null;

  ResetRomanization();

  let fetchTrackId = initialTrackId;
  if (!fetchTrackId) {
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        fetchTrackId = getCurrentTrackId();
        if (fetchTrackId) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
      setTimeout(() => {
        clearInterval(interval);
        resolve();
      }, 3000);
    });
  }
  if (!fetchTrackId || fetchId !== currentFetchId) return;

  // Check if track is a streamed track once player data is populated
  if (!isStreamedTrack()) {
    lastFetchedTrackId = fetchTrackId;
    existingCard = new NoLyricsCard();
    mountActiveCard();
    return;
  }

  const cached = getLyricsFromCache(fetchTrackId);
  const isCacheHit = cached !== undefined;

  let loadingCard: HTMLDivElement | undefined;
  if (!isCacheHit) {
    loadingCard = CreateElement<HTMLDivElement>(LoadingLyricsCard);
    activeLoadingCard = loadingCard;
    mountActiveCard();
  }

  const result = await fetchAndAdaptLyrics(fetchTrackId);

  loadingCard?.remove();
  if (activeLoadingCard === loadingCard) {
    activeLoadingCard = null;
  }

  if (fetchId !== currentFetchId) return;

  lastFetchedTrackId = fetchTrackId;

  if (result) {
    existingCard = new CardView(
      result.lyrics,
      result.romanizationReady,
      !!loadingCard,
      result.creditsReady
    );
  } else {
    existingCard = new NoLyricsCard();
  }

  mountActiveCard();
}

async function init() {
  await waitForSpicetify();

  // Run cleanup once on startup to prune old v1 keys, expired v2 entries, and enforce LRU cache limit
  cleanupLyricsCache();

  attachWatchers();

  Spicetify.Player.addEventListener("songchange", () => {
    void onSongChange();
  });

  void onSongChange();

  if (process.env.NODE_ENV === "development") {
    Spicetify.showNotification("Spicy Card: Dev Mode", false, 3000);
  }
}

init();
