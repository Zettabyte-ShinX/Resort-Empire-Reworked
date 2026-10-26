extends Control

signal speed_requested(level: int)
signal pause_requested
signal save_requested

@onready var _label: Label = $Label

var _sim_backdrop: ColorRect
var _sim_label: Label
var _clock_label: Label

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_sim_backdrop = ColorRect.new()
	_sim_backdrop.position = Vector2(8, 86)
	_sim_backdrop.size = Vector2(260, 170)
	_sim_backdrop.color = Color(0.05, 0.05, 0.05, 0.65)
	add_child(_sim_backdrop)
	_clock_label = Label.new()
	_clock_label.position = Vector2(16, 89)
	_clock_label.size = Vector2(244, 16)
	_clock_label.add_theme_color_override("font_color", Color(1, 1, 1, 1))
	_clock_label.add_theme_font_size_override("font_size", 12)
	add_child(_clock_label)
	_sim_label = Label.new()
	_sim_label.position = Vector2(16, 108)
	_sim_label.size = Vector2(244, 120)
	_sim_label.add_theme_color_override("font_color", Color(1, 1, 1, 1))
	_sim_label.add_theme_font_size_override("font_size", 12)
	_sim_label.text = "money  $10000\nvisitors 0"
	add_child(_sim_label)

	var box := HBoxContainer.new()
	box.position = Vector2(16, 232)
	box.size = Vector2(244, 24)
	add_child(box)
	for i in [1, 2, 3]:
		var b := Button.new()
		b.text = "%dx" % i
		b.pressed.connect(func(): speed_requested.emit(i))
		box.add_child(b)
	var pb := Button.new()
	pb.text = "Pause"
	pb.pressed.connect(func(): pause_requested.emit())
	box.add_child(pb)
	var sb := Button.new()
	sb.text = "Save"
	sb.pressed.connect(func(): save_requested.emit())
	box.add_child(sb)

func update_state(
	tile: Vector2i,
	inside: bool,
	zoom_factor: float,
	grid_size: int,
	build_status: String = ""
) -> void:
	var tile_text := ("%d, %d" % [tile.x, tile.y]) if inside else "outside"
	var text := "tile   %s\nmap    %d × %d\nzoom   %.2f×" % [
		tile_text, grid_size, grid_size, zoom_factor
	]
	if build_status != "":
		text += "\nbuild  " + build_status
	if _label.text != text:
		_label.text = text

func update_clock(text: String) -> void:
	if _clock_label.text != text:
		_clock_label.text = text

func update_sim(money_value: float, visitors: Array) -> void:
	var text := "money  $%d\nvisitors %d" % [int(money_value), visitors.size()]
	for v in visitors:
		text += "\n#%d %s" % [v.id, v.state]
	if _sim_label.text != text:
		_sim_label.text = text
