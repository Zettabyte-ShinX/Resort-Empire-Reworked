extends Node2D

const Iso = preload("res://scripts/Iso.gd")
const Atlas = preload("res://scripts/Atlas.gd")
const BoothPlacement = preload("res://scripts/BoothPlacement.gd")
const BoothLayer = preload("res://scripts/BoothLayer.gd")
const Money = preload("res://scripts/Money.gd")
const Simulation = preload("res://scripts/Simulation.gd")
const VisitorRenderer = preload("res://scripts/VisitorRenderer.gd")
const HUD = preload("res://scripts/HUD.gd")
const BuildDialog = preload("res://scripts/BuildDialog.gd")
const DialogManager = preload("res://scripts/DialogManager.gd")

const SAVE_PATH := "user://save.json"

## Entry scene: builds the isometric ground from the atlas, feeds the cursor
## tile to the debug overlay and drives booth placement.

## Booth placed by this slice. The atlas only packages the Lobby body.
const BOOTH := ""
## Screen distance a press may travel before it counts as a pan, not a tap.
const TAP_SLOP := 8.0

const EXPECTED_DATA := {
	"achievements.json": "achievements",
	"booths.json": "booths",
	"extras.json": "extras",
	"missions.json": "missions",
	"scenery.json": "items",
	"tiles.json": "items",
	"visitors.json": "visitors",
}

@onready var _grid: Sprite2D = $World/TileGrid
@onready var _highlight: Node2D = get_node_or_null("World/TileHighlight")
@onready var _booths: BoothLayer = $World/Booths
@onready var _camera = $Camera
@onready var _overlay: Control = get_node_or_null("Debug/Overlay")

var _atlas: Atlas
var _placement: BoothPlacement
var _tile_frames: Dictionary = {}
var _booth_rows := 1
var _booth_cols := 1
var _booth_frame := ""
var _booth_wall_frame := ""

var _money: Money
var _sim: Simulation
var _renderer: VisitorRenderer
var _hud
var _build_dialog
var _dialog_manager
var _current_build_type := "Jacuzi"

var _pressing := false
var _press_position := Vector2.ZERO
var _dragged := false
var _touches: Dictionary = {}


func _ready() -> void:
	_check_data_files()

	_atlas = Atlas.new()
	if _atlas.error != "":
		push_error(_atlas.error)

	_tile_frames = _load_tile_frames()
	_grid.grid_size = Iso.GRID_SIZE
	_grid.tiles = _load_map_tiles()
	_grid.configure(_atlas, _tile_frames)

	_load_booth(BOOTH)
	_placement = BoothPlacement.new()
	_placement.configure(Iso.GRID_SIZE, _booth_rows, _booth_cols)
	_booths.configure(_atlas, _booth_frame, _booth_wall_frame)

	_money = Money.new()
	_sim = Simulation.new(_money)
	_renderer = VisitorRenderer.new()
	_renderer.simulation = _sim
	_renderer.atlas = _atlas
	$World.add_child(_renderer)
	_renderer.z_index = 150
	_hud = HUD.new()
	_hud.atlas = _atlas
	_hud.speed_requested.connect(_on_speed_requested)
	_hud.pause_requested.connect(_on_pause_requested)
	_hud.save_requested.connect(_save_game)
	_hud.build_requested.connect(_on_build_requested)
	add_child(_hud)

	_build_dialog = BuildDialog.new()
	_build_dialog.item_selected.connect(_on_build_item_selected)
	add_child(_build_dialog)

	_dialog_manager = DialogManager.new()
	_dialog_manager.atlas = _atlas
	add_child(_dialog_manager)
	_sim.save_callback = Callable(self, "_autosave")
	if _overlay != null:
		_overlay.speed_requested.connect(_on_speed_requested)
		_overlay.pause_requested.connect(_on_pause_requested)
		_overlay.save_requested.connect(_save_game)
	_camera.configure(Iso.grid_world_bounds(Iso.GRID_SIZE))
	_camera.zoom = Vector2.ONE
	_camera.position = Iso.tile_to_world(Vector2i(18, 19))
	_camera._clamp_to_map()
	print(
		"Map ready: %d×%d isometric grid, %d atlas frames, %s %d×%d (%s)."
		% [Iso.GRID_SIZE, Iso.GRID_SIZE, _atlas.frames.size(), BOOTH, _booth_rows,
			_booth_cols, _booth_frame if _booth_frame != "" else "no art"]
	)
	_load_game()

func _on_speed_requested(level: int) -> void:
	if _sim != null:
		_sim.speed_level = level

func _on_pause_requested() -> void:
	if _sim != null:
		_sim.paused = not _sim.paused

func _autosave() -> void:
	_save_game()

func _save_game() -> void:
	if _sim == null:
		return
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file == null:
		return
	file.store_string(JSON.stringify(_sim.to_save_dict(), "\t"))
	file.close()

func _load_game() -> bool:
	if not FileAccess.file_exists(SAVE_PATH):
		return false
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH))
	if typeof(parsed) != TYPE_DICTIONARY:
		return false
	if int(parsed.get("version", 0)) != Simulation.SAVE_VERSION:
		return false
	_sim.from_save_dict(parsed)
	for child in _booths.get_children():
		child.queue_free()
	for b in _sim.booths:
		var typed_cells: Array[Vector2i] = []
		for c in b.cells:
			typed_cells.append(Vector2i(c.x, c.y))
		_booths.place_booth(typed_cells, _booth_frame, _booth_wall_frame)
	for b in _sim.booths:
		var anchor := Vector2i(0, 0)
		for c in b.cells:
			if c.x > anchor.x:
				anchor.x = c.x
			if anchor == Vector2i(0, 0) or c.y < anchor.y:
				anchor.y = c.y
		_placement.place(anchor)
	return true


func _process(_delta: float) -> void:
	_update_simulation(_delta)
	var pointer: Vector2 = _camera.get_pointer_screen_position()
	var tile: Vector2i = Iso.world_to_tile(_camera.screen_to_world(pointer))
	var inside: bool = Iso.is_in_bounds(tile, Iso.GRID_SIZE)
	if _highlight != null:
		_highlight.set_tile(tile, inside)

	if not inside:
		_booths.clear_ghost()
		if _overlay != null:
			_overlay.update_state(tile, false, _camera.zoom.x, Iso.GRID_SIZE, "outside")
		return

	_booths.set_ghost(tile, _placement.cells_at(tile), _placement.can_place(tile))
	if _overlay != null:
		_overlay.update_state(
			tile, true, _camera.zoom.x, Iso.GRID_SIZE, _build_status(tile)
		)


func _update_simulation(delta: float) -> void:
	if _sim == null:
		return
	_sim.process(delta)
	if _renderer != null:
		_renderer.update_from_sim()
	if _overlay != null and _money != null:
		_overlay.update_clock("Day %d  %02d:%02d  speed %dx%s" % [
			_sim.day, _sim.hour_day(), _sim.minute_day(), _sim.speed_level,
			" (paused)" if _sim.paused else ""
		])
		_overlay.update_sim(_money.resort, _sim.visitors)
	if _hud != null and _money != null and _sim != null:
		_hud.update(_money.resort, _sim.day, _sim.hour_day(), _sim.minute_day())
	pass

func _load_map_tiles() -> Dictionary:
	var tiles := {}
	var parsed = _read_json("res://data/map_level0.json")
	var data = parsed.get("tiles", {})
	for key in data:
		var parts = str(key).split(",")
		if parts.size() != 2:
			continue
		tiles[Vector2i(int(parts[0]), int(parts[1]))] = str(data[key])
	if tiles.is_empty():
		return _default_tiles(Iso.GRID_SIZE)
	return tiles

func _on_build_requested(category: String) -> void:
	var items: Array = []
	match category:
		"Room":
			items = ["Cottage", "Lodge"]
		"Facility":
			var parsed = _read_json("res://data/booths.json")
			var booths = parsed.get("booths", {})
			for k in booths.keys():
				if str(booths[k].get("mainJenis", "")) == "Facility":
					items.append(k)
		"Janitor":
			items = ["JanitorRoom"]
		"Scenery":
			items = ["PLANT_1", "PLANT_2", "PLANT_3", "PLANT_4", "PLANT_5", "PLANT_6", "PLANT_7", "PLANT_8"]
		"Tile":
			items = ["TILE_1", "TILE_2", "TILE_3", "TILE_4", "TILE_5", "TILE_6", "TILE_7", "TILE_8", "TILE_9", "TILE_10", "TILE_11", "TILE_12", "TILE_13"]
	if _build_dialog != null:
		_build_dialog.show_category(category, items)

func _on_build_item_selected(category: String, item_name: String) -> void:
	if category in ["Room", "Facility", "Janitor"]:
		_load_booth(item_name)
		_placement.configure(Iso.GRID_SIZE, _booth_rows, _booth_cols)
		_booths.configure(_atlas, _booth_frame, _booth_wall_frame)
		_current_build_type = item_name

func _build_status(anchor: Vector2i) -> String:
	if _booth_frame == "":
		return "no art"
	var reason := _placement.why_not(anchor)
	return "%s %d×%d %s" % [BOOTH, _booth_rows, _booth_cols, reason if reason != "" else "ok"]


## Press/release handling for placement. Panning is left to the camera, so a
## press only places when it did not move and did not become a pinch.
func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed:
		match event.keycode:
			KEY_1:
				if _sim != null: _sim.speed_level = 1
			KEY_2:
				if _sim != null: _sim.speed_level = 2
			KEY_3:
				if _sim != null: _sim.speed_level = 3
			KEY_SPACE:
				if _sim != null: _sim.paused = not _sim.paused
			KEY_S:
				_save_game()
			KEY_R:
				_on_build_requested("Room")
			KEY_F:
				_on_build_requested("Facility")
			KEY_J:
				_on_build_requested("Janitor")
			KEY_F:
				_dialog_manager.show_dialog("dialog_facility", Vector2(-141, 90))
			KEY_D:
				_dialog_manager.close_dialog()
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		if touch.pressed:
			_touches[touch.index] = true
		else:
			_touches.erase(touch.index)
		if touch.index > 0:
			_dragged = true
			return
		if touch.pressed:
			_begin_press(touch.position)
		else:
			_end_press(touch.position)
		return

	if event is InputEventScreenDrag:
		var drag := event as InputEventScreenDrag
		if _pressing and drag.position.distance_to(_press_position) > TAP_SLOP:
			_dragged = true
		return

	# Touch also emits emulated mouse events; ignore them while fingers are down.
	if not _touches.is_empty():
		return

	if event is InputEventMouseButton:
		var button := event as InputEventMouseButton
		if button.button_index != MOUSE_BUTTON_LEFT:
			return
		if button.pressed:
			_begin_press(button.position)
		else:
			_end_press(button.position)
	elif event is InputEventMouseMotion and _pressing:
		var motion := event as InputEventMouseMotion
		if motion.position.distance_to(_press_position) > TAP_SLOP:
			_dragged = true


func _begin_press(position: Vector2) -> void:
	_pressing = true
	_press_position = position
	_dragged = false


func _end_press(position: Vector2) -> void:
	var is_tap := _pressing and not _dragged
	_pressing = false
	_dragged = false
	if not is_tap or _booth_frame == "":
		return

	var tile: Vector2i = Iso.world_to_tile(_camera.screen_to_world(position))
	if not Iso.is_in_bounds(tile, Iso.GRID_SIZE):
		return
	if not _placement.place(tile):
		return
	_booths.place_booth(_placement.cells_at(tile), _booth_frame, _booth_wall_frame)
	if _sim != null:
		_sim.register_booth(_placement.cells_at(tile), BOOTH)


## Tile id -> frame id for every tile the atlas actually contains.
func _load_tile_frames() -> Dictionary:
	var frames := {}
	var tiles = _read_json("res://data/tiles.json").get("items", {})
	for tile_id in tiles:
		var record = tiles[tile_id]
		if typeof(record) != TYPE_DICTIONARY or not record.has("fr"):
			continue
		var frame_id := "TileClip::%d" % int(record["fr"])
		if _atlas != null and _atlas.has_frame(frame_id):
			frames[tile_id] = frame_id
	return frames


## Default ground: grass everywhere, plus the starter path seeded by
## pack/zmap.as (12 floor tiles at x 10..15, y 20..21 and two walkable tiles
## at (10,22) and (10,23)).
func _default_tiles(size: int) -> Dictionary:
	var tiles := {}
	for y in size:
		for x in size:
			tiles[Vector2i(x, y)] = "TILE_5"
	for y in range(20, 22):
		for x in range(10, 16):
			tiles[Vector2i(x, y)] = "TILE_1"
	tiles[Vector2i(10, 22)] = "TILE_1"
	tiles[Vector2i(10, 23)] = "TILE_1"
	return tiles


func _load_booth(name: String) -> void:
	if name == "":
		_booth_rows = 1
		_booth_cols = 1
		_booth_frame = ""
		_booth_wall_frame = ""
		return
	var booths = _read_json("res://data/booths.json").get("booths", {})
	if not booths.has(name):
		push_error("Booth not found in booths.json: " + name)
		return
	var booth = booths[name]
	_booth_rows = int(booth.get("ROWS", 1))
	_booth_cols = int(booth.get("COLS", 1))
	var frame_id := "%s.body::%d" % [name, int(booth.get("fr", 1))]
	if _atlas != null and _atlas.has_frame(frame_id):
		_booth_frame = frame_id
	else:
		push_error("Booth art missing from atlas: " + frame_id)

	var wall_id := "%s.wall::%d" % [name, int(booth.get("wall", 0))]
	if _atlas != null and _atlas.has_frame(wall_id):
		_booth_wall_frame = wall_id
	else:
		push_warning("Booth wall art missing from atlas: " + wall_id)


func _read_json(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed if typeof(parsed) == TYPE_DICTIONARY else {}


func _check_data_files() -> void:
	print("Resort Empire skeleton ready.")
	var failures := 0
	for file_name in EXPECTED_DATA:
		var path: String = "res://data/" + str(file_name)
		if not FileAccess.file_exists(path):
			push_error("Missing data file: " + path)
			failures += 1
			continue
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
		if typeof(parsed) != TYPE_DICTIONARY:
			push_error("Invalid or non-object JSON: " + path)
			failures += 1
			continue
		var group: String = EXPECTED_DATA[file_name]
		var records = parsed.get(group)
		var count := 0
		if typeof(records) == TYPE_DICTIONARY or typeof(records) == TYPE_ARRAY:
			count = records.size()
		print("%s: %d %s" % [file_name, count, group])
	if failures == 0:
		print("All data files loaded.")
	else:
		push_warning(
			"%d data file(s) failed to load. Run: python3 tools/generate_data.py"
			% failures
		)

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		_save_game()
