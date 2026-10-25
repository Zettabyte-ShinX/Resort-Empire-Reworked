extends RefCounted

## Isometric projection matching the original Resort Empire map (notes §11.2).
##
## The original uses a 2:1 projection on a 24 px grid: one tile step moves
## 24 px across and 12 px down, so a tile footprint is a 48 x 24 diamond.
## Tile bitmaps are 50 x 26 cells, which leaves a 1 px margin around the
## diamond for the tile border.

const GRID_SIZE := 37

const TILE_STEP_X := 24.0
const TILE_STEP_Y := 12.0
const TILE_HALF_WIDTH := 24.0
const TILE_HALF_HEIGHT := 12.0

## Original bitmap cell size (diamond plus a 1 px margin on each side).
const TILE_CELL := Vector2i(50, 26)
const TILE_CELL_MARGIN := Vector2i(1, 1)


## Centre of a tile in world (map) space.
static func tile_to_world(tile: Vector2i) -> Vector2:
	return Vector2(
		(tile.x - tile.y) * TILE_STEP_X,
		(tile.x + tile.y) * TILE_STEP_Y
	)


## Tile under a world-space point, including points outside the map.
## The inverse transform puts each diamond's centre on an integer, so round
## to the nearest centre rather than flooring (which would be off by one over
## half of every tile).
static func world_to_tile(world: Vector2) -> Vector2i:
	var x := (world.x / TILE_STEP_X + world.y / TILE_STEP_Y) * 0.5
	var y := (world.y / TILE_STEP_Y - world.x / TILE_STEP_X) * 0.5
	return Vector2i(roundi(x), roundi(y))


static func is_in_bounds(tile: Vector2i, grid_size: int = GRID_SIZE) -> bool:
	return tile.x >= 0 and tile.y >= 0 and tile.x < grid_size and tile.y < grid_size


## The four corners of a tile's diamond in world space, clockwise from north.
static func tile_diamond(tile: Vector2i) -> PackedVector2Array:
	var centre := tile_to_world(tile)
	return PackedVector2Array([
		centre + Vector2(0.0, -TILE_HALF_HEIGHT),
		centre + Vector2(TILE_HALF_WIDTH, 0.0),
		centre + Vector2(0.0, TILE_HALF_HEIGHT),
		centre + Vector2(-TILE_HALF_WIDTH, 0.0),
	])


## Bounding rectangle of the whole grid, including tile edges, in world space.
static func grid_world_bounds(grid_size: int = GRID_SIZE) -> Rect2:
	var last := float(grid_size - 1)
	var min_x := -last * TILE_STEP_X - TILE_HALF_WIDTH
	var max_x := last * TILE_STEP_X + TILE_HALF_WIDTH
	var min_y := -TILE_HALF_HEIGHT
	var max_y := 2.0 * last * TILE_STEP_Y + TILE_HALF_HEIGHT
	return Rect2(min_x, min_y, max_x - min_x, max_y - min_y)
