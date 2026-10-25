extends Control

## Debug overlay: tile coordinates under the cursor, plus map and zoom state.

@onready var _label: Label = $Label


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func update_state(tile: Vector2i, inside: bool, zoom_factor: float, grid_size: int) -> void:
	var tile_text := ("%d, %d" % [tile.x, tile.y]) if inside else "outside"
	var text := "tile   %s\nmap    %d × %d\nzoom   %.2f×" % [
		tile_text, grid_size, grid_size, zoom_factor
	]
	if _label.text != text:
		_label.text = text
