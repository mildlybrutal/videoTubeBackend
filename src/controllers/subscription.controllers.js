import mongoose, { isValidObjectId } from "mongoose";
import { User } from "../models/user.models.js";
import { Subscription } from "../models/subscription.models.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const toggleSubscription = asyncHandler(async (req, res) => {
    const { channelId } = req.params;
    // TODO: toggle subscription
    if (!isValidObjectId(channelId)) {
        throw new ApiError(401, "channelId does not exists");
    }

    const channel = await User.findById(channelId);
    if (!channel) {
        throw new ApiError(401, "Channel does not exists");
    }

    const subscriptionExists = await Subscription.findOne({
        channel: channelId,
        subscriber: req.user._id,
    });

    if (subscriptionExists) {
        await Subscription.deleteOne({ _id: subscriptionExists._id });
        return res
            .status(200)
            .json(
                new ApiResponse(200, {}, "Subscription removed successfully")
            );
    } else {
        await Subscription.create({
            channel: channelId,
            subscriber: req.user._id,
        });
        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Subscription added successfully"));
    }
});

// controller to return subscriber list of a channel
const getUserChannelSubscribers = asyncHandler(async (req, res) => {
    const { channelId } = req.params;

    const channel = await User.findById(channelId);
    if (!channel) {
        throw new ApiError(401, "Channel does not exists");
    }

    const subscribers = await Subscription.find({ channel: channelId });

    if (!subscribers) {
        throw new ApiError(401, "No subscribers found");
    }

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                subscribers,
                "Subscribers fetched successfully"
            )
        );
});

// controller to return channel list to which user has subscribed
const getSubscribedChannels = asyncHandler(async (req, res) => {
    const { subscriberId } = req.params;
    const subscriber = await User.findById(subscriberId);
    if (!subscriber) {
        throw new ApiError(401, "Subscriber does not exists");
    }

    const channels = await Subscription.find({ subscriber: subscriberId });

    if (!channels) {
        throw new ApiError(401, "No channels found");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, channels, "Channels fetched successfully"));
});

export { toggleSubscription, getUserChannelSubscribers, getSubscribedChannels };
