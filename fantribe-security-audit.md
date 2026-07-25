# FanTribe (`fantribe.io`) — Security Audit Report

**Date:** 25 July 2026  
**Target:** https://fantribe.io (+ `cdn.fantribe.io`, Convex `zealous-perch-126.convex.cloud`, Bunny Stream `vz-d849a0bc-fed.b-cdn.net` / `iframe.mediadelivery.net`)  
**Positioning:** Francophone Africa creator platform (subs + tips); MoMo via **CinetPay** (XAF); cards via **Stripe**; +18 gating (`isAdult`)  
**Method:** Guest Convex API probe, full locked-media CDN harvest, OSS review of **90** queries / **58** mutations ([RinKhimera/FanTribe](https://github.com/RinKhimera/FanTribe)), profile/KYC/admin matrix  
**Artifacts:** `.audit-tmp/fantribe/` (+ `deep/` — `deep-probe.json`, `cdn-auth-matrix.json`, `locked-mp4-full.json`, `convex-exports.json`)

---

## Executive Summary

**Verdict: Critical.** Multiple independent guest paths leak subscriber media and creator KYC. Deep dive confirms the issue is not a single leftover query: **profile-by-username** and **`getPost` author** also return full user docs (email + `personalInfo`) while correctly stripping locked medias on some paths.

| Surface | Guest result |
|---------|----------------|
| App UI (`/`, `/feed`, …) | Clerk **signed-out** shell |
| `posts:getAllPosts` | **54** posts / **28** locked with full `medias[]` + authors |
| `users:getUserProfile` | **6/6** creators — **email** + **4/6** `personalInfo` (MoMo/WhatsApp/DoB/address) |
| `posts:getPost` (locked) | Medias stripped — **but author still has email + personalInfo** |
| Locked images `cdn.fantribe.io` | **27/27 HTTP 200** (~7.5 MB) |
| Locked Stream `play_720p.mp4` (mediadelivery Referer) | **17/17 HTTP 200** — **~267 MB** total (max **~124 MB**/file) |
| Admin/KYC/reports/transactions | Guest **denied** (auth/superuser checks hold) |
| Bunny upload/delete HTTP | Guest **401**; code review: any **auth** user can delete by path (IDOR) |

| Risk | Severity | Status |
|------|----------|--------|
| Guest `getAllPosts` → paid media URLs | **Critical** | Live |
| Unsigned image CDN | **Critical** | **27/27** |
| Stream Referer-only MP4/HLS | **Critical** | **17/17** full MP4s |
| Guest profile / post-author PII (`email`, `personalInfo`, Clerk IDs) | **Critical** | Username or postId sufficient |
| Auth `users:getUsers` returns up to **1000** full user docs | **High** | Code — any signed-in user |
| Bunny delete path IDOR (auth) | **High** | Code — no ownership check |
| Thumbnail tokens minted ~**10y** expiry | **Info** | Present in dump; live fetch **403** (key/path mismatch) |
| Webhooks without sig | **Info** | **400** (reject) — not open write |

**Bottom line:** Paywall is cosmetic for anyone who can call Convex or spoof a Stream Referer. Creator KYC is public via username.

---

## Stack

| Layer | Detail |
|-------|--------|
| App | **Next.js 16** on **Vercel** (Clerk middleware; catch-all `/[username]`) |
| Auth | **Clerk** (`clerk.fantribe.io`, `pk_live_…`) |
| Backend | **Convex** `https://zealous-perch-126.convex.cloud` |
| Images | **Bunny Storage** → pull zone **`cdn.fantribe.io`** (`fantribe.b-cdn.net`, pull zone `4483606`) |
| Video | **Bunny Stream** library **`494644`** → `iframe.mediadelivery.net` + `vz-d849a0bc-fed.b-cdn.net` |
| Payments | **CinetPay** (OM/MoMo) + **Stripe** |
| Source | Public GitHub `RinKhimera/FanTribe` (Convex schema, `signedUrls`, Bunny helpers) |

Subscribed content model: post `visibility: "public" | "subscribers_only"`; media URLs stored on the post document.

---

## Critical: `posts:getAllPosts`

Unauthenticated:

```http
POST https://zealous-perch-126.convex.cloud/api/query
Content-Type: application/json
Convex-Client: npm-1.31.7

{"path":"posts:getAllPosts","args":{},"format":"json"}
```

Returns up to **100** newest posts with **no auth**, **no visibility filter**, and **full `author` documents**.

### Catalog (live sample)

| Metric | Value |
|--------|-------|
| Posts returned | **54** |
| `public` / `subscribers_only` | **26** / **28** |
| `isAdult: true` | **15** |
| Creators (usernames) | `guest23`, `holicia`, `anamof`, `mwenge`, `alisha`, `airichan` |
| Media | public: **9** video + **23** image · locked: **17** video + **27** image |

### PII in author objects

Guest dump includes for creators:

- `email` (**6** unique)
- `tokenIdentifier` / `externalId` (Clerk)
- `personalInfo` when present: `fullName`, `dateOfBirth`, `address`, `mobileMoneyNumber`, `whatsappNumber` (**4/6** creators in sample)

### Contrast: gated queries

| Query | Guest locked media |
|-------|--------------------|
| `posts:getAllPosts` | **Full URLs returned** |
| `posts:getPost` | `medias: []`, `isMediaLocked: true` |
| `posts:getUserGallery` | Public items only |
| `posts:getUserPosts` | Locked medias emptied |

Open-source `filterPostMediasForViewer` documents the intended rule (“never return URLs to unauthorized users”) — **`getAllPosts` does not call it**.

Likely leftover/debug query still deployed; referenced only in `convex/posts.ts` (not required for UI).

---

## Critical: CDN / Stream bypass

### Images (`subscribers_only`)

Paths like:

`https://cdn.fantribe.io/{userId}/{file}.jpg`

| Probe | Result |
|-------|--------|
| **27/27** locked image URLs | **HTTP 200**, real JPEG/PNG |
| Total bytes fetched | **~7.5 MB** |
| Size range | ~**67 KB** – **~1.3 MB** |

No CloudFront-style signature on the pull zone for images. Source `signedUrls.ts` falls back to **unsigned** URLs if `BUNNY_URL_TOKEN_KEY` is unset — consistent with production behavior.

### Videos (`subscribers_only`)

From dump: embed + GUID, e.g. library `494644` / GUID `56e1d4bf-616e-4128-b985-648819ef45cd`.

| URL | No Referer | `Referer: iframe.mediadelivery.net/...` |
|-----|------------|----------------------------------------|
| Embed page | **200** HTML | — |
| `…/playlist.m3u8` | **403** | **200** HLS master |
| `…/360p/video.m3u8` + `video0.ts` | — | **200** (segment ~**523 KB**) |
| `…/play_720p.mp4` | **403** | **200** full file |
| Stream thumbnail `?token=` | **403** | Tokens in dump claim ~**10y** `expires`; live **403** |

### Locked MP4 harvest (full GET, Referer only)

| Metric | Value |
|--------|-------|
| Locked videos in dump | **17** |
| Guest `play_720p.mp4` **200** | **17/17** |
| Total bytes | **~267 MB** |
| Size range | **~0.6 MB** – **~124 MB** |

**Paywall bypass:** GUID from `getAllPosts` (or any leak) + spoofed mediadelivery Referer → full progressive MP4 / HLS without subscription.

CDN **directory listing** of `cdn.fantribe.io/{userId}/` → **404** (no listing); objects remain reachable by exact path.

---

## Deep dive (2026-07-25)

### Guest Convex surface map

OSS exposes **90** public queries / **58** mutations. Live guest matrix (artifacts: `deep/deep-probe.json`, `deep/guest-api-matrix.json`):

| Class | Examples | Guest |
|-------|----------|-------|
| **Open dump** | `posts:getAllPosts` | Full locked medias + authors |
| **Open PII** | `users:getUserProfile` | Full user doc by username |
| **Partial OK** | `posts:getPost`, gallery, user posts | Locked medias stripped; **author PII still present** on `getPost` |
| **Auth required** | home/explore feeds, messaging send, createPost | Error / empty |
| **Superuser** | `creatorApplications:getAll*`, `reports:getAll*`, most dashboard/tx | Denied |
| **Benign public** | `userStats:*`, `likes:countLikes`, `follows:getFollowerCount`, `subscriptions:getSubscriptionStatus` | Counts/flags only |

### Critical: profile KYC without auth

```http
POST …/api/query
{"path":"users:getUserProfile","args":{"username":"<handle>"},"format":"json"}
```

Handler returns `{ ...user, blockStatus: null }` for anonymous callers — i.e. the **entire** `users` document (`userDocValidator` includes `email`, `personalInfo`, `tokenIdentifier`, `externalId`).

| Username | email | personalInfo |
|----------|-------|--------------|
| 6 creators sampled | **6/6** | **4/6** (`fullName`, `dateOfBirth`, `address`, `mobileMoneyNumber`, `whatsappNumber`) |

Same PII appears on `posts:getPost` → `author` even when `medias` are empty for locked posts.

### Auth-tier findings (code + guest contrast)

| Finding | Evidence |
|---------|----------|
| `users:getUsers` | Any authenticated identity; `.take(1000)` full `userDocValidator` docs (emails/KYC) — guest correctly errors |
| `getSuggestedCreators` / `getPopularCreators` | Auth; return full creator docs |
| Bunny `POST /api/bunny/delete` | Auth only; **no check** that `mediaId`/`mediaUrl` belongs to caller — path IDOR |
| Bunny upload | Auth required (**401** guest) — OK for unauth |
| Webhooks `/clerk`, `/stripe`, `/cinetpay` | Unsigned POST → **400** (verification fails) — not open |

### What holds

- Media gating helpers used by `getPost` / gallery / pinned posts **do** clear locked URLs for non-subscribers.
- Creator application / report admin queries require **SUPERUSER**.
- No Bunny Storage zone listing from the public pull zone.
- Guest mutations (`createPost`, likes, comments) fail auth.

---

## Other surfaces

| Check | Result |
|-------|--------|
| Clerk-protected app routes | Signed-out rewrite; no guest SSR media catalog |
| `/api/bunny/upload-*` / `delete` on `*.convex.site` | Guest **401** `Non authentifie` |
| Direct storage API | AccessKey server-side only |
| `happy-otter-123.convex.cloud` | **404** (not this prod) |

---

## Recommendations (for maintainers)

1. **Delete or `requireSuperuser` on `posts:getAllPosts` immediately.**
2. **Public profile DTO:** never return `email`, `personalInfo`, `tokenIdentifier`, `externalId`, ban internals — apply to `getUserProfile`, `getPost.author`, explore enrichments, `userDocValidator` usages.
3. Enable **Bunny Token Authentication** on the image pull zone; short-lived signed URLs only after access checks.
4. Stream: **token auth** on MP4/HLS (not Referer alone); never emit embed/play URLs for locked posts to unauthorized clients.
5. Auth: scope `getUsers` to superuser; strip PII from suggestion/search results.
6. Bunny delete: verify object path prefix == caller subject / owned mediaId before delete.
7. Treat current CDN paths + Stream GUIDs as **compromised**; rotate token keys; re-path sensitive objects if feasible.
8. Shorten thumbnail token TTL (code currently allows ~**10 years**).

---

## Verdict

**Critical** — guest can (1) dump locked media URLs, (2) fetch all locked images unsigned, (3) download **all 17** locked progressive MP4s (~267 MB) via Referer spoof, and (4) pull creator KYC by username alone. Distinct from Kwital (Low web); FanTribe’s Convex + Bunny surface is actively exploitable.

**Next in FR queue (playbook):** Uncove → MikroGigs / Cirrden / THESYMO–Whaazs triage.
