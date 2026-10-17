/**
 * @file NftGallery.example.tsx
 * @description Example: simple NFT gallery for a connected account.
 *
 *   Demonstrates `useWallet`, `useNftGallery`, `WalletButton`, and
 *   `StellarAddress` working together to list the connected user's NFTs with
 *   images and names — no extra configuration required.
 *
 * @package stellar-hooks
 * @license MIT
 */

import * as React from "react";
import { StellarProvider } from "../context";
import { useWallet } from "../hooks/useWallet";
import { useNftGallery } from "../hooks/useNftGallery";
import { WalletButton } from "../components/WalletButton";
import { StellarAddress } from "../components/StellarAddress";
import { StellarIdenticon } from "../components/StellarIdenticon";
import type { NftItem } from "../hooks/useNftGallery";

// ─── NftCard ──────────────────────────────────────────────────────────────────

function NftCard({ nft }: { nft: NftItem }): React.JSX.Element {
  return (
    <article
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        width: 180,
      }}
    >
      {nft.imageUrl ? (
        <img
          src={nft.imageUrl}
          alt={nft.name}
          style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover" }}
          loading="lazy"
        />
      ) : (
        /* Identicon fallback when no image is available */
        <div
          style={{
            width: "100%",
            aspectRatio: "1 / 1",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f7fafc",
          }}
        >
          <StellarIdenticon address={nft.issuer} size={80} />
        </div>
      )}
      <div style={{ padding: "8px 12px" }}>
        <strong style={{ display: "block", fontSize: 14 }}>{nft.name}</strong>
        {nft.description && (
          <p
            style={{
              fontSize: 12,
              color: "#718096",
              margin: "4px 0 0",
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {nft.description}
          </p>
        )}
        <span style={{ display: "block", fontSize: 10, color: "#a0aec0", marginTop: 6 }}>
          {nft.code}
        </span>
      </div>
    </article>
  );
}

// ─── Gallery ──────────────────────────────────────────────────────────────────

function Gallery(): React.JSX.Element {
  const { publicKey, isConnected } = useWallet();
  const { nfts, isLoading, isRefetching, error, refetch } = useNftGallery(
    publicKey,
    { enabled: isConnected, refetchInterval: 30_000 },
  );

  if (!isConnected || !publicKey) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#718096" }}>
        <p>Connect your Stellar wallet to view your NFT collection.</p>
        <WalletButton
          style={{
            marginTop: 16,
            padding: "10px 20px",
            borderRadius: 6,
            background: "#3b82f6",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StellarIdenticon address={publicKey} size={40} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>My NFT Gallery</div>
          <StellarAddress
            address={publicKey}
            leadingChars={6}
            trailingChars={6}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontSize: 12,
              color: "#718096",
              textDecoration: "underline dotted",
            }}
          />
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isLoading || isRefetching}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid #e2e8f0",
              background: "#fff",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {isRefetching ? "Refreshing…" : "Refresh"}
          </button>
          <WalletButton
            disconnectLabel="Disconnect"
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid #e2e8f0",
              background: "#fff",
              cursor: "pointer",
              fontSize: 13,
            }}
          />
        </div>
      </div>

      {/* Error state */}
      {error && (
        <p role="alert" style={{ color: "#e53e3e", fontSize: 14 }}>
          Failed to load NFTs: {error.message}
        </p>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              style={{
                width: 180,
                height: 220,
                borderRadius: 8,
                background: "#edf2f7",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && nfts.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#a0aec0" }}>
          <p>No NFTs found in this account.</p>
          <small>
            Stellar NFTs are assets with a supply and trustline limit of 1.
          </small>
        </div>
      )}

      {/* NFT grid */}
      {!isLoading && nfts.length > 0 && (
        <ul
          role="list"
          aria-label="NFT collection"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            listStyle: "none",
            padding: 0,
            margin: 0,
          }}
        >
          {nfts.map((nft) => (
            <li key={`${nft.issuer}-${nft.code}`}>
              <NftCard nft={nft} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── App entry ────────────────────────────────────────────────────────────────

/**
 * Wrap the gallery in a `<StellarProvider>` to supply network configuration.
 * In a real app you would place the provider higher in your component tree.
 */
export function NftGalleryExample(): React.JSX.Element {
  return (
    <StellarProvider network="mainnet">
      <Gallery />
    </StellarProvider>
  );
}

export default NftGalleryExample;
