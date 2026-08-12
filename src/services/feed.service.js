import Post from "../models/Post.js";
import Follow from "../models/Follow.js";
import { getPagination, buildPaginatedResponse } from "../utils/paginate.js";

/**
 * feed.service.js
 * -----------------------------------------------------------------------
 * Powers GET /api/users/me/feed — the system's heaviest read (§2.7) and
 * the "Pull" half of the Celebrity Fan-Out fix described in §2.9 of the
 * architecture doc. Instead of writing a timeline row per follower when
 * a post is created, the feed is computed on demand, in two indexed steps:
 *
 *   1. Collect the IDs of the accounts the current user follows
 *      (Follow.find({ follower: userId })).
 *   2. Query Post.find({ author: { $in: followingIds } }), sorted
 *      newest-first, using the compound index { author: 1, createdAt: -1 }
 *      defined on the Post schema (§1.3) — this makes the $in lookup +
 *      sort fully index-covered instead of an in-memory sort.
 *
 * Pagination follows the project's actual utils/paginate.js convention:
 * fetch `limit + 1` documents and let buildPaginatedResponse() slice off
 * the extra one to derive `hasMore`, avoiding a separate countDocuments()
 * query on every scroll request.
 * -----------------------------------------------------------------------
 */

/**
 * Builds the personalized home timeline for a given user.
 *
 * @param {string|import("mongoose").Types.ObjectId} userId - the requesting (logged-in) user
 * @param {object} query - typically req.query, forwarded straight into getPagination (expects page/limit)
 * @returns {Promise<{
 *   status: string,
 *   results: number,
 *   data: Array<import("mongoose").Document>,
 *   pagination: { page: number, limit: number, hasMore: boolean, nextPage: number|null }
 * }>}
 */
export const getUserFeed = async (userId, query = {}) => {
    const { page, limit, skip } = getPagination(query);

    // Step 1 — who does this user follow?
    // .select('following') + .lean() keeps this a lightweight, index-only
    // read (Follow has a unique compound index on { follower, following }),
    // returning only the field we actually need.
    const followingDocs = await Follow.find({ follower: userId })
        .select("following")
        .lean();

    const followingIds = followingDocs.map((doc) => doc.following);

    // A brand-new user who follows nobody yet gets an empty feed instead of
    // an unnecessary round trip — Mongo would correctly return [] for
    // $in: [] anyway, but short-circuiting here skips the query entirely.
    if (followingIds.length === 0) {
        return buildPaginatedResponse([], page, limit);
    }

    // Step 2 — fetch that timeline, newest first, one extra document so
    // buildPaginatedResponse can detect "hasMore" without a separate count.
    // This query is fully served by the { author: 1, createdAt: -1 }
    // compound index on Post (§1.3): the $in on `author` narrows to the
    // followed authors' index ranges, and `createdAt: -1` is already in
    // sorted order within each range, so MongoDB can merge-sort across
    // them without an in-memory sort stage.
    const posts = await Post.find({ author: { $in: followingIds } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit + 1)
        .populate("author", "username avatar")
        .populate("category", "name slug")
        .lean(); // read-only feed data — skip Mongoose document overhead

    return buildPaginatedResponse(posts, page, limit);
};

export default {
    getUserFeed,
};