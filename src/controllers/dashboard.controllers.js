import mongoose, { isValidObjectId } from "mongoose";
import { Video } from "../models/video.models.js";
import { Subscription } from "../models/subscription.models.js";
import { Like } from "../models/like.models.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const getChannelStats = asyncHandler(async (req, res) => {
    const { channelId } = req.params;

    if (!isValidObjectId(channelId)) {
        throw new ApiError(401, "Invalid channelId");
    }

    const subscription = await Subscription.findById(channelId);
    const totalSubscribers = subscription.length;

    const videos = await Video.find({ channel: channelId });
    const totalVideos = videos.length;

    let totalViews = 0;
    let totalLikes = 0;

    const likes = await Like.find({
        video: { $in: videos.map((video) => video._id) },
    });
    totalLikes = likes.length;

    videos.forEach((video) => {
        totalViews += video.views;
    });

    return res.status(200).json(
        new ApiResponse(200, {
            totalSubscribers,
            totalVideos,
            totalViews,
            totalLikes,
        })
    );
});

const getChannelVideos = asyncHandler(async (req, res) => {
    const { channelId } = req.params;
    if (!isValidObjectId(channelId)) {
        throw new ApiError(401, "Invalid channelId");
    }

    const videos = await Video.find({ channel: channelId });

    return res
        .status(200)
        .json(new ApiResponse(200, videos, "Videos fetched successfully"));
});

export { getChannelStats, getChannelVideos };
