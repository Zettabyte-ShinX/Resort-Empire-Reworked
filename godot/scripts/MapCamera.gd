extends Camera2D

## Camera pan and zoom for mouse and touch.
##
## Mouse: wheel zooms toward the cursor, drag pans.
## Touch: one-finger drag pans, two-finger pinch zooms and pans.
##
## The camera centre is clamped to the map rectangle, and the view is centred
## on an axis when the whole map is smaller than the viewport.

const MIN_ZOOM := 0.5
const MAX_ZOOM := 3.0
const ZOOM_STEP := 1.15

var map_bounds := Rect2()

var _mouse_panning := false
var _touches: Dictionary = {}


func _ready() -> void:
	make_current()
	get_viewport().size_changed.connect(_clamp_to_map)


func configure(bounds: Rect2) -> void:
	map_bounds = bounds
	zoom = Vector2.ONE
	position = bounds.get_center()
	_clamp_to_map()


## Screen position the debug overlay should inspect: the last touch centroid
## while fingers are down, otherwise the mouse cursor.
func get_pointer_screen_position() -> Vector2:
	if not _touches.is_empty():
		return _touches_centroid()
	return get_viewport().get_mouse_position()


func screen_to_world(screen_position: Vector2) -> Vector2:
	var viewport_centre := get_viewport_rect().size * 0.5
	return position + (screen_position - viewport_centre) / zoom.x


## Pan the map content by a screen-space delta.
func pan_by(delta: Vector2) -> void:
	position -= delta / zoom.x
	_clamp_to_map()


## Zoom about a screen position, keeping the world point under it fixed.
func zoom_at(screen_position: Vector2, factor: float) -> void:
	var target_zoom := clampf(zoom.x * factor, MIN_ZOOM, MAX_ZOOM)
	if is_equal_approx(target_zoom, zoom.x):
		return
	var viewport_centre := get_viewport_rect().size * 0.5
	var anchor_offset := (screen_position - viewport_centre) / zoom.x
	var anchor_world := position + anchor_offset
	zoom = Vector2(target_zoom, target_zoom)
	position = anchor_world - (screen_position - viewport_centre) / zoom.x
	_clamp_to_map()


func _unhandled_input(event: InputEvent) -> void:
	# Touch also emits emulated mouse events; ignore those while fingers are down.
	if event is InputEventMouse:
		if not _touches.is_empty():
			return
		_handle_mouse(event)
	elif event is InputEventScreenTouch:
		_handle_touch(event)
	elif event is InputEventScreenDrag:
		_handle_drag(event)


func _handle_mouse(event: InputEventMouse) -> void:
	if event is InputEventMouseButton:
		var button := event as InputEventMouseButton
		if button.pressed and button.button_index == MOUSE_BUTTON_WHEEL_UP:
			zoom_at(button.position, ZOOM_STEP)
			get_viewport().set_input_as_handled()
		elif button.pressed and button.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			zoom_at(button.position, 1.0 / ZOOM_STEP)
			get_viewport().set_input_as_handled()
		elif button.button_index in [
			MOUSE_BUTTON_LEFT, MOUSE_BUTTON_MIDDLE, MOUSE_BUTTON_RIGHT
		]:
			_mouse_panning = button.pressed
	elif event is InputEventMouseMotion and _mouse_panning:
		var motion := event as InputEventMouseMotion
		if motion.button_mask == 0:
			_mouse_panning = false
			return
		pan_by(motion.relative)
		get_viewport().set_input_as_handled()


func _handle_touch(event: InputEventScreenTouch) -> void:
	if event.pressed:
		_touches[event.index] = event.position
	else:
		_touches.erase(event.index)
	_mouse_panning = false
	get_viewport().set_input_as_handled()


func _handle_drag(event: InputEventScreenDrag) -> void:
	if not _touches.has(event.index):
		_touches[event.index] = event.position - event.relative

	var previous_centre := _touches_centroid()
	var previous_distance := _touches_distance()
	_touches[event.index] = event.position

	if _touches.size() == 1:
		pan_by(event.relative)
	else:
		var centre := _touches_centroid()
		var distance := _touches_distance()
		pan_by(centre - previous_centre)
		if previous_distance > 0.0 and distance > 0.0:
			zoom_at(centre, distance / previous_distance)
	get_viewport().set_input_as_handled()


func _touches_centroid() -> Vector2:
	if _touches.is_empty():
		return get_viewport().get_mouse_position()
	var sum := Vector2.ZERO
	for point in _touches.values():
		sum += point
	return sum / float(_touches.size())


func _touches_distance() -> float:
	if _touches.size() < 2:
		return 0.0
	var points := _touches.values()
	return (points[0] as Vector2).distance_to(points[1] as Vector2)


func _clamp_to_map() -> void:
	if map_bounds.size == Vector2.ZERO:
		return
	var view_size := get_viewport_rect().size / zoom.x
	var half_view := view_size * 0.5
	var centre := map_bounds.get_center()
	var clamped := position
	if map_bounds.size.x <= view_size.x:
		clamped.x = centre.x
	else:
		clamped.x = clampf(
			clamped.x, map_bounds.position.x + half_view.x, map_bounds.end.x - half_view.x
		)
	if map_bounds.size.y <= view_size.y:
		clamped.y = centre.y
	else:
		clamped.y = clampf(
			clamped.y, map_bounds.position.y + half_view.y, map_bounds.end.y - half_view.y
		)
	position = clamped
