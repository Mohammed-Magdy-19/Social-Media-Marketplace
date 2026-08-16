// src/routes/offer.routes.js
// Negotiation offer routes — /api/conversations/:conversationId/offers/*
// Mounted with { mergeParams: true } so :conversationId (set by the
// parent router in conversation.routes.js) is available here, the same
// pattern message.routes.js already uses. `protect` is applied once by
// conversation.routes.js before this sub-router is mounted, so every
// route below already requires an authenticated participant — it is not
// re-applied here.
//
// Hybrid: REST persists each offer; a lightweight Socket.io broadcast
// (offer_created / offer_updated) to the conversation room is emitted
// from offer.controller.js, not wired here — see the controller's
// header comment for the full reasoning.

import { Router } from 'express';

import { createOffer, getOffers, respondToOffer } from '../controllers/offer.controller.js';
import { validate } from '../middleware/validate.middleware.js';
import { createOfferSchema, respondOfferSchema } from '../validators/offer.validator.js';

const router = Router({ mergeParams: true });

// POST /api/conversations/:conversationId/offers — open a new negotiation
router.post('/', validate(createOfferSchema), createOffer);

// GET /api/conversations/:conversationId/offers — full offer history, oldest first
router.get('/', getOffers);

// PATCH /api/conversations/:conversationId/offers/:offerId — accept / reject / counter
router.patch('/:offerId', validate(respondOfferSchema), respondToOffer);

export default router;