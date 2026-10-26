extends CanvasLayer

signal item_selected(category: String, item_name: String)

var _panel: Panel
var _category: String = ""

func _ready() -> void:
	layer = 20
	_panel = Panel.new()
	_panel.position = Vector2(80, 80)
	_panel.size = Vector2(480, 320)
	_panel.visible = false
	add_child(_panel)

func show_category(category: String, items: Array) -> void:
	_category = category
	_panel.visible = true
	for c in _panel.get_children():
		c.queue_free()
	var title := Label.new()
	title.text = category
	title.position = Vector2(10, 10)
	_panel.add_child(title)
	var y := 40.0
	for item in items:
		var b := Button.new()
		b.text = str(item)
		b.position = Vector2(10, y)
		b.size = Vector2(460, 24)
		b.pressed.connect(func(n=item): _select(n))
		_panel.add_child(b)
		y += 28.0
	var close := Button.new()
	close.text = "Close"
	close.position = Vector2(10, y)
	close.pressed.connect(func(): _panel.visible = false)
	_panel.add_child(close)

func _select(name: String) -> void:
	item_selected.emit(_category, name)
	_panel.visible = false
