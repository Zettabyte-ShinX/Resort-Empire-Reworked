class_name IsoGrid
extends Node2D

## Flat isometric grid using the original's projection.
##
## Original (pack/rumus.as, pack/Instance/Tile.as):
##   screen.x = (tile.y - tile.x) * 24
##   screen.y = -(tile.x + tile.y) * 12
##
## The board is translated so tile (18, 18) sits at the world origin. This is
## only a translation; the 24 x 12 lattice and the 48 x 24 diamond shape match
## the original exactly.

const BOARD_SIZE := 37
const STEP := Vector2(24.0, 12.0)
const HALF := Vector2(24.0, 12.0)
const CENTER := 18.0
const INVALID := Vector2i(-1, -1)

const COLOR_A := Color("1b2633")
const COLOR_B := Color("213040")
const COLOR_LINE := Color(0.30, 0.42, 0.50, 0.55)
const COLOR_BORDER := Color(0.32, 0.55, 0.60, 0.90)
const COLOR_HOVER_FILL := Color(0.10, 0.65, 0.58, 0.95)
const COLOR_HOVER_LINE := Color(0.35, 1.0, 0.90, 1.0)
const COLOR_SHADOW := Color(0.035, 0.050, 0.070, 1.0)

var hovered_tile := INVALID


func tile_to_world(tile: Vector2i) -> Vector2:
	return Vector2(
		float(tile.y - tile.x) * STEP.x,
		(2.0 * CENTER - float(tile.x + tile.y)) * STEP.y
	)


func world_to_tile_f(world: Vector2) -> Vector2:
	var u := world.x / STEP.x
	var v := (2.0 * CENTER * STEP.y - world.y) / STEP.y
	return Vector2((v - u) * 0.5, (v + u) * 0.5)


func world_to_tile(world: Vector2) -> Vector2i:
	var fractional := world_to_tile_f(world)
	return Vector2i(roundi(fractional.x), roundi(fractional.y))


func is_inside(tile: Vector2i) -> bool:
	return (
		tile.x >= 0
		and tile.x < BOARD_SIZE
		and tile.y >= 0
		and tile.y < BOARD_SIZE
	)


func board_extent() -> Vector2:
	return Vector2(
		(BOARD_SIZE - 1) * STEP.x + HALF.x,
		(BOARD_SIZE - 1) * STEP.y + HALF.y
	)


func board_rect() -> Rect2:
	var extent := board_extent()
	return Rect2(-extent, extent * 2.0)


func _draw() -> void:
	var extent := board_extent()

	# A slightly larger diamond acts as a soft ground shadow around the board.
	var shadow := PackedVector2Array([
		Vector2(0.0, extent.y + 18.0),
		Vector2(-extent.x - 18.0, 0.0),
		Vector2(0.0, -extent.y - 18.0),
		Vector2(extent.x + 18.0, 0.0),
	])
	draw_colored_polygon(shadow, COLOR_SHADOW)

	for x in BOARD_SIZE:
		for y in BOARD_SIZE:
			var center := tile_to_world(Vector2i(x, y))
			var points := PackedVector2Array([
				center + Vector2(0.0, -HALF.y),
				center + Vector2(HALF.x, 0.0),
				center + Vector2(0.0, HALF.y),
				center + Vector2(-HALF.x, 0.0),
			])
			var hovered := hovered_tile == Vector2i(x, y)
			var fill := COLOR_A if (x + y) % 2 == 0 else COLOR_B
			if hovered:
				fill = COLOR_HOVER_FILL
			draw_colored_polygon(points, fill)

			var outline := PackedVector2Array([
				points[0], points[1], points[2], points[3], points[0],
			])
			draw_polyline(
				outline,
				COLOR_HOVER_LINE if hovered else COLOR_LINE,
				2.0 if hovered else 1.0,
				true
			)

	var border := PackedVector2Array([
		Vector2(0.0, extent.y),
		Vector2(-extent.x, 0.0),
		Vector2(0.0, -extent.y),
		Vector2(extent.x, 0.0),
		Vector2(0.0, extent.y),
	])
	draw_polyline(border, COLOR_BORDER, 2.0, true)
