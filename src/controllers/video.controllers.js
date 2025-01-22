import mongoose, { isValidObjectId } from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Video } from "../models/video.models.js";
import {
    deleteFromCloudinary,
    uploadOnCloudinary,
} from "../utils/cloudinary.js";

const getAllVideos = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;

    const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sort: { [sortBy]: sortType },
    };

    if (!page || !limit) {
        throw new ApiError(
            400,
            "Please provide page and limit query parameters"
        );
    }

    if (!userId) {
        throw new ApiError(400, "User ID is not valid");
    }

    const videos = await Video.aggregate([
        // 1st Stage : Filter Documents
        {
            $match: {
                $or: [
                    {
                        title: {
                            $regex: query,
                            $options: "i",
                        },
                    },
                ],
                owner: new mongoose.Types.ObjectId(userId),
            },
        },
        // 2nd Stage : Pagination - Skip documents
        {
            $skip: (options.page - 1) * options.limit,
        },
        // 3rd Stage : Limit Pagination
        {
            $limit: options.limit,
        },
        // 4th Stage : Sort results
        {
            $sort: options.sort,
        },
    ]);

    const totalVideos = await Video.countDocuments({
        owner: userId,
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                videos,
                currentPage: options.page,
                totalPages: Math.ceil(totalVideos / options.limit),
                totalVideos,
            },
            "Videos Fetched successfully"
        )
    );
});

const publishAVideo = asyncHandler(async (req, res) => {
    const { title, thumbnail, description } = req.body;

    if (!title || !description) {
        throw new ApiError(400, "Title and description are required");
    }

    const existedVideo = await Video.findOne({title});

    if (existedVideo) {
        throw new ApiError(409, "Video already exist");
    }

    console.warn(req.files);
    const videoLocalPath = req.files?.video?.[0]?.path;
    const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path;

    if (!videoLocalPath) {
        throw new ApiError(400, "Video file is missing");
    }

    if (!thumbnailLocalPath) {
        throw new ApiError(400, "Thumbnail file is missing");
    }

    let videoFile;
    try {
        videoFile = await uploadOnCloudinary(videoLocalPath);
        console.log("Uploaded Video: ", videoFile);
    } catch (error) {
        console.log("Error uploading video", error);
        throw new ApiError(500, "Failed to upload video");
    }

    let thumbnailFile;
    try {
        thumbnailFile = await uploadOnCloudinary(thumbnailLocalPath);
    } catch (error) {
        throw new ApiError(500, "Failed to upload thumbnail");
    }

    try {
        const video = await Video.create({
            title,
            description,
            videoUrl: videoFile?.url,
            videoPublicId: videoFile?.public_id,
            thumbnailUrl: thumbnailFile?.url,
            thumbnailPublicId: thumbnailFile?.public_id,
            owner: req.user?._id,
        });

        const createdVideo = await Video.findById(video._id).populate(
            "owner",
            "username email fullname avatar"
        );

        if (!createdVideo) {
            throw new ApiError(
                500,
                "Something went wrong while creating video doc"
            );
        }
        return res
            .status(201)
            .json(
                new ApiResponse(
                    201,
                    createdVideo,
                    "Video uploaded successfully"
                )
            );
    } catch (error) {
        throw new ApiError(
            500,
            error?.message || "Error creating video document"
        );
    }
});

const getVideoById = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!videoId) {
        throw new ApiError(400, "Video ID is required");
    }

    const video = await Video.findById(videoId)
        .populate("owner", "username fullName avatar") // Populates user details
        .populate("comments");

    return res
        .status(200)
        .json(new ApiResponse(200, video, "Video fetched sucessfully"));
});

const updateVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const { title, description } = req.body;

    if (!videoId) {
        throw new ApiError(400, "Video ID is required");
    }

    const existingVideo = await Video.findById(videoId);

    if (!existingVideo) {
        throw new ApiError(404, "Video not found");
    }

    const video = await Video.findByIdAndUpdate(
        videoId,
        {
            $set: {
                title,
                description,
            },
        },
        { new: true }
    )
        .populate("owner", "username fullName avatar")
        .populate("comments");

    return res.status(200).json(new ApiResponse(200, video, "Video updated"));
});

const deleteVideo = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!videoId) {
        throw new ApiError(401, "Video not found");
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(401, "Video not found");
    }

    if (video.owner.toString() !== req.user?._id) {
        throw new ApiError(403, "Unauthorized - You can't delete this video");
    }

    try {
        await Promise.all([
            deleteFromCloudinary(video.videoPublicId),
            deleteFromCloudinary(video.thumbnailPublicId),
            Video.findByIdAndDelete(videoId),
        ]);

        console.log(`Video ${videoId} deleted by user ${req.user._id}`);

        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Video deleted successfully"));
    } catch (error) {
        console.error(`Failed to delete video ${videoId}:`, error);
        throw new ApiError(500, "Failed to delete video resources");
    }
});

const togglePublishStatus = asyncHandler(async (req, res) => {
    const { videoId } = req.params;

    if (!videoId) {
        throw new ApiError(400, "VideoId is required");
    }

    const video = await Video.findById(videoId);

    if (!video) {
        throw new ApiError(404, "Video not found");
    }

    if (video.owner.toString() !== req.user?._id) {
        throw new ApiError(403, "Unauthorized - You can't modify this video");
    }

    const updatedVideo = await Video.findByIdAndUpdate(
        videoId,
        {
            $set: {
                isPublished: !video.isPublished,
            },
        },
        { new: true }
    );

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                updatedVideo,
                `Video ${updatedVideo.isPublished ? "published" : "unpublished"} successfully`
            )
        );
});

export {
    getAllVideos,
    publishAVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus,
};
