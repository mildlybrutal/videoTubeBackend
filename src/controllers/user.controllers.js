import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.models.js";
import {
    deleteFromCloudinary,
    uploadOnCloudinary,
} from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshToken = async (userId) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new ApiError(500, "No user Found");
        }

        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });
        return { accessToken, refreshToken };
    } catch (error) {
        throw new ApiError(
            500,
            "Something went wrong while generating access and refresh tokens"
        );
    }
};

const registerUser = asyncHandler(async (req, res) => {
    const { fullname, email, username, password } = req.body;

    //validation
    if (
        [fullname, username, email, password].some((field) => {
            field?.trim() === "";
        })
    ) {
        throw new ApiError(400, "all fields are required");
    }
    const existedUser = await User.findOne({
        $or: [{ username }, { email }],
    });

    if (existedUser) {
        throw new ApiError(409, "User with these crendential aleady exist");
    }

    console.warn(req.files);
    const avatarLocalPath = req.files?.avatar?.[0]?.path;
    const coverLocalPath = req.files?.coverImage?.[0]?.path;

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing");
    }

    // const avatar = await uploadOnCloudinary(avatarLocalPath);

    // let coverImage = ""; // Empty
    // if (coverLocalPath) {
    //     coverImage = await uploadOnCloudinary(coverLocalPath);
    // }

    let avatar;
    try {
        avatar = await uploadOnCloudinary(avatarLocalPath);
        console.log("Uploaded avatar", avatar);
    } catch (error) {
        console.log("Error uploading avatar", error);
        throw new ApiError(500, "Failed to upload avatar");
    }

    let coverImage;
    try {
        coverImage = await uploadOnCloudinary(coverLocalPath);
        console.log("Uploaded coverImage", coverImage);
    } catch (error) {
        console.log("Error uploading coverImage", error);
        throw new ApiError(500, "Failed to upload coverImage");
    }

    try {
        const user = await User.create({
            fullname,
            avatar: avatar.url,
            coverImage: coverImage?.url || "",
            email,
            password,
            username: username.toLowerCase(),
        });

        const createdUser = await User.findById(user._id).select(
            "-password -refreshToken"
        );

        if (!createdUser) {
            throw new ApiError(
                500,
                "Something went wrong while registering user"
            );
        }

        return res
            .status(201)
            .json(
                new ApiResponse(
                    200,
                    createdUser,
                    "User registered successfully"
                )
            );
    } catch (error) {
        console.log("User creation failed");
        if (avatar) {
            await deleteFromCloudinary(avatar.public_id);
        }
        if (coverImage) {
            await deleteFromCloudinary(coverImage.public_id);
        }
        throw new ApiError(
            500,
            "Something went wrong while registering user and images were deleted"
        );
    }
});

const loginUser = asyncHandler(async (req, res) => {
    // get data from body
    const { email, username, password } = req.body;

    if (!email) {
        throw new ApiError(400, "email is required");
    }
    const user = await User.findOne({
        $or: [{ username }, { email }],
    });

    if (!user) {
        throw new ApiError(404, "user not found");
    }

    // Validate password
    const isPasswordValid = await user.isPasswordCorrect(password);

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid Credentials");
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
        user._id
    );

    const loggedinUser = await user
        .findById(user._id)
        .select("-password -refreshToken");

    if (!loggedinUser) {
        throw new ApiError(404, "User not logged in");
    }

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
    };
    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(200, loggedinUser, "User logged in successfully")
        );
});

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined,
            },
        },
        { new: true }
    );

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
    };
    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User logged out successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken =
        req.cookies.refreshAccessToken || req.body.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Refresh Token is required");
    }

    try {
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH
        );
        const user = await User.findById(decodedToken?._id);

        if (!user) {
            throw new ApiError(401, "Invalid refresh token");
        }

        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token expired");
        }

        const options = {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
        };
        const { accessToken, refreshToken: newRefreshToken } =
            await generateAccessAndRefreshToken(user._id);

        return res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", newRefreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    { accessToken, refreshToken: newRefreshToken },
                    "Access token refreshed successfully"
                )
            );
    } catch (error) {
        console.log("Error generating token", error);
    }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
    // Grab the new and old password
    const { oldPassword, newPassword } = req.body;

    //Find the user
    const user = await User.findById(req.user?._id);

    const isPasswordValid = await user.isPasswordCorrect(oldPassword);

    if (!isPasswordValid) {
        throw ApiError(401, "Old password is incorrect");
    }

    user.password = newPassword;

    user.save({ validateBeforeSave: false });

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(new ApiResponse(200, req.user, "current user details"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
    const { fullname, email } = req.body;

    //validate
    if (!fullname || !email) {
        throw new ApiError(400, "Fullname and email are required");
    }

    // FindById and Update
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullname,
                email: email,
            },
        },
        { new: true }
    ).select("-password -refreshToken");

    return res
        .status(200)
        .json(new ApiResponse(200, user, "Fullname and Password updated"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path;

    if (!avatarLocalPath) {
        throw new ApiError(401, "File is required");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if (!avatar.url) {
        throw new ApiError(500, "Something went wrong while uploading avatar");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url,
            },
        },
        { new: true }
    ).select("-password -refreshToken");

    return res
        .status(200)
        .json(new ApiResponse(200, user, "avatar updated sucessfully"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.file?.path;
    if (!coverImageLocalPath) {
        throw new ApiError(200, "File is required");
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath);

    if (!coverImage) {
        throw new ApiError(
            500,
            "Something went wrong while uploading coverImage"
        );
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url,
            },
        },
        { new: true }
    ).select("-password -refreshToken");

    return res
        .status(200)
        .json(new ApiResponse(200, user, "coverImage updated sucessfully"));
});

const getUserChannelProfile = asyncHandler(async(req,res) => {

})

const getWatchHistory = asyncHandler(async(req,res)=>{
    
})

export {
    registerUser,
    loginUser,
    refreshAccessToken,
    logoutUser,
    changeCurrentPassword,
    getCurrentUser,
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
};
