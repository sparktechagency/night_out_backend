import { Request, Response, NextFunction } from "express";
import Bar from "@models/barModels";
import { StatusCodes } from "http-status-codes";
import createError from "http-errors";
import { fetchNearbyVenues, buildBarObject } from "@services/barServices";
import Favorite from "@models/favoriteModel";

const home = async (req: Request, res: Response, next: NextFunction): Promise<Response> => {
  const userId = req.user.userId;
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 10;
  const radius = 3000;
  const skip = (page - 1) * limit;

  if (!lat || !lng) {
    throw createError(StatusCodes.BAD_REQUEST, "Latitude and longitude are required.");
  }

  const venues = await fetchNearbyVenues(lat, lng, radius);

  // Bulk query for bars that already exist
  const placeIds = venues.map(venue => venue.place_id);
  const existingBars = await Bar.find({ placeId: { $in: placeIds } });

  // Create a map of placeId to existing bar for fast lookups
  const existingBarsMap = new Map(existingBars.map(bar => [bar.placeId, bar]));

  const newBarsPromises = venues.map(async (venue) => {
    const existingBar = existingBarsMap.get(venue.place_id);

    if (existingBar) {
      return existingBar;
    } else {
      const newBarData = await buildBarObject(venue, lat, lng);
      const newBar = new Bar(newBarData);
      await newBar.save();
      return newBar;
    }
  });

  // Wait for all the bars to be processed (both existing and new ones)
  const resultBars = await Promise.all(newBarsPromises);

  const sortedBars = resultBars.sort((a, b) => {
    if (b.total_reviewer !== a.total_reviewer) {
      return b.total_reviewer - a.total_reviewer;
    }
    return b.average_rating - a.average_rating;
  });

  // Date formatting logic
  const now = new Date();
  const weekday = now.toLocaleString('en-US', { weekday: 'short' });
  const formattedDate = now.toLocaleString('en-US', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
  const currentDay = weekday;

  // Process bars to add current date and close time
  sortedBars.forEach((bar: any) => {
    bar.currentDate = formattedDate;
    const todaySchedule = bar.about.schedule?.find((schedule: { day: string }) => schedule.day.toLowerCase() === currentDay.toLowerCase());
    bar.closeTime = todaySchedule?.time?.split("–")[1]?.trim() || "";
  });

  // Extract the top 4 bars
  const topBars = sortedBars.slice(0, 4).map((bar: any) => ({
    _id: bar.id,
    cover: bar.cover,
    barType: bar.barType,
    name: bar.name,
    crowdMeter: bar.crowdMeter,
    currentDate: bar.currentDate,
    closeTime: bar.closeTime,
  }));

  // Parallel fetch for favorites for remaining bars
  const remainingBars = sortedBars.slice(4);
  const barsPromises = remainingBars.map(async (bar: any) => {
    const favoriteEntry = await Favorite.findOne({ user: userId, bar: bar.id });
    return {
      _id: bar.id,
      gallery: [bar.cover, ...bar.gallery],
      barType: bar.barType,
      name: bar.name,
      address: bar.about.address.placeName,
      currentDate: bar.currentDate,
      time: bar.about.schedule[0]?.time || "",
      isFavorite: !!favoriteEntry,
    };
  });

  // Wait for all favorite checks to complete
  const bars = await Promise.all(barsPromises);

  // Paginate bars based on skip and limit
  const paginatedBars = bars.slice(skip, skip + limit);
  const total = bars.length;
  const totalPages = Math.ceil(total / limit);

  // Return the final response
  return res.status(StatusCodes.OK).json({
    success: true,
    message: "Bars retrieved successfully.",
    data: {
      top: topBars,
      bars: paginatedBars,
    },
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
  });
};

const HomeController = {
  home,
};
export default HomeController;
