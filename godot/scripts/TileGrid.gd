extends Node2D

const Iso = preload("res://scripts/Iso.gd")

## Pre-renders the 37 x 37 isometric ground grid (no art assets yet).
## Tile centres and corners come from Iso, so the drawn diamonds line up
## exactly with the original 24 x 12 projection.

@export_range(1, 50) var grid_size: int = Iso.GRID_SIZE

const COLOR_TILE_A := Color("9cb879")
const COLOR_TILE_B := Color("93af70")
const COLOR_GRID := Color(0.10, 0.16, 0.08, 0.35)
const COLOR_BORDER := Color(0.10, 0.16, 0.08, 0.7)


func _ready() -> void:
	queue_redraw()


func _draw() -> void:
	if grid_size <= 0:
		return

	for y in grid_size:
		for x in grid_size:
			var tile := Vector2i(x, y)
			var color := COLOR_TILE_A if (x + y) % 2 == 0 else COLOR_TILE_B
			draw_colored_polygon(Iso.tile_diamond(tile), color)

	for y in grid_size:
		for x in grid_size:
			var diamond := Iso.tile_diamond(Vector2i(x, y))
			diamond.append(diamond[0])
			draw_polyline(diamond, COLOR_GRID, 1.0, true)

	var last := grid_size - 1
	var corners := PackedVector2Array([
		Iso.tile_diamond(Vector2i(0, 0))[0],
		Iso.tile_diamond(Vector2i(last, 0))[1],
		Iso.tile_diamond(Vector2i(last, last))[2],
		Iso.tile_diamond(Vector2i(0, last))[3],
	])
	corners.append(corners[0])
	draw_polyline(corners, COLOR_BORDER, 2.0, true)
