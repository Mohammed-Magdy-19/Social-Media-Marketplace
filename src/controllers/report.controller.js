import asyncHandler from 'express-async-handler';
import mongoose from "mongoose";
import Report from "../models/Report.js";
import AuditLog from "../models/AuditLog.js";
import AppError from "../utils/AppError.js";
import { getPagination, buildPaginatedResponse } from "../utils/paginate.js";

/**
 * report.controller.js
 * -----------------------------------------------------------------------
 * §2.11 — POST is open to any logged-in user (a safety-critical
 * data-intake action); GET / PATCH / DELETE are all [Admin]-gated by
 * restrictTo('admin') at the route layer. Every status-changing action
 * here also writes an AuditLog entry, matching the schema's
 * REPORT_RESOLVE / REPORT_DISMISS action enum, so moderation decisions
 * are traceable to the admin who made them.
 * -----------------------------------------------------------------------
 */

// Maps a Report's polymorphic targetType to the registered Mongoose model
// name that owns it. Using mongoose.model(name) here (rather than a
// direct import of Post.js / Comment.js / User.js) keeps this controller
// decoupled from those schemas' internals — it only ever needs a
// generic findById on whichever collection is relevant.
const TARGET_MODEL_MAP = {
    post: "Post",
    comment: "Comment",
    user: "User",
};

/**
 * POST /api/reports
 * Any logged-in user can flag a post, comment, or profile.
 *
 * Body: { targetType: "post"|"comment"|"user", targetId: string, reason: string }
 */
export const createReport = asyncHandler(async (req, res) => {
    const { targetType, targetId, reason } = req.body;

    if (!TARGET_MODEL_MAP[targetType]) {
        throw new AppError("targetType must be one of: post, comment, user.", 400);
    }

    // Confirm the flagged content actually exists before opening a
    // moderation ticket for it — avoids a queue full of dead references.
    const TargetModel = mongoose.model(TARGET_MODEL_MAP[targetType]);
    const targetExists = await TargetModel.exists({ _id: targetId });
    if (!targetExists) {
        throw new AppError(`No ${targetType} found with that ID.`, 404);
    }

    const report = await Report.create({
        reporter: req.user.id,
        targetType,
        targetId,
        reason,
        status: "pending",
    });

    res.status(201).json({ status: "success", data: { report } });
});

/**
 * GET /api/reports
 * [Admin] Lists filed reports for the moderation queue, newest-first,
 * populated with the reporter. Supports filtering by status so staff
 * can focus on ?status=pending.
 */
export const getReports = asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req.query);
    const { status } = req.query;

    const filter = {};
    if (status) filter.status = status;

    const reports = await Report.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit + 1)
        .populate("reporter", "username avatar")
        .populate("resolvedBy", "username")
        .lean();

    res.status(200).json(buildPaginatedResponse(reports, page, limit));
});

/**
 * PATCH /api/reports/:id
 * [Admin] Updates a report's status (reviewed, dismissed, resolved) and
 * resolution notes. Writes a matching AuditLog entry for accountability.
 *
 * Body: { status: "reviewed"|"dismissed"|"resolved", resolutionNotes?: string }
 */
export const updateReportStatus = asyncHandler(async (req, res) => {
    const { status, resolutionNotes } = req.body;
    const allowedStatuses = ["pending", "reviewed", "dismissed", "resolved"];

    if (!allowedStatuses.includes(status)) {
        throw new AppError(`status must be one of: ${allowedStatuses.join(", ")}.`, 400);
    }

    const report = await Report.findById(req.params.id);
    if (!report) {
        throw new AppError("Report not found.", 404);
    }

    report.status = status;
    if (resolutionNotes !== undefined) report.resolutionNotes = resolutionNotes;

    if (status === "resolved" || status === "dismissed") {
        report.resolvedBy = req.user.id;
        report.resolvedAt = new Date();
    }

    await report.save();

    // Only write an audit entry for the two decisions the schema tracks
    // (REPORT_RESOLVE / REPORT_DISMISS) — moving to "reviewed" is a
    // lightweight triage step, not a final moderation decision.
    if (status === "resolved" || status === "dismissed") {
        await AuditLog.create({
            actor: req.user.id,
            action: status === "resolved" ? "REPORT_RESOLVE" : "REPORT_DISMISS",
            targetType: "report",
            targetId: report._id,
            details: { resolutionNotes: report.resolutionNotes, reportTargetType: report.targetType },
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
        });
    }

    res.status(200).json({ status: "success", data: { report } });
});

/**
 * DELETE /api/reports/:id
 * [Admin] Permanently removes a report record, typically for cleanup of
 * duplicate filings against the same target.
 */
export const deleteReport = asyncHandler(async (req, res) => {
    const report = await Report.findById(req.params.id);
    if (!report) {
        throw new AppError("Report not found.", 404);
    }

    await report.deleteOne();

    res.status(200).json({ status: "success", data: null });
});