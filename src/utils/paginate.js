/**
 * Reads page/limit from req.query and returns safe, normalized values
 * plus the Mongoose skip() offset.
 *
 * Usage in a controller:
 *   const { page, limit, skip } = getPagination(req.query);
 *   const posts = await Post.find({...}).sort({ createdAt: -1 }).skip(skip).limit(limit + 1);
 *   res.json(buildPaginatedResponse(posts, page, limit));
 *
 * @param {object} query        - typically req.query
 * @param {number} [defaultLimit=20]
 * @param {number} [maxLimit=50] - hard ceiling so a client can't request limit=100000
 */
export const getPagination = (query = {}, defaultLimit = 20, maxLimit = 50) => {
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const requestedLimit = parseInt(query.limit, 10) || defaultLimit;
    const limit = Math.min(Math.max(requestedLimit, 1), maxLimit);
    const skip = (page - 1) * limit;

    return { page, limit, skip };
};

/**
 * Builds a standardized infinite-scroll response.
 *
 * The trick: fetch `limit + 1` documents in your query. If more than
 * `limit` come back, there's more data waiting, so hasMore is true and
 * the extra document is sliced off before sending the response. This
 * avoids running a separate, expensive countDocuments() query on every
 * single scroll request just to know whether another page exists.
 *
 * @param {Array} results - the array returned from your query (fetched with limit + 1)
 * @param {number} page   - current page number (from getPagination)
 * @param {number} limit  - page size (from getPagination)
 */
export const buildPaginatedResponse = (results = [], page, limit) => {
    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    return {
        status: "success",
        results: data.length,
        data,
        pagination: {
            page,
            limit,
            hasMore,
            nextPage: hasMore ? page + 1 : null,
        },
    };
};

/**
 * Cursor-based alternative for feeds that change frequently (e.g. the
 * home feed or comments under a busy post). Cursor pagination avoids the
 * "skipped or duplicated item" glitch that skip()/limit() can produce
 * when new documents are inserted while a user is actively scrolling.
 *
 * Usage in a controller:
 *   const { cursor, limit } = getCursorParams(req.query);
 *   const filter = { author: { $in: followingIds } };
 *   if (cursor) filter.createdAt = { $lt: new Date(cursor) };
 *   const posts = await Post.find(filter).sort({ createdAt: -1 }).limit(limit + 1);
 *   res.json(buildCursorResponse(posts, limit));
 */
export const getCursorParams = (query = {}, defaultLimit = 20, maxLimit = 50) => {
    const requestedLimit = parseInt(query.limit, 10) || defaultLimit;
    const limit = Math.min(Math.max(requestedLimit, 1), maxLimit);
    const cursor = query.cursor || null; // an ISO date string or a document _id, depending on your sort field

    return { cursor, limit };
};

export const buildCursorResponse = (results = [], limit, cursorField = "createdAt") => {
    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore ? data[data.length - 1][cursorField] : null;

    return {
        status: "success",
        results: data.length,
        data,
        pagination: {
            limit,
            hasMore,
            nextCursor,
        },
    };
};