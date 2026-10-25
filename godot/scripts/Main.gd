extends Node2D

const Iso = preload("res://scripts/Iso.gd")

## Entry scene: builds the 37 x 37 isometric map, positions the camera and
## feeds the cursor tile to the debug overlay.

const EXPECTED_DATA := {
	"achievements.json": "achievements",
	"booths.json": "booths",
	"extras.json": "extras",
	"missions.json": "missions",
	"scenery.json": "items",
	"tiles.json": "items",
	"visitors.json": "visitors",
}

@onready var _grid: Node2D = $World/TileGrid
@onready var _highlight: Node2D = $World/TileHighlight
@onready var _camera = $Camera
@onready var _overlay: Control = $Debug/Overlay


func _ready() -> void:
	_check_data_files()

	var grid_size := Iso.GRID_SIZE
	_grid.grid_size = grid_size
	_grid.queue_redraw()
	_camera.configure(Iso.grid_world_bounds(grid_size))
	print("Map ready: %d×%d isometric grid." % [grid_size, grid_size])


func _process(_delta: float) -> void:
	var pointer: Vector2 = _camera.get_pointer_screen_position()
	var tile: Vector2i = Iso.world_to_tile(_camera.screen_to_world(pointer))
	var inside: bool = Iso.is_in_bounds(tile, Iso.GRID_SIZE)
	_highlight.set_tile(tile, inside)
	_overlay.update_state(tile, inside, _camera.zoom.x, Iso.GRID_SIZE)


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
