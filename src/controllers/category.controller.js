import asyncHandler from 'express-async-handler';
import Category from '../models/Category.js';
import Post from '../models/Post.js';
import AppError from '../utils/AppError.js';
import { slugify } from '../utils/slugify.js';

/**
 * category.controller.js
 * -----------------------------------------------------------------------
 * Handles the Category module (doc §2.4). Reads are public; writes are
 * gated behind the restrictTo('admin') middleware at the route level.
 * -----------------------------------------------------------------------
 */

/**
 * POST /api/categories [Admin]
 * Creates a category, auto-generates a URL-friendly slug, and records
 * the creating admin's ID.
 */
export const createCategory = asyncHandler(async (req, res) => {
    const { name, description } = req.body;

    if (!name) {
        throw new AppError('Category name is required.', 400);
    }

    const existing = await Category.findOne({ name: name.trim() });
    if (existing) {
        throw new AppError('A category with this name already exists.', 409);
    }

    const category = await Category.create({
        name,
        description,
        slug: slugify(name),
        createdBy: req.user.id,
    });

    res.status(201).json({
        status: 'success',
        data: { category },
    });
});

/**
 * GET /api/categories
 * Public list of all categories, used to populate dropdowns and browse grids.
 */
export const getCategories = asyncHandler(async (req, res) => {
    const categories = await Category.find()
        .populate('postCount')
        .sort({ name: 1 });

    res.status(200).json({
        status: 'success',
        results: categories.length,
        data: { categories },
    });
});

/**
 * GET /api/categories/:id
 * Returns one category's details for its landing page.
 */
export const getCategoryById = asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id).populate('postCount');

    if (!category) {
        throw new AppError('Category not found.', 404);
    }

    res.status(200).json({
        status: 'success',
        data: { category },
    });
});

/**
 * PATCH /api/categories/:id [Admin]
 * Applies a partial update to a category's fields. Regenerates the slug
 * only when the name actually changes, so existing links stay stable
 * for cosmetic edits like a description tweak.
 */
export const updateCategory = asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id);

    if (!category) {
        throw new AppError('Category not found.', 404);
    }

    const { name, description } = req.body;

    if (name !== undefined && name.trim() !== category.name) {
        category.name = name;
        category.slug = slugify(name);
    }

    if (description !== undefined) {
        category.description = description;
    }

    await category.save();

    res.status(200).json({
        status: 'success',
        data: { category },
    });
});

/**
 * DELETE /api/categories/:id [Admin]
 * Blocks deletion while posts still reference it, keeping every Post
 * document's category field valid rather than silently orphaning it.
 * Reassign or bulk-migrate posts to another category before deleting.
 */
export const deleteCategory = asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id);

    if (!category) {
        throw new AppError('Category not found.', 404);
    }

    const postsUsingCategory = await Post.countDocuments({ category: category._id });

    if (postsUsingCategory > 0) {
        throw new AppError(
            `Cannot delete this category: ${postsUsingCategory} post(s) still reference it. Reassign or delete those posts first.`,
            409
        );
    }

    await category.deleteOne();

    res.status(200).json({
        status: 'success',
        message: 'Category deleted successfully.',
    });
});