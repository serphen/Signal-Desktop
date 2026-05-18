// Copyright 2024 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import * as React from 'react';
import type { LocalizerType } from '../../types/Util.std.ts';
import type { StickerPackType } from '../../state/ducks/stickers.preload.ts';
import { SignalService as Proto } from '../../protobuf/index.std.ts';
import { putStickers } from '../../textsecure/WebAPI.preload.ts';

type RisibankMedia = {
  id: number;
  cache_url: string;
};

type RisibankStickerResult = {
  id: number;
  cache_url: string;
  slug: string;
  user: {
    username_custom: string;
  };
};

type RisibankCollection = {
  id: number;
  name: string;
  media_count: number;
  total_interact_count: number;
  user: {
    username_custom: string;
  };
  preview_medias: Array<RisibankMedia>;
};

type RisibankCollectionFull = RisibankCollection & {
  medias: Array<RisibankMedia>;
};

export type Props = {
  readonly i18n: LocalizerType;
  readonly installedPacks: ReadonlyArray<StickerPackType>;
};

const API_BASE = 'https://risibank.fr/api/v1';
const DEBOUNCE_MS = 300;

// Risibank ID tag embedded in pack titles: [rb:c12345] for collections, [rb:s67890] for stickers
const RB_TAG_RE = /\[rb:([cs])(\d+)\]/;

function makeRbTag(type: 'c' | 's', id: number): string {
  return `[rb:${type}${id}]`;
}

function extractInstalledRbIds(
  packs: ReadonlyArray<StickerPackType>
): { collections: Set<number>; stickers: Set<number> } {
  const collections = new Set<number>();
  const stickers = new Set<number>();
  for (const pack of packs) {
    const match = RB_TAG_RE.exec(pack.title);
    if (match) {
      const id = Number(match[2]);
      if (match[1] === 'c') {
        collections.add(id);
      } else {
        stickers.add(id);
      }
    }
  }
  return { collections, stickers };
}

// -- Crypto helpers (same algorithm as sticker-creator/src/util/crypto.ts) --

const PACK_KEY_SIZE = 32;
const PACK_KEY_SALT = new Uint8Array(32);
const PACK_KEY_INFO = new TextEncoder().encode('Sticker Pack');
const IV_SIZE = 16;

type EncryptKeys = { aesKey: CryptoKey; macKey: CryptoKey };

async function deriveKeys(packKey: Uint8Array): Promise<EncryptKeys> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    packKey,
    'HKDF',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'hkdf', hash: 'SHA-256', salt: PACK_KEY_SALT, info: PACK_KEY_INFO },
    baseKey,
    8 * 64
  );
  const aesKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(bits, 0, 32),
    'AES-CBC',
    false,
    ['encrypt']
  );
  const macKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(bits, 32, 32),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return { aesKey, macKey };
}

async function encryptAttachment(
  plaintext: Uint8Array,
  keys: EncryptKeys
): Promise<Uint8Array> {
  const iv = new Uint8Array(IV_SIZE);
  crypto.getRandomValues(iv);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, keys.aesKey, plaintext)
  );
  const ivAndCiphertext = new Uint8Array(iv.length + ciphertext.length);
  ivAndCiphertext.set(iv);
  ivAndCiphertext.set(ciphertext, iv.length);
  const mac = new Uint8Array(
    await crypto.subtle.sign('HMAC', keys.macKey, ivAndCiphertext)
  );
  const result = new Uint8Array(ivAndCiphertext.length + mac.length);
  result.set(ivAndCiphertext);
  result.set(mac, ivAndCiphertext.length);
  return result;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

// -- Image conversion: resize to 512x512 WebP, max 300KB --

const STICKER_SIZE = 512;
const MAX_STICKER_BYTES = 300 * 1024;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

async function convertToWebP(url: string): Promise<Uint8Array> {
  const img = await loadImage(url);

  const canvas = document.createElement('canvas');
  canvas.width = STICKER_SIZE;
  canvas.height = STICKER_SIZE;
  const ctx = canvas.getContext('2d')!;

  // Fit image into 512x512, centered, transparent background
  ctx.clearRect(0, 0, STICKER_SIZE, STICKER_SIZE);
  const scale = Math.min(STICKER_SIZE / img.width, STICKER_SIZE / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  const x = (STICKER_SIZE - w) / 2;
  const y = (STICKER_SIZE - h) / 2;
  ctx.drawImage(img, x, y, w, h);

  // Try WebP at decreasing quality until under 300KB
  let quality = 0.9;
  while (quality > 0.1) {
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/webp', quality)
    );
    if (blob && blob.size <= MAX_STICKER_BYTES) {
      return new Uint8Array(await blob.arrayBuffer());
    }
    quality -= 0.1;
  }

  // Fallback: PNG (for very small/simple images)
  const pngBlob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, 'image/png')
  );
  if (pngBlob) {
    return new Uint8Array(await pngBlob.arrayBuffer());
  }

  throw new Error('Failed to convert image');
}

// -- Install logic --

const STICKERS_PER_PACK = 25;

async function uploadOnePack(
  title: string,
  author: string,
  mediaUrls: Array<string>
): Promise<void> {
  const imageBuffers: Array<Uint8Array> = [];
  for (const url of mediaUrls) {
    imageBuffers.push(await convertToWebP(url));
  }

  const packKey = new Uint8Array(PACK_KEY_SIZE);
  crypto.getRandomValues(packKey);
  const keys = await deriveKeys(packKey);

  const manifestProto = Proto.StickerPack.encode({
    title,
    author,
    stickers: imageBuffers.map((_b, idx) => ({ id: idx, emoji: '\u{1F60A}' })),
    cover: { id: 0, emoji: '\u{1F60A}' },
  }).finish();

  const encryptedManifest = await encryptAttachment(manifestProto, keys);
  const encryptedImages = await Promise.all(
    imageBuffers.map(buf => encryptAttachment(buf, keys))
  );

  const packId = await putStickers(encryptedManifest, encryptedImages);

  const b64Key = toBase64(packKey);
  await window.Events.installStickerPack(packId, b64Key);

  // eslint-disable-next-line no-console
  console.log(`Risibank pack installed: "${title}" id=${packId} (${mediaUrls.length} stickers)`);
}

async function installRisibankCollection(
  medias: Array<RisibankMedia>,
  collection: RisibankCollection,
  setInstalling: (id: number | null) => void
): Promise<void> {
  setInstalling(collection.id);
  try {
    if (medias.length === 0) {
      throw new Error('Collection has no stickers');
    }

    // Use API order (order stickers were added to the collection)
    // New additions land at the end → always in the last pack
    const urls = medias.map(m => m.cache_url);
    const totalPacks = Math.ceil(urls.length / STICKERS_PER_PACK);

    for (let i = 0; i < totalPacks; i++) {
      const chunk = urls.slice(
        i * STICKERS_PER_PACK,
        (i + 1) * STICKERS_PER_PACK
      );
      const tag = makeRbTag('c', collection.id);
      const title =
        totalPacks === 1
          ? `${collection.name} ${tag}`
          : `${collection.name} (${i + 1}/${totalPacks}) ${tag}`;

      await uploadOnePack(title, collection.user.username_custom, chunk);
    }

    // eslint-disable-next-line no-console
    console.log(
      `Risibank collection "${collection.name}" fully installed: ${medias.length} stickers in ${totalPacks} pack(s)`
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to install Risibank collection:', err);
  } finally {
    setInstalling(null);
  }
}

async function installSingleSticker(
  sticker: RisibankStickerResult,
  setInstalling: (id: number | null) => void
): Promise<void> {
  setInstalling(sticker.id);
  try {
    const name = sticker.slug || `Sticker #${sticker.id}`;
    const tag = makeRbTag('s', sticker.id);
    await uploadOnePack(`${name} ${tag}`, sticker.user.username_custom, [sticker.cache_url]);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Failed to install single sticker:', err);
  } finally {
    setInstalling(null);
  }
}

// -- Detail view: shows all stickers in a collection --

function CollectionDetail({
  collection,
  onBack,
  installingId,
  isInstalled,
  onInstall,
}: {
  collection: RisibankCollection;
  onBack: () => void;
  installingId: number | null;
  isInstalled: boolean;
  onInstall: (medias: Array<RisibankMedia>, collection: RisibankCollection) => void;
}) {
  const [medias, setMedias] = React.useState<Array<RisibankMedia> | null>(null);
  const [loadingDetail, setLoadingDetail] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoadingDetail(true);
    void (async () => {
      try {
        const resp = await fetch(`${API_BASE}/collections/${collection.id}`);
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }
        const full: RisibankCollectionFull = await resp.json();
        if (!cancelled) {
          setMedias(full.medias ?? full.preview_medias ?? []);
        }
      } catch (_err) {
        if (!cancelled) {
          setMedias([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingDetail(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [collection.id]);

  return (
    <div className="risibank-detail">
      <div className="risibank-detail__header">
        <button
          type="button"
          className="risibank-detail__back"
          onClick={onBack}
        >
          &larr;
        </button>
        <div className="risibank-detail__title">
          <div className="risibank-detail__name">{collection.name}</div>
          <div className="risibank-detail__author">
            by {collection.user.username_custom}
          </div>
        </div>
        <button
          type="button"
          className="risibank-browser__install-btn risibank-detail__install-btn"
          disabled={isInstalled || installingId != null || !medias || medias.length === 0}
          onClick={() => medias && onInstall(medias, collection)}
        >
          {isInstalled
            ? 'Installed'
            : installingId === collection.id
              ? 'Installing...'
              : 'Install'}
        </button>
      </div>
      <div className="risibank-detail__stickers">
        {loadingDetail && (
          <div className="risibank-browser__loading">Loading...</div>
        )}
        {!loadingDetail && medias && medias.length === 0 && (
          <div className="risibank-browser__empty">No stickers found.</div>
        )}
        {!loadingDetail &&
          medias &&
          medias.length > 0 &&
          medias.map((media, idx) => (
            <img
              key={idx}
              className="risibank-detail__sticker-img"
              src={media.cache_url}
              alt=""
              loading="lazy"
            />
          ))}
      </div>
    </div>
  );
}

// -- Main component --

export const RisibankCollectionBrowser = React.memo(
  function RisibankCollectionBrowserInner({ i18n, installedPacks }: Props) {
    const [searchQuery, setSearchQuery] = React.useState('');
    const [collections, setCollections] = React.useState<
      Array<RisibankCollection>
    >([]);
    const [stickers, setStickers] = React.useState<
      Array<RisibankStickerResult>
    >([]);
    const [loading, setLoading] = React.useState(false);
    const [installingId, setInstallingId] = React.useState<number | null>(null);
    const [selectedCollection, setSelectedCollection] =
      React.useState<RisibankCollection | null>(null);
    const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

    // Scan locally installed packs for [rb:cXXX] / [rb:sXXX] tags
    const { installedCollectionIds, installedStickerIds } = React.useMemo(() => {
      const { collections: c, stickers: s } = extractInstalledRbIds(installedPacks);
      return { installedCollectionIds: c, installedStickerIds: s };
    }, [installedPacks]);

    const isCollectionInstalled = React.useCallback(
      (id: number) => installedCollectionIds.has(id),
      [installedCollectionIds]
    );

    const isStickerInstalled = React.useCallback(
      (id: number) => installedStickerIds.has(id),
      [installedStickerIds]
    );

    const fetchResults = React.useCallback(async (query: string) => {
      setLoading(true);
      try {
        // Always fetch collections
        const collParams = new URLSearchParams({ sort: 'hot', page: '1' });
        if (query.trim()) {
          collParams.set('search', query.trim());
        }
        const collResp = await fetch(
          `${API_BASE}/collections?${collParams.toString()}`
        );
        if (collResp.ok) {
          const data = await collResp.json();
          const items: Array<RisibankCollection> = Array.isArray(data)
            ? data
            : data.collections ?? [];
          setCollections(items);
        } else {
          setCollections([]);
        }

        // Fetch individual stickers only when searching
        if (query.trim()) {
          const stickerParams = new URLSearchParams({ query: query.trim() });
          const stickerResp = await fetch(
            `${API_BASE}/medias/search?${stickerParams.toString()}`
          );
          if (stickerResp.ok) {
            const stickerData = await stickerResp.json();
            setStickers(stickerData.medias ?? []);
          } else {
            setStickers([]);
          }
        } else {
          setStickers([]);
        }
      } catch (_err) {
        setCollections([]);
        setStickers([]);
      } finally {
        setLoading(false);
      }
    }, []);

    React.useEffect(() => {
      void fetchResults('');
    }, [fetchResults]);

    const handleSearchChange = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setSearchQuery(value);
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }
        debounceRef.current = setTimeout(() => {
          void fetchResults(value);
        }, DEBOUNCE_MS);
      },
      [fetchResults]
    );

    React.useEffect(() => {
      return () => {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }
      };
    }, []);

    const handleInstallCollection = React.useCallback(
      (medias: Array<RisibankMedia>, collection: RisibankCollection) => {
        if (installingId != null) {
          return;
        }
        void installRisibankCollection(medias, collection, setInstallingId);
      },
      [installingId]
    );

    const handleInstallSticker = React.useCallback(
      (sticker: RisibankStickerResult) => {
        if (installingId != null || isStickerInstalled(sticker.id)) {
          return;
        }
        void installSingleSticker(sticker, setInstallingId);
      },
      [installingId, isStickerInstalled]
    );

    // Detail view
    if (selectedCollection) {
      return (
        <div className="risibank-browser">
          <CollectionDetail
            collection={selectedCollection}
            onBack={() => setSelectedCollection(null)}
            installingId={installingId}
            isInstalled={isCollectionInstalled(selectedCollection.id)}
            onInstall={handleInstallCollection}
          />
        </div>
      );
    }

    const hasCollections = !loading && collections.length > 0;
    const hasStickers = !loading && stickers.length > 0;
    const hasNothing = !loading && collections.length === 0 && stickers.length === 0;

    // Grid view
    return (
      <div className="risibank-browser">
        <div className="risibank-browser__search">
          <input
            type="text"
            className="risibank-browser__search-input"
            placeholder="Search Risibank..."
            value={searchQuery}
            onChange={handleSearchChange}
          />
        </div>
        <div className="risibank-browser__content">
          {loading && (
            <div className="risibank-browser__loading">Loading...</div>
          )}
          {hasNothing && (
            <div className="risibank-browser__empty">No results found.</div>
          )}

          {hasCollections && (
            <>
              {searchQuery.trim() && (
                <div className="risibank-browser__section-label">Collections</div>
              )}
              <div className="risibank-browser__grid">
                {collections.map(collection => {
                  const collInstalled = isCollectionInstalled(collection.id);
                  return (
                    <div
                      key={collection.id}
                      className={`risibank-browser__card${collInstalled ? ' risibank-browser__card--installed' : ''}`}
                      onClick={() => setSelectedCollection(collection)}
                    >
                      <div className="risibank-browser__card-previews">
                        {collection.preview_medias
                          .slice(0, 4)
                          .map((media, idx) => (
                            <img
                              key={idx}
                              className="risibank-browser__card-preview-img"
                              src={media.cache_url}
                              alt=""
                              loading="lazy"
                            />
                          ))}
                      </div>
                      <div className="risibank-browser__card-info">
                        <div className="risibank-browser__card-name">
                          {collection.name}
                        </div>
                        <div className="risibank-browser__card-meta">
                          {collInstalled
                            ? 'Installed'
                            : (
                              <>
                                {collection.user.username_custom}
                                {' \u00b7 '}
                                <span className="risibank-browser__card-count">{collection.media_count}</span>
                              </>
                            )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {hasStickers && (
            <>
              <div className="risibank-browser__divider" />
              <div className="risibank-browser__section-label">Stickers</div>
              <div className="risibank-browser__sticker-grid">
                {stickers.map(sticker => {
                  const installed = isStickerInstalled(sticker.id);
                  const installing = installingId === sticker.id;
                  return (
                    <div
                      key={sticker.id}
                      className={`risibank-browser__card risibank-browser__card--sticker${installed ? ' risibank-browser__card--installed' : ''}`}
                      onClick={() => !installed && handleInstallSticker(sticker)}
                    >
                      <div className="risibank-browser__card-previews risibank-browser__card-previews--single">
                        <img
                          className="risibank-browser__card-preview-img"
                          src={sticker.cache_url}
                          alt={sticker.slug}
                          loading="lazy"
                        />
                      </div>
                      <div className="risibank-browser__card-info">
                        <div className="risibank-browser__card-name">
                          {sticker.slug || `#${sticker.id}`}
                        </div>
                        <div className="risibank-browser__card-meta">
                          {installed
                            ? 'Installed'
                            : installing
                              ? 'Installing...'
                              : sticker.user.username_custom}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
);
