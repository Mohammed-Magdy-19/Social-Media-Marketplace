# Social Media & Community Marketplace - Backend API

A production-ready, scalable RESTful API and real-time WebSocket backend for a full-stack social media network and peer-to-peer community marketplace.

Built with **Node.js**, **Express**, **MongoDB (Mongoose)**, **Socket.io**, and **Stripe**, following robust security standards, modular domain-driven architecture, and modern asynchronous patterns.

---

## 📑 Table of Contents

- [Overview & Architecture](#-overview--architecture)
- [Live Deployments](#-live-deployments)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [System Architecture & Hybrid Real-Time Design](#-system-architecture--hybrid-real-time-design)
- [Project Directory Structure](#-project-directory-structure)
- [Database Models](#-database-models)
- [API Endpoints Reference](#-api-endpoints-reference)
- [Real-Time Socket.io Events](#-real-time-socketio-events)
- [Security & Performance Engineering](#-security--performance-engineering)
- [Testing & Seeding](#-testing--seeding)
- [Deployment & Access](#-deployment--access)

---

## 🌐 Live Deployments

| Component | Platform | URL |
|---|---|---|
| **Frontend Application** | Vercel | [https://social-media-marketplace-five.vercel.app](https://social-media-marketplace-five.vercel.app) |
| **Backend API Service** | Railway | [https://social-media-marketplace.up.railway.app/api](https://social-media-marketplace.up.railway.app/api) |
| **API Health Check** | Railway | [https://social-media-marketplace.up.railway.app/health](https://social-media-marketplace.up.railway.app/health) |
| **Socket.io Service** | Railway | `wss://social-media-marketplace.up.railway.app` |

---

## 🌟 Overview & Architecture

The **Social Media & Community Marketplace Backend** manages user identity, engagement feeds, multimedia content, peer-to-peer marketplace transactions, price negotiations, direct messaging, real-time notifications, and platform administration.

It is structured around clean separation of concerns:
- **`routes/`**: Route definitions and endpoint mappings.
- **`controllers/`**: Request orchestration and response formatting.
- **`services/`**: Business logic, database aggregation, third-party integrations (Cloudinary, Stripe, Nodemailer).
- **`models/`**: Mongoose schemas with indexed querying, pre/post hooks, and virtuals.
- **`middleware/`**: JWT authentication, role-based access control (RBAC), Zod request validation, rate limiting, and centralized error handling.
- **`validators/`**: Strict Zod schema declarations.
- **`config/`**: Environment parsing, database connectivity, and Socket.io setup.

---

## 🚀 Key Features

### 1. Authentication & Security
- **JWT Authentication**: Short-lived access tokens with secure HTTP-only refresh tokens.
- **Session Hint Cookie (`hasSession`)**: Non-sensitive client hint cookie to prevent unauthenticated refresh spam.
- **Password Management**: Secure hashing with `bcrypt` (12 rounds) and cryptographic password reset flow.
- **Transactional Emails**: Welcome emails and password reset links powered by `nodemailer`.

### 2. Social Media Ecosystem
- **Post Management**: Rich multimedia posts (up to 10 images via Cloudinary) with categories and tags.
- **Threaded Discussions**: Nested comment replies with real-time updates.
- **Social Engagement**: Single-click likes, bookmarking/saving posts, and follow/unfollow system.
- **Smart Personalized Feed**: High-performance follow-based timeline utilizing compound MongoDB indexing (`{ author: 1, status: 1, createdAt: -1 }`).

### 3. Peer-to-Peer Marketplace & Payments
- **Marketplace Listings**: Posts equipped with direct pricing for instant buying or negotiation.
- **Real-Time Offers & Negotiation**: Bidirectional offer creation, counter-offers, acceptance, and rejection workflow.
- **Stripe Checkout**: Native Stripe `PaymentIntent` integration with verified raw webhook reconciliation (`/api/payments/webhook`).

### 4. Real-Time Chat & Live Notifications
- **Direct Messaging**: 1-on-1 private conversation channels with live typing indicators.
- **Live Notifications**: Instant alerts for follows, comments, likes, offers, and payment status transitions.
- **Celebrity Fan-Out Protection**: Hybrid push/pull architecture ensuring real-time responsiveness without fan-out write amplification.

### 5. Administrative Control & Moderation
- **Moderation Tools**: Post status toggling (`active`, `hidden`, `flagged`), user moderation (`active`, `suspended`, `banned`).
- **Audit Logging**: Comprehensive admin action logging with immutable tracking.
- **Category & Report Management**: Category taxonomy control and user reporting triage.

---

## 🛠 Tech Stack

| Domain | Technology |
|---|---|
| **Runtime & Framework** | Node.js (ES Modules), Express.js (v4.22) |
| **Database** | MongoDB Atlas with Mongoose ODM (v9.9) |
| **Real-Time Engine** | Socket.io (v4.8) |
| **Payment Gateway** | Stripe SDK (v22.5) |
| **Media Management** | Cloudinary SDK (v2.10), Multer (v2.2) |
| **Email Service** | Nodemailer (v9.0) |
| **Validation** | Zod (v4.4) |
| **Security & Middleware** | Helmet, CORS, Express Rate Limit, Cookie Parser, Morgan |
| **Testing & Tooling** | Jest, Supertest, Nodemon, Faker.js |

---

## 🏗 System Architecture & Hybrid Real-Time Design

```
[ Frontend Client (React SPA) ]
      │                     ▲
      │ HTTP (REST)         │ WebSocket (Socket.io)
      ▼                     │
[ Express.js API ] ─────────┼───────► [ Socket.io Server ]
      │                     │                ▲
      ├─► Zod Validation     │                │ Event Emitters
      ├─► Auth Middleware   │                │
      ▼                     │                │
[ Domain Controllers ] ─────┴────────────────┘
      │
      ├─► [ MongoDB Database (Mongoose) ]
      ├─► [ Cloudinary Media CDN ]
      ├─► [ Stripe API & Webhooks ]
      └─► [ SMTP / Nodemailer ]
```

---

## 📁 Project Directory Structure

```
Social Media and Community Marketplace Backend/
├── src/
│   ├── config/             # DB, Environment variables, Socket.io initialization
│   ├── controllers/        # Request handlers (auth, post, payment, offer, admin, etc.)
│   ├── middleware/         # Auth, RBAC, error handling, rate limiting, file upload
│   ├── models/             # Mongoose schemas & indexes (18 entities)
│   ├── routes/             # Express routers and endpoint definitions
│   ├── scripts/            # Database seeders (seed.js)
│   ├── services/           # Business services (feed, notification, payment, email, cloudinary)
│   ├── utils/              # AppError, JWT generators, pagination helpers
│   ├── validators/         # Zod schemas for payload validation
│   ├── app.js              # Express app setup & middleware pipeline
│   └── server.js           # HTTP & Socket.io server bootstrap
├── tests/                  # Integration & unit test suites (Jest + Supertest)
├── .env.example            # Template for environment variables
├── package.json
└── README.md
```

---

## 💾 Database Models

The backend features 18 data models:

1. **`User`**: Core user accounts, auth credentials, profile info, status (`active`/`suspended`/`banned`), roles (`user`/`admin`).
2. **`Post`**: Social posts and marketplace listings (title, content, media, price, tags, category, status).
3. **`Comment`**: Threaded comments supporting parent-child reply relationships.
4. **`Like`**: Polymorphic engagement record for posts and comments.
5. **`Follow`**: Bidirectional user follower/following relationships.
6. **`SavedPost`**: Bookmarked/saved posts per user.
7. **`Conversation`**: 1-on-1 private messaging channels between participants.
8. **`Message`**: Real-time chat messages with text, attachments, edit/delete state.
9. **`Offer`**: Formal marketplace negotiation records (`pending`, `accepted`, `rejected`, `countered`).
10. **`Payment`**: Stripe PaymentIntent audit records, pricing breakdown, and fulfillment status.
11. **`Notification`**: Polymorphic in-app alert records.
12. **`Report`**: Content moderation reports against posts, comments, or users.
13. **`Category`**: Taxonomy categories for content indexing.
14. **`AuditLog`**: Immutable admin actions log.
15. **`File`**: Cloudinary asset metadata tracker.
16. **`RefreshToken`**: Opaque server-side stored tokens for secure session refresh.
17. **`EmailVerificationToken`**: One-time email verification tokens.
18. **`PasswordResetToken`**: Cryptographic password reset tokens.

---

## 📡 API Endpoints Reference

Base URL: `/api`

### 1. Authentication (`/api/auth`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/register` | Public | Register new user, send welcome email & issue tokens |
| `POST` | `/login` | Public (Rate limited) | Authenticate user, return access token & set refresh cookie |
| `POST` | `/refresh-token` | Public | Rotate refresh token and issue new access token |
| `POST` | `/logout` | Public | Invalidate refresh token and clear auth cookies |
| `POST` | `/forgot-password` | Public (Rate limited) | Request password reset email |
| `POST` | `/reset-password/:token`| Public | Reset password with token |
| `GET`  | `/me` | Authenticated | Retrieve authenticated user profile |

### 2. Posts & Social (`/api/posts`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET`    | `/` | Public | Paginated post discovery with filters, tags & search |
| `POST`   | `/` | Authenticated | Create a new post or marketplace listing |
| `GET`    | `/:id` | Public | Get single post details |
| `PATCH`  | `/:id` | Authenticated (Owner) | Update post contents / price |
| `DELETE` | `/:id` | Authenticated (Owner) | Delete post (cascades likes/comments) |
| `POST`   | `/:id/like` | Authenticated | Like a post |
| `DELETE` | `/:id/like` | Authenticated | Unlike a post |
| `GET`    | `/:id/likes` | Public | Get users who liked post |
| `POST`   | `/:id/save` | Authenticated | Bookmark post |
| `DELETE` | `/:id/save` | Authenticated | Remove bookmark |
| `POST`   | `/:postId/comments` | Authenticated | Post comment / reply |
| `GET`    | `/:postId/comments` | Public | Fetch comments tree |

### 3. Users & Relationships (`/api/users`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET`    | `/me/feed` | Authenticated | Get personalized follow feed |
| `GET`    | `/me/saved-posts` | Authenticated | Get bookmarked posts |
| `PATCH`  | `/me` | Authenticated | Update user profile details |
| `PATCH`  | `/me/password` | Authenticated | Change account password |
| `POST`   | `/:id/follow` | Authenticated | Follow user |
| `DELETE` | `/:id/follow` | Authenticated | Unfollow user |
| `GET`    | `/:id/followers` | Public | List followers |
| `GET`    | `/:id/following` | Public | List following |

### 4. Marketplace Offers & Payments (`/api/offers`, `/api/payments`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST`  | `/offers` | Authenticated | Create negotiation offer |
| `PATCH` | `/offers/:id` | Authenticated | Accept, reject, or counter offer |
| `POST`  | `/payments/create-intent` | Authenticated | Create Stripe PaymentIntent for purchase |
| `GET`   | `/payments/me` | Authenticated | Retrieve user payment transaction history |
| `POST`  | `/payments/webhook` | Stripe Only | Stripe webhook handler (raw payload) |

### 5. Chat & Conversations (`/api/conversations`, `/api/messages`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET`  | `/conversations` | Authenticated | List user conversation threads |
| `POST` | `/conversations` | Authenticated | Create or fetch conversation thread |
| `GET`  | `/conversations/:id/messages` | Authenticated | Fetch paginated chat history |
| `PATCH`| `/messages/:id` | Authenticated (Author) | Edit message |
| `DELETE`| `/messages/:id` | Authenticated (Author) | Delete message |

### 6. Media Uploads & Admin (`/api/uploads`, `/api/admin`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/uploads` | Authenticated | Upload media to Cloudinary |
| `GET`  | `/admin/overview` | Admin Only | Analytics dashboard KPIs & metrics |
| `GET`  | `/admin/users` | Admin Only | Paginated user management table |
| `PATCH`| `/admin/users/:id/status` | Admin Only | Moderate user status (ban/suspend/active) |
| `PATCH`| `/admin/posts/:id/status` | Admin Only | Moderate post status (flag/hide/active) |

---

## ⚡ Real-Time Socket.io Events

### Client ➔ Server
- `join_conversation`: Join a specific conversation room `{ conversationId }`.
- `leave_conversation`: Leave a conversation room `{ conversationId }`.
- `send_message`: Dispatch chat message `{ conversationId, body, media }`.
- `typing_message` / `stop_typing_message`: Live typing status broadcast.
- `join_post_room` / `leave_post_room`: Subscribe to post-level live comment/like streams.
- `register_following_rooms`: Subscribe to live feed update signals from followed authors.

### Server ➔ Client
- `receive_message`: Incoming message in conversation.
- `message_edited` / `message_deleted`: Live chat synchronization.
- `typing_message` / `stop_typing_message`: Other participant typing status.
- `notification_created`: Push notification payload.
- `like_broadcast`: Live like counter updates `{ postId, likesCount, isLiked }`.
- `comment_broadcast`: Live comment counter updates `{ postId, commentsCount }`.
- `new_comment` / `comment_updated` / `comment_deleted`: Real-time comments stream.
- `offer_created` / `offer_updated`: Live marketplace negotiation updates.
- `payment_updated`: Live payment intent status changes.

---

## 🔒 Security & Performance Engineering

- **Handshake-Level Authentication**: Socket.io connections are strictly authenticated via JWT during handshake.
- **Defense in Depth**: Helmet HTTP headers, CORS validation whitelist, and payload caps.
- **Granular Rate Limiting**: Targeted limits on auth endpoints, password resets, and user reports.
- **MongoDB Index Optimization**:
  - Compound feed index: `{ author: 1, status: 1, createdAt: -1 }`
  - Unique compound follow index: `{ follower: 1, following: 1 }`
  - Polymorphic unique like index: `{ user: 1, post: 1 }`
  - Full-text search index on Posts: `{ title: 'text', content: 'text', tags: 'text' }`

---

## 🧪 Testing & Seeding

### Run Automated Tests
```bash
npm test
```
Runs 15 test suites with Jest and Supertest covering all controllers and middlewares.

### Seed Database
```bash
# Seed with realistic mock users, posts, categories, comments, and offers
npm run seed

# Clean existing collection and re-seed
npm run seed:clean
```

---

## 🚢 Deployment & Access

The platform is deployed live across cloud infrastructure:

### Backend Services (Railway)
- **REST API Base**: [`https://social-media-marketplace.up.railway.app/api`](https://social-media-marketplace.up.railway.app/api)
- **Health Check**: [`https://social-media-marketplace.up.railway.app/health`](https://social-media-marketplace.up.railway.app/health)
- **Real-Time WebSocket**: `wss://social-media-marketplace.up.railway.app/socket.io/`

### Frontend Application (Vercel)
- **Live URL**: [`https://social-media-marketplace-five.vercel.app`](https://social-media-marketplace-five.vercel.app)
- **Stripe Webhook Listener**: Registered at `https://social-media-marketplace.up.railway.app/api/payments/webhook`

