extends Node2D

const Iso = preload("res://scripts/Iso.gd")

## Debug highlight for the tile under the cursor.

const FILL := Color(1.0, 1.0, 1.0, 0.35)
const OUTLINE := Color(0.05, 0.05, 0.05, 0.85)

var _tile := Vector2i(-1, -1)
var _visible := false


func set_tile(tile: Vector2i, inside: bool) -> void:
	if tile == _tile and inside == _visible:
		return
	_tile = tile
	_visible = inside
	queue_redraw()


func _draw() -> void:
	if not _visible:
		return
	var diamond := Iso.tile_diamond(_tile)
	draw_colored_polygon(diamond, FILL)
	diamond.append(diamond[0])
	draw_polyline(diamond, OUTLINE, 1.5, true)
