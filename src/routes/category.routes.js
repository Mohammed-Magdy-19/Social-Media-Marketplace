// src/routes/category.routes.js
// Category routes — /api/categories/* (admin-gated writes, per RBAC)
// All pure HTTP REST — rare, low-frequency structural changes with no
// real-time component (see Backend Architecture Doc, section 2.4).

import { Router } from 'express';

import { createCategory, getCategories, getCategoryById, updateCategory, deleteCategory } from '../controllers/category.controller.js';

import { protect } from '../middleware/auth.middleware.js';
import { restrictTo } from '../middleware/restrictTo.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { createCategorySchema, updateCategorySchema } from '../validators/category.validator.js';

const router = Router();

// POST /api/categories [Admin] — create a category (auto-generates slug)
router.post(
    '/',
    protect,
    restrictTo('admin'),
    validate(createCategorySchema),
    createCategory
);

// GET /api/categories — public list, powers dropdowns and browse grids
router.get('/', getCategories);

// GET /api/categories/:id — one category's landing-page details
router.get('/:id', getCategoryById);

// PATCH /api/categories/:id [Admin] — partial update
router.patch(
    '/:id',
    protect,
    restrictTo('admin'),
    validate(updateCategorySchema),
    updateCategory
);

// DELETE /api/categories/:id [Admin] — delete/cascade/reassign affected posts
router.delete('/:id', protect, restrictTo('admin'), deleteCategory);

export default router;