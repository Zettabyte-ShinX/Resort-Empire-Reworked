extends CanvasLayer

const Atlas = preload("res://scripts/Atlas.gd")

var atlas: Atlas
var _current: Sprite2D = null
var _offset := Vector2(320, 160)

func _ready() -> void:
	layer = 30
	if atlas == null:
		atlas = Atlas.new()

func show_dialog(name: String, pos: Vector2) -> void:
	close_dialog()
	var sprite := Sprite2D.new()
	sprite.centered = false
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	sprite.texture = atlas.texture(name + "::1")
	sprite.position = pos + _offset
	add_child(sprite)
	_current = sprite

func close_dialog() -> void:
	if _current != null and is_instance_valid(_current):
		_current.queue_free()
	_current = null
