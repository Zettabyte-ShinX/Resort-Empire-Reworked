extends CanvasLayer

signal speed_requested(level: int)
signal pause_requested
signal save_requested
signal build_requested(category: String)

const Atlas = preload("res://scripts/Atlas.gd")

var atlas: Atlas
var _money_label: Label
var _day_label: Label
var _clock_label: Label

func _ready() -> void:
	layer = 10
	if atlas == null:
		atlas = Atlas.new()

	var n1 := Sprite2D.new()
	n1.centered = false
	n1.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	n1.texture = atlas.texture("HUD.navigator1::1")
	n1.position = Vector2(320, 0)
	add_child(n1)

	var n2 := Sprite2D.new()
	n2.centered = false
	n2.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	n2.texture = atlas.texture("HUD.navigator2::1")
	n2.position = Vector2(320, 78)
	add_child(n2)

	var n3 := Sprite2D.new()
	n3.centered = false
	n3.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	n3.texture = atlas.texture("HUD.navigator3::1")
	n3.position = Vector2(302, 646)
	add_child(n3)

	_money_label = _make_label(Vector2(332, 658), 12)
	_day_label = _make_label(Vector2(452, 658), 12)
	_clock_label = _make_label(Vector2(532, 658), 12)
	add_child(_money_label)
	add_child(_day_label)
	add_child(_clock_label)

func _make_label(pos: Vector2, size: int) -> Label:
	var l := Label.new()
	l.position = pos
	l.add_theme_color_override("font_color", Color(1, 1, 1, 1))
	l.add_theme_font_size_override("font_size", size)
	return l

func update(money: float, day: int, hour: int, minute: int) -> void:
	_money_label.text = "$%d" % int(money)
	_day_label.text = "DAY %d" % day
	_clock_label.text = "%02d:%02d" % [hour, minute]
