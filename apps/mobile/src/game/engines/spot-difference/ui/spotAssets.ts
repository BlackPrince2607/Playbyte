/** Bundled flat 2D spot-the-difference scenes (left/right pairs, not remote photos). */
export const SPOT_ASSET_PREFIX = "asset:spot/";

const MODULES: Record<string, number> = {
  shapes_desk_1_left: require("../../../../../assets/spot-pairs/shapes_desk_1_left.jpg"),
  shapes_desk_1_right: require("../../../../../assets/spot-pairs/shapes_desk_1_right.jpg"),
  shapes_kitchen_1_left: require("../../../../../assets/spot-pairs/shapes_kitchen_1_left.jpg"),
  shapes_kitchen_1_right: require("../../../../../assets/spot-pairs/shapes_kitchen_1_right.jpg"),
  shapes_living_1_left: require("../../../../../assets/spot-pairs/shapes_living_1_left.jpg"),
  shapes_living_1_right: require("../../../../../assets/spot-pairs/shapes_living_1_right.jpg"),
  shapes_shelf_1_left: require("../../../../../assets/spot-pairs/shapes_shelf_1_left.jpg"),
  shapes_shelf_1_right: require("../../../../../assets/spot-pairs/shapes_shelf_1_right.jpg"),
  city_skyline_1_left: require("../../../../../assets/spot-pairs/city_skyline_1_left.jpg"),
  city_skyline_1_right: require("../../../../../assets/spot-pairs/city_skyline_1_right.jpg"),
  city_street_1_left: require("../../../../../assets/spot-pairs/city_street_1_left.jpg"),
  city_street_1_right: require("../../../../../assets/spot-pairs/city_street_1_right.jpg"),
  city_night_1_left: require("../../../../../assets/spot-pairs/city_night_1_left.jpg"),
  city_night_1_right: require("../../../../../assets/spot-pairs/city_night_1_right.jpg"),
  city_market_1_left: require("../../../../../assets/spot-pairs/city_market_1_left.jpg"),
  city_market_1_right: require("../../../../../assets/spot-pairs/city_market_1_right.jpg"),
  garden_flowers_1_left: require("../../../../../assets/spot-pairs/garden_flowers_1_left.jpg"),
  garden_flowers_1_right: require("../../../../../assets/spot-pairs/garden_flowers_1_right.jpg"),
  garden_park_1_left: require("../../../../../assets/spot-pairs/garden_park_1_left.jpg"),
  garden_park_1_right: require("../../../../../assets/spot-pairs/garden_park_1_right.jpg"),
  garden_path_1_left: require("../../../../../assets/spot-pairs/garden_path_1_left.jpg"),
  garden_path_1_right: require("../../../../../assets/spot-pairs/garden_path_1_right.jpg"),
  garden_greenhouse_1_left: require("../../../../../assets/spot-pairs/garden_greenhouse_1_left.jpg"),
  garden_greenhouse_1_right: require("../../../../../assets/spot-pairs/garden_greenhouse_1_right.jpg"),
  space_nebula_1_left: require("../../../../../assets/spot-pairs/space_nebula_1_left.jpg"),
  space_nebula_1_right: require("../../../../../assets/spot-pairs/space_nebula_1_right.jpg"),
  space_milky_1_left: require("../../../../../assets/spot-pairs/space_milky_1_left.jpg"),
  space_milky_1_right: require("../../../../../assets/spot-pairs/space_milky_1_right.jpg"),
  space_earth_1_left: require("../../../../../assets/spot-pairs/space_earth_1_left.jpg"),
  space_earth_1_right: require("../../../../../assets/spot-pairs/space_earth_1_right.jpg"),
  space_stars_1_left: require("../../../../../assets/spot-pairs/space_stars_1_left.jpg"),
  space_stars_1_right: require("../../../../../assets/spot-pairs/space_stars_1_right.jpg"),
};

export function spotAssetModule(url: string): number | null {
  if (!url.startsWith(SPOT_ASSET_PREFIX)) return null;
  const key = url.slice(SPOT_ASSET_PREFIX.length);
  return MODULES[key] ?? null;
}
