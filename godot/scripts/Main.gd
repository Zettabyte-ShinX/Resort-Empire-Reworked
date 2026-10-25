extends Control

## Placeholder entry scene. This file intentionally contains no gameplay.

const EXPECTED_DATA := {
	"achievements.json": "achievements",
	"booths.json": "booths",
	"extras.json": "extras",
	"missions.json": "missions",
	"scenery.json": "items",
	"tiles.json": "items",
	"visitors.json": "visitors",
}


func _ready() -> void:
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
