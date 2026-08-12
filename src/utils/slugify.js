/**
 * Converts a string into a URL-friendly slug.
 * e.g. "Smart Phones & Gadgets!" -> "smart-phones-gadgets"
 *
 * Used by category.controller.js when creating/renaming a Category.
 */
export const slugify = (text = "") => {
    return text
        .toString()
        .trim()
        .toLowerCase()
        .normalize("NFKD")                 // split accented chars from their marks
        .replace(/[\u0300-\u036f]/g, "")   // strip the accent marks
        .replace(/[^a-z0-9\s-]/g, "")      // remove anything that isn't a letter, number, space, or hyphen
        .replace(/\s+/g, "-")              // spaces -> hyphens
        .replace(/-+/g, "-")               // collapse multiple hyphens
        .replace(/^-|-$/g, "");            // trim leading/trailing hyphens
};

/**
 * Generates a slug guaranteed to be unique for a given Mongoose model,
 * by appending -1, -2, -3... if the base slug is already taken.
 *
 * Usage in category.controller.js:
 *   const slug = await generateUniqueSlug(Category, req.body.name);
 *   await Category.create({ ...req.body, slug });
 *
 * @param {import("mongoose").Model} Model  - the Mongoose model to check against (e.g. Category)
 * @param {string} text                     - the raw text to slugify (e.g. category name)
 * @param {string} [field="slug"]           - the schema field the slug is stored in
 * @param {string} [excludeId]              - a document _id to exclude from the uniqueness check
 *                                             (pass the current doc's _id when updating, so it
 *                                             doesn't collide with its own existing slug)
 */
export const generateUniqueSlug = async (Model, text, field = "slug", excludeId = null) => {
    const baseSlug = slugify(text);
    let slug = baseSlug;
    let count = 1;

    const query = (candidate) => {
        const filter = { [field]: candidate };
        if (excludeId) filter._id = { $ne: excludeId };
        return Model.exists(filter);
    };

    while (await query(slug)) {
        slug = `${baseSlug}-${count}`;
        count += 1;
    }

    return slug;
};