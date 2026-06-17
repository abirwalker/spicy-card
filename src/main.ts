// Spicy Card View — main orchestrator
// @ts-ignore this is temp fix
import "./styles/CardView.scss";
// @ts-ignore this is temp fix
import "./styles/simplebar.css";
// @ts-ignore this is temp fix
import "./styles/Lyrics.scss";

import { CreateElement, ResetRomanization } from "./utils/Shared";
import { fetchAndAdaptLyrics } from "./utils/fetchLyrics";
import { getLyricsFromCache } from "./utils/LyricsCache";
import CardView from "./components/CardView";
import NoLyricsCard from "./components/NoLyricsCard";

// Load SpicyLyrics font
const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.type = "text/css";
fontLink.href = "https://fonts.spikerko.org/spicy-lyrics/source.css";
document.head.appendChild(fontLink);

// DOM selectors
const CardInsertAnchor = ".main-nowPlayingView-nowPlayingWidget";
const CardInsertAnchorFallback = ".main-nowPlayingView-coverArtContainer";
const SpotifyCardViewQuery =
  ".main-nowPlayingView-section:not(:is(#SpicyCard-CardView)):has(.main-nowPlayingView-lyricsTitle)";

const LoadingLyricsCard = `<div class="LoadingLyricsCard Loading"></div>`;
// Self-healing observeElement pattern (inspired by Lucid Lyrics, Thanks hehe)

// ─── Self-healing DOM observer (from Lucid Lyrics) ───────────────────────────
function observeElement(
  selector: string,
  onAdd: (el: Element, onRemove: (cb: () => void) => void) => void,
): MutationObserver {
  let current: Element | null = null;
  let removeCb: (() => void) | null = null;

  const registerOnRemove = (cb: () => void) => {
    removeCb = cb;
  };

  const triggerRemove = () => {
    if (current && removeCb) removeCb();
    removeCb = null;
    current = null;
  };

  const handleCheck = () => {
    const el = document.body.querySelector(selector);
    if (el && el !== current) {
      if (current) triggerRemove();
      current = el;
      onAdd(el, registerOnRemove);
    } else if (!el && current) {
      triggerRemove();
    }
  };

  const observer = new MutationObserver(handleCheck);
  handleCheck();
  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
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
  if (type !== "track") return false;
  if ((item.metadata as any)?.is_local === "true") return false;
  return true;
};

const waitForSpicetify = (): Promise<void> => {
  return new Promise((resolve) => {
    const check = () => {
      if (
        Spicetify?.Player &&
        Spicetify?.LocalStorage &&
        Spicetify?.CosmosAsync &&
        Spicetify.Player.data?.item
      ) {
        resolve();
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
};

const ANCHOR_SELECTOR = `${CardInsertAnchor}, ${CardInsertAnchorFallback}`;

// ─── Init ────────────────────────────────────────────────────────────────────
async function init() {
  await waitForSpicetify();

  // Watch for the NPV anchor anywhere in the body
  // When it appears → create card + song listener
  // When Spotify removes it (queue, resize, re-render) → cleanup
  // When it reappears → re-create everything
  observeElement(ANCHOR_SELECTOR, (anchorEl, onRemove) => {
    const cardAnchor = anchorEl as HTMLDivElement;
    const cardContainer = cardAnchor.parentElement!;

    // Suppress Spotify's native lyrics card
    const CheckForNativeLyricsCard = () => {
      const nativeCard =
        cardContainer.querySelector<HTMLDivElement>(SpotifyCardViewQuery);
      if (nativeCard !== null) nativeCard.style.display = "none";
    };
    CheckForNativeLyricsCard();
    const nativeObserver = new MutationObserver(CheckForNativeLyricsCard);
    nativeObserver.observe(cardContainer, { childList: true });

    // Song change handling
    let currentFetchId = 0;
    let lastFetchedTrackId: string | null = null;

    const onSongChange = async () => {
      const trackId = getCurrentTrackId();
      if (trackId && trackId === lastFetchedTrackId) return;

      // Clean previous card
      existingCard?.Destroy();
      existingCard = null;

      ResetRomanization();

      if (!isStreamedTrack()) {
        existingCard = new NoLyricsCard(cardAnchor);
        return;
      }

      let fetchTrackId = trackId;
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
      if (!fetchTrackId) return;

      const fetchId = ++currentFetchId;

      const cached = getLyricsFromCache(fetchTrackId);
      const isCacheHit = cached !== undefined;

      let loadingCard: HTMLDivElement | undefined;
      if (!isCacheHit) {
        loadingCard = CreateElement<HTMLDivElement>(LoadingLyricsCard);
        cardAnchor.after(loadingCard);
      }

      const result = await fetchAndAdaptLyrics(fetchTrackId);

      if (fetchId !== currentFetchId) return;

      // Clean loading card
      loadingCard?.remove();

      if (result) {
        lastFetchedTrackId = fetchTrackId;
        existingCard = new CardView(
          cardAnchor,
          result.lyrics,
          result.romanizationReady,
          !!loadingCard,
        );
      } else {
        existingCard = new NoLyricsCard(cardAnchor);
      }
    };

    let existingCard: CardView | NoLyricsCard | null = null;

    const songChangeHandler = () => onSongChange();
    Spicetify.Player.addEventListener("songchange", songChangeHandler);

    // Trigger immediately for the current song
    onSongChange();

    // Dev mode badge
    if (process.env.NODE_ENV === "development") {
      Spicetify.showNotification("Spicy Card — Dev Mode", false, 3000);
    }

    // Cleanup when anchor is removed from DOM
    onRemove(() => {
      Spicetify.Player.removeEventListener("songchange", songChangeHandler);
      nativeObserver.disconnect();
      currentFetchId++; // cancel in-flight fetch
      existingCard?.Destroy();
      existingCard = null;
    });
  });
}

init();
