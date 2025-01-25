import mongoose, { isValidObjectId } from "mongoose";
import { Like } from "../models/like.models.js";
import { Comment } from "../models/comment.models.js";
import { Video } from "../models/video.models.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const toggleVideoLike = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
        throw new ApiError(401, "Invalid videoId");
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(401, "Video does not exists");
    }

    const likeExists = await Like.findOne({
        video: videoId, // video reference
        likedBy: req.user._id, // user reference
    });

    if (likeExists) {
        // Remove like
        await Like.deleteOne({ _id: likeExists._id });
        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Video unliked successfully"));
    } else {
        // Create new like
        await Like.create({
            video: videoId,
            likedBy: req.user._id,
        });
        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Video liked successfully"));
    }
});

const toggleCommentLike = asyncHandler(async (req, res) => {
    const { commentId } = req.params;

    if (!isValidObjectId(commentId)) {
        throw new ApiError(401, "commentId not found");
    }

    const comment = await Comment.findById(commentId);
    if (!comment) {
        throw new ApiError(401, "comment not found");
    }

    const commentLikeExists = await Like.findOne({
        comment: commentId,
        commentBy: req.user._id,
    });

    if (commentLikeExists) {
        await Like.deleteOne({ _id: commentLikeExists._id });

        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Comment unliked successfully"));
    } else {
        await Like.create({
            comment: commentId,
            commentBy: req.user._id,
        });

        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Comment liked sucessfully"));
    }
});

const toggleTweetLike = asyncHandler(async (req, res) => {
    const { tweetId } = req.params;

    if (!isValidObjectId(tweetId)) {
        throw new ApiError(401, "tweetId not found");
    }

    const tweet = await Like.findById(tweetId);

    if (!tweet) {
        throw new ApiError(401, "tweet not found");
    }

    const tweetLikeExists = await Like.findOne({
        tweet: tweetId,
        tweetBy: req.user._id,
    });

    if (tweetLikeExists) {
        await Like.deleteOne({ _id: tweetLikeExists._id });

        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Tweet unliked successfully"));
    } else {
        await Like.create({
            tweet: tweetId,
            tweetBy: req.user._id,
        });

        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Tweet liked sucessfully"));
    }
});

const getLikedVideos = asyncHandler(async (req, res) => {
    //TODO: get all liked videos
    const likedVideos = await Like.find({
        video: { $exists: true },
        likedBy: req.user._id,
    })
        .populate({
            path: "video",
            select: "title description thumbnail views duration",
        })
        .populate({
            path: "video",
            populate: {
                path: "owner",
                select: "username fullName avatar",
            },
        });

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                likedVideos,
                "Liked videos fetched successfully"
            )
        );
});

export { toggleCommentLike, toggleTweetLike, toggleVideoLike, getLikedVideos };
